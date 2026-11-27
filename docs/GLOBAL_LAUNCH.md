# 세계 출시 (My Love Coach, 전 언어) 실행 순서

등록 문구: `docs/store-listing/<언어>.json` (언어마다 하나, 검사 `node tools/i18n/check-listings.mjs`) · 상품 영어 이름: `docs/STORE_LISTING_EN.md` 표.
도구: `tools/asc-global.mjs`(App Store) · `tools/play-global.mjs`(Google Play) · 언어·로캘 표와 출시 노트 도우미: `tools/lib/store-listings.mjs`.
두 도구 모두 **`--apply` 가 없으면 확인만** 한다 (App Store 는 GET 만, Play 는 임시 edit 을 열어 넣어 보고 검사한 뒤 지운다). 같은 값이면 건너뛰므로 여러 번 돌려도 된다. **한국어(ko·ko-KR) 등록 정보는 어떤 단계도 건드리지 않는다.**

## 언어 → 스토어 로캘

| 앱 언어 | App Store | Google Play |
|---|---|---|
| en | en-US, en-GB, en-AU, en-CA | en-US, en-GB, en-AU, en-CA, en-IN, en-SG, en-ZA |
| es · pt · fr | es-ES, es-MX · pt-BR, pt-PT · fr-FR, fr-CA | es-419, es-ES, es-US · pt-BR, pt-PT · fr-FR, fr-CA |
| zh-Hans · zh-Hant | zh-Hans · zh-Hant | zh-CN · zh-TW, zh-HK |
| ar · nb · he | ar-SA · no · he | ar · no-NO · iw-IL |
| 나머지 (ja de it ru tr id vi th hi pl nl sv da fi cs sk hu ro uk el hr ms ca) | 같은 코드(de-DE·nl-NL) | ja-JP de-DE it-IT ru-RU tr-TR … (표 참고) |

파일이 없거나 검사에 걸린 언어는 건너뛰고 알려 준다 — 파일이 생기면 같은 명령을 다시 돌리면 된다.

## 2026-11-27 확인 결과 (dry-run)

- 언어 파일: 작성 중 — 확인 때 en·es·nl·vi·sv 통과, id(짧은 설명 82자)·ms·ca(부제 31자)는 한도 초과로 건너뜀, 나머지 24개는 아직 없음. 영어 설명 3,874자로 한도 안.
- App Store: 기본 언어 `ko`, 모든 버전 `ko` 뿐. **1.4.2 가 심사 대기(WAITING_FOR_REVIEW)라 1.5.0 버전·편집용 앱 정보를 아직 만들 수 없다** → 1.4.2 가 끝난 뒤 `--listing --apply`.
- Play: 기본 언어 `ko-KR`, 등록 정보 `ko-KR` 뿐. en 7개 로캘은 임시 edit 에서 Play 검사 통과.
- **Play 기본 언어 en-US 는 지금 막힘**: Play 가 「모든 인앱 상품에 새 기본 언어 번역이 있어야 한다」(validate 403)고 거절한다. en-US 번역이 없는 상품은 **평생권 하나** — 표의 설명 칸이 메모라 `--products` 가 건너뛴다. `STORE_LISTING_EN.md` 표에 평생권 영어 설명을 채우고 `--products --apply` 를 다시 돌려야 한다. en-US 에 아이콘·그래픽 이미지·스크린샷도 0개라 같이 필요하다.
- `mylovecoach.credits.10` 은 두 스토어에 없다 (사장님 결정: 뺀다 — 표에서 지우면 경고도 사라짐).

## 순서

0. **준비** — 언어 파일 채우기(`node tools/i18n/check-listings.mjs` 통과), 영어 스크린샷 폴더(iOS 1290×2796 또는 1320×2868 PNG 10장 이하 · Play 2~8장, 긴 변 ≤ 짧은 변×2), 평생권 영어 설명, Play en-US 아이콘·그래픽 이미지(콘솔에서). 한국어 쪽도 `STORE_LISTING.md` 에 `## 이번 버전의 새로운 기능 (1.5.0)` 이 있어야 `asc-listing.mjs --submit` 이 돈다.
1. **영어판 빌드 병합** → iOS 빌드 · Android AAB.
2. **상품 (언제 해도 됨 — 앱이 한국에서만 팔리는 동안 해외 이용자 영향 없음)**
   ```
   node tools/asc-global.mjs --iap                 → 확인 뒤 --apply
   node tools/play-global.mjs --products           → 확인 뒤 --apply   (Play 기본 언어를 바꾸기 전에 꼭)
   ```
3. **모든 언어 등록 정보 → 기본 언어 영어 → 영어 스크린샷** (App Store 는 1.4.2 가 끝난 뒤)
   ```
   node tools/asc-global.mjs --listing --primary-en --screenshots <iOS 폴더>            # 확인
   node tools/asc-global.mjs --listing --primary-en --screenshots <iOS 폴더> --apply    # 버전 없으면 app.json 버전으로 만든다
   node tools/play-global.mjs --listing --default-en --screenshots <Play 폴더>          # 확인 (Play 검사 두 번)
   node tools/play-global.mjs --listing --default-en --screenshots <Play 폴더> --apply
   ```
   한 명령 안에서 등록 정보(모든 로캘) → 기본 언어 en-US → en-US 스크린샷 순서로 돈다. 스크린샷은 **en-US 에만** 올린다 — ko 를 뺀 다른 로캘은 기본 언어(en-US)의 스크린샷·그래픽을 쓴다.
