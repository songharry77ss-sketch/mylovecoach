# 3차 S2 — 새 스튜디오 인물 사진 프롬프트

- 생성일: 2026-10-25
- 도구: 내장 `image_gen.imagegen` (CLI/API 사용 없음)
- 모두 가상 한국인 성인 27세로 지정. 실제 인물·연예인 참조 없이 새로 생성.
- 서로 다른 얼굴·헤어·옷 색. 단색 스튜디오 배경. 단정한 옷, 노출·선정성·글자·로고 없음. 휴대폰 화면 없이 뒷면만 노출.
- 생성된 결과를 눈으로 확인: 성인 표현, 손·눈의 형태, 단정한 복장, 화면·로고가 없는 상태 확인.
- 여섯 장 원본은 수정 없이 복사. 01의 별도 투명 컷아웃은 아래 추가 편집 기록 참조.


## 01-point-woman-cutout.png — 추가 투명 컷아웃

- 위 01의 단색 배경 원본을 보존하고, 히어로 겹침 구도를 위해 별도 파일로 배경 제거.
- 도구: 내장 image_gen.imagegen, transparent_background=true.
- 입력: 01-point-woman.png와 동일한 생성 원본.
- 생성 경로: `C:\Users\shsop\.codex\generated_images\01a17128-8e85-7682-812e-e3acba7ab14d\exec-7d50bf9e-d824-42ab-8c9f-24ed5c16cfb9.png`
- 검사: RGBA 1024×1536, 모서리 alpha=0, 인물 내부 alpha=253~254. 손·얼굴·의상·구도 육안 확인.

```text
Use case: background-extraction. Edit target: the provided generated studio photo. Remove ONLY the ivory studio background and return the same woman as a clean photorealistic cutout on genuine transparent alpha background. Preserve her exact fictional adult identity, blue high-neck modest sweater, pointing gesture, other hand, all fingers, eyes, face, hair, waist, light pants, position, portrait aspect and image framing. No new objects, text, logos, border or drop shadow. Preserve every part of the person including fine hair edges, no checkerboard painted into pixels. Output a PNG with actual transparent background.
```

## 01-point-woman.png

원본 생성 경로: `C:\Users\shsop\.codex\generated_images\01a17128-8e85-7682-812e-e3acba7ab14d\exec-6943477d-9a7f-4c51-b71a-31786520219e.png`

```text
Use case: photorealistic-natural. Asset type: Korean dating-coach App Store campaign studio portrait, photo asset only. Subject is completely fictional, unmistakably adult Korean age 27, attractive natural appearance, not resembling any real person or celebrity. Modest fully covering casual clothes, no revealing clothing, no sensuality, no text, no logos, no watermark, no graphics. Professional soft studio illumination, lifelike skin texture, realistic eyes and hands with five fingers. Centered waist-up composition, full head and both hands entirely inside image, breathing room around silhouette. No children or teenage appearance. A Korean woman with a neat dark chin-length bob and cobalt-blue high-neck long-sleeve knit sweater. Cheerful surprised expression, looking slightly upward, her right index finger pointing up; left hand relaxed near waist. Plain single-color warm ivory studio background. Portrait 2:3 composition. Clean image easily cropped into an upper-body sticker.
```

## 02-heart-man.png

원본 생성 경로: `C:\Users\shsop\.codex\generated_images\01a17128-8e85-7682-812e-e3acba7ab14d\exec-6c3e8e46-81a3-44fe-b960-21688fc1557b.png`

```text
Use case: photorealistic-natural. Asset type: Korean dating-coach App Store campaign studio portrait, photo asset only. Subject is completely fictional, unmistakably adult Korean age 27, attractive natural appearance, not resembling any real person or celebrity. Modest fully covering casual clothes, no revealing clothing, no sensuality, no text, no logos, no watermark, no graphics. Professional soft studio illumination, lifelike skin texture, realistic eyes and hands with five fingers. Centered waist-up composition, full head and both hands entirely inside image, breathing room around silhouette. No children or teenage appearance. A Korean man with softly wavy medium dark-brown hair and a lilac long-sleeve collared overshirt, rounder mature face. He gently hugs an unbranded smartphone to his chest with both hands, smiling with excited romantic anticipation. Only the opaque plain back of the phone is visible to camera; screen fully hidden. Plain single-color light peach studio background. Portrait 2:3 composition.
```

## 03-think-woman.png

원본 생성 경로: `C:\Users\shsop\.codex\generated_images\01a17128-8e85-7682-812e-e3acba7ab14d\exec-ee596296-9bb0-4d98-8ee5-9cf3d90e04b3.png`

