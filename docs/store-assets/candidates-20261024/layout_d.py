"""D — Sticker/story layouts. All app fragments come from the six local captures.

The decorative ribbon is sampled in a shared six-panel coordinate system.
No UI is recreated, recoloured, or written over. Phone/card outlines are framing.
"""
from functools import lru_cache
from pathlib import Path
import math

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[3]
ASSETS = ROOT / "docs" / "store-assets" / "ios-6.7"
FONTS = ROOT / "api" / "_assets" / "fonts"
WIDTH = 1290

COPY = [
    ("뭐라고 보내지?", "캡처 한 장이면 돼", "호칭도 말투도, 우리 대화 그대로"),
    ("보내기 전에", "한 번 더 연습", "AI 상대와 대화하고 코치 피드백 받기"),
    ("사진 올린 그 사람", "속마음은 몇 %?", "하나의 상황, 여러 가지 마음의 가능성"),
    ("우리 사이 온도", "기록하면 보여요", "호감의 흐름부터 상대 분석 보고서까지"),
    ("답장 습관에", "내 연애가 보여", "KKTI로 찾는 나의 연애 유형과 컬러"),
    ("캡처가 없어도", "상황만 적어봐", "답장 고민부터 연습·속마음·비밀 상담까지"),
]

# (source filename, pixel rectangle in the original 1290 × 2796 capture)
CROPS = {
    "reply": ("1-chat-replies.png", (170, 1220, 1240, 2270)),
    "practice": ("2-practice.png", (48, 900, 1242, 2015)),
    "mind_thought": ("3-mind.png", (45, 635, 1245, 885)),
    "mind_result": ("3-mind.png", (48, 930, 1242, 1890)),
    "report": ("4-report.png", (48, 228, 1242, 1722)),
    "kkti": ("5-kkti.png", (48, 180, 1242, 1455)),
    "home_features": ("6-home.png", (48, 316, 1242, 966)),
    "input": ("1-chat-replies.png", (168, 2565, 1115, 2775)),
}

BACKGROUNDS = ["#751AFF", "#ED228B", "#6816D9", "#D51D96", "#8422EA", "#D21880"]
CREAM = "#FFF3B7"
INK = "#301044"
TEXT_AUDIT = []
CROP_AUDIT = []
_CURRENT = {"style": "D", "page": 1, "height": 2796}


@lru_cache(maxsize=32)
def font(size, bold=True):
    return ImageFont.truetype(str(FONTS / ("Pretendard-Bold.otf" if bold else "Pretendard-Medium.otf")), size)


@lru_cache(maxsize=10)
def fragment(name):
    filename, rect = CROPS[name]
    return Image.open(ASSETS / filename).convert("RGB").crop(rect)


def txt(im, text, x, y, size, fill, bold=True, center=False):
    draw = ImageDraw.Draw(im)
    f = font(size, bold)
    box = draw.textbbox((0, 0), text, font=f)
    if center:
        x -= (box[2] - box[0]) / 2
    bounds = [round(x), round(y), round(x + box[2] - box[0]), round(y + box[3] - box[1])]
    assert bounds[0] >= 30 and bounds[2] <= WIDTH - 30, (text, bounds)
    assert bounds[1] >= 150 and bounds[3] <= im.height - 120, (text, bounds)
    TEXT_AUDIT.append(dict(_CURRENT, text=text, font_px=size, title=size>=110, bounds=bounds))
    draw.text((round(x - box[0]), round(y - box[1])), text, font=f, fill=fill)
    return box[2] - box[0], box[3] - box[1]


def composite(im, tile, center):
    tile = tile.convert("RGBA")
    im.alpha_composite(tile, (round(center[0] - tile.width / 2), round(center[1] - tile.height / 2)))


