# C-sport · 직진 — 이미지 생성 프롬프트

모든 소재는 **built-in `image_gen`**으로 각 1회씩 별도 생성했다. CLI/API 우회, 외부 스톡, 타사 로고는 사용하지 않았다. 기존 앱 캡처는 기능 구조 참고용으로만 사용하고 생성 입력에는 넣지 않았다. 화면의 모든 한국어·영문·수치는 HTML/CSS로 조판했다.

## icon.png

사용처: 앱 아이콘 및 홈·보드의 브랜드 심벌. 생성 원본을 비율 유지 리샘플링하여 요구 규격 **1024×1024 PNG**로 저장했다. 시각 요소 수정 없음.

```text
Use case: logo-brand.
Asset type: premium original app icon, exactly 1024x1024 PNG, full bleed square.
Primary request: a single strong forward motion emblem for a Korean confidence and relationship coaching app with a sport/running art direction. No words or letters.
Subject: one custom broad rightward chevron arrow, crisp angular and very thick, formed from black satin titanium with a restrained polished bevel on the leading edge. The distinctive single piece has a fine recessed central seam, but no second arrow. Highly recognizable silhouette at 48px.
Scene/backdrop: uniform electric volt lime #C5FF32, edge to edge. Center emblem occupies 63 percent of the image; no outer rounded-square frame, no border.
Style: hyper-refined 3D product icon, near front orthographic view with very slight top view. Masculine, athletic, confident, clean.
Lighting: soft overhead studio highlight and subtle precise dark contact shadow, glossy material depth kept restrained. Near-black #101410 object.
Constraints: original generic geometric emblem, no existing sports logo or app logo. No text, numbers, hearts, people, gradients across the background, watermark, extra symbols or fine decorative elements.
```

## 키 비주얼 제작 기록

아래 두 이미지는 각각 별도의 built-in 호출로 생성했다. 원본은 `_art/`에 저장했다. 밝은 바탕과 합성할 때 CSS `mix-blend-mode`와 가장자리 마스크만 적용했으며 이미지 파일은 그대로 유지했다.

# C-sport generated art prompts

Built-in `image_gen` used. Both images generated separately; no source images, no external artwork. Native output 1536×1024. Inspected visually: no text, no logos, full subjects visible, white/light studio backgrounds and lime/black metallic materials.

## velocity-object.png

```text
Use case: stylized-concept. Asset type: premium 3D hero art for a bright white Korean sports-style mobile app. Primary request: one substantial forward-pointing chevron sculptural object, combining volt lime #C5FF32 with polished black chrome, made like precision performance sports equipment. Scene/backdrop: seamless bright white to very pale silver studio. Composition: landscape, object occupies the right two thirds, clean negative space on the left for HTML copy; entire object and its soft grounding shadow visible. Materials: smooth lime ceramic composite face, metallic black bevel and edge with subtle machining microtexture, realistic glossy rim highlights. Form: simple bold arrow/chevron leaning forward, no multiple arrows, no lines of text. Lighting: crisp daylight studio, sophisticated restrained reflections, soft silver shadow. No words, letters, numerals, logos, watermark, heart, people, pink, neon-lit dark background. Highly polished tangible 3D product render. 1536x1024 landscape.
```

## player-emblem.png

```text
Use case: stylized-concept. Asset type: central hero emblem for a premium Korean mobile sports player card, the personality archetype 'straight-ahead bulldozer' (do not write this text). Primary request: one exquisitely designed futuristic miniature bulldozer as a collectible trophy sculpture. No pedestal. A strong blade in front and two believable continuous tracked wheels, compact aerodynamic cabin. Mature precision industrial design, not a toy, not cute, no face. Scene/backdrop: seamless warm-white studio, subtle gray grounding shadow. Composition: centered full object, front three-quarter view with nose pointing to viewer's right, occupying 76 percent width with generous blank border; landscape 1536x1024. Materials: satin black titanium body, very bright volt lime #C5FF32 panels, polished chrome blade and narrow specular edges, fine matte rubber treads. Design restrained and geometric, sculptural sports collectible with convincing construction. Lighting: high-end studio product render, crisp white side highlights, delicate microtexture, no dark environment. No people, letters, words, numbers, logo, branding, watermark, traffic markings, flames, hearts, or pink. All readable text will be added in HTML later.
```


