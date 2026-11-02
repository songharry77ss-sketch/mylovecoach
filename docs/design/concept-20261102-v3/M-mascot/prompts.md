# 콩닥 이미지 생성 프롬프트

## 생성 방식과 원본

- 내장 image_gen 도구 사용. 별도 API/CLI는 사용하지 않았습니다.
- 기준 캐릭터 손 흔들기를 먼저 생성하고, 나머지 3포즈와 아이콘에는 이 이미지를 고정 참조했습니다.
- 캐릭터는 실제 투명 알파 PNG이며 원본 1254×1254, 색·포즈 외 후처리 없이 사용합니다.
- 아이콘은 생성된 납작한 심벌 원본을 HTML에서 1024×1024로 렌더합니다. 원본은 assets/icon-source.png에 보존합니다.
- 글자는 이미지에 넣지 않고 모든 화면에서 Pretendard HTML로 작성합니다.
- 첨부 레퍼런스의 캐릭터·색 조합·배치를 생성 입력으로 사용하지 않았습니다.

## 1. 손 흔들기 — assets/mascot-wave.png

```text
Use case: stylized-concept. Asset type: premium mobile app brand mascot, full-body isolated 3D render with real transparent alpha, square 1024 x 1024.
Create an original charming but confidently cheeky Korean dating-coaching mascot named Kongdaki: one cherry-red #FF4B5C heart-shaped bean body, two subtly asymmetrical rounded heart lobes at top, soft pointed rounded bottom, huge expressive white oval eyes with black pupils, short thick rounded arms and tiny rounded feet. The face is slightly smug, amused and reliable, like a witty adult friend. Compact confident proportions for people in their twenties, not an infant or preschool toy.
Pose: standing facing camera at slight three-quarter angle, one short arm raised in a casual wave and other hand on hip, a small one-sided grin. Both eyes look toward viewer. One single character only, fully inside frame with generous transparent margin.
Material: smooth soft clay/plastic with subtle satin gloss, wide diffuse studio highlights, slightly dimensional but clean silhouette. Vibrant red remains red rather than orange. No clothes or accessories.
Transparent background, no ground plane, no opaque colored rectangle, no lettering, no logo, no watermark, no props, no blush cheeks, no lashes, no pacifier, no hearts floating around, no neon, no chrome, no metal, no famous character resemblance. Keep hands simple sculpted mitt-like hands with correct visible arm anatomy.
```

## 2. 엄지척 — assets/mascot-thumb.png

참조: assets/mascot-wave.png

```text
Use case: identity-preserve. Asset type: premium mobile app mascot reaction, transparent PNG.
The input is the canonical original character Kongdaki. Make exactly the same character in a second pose. Preserve exact cherry-red #FF4B5C heart-bean silhouette with asymmetrical upper lobes, big white oval eyes and dark round pupils, dark thick expressive eyebrows, tiny feet, short arms, one-sided curved smile, soft satin clay/plastic material, camera and lighting. Do not redesign it or change its proportions.
Change only pose/expression: turn one hand into a clear, confident thumbs-up held beside the face, other hand on hip, happy satisfied smile as if saying 'nice reply'. Keep eyes open looking at viewer, subtly raised eyebrow. Fully visible single character centered in square canvas with 8% transparent margin; no text or props.
Genuinely transparent alpha background, no ground plane, no typography, no watermark, no extra floating icons, no clothes, no blush, no baby features, no metal or neon.
```

## 3. 선글라스 직진 — assets/mascot-shades.png

참조: assets/mascot-wave.png

```text
Use case: identity-preserve. Asset type: premium mobile app mascot reaction, transparent PNG.
The input is the canonical original character Kongdaki. Make exactly the same character in a third pose. Preserve exact cherry-red #FF4B5C heart-bean silhouette with asymmetrical upper lobes, big white oval eyes and dark round pupils, dark thick expressive eyebrows, tiny feet, short arms, one-sided curved smile, soft satin clay/plastic material, camera and lighting. Do not redesign it or change its proportions.
Change only pose and accessory: stylish small thick black rounded-rectangular sunglasses worn LOW on the face with eyes partly visible above the sunglasses, one short hand adjusting the sunglasses at the outer corner, other hand on hip, cocky confident grin. Forward-leaning confident 'go for it' energy, still cute and friendly. Fully visible single character centered in square canvas with 8% transparent margin.
Genuinely transparent alpha background, no ground plane, no typography, no watermark, no extra floating icons, no clothes, no blush, no baby features, no metal or neon. Matte black sunglasses, not chrome.
```

## 4. 놀람 — assets/mascot-surprised.png

참조: assets/mascot-wave.png

```text
Use case: identity-preserve. Asset type: premium mobile app mascot reaction, transparent PNG.
The input is the canonical original character Kongdaki. Make exactly the same character in a fourth reaction pose. Preserve exact cherry-red #FF4B5C heart-bean silhouette with asymmetrical upper lobes, big white oval eyes and dark round pupils, dark thick expressive eyebrows, tiny feet, short arms, soft satin clay/plastic material, camera and lighting. Do not redesign it or change its proportions.
Change only expression and pose: surprised and impressed reaction, both eyebrows raised, eyes wide and lively, a small rounded open mouth, both hands held slightly outward, leaning a little backwards. Looks like an adult friend pleasantly surprised by a great romantic reply, not scared and not childish.
Fully visible single character centered in square canvas with 8% transparent margin. Genuinely transparent alpha background, no ground plane, no typography, no watermark, no extra floating icons, no clothes, no blush, no baby features, no metal or neon.
```

## 5. 앱 아이콘 — icon.png

참조: assets/mascot-wave.png

```text
Use case: logo-brand. Asset type: 1024 x 1024 square mobile app icon for Kongdak.
Reference image role: identity reference for the original Kongdaki face and asymmetrical heart silhouette ONLY. Translate it into an exceptionally crisp, minimal, FLAT graphic icon; do NOT use 3D rendering.
Canvas is fully filled edge-to-edge with solid warm cream #FFF8F0, no rounded outer corners (operating system will mask it), no border. Center ONE large cherry-red #FF4B5C rounded heart-bean silhouette, top lobes slightly asymmetric, occupying roughly 76 percent of canvas width. Within this one heart put two bold white oval eyes with dark ink #1B1B1F pupils, one slightly cocky raised eyebrow and small amused curved smile. The heart is face/body together. No arms, no legs, no separate objects.
Use only flat solid fills, generous simple shapes legible at 32px. Subtle asymmetry gives adult-friendly witty confidence. No lettering, no logo text, no gradients, no shadows, no gloss, no outlines, no blush, no extra decorations, no watermark. Background is fully opaque cream.
```

