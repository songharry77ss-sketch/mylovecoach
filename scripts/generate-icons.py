"""앱 아이콘 / 스플래시 / 안드로이드 적응형 아이콘 / 파비콘 생성 (Pillow 만 사용).

디자인 — 「똑똑한 메시지 도우미」
  · 배경: 하늘색(#2F86EA) → 라벤더(#A594F9) 대각선 그라데이션.
    OKLab 색공간에서 섞어서 중간색이 회색빛으로 탁해지지 않는다.
  · 흰 둥근 말풍선 + 왼쪽 아래 꼬리 (바닥이 평평한 둥근 사각, 모서리는 초타원 곡선).
  · 말풍선 안 「• • ✦」: 입력 중 점 두 개 다음 자리가 반짝임 → 'AI 가 답장을 다듬는 중'.
  · 하트·입술·장미 같은 연애 상징과 분홍색은 일부러 쓰지 않는다
    (홈 화면에 떠 있어도 연애 앱으로 보이지 않게).

실행: python scripts/generate-icons.py
"""
import math
import os
import shutil

from PIL import Image, ImageChops, ImageDraw, ImageFilter

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
OUT = os.path.join(ROOT, 'assets', 'images')
DOCS = os.path.join(ROOT, 'docs')
SITE = os.path.join(ROOT, 'site')

SS = 4  # 슈퍼샘플링 배율: 도형을 4배 크기로 그린 뒤 줄여서 가장자리를 매끄럽게

# ---------------------------------------------------------------- 색
BG_STOPS = [(0.0, '#2F86EA'), (0.5, '#5F8DF2'), (1.0, '#A594F9')]  # 왼쪽 위 하늘색 → 오른쪽 아래 라벤더
BG_GLOW = 0.16                                                     # 왼쪽 위의 은은한 빛 세기
BUBBLE_STOPS = [(0.0, '#FFFFFF'), (1.0, '#EEF1FF')]                # 말풍선: 위 흰색 → 아래 아주 옅은 라벤더
GLYPH_STOPS = [(0.0, '#3A97EE'), (1.0, '#8C7BF5')]                 # 「• • ✦」: 왼쪽 하늘색 → 오른쪽 라벤더
SHADOW_COLOR = (20, 30, 100)                                       # 말풍선 그림자 (푸른 남색)
SHADOW_OPACITY, SHADOW_BLUR, SHADOW_DY = 0.30, 0.03, 0.024         # 불투명도, 흐림 반경·아래 이동(아이콘 크기 비율)
WHITE = (255, 255, 255)

# ---------------------------------------------------------------- 형태 (아이콘 한 변 = 1.0 인 좌표)
# 말풍선 몸통: 중심 (cx, cy), 반폭 a, 반높이 b, 모서리 반지름 r(초타원 지수 corner_n)
# 꼬리: 왼쪽 옆면이 drop 만큼 곧게 더 내려와 꼭짓점이 되고, 폭 tw 의 오목 곡선이 바닥에 이어짐
BUBBLE = dict(cx=0.5, cy=0.465, a=0.31, b=0.245, r=0.20, corner_n=2.6, drop=0.09, tw=0.17)
BUBBLE_SMOOTH = 0.008          # 꼬리 끝을 살짝 무디게 다듬는 정도
DOT_R = 0.044                  # 점 반지름
DOT_X0 = BUBBLE['cx'] - 0.1525 # 첫 점 중심 x (「• • ✦」 묶음이 몸통 가운데 오도록 계산한 값)
DOT_GAP = 0.135                # 점 중심 간격
SPARK_X = DOT_X0 + 0.282       # 반짝임 중심 x (반짝임이 점보다 넓어서 조금 더 띄움)
SPARK_R = 0.079                # 반짝임 세로 반지름
# 적응형 아이콘은 108dp 캔버스 중 가운데 72dp 만 보인다 → 72/108 ≈ 0.66 로 줄이면
# iOS 아이콘과 같은 비율로 보이고, 내용 전체가 안전영역(지름 66dp 원) 안에 들어간다.
ADAPTIVE_SCALE = 0.66
ADAPTIVE_VIEW = 72 / 108


# ================================================================ 색 보간 (OKLab)
def hex_rgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def _to_linear(c):
    c /= 255.0
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def _to_srgb(v):
    v = max(0.0, min(1.0, v))
    v = 12.92 * v if v <= 0.0031308 else 1.055 * v ** (1 / 2.4) - 0.055
    return int(round(v * 255))


