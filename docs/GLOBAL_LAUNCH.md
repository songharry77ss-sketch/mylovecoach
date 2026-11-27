# 세계 출시 (영어판 My Love Coach) 실행 순서

문구 원본: `docs/STORE_LISTING_EN.md` · 도구: `tools/asc-global.mjs`(App Store) · `tools/play-global.mjs`(Google Play).
두 도구 모두 **`--apply` 가 없으면 확인만** 한다. App Store 는 GET 만 쓰고, Play 는 임시 edit 을 열었다 지우며 가격 환산(계산만 하는 POST)을 부른다. 같은 값이면 건너뛰므로 여러 번 돌려도 된다.

## 2026-11-27 확인 결과 (dry-run)

| | App Store | Google Play |
|---|---|---|
| 기본 언어 / 지금 언어 | ko / ko 뿐 | ko-KR / ko-KR 뿐 |
| 판매(배포) 국가 | KOR 1곳 · 새 지역 자동 꺼짐 | KR 1곳 |
| 버전 | 1.4.2 심사 대기(WAITING_FOR_REVIEW) · 공개 1.4.1 | — |
| 상품 | weekly(구독)·year(비갱신 구독)·day·day.sale = KOR 만 · lifetime 0곳(판매 중단) | weekly·year(구독)·day·day.sale = KR 만 · lifetime 비활성 |
| 없는 상품 | `mylovecoach.credits.10` | `mylovecoach.credits.10` |

**막힘: 영어 전체 설명이 4000자를 넘는다** — Play 4145자, App Store(이모지 뺀 값) 4092자. `STORE_LISTING_EN.md` 의 Full description 을 줄여야 `--listing --apply` 가 된다 (도구는 한도를 넘으면 멈춤).

## 순서

0. **준비**
   - `STORE_LISTING_EN.md` 전체 설명을 4000자 이하로 줄인다.
   - `app.json` 버전을 영어판 버전(예: `2.0.0`)으로 올린다 — `## What's new (2.0.0)` 제목과 같아야 새 소식이 들어간다. 한국어 쪽도 `STORE_LISTING.md` 에 `## 이번 버전의 새로운 기능 (2.0.0)` 이 있어야 `asc-listing.mjs --submit` 이 돈다.
   - 영어 스크린샷 폴더: iOS 1290×2796(또는 1320×2868) PNG 10장 이하, Play 2~8장(긴 변 ≤ 짧은 변×2).
1. **영어판 빌드 병합** → iOS TestFlight 빌드 · Android AAB.
2. **App Store — 1.4.2 심사·출시가 끝난 뒤** (그 전에는 새 버전을 만들 수 없다)
   ```
   node tools/asc-global.mjs --listing --screenshots <영어 스크린샷 폴더>          # 확인
   node tools/asc-global.mjs --listing --screenshots <폴더> --apply                 # 버전 없으면 app.json 버전으로 만든 뒤 en-US 등록
   node tools/asc-global.mjs --iap            # 확인 → 괜찮으면 --apply (아래 「미리 해도 됨」)
   node tools/asc-listing.mjs --submit --build <번호>                               # 심사 제출 (한국어 문구도 같이 맞춤)
   ```
   제출 전 App Store Connect 웹 → 버전 페이지 「앱 내 구입 및 구독」에서 영어 이름을 더한 상품을 확인한다 (승인된 상품도 새 현지화는 심사를 받는다).
3. **Google Play**
   ```
   node tools/play-global.mjs --listing --screenshots <폴더>     # 확인 (Play 검사까지)
   node tools/play-global.mjs --listing --screenshots <폴더> --apply
   node tools/play-global.mjs --products                         # 환산 가격 확인 → --apply
   node tools/play-upload.mjs <영어판.aab> --track production
   ```
4. **영어판 승인·출시 뒤 — 판매 국가 열기**
   ```
   node tools/asc-global.mjs --iap --apply                        # 아직 안 했으면
   node tools/asc-global.mjs --availability                       # 공개 버전 en-US·상품 준비 확인
   node tools/asc-global.mjs --availability --apply --confirm-live # 공개 앱에 바로 반영
   ```
   Play: Play Console → 테스트 및 출시 → 프로덕션 → 국가/지역 → 국가/지역 추가 → 전체 선택 → 게시 개요에서 검토 전송 (API 로는 못 바꾼다, 뺄 곳 없음).
5. **확인**
   - `--availability`·`--iap` 를 다시 돌려 174곳·가격 있음, `TRADER_STATUS_*` 경고가 없는지 본다.
   - 미국 스토어: `https://apps.apple.com/us/app/id6813404855` · `https://play.google.com/store/apps/details?id=app.mylovecoach.android&hl=en&gl=US`
   - 미국 지역 샌드박스·라이선스 테스트 계정으로 결제 화면에 상품·현지 가격이 뜨는지.

