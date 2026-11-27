# Codex 작업서 — 스토어 등록 문구 다국어 (2026-11-27 세계 출시)

## 입력
- `docs/store-listing/en.json` — 영어 원본 (App Store·Google Play 등록 문구). **읽기만.**
- 맥락: `docs/STORE_LISTING_EN.md`, `docs/I18N.md`. 앱은 AI 연애·데이트 코치: 채팅 캡처를 올리면 바로 보낼 답장 3개와 상대의 관심도(호감 온도)를 알려 준다.

## 출력
맡은 언어마다 `docs/store-listing/<언어>.json` — 원본과 같은 열쇠 7개:

| 열쇠 | 한도(글자) | 메모 |
|---|---|---|
| appName | 30 | **「My Love Coach」로 시작**하고 그 언어의 검색어로 짧은 꼬리를 붙인다 (예: `My Love Coach: AI恋愛返信`). 다른 앱 이름 금지 |
| subtitle | 30 | App Store 부제 — 이름과 겹치지 않는 검색어 |
| shortDescription | 80 | Google Play 짧은 설명 |
| keywords | 100 | App Store 키워드 — 쉼표로만 구분(띄어쓰기 없이), 그 나라 사람이 실제로 검색하는 말. 이름·부제에 이미 있는 말은 빼도 됨. **다른 앱·회사 이름(Tinder, Hinge, Bumble, LINE, WhatsApp, ChatGPT 등) 금지** |
| promotionalText | 170 | App Store 홍보 문구 |
| description | 4000 | 전체 설명 — 원본 구성(이모지 소제목·글머리)을 따르고, 그 나라 데이트 문화에 맞게 자연스럽게. 구독·결제·약관 문단은 뜻을 정확히 |
| whatsNew | 4000 | 이번 버전 새 기능 |

- 글자 수는 JavaScript 문자열 길이(코드 포인트) 기준. 한도를 넘기지 않는다.
- 약관·개인정보 링크 주소는 원본 그대로 둔다 (영어 문서로 이어짐).
- 「My Love Coach」, App Store, Google Play, Apple, Google, MBTI 는 번역하지 않는다.
- 자연스럽고 매력적인 마케팅 문구로 (직역 금지). 과장·허위 금지(원본에 없는 기능·숫자를 만들지 않는다).
- 한글이 섞이면 안 된다. 외부 번역 API·인터넷 없이 직접 번역한다.
- 맡은 언어 파일 말고는 고치지 않는다. git 명령을 쓰지 않는다.

## 확인
`node tools/i18n/check-listings.mjs <언어> …` 가 실패 0개가 될 때까지 고친다.

## 언어 코드
ja · zh-Hans · zh-Hant · es · pt(브라질) · fr · de · it · ru · tr · id · vi · th · ar · hi · pl · nl · sv · da · nb · fi · cs · sk · hu · ro · uk · el · he · hr · ms · ca
