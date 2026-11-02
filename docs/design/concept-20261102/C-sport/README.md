# C-sport · 게임 플랜 — 직진

밝은 흰색 위에 진한 검정, 볼트 연두와 오렌지를 얹은 스포츠 감각의 AI 연애 코치다. 굵은 기울임 제목, 선명한 스코어 막대, 선수 카드 같은 KKTI 결과가 대화의 다음 행동을 빠르게 보여 준다. 크롬·연두 입체 소재는 표면과 모서리에서 빛나고, 실제 답장과 분석 정보는 넉넉한 여백과 정확한 한국어 조판으로 읽힌다. 상대를 이겨야 할 대상으로 표현하지 않고, 내 마음을 명확히 전하면서 상대의 페이스를 존중하는 태도를 담았다.

## 이름

**직진 / JIKJIN** — 망설임을 줄이고 진심을 분명하게 전한다는 뜻이다. 기존 KKTI의 「직진 불도저」와 이어져, 앱 이름과 공유 카드의 성격을 하나로 연결한다.

슬로건: **망설이지 말고, 직진**

## 디자인 규칙

| 역할 | 색 |
| --- | --- |
| 기본 바탕 | 화이트 `#FFFFFF` |
| 본문·강한 대비·베젤 | 거의 검정 `#101410` |
| 주요 CTA·강조·스코어 | 볼트 연두 `#C5FF32` |
| 작은 진행 포인트·스탯 끝점 | 오렌지 `#FF6B2C` |
| 보조 표면·트랙 | 은회색 `#E9ECE6` |

- **글꼴:** 한국어는 Pretendard Medium 500 / Bold 700. 숫자와 영문은 Windows 기본 Bahnschrift를 사용한다. 제목에 제한적으로 기울임을 적용한다.
- **읽기:** 1179px 화면 기준 텍스트는 최소 26px, 버튼은 최소 120px 높이로 구성한다. 본문은 흰색·은회색·연두 위에 어두운 색을 사용해 대비를 확보한다. 오렌지는 본문색이 아닌 포인트다.
- **표면:** 화이트 카드, 얇은 검정 구분선, 여러 겹의 부드러운 그림자를 기본으로 한다. 반투명 유리, 금속 그라데이션, 방사형 빛과 미세 질감은 조형물 및 제한된 강조 영역에 쓴다.
- **형태:** 기울어진 절단면과 전진 방향을 가리키는 조형, 직선 스코어를 반복한다. 스포츠의 속도감은 읽기 순서를 해치지 않는 범위에서만 사용한다.
- **정보:** 홈은 캡처 업로드, 결과는 답장 세 가지 비교, KKTI는 유형과 네 성향을 핵심으로 둔다.

## 20~30대 남성 사용자에게 통할 이유

1. 익숙한 러닝·스포츠 앱의 굵은 타이포와 명확한 수치가 기능을 빠르게 이해하게 한다.
2. 밝은 바탕과 절제된 형광색이 가볍게 열기 좋은 일상 앱의 느낌과 강한 인상을 함께 준다.
3. 선수 카드 형태의 KKTI 결과와 완성도 높은 입체 소재가 자신의 성향을 보고 공유하는 즐거움을 만든다.

## 현재 앱에서 바꿀 컴포넌트

| 파일 | 변경 방향 |
| --- | --- |
| `src/constants/theme.ts` | 색·글꼴·표면·간격 토큰 |
| `src/components/stage/stage.tsx` | 브랜드 헤더와 장식 소재 |
| `src/app/(tabs)/index.tsx` | 캡처 CTA·상황 입력·무료 잔여 횟수·최근 상담 구성 |
| `src/app/quick.tsx` | 캡처 업로드·대화 붙여넣기 액션 스타일 |
| `src/components/crush/crush-list-item.tsx` | 최근 상담을 정돈된 스코어 행으로 구성 |
| `src/components/coach/analysis-card.tsx` | 상대 메시지 요약·답장·호감 온도의 정보 위계 |
| `src/components/coach/reply-carousel.tsx` | 세 답장 비교 카드·성공 확률·복사 버튼 |
| `src/components/coach/heat-gauge.tsx` / `temperature-gauge.tsx` | 스포츠 스코어 형태의 온도 게이지 |
| `src/app/mind.tsx` | 속마음 가능성 막대와 코칭 문구 |
| `src/app/kkti/result.tsx` | 선수 카드·네 스탯·궁합·공유 |
| `src/app/(tabs)/_layout.tsx` | 홈·탐색·마이 탭 스타일 |