4. **제출** — `node tools/asc-listing.mjs --submit --build <번호>` (제출 전 웹 버전 페이지 「앱 내 구입 및 구독」에서 영어 이름을 더한 상품 확인 — 승인된 상품도 새 현지화는 심사를 받는다) · `node tools/play-upload.mjs <aab> --track production`.
5. **승인·출시 뒤 — 판매 국가 열기**
   ```
   node tools/asc-global.mjs --availability                        # 공개 버전 en-US·상품 준비 확인
   node tools/asc-global.mjs --availability --apply --confirm-live  # 공개 앱에 바로 반영
   ```
   Play: Play Console → 테스트 및 출시 → 프로덕션 → 국가/지역 → 국가/지역 추가 → 전체 선택 → 게시 개요에서 검토 전송 (API 로는 못 바꾼다, 뺄 곳 없음).
6. **확인** — `--availability`·`--iap`·`--listing` 을 다시 돌려 「같음」·174곳·가격 있음·`TRADER_STATUS_*` 경고 없음을 본다. 미국 스토어 `https://apps.apple.com/us/app/id6813404855` · `https://play.google.com/store/apps/details?id=app.mylovecoach.android&hl=en&gl=US`, 다른 언어는 `hl=ja` 등. 미국 지역 테스트 계정으로 결제 화면에 상품·현지 가격이 뜨는지.

**출시 노트(언어별 새 소식)**: 업로드 도구가 `import { playReleaseNotes } from './lib/store-listings.mjs'` → `{ notes: [{ language, text }], skipped }` 를 받아 ko-KR 노트(`lib/play-release.mjs`) 뒤에 붙이면 된다 (Play 는 언어마다 500자, 넘는 언어는 skipped). App Store 는 `--listing` 이 버전 현지화마다 `whatsNew` 를 넣는다.

## 주의

- **기본 언어를 바꾸는 이유**: 스토어는 기기·스토어 언어에 맞는 현지화가 없으면 기본 언어를 보여 준다. 지금 기본 언어가 한국어라 번역이 없는 언어·나라에는 한국어가 보인다 (예: 영국 App Store 는 English (U.K.)만 씀). `--primary-en`·`--default-en` 뒤에는 그런 곳이 영어를 본다. ko 등록 정보·스크린샷은 그대로다.
- **기본 언어 바꾸기의 조건**: Play 는 모든 인앱 상품(판매 중단 포함) 번역 + en-US 그래픽이 있어야 한다(확인됨). App Store 는 편집 중인 앱 정보·버전에 en-US 가 있어야 바꿔 준다 — 상품 영어 이름(`--iap`)도 먼저 넣어 두는 것을 권한다. App Store 기본 언어는 새 버전 편집 중에만 바뀐다.
- **EU DSA 판매자 상태**: App Store Connect 웹(비즈니스 → 디지털 서비스법)에서 신고·확인해야 EU 27개국에 나간다. API 는 안 파는 지역을 모두 `CANNOT_SELL` 로만 보여 미리 알 수 없다 → 판매를 켠 뒤 `--availability` 로 `TRADER_STATUS_*` 확인.
- **중국 본토 제외**: 생성형 AI 앱은 중국 당국 허가(+ICP 등록)가 필요하다. Google Play 는 중국 본토에 없어 뺄 필요가 없다.
- **앱 이름·부제는 새 버전과 함께만 바뀐다** — 편집용 앱 정보는 새 버전을 만들면 생긴다.
- **해외 가격 (11-27 사장님 위임으로 정함)**: 미국 기준 하루 $1.99 · 특가 $0.99 · 주간 $5.99 · 1년권 $19.99, 한국 가격 그대로. Play 는 `play-global.mjs --products --usd day=1.99,daysale=0.99,weekly=5.99,year=19.99 --apply` 로 KR 밖 모든 지역을 달러 기준 환산. App Store 는 주간·1년권·하루가 KRW 기준 자동 환산으로 이미 같은 값, 특가만 `tools/asc-usd-price.mjs mylovecoach.pass.day.sale=0.99 --apply`(기준 지역 USA, 한국 ₩2,900 유지).
- **유럽·영국·스위스 (기본안: 첫 출시에서 뺌)**: GDPR 대리인(제27조)·App Store DSA 판매자 정보 공개가 정해지면 연다. App Store 는 판매자 상태가 없으면 EU 에 자동으로 안 나간다.
- **평생권**: 판매 지역은 두 스토어 모두 건드리지 않는다. 영어 문구는 App Store 는 이름만 들어가고, Play 는 설명이 꼭 있어야 해서 표에 영어 설명이 생길 때까지 건너뛴다 (→ Play 기본 언어 변경이 막힘).
- **되돌림 위험**: 세계 출시 뒤 `asc-iap.mjs`(옵션 없이 바로 씀)·`year-pass-products.mjs --apply`·`day-sale-products.mjs --apply` 를 다시 돌리면 상품 판매 지역이 「대한민국만」으로 돌아간다. `asc-listing.mjs` 의 판매 국가 단계는 설정이 이미 있으면 건너뛰어 안전하다.
- **App Store 「새 지역 자동」**: `--availability --apply` 가 Apple 에 거절(409)되면 지역마다 고치고, 「새 국가 또는 지역에서 자동으로 사용 가능」은 웹에서 직접 켜라고 알려 준다.
- **홈 화면 이름**: 앱 표시 이름(CFBundleDisplayName·안드로이드 라벨)은 빌드 쪽 현지화 몫이다(스토어 도구 범위 밖).
- **Play 제안(offer)**: 무료 체험·쿠폰 같은 구독 제안은 지역을 따로 가진다. 새 지역에는 기본 요금제 가격만 적용된다.