def card(im, name, x, y, width, angle=0, border=16):
    """Place a uniformly resized original crop within a white paper/phone frame."""
    shot = fragment(name)
    shot = shot.resize((width, round(shot.height * width / shot.width)), Image.Resampling.LANCZOS)
    tw, th = shot.width + border * 2, shot.height + border * 2
    paper = Image.new("RGBA", (tw + 80, th + 90), (0, 0, 0, 0))
    shadow = Image.new("RGBA", paper.size, (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle((40, 46, tw + 40, th + 46), radius=52, fill=(36, 0, 61, 90))
    paper.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(15)))
    ImageDraw.Draw(paper).rounded_rectangle((40, 30, tw + 40, th + 30), radius=48, fill="#FFFFFF")
    mask = Image.new("L", shot.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, shot.width - 1, shot.height - 1), radius=33, fill=255)
    paper.paste(shot, (40 + border, 30 + border), mask)
    if angle:
        paper = paper.rotate(angle, Image.Resampling.BICUBIC, expand=True)
    composite(im, paper, (x + tw / 2, y + th / 2))
    filename, rect = CROPS[name]
    CROP_AUDIT.append(dict(_CURRENT, crop=name, source=filename, source_box=rect,
                           placed_box=[round(x+tw/2-paper.width/2), round(y+th/2-paper.height/2),
                                       round(x+tw/2+paper.width/2), round(y+th/2+paper.height/2)], angle=angle))
    return th


def heart(im, cx, cy, size, color, angle=0):
    """Original sticker graphic, generated parametrically with no external asset."""
    tile = Image.new("RGBA", (size + 40, size + 40))
    pts = []
    for i in range(181):
        t = i * math.tau / 180
        x = 16 * math.sin(t) ** 3
        y = 13 * math.cos(t) - 5 * math.cos(2*t) - 2 * math.cos(3*t) - math.cos(4*t)
        pts.append((20 + size / 2 + x * size / 36, 20 + size / 2 - y * size / 36))
    dr = ImageDraw.Draw(tile)
    dr.polygon(pts, fill=color)
    dr.line(pts + [pts[0]], fill="white", width=12, joint="curve")
    tile = tile.rotate(angle, Image.Resampling.BICUBIC, expand=True)
    composite(im, tile, (cx, cy))


def sparkle(im, cx, cy, size, color=CREAM):
    r, s = size / 2, size / 8
    pts = [(cx, cy-r), (cx+s, cy-s), (cx+r, cy), (cx+s, cy+s),
           (cx, cy+r), (cx-s, cy+s), (cx-r, cy), (cx-s, cy-s)]
    ImageDraw.Draw(im).polygon(pts, fill=color)


def bubble(im, cx, cy, size, color):
    tile = Image.new("RGBA", (size+40, size+50))
    dr = ImageDraw.Draw(tile)
    dr.rounded_rectangle((18, 18, size+12, int(size*.72)), radius=int(size*.24), fill=color, outline="white", width=11)
    dr.polygon([(size*.31, size*.67), (size*.25, size*.94), (size*.58, size*.68)], fill=color)
    dr.line([(size*.31, size*.7), (size*.25, size*.94), (size*.58, size*.7)], fill="white", width=11)
    for dx in (.33,.51,.69):
        x = int(size*dx)
        dr.ellipse((x-8,size*.36-8,x+8,size*.36+8),fill=INK)
    composite(im,tile,(cx,cy))


def flame(im, cx, cy, size):
    tile = Image.new("RGBA",(size+40,size+40))
    dr=ImageDraw.Draw(tile)
    pts=[(size*.54,10),(size*.77,size*.36),(size*.84,size*.2),(size*.98,size*.65),
         (size*.88,size*.92),(size*.56,size*1.02),(size*.25,size*.94),(size*.1,size*.73),
         (size*.18,size*.42),(size*.33,size*.57),(size*.38,size*.23)]
    pts=[(x+20,y+10) for x,y in pts]
    dr.polygon(pts,fill="#FFB52C")
    dr.line(pts+[pts[0]],fill="white",width=12,joint="curve")
    dr.ellipse((size*.43,size*.61,size*.8,size*.98),fill="#FF447F")
    composite(im,tile,(cx,cy))


