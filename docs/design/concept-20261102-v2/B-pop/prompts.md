# 이미지 생성 프롬프트

모든 이미지 자산은 내장 image_gen 도구로 제작했습니다. 사진과 아이콘 외 텍스트·말풍선·UI는 HTML과 Pretendard로 구성했습니다. 아이콘은 정사각 원본을 Edge로 1024×1024에 리샘플링했습니다.

## 아이콘 최초 생성

최초 원본: `assets/icon-generated.png`

```text
Use case: logo-brand
Asset type: iOS app icon, exactly 1024 by 1024 pixels, full square.
Primary request: create a very crisp minimal flat symbol for a Korean reply-coaching app. One black speech bubble with a confident angular lower-right tail, containing a single small white northeast arrow drawn with broad rounded strokes. This should read as one unified symbol, not a collage. No text or letters.
Composition: centered black speech-bubble silhouette occupying about 58% of the square, generous balanced safe area. Full bleed solid vivid tangerine background #FF5A1F. Black #111111 and white #FFFFFF only.
Style: premium flat graphic, optical balance, simple bold geometry, sharp high-quality edges, tiny-size legibility. Square canvas with no rounded outside corners (iOS applies them).
Constraints: no gradients, no shadows, no 3D, no metallic surfaces, no gloss, no stickers, no outline decorations, no hearts, no logo resemblance to existing brands, no device mockup, no typography.
```

## 아이콘 색 보정

최종 원본: `assets/icon-flat.png` → `icon.html` → `icon.png`

```text
Use case: precise-object-edit
Edit this app icon, preserve exactly the shape, proportions, placement, and single speech-bubble/arrow symbol. Change ONLY flat colors and remove texture: background must be uniform exact sRGB #FF5A1F (red255 green90 blue31), bubble uniform #111111, arrow uniform #FFFFFF. No gradient, shading, vignetting, texture, grain, lighting, embossing, or gloss at all. The supplied image's orange is too reddish and saturated; make it the precise tangerine #FF5A1F. Keep geometry unchanged and output a square exactly 1024 x 1024 pixels. Crisp flat vector-like raster icon. No new elements and no text.
```

## 사진

`assets/couple-bw.png` · 1024×1536 · 실존하지 않는 20대 중반 한국인 성인 남녀 각 1명.

사진 생성 프롬프트 전문과 검수 기록: [assets/photo-prompt.md](assets/photo-prompt.md).

