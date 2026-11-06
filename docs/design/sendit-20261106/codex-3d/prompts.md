# Sendit 3D 아이콘 생성 기록

- 작업 기준: `docs/codex/tasks/sendit-assets-20261106.md`
- 생성 도구: 내장 `image_gen` (`transparent_background: true`)
- 참조 이미지: 사용자가 첨부한 `sendit-icon-ref.png`
- 요구 산출물: 1024×1024 RGBA PNG 4개, 실제 투명 배경
- 공통: 하늘색 → 파랑 → 보라 + 흰색, 말랑한 유광 플라스틱/클레이, 왼쪽 위 광원, 약한 정면 기울임

## bubble-send.png — 최초 생성

```text
Use case: stylized-concept.
Asset type: production 3D raster icon for the Korean Sendit mobile app, filename bubble-send.png.
Input image: the attached Sendit app icon is the design and color reference, not a background to keep.
Create one premium soft glossy plastic/clay icon: a plump white oval speech bubble with one softly curved tail at the lower left. A thick rounded upward arrow is slightly embossed on its front, sky blue at its top through vivid blue to blue-violet at its bottom. Preserve the recognizable rounded up-arrow and bubble silhouette from the reference. Remove the rounded square app tile; this asset is just the white bubble and its attached arrow, one unified object.
Camera and light for the entire family: near frontal orthographic view with only about 8 degrees yaw and 5 degrees counterclockwise roll, very little perspective; soft broad studio light from upper left. Thick pillowy rounded edges, smooth refined premium plastic/clay surface, restrained broad gloss, gentle pale-blue shaded thickness along the lower and right white edges so it reads on white and #F2F4F6. No metallic or transparent material.
Palette only: white, sky blue #9EE6FF, blue #3D63F5, violet #7A5CF8. No pink or red.
Composition: exactly 1024x1024 square PNG. Center the whole object, including tail, at canvas center. Its longest dimension should be about 738 pixels (72% of canvas) with about 140 pixels clean padding at the extreme edges. Fully visible.
Background: genuinely transparent alpha; absolutely no opaque backdrop or simulated checkerboard. No external cast shadow, floor, pedestal, floating drop shadow, glow, particles, dust, disconnected specks, sparkles, decoration, letters, digits, text, watermark, grid, border, or mockup. Only self-shading on the object and subtle contact shadow beneath the attached arrow. Clean smooth antialiased alpha edge.
```

## bubble-send.png — 가장자리 수정 1

최초 시안의 외곽에 흰색·청색 잔여 조각이 보여 수정 요청.

```text
Use case: background-extraction / precise-object-edit.
Image 1 is the edit target. Correct ONLY the broken alpha edge and unwanted residual debris around this white speech-bubble icon. Remove ALL detached white, blue, semi-transparent fragments and halo pixels outside the actual smooth bubble silhouette, especially above and around the upper outline. Give the bubble one perfectly continuous smooth antialiased outer edge with absolutely empty transparent alpha beyond it. Keep the icon's white pillowy material, blue-violet up arrow, bottom-left tail, upper-left soft lighting, camera, and overall design unchanged. No shadow or floor outside the object. Preserve genuinely transparent background, not white or checkerboard. Output exactly 1024x1024 PNG and center the bubble at roughly 72% canvas extent including the tail. No new symbols, text, colors or decorations.
```

## 다른 아이콘의 공통 프롬프트

첫 send 시안을 형태·재질·조명 참조로 사용. 외곽 잔여 픽셀은 복제하지 않도록 명시.

```text
Use case: stylized-concept. Asset type: production in-app 3D icon for Sendit.
The input is the shape/material/lighting family reference. Copy its soft premium rounded plastic/clay material and restrained broad gloss, but NOT its damaged transparent edge or white debris.
Output one icon only, exactly 1024x1024 PNG, genuinely transparent alpha, no background. Center the entire object including tail; longest dimension about 72% of the square canvas, approximately 738px at 1024. Leave generous even clean transparent padding. Near-frontal orthographic camera with slight 8 degree yaw and 5 degree counterclockwise roll, upper-left soft broad studio lighting. Pillow-like thickness with softly rounded beveled silhouette. High-end friendly Korean mobile-app aesthetic, clear when small. Not metallic, chrome, glass, watery, neon, or game-like.
Palette exclusively sky blue #9EE6FF flowing from upper left into blue #3D63F5 then violet #7A5CF8 at lower right, plus white attached symbols. No pink, magenta or red.
Absolutely clean object silhouette: smooth antialiased edge; alpha must be zero everywhere outside the object. No flecks, white fragments, alpha haze, dust, disconnected dots, decorative particles, glitter, glow, or halos. No external cast shadow or ground shadow. No floor, stand, backdrop, pedestal, frame, checkerboard, text, numbers, letters, watermark. Self-shading and very subtle contact shading between physically attached parts only.

```