```text
Use case: photorealistic-natural. Asset type: Korean dating-coach App Store campaign studio portrait, photo asset only. Each subject is completely fictional, unmistakably adult Korean age 27, attractive natural appearance, not resembling any real person or celebrity. Modest fully covering casual clothes, no revealing clothing, no sensuality, no text, no logos, no watermark, no graphics. Professional soft studio illumination, lifelike skin texture, realistic eyes and hands with five fingers. Centered waist-up composition, full head and both hands entirely inside image, breathing room around silhouette. No children or teenage appearance. One Korean woman with sleek dark hair in a high ponytail, mature oval face, wearing a mustard-yellow modest crew-neck long-sleeve sweatshirt. She rests her chin in her right hand with a curious thoughtful expression, looking slightly up and to the side. No phone. Plain single-color pale lavender studio background. Portrait 2:3 composition.
```

## 04-laugh-man.png

원본 생성 경로: `C:\Users\shsop\.codex\generated_images\01a17128-8e85-7682-812e-e3acba7ab14d\exec-55def9b1-0f71-4131-bd4d-adacec46314d.png`

```text
Use case: photorealistic-natural. Asset type: Korean dating-coach App Store campaign studio portrait, photo asset only. Each subject is completely fictional, unmistakably adult Korean age 27, attractive natural appearance, not resembling any real person or celebrity. Modest fully covering casual clothes, no revealing clothing, no sensuality, no text, no logos, no watermark, no graphics. Professional soft studio illumination, lifelike skin texture, realistic eyes and hands with five fingers. Centered waist-up composition, full head and both hands entirely inside image, breathing room around silhouette. No children or teenage appearance. One Korean man with very short cropped black hair, angular mature face, wearing a mint-green buttoned long-sleeve shirt. He laughs warmly, one hand politely covering his mouth, the other relaxed at chest level; eyes smiling and naturally open. No phone. Plain single-color pale butter-yellow studio background. Portrait 2:3 composition.
```

## 05-friends.png

원본 생성 경로: `C:\Users\shsop\.codex\generated_images\01a17128-8e85-7682-812e-e3acba7ab14d\exec-03f95596-1563-4a82-8a9c-5951c583c409.png`

```text
Use case: photorealistic-natural. Asset type: Korean dating-coach App Store campaign studio portrait, photo asset only. Each subject is completely fictional, unmistakably adult Korean age 27, attractive natural appearance, not resembling any real person or celebrity. Modest fully covering casual clothes, no revealing clothing, no sensuality, no text, no logos, no watermark, no graphics. Professional soft studio illumination, lifelike skin texture, realistic eyes and hands with five fingers. Centered waist-up composition, full head and both hands entirely inside image, breathing room around silhouette. No children or teenage appearance. TWO Korean adult friends age 27, one woman with shoulder-length wavy hair in a modest coral-red long-sleeve crew-neck sweater and one man with short side-parted hair in a navy-blue long-sleeve shirt. Both look down toward a single smartphone held between them, natural amused smiles, upper bodies close together. Camera sees ONLY opaque unbranded smartphone BACK, absolutely no screen. Full heads and all hands visible, no overlap that obscures anatomy, two distinct mature faces. Plain single-color pale seafoam-green studio background. Landscape 3:2 composition.
```

## 06-wink-man.png

원본 생성 경로: `C:\Users\shsop\.codex\generated_images\01a17128-8e85-7682-812e-e3acba7ab14d\exec-ae0f3038-7c25-4b51-a1d8-cd74c0479410.png`

```text
Use case: photorealistic-natural. Asset type: Korean dating-coach App Store campaign studio portrait, photo asset only. Each subject is completely fictional, unmistakably adult Korean age 27, attractive natural appearance, not resembling any real person or celebrity. Modest fully covering casual clothes, no revealing clothing, no sensuality, no text, no logos, no watermark, no graphics. Professional soft studio illumination, lifelike skin texture, realistic eyes and hands with five fingers. Centered waist-up composition, full head and both hands entirely inside image, breathing room around silhouette. No children or teenage appearance. One Korean man with neatly swept-back dark hair, distinctive mature slightly square face, wearing a cream-colored crew-neck long-sleeve knit sweater. He gives a friendly right-hand thumbs-up and a playful natural wink, other eye open and looking at camera, slight confident smile. No phone. Plain single-color pale sky-blue studio background. Portrait 2:3 composition.
```
