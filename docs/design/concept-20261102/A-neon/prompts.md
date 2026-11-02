# A-neon / 윙맨 — 이미지 생성 프롬프트

생성 방식: 내장 `image_gen` 도구, 이미지별 1회 생성. 사용자 첨부 화면은 구조 참고만 하였으며 이미지 생성 입력으로 사용하지 않았다. 외부 API·CLI·기존 브랜드 로고는 사용하지 않았다.

## icon.png

원본 1254×1254 → 납품 1024×1024. System.Drawing HighQualityBicubic으로 규격만 맞춤. 구도·색·내용은 변경하지 않음.

```text
Use case: logo-brand
Asset type: finished app icon, 1024 x 1024 pixels, square, full bleed.
Primary request: create a single original bold angular twin-wing emblem for a premium relationship coaching app named Wingman, but draw no letters or words. The emblem suggests a trusted friend at your side and confident forward motion.
Scene/backdrop: almost-black midnight navy #060B18, uniform full-bleed square with subtle dark studio depth. No outer app tile or frame.
Subject: one large, centered unified emblem made from two simple folded wing blades, elegant and geometric, NOT a bird illustration, NOT a letter W. Strong silhouette recognizable at 48 pixels, taking about 68 percent of width.
Style/medium: exquisitely rendered dimensional icon, translucent electric cyan glass and brushed cool chrome with deep electric blue side faces, premium industrial product rendering.
Lighting/mood: crisp cyan edge illumination, restrained blue bloom, one tiny magenta reflected highlight on a far lower edge. Rich blacks and tactile glass thickness, no messy lens flares.
Composition/framing: symmetrical balanced front three-quarter view, broad clear negative space around emblem.
Constraints: no text, no letters, no logo from any existing company, no hearts, no people, no watermark, no extra objects, no thin fussy lines, no inset rounded-square tile. Exactly square image.
```

## _art/neon-wings.png

원본 1536×1024 그대로 저장. 홈 히어로용, 오른쪽 오브젝트와 왼쪽 여백.

```text
Use case: stylized-concept
Asset type: premium 3D hero artwork for a midnight navy mobile coaching app. Landscape 1536 x 1024 composition.
Primary request: a sculptural pair of folded glass wings suggesting forward motion and a companion at your side, luxurious original industrial object.
Scene/backdrop: seamless almost-black navy #060B18 studio, ultra-dark left half for an HTML headline. Subtle smoky blue falloff at the far right only.
Subject: one angular twin-wing sculpture made from thick optical glass and polished chrome, floating at right center. Two offset tapering blades, dramatic perspective upward/right. Restrained geometric silhouette, no literal airplane body, no bird.
Composition/framing: object occupies the RIGHT 55 percent of the frame, kept fully within frame; LEFT 40 percent remains empty dark navy. Three-quarter close view, plenty of breathing space around tips.
Lighting/mood: electric cyan rim lights, royal blue internal reflections, tiny magenta glint on a single lower bevel. Light glow confined close to the sculpture, deep shadows, premium studio precision.
Materials/textures: transparent glass thickness, brushed metallic inlays, crisp machined bevels, subtle blue reflections.
Constraints: absolutely no text, no letters, no numbers, no icons, no logo, no watermarks, no people, no hearts, no UI, no extra objects, no broad milky fog.
```

## _art/neon-core.png

원본 1254×1254 그대로 저장. KKTI 트레이딩 카드 중심 소재.

```text
Use case: stylized-concept
Asset type: square premium collectible card artwork for a midnight-neon Korean relationship personality result screen, 1024 x 1024 pixels.
Primary request: one sculptural circular turbine halo surrounding a hovering original cyan folded wing shard, a refined high-end game collectible with a warm sense of forward momentum.
Scene/backdrop: seamless nearly-black midnight navy #060B18, subtle blue radial aura concentrated behind object, corners remain black navy.
Subject: a single precisely machined circular open metal ring, cool brushed titanium, two slim illuminated cyan inset channels, with one thick translucent angular double-folded wing shard suspended in its central opening. Not a logo, no recognizable letter. Ring tilted a little in depth but mainly facing viewer, clean balanced circle.
Composition/framing: centered full object, generous border of negative space, object occupies about 72 percent of square, ring and shard fully visible.
Lighting/mood: icy electric blue and cyan precision rim illumination, bright clean bevels, deep rich shadows, only one tiny magenta glint on the lower-right ring edge, dramatic premium studio render. Restrained bloom, clear solid material.
Materials/textures: finely brushed metal, satin titanium, refractive cyan optical glass, subtle machining, exquisite tactile quality.
Constraints: no text, no numbers, no letters, no labels, no HUD tick marks, no typography, no UI, no logos, no watermarks, no people, no hearts, no cartoon, no clutter, no multicolored background, no stars or explosions.
```

## 검수

세 PNG를 직접 열어 형태·재질·빛·문자 부재·완전한 프레임을 확인했다. 아이콘은 굵은 쌍날개 실루엣으로 작은 표시 크기를 고려했다. 각 소재는 거의 검정인 남색 배경, 전기 파랑·시안의 주광, 작은 마젠타 반사광이라는 동일 규칙을 따른다.

