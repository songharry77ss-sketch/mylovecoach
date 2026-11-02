# 애프터 · 이미지 생성 프롬프트 원문

모든 자산은 내장 image_gen으로 생성했습니다. 아래는 각 생성 기록 파일의 원문을 그대로 통합한 것입니다. 사진 속 인물은 실존하지 않는 20대 중반 한국인 성인이고, 커플 여성·남성 각 1명과 단독 여성·남성 각 1명으로 구성됩니다. 화면의 글자와 UI는 사진에 생성하지 않고 HTML로 구현했습니다.

---

원문 파일: `assets/cafe-couple-prompt.md`

# 카페 커플 · 내장 image_gen

Use case: photorealistic-natural.
Asset type: flagship lifestyle photograph for a premium Korean relationship coaching app, no UI or typography.
Create a beautiful, completely realistic candid film photograph of two fictional Korean adults age 25-27, one woman and one man, at a quiet Seoul neighborhood outdoor cafe in early autumn. They have distinct appealing everyday faces, absolutely not celebrity likenesses. The woman has dark shoulder-length softly tousled hair and a washed blue cotton shirt over a modest ivory top; the man has natural textured black hair and a warm charcoal knit polo. They sit close beside each other at a small cafe table, bodies turned a little toward each other, caught in a spontaneous shared laugh after a good conversation, shy chemistry and genuine relaxed connection. Faces in three-quarter angle, eyes open with physically correct pupils, believable asymmetry, visible fine skin texture, a few hair flyaways, no airbrushed beauty filter. Include both heads completely, shoulders and torso. Hands rest out of view below frame; no phones. Composition: vertical 2:3 portrait image, two people fill middle two thirds of frame; woman on left, man on right, equal importance, generous breathing room above heads, faces around upper-middle, lower third simple table/shirt shapes to overlay a UI card later. Camera feels like a stylish friend shot this on 35mm film, slightly off-center and intimate, 50mm lens f/3.2 with both faces in crisp focus. Late-afternoon side daylight, soft neutral shadows, slightly warm highlights, restrained fine film grain, richly natural color with pale stone facade, olive plants and glass softly out of focus. Premium Korean dating app campaign editorial quality. No text, no logo, no watermark, no border, no collage, no accessories blocking eyes, no dramatic cinematic orange grade, no staged stock-photo pose, no exaggerated laughter, no doll-like smooth skin, no fashion studio lighting, no overt romance or sexual pose.

---

원문 파일: `assets/portrait-man-prompt.md`

# 남성 인물 사진 생성 기록

- 내장 `image_gen` 사용. 2026-11-02.
- 결과: `portrait-man.png` · 1024×1536.
- 가상 한국인 성인 남성 26세. 자연광 카페, 흉상, 네이비 가디건.
- 직접 확인: 눈·얼굴 왜곡, 머리 잘림, 손·휴대폰 노출 없음.

```text
Use case: photorealistic-natural.
Asset type: portrait photo for a polished Korean dating conversation coaching app; a genuine everyday candid, not a fashion editorial or stock advertisement.
Photograph of one fictional Korean adult man, age 26, naturally attractive with distinctive but non-celebrity facial features. Dark softly parted hair, small relaxed smile while looking slightly beside the camera. Navy knit cardigan over a plain white T-shirt, sitting casually near a warm cafe window in Seoul. Medium close-up bust portrait, shoulders visible, hands completely outside the frame; no phone.
Composition: vertical 2:3 photograph, eye-level 50mm portrait lens, ample breathing room above hair and on both sides of head, whole head and both eyes clearly visible. Naturally asymmetrical candid pose, focus on face, soft shallow-depth cafe background, no readable signs.
Soft natural window daylight, subtle 35mm film grain, real skin pores and believable skin texture, beautiful restrained color, authentic Korean contemporary dating-app profile photo quality. Expression understated and approachable, no exaggerated smile, no posing like a model.
No celebrity resemblance, no minor, no distorted eyes, no plastic skin, no excessive smoothing, no warped anatomy, no illustration, no text, no graphics, no watermark, no border, no visible hand or phone.
```

---

원문 파일: `assets/portrait-woman-prompt.md`

# 여성 단독 사진 · 내장 image_gen

Use case: photorealistic-natural. Asset type: individual portrait for a premium Korean relationship coaching app. One fictional South Korean woman, clearly adult age 26, distinct non-celebrity face, naturally attractive, shoulder-length black hair tucked on one side with wispy bangs. A candid close medium portrait, waist-up, at a small tasteful Seoul neighborhood cafe window. She wears a classic dark forest-green cotton cardigan over a plain cream tee, fully modest everyday clothing. She is glancing toward her friend just beside the camera with a small spontaneous warm smile, open bright natural dark brown eyes; no big toothy laugh, no fashion pose. Leaning comfortably in her chair. Hands below the frame, no phone. Composition vertical 2:3, head fully in frame with generous room above, subject occupies middle 65% of width, window and muted blue-green foliage in background. Late afternoon natural window light, restrained soft film colors, fine real skin pores and tiny imperfections, physically correct facial features, individual strands of hair, 50mm documentary portrait f/2.8. Extremely convincing real-world snapshot, elegant Korean lifestyle editorial quality, subtle film grain. Not glamorous studio portrait, not plastic skin, not beauty filter, not oversharpened, not celebrity likeness, no text, no logos, no watermark, no UI, no borders, no collage.

---

원문 파일: `icon-prompt.md`

# 애프터 아이콘 생성 기록

- 내장 `image_gen` 사용. 2026-11-02.
- 원본: `assets/icon-generated.png`
- 최종: `icon.png`, 1024×1024. HTML로 크기만 맞춰 렌더링.
- 심벌: 하트와 대화 꼬리가 이어지는 흰색 윤곽. 선셋 배경 외 효과 없음.

```text
Use case: logo-brand.
Create a finished 1024 by 1024 square app icon for a Korean dating conversation coach brand called AFTER. NO text, NO lettering anywhere.
Full-bleed sunset background with a simple very smooth diagonal gradient from hot coral pink #FF3D6E at upper left to warm orange #FF8A3D at lower right.
In the exact center, ONE bold white continuous flat symbol: an open heart-shaped chat bubble, with two rounded upper lobes and a deliberate small outward reply-tail cut at its lower right. The shape should read as a heart and conversation together. Minimal high-end consumer app mark, memorable and legible at 32 pixels. Broad rounded strokes, clean geometric silhouette, ample clear space. Symbol occupies roughly 54 percent of square width. Filled white silhouette with a generous simple heart-shaped negative space.
No outer rounded-square border; the square canvas is fully filled. No separate secondary icon, no plus sign, no arrow badge, no typography, no text, no metallic surface, no bevel, no gloss, no 3D, no shadow, no texture, no sparkles, no mockup. Flat clean vector-like raster output.
```