def to_oklab(rgb):
    r, g, b = (_to_linear(float(c)) for c in rgb)
    l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b
    m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b
    s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b
    l, m, s = (math.copysign(abs(v) ** (1 / 3), v) for v in (l, m, s))
    return (0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
            1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
            0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s)


def from_oklab(lab):
    L, A, B = lab
    l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3
    m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3
    s = (L - 0.0894841775 * A - 1.2914855480 * B) ** 3
    return (_to_srgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
            _to_srgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
            _to_srgb(-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s))


def color_at(stops, t):
    """stops=[(위치, '#RRGGBB'), ...] 에서 위치 t 의 색 (OKLab 보간)"""
    t = max(0.0, min(1.0, t))
    pts = [(p, to_oklab(hex_rgb(c))) for p, c in stops]
    if t <= pts[0][0]:
        return from_oklab(pts[0][1])
    for (p0, c0), (p1, c1) in zip(pts, pts[1:]):
        if t <= p1:
            u = 0.0 if p1 == p0 else (t - p0) / (p1 - p0)
            return from_oklab(tuple(c0[i] + (c1[i] - c0[i]) * u for i in range(3)))
    return from_oklab(pts[-1][1])


# ================================================================ 그라데이션
def gradient(size, stops, angle_deg, span=(0.0, 1.0)):
    """선형 그라데이션 RGB 이미지. angle_deg: 0=왼→오, 90=위→아래, 45=왼쪽 위→오른쪽 아래.
    span: 색이 0→1 로 변하는 구간 (그 방향으로 투영한 0~1 좌표 기준)"""
    x_ramp = Image.linear_gradient('L').rotate(90)  # 왼쪽 0 → 오른쪽 255
    y_ramp = Image.linear_gradient('L')             # 위 0 → 아래 255
    a = math.radians(angle_deg)
    field = Image.blend(x_ramp, y_ramp, math.sin(a) / (math.sin(a) + math.cos(a)))
    field = field.resize((size, size), Image.BILINEAR)
    lo, hi = span
    lut = [color_at(stops, (v / 255 - lo) / (hi - lo)) for v in range(256)]
    return Image.merge('RGB', [field.point([c[i] for c in lut]) for i in range(3)])


def radial_alpha(size, cx, cy, r, strength):
    """중심 (cx, cy)·반지름 r 의 부드러운 원형 빛 알파 (L, 좌표는 크기 비율)"""
    # radial_gradient 는 반지름 128 지점 값이 181 → 181 을 가장자리(0)로 맞춰야 경계선이 안 생김
    lut = []
    for v in range(256):
        u = max(0.0, 1.0 - v / 181.0)
        lut.append(int(255 * strength * u * u * (3 - 2 * u)))
    d = max(2, int(2 * r * size))
    g = Image.radial_gradient('L').point(lut).resize((d, d), Image.BILINEAR)
    out = Image.new('L', (size, size), 0)
    out.paste(g, (int(cx * size - d / 2), int(cy * size - d / 2)))
    return out


# ================================================================ 도형
def cubic(p0, p1, p2, p3, steps=80):
    """3차 베지어 곡선 위 점들"""
    pts = []
    for i in range(steps + 1):
        t = i / steps
        mt = 1 - t
        pts.append(tuple(mt ** 3 * p0[k] + 3 * mt * mt * t * p1[k] + 3 * mt * t * t * p2[k] + t ** 3 * p3[k]
                         for k in (0, 1)))
    return pts


