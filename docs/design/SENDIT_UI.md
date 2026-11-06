# 센딧 UI 지침 (2026-11-06 개편)

회의(11-06) 결정: 이름 **센딧(Sendit)**, 부제 **나만의 연애 코치**. 분홍은 안 어울린다 → 앱 아이콘의 **하늘색 → 파랑 → 보라** 그라데이션.
화면 배치는 2차 시안 **「럽코」**(`C:\Users\shsop\mylovecoach-concept-20261102\docs\design\concept-20261102-v2\T-clean\board.png`, 화면별 png 같은 폴더)를 따른다:
흰 화면, 넉넉한 여백, 연회색 카드(#F2F4F6), 큰 한국어·숫자, 화면마다 주요 행동 하나, 작은 3D 아이콘 하나.
그 위에 **그라데이션을 주인공 색**으로 써서 「나름 화려해서 도파민 나오게」 — 큰 그라데이션 카드·버튼, 크게 세어 올라가는 숫자, 누르면 튀는 반응, 결과가 나올 때 축하.

## 꼭 지킬 것

- 색은 `src/constants/theme.ts` 의 `Colors`(useTheme)·`Brand`·`BrandShadow` 만. 화면에 색 코드를 새로 적지 않는다(꼭 필요하면 palette.send*).
- **분홍·로즈·에스프레소·골드 금지.** `Stage`(에스프레소 무대)·`StageBackground`·`Polaroid`·`GoldSticker`·`HeartMark`·모델 사진 배경은 쓰지 않는다(지우는 중).
- 짜친 것 금지: 네온 빛 번짐, 금속·크롬, 게임 HUD, 의미 없는 영어 라벨, 이모지 남발. 「화려함」은 그라데이션 면·큰 타이포·3D 아이콘 하나·움직임으로 낸다.
- 다크 모드도 맞는지(useTheme 색만 쓰면 대부분 맞다). 그라데이션 위 글자는 `Brand.onBrand`(흰색).
- 글자 대비 4.5:1 이상, 최소 12pt, 누르는 곳 44pt 이상, 접근성 라벨(한국어).
- 한국어는 친구처럼 짧게(~해요). 앱 이름은 `src/constants/brand.ts` 의 `APP_NAME`(센딧)·`APP_SUBTITLE`(나만의 연애 코치)·`RESEARCH_LINE`/`RESEARCH_SHORT`(고려대학교 연구진이 개발한 연애 특화 AI 코치)를 쓴다.
- 없는 기능을 그리지 않는다. 숫자·가격은 실제 값(스토어 가격은 스토어에서 받은 값).

## 공통 부품 (`src/components/brand/brand.tsx`) — 새로 만들지 말고 이것을 쓴다

| 부품 | 쓰는 곳 |
| --- | --- |
| `GradientButton` (shine 켜면 몇 초마다 빛이 스침) | 화면의 가장 중요한 버튼 하나 (캡처 올리기·결제·시작하기) |
| `Button variant="brand"` | 같은 그라데이션의 일반 버튼 (`components/ui/button.tsx`) |
| `HeroCard` | 화면 맨 위 큰 그라데이션 카드 (흰 글자, 옅은 동그라미 장식) |
| `BrandGradient` / `WashBackground` | 그라데이션 면 / 스플래시 같은 옅은 바탕 |
| `SenditLogo` (subtitle 로 부제) | 홈·결제·안내 맨 위 로고 |
| `ResearchBadge` / `BrandPill` | 「고려대 연구진이 만든 연애 특화 AI」 배지 / 작은 칩 |
| `Icon3D name="send" \| "heart" \| "memory" \| "ticket"` (float) | 화면마다 하나 — 캡처(send), 답장·호감(heart), 기억(memory), 이용권(ticket) |
| `BigNumber` / `Floating` | 큰 숫자 / 떠 있는 장식 |
| `useRemaining(until)` · `formatClock(ms)` | 타임 세일 남은 시간 |

그 밖에 있는 것: `components/ui/animated-number.tsx`(숫자 세어 올라가기), `components/fx/celebration.tsx`(축하 터뜨리기), `components/ui/pressable-scale.tsx`, `react-native-reanimated` 의 `FadeInDown` 등 등장 애니메이션, `lib/haptics`.

## 도파민 체크리스트 (화면마다)

1. 첫눈에 큰 제목 한 줄 + 그라데이션 면 하나 + 3D 아이콘 하나.
2. 등장할 때 위에서부터 차례로 살짝 올라오기(FadeInDown, 40~60ms 간격).
3. 누르면 스프링으로 살짝 줄었다 튀기 + 진동.
4. 숫자(호감 온도·성공 확률·남은 횟수·가격)는 크고 굵게, 바뀔 때 세어 올라가기.
5. 좋은 순간(결과 도착·답장 복사·결제 완료)에는 축하(celebration)·진동.
6. 그래도 깔끔하게: 한 화면에 그라데이션 큰 면은 하나, 나머지는 흰색·연회색.

## 상태 표시줄

화면 맨 위가 흰색이면 기본(검은 글자)으로 둔다. 맨 위가 그라데이션이면 `FocusStatusBar style="light"`(`components/ui/system-bars.tsx`). 스크롤하는 화면은 `Screen`(`components/ui/screen.tsx`)의 tab·sheet·stage·keyboard 옵션과 `StatusBarScrim` 을 그대로 쓴다(갤럭시 탭 바 잘림을 고친 부분이니 높이·여백 계산을 바꾸지 않는다).

## 확인 방법

- `npx tsc --noEmit -p .` · `npx eslint src --quiet` · `npx jest --silent`(자기 화면 테스트는 고쳐서 통과시킨다. 화면 문구를 바꾸면 테스트 문구도 맞춘다).
- 데모 웹 서버가 `http://localhost:8110` 에 떠 있다(데모 모드 — AI 없이 예시 결과). 고치면 바로 반영된다. 다른 작업자도 동시에 고치고 있어 잠깐 깨질 수 있다.
- 기기 여백 흉내 캡처: `C:\Users\shsop\AppData\Local\Temp\claude\71e7cfe283ce3124\6f6a41a4-88a9-43c2-92b1-ce1cda42e70e\scratchpad\devshots.mjs` 를 복사해 자기 흐름을 만든다(Edge 헤드리스 + CDP `Emulation.setSafeAreaInsetsOverride`, 갤럭시 384×832 위40·아래48, 아이폰 393×852 위59·아래34). 모아 보기 `montage.mjs`, 부분 확대 `crop.mjs`(같은 폴더). 찍은 PNG 는 반드시 직접 열어 보고 겹침·잘림·대비를 고친다.
