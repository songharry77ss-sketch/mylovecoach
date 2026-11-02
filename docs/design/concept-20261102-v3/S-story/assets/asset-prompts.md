# S-story 이미지 생성 기록

- 도구: built-in `image_gen.imagegen` (CLI/API 폴백 사용 안 함)
- 모든 인물은 실존하지 않는 20대 중반 한국인 성인 남녀 1명씩이다.
- 사진에서 손과 휴대폰은 노출하지 않았다.
- 사진의 실제 알파 채널을 확인했다. 배경 대표점 알파 0, 인물 내부 253–255.

## 아이콘

- 선택된 원본: `C:/Users/shsop/.codex/generated_images/01a19c1c-bfc0-76f0-83bf-7b15288247ae/exec-4d316f12-8c96-4465-bc52-a3a6300cad23.png`
- 프로젝트 원본: `assets/icon-source.png` (1254×1254)
- 최종: `icon.png` (1024×1024, HTML 이미지 배치로 규격 내보내기)
- `transparent_background: false`

```text
Use case: logo-brand. Asset type: a finished 1024x1024 square app icon for an original Korean conversation-coaching app. Primary request: one extremely bold flat near-black speech bubble silhouette with a tiny slightly slanted cream exclamation symbol within it. A single instantly legible iconic silhouette with generous margins. Background: full bleed solid hot pink #FF3D8B, no rounded outer corners. Main bubble color #0A0A0A, inner exclamation shape #FFF1DC. Clean flat vector-like raster design, precise hard edges. Bubble is chunky, slightly oblique and lively, short tail at bottom-left. No written text, no logo names, no letters. No gradient, shadows, glow, neon, chrome, bevel, texture, 3D, outlines, extra symbols, watermark or device mockup. Square composition.
```

## 인물 스티커

- 선택된 원본: `C:/Users/shsop/.codex/generated_images/01a19c1c-bfc0-76f0-83bf-7b15288247ae/exec-5dc817ba-60e9-448b-8776-08a347428570.png`
- 프로젝트 원본/최종: `assets/people-sticker.png` (1536×1024, RGBA)
- `transparent_background: true`
- 생성된 이미지에서 두 사람의 눈과 얼굴 형태를 확인. 흰 스티커 외곽선/기울기는 소비하는 HTML에서 처리한다.
- 추가 검증: `people-alpha-qa.html`에서 사진을 #FF3D8B 평면 위에 합성하고 `people-alpha-qa.png` 1536×1024로 렌더해 직접 확인했다. 머리 주변과 두 사람 사이에 회색/갈색 잔존 배경이 없고 핫핑크 평면이 드러난다. 원본 PNG를 일부 이미지 뷰어로 읽을 때 보이는 배경색은 알파 0 RGB 채널이며 합성에 나타나지 않는다. 재생성은 필요하지 않았다.

```text
Use case: photorealistic-natural. Asset type: transparent photographic cutout sticker for an original Korean conversation-coaching app design. Create exactly two entirely fictional Korean adults, one man age 27 and one woman age 26, together side by side in a natural candid moment, lightly turned toward each other and smiling warmly. Attractive and stylish but ordinary people, no celebrity likeness. Man wears a dark charcoal casual jacket over plain off-white tee, woman wears a cream casual collared shirt. Medium upper-body composition, include full heads and outer shoulders with generous clear space on all sides, bottom crop around mid-torso. Hands and fingers entirely outside frame, no phones. Natural soft afternoon daylight, subtly tactile 35mm film photography, believable skin and natural expressions, crisp clean eyes and faces. Fully transparent background around the pair with clean alpha at hair and clothes, no opaque background, no floor, no cast shadow, no sticker border. Camera eye level. No text, typography, logos, watermark, jewelry branding, suggestive pose, exposed skin beyond face and neck, neon or 3D.
```

