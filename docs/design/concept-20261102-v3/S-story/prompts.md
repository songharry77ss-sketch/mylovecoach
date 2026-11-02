# 찐텐 · 이미지 생성 프롬프트

사용 도구는 **내장 `image_gen.imagegen`**입니다. CLI/API 폴백은 사용하지 않았습니다. 아래는 실제 사용한 프롬프트 원문입니다. 생성 자산을 프로젝트 폴더에 복사했으며, 화면의 한국어와 숫자는 HTML로 작성했습니다.

## 1. 앱 아이콘

- 분류: `logo-brand`
- `transparent_background: false`
- 선택된 도구 원본: `C:/Users/shsop/.codex/generated_images/01a19c1c-bfc0-76f0-83bf-7b15288247ae/exec-4d316f12-8c96-4465-bc52-a3a6300cad23.png`
- 보관 원본: `assets/icon-source.png` · 1254×1254
- 최종 파일: `icon.png` · 1024×1024
- 규격 변환: 생성된 이미지를 HTML에 배치해 1024×1024 PNG로 내보냈습니다.

```text
Use case: logo-brand. Asset type: a finished 1024x1024 square app icon for an original Korean conversation-coaching app. Primary request: one extremely bold flat near-black speech bubble silhouette with a tiny slightly slanted cream exclamation symbol within it. A single instantly legible iconic silhouette with generous margins. Background: full bleed solid hot pink #FF3D8B, no rounded outer corners. Main bubble color #0A0A0A, inner exclamation shape #FFF1DC. Clean flat vector-like raster design, precise hard edges. Bubble is chunky, slightly oblique and lively, short tail at bottom-left. No written text, no logo names, no letters. No gradient, shadows, glow, neon, chrome, bevel, texture, 3D, outlines, extra symbols, watermark or device mockup. Square composition.
```

## 2. 인물 스티커

- 분류: `photorealistic-natural`
- `transparent_background: true`
- 선택된 도구 원본: `C:/Users/shsop/.codex/generated_images/01a19c1c-bfc0-76f0-83bf-7b15288247ae/exec-5dc817ba-60e9-448b-8776-08a347428570.png`
- 보관 원본·최종 파일: `assets/people-sticker.png` · 1536×1024 RGBA
- 인물: 실존하지 않는 한국인 성인 남성 27세, 여성 26세 각 1명. 연예인 유사성 없이 자연광·필름 느낌의 일상적인 모습입니다.
- 합성: 실제 알파 채널을 보존하고 HTML에서 회전·크기·크롭을 적용했습니다. 사진에 UI 텍스트를 합성하지 않았습니다.

```text
Use case: photorealistic-natural. Asset type: transparent photographic cutout sticker for an original Korean conversation-coaching app design. Create exactly two entirely fictional Korean adults, one man age 27 and one woman age 26, together side by side in a natural candid moment, lightly turned toward each other and smiling warmly. Attractive and stylish but ordinary people, no celebrity likeness. Man wears a dark charcoal casual jacket over plain off-white tee, woman wears a cream casual collared shirt. Medium upper-body composition, include full heads and outer shoulders with generous clear space on all sides, bottom crop around mid-torso. Hands and fingers entirely outside frame, no phones. Natural soft afternoon daylight, subtly tactile 35mm film photography, believable skin and natural expressions, crisp clean eyes and faces. Fully transparent background around the pair with clean alpha at hair and clothes, no opaque background, no floor, no cast shadow, no sticker border. Camera eye level. No text, typography, logos, watermark, jewelry branding, suggestive pose, exposed skin beyond face and neck, neon or 3D.
```

## 검증 기록

인물의 눈과 얼굴 형태를 직접 확인했습니다. 손과 휴대폰은 화면에 등장하지 않습니다. 배경 대표점의 알파는 0, 인물 내부의 알파는 253–255입니다. `assets/people-alpha-qa.html`과 PNG에서 핫핑크 색면 위에 합성해 머리 주변과 두 사람 사이의 투명 배경도 확인했습니다. 생성 과정의 상세 기록은 `assets/asset-prompts.md`에 보관했습니다.

첨부된 인스타그램·스포티파이 보드는 글자 위계, 장면의 리듬, 평평한 색면과 사람을 사용하는 원칙을 검토하는 참고 자료로만 사용했습니다. 이미지 생성 프롬프트에 해당 앱의 로고나 화면 복제를 요청하지 않았습니다.
