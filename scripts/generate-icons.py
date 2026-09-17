"""앱 아이콘 / 스플래시 / 안드로이드 adaptive icon 생성 (Pillow).
하늘색→연분홍 그라데이션 배경 위에 하트 + 말풍선 심볼."""
from PIL import Image, ImageDraw
import math, os

OUT = os.path.join(os.path.dirname(__file__), '..', 'assets', 'images')
os.makedirs(OUT, exist_ok=True)

SKY = (143, 203, 255)
SKY_DEEP = (61, 160, 242)
PINK = (255, 166, 189)
PINK_DEEP = (245, 108, 144)
WHITE = (255, 255, 255)


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def gradient(size, c1, c2, angle_deg=45):
    img = Image.new('RGB', (size, size))
    px = img.load()
    a = math.radians(angle_deg)
    cx, cy = math.cos(a), math.sin(a)
    for y in range(size):
        for x in range(size):
            t = ((x / size) * cx + (y / size) * cy) / (cx + cy)
            px[x, y] = lerp(c1, c2, max(0, min(1, t)))
    return img


def rounded_mask(size, radius):
    m = Image.new('L', (size, size), 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=255)
    return m


def heart(draw, cx, cy, w, fill):
    """폭 w 의 하트 (원 2개 + 삼각형)"""
    r = w / 4
    draw.ellipse([cx - w / 2, cy - r, cx, cy + r], fill=fill)
    draw.ellipse([cx, cy - r, cx + w / 2, cy + r], fill=fill)
    draw.polygon([(cx - w / 2 + r * 0.16, cy + r * 0.6), (cx + w / 2 - r * 0.16, cy + r * 0.6), (cx, cy + w * 0.62)], fill=fill)


def bubble(draw, box, tail, fill, radius):
    x0, y0, x1, y1 = box
    draw.rounded_rectangle(box, radius=radius, fill=fill)
    draw.polygon(tail, fill=fill)


def symbol(size, scale=1.0, fg=WHITE, accent=PINK_DEEP, with_shadow=True):
    """투명 배경 위 말풍선+하트 심볼 (4x 슈퍼샘플링)"""
    S = 4
    big = size * S
    img = Image.new('RGBA', (big, big), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    s = big * scale
    cx, cy = big / 2, big / 2
    bw, bh = s * 0.62, s * 0.48
    box = [cx - bw / 2, cy - bh / 2 - s * 0.02, cx + bw / 2, cy + bh / 2 - s * 0.02]
    tail = [(cx - bw * 0.22, box[3] - 2), (cx - bw * 0.05, box[3] - 2), (cx - bw * 0.30, box[3] + s * 0.11)]
    if with_shadow:
        sh = Image.new('RGBA', (big, big), (0, 0, 0, 0))
        sd = ImageDraw.Draw(sh)
        off = s * 0.025
        bubble(sd, [box[0], box[1] + off, box[2], box[3] + off], [(x, y + off) for x, y in tail], (20, 60, 110, 60), radius=int(s * 0.14))
        img = Image.alpha_composite(img, sh)
        d = ImageDraw.Draw(img)
    bubble(d, box, tail, fg, radius=int(s * 0.14))
    heart(d, cx, cy - s * 0.03, s * 0.30, accent)
    return img.resize((size, size), Image.LANCZOS)


def icon(size=1024):
    bg = gradient(size, SKY, PINK, 40)
    sym = symbol(size, 1.0)
    bg = bg.convert('RGBA')
    bg.alpha_composite(sym)
    return bg


def main():
    # iOS/공통 아이콘 (1024, 불투명, 모서리 없음 - OS가 마스킹)
    icon(1024).convert('RGB').save(os.path.join(OUT, 'icon.png'))

    # Android adaptive: foreground (심볼, 안전영역 66%), background (그라데이션), monochrome
    size = 1024
    fg = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    fg.alpha_composite(symbol(size, 0.66))
    fg.save(os.path.join(OUT, 'android-icon-foreground.png'))
    gradient(size, SKY, PINK, 40).save(os.path.join(OUT, 'android-icon-background.png'))
    mono = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    mono.alpha_composite(symbol(size, 0.66, fg=WHITE, accent=WHITE, with_shadow=False))
    mono.save(os.path.join(OUT, 'android-icon-monochrome.png'))

    # 스플래시 아이콘 (투명 배경 위 둥근 사각 아이콘)
    sp = Image.new('RGBA', (512, 512), (0, 0, 0, 0))
    tile = icon(400)
    tile.putalpha(rounded_mask(400, 90))
    sp.alpha_composite(tile, (56, 56))
    sp.save(os.path.join(OUT, 'splash-icon.png'))

    # 파비콘
    fav = icon(256)
    fav.putalpha(rounded_mask(256, 56))
    fav.resize((64, 64), Image.LANCZOS).save(os.path.join(OUT, 'favicon.png'))

    # 스토어용 미리보기 (docs)
    docs = os.path.join(os.path.dirname(__file__), '..', 'docs')
    os.makedirs(docs, exist_ok=True)
    preview = icon(512)
    preview.putalpha(rounded_mask(512, 112))
    preview.save(os.path.join(docs, 'app-icon-preview.png'))
    print('icons written to', os.path.abspath(OUT))


if __name__ == '__main__':
    main()
