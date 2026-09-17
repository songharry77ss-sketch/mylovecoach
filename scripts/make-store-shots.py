"""스토어용 홍보 스크린샷 생성: 파스텔 배경 + 한 줄 카피 + 앱 화면(둥근 모서리, 그림자).

  python scripts/make-store-shots.py

입력:  docs/store-assets/android/*.png (1082x2402), docs/store-assets/ios-6.7/*.png (1290x2796)
출력:  docs/store-assets/play-framed/*.png   1242x2208 (9:16 — Play 는 긴 변이 짧은 변의 2배를 넘으면 거부)
       docs/store-assets/ios-6.7-framed/*.png 1290x2796 (App Store 6.7")
       docs/store-assets/play-icon-512.png
폰트: Windows 의 맑은 고딕 Bold. 다른 OS 에서는 FONT 환경변수로 한글 폰트 경로를 지정.
"""
import os
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "docs" / "store-assets"
FONT = os.environ.get("FONT", r"C:\Windows\Fonts\malgunbd.ttf")

# (원본 파일, 카피) — 스토어에 보이는 순서
SHOTS = [
    ("5-chat-replies.png", "캡처 한 장이면\n답장 3개가 바로"),
    ("3-chat-top.png", "상대의 호감 온도를\n숫자로 확인해요"),
    ("4-new-crush.png", "MBTI·성향까지\n상대 맞춤 코칭"),
    ("2-home.png", "상대마다 따로,\n나만의 채팅방"),
    ("6-tips.png", "바로 써먹는\n연애 팁 모음"),
    ("1-onboarding.png", "회원가입 없이\n바로 시작해요"),
]

TOP = (234, 245, 255)  # 하늘색
BOTTOM = (255, 236, 242)  # 분홍색
INK = (25, 31, 40)


def gradient(size):
    w, h = size
    col = Image.new("RGB", (1, h))
    for y in range(h):
        t = y / (h - 1)
        col.putpixel((0, y), tuple(round(TOP[i] + (BOTTOM[i] - TOP[i]) * t) for i in range(3)))
    return col.resize((w, h))


def frame(src: Path, caption: str, size, out: Path):
    w, h = size
    canvas = gradient(size)
    draw = ImageDraw.Draw(canvas)

    font = ImageFont.truetype(FONT, round(w * 0.072))
    top = round(h * 0.055)
    spacing = round(w * 0.022)
    box = draw.multiline_textbbox((0, 0), caption, font=font, spacing=spacing, align="center")
    draw.multiline_text(((w - (box[2] - box[0])) / 2 - box[0], top), caption, font=font, fill=INK, spacing=spacing, align="center")
    caption_bottom = top + (box[3] - box[1])

    shot = Image.open(src).convert("RGB")
    margin = round(h * 0.035)
    avail_h = h - caption_bottom - margin * 2
    scale = min(avail_h / shot.height, (w * 0.84) / shot.width)
    sw, sh = round(shot.width * scale), round(shot.height * scale)
    shot = shot.resize((sw, sh), Image.LANCZOS)
    radius = round(sw * 0.07)
    mask = Image.new("L", (sw, sh), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, sw, sh), radius=radius, fill=255)

    x, y = (w - sw) // 2, caption_bottom + margin
    shadow = Image.new("RGBA", size, (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle((x, y + round(sh * 0.012), x + sw, y + sh + round(sh * 0.012)), radius=radius, fill=(27, 42, 58, 70))
    canvas = Image.alpha_composite(canvas.convert("RGBA"), shadow.filter(ImageFilter.GaussianBlur(round(w * 0.025)))).convert("RGB")
    canvas.paste(shot, (x, y), mask)

    out.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(out, optimize=True)
    return canvas.size


def main():
    for i, (name, caption) in enumerate(SHOTS, 1):
        stem = f"{i}-{name.split('-', 1)[1]}"
        print("play", frame(ASSETS / "android" / name, caption, (1242, 2208), ASSETS / "play-framed" / stem), stem)
        print("ios ", frame(ASSETS / "ios-6.7" / name, caption, (1290, 2796), ASSETS / "ios-6.7-framed" / stem), stem)
    icon = Image.open(ROOT / "assets" / "images" / "icon.png").convert("RGBA").resize((512, 512), Image.LANCZOS)
    icon.save(ASSETS / "play-icon-512.png", optimize=True)
    print("icon", icon.size)


if __name__ == "__main__":
    main()
