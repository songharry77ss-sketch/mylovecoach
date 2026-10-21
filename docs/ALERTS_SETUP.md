# 운영자 텔레그램 알림 설정 (회원가입 · 스토어 결제 · 매일 리포트)

새 회원이 가입하거나 App Store·Google Play 에서 결제·갱신·환불·해지 예약이 생기면 운영자 텔레그램으로 바로 알리고,
매일 아침 9시쯤 전날 리포트를 보냅니다.

```
회원가입 ─────────────────────────▶ api/member        ─┐
App Store 서버 알림 ───────────────▶ api/store-apple   ─┤
Google Play 실시간 알림 ─▶ Pub/Sub ─▶ api/store-google  ─┼──▶ 텔레그램 봇 ──▶ 운영자 대화방
Vercel Cron (매일 00:05 UTC) ──────▶ api/daily-report  ─┘
(스토어 알림은 Supabase store_event 표에도 남김 — 1년 보관, 리포트 매출 계산용)
```

보내는 문구 예시

```
🎉 새 회원가입 (오늘 3번째 · 누적 120명)
👤 민수 · minsu@example.com
🔑 카카오 · 📱 iOS 앱
🧭 유입: instagram · social · launch
🎁 가입 보너스 지급

💳 결제 · 하루 이용권 ₩2,700 · iOS
오늘 매출 ₩12,600 (2건)

🔁 구독 갱신 · 주간 구독 ₩9,900 · Android
↩️ 환불 · 평생권 ₩29,800 · iOS
⚠️ 구독 해지 예약 · 주간 구독 · iOS
[샌드박스] 💳 결제 · 주간 구독 ₩9,900 · iOS   ← TestFlight·샌드박스 결제 (매출에서 뺌)
```

- 환경변수를 넣기 전에는 **아무것도 보내지 않습니다** (코드가 배포돼도 조용히 꺼져 있음).
- 유입 경로는 이용 기록에 동의한 기기에만 있습니다. 동의하지 않았으면 「알 수 없음 (이용 기록 미동의)」로 나옵니다.
- 기기 종류는 앱이 보낸 요청 머리글(user-agent)로 짐작합니다 (앱 = iOS 앱·Android 앱, 브라우저 = 웹).

---

## 1. 텔레그램 봇 만들기 🙋 (약 3분)

1. 텔레그램에서 **@BotFather** → `/newbot` → 이름·아이디를 정하면 **봇 토큰**(`123456:ABC…`)을 줍니다. ⚠️ 비밀번호와 같습니다. 깃허브·대화방에 붙여넣지 마세요.
2. 만든 봇과의 대화방을 열고 **시작(/start)** 을 누른 뒤 아무 말이나 한 번 보냅니다 (봇은 먼저 말을 건 사람에게만 보낼 수 있음).
   여러 명이 받으려면 그룹을 만들어 봇을 초대하고 그룹에서 한마디 합니다.
3. 브라우저에서 `https://api.telegram.org/bot<봇 토큰>/getUpdates` 를 열어 `"chat":{"id": …}` 값을 적어 둡니다.
   개인 대화방은 양수, 그룹은 `-100…` 처럼 음수입니다. 여러 곳에 보내려면 쉼표로 이어 적습니다 (`12345,-1009876`).

## 2. Vercel 환경변수 💻

Vercel → 프로젝트 → Settings → Environment Variables 에서 **Production** 으로 등록하고(비밀 값은 **Sensitive**), 재배포합니다.

| 이름 | 값 | 없으면 |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | 1번의 봇 토큰 | 알림을 보내지 않음 |
| `TELEGRAM_CHAT_ID` | 1번의 대화방 ID (쉼표로 여러 개) | 알림을 보내지 않음 |
| `GOOGLE_RTDN_TOKEN` | 긴 무작위 값 (아래 명령) — Pub/Sub 푸시 주소에 붙여 Google 이 보낸 것인지 확인 | `/api/store-google` 이 503 |
| `CRON_SECRET` | 긴 무작위 값 (아래 명령) — Vercel 이 매일 리포트를 부를 때 `Authorization: Bearer …` 로 붙여 보냄 | `/api/daily-report` 가 503 |