def speech_bubble(cx, cy, a, b, r, corner_n, drop, tw, steps=160):
    """둥근 사각 말풍선 윤곽 (시계 방향). 꼬리는 왼쪽 옆면이 그대로 내려와 꼭짓점이 되고,
    안쪽 곡선은 바닥선에 수평 접선으로 이어져 이음새에 혹이 생기지 않는다."""
    x0, x1, y0, y1 = cx - a, cx + a, cy - b, cy + b
    e = 2.0 / corner_n

    def corner(ccx, ccy, d0, d1):  # 초타원 모서리 (원보다 곡률이 부드럽게 이어짐)
        out = []
        for i in range(steps + 1):
            t = math.radians(d0 + (d1 - d0) * i / steps)
            c, s = math.cos(t), math.sin(t)
            out.append((ccx + r * math.copysign(abs(c) ** e, c), ccy + r * math.copysign(abs(s) ** e, s)))
        return out

    pts = corner(x0 + r, y0 + r, 180, 270)    # 왼쪽 위
    pts += corner(x1 - r, y0 + r, 270, 360)   # 오른쪽 위
    pts += corner(x1 - r, y1 - r, 0, 90)      # 오른쪽 아래
    join = (x0 + tw, y1)                      # 꼬리 안쪽 곡선이 바닥에 붙는 점
    tip = (x0, y1 + drop)                     # 꼬리 끝
    pts.append(join)
    pts += cubic(join, (x0 + tw * 0.55, y1), (x0 + tw * 0.20, y1 + drop * 0.55), tip)[1:]
    return pts  # 꼬리 끝 → 왼쪽 옆면을 따라 곧게 올라가 처음 점으로 닫힘


def sparkle(cx, cy, r, p=0.6, aspect=0.86, steps=900):
    """네 갈래 반짝임 ✦ : |x/rx|^p + |y/ry|^p = 1 (p<1 이라 변이 오목하게 들어감)"""
    e = 2.0 / p
    rx, ry = r * aspect, r
    pts = []
    for i in range(steps):
        t = 2 * math.pi * i / steps
        c, s = math.cos(t), math.sin(t)
        pts.append((cx + rx * math.copysign(abs(c) ** e, c), cy + ry * math.copysign(abs(s) ** e, s)))
    return pts


def scaled(pts, k):
    """가운데(0.5, 0.5)를 기준으로 k 배 축소/확대"""
    return [(0.5 + (x - 0.5) * k, 0.5 + (y - 0.5) * k) for x, y in pts]


def mask_of(size, polys=(), circles=(), smooth=0.0):
    """크기 비율 좌표의 도형들을 합친 안티앨리어싱 마스크 (L).
    smooth>0 이면 흐림→문턱값으로 뾰족한 끝을 살짝 둥글린다."""
    S = size * SS
    m = Image.new('L', (S, S), 0)
    d = ImageDraw.Draw(m)
    for poly in polys:
        d.polygon([(x * S, y * S) for x, y in poly], fill=255)
    for cx, cy, r in circles:
        d.ellipse([(cx - r) * S, (cy - r) * S, (cx + r) * S, (cy + r) * S], fill=255)
    if smooth:
        m = m.filter(ImageFilter.GaussianBlur(smooth * S)).point(lambda v: 255 if v >= 128 else 0)
    return m.reduce(SS)


def rounded_mask(size, radius_ratio):
    """미리보기·스플래시·파비콘용 둥근 사각 마스크 (슈퍼샘플링)"""
    S = size * SS
    m = Image.new('L', (S, S), 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, S - 1, S - 1], radius=int(S * radius_ratio), fill=255)
    return m.reduce(SS)


def paint(mask, fill):
    """마스크 모양으로 칠한 RGBA 레이어 (fill: 색 튜플 또는 RGB 이미지)"""
    if isinstance(fill, Image.Image):
        layer = fill.convert('RGBA')
    else:
        layer = Image.new('RGBA', mask.size, tuple(fill) + (255,))
    layer.putalpha(mask)
    return layer


# ================================================================ 아이콘 구성 요소
def bubble_mask(size, k=1.0):
    return mask_of(size, polys=[scaled(speech_bubble(**BUBBLE), k)], smooth=BUBBLE_SMOOTH * k)


def glyph_mask(size, k=1.0):
    """「• • ✦」 마스크"""
    cy = BUBBLE['cy']
    dots = [(DOT_X0, cy, DOT_R), (DOT_X0 + DOT_GAP, cy, DOT_R)]
    return mask_of(size,
                   polys=[scaled(sparkle(SPARK_X, cy, SPARK_R), k)],
                   circles=[(0.5 + (x - 0.5) * k, 0.5 + (y - 0.5) * k, r * k) for x, y, r in dots])