## bubble-heart.png — 개별 프롬프트

아래 내용을 공통 프롬프트에 이어서 전달.

```text
Subject: one plump oval speech bubble, with its softly curved pointed tail at LOWER LEFT, matching the reference silhouette. The bubble body is a smooth sky-blue-to-blue-to-violet gradient. Center one simple thick WHITE HEART slightly embossed on the front. The white heart has clean softly rounded edges and subtle pale-blue self-shading, with a clear readable heart cleft and tip. Only bubble and attached heart. Do not include an arrow or any extra bubble. This is bubble-heart.png.
```

## bubble-memory.png — 개별 프롬프트

아래 내용을 공통 프롬프트에 이어서 전달.

```text
Subject: one compact connected stack of THREE plump oval speech bubbles, each with a softly curved tail at LOWER LEFT. The front bubble is largest, saturated sky-blue-to-blue-to-violet, positioned slightly lower-left. Two rear bubbles overlap and rise diagonally behind it to upper right; each progressively smaller and lighter in pale sky blue, so all three silhouettes are visibly readable. Stack components must overlap, one unified connected cluster. Emboss EXACTLY THREE small white round dots in one evenly spaced horizontal row on the FRONT bubble only. No marks on rear bubbles, no hearts or arrows. Keep the front bubble nearly frontal with minimal perspective. This is bubble-memory.png.
```

## ticket-time.png — 개별 프롬프트

아래 내용을 공통 프롬프트에 이어서 전달.

```text
Subject: one thick pillowy horizontal admission TICKET with four softly rounded corners and one clean deep SEMICIRCULAR NOTCH cut into the middle of EACH vertical side, left and right. Smooth sky-blue at upper left through blue to violet lower right. Center a modest-size white embossed round clock face, about 35% of ticket width, physically attached to the front. On the white clock place exactly TWO simple blue rounded hands joined at their center, one pointing up and one pointing upper-right, distinguishable lengths. No second hand, no ticks, no numerals, no dashed perforations, no additional emblems or marks. Keep the silhouette unmistakably a ticket rather than a speech bubble; no tail. This is ticket-time.png.
```

## 최종 출력 및 정리

- 생성과 send 외곽 수정: 내장 `image_gen`. CLI/API 폴백은 사용하지 않음.
- 생성 원본 1254×1254를 납품용 1024×1024 RGBA PNG로 출력.
- alpha ≥ 128인 물체 바운딩 박스의 최대 치수를 738px(72.07%)로 맞추고 중앙 (512, 512)에 정렬. 비율 유지, 고품질 bicubic 축소.
- 출력 정리: alpha 1–2/255의 미세 잔여 픽셀을 완전 투명으로 만들고, 8방향 연결 기준의 주 물체와 떨어진 조각 제거. 축소 후 동일 검사. 형태·색·조명·기호는 그대로 유지.
- 투명 픽셀의 RGB도 0으로 정리. 물체의 안티앨리어싱과 자체 음영은 유지.
- 최종 PNG 4개를 직접 열고 흰색 및 #F2F4F6 합성본에서 크기·윤곽·색감 검수. 96px 표시 크기 가독성과 어두운 배경의 외곽도 확인.
- 임시 검수 합성본은 최종 폴더에서 제거.

### 선택한 생성 원본

기본 경로: `C:/Users/shsop/.codex/generated_images/01a1b00c-67c6-7331-91fb-3dc638f19583/`

| 최종 파일 | 선택한 원본 |
| --- | --- |
| bubble-send.png | exec-9a341e40-20d6-4f2e-8dac-23d9bb70ab3a.png |
| bubble-heart.png | exec-78373054-267a-44c6-900c-d07b1bb16f60.png |
| bubble-memory.png | exec-6b6bb2ae-f67f-48da-8894-57171f4efe49.png |
| ticket-time.png | exec-395afb4c-d449-44da-a116-709d2ff5cd52.png |

### 최종 수치 검수

모두 1024×1024 RGBA. alpha > 0 연결 요소 1개, 캔버스 테두리 비투명 픽셀 0개, 채도 있는 빨강·분홍 픽셀 0개.

| 파일 | alpha ≥ 128 물체 크기 | 중심 (px) |
| --- | --- | --- |
| bubble-send.png | 738×676 | 512, 512 |
| bubble-heart.png | 738×678 | 513, 512 |
| bubble-memory.png | 698×738 | 511, 512 |
| ticket-time.png | 738×433 | 512, 512.5 |

최대 치수 모두 738px, 중앙 오차 최대 1px. 자체 음영 외 바깥 그림자·바닥·받침·글자 없음.
