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

## 탭 바 (2026-11-07, 1.1.1)

팀 제안 영상(iOS 26 「리퀴드 글래스」 결)을 따라 `src/components/ui/glass-tab-bar.tsx` 로 바꿨다.
- 화면 위에 떠 있는 유리 알약(홈·탐색·마이, 연애 연습은 켰을 때만) + 오른쪽 「새 채팅」 파란 구슬(+). 홈 오른쪽 위 + 는 없앴다(엄지가 닿는 자리로).
- 고른 탭 밑 옅은 파란 캡슐 → 탭을 바꾸면 흰 렌즈처럼 커져 떠올랐다가 미끄러져 내려앉는다(Reanimated, 움직임 줄이기 설정이면 미끄러지기만).
- 구슬은 누르면 눌렸다 튕기고 + 가 90° 돈다(같은 모양이라 끝나면 티 없이 원위치). 광택은 위→아래 흰 그라데이션, 그림자는 파란 빛.
- 아이폰 iOS 26 이상은 시스템 유리(`expo-glass-effect` GlassView), 그 밖은 흰 0.96·다크 0.97 유리 + 바닥 흐림.
- 자리: `tab-bar-space.ts` — 아이폰은 홈 막대에 조금 걸치게(아래 영역 − 12), 안드로이드는 버튼·제스처 위(+ 8). 탭 화면은 `Screen tab`(= `useTabBarSpace()`)만큼 아래를 비운다. 홈처럼 직접 ScrollView 를 쓰는 탭은 같은 훅으로 비운다.
- 아이콘: + (새 채팅). ↑ 는 로고·보내기 뜻이라 탭 바에서는 「맨 위로」로 읽힐 수 있어 쓰지 않는다.


## 1.2 개편 「떠 있는 유리」 (2026-11-08)

사장님 지시: 새 탭 바 결을 이어서 **앱 전체 UI/UX 를 손본다.** 탭 바의 떠 있는 유리·스프링 움직임을 앱의 공통 언어로 넓힌다.

### 바탕과 카드 (토스 결)
- **탭 화면(홈·탐색·마이·연애 연습)과 설정·목록 화면**은 옅은 회색 바탕 `theme.canvas`(#F3F5F9) 위에 **흰 카드 `theme.card`**. `Screen tab` 은 기본 바탕이 canvas 다.
  - canvas 위에 `theme.surface`(연회색)를 바로 놓으면 바탕과 구분이 안 된다 → canvas 위 카드는 `theme.card` + `CardShadow`(다크는 그림자 대신 `theme.separator` 가는 테두리).
  - 흰 카드 **안쪽**의 칩·입력칸·작은 면은 `theme.surface`.
- **읽는 화면(채팅방·결과·결제·안내)** 은 흰 바탕(`theme.background`) 그대로.
- 카드 모서리 22(`Radius.lg + 2`), 큰 카드 28(`Radius.xl`). 카드 안 여백 16~20.
- 설정·목록은 **`ListGroup`**(`components/ui/list-group.tsx`)으로 묶는다 — 흰 카드 하나에 `ListRow` 여러 줄, 줄 사이 가는 선, 아이콘은 앱 색 옅은 바탕에 앱 색(자동).

### 떠 있는 유리
- 공통 부품 **`GlassSurface`**(`components/ui/glass-surface.tsx`): iOS 26+ 는 시스템 유리, 그 밖은 **불투명한** 흰 면(다크 #1C202E) + 가는 테두리 + 위 광택 + 떠 있는 그림자(흐림 없이 반투명으로 두면 0.985 로도 뒤 글자가 뚜렷이 비쳤다). 탭 바·채팅 입력창·스크롤 머리말이 같은 유리를 쓴다.
  - 웹 함정: GlassSurface 안에 TextInput 을 넣으면 웹은 위치 지정 없는 입력칸을 유리 바탕(절대 위치)보다 먼저 그려 글자가 깔린다 → 입력칸에 웹만 `position: 'relative'`(composer 의 PillInput 참고).
- 둥근 구슬(탭 바 새 채팅·채팅 보내기) 색은 `Brand.orb` 하나로.
- **스크롤 유리 머리말**: 큰 제목이 있는 `Screen safeTop` 화면은 `title="마이"` 처럼 넘기면 제목이 사라질 만큼 내렸을 때 작은 제목이 든 유리 띠가 내려온다(`components/ui/glass-header.tsx`). 직접 ScrollView 를 쓰는 화면은 `useScrolledPast(64)` + `<GlassHeader title top visible />`.
- **채팅 입력창**도 떠 있는 유리 알약: [캡처 버튼 | 글 입력 | 보내기 구슬]. 보내기 구슬은 새 채팅 구슬과 같은 그라데이션·광택(보낼 수 있을 때만 색이 찬다). 입력창 위 말투 칩은 한 줄로 가볍게.

### 다크 모드
- 다크는 `theme.card` 와 `theme.surface` 가 같은 색이다 → 흰 카드 **안** 칩·입력칸·눌림 색은 `useInsetFill()`(list-group.tsx, 다크만 surfaceElevated). 공통 Chip 은 다크에서 알아서 한 단계 밝다.
- canvas 위 흰 카드는 `useCardStyle()` / `Card tone="card"` / `ListGroup` / `CardSection` — 라이트는 옅은 그림자, 다크는 가는 테두리.

### 움직임
- 탭 화면은 위에서부터 차례로 살짝 올라오며 등장(`FadeInDown.delay(i*50).springify()` 류, 이미 쓰는 `enter(i)` 패턴).
- 누르는 카드·타일은 `PressableScale`(줄었다 튕김 + 진동). 목록 줄은 눌림 색만.
- 움직임 줄이기 설정(`useReducedMotion`)이면 튕김 없이.

### 하지 말 것
- 기존 기능·문구의 뜻을 바꾸지 않는다(문구는 더 짧고 친근하게 다듬는 정도). 없는 기능을 그리지 않는다.
- 테스트가 찾는 접근성 라벨·testID·문구는 되도록 유지하고, 바꾸면 테스트도 같이 고친다.
- 이모지는 칩 앞 작은 표정 정도. 🚧 같은 뜻이 어긋난 이모지·장식 금지.
