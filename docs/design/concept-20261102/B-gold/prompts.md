# 한 수 — B-gold 이미지 생성 프롬프트

생성 방식: 내장 `image_gen` 도구. 기존 앱 캡처는 구조 파악에만 사용하고 생성 입력에는 포함하지 않았다. 모든 이미지의 문자·로고·워터마크를 금지했으며 한국어와 숫자는 HTML에서 렌더링한다. 다른 브랜드의 심벌을 참조하지 않았다.

## 1. 앱 아이콘

용도: `icon.png` 및 홈의 소형 브랜드 심벌. 생성 원본은 `_art/icon-generated.png`(1254×1254), 최종은 고품질 bicubic 리샘플링한 1024×1024 PNG. 생성물의 형상·색상은 변경하지 않았다.

```text
Use case: logo-brand. Create one finished premium mobile app icon, exactly 1024 x 1024 square, full-bleed opaque image with square outer corners. Brand concept: HANSU, a calm confident relationship conversation coach named '한 수', decisive thoughtful next step. NO letters or words whatsoever. Single centered ORIGINAL symbolic object: a broad champagne-gold metal rounded-square conversation token, solid sculptural body with a small precise conversational notch at bottom-left and one clean diagonal recessed cut through its upper face; not an existing logo, not a heart, not a chess piece. Near-front orthographic view with just a little visible bevel depth, symmetrical balanced large silhouette occupying 62% of image, immediately legible at 48px. Background rich matte obsidian #0B0C0E, subtle charcoal satin vignette. Metal warm pale champagne #D6BC88 with fine directional brushing, polished narrow chamfer edge, realistic tactile light, controlled studio softbox reflection from upper left. Luxury watchmaking level precision, graphic simplicity, strong contrast, extremely refined restrained premium finish. No secondary symbols, no ornamental lines, no frame, no glitter, no sparkles, no watermark, no shadow outside canvas. Only one symbol on dark ground.
```

## 2–3. 홈 히어로와 KKTI 조형물

정확한 입력 프롬프트와 생성 원본 규격은 같은 폴더의 [`_art/asset-prompts.md`](_art/asset-prompts.md)에 보존했다. 홈은 `_art/hero-metal.png`(1536×1024), KKTI는 `_art/kkti-metal.png`(1254×1254)를 사용한다. 두 이미지 모두 내장 `image_gen`으로 각각 생성한 별개의 원본이다.

## 합성 원칙

- 메탈 질감과 사실적인 반사는 생성 이미지에 맡긴다. 글자·수치·진행 막대·카드 테두리·버튼·기기 베젤은 HTML/CSS로 구현한다.
- 홈의 이미지 위에는 왼쪽과 아래쪽에 어두운 그라데이션을 적용해 문구와 CTA 대비를 확보한다.
- KKTI 조형물은 원본 비율을 유지하고 위아래 가장자리를 CSS 마스크로 카드 배경과 연결한다.
- 추가 생성이나 원본의 창작적 편집 없이, 실제 PNG 검수에서 필요한 크롭·배치·줄바꿈은 HTML/CSS에서 조정한다.

## 소재별 정확한 입력 기록

# B-gold generated key visuals

Built-in `image_gen` was used for both images. No API/CLI fallback. No reference images.

## hero-metal.png

Output: 1536×1024 PNG. Generated 2026-11-02.

```text
Use case: stylized-concept. Asset type: premium Korean app hero background, landscape 1536x1024. Primary request: one floating champagne-gold precision-milled rounded square metal tile, thick and substantial like a decisive game token, with only a single narrow engraved diagonal slit across its face. Scene/backdrop: very dark matte black studio with soft charcoal ground. Composition: camera in elegant three-quarter view; object entirely on the right 55 percent of frame, left 45 percent generous near-black negative space for later HTML typography; close product macro composition, broad clean surfaces. Lighting: dramatic warm grazing rim light and a subtle reflection on black, controlled highlights, deep dimensional shadows, quiet luxury watch-campaign mood. Materials: satin champagne gold, finely brushed directional grain, polished thin bevels, understated black titanium sidewalls. Palette: #0B0C0E black, #17191D charcoal, #D6BC88 champagne, #F3EBDD ivory highlights. Constraints: a single original object, no letters, no numbers, no words, no logos, no watermark, no hearts, no credit-card chips, no recognizable branded design. Sophisticated photorealistic studio CGI, beautiful microtexture.
```

## kkti-metal.png

Output: 1254×1254 PNG (tool-selected square size). Generated 2026-11-02.

```text
Use case: stylized-concept. Asset type: collectible identity-card emblem background for a premium Korean app, square 1024x1024. Primary request: a single original abstract architectural forward wedge sculpture, one thick continuous angular chevron or folded arrow-like monolith made of champagne-gold precision-milled metal and dark black titanium. It represents confident forward momentum, not aggression. Scene/backdrop: deep matte black studio, low simple black circular podium, faint warm pool of light. Composition: sculpture centered with full silhouette visible, upright, product hero shot at three-quarter eye level; breathing room around object, black negative space at top and bottom for later HTML overlays. Lighting: cinematic warm edge lights, restrained clear highlights along machined edges, rich quiet shadows; high-end horology material craft. Materials: finely brushed champagne-gold front faces, black titanium recess and sides, polished bevels, believable microtexture. Color palette: #0B0C0E black, #17191D charcoal, #D6BC88 champagne, #F3EBDD highlights. Constraints: premium photorealistic CGI, simple readable silhouette, no text, letters, numbers, logos, watermark, symbols from existing brands, no tractor, cartoon, faces, weapons, hearts, or literal trophy. Sophisticated and sculptural, original object design.
```

## Inspection

Both images were opened directly after copying into the project. Each has an intact silhouette, clean edges, credible satin/brushed grain and restrained highlights. Neither contains generated text or logos. Hero has dark negative space to the left; KKTI sculpture is centered and fully visible. The KKTI generation returned 1254×1254 rather than the requested 1024×1024; this is suitable for the decorative asset and should be scaled by CSS without altering the source.