**미리 해도 됨:** `asc-global.mjs --iap --apply` 와 `play-global.mjs --products --apply` 는 앱이 아직 한국에서만 팔릴 때 돌려도 해외 이용자에게 영향이 없다(앱을 못 받으니까). 오히려 판매 국가를 열기 전에 끝내 두어야 해외 첫 이용자가 빈 결제 화면을 안 본다. **판매 국가(`--availability`·Play 국가)만은 영어판 출시 뒤에.**

## 주의

- **EU DSA 판매자 상태**: App Store Connect 웹(비즈니스 → 디지털 서비스법)에서 판매자 상태를 신고·확인해야 EU 27개국에 나간다. API 는 지금 안 파는 지역을 모두 `CANNOT_SELL` 로만 보여 미리 알 수 없다 → 판매를 켠 뒤 `--availability` 로 `TRADER_STATUS_*` 를 확인.
- **중국 본토 제외**: 생성형 AI 앱은 중국 당국 허가(+ICP 등록)가 필요하다. Google Play 는 중국 본토에 없어 뺄 필요가 없다.
- **앱 이름·부제는 새 버전과 함께만 바뀐다**: 지금은 편집 가능한 앱 정보가 없다(READY_FOR_SALE·WAITING_FOR_REVIEW). 새 버전을 만들면 생긴다.
- **언어가 한국어로 보이는 나라 (결정 필요)**: Apple 스토어 언어표상 영국은 English (U.K.)만, 독일·프랑스·브라질·인도·호주 등은 English (U.K.)를 추가 언어로 쓴다. en-US 만 넣으면 이 나라들에는 기본 언어(한국어)가 보인다. 고를 것: ① `--locales en-US,en-GB,en-AU,en-CA` 로 같은 문구·스크린샷을 더 넣는다(키워드 칸도 로캘마다 따로라 ASO 에 이득) ② App Store Connect 웹 → 앱 정보 → 기본 언어를 English (U.S.)로 (새 버전 편집 중에만). Play 도 기본 언어 ko-KR 이라 번역 없는 기기 언어(독일어·일본어 등)에는 한국어가 보인다 → Play Console 에서 기본 언어를 en-US 로 바꿀지 결정 (en-US 에 아이콘·그래픽 이미지·스크린샷이 다 있어야 바뀐다).
- **스토어끼리 가격이 다르다 (결정 필요)**: App Store 는 가격 등급 환산, Play 는 환율 환산이다. 미국 기준 주간 $5.99 vs $7.49 · 1년권 $19.99 vs $21.99 · 하루 $1.99 vs $2.89 · 특가 $1.99 vs $2.19. 그대로 둘지, 주요국만 직접 가격을 넣을지 정한다 (두 도구는 KRW 는 건드리지 않고 빈 지역만 채운다).
- **App Store 해외에는 세일이 안 뜬다**: 하루 이용권(₩3,900)과 특가(₩2,900)가 미국·영국·일본·독일·브라질 모두 같은 가격으로 환산된다. 앱은 정가보다 싸지 않은 특가를 보여 주지 않으므로(거짓 할인 방지) 해외에서는 세일 화면이 안 나온다. 해외 세일을 하려면 특가 상품에 나라별 직접 가격이 필요하다.
- **주간 구독 가격은 이미 175곳 모두 있다** (KOR 설정 때 Apple 이 채움) → `--iap` 는 새 가격 없이 판매 지역만 넓힌다. 가격이 빈 지역이 생기면 KOR 가격의 환산 가격대로 만든다.
- **평생권**: 표의 설명 칸이 메모라 App Store 는 이름만 넣고, Play 는 설명이 꼭 있어야 해서 건너뛴다. 표에 영어 설명을 채우면 둘 다 들어간다. 판매 지역은 두 스토어 모두 건드리지 않는다.
- **되돌림 위험**: 세계 출시 뒤 `asc-iap.mjs`(옵션 없이 바로 씀)·`year-pass-products.mjs --apply`·`day-sale-products.mjs --apply` 를 다시 돌리면 상품 판매 지역을 「대한민국만」으로 다시 보낸다 (판매 지역 POST 는 통째로 바꾼다 — `lifetime-stop.mjs` 가 같은 방식으로 비웠다). `asc-listing.mjs` 의 판매 국가 단계는 설정이 이미 있으면 건너뛰어 안전하다.
- **App Store 「새 지역 자동」**: `--availability --apply` 는 판매 국가를 한 번에 다시 설정한다. Apple 이 거절(409)하면 지역마다 고치고, 「새 국가 또는 지역에서 자동으로 사용 가능」은 웹(가격 및 사용 가능 여부)에서 직접 켜라고 알려 준다.
- **홈 화면 이름**: 앱 이름 표시(CFBundleDisplayName·안드로이드 라벨)는 「센딧」이다 — 영어 기기에서 My Love Coach 로 보이려면 빌드 쪽 현지화가 필요하다(스토어 도구 범위 밖).
- **Play 출시 노트**: `play-upload.mjs` 는 ko-KR 노트만 넣는다 — 영어 노트는 Play Console 에서.
- **Play 제안(offer)**: 무료 체험·쿠폰 같은 구독 제안은 지역을 따로 가진다. 새 지역에는 기본 요금제 가격만 적용된다.
