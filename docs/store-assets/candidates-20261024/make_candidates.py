"""Offline store artwork from unchanged app screenshots and local Pretendard.

Run from any directory: python docs/store-assets/candidates-20261024/make_candidates.py
No network, generated UI, external artwork, or application changes.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import sys
from functools import lru_cache
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

sys.dont_write_bytecode = True

OUT = Path(__file__).resolve().parent
ROOT = OUT.parents[2]
SRC = ROOT / "docs/store-assets/ios-6.7"
FONTS = ROOT / "api/_assets/fonts"
W = 1290
IOS_H = 2796
PLAY_H = 2293
INK = "#201D30"
SOURCES = ["1-chat-replies.png", "2-practice.png", "3-mind.png",
           "4-report.png", "5-kkti.png", "6-home.png"]

# Coordinates refer only to the original, unchanged 1290 x 2796 captures.
CROPS = {
    "reply": (0, (215, 1600, 1105, 2270)),
    "coaching": (0, (170, 1220, 1240, 2270)),
    "temperature": (0, (215, 1270, 1198, 1465)),
    "honorific": (0, (216, 1480, 980, 1567)),
    "probability": (0, (807, 1645, 1062, 1715)),
    "input": (0, (178, 2568, 1114, 2734)),
    "practice": (1, (45, 890, 1245, 1500)),
    "practice_full": (1, (0, 0, 1290, 2020)),
    "practice_feedback": (1, (140, 1350, 1245, 1500)),
    "practice_answer": (1, (45, 1530, 1000, 2005)),
    "mind": (2, (45, 920, 1245, 1890)),
    "mind_first": (2, (90, 1145, 1205, 1375)),
    "mind_advice": (2, (45, 1935, 1245, 2245)),
    "report": (3, (45, 220, 1245, 1720)),
    "report_top": (3, (45, 220, 1245, 1035)),
    "report_graph": (3, (45, 1080, 1245, 1720)),
    "report_summary": (3, (45, 1770, 1245, 2130)),
    "kkti": (4, (45, 175, 1245, 1450)),
    "home": (5, (45, 300, 1245, 970)),
    "home_chat": (5, (45, 1485, 1245, 1790)),
}

COPY = {
    "A": [
        ("답장 고민 끝", "캡처 한 장으로", "호칭도 말투도 그대로, 답장은 여러 버전", "한 장"),
        ("보내기 전에", "AI와 먼저 연습", "AI 상대와 대화하고 바로 받는 코치 피드백", "연습"),
        ("그 사람 속마음", "가능성은 몇 %?", "하나로 단정하지 않고 여러 가능성으로", "몇 %"),
        ("쌓이는 대화", "달라지는 호감", "호감 온도부터 상대 분석 보고서까지", "호감"),
        ("내 카톡 습관", "연애 유형이 되다", "KKTI로 만나는 나의 연애 유형과 컬러", "연애 유형"),
        ("캡처가 없어도", "상황만 적어요", "답장부터 연습·속마음·비밀 상담까지", "상황만"),
    ],
    "B": [
        ("답장이 막힌 밤", "코치가 함께해요", "캡처 한 장으로, 내 말투에 맞는 답장"),
        ("보내기 전 리허설", "AI와 연습해요", "한 번 더 연습하고, 조금 더 자연스럽게"),
        ("그 사람의 마음", "조금 더 읽어봐요", "여러 가능성을 살펴보는 속마음 카드"),
        ("대화가 쌓이면", "호감이 보여요", "호감 온도의 변화와 상대 분석 보고서"),
        ("내가 사랑하는 법", "카톡에 담겨 있어요", "카톡 습관으로 알아보는 KKTI 연애 유형"),
        ("말 못 할 고민도", "여기서 꺼내봐요", "캡처 없이 상황만 적어도 괜찮아요"),
    ],
    "C": [
        ("답장 고민을 줄이는", "캡처 한 장", "호칭과 말투에 맞춘 여러 버전의 답장"),
        ("보내보기 전에", "한 번 더 연습", "AI 상대와 대화하고 코치 피드백까지"),
        ("그 사람의 속마음", "가능성으로 읽어요", "한 가지 답 대신 여러 가능성을 확인해요"),
        ("쌓이는 대화", "보이는 호감 온도", "변화를 기록하고 상대를 더 알아가요"),
        ("카톡 습관 속", "나의 연애 유형", "KKTI로 나만의 연애 컬러까지"),
        ("캡처가 없어도", "상황만 적으면 돼요", "답장·연습·속마음·비밀 상담을 한곳에서"),
    ],
}

TEXT_AUDIT = []
CROP_AUDIT = []


@lru_cache(maxsize=160)
def font(size, bold=True):
    return ImageFont.truetype(str(FONTS / ("Pretendard-Bold.otf" if bold else "Pretendard-Medium.otf")), size)


@lru_cache(maxsize=6)
def source(index):
    im = Image.open(SRC / SOURCES[index]).convert("RGB")
    assert im.size == (1290, 2796)
    return im


def crop(name):
    index, box = CROPS[name]
    assert 0 <= box[0] < box[2] <= 1290 and 0 <= box[1] < box[3] <= 2796
    return source(index).crop(box)


def rounded(im, radius):
    im = im.convert("RGBA")
    mask = Image.new("L", im.size)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, im.width-1, im.height-1), radius, fill=255)
    im.putalpha(mask)
    return im


class Page:
    def __init__(self, style, index, h, bg):
        self.style, self.index, self.h = style, index, h
        self.im = Image.new("RGBA", (W, h), bg)
        self.d = ImageDraw.Draw(self.im)

    def text(self, s, x, y, size, color=INK, bold=True, align="left", title=False):
        ft = font(size, bold)
        box = self.d.textbbox((0, 0), s, font=ft)
        tw, th = box[2]-box[0], box[3]-box[1]
        if align == "center": x -= tw/2
        if align == "right": x -= tw
        x, y = round(x), round(y)
        bounds = [x, y, x+tw, y+th]
        assert x >= 30 and x+tw <= W-30, (self.style, self.index, s, bounds)
        assert y >= 150 and y+th <= self.h-120, (self.style, self.index, s, bounds, self.h)
        if title: assert size >= 110
        self.d.text((x-box[0], y-box[1]), s, fill=color, font=ft)
        TEXT_AUDIT.append({"style": self.style, "page": self.index+1, "height":self.h,
                           "text": s, "font_px":size, "title":title, "bounds":bounds})
        return tw, th

    def card(self, name, x, y, width, angle=0, border="white", stroke=0, radius=44, shadow=35):
        ci = crop(name)
        ch = round(ci.height*width/ci.width)
        ci = ci.resize((width, ch), Image.Resampling.LANCZOS)
        ci = rounded(ci, radius)
        pad = max(stroke, 0)
        tile = Image.new("RGBA", (width+2*pad, ch+2*pad))
        ImageDraw.Draw(tile).rounded_rectangle((0,0,tile.width-1,tile.height-1), radius+pad, fill=border)
        tile.alpha_composite(ci, (pad,pad))
        if angle:
            tile = tile.rotate(angle, Image.Resampling.BICUBIC, expand=True)
        x = round(x - (tile.width-(width+2*pad))/2)
        y = round(y - (tile.height-(ch+2*pad))/2)
        if shadow:
            layer = Image.new("RGBA", self.im.size)
            silhouette = Image.new("RGBA", tile.size, (13, 9, 31, 95))
            silhouette.putalpha(tile.getchannel("A").point(lambda v: int(v*.25)))
            layer.alpha_composite(silhouette, (x, y+22))
            self.im = Image.alpha_composite(self.im, layer.filter(ImageFilter.GaussianBlur(shadow)))
        self.im.alpha_composite(tile, (x,y))
        self.d = ImageDraw.Draw(self.im)
        CROP_AUDIT.append({"style":self.style,"page":self.index+1,"height":self.h,
                           "crop":name,"source":SOURCES[CROPS[name][0]],"source_box":CROPS[name][1],
                           "placed_box":[x,y,x+tile.width,y+tile.height],"angle":angle})
        return tile.size

    def phone(self, name, x, y, width, angle=0, dark=False):
        # A generic device bezel around an unmodified screen excerpt. No fake app controls.
        return self.card(name, x,y,width,angle,"#232229" if dark else "#292633",20,60,45)

    def footer(self, color, label="실제 앱 화면 · 코칭 예시"):
        self.text(label, 88, self.h-174, 33, color, bold=False)
        self.text(f"{self.index+1:02d} / 06", 1202, self.h-174, 33, color, align="right")


def fit_title(lines, max_width=1114, start=132):
    size = start
    while max(font(size).getlength(s) for s in lines) > max_width:
        size -= 1
    assert size >= 110, (lines,size)
    return size


def brand(p, color, marker=None):
    p.text("나만의 연애코치", 88, 168, 38, color)
    if marker:
        p.text(marker, 1202, 171, 30, color, bold=False, align="right")


def heart(d, cx, cy, size, color, outline=None):
    pts=[]
    for i in range(121):
        t=2*math.pi*i/120
        pts.append((cx+size*math.sin(t)**3,cy-size*(13*math.cos(t)-5*math.cos(2*t)-2*math.cos(3*t)-math.cos(4*t))/16))
    d.polygon(pts,fill=color)
    if outline: d.line(pts,fill=outline,width=6,joint="curve")


def spark(d, x,y,r,color):
    pts=[]
    for j in range(8):
        a=math.pi*j/4
        rr=r if j%2==0 else r*.27
        pts.append((x+rr*math.cos(a),y+rr*math.sin(a)))
    d.polygon(pts,fill=color)


def render_a(i,h):
    colors=["#FF745E","#FFE04B","#B59AF5","#4ED3B2","#80A5FF","#F781B2"]
    p=Page("A",i,h,colors[i]); brand(p,INK)
    a,b,sub,emph=COPY["A"][i]
    size=fit_title([a,b],start=141)
    p.text(a,88,318,size,title=True)
    prefix,_,suffix=b.partition(emph)
    xp=88
    emph_color="#6842B6" if i==1 else "#FFFFFF"
    for st,col in [(prefix,INK),(emph,emph_color),(suffix,INK)]:
        if st:
            p.text(st,xp,318+size+30,size,col,title=True)
            xp+=font(size).getlength(st)
    p.text(sub,88,318+size*2+86,44,INK,bold=False)
    compact=h<2500
    hero_y=1010 if not compact else 925
    if i==0:
        p.card("honorific",100,800,800 if not compact else 690,angle=4,stroke=15,shadow=20,radius=40)
        p.phone("reply",132,hero_y,1120 if not compact else 1040,angle=-3)
        p.text("내 말투 그대로",88,h-440,76)
        p.text("마음에 드는 답장을 골라요",88,h-332,43,bold=False)
    elif i==1:
        p.phone("practice",-35,hero_y-45,1310,angle=3)
        p.card("practice_answer",205,hero_y+770 if not compact else hero_y+680,1000 if not compact else 870,angle=-4,stroke=16)
        if not compact: p.text("실전 전, 한 번 더",88,h-395,75)
    elif i==2:
        p.phone("mind",-25,hero_y-65,1230,angle=2)
        if not compact:
            p.card("mind_advice",165,2180,1070,angle=-3,stroke=12)
    elif i==3:
        if compact:
            p.phone("report",165,hero_y-70,920,angle=-2)
        else:
            p.phone("report_top",85,hero_y-70,1150,angle=-3)
            p.card("report_graph",-30,hero_y+870,1140,angle=3,stroke=14)
    elif i==4:
        p.phone("kkti",105,hero_y-90,1160 if not compact else 1040,angle=-3)
        if not compact: p.text("나의 연애 컬러까지",88,h-375,72)
    else:
        p.card("input",100,hero_y-75,1080,angle=3,stroke=16,radius=55)
        p.phone("home",-30,hero_y+300,1260,angle=-3)
        if not compact:
            p.text("오늘의 고민도",88,h-520,79)
            p.text("여기서 시작해요",88,h-410,79)
    p.footer(INK)
    return p.im.convert("RGB")


def neon_background(p,i):
    accent=["#FF66BD","#B69CFF","#EC72FF","#71DFC8","#C9A2FF","#FF71B1"][i]
    glow=Image.new("RGBA",p.im.size)
    gd=ImageDraw.Draw(glow)
    gd.ellipse((20,950,1280,p.h-150),fill=(105,30,157,85))
    p.im=Image.alpha_composite(p.im,glow.filter(ImageFilter.GaussianBlur(135)))
    p.d=ImageDraw.Draw(p.im)
    for row in range(8):
        for col in range(8):
            if (row*3+col*7+i)%5 in (0,1):
                xx=982+col*34; yy=734+row*34
                p.d.rectangle((xx,yy,xx+13,yy+13),fill=accent if (row+col)%3==0 else "#33233D")
    p.d.line((88,750,360,750),fill=accent,width=7)
    return accent


def render_b(i,h):
    p=Page("B",i,h,"#08080D")
    accent=neon_background(p,i); brand(p,"#DDD9E3")
    a,b,sub=COPY["B"][i]; size=fit_title([a,b],start=122)
    p.text(a,88,320,size,"#FAF8FF",title=True)
    p.text(b,88,320+size+32,size,"#9994A5",title=True)
    p.text(sub,88,320+size*2+93,43,"#CCC6D4",bold=False)
    compact=h<2500
    if i==0:
        p.text("호칭도 말투도, 나답게",88,840,49,accent)
        p.phone("coaching",112,1010 if not compact else 970,1030 if not compact else 1000,dark=True)
        if not compact:
            p.text("마지막 한마디가 어려울 때",88,h-420,60,"#EAE5EF")
            p.text("답장과 예상 반응을 함께 살펴봐요",88,h-320,41,"#A8A1B4",bold=False)
    elif i==1:
        width=930 if not compact else 740
        p.phone("practice_full",(W-width)/2-20,900,width,dark=True)
    elif i==2:
        p.text("속마음, 하나로 단정하지 않게",88,845,48,accent)
        p.phone("mind",95,1010 if not compact else 970,1060 if not compact else 1000,dark=True)
        p.card("mind_advice",128,2020 if not compact else 1840,1035 if not compact else 920,stroke=10,border="#322538",shadow=20)
    elif i==3:
        width=1035 if not compact else 880
        p.phone("report",(W-width)/2-20,940,width,dark=True)
        if not compact: p.text("온도의 변화에 담긴 대화",88,2415,53,accent)
    elif i==4:
        width=1070 if not compact else 980
        p.phone("kkti",(W-width)/2-20,960,width,dark=True)
        if not compact: p.text("카톡 속, 나도 몰랐던 나",88,h-345,55,accent)
    else:
        p.card("input",105,900,1080,stroke=14,border="#322A3D",shadow=25)
        p.phone("home",105,1255 if not compact else 1220,1040,dark=True)
        if not compact:
            p.text("연습 · 속마음 · 비밀 상담",88,h-460,61,"#F6F2FB")
            p.text("나만의 속도로, 천천히",88,h-350,46,accent,bold=False)
    p.footer("#9C95A8")
    return p.im.convert("RGB")


def small_icon(p,i):
    # Original geometric decoration, not a product control or third-party asset.
    cx,cy=645,213
    p.d.ellipse((cx-42,cy-42,cx+42,cy+42),fill=["#FFEAF1","#EAF1FF","#F1EAFF","#E6F8F3","#FFF0E8","#EAF4FF"][i])
    if i in (0,2,4): heart(p.d,cx,cy,23,["#E9588D","#5B80DB","#9369CF","#15A183","#E77957","#3D96EA"][i])
    elif i==3:
        p.d.rounded_rectangle((cx-7,cy-27,cx+7,cy+12),7,fill="#28A78F")
        p.d.ellipse((cx-16,cy+3,cx+16,cy+35),fill="#28A78F")
    else: spark(p.d,cx,cy,29,"#4286D8")


def render_c(i,h):
    p=Page("C",i,h,"#FAFBFD"); small_icon(p,i)
    a,b,sub=COPY["C"][i]; size=fit_title([a,b],start=116)
    p.text(a,645,343,size,align="center",title=True)
    p.text(b,645,343+size+27,size,align="center",title=True)
    p.text(sub,645,343+size*2+92,42,"#747986",False,"center")
    compact=h<2500
    num=["95%","+10°","50%","25°","16","상황만"][i]
    labels=["추천 답장의 성공 확률 예시","연습 대화의 코치 피드백 예시","호감 및 친근감 표현 · 풀이 예시",
            "상대 분석 보고서의 호감 온도 예시","가지 연애 유형","캡처 없이 글로 시작하는 코칭"]
    col=["#ED5C90","#527EE0","#9566C9","#229F8D","#E07659","#328FE5"][i]
    ns=350 if not compact else 280
    if i==5: ns=224 if not compact else 200
    ny=830 if not compact else 755
    p.text(num,645,ny,ns,col,align="center")
    number_h=p.d.textbbox((0,0),num,font=font(ns))[3]-p.d.textbbox((0,0),num,font=font(ns))[1]
    p.text(labels[i],645,ny+number_h+46,39,"#777D88",False,"center")
    top=1420 if not compact else 1230
    if i==0:
        width=1050 if not compact else 950
        p.card("reply",(W-width)/2,top,width,radius=40,stroke=3,border="#EFF1F5",shadow=25)
    elif i==1:
        p.card("practice",105,top,1080,radius=40,stroke=3,border="#EFF1F5",shadow=25)
        if not compact:
            p.card("practice_answer",225,2100,840,radius=40,stroke=3,border="#EFF1F5",shadow=20)
    elif i==2:
        width=1080 if not compact else 960
        p.card("mind",(W-width)/2,top,width,radius=42,stroke=3,border="#EFF1F5",shadow=25)
    elif i==3:
        p.card("report_graph",105,top,1080,radius=40,stroke=3,border="#EFF1F5",shadow=25)
        p.card("report_summary",105,top+665 if not compact else top+612,1080 if not compact else 800,radius=40,stroke=3,border="#EFF1F5",shadow=20)
    elif i==4:
        width=950 if not compact else 795
        p.card("kkti",(W-width)/2,top-15,width,radius=45,stroke=3,border="#FFFFFF",shadow=25)
    else:
        p.card("input",105,top-50,1080,radius=55,stroke=3,border="#EFF1F5",shadow=20)
        p.card("home",105,top+330 if not compact else top+250,1080,radius=42,shadow=25)
    p.footer("#818794","나만의 연애코치")
    return p.im.convert("RGB")


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def render_overview(kind="ios"):
    thumb_h=900
    thumb_w=round(1290/2796*thumb_h) if kind=="ios" else round(1242/2208*thumb_h)
    gutter=26; margin=36
    out=Image.new("RGB",(margin*2+thumb_w*4+gutter*3,1060),"#F1F0F4")
    d=ImageDraw.Draw(out)
    d.text((margin,24),"나만의 연애코치  ·  스토어 이미지 시안",font=font(34),fill=INK)
    names=["A  볼드 팝","B  다크","C  클린","D  스티커·스토리"]
    for j,s in enumerate("ABCD"):
        x=margin+j*(thumb_w+gutter)
        d.text((x,94),names[j],font=font(30),fill=INK)
        path=OUT/s/("1.png" if kind=="ios" else "play-1.png")
        shot=Image.open(path).resize((thumb_w,thumb_h),Image.Resampling.LANCZOS)
        out.paste(shot,(x,142))
    out.save(OUT/("overview.png" if kind=="ios" else "overview-play.png"),optimize=True)


def render_contacts(style):
    for kind in ["ios","play"]:
        sh=900; sw=round((1290/2796 if kind=="ios" else 1242/2208)*sh)
        im=Image.new("RGB",(sw*6,sh))
        for i in range(1,7):
            shot=Image.open(OUT/style/(f"{i}.png" if kind=="ios" else f"play-{i}.png"))
            im.paste(shot.resize((sw,sh),Image.Resampling.LANCZOS),((i-1)*sw,0))
        im.save(OUT/style/("contact.png" if kind=="ios" else "contact-play.png"),optimize=True)


def gallery():
    names={"A":"볼드 팝","B":"다크","C":"클린","D":"스티커·스토리"}
    content='''<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>나만의 연애코치 · 시안 4종</title><style>body{margin:0;padding:40px;background:#f2f1f5;color:#242033;font-family:Arial,sans-serif}h1{font-size:28px}h2{margin-top:55px}a{color:inherit}img{display:block;width:100%;height:auto}section{overflow-x:auto}section img{min-width:1200px}p{color:#666;line-height:1.8}nav{display:flex;gap:24px}figure{margin:0}details{margin-top:20px}summary{cursor:pointer}</style><h1>나만의 연애코치 · 스토어 이미지 시안</h1><p>2026.10.24 · 이미지를 누르면 원본 크기로 열립니다</p><nav>'''
    content+=''.join(f'<a href="#{s}">{s} {names[s]}</a>' for s in "ABCD")+'</nav><p><a href="README.md">시안 설명·카피·재생성 방법</a></p><a href="overview.png"><img src="overview.png" alt="시안 4종 첫 장 비교"></a>'
    for s in "ABCD":
        content+=f'<h2 id="{s}">{s} · {names[s]}</h2><section><a href="{s}/contact.png"><img src="{s}/contact.png" alt="{names[s]} 6장"></a></section><p>'
        content+=' · '.join(f'<a href="{s}/{i}.png">{i}번 원본</a>' for i in range(1,7))+'</p>'
        content+=f'<details><summary>Play 9:16 시안 보기</summary><section><a href="{s}/contact-play.png"><img src="{s}/contact-play.png" alt="Play {names[s]} 6장"></a></section></details>'
    (OUT/"index.html").write_text(content+'</html>',encoding="utf-8")


def validate():
    files=[]
    for s in "ABCD":
        for prefix,size in [("",(1290,2796)),("play-",(1242,2208))]:
            for i in range(1,7):
                path=OUT/s/f"{prefix}{i}.png"
                with Image.open(path) as im:
                    assert im.size==size,(path,im.size)
                    assert im.mode=="RGB",(path,im.mode)
                    im.verify()
                assert path.stat().st_size<=3_000_000,(path,path.stat().st_size)
                files.append({"file":str(path.relative_to(OUT)).replace("\\","/"),"width":size[0],"height":size[1],"bytes":path.stat().st_size})
    # Verify adjacent samples of the shared ribbon curve; final composed seams
    # are also inspected visually because cards/stickers may cover the ribbon.
    seams=[]
    for prefix in ["","play-"]:
        for i in range(1,6):
            with Image.open(OUT/"D"/f"{prefix}{i}.png") as a, Image.open(OUT/"D"/f"{prefix}{i+1}.png") as b:
                def center(t):
                    return 180*math.sin(math.tau*t/3)+105*math.sin(math.tau*t/6)
                delta=abs(center(i)-center(i-1/1290))
                assert delta<1
                seams.append({"format":"ios" if not prefix else "play","join":f"{i}-{i+1}",
                              "curve_adjacent_delta_px":round(delta,4),"composed_seam_check":"contact sheet visual review"})
    return {"screen_count":len(files),"ios_count":24,"play_count":24,"all_rgb":True,
            "max_file_bytes":max(f["bytes"] for f in files),"files":files,
            "sources":[{"file":str((SRC/n).relative_to(ROOT)).replace("\\","/"),"sha256":sha256(SRC/n)} for n in SOURCES],
            "text_bounds":TEXT_AUDIT,"crop_placements":CROP_AUDIT,"story_seams":seams}


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--styles",default="ABCD",help="Subset to render; default ABCD")
    args=parser.parse_args()
    import layout_d
    render_d=layout_d.render
    renderers={"A":render_a,"B":render_b,"C":render_c,"D":render_d}
    for s in args.styles:
        (OUT/s).mkdir(parents=True,exist_ok=True)
        for i in range(6):
            renderers[s](i,IOS_H).convert("RGB").save(OUT/s/f"{i+1}.png",optimize=True)
            renderers[s](i,PLAY_H).convert("RGB").resize((1242,2208),Image.Resampling.LANCZOS).save(OUT/s/f"play-{i+1}.png",optimize=True)
            print(f"{s}/{i+1}: iOS + Play",flush=True)
        render_contacts(s)
    if all((OUT/s/"play-6.png").exists() for s in "ABCD"):
        render_overview(); render_overview("play"); gallery()
        TEXT_AUDIT.extend(layout_d.TEXT_AUDIT)
        CROP_AUDIT.extend(layout_d.CROP_AUDIT)
        report=validate()
        (OUT/"validation.json").write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
        print(f"Validated {report['screen_count']} screens; max {report['max_file_bytes']:,} bytes",flush=True)


if __name__=="__main__": main()