이 목록은 향후 구현 범위다. 이번 작업에서는 앱 코드를 변경하지 않았다.

## 데이터와 범위

- 이 결과물은 **정적인 HTML/CSS 브랜드·UI 시안**이다. 화면의 입력·복사·공유 버튼은 실제 기능에 연결되지 않는다.
- 인사, 상대 메시지, 답장 내용, 성공 확률, 속마음 가능성과 호감 온도는 디자인을 설명하는 예시다. 실제 결과는 기존 코칭 데이터로 연결해야 한다.
- KKTI 「직진 불도저」와 코드 「선빠폭직」, 네 축 「연락 시작·답장 속도·표현·진도」 및 궁합 유형 「꼬리 흔드는 골댕이 / 후빠폭직」은 `src/lib/kkti.ts`의 실제 정의를 참고했다. 스탯 수치는 시안용 예시다.
- 무료 횟수 표시는 실제 잔여 횟수를 연결할 자리이며, 현재 앱의 일일 무료 코칭 규칙은 1회다.
- 첨부된 기존 화면은 기능과 정보 구조만 참고했다. 기존 색·스타일 및 타사 로고는 사용하지 않았다.
- 생성형 이미지 도구로 만든 글자 없는 아이콘과 입체 소재를 사용한다. 한국어·영문·수치는 HTML로 조판했다. 프롬프트는 `prompts.md`에서 확인할 수 있다.

## 산출물

- `icon.png` — 앱 아이콘, 1024 × 1024
- `_art/` — 이미지 생성 도구로 만든 키 비주얼 소재
- `screen-1-home.png` / `screen-1-home.html` — 홈, 1179 × 2556
- `screen-2-result.png` / `screen-2-result.html` — 코칭 결과, 1179 × 2556
- `screen-3-kkti.png` / `screen-3-kkti.html` — KKTI 결과, 1179 × 2556
- `board.png` / `board.html` — 발표용 컨셉 보드, 2400 × 1350
- `shared.css` / `build.mjs` — 화면 스타일과 소스 구성
- `README.md` / `prompts.md` — 컨셉·규칙·프롬프트 기록
- `audit.mjs` / `qa.json` — 글꼴·버튼·해상도·텍스트 범위·대비 확인

## 렌더링

저장소 루트에서 준비된 Edge 헤드리스 렌더러를 사용한다. 보드는 위 세 화면 PNG를 읽으므로 화면부터 렌더링한다.

```powershell
node docs/design/concept-20261102/C-sport/build.mjs
node C:/Users/shsop/mylovecoach-codex-tools/render.mjs docs/design/concept-20261102/C-sport/screen-1-home.html docs/design/concept-20261102/C-sport/screen-1-home.png 1179 2556 docs/design/concept-20261102/C-sport/screen-2-result.html docs/design/concept-20261102/C-sport/screen-2-result.png 1179 2556 docs/design/concept-20261102/C-sport/screen-3-kkti.html docs/design/concept-20261102/C-sport/screen-3-kkti.png 1179 2556
node C:/Users/shsop/mylovecoach-codex-tools/render.mjs docs/design/concept-20261102/C-sport/board.html docs/design/concept-20261102/C-sport/board.png 2400 1350
node docs/design/concept-20261102/C-sport/audit.mjs
```

화면과 보드가 참조하는 이미지·HTML은 모두 이 C-sport 폴더 안에 있다. Pretendard 폰트만 저장소의 기존 `api/_assets/fonts/` 파일을 읽는다.

## PNG 검수 완료

최종 화면 3장, 보드, 아이콘 및 생성 소재 2장을 직접 열어 확인했다. 첫 렌더에서 보인 홈 히어로와 KKTI 배너의 사각 이미지 경계를 CSS 마스크로 완화하고 홈·보드를 다시 렌더링해 확인했다. 글자 깨짐·겹침·잘림 없이 답장 3개와 KKTI 스탯 4개가 모두 보인다.

`qa.json`에서 최종 PNG 규격, Pretendard 로딩, 화면 최소 글자 26px, 버튼 최소 높이 120px, 화면 밖 텍스트 없음, 이미지 로딩을 확인했다. 검사한 본문 색 조합의 대비는 최소 6.20:1이며, 배경 장식인 FORWARD.는 정보 텍스트가 아니다. 보드는 가운데 폰을 확대하고 세 화면을 모두 표시했다.