```bash
node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"   # 한 번씩 따로 만들기
```

## 3. Supabase 표 만들기 🙋 (1분, 한 번만)

Supabase → **SQL Editor** → [`supabase/store_event.sql`](../supabase/store_event.sql) 내용을 붙여넣고 **Run**.
스토어 알림 기록 표(`store_event`)와 1년 파기 예약(`mylovecoach-purge-store`, 매일 03:40 KST)이 생깁니다. 여러 번 실행해도 안전합니다.
(새로 만드는 DB 는 `supabase/schema.sql` 하나에 같은 내용이 들어 있습니다.)

표를 만들기 전에도 알림은 갑니다. 다만 같은 알림을 두 번 받을 수 있고 리포트의 매출이 「확인 못 함」으로 나옵니다.

## 4. App Store 서버 알림 🙋 (App Store Connect)

1. App Store Connect → **앱** → 나만의 연애코치 → **앱 정보**(일반 정보)
2. **App Store 서버 알림** 에서
   - **프로덕션 서버 URL**: `https://mylovecoach.vercel.app/api/store-apple`
   - **샌드박스 서버 URL**: `https://mylovecoach.vercel.app/api/store-apple` (같은 주소 — 샌드박스는 「[샌드박스]」로 표시되고 매출에서 빠짐)
   - 버전: **버전 2 알림**
3. 저장 뒤 TestFlight 에서 하루 이용권을 사 보면 「[샌드박스] 💳 결제 …」가 옵니다.

서버는 알림의 서명을 확인합니다 — 인증서 사슬이 Apple Root CA - G3 에서 이어지고 Apple 표시(OID)가 있으며 서명이 맞는지,
번들 ID 가 `app.mylovecoach.ios` 인지. 틀리면 400 으로 거절합니다 (Apple 은 200 이 아니면 며칠에 걸쳐 다시 보냄).

## 5. Google Play 실시간 개발자 알림 🙋 (Google Cloud + Play Console)

