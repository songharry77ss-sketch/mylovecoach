# 럽코 · 이미지 생성 프롬프트

모든 비트맵은 내장 `image_gen`으로 생성했습니다. CLI/API 대체 경로는 사용하지 않았습니다. 모든 한국어 카피, 숫자, 버튼은 HTML과 Pretendard로 렌더링했습니다.

## 카페 사진 — `assets/cafe-couple.png`

실존하지 않는 26세 한국인 성인 남녀 1명씩. 스토어 화면에만 사용합니다. 아래 프롬프트로 새로 생성했으며 첨부 레퍼런스 인물이나 구도를 복사하지 않았습니다.

```text
Use case: photorealistic-natural. Asset type: portrait lifestyle photograph for a premium Korean relationship-coaching app store cover; this photo will be placed behind HTML UI cards, no lettering is to be generated.
Primary request: Two fictional Korean adults, one woman and one man, both clearly about 26 years old, on a relaxed first cafe date. Natural candid moment as they lean slightly toward one another across a small table and laugh quietly, with warm genuine eye contact, understated chemistry. Woman at left in a clean ivory cardigan with dark natural shoulder-length hair; man at right in a tasteful muted slate overshirt, short black hair. Modern bright Seoul neighborhood cafe, pale neutral walls and large side window, subtle greenery behind them. Unposed, believable editorial lifestyle photo, realistic skin texture, light 35mm film grain, soft daylight. Attractive and stylish but natural; no celebrity resemblance.
Composition: portrait 2:3 image, waist-up medium shot, both faces equally prominent and fully visible in the upper-middle of the picture, generous space above heads; lower quarter contains table and empty breathing room suitable for later overlay. Natural hands only if needed, simplest relaxed hands resting partially outside frame; no visible smartphone or screen. Soft low-contrast background.
Constraints: fully clothed adults, no provocative poses, no text, no logos, no watermarks, no UI, no decorative hearts, no illustrative elements, no fake bokeh halos, no extra people in focus. Anatomically correct hands and eyes. Create only the photograph.
```

## 앱 아이콘 및 작은 3D 말풍선

정확한 생성·수정 프롬프트는 [assets/asset-prompts.md](assets/asset-prompts.md)에 기록했습니다. 아이콘은 생성 원본을 `assets/icon-source.png`에 보관하고 `icon.html`로 1024×1024 렌더링했습니다. 투명 3D 말풍선은 가장자리의 점을 줄이는 이미지 편집을 한 차례 거친 후 화면마다 한 개만 사용했습니다.

## 시각 검수

- 사진의 얼굴·눈·팔 자세와 비율을 직접 확인했습니다. 손과 휴대폰 화면은 노출하지 않습니다.
- 말풍선은 작은 UI 크기에서 투명 가장자리를 확인했습니다.
- 앱 아이콘은 한 가지 흰 상징으로 줄였고 1024×1024 PNG와 보드 속 축소본을 확인했습니다.