def ribbon(im, index, height):
    draw=ImageDraw.Draw(im)
    pts=[]
    for x in range(-240,WIDTH+241,4):
        t=(index*WIDTH+x)/WIDTH
        y=height*.66+180*math.sin(math.tau*t/3)+105*math.sin(math.tau*t/6)
        pts.append((x,round(y)))
    draw.line(pts,fill=CREAM,width=274,joint="curve")
    draw.line([(x,y+86) for x,y in pts],fill="#FF84C9",width=18,joint="curve")
    draw.line([(x,y-86) for x,y in pts],fill="#FF84C9",width=18,joint="curve")


def render(index: int, height: int = 2796):
    if not 0 <= index < 6:
        raise ValueError("index must be 0..5")
    if height not in (2796,2293):
        raise ValueError("height must be 2796 or 2293")
    _CURRENT.update(page=index+1, height=height)
    im=Image.new("RGBA",(WIDTH,height),BACKGROUNDS[index])
    ribbon(im,index,height)
    draw=ImageDraw.Draw(im)

    # The page mark is editorial framing, never presented as an app control.
    txt(im,"나만의 연애코치",84,170,41,"#FFFFFF")
    txt(im,f"0{index+1} / 06",1015,176,34,"#FFFFFF",False)
    line1,line2,subtitle=COPY[index]
    size=122
    while max(draw.textlength(t,font=font(size)) for t in (line1,line2)) > 1122:
        size-=1
    assert size>=110, (index,size)
    txt(im,line1,84,310,size,"#FFFFFF")
    txt(im,line2,84,310+size+26,size,CREAM)
    txt(im,subtitle,88,310+size*2+88,43,"#FFFFFF",False)

    compact=height<2500
    top=835 if compact else 1070
    # Large sticker shapes sit behind app cards and cannot obscure UI text.
    heart(im,105,top+45,245,"#FF86CD",-14)
    sparkle(im,1165,top-112,117)
    sparkle(im,1075,top-45,56,"#FF8FCF")
    if index == 0:
        bubble(im,1125,top+945,240,"#C3FF93")
        card(im,"reply",102,top,1050,angle=-3)
        heart(im,1130,height-305,215,"#FFA6DC",17)
    elif index == 1:
        flame(im,1120,top+980,240)
        card(im,"practice",83,top+45,1090,angle=2)
        sparkle(im,150,height-315,116,"#C7FFAE")
    elif index == 2:
        # The original thought and possibilities; branded situation text excluded.
        card(im,"mind_thought",105,top,1050,angle=-2,border=15)
        card(im,"mind_result",89,top+325,1070,angle=2,border=15)
        heart(im,1125,height-250,190,"#B9FC8D",16)
    elif index == 3:
        flame(im,1110,top+1050,260)
        report_width = 970 if compact else 1020
        card(im,"report",(WIDTH-report_width-34)//2,top-30,report_width,angle=-2,border=17)
        sparkle(im,65,height-300,110,"#BBFF8F")
    elif index == 4:
        bubble(im,1125,top+1055,245,"#C7FF98")
        card(im,"kkti",119,top,1020,angle=3,border=17)
        heart(im,200,height-305,190,"#FF91D0",-17)
    else:
        card(im,"home_features",84,top+10,1090,angle=-2,border=17)
        card(im,"input",104,top+780,1045,angle=2,border=17)
        bubble(im,1110,height-280,225,"#BDFF93")

    # Sequence caption stays in the safe bottom zone on both aspect ratios.
    footer=["고민의 시작", "실전의 예행연습", "마음의 힌트", "쌓이는 대화", "발견하는 나", "다시, 너의 이야기"][index]
    txt(im,footer,85,height-186,36,"#FFFFFF",False)
    # Tiny hand-drawn stroke expresses movement without implying an app widget.
    draw=ImageDraw.Draw(im)
    draw.line([(958,height-163),(1180,height-163),(1151,height-190)],fill=CREAM,width=7,joint="curve")
    return im.convert("RGB")