def symbol(size, k=1.0):
    """투명 배경 위 그림자 + 흰 말풍선 + 「• • ✦」 (k: 가운데 기준 크기 배율)"""
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    bm = bubble_mask(size, k)

    # 그림자: 말풍선 모양을 흐리게 해서 아래로 살짝 내림
    sh = bm.filter(ImageFilter.GaussianBlur(SHADOW_BLUR * k * size))
    moved = Image.new('L', (size, size), 0)
    moved.paste(sh, (0, int(SHADOW_DY * k * size)))
    img.alpha_composite(paint(moved.point(lambda v: int(v * SHADOW_OPACITY)), SHADOW_COLOR))

    # 말풍선: 위→아래로 아주 옅은 라벤더가 비치는 흰색
    top = 0.5 + (BUBBLE['cy'] - BUBBLE['b'] - 0.5) * k
    bottom = 0.5 + (BUBBLE['cy'] + BUBBLE['b'] + BUBBLE['drop'] - 0.5) * k
    img.alpha_composite(paint(bm, gradient(size, BUBBLE_STOPS, 90, span=(top, bottom))))

    # 「• • ✦」: 왼쪽 하늘색 → 오른쪽 라벤더
    img.alpha_composite(paint(glyph_mask(size, k), gradient(size, GLYPH_STOPS, 0, span=(0.5 - 0.2 * k, 0.5 + 0.2 * k))))
    return img


def background(size, view=1.0):
    """그라데이션 배경 + 왼쪽 위 은은한 빛.
    view<1 이면 가운데 view 비율 영역이 아이콘 배경과 똑같이 보이도록 늘린다 (적응형 아이콘 배경용)."""
    inset = (1 - view) / 2
    bg = gradient(size, BG_STOPS, 45, span=(inset, 1 - inset)).convert('RGBA')
    glow = radial_alpha(size, inset + 0.12 * view, inset + 0.02 * view, 0.85 * view, BG_GLOW)
    bg.alpha_composite(paint(glow, WHITE))
    return bg


def icon(size):
    """완성 아이콘 (불투명, 모서리 없음 — 모서리는 OS 가 잘라 줌)"""
    img = background(size)
    img.alpha_composite(symbol(size))
    return img


def monochrome(size, k):
    """안드로이드 13 테마 아이콘용 흰색 실루엣.
    말풍선에서 「• • ✦」 자리를 뚫어 두어 단색으로 칠해져도 모양이 살아 있다."""
    m = ImageChops.subtract(bubble_mask(size, k), glyph_mask(size, k))
    out = Image.new('RGBA', (size, size), WHITE + (0,))
    out.putalpha(m)
    return out


def tile(size, radius_ratio):
    """둥근 모서리를 씌운 아이콘 (미리보기용)"""
    t = icon(size)
    t.putalpha(rounded_mask(size, radius_ratio))
    return t


# ================================================================ 저장
def main():
    os.makedirs(OUT, exist_ok=True)
    os.makedirs(DOCS, exist_ok=True)

    # iOS/공통 아이콘 (1024, 불투명, 모서리 없음 - OS 가 마스킹)
    icon_path = os.path.join(OUT, 'icon.png')
    icon(1024).convert('RGB').save(icon_path)

    # 안드로이드 적응형 아이콘 (108dp 캔버스 = 1024px)
    size = 1024
    symbol(size, ADAPTIVE_SCALE).save(os.path.join(OUT, 'android-icon-foreground.png'))   # 투명 배경 + 심볼
    background(size, ADAPTIVE_VIEW).convert('RGB').save(os.path.join(OUT, 'android-icon-background.png'))
    monochrome(size, ADAPTIVE_SCALE).save(os.path.join(OUT, 'android-icon-monochrome.png'))

    # 스플래시 아이콘 (투명 배경 위 둥근 사각 아이콘)
    sp = Image.new('RGBA', (512, 512), (0, 0, 0, 0))
    sp.alpha_composite(tile(400, 0.225), (56, 56))
    sp.save(os.path.join(OUT, 'splash-icon.png'))

    # 웹 파비콘
    tile(256, 0.22).resize((64, 64), Image.LANCZOS).save(os.path.join(OUT, 'favicon.png'))

    # README·스토어 문서용 미리보기
    tile(512, 0.22).save(os.path.join(DOCS, 'app-icon-preview.png'))

    # 랜딩 페이지(site/)도 같은 아이콘 사용
    if os.path.isdir(SITE):
        shutil.copyfile(icon_path, os.path.join(SITE, 'icon.png'))

    print('icons written to', OUT)


if __name__ == '__main__':
    main()
