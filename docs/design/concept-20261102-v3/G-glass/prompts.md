# 청신호 이미지 생성 기록

두 에셋 모두 기본 내장 `image_gen` 도구로 새로 생성했어요. API CLI나 외부 실존 인물 사진은 사용하지 않았어요. 첨부 App Store 보드는 분위기와 정보 위계만 참고했으며 생성 입력이나 복제 대상으로 사용하지 않았어요.

## 인물 사진 · photorealistic-natural

- 최종 에셋: `assets/riverside-couple.png`, 1024 × 1536
- 인물: 실존하지 않는 20대 중반 한국인 성인 남자 1명, 여자 1명
- 사용: 스토어/홈 배경, 결과의 흐린 배경, KKTI 카드, 최근 상담의 HTML 크롭
- 원문 프롬프트·원본 경로: [assets/photo-prompt.md](assets/photo-prompt.md)
- 생성 후 눈·치아·어깨를 직접 확인했어요. 손과 휴대폰은 없어요. 원본은 그대로 보관하고 HTML로만 배치했어요.

## 아이콘 · logo-brand

- 생성 원본: `assets/icon-generated.png`
- 최종: `icon.png`, 1024 × 1024
- 단일 흰 원형 말풍선 링과 초록 중심으로 ‘대화의 청신호’를 표현했어요. 하트, 얼굴, 문자, 금속 재질은 넣지 않았어요.
- 원문 프롬프트·원본 경로: [assets/icon-prompt.md](assets/icon-prompt.md)
- `assets/icon-render.html`을 Edge로 렌더해 크기만 정규화했어요. 생성 배경색은 지정 HEX의 근사색이며 UI는 정확한 `#14C38E`를 사용해요.

## 생성하지 않은 부분

한국어·숫자·로고타입은 모두 HTML의 프리텐다드예요. 유리, 그라디언트 베일, 사진 마스크, 버튼, 상태바, 홈 인디케이터, 목업 외곽은 CSS로 만들었어요. 작은 탐색/복사/업로드 기호는 SVG 선을 사용했어요.