1. [Google Cloud 콘솔](https://console.cloud.google.com) → 프로젝트 선택(Play Console 과 연결한 프로젝트 권장) → **Pub/Sub → 주제 만들기**
   - 주제 ID: `play-rtdn` (예시) — 전체 이름은 `projects/<프로젝트ID>/topics/play-rtdn`
2. 만든 주제 → **권한** → **주 구성원 추가**
   - 새 주 구성원: `google-play-developer-notifications@system.gserviceaccount.com`
   - 역할: **Pub/Sub 게시자**
   - (조직 정책 「도메인 제한 공유」 때문에 추가가 막히면 그 정책에 이 계정을 예외로 넣어야 합니다)
3. 주제 → **구독 만들기**
   - 전송 유형: **푸시**
   - 엔드포인트 URL: `https://mylovecoach.vercel.app/api/store-google?token=<GOOGLE_RTDN_TOKEN 값>`
   - 나머지는 기본값 (재시도는 「지수 백오프」 권장)
4. Play Console → 앱 → **수익 창출 설정**(Monetization setup) → **실시간 개발자 알림**
   - 주제 이름: `projects/<프로젝트ID>/topics/play-rtdn`
   - 알림 유형: 구독·무효화된 구매·일회성 상품 모두 받기
   - **테스트 알림 보내기** → 텔레그램에 「🧪 Google Play 실시간 알림 연결 확인」이 오면 끝

Google 알림에는 금액이 없어 요금제 정가(`src/lib/billing/plans.ts` 의 `FALLBACK_PRICES`)로 적습니다.
라이선스 테스터의 시험 결제도 실제 결제와 똑같이 와서 매출에 섞입니다(구분하려면 Play Developer API 조회가 필요 — 지금은 안 함).

## 6. 매일 아침 리포트 (Vercel Cron)

`vercel.json` 의 `crons` 에 `/api/daily-report` 를 매일 `5 0 * * *`(UTC) 로 적어 두었습니다. 배포하면 Vercel 이 알아서 부릅니다.

- Hobby 요금제의 예약 실행은 하루 한 번까지이고 **지정한 시(00시 UTC) 안에서 아무 때나** 실행됩니다 → 한국 시간 09:00~09:59 사이.
- 내용: 어제(한국 날짜) 신규 회원(10명까지 닉네임·가입 방법·이메일)과 누적 회원, 실제 결제 매출(스토어·상품별)·환불·해지 예약 수,
  이용 기록이 있는 기기의 앱 실행 기기 수·코칭 결과 수(`coach_success`)·결제 화면 열람 → 결제창 진입 기기 수 (1.0.4 앱·웹은 만 14세 이상 전체, 1.0.3 이하 앱은 동의한 기기만).
- 손으로 한 번 보내 보기 (실제로 텔레그램에 갑니다):
  ```bash
  curl -H "Authorization: Bearer <CRON_SECRET 값>" https://mylovecoach.vercel.app/api/daily-report
  ```

## 7. 개인정보 처리방침 · 스토어 설문

- `site/privacy.html` 에 「운영자 알림(텔레그램)」과 「스토어 결제 알림」을 적었습니다 (1번 표·2번 국외 이전 표·3번·5번·7번·11번·12번, 2026-10-21 개정).
  `site/delete-data.html` 에도 두 항목의 삭제 방법을 더했습니다. **운영 배포(병합) 뒤에 환경변수를 켜 주세요** — 처리방침이 먼저 공개돼야 합니다.
- 텔레그램 메시지에는 가입자의 닉네임·이메일이 들어가고 **회원 탈퇴로 자동 삭제되지 않습니다.** 대화방을 가끔 정리하고,
  탈퇴한 회원이 요청하면 그 메시지를 지워 주세요.
- App Store 「앱이 수집하는 개인정보」·Play 「데이터 보안」: 이메일·이름·구입 내역은 이미 「수집」으로 신고돼 있습니다(`docs/APP_PRIVACY.md`).
  텔레그램은 운영자 대신 메시지를 전달·보관하는 서비스라 「제3자 공유」로 보지 않는 것이 일반적이지만, 신고를 고칠 때 함께 검토하세요.

## 8. 문제 해결

| 증상 | 확인 |
|---|---|
| 아무 알림도 안 옴 | Vercel 환경변수 두 개(`TELEGRAM_*`)와 재배포, 봇에게 먼저 말을 걸었는지 |
| Vercel 로그 `[telegram] 보내기 실패 403` | 봇이 대화방에서 차단·추방됨 또는 /start 안 함 |
| Vercel 로그 `[telegram] 보내기 실패 400` | 대화방 ID 가 틀림 |
| `/api/store-google` 401 | 구독 엔드포인트의 `?token=` 이 `GOOGLE_RTDN_TOKEN` 과 다름 (Pub/Sub 은 계속 다시 보냄) |
| `/api/store-apple` 400 | 다른 앱의 알림이거나 서명 확인 실패 — Vercel 로그 `[store-apple] 거절: …` 에 이유 |
| 리포트 매출이 「확인 못 함」 | 3번 `store_event.sql` 을 실행하지 않음 |

### 알려진 한계
- 같은 거래·같은 종류의 알림은 한 번만 기록합니다(스토어 재전송 막기). 그래서 한 결제 기간 안에 「해지 예약 → 해지 취소 → 다시 해지 예약」을 하면 두 번째 해지 예약은 기록·알림되지 않습니다.
- Apple 인증서 폐기(OCSP) 조회는 하지 않습니다. 인증서 사슬·Apple 표시·서명·유효 기간만 확인합니다.
- 매출은 고객이 낸 금액(세금·수수료 차감 전) 기준이고, 알림을 받은 시각의 한국 날짜로 셉니다.
