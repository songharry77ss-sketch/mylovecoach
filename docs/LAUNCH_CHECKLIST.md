# 정식 출시까지 남은 일

## 2026-10-05 회의 반영 — 다음 빌드 전에 할 일

회의 내용(호칭·존댓말 인식, 이모지, 답장 스와이프, 비밀 상담, 새 아이콘, 플로팅 버블, 연애 연습, 속마음 카드, 추구미·목표, 0°부터 오르내리는 온도, 상대 분석 보고서, 진동·애니메이션, 첫 화면 시연 영상, KKTI 테스트, 하루/주간/평생/횟수 요금제)을 코드에 넣었습니다. 스토어 쪽은 아래가 남아 있습니다.

| 할 일 | 누가 | 방법 |
|---|---|---|
| ~~서버(웹+API) 배포~~ ✅ 2026-10-05 완료 (운영 API 에서 예전 형식·새 모드 모두 확인) | 코드 | `gh workflow run vercel.yml` |
| 하루 이용권·횟수권 **가격 확정** (횟수권 10회 ₩4,900 은 가안) | 🙋 팀 | `src/lib/billing/plans.ts` 의 `FALLBACK_PRICES`·`CREDITS_PER_PACK` 와 아래 스크립트 값 수정 |
| App Store 소모성 상품 2개 만들기 | 코드 | `node tools/asc-iap.mjs --consumables` (₩2,700 가격대가 없으면 가장 가까운 값으로 맞추고 알려 줌) |
| Play 일회성 상품 2개 만들기 | 코드 | `node tools/play-setup.mjs --products --consumables` (한국 개발자 정보가 채워진 뒤) |
| 새 상품을 다음 버전 심사에 같이 올리기 | 🙋 화면 | 버전 페이지 「앱 내 구입 및 구독」에서 선택 |
| ~~Play: 포그라운드 서비스(specialUse) 신고~~ → **스토어 빌드는 플로팅 버블을 끔 (신고 전)**. `android.yml` 이 기본으로 버블을 빼고 AAB 병합 매니페스트로 확인함 (직접 설치 APK 는 버블 유지). 나중에 넣으려면: 실기기 시연 영상(마이 → 버블 켜기 → 「다른 앱 위에 표시」 허용 → 카톡 위 버블 → 빠른 코칭 → 끄기)을 YouTube 일부 공개로 올리고, 모듈 매니페스트의 `PROPERTY_SPECIAL_USE_FGS_SUBTYPE` 과 같은 설명으로 신고한 뒤 `-f floating_bubble=true` 로 빌드 | 🙋 화면 | Play Console → 앱 콘텐츠 → 포그라운드 서비스 권한 → 「기타(특수 용도)」 설명·영상 링크 |
| ~~새 빌드~~ ✅ iOS 116 (스토어에 없는 하루권 문구 제거판) — 10-06 TestFlight 내부 그룹·외부 「테스터」(베타 심사 승인) 모두 설치 가능, APK 105 (GitHub 릴리스) | 코드 | `ios.yml` → `node tools/asc-testflight.mjs --wait 35`, `android-apk.yml` |
| ~~심사 초안 정리~~ ✅ 2026-10-05: 앱 1.0(빌드 116) + 구독 그룹 「프리미엄」 + 평생 프리미엄 + 주간 프리미엄, 새 스크린샷 6장, 상품별 심사 메모 | 코드·화면 | 초안에 든 버전은 스크린샷을 못 지운다(409) → 초안에서 버전을 잠시 빼고 바꾼 뒤 다시 넣음 |
| ~~애플 유료 앱 계약~~ ✅ 10-06 확인: 계약·은행(하나 사업자)·세금 양식 3종·전자상거래법 규정 준수 모두 「활성화됨」 | 🙋 화면 | App Store Connect → 비즈니스 |
| ~~심사 제출~~ ✅ 2026-10-05 21:03 (`asc-submit.mjs --submit`) — 버전 1.0·주간 구독·평생권 모두 심사 대기 | 코드 | 상태 확인은 `node tools/asc-status.mjs` (제출하지 않음) |
| 계약이 활성화됐으니 TestFlight 116 에서 **샌드박스 결제·복원** 직접 확인 (TestFlight 결제는 실제 청구 없음) | 🙋 팀 | 마이 → 이용권 보기 → 주간/평생 결제 → 앱 삭제 후 재설치 → 구매 복원 |

상품이 스토어에 아직 없으면 앱 결제 화면은 그 상품을 **자동으로 숨깁니다** (주간·평생권만 보임). 그래서 코드 배포를 먼저 해도 안전합니다.


API 와 브라우저로 할 수 있는 건 전부 끝났습니다. 🙋 표시는 본인만 할 수 있는 단계입니다.
현재 상태는 언제든 `gh workflow run status.yml` 로 확인할 수 있습니다.

## AI 답변 신고 (구글 플레이 생성형 AI 정책) — Play 검토 보내기 전에 꼭

플레이 정책상 AI 로 내용을 만드는 앱은 **앱을 떠나지 않고** 불쾌한 AI 답변을 개발자에게 신고하는 기능이 있어야 합니다(메일 링크는 앱을 떠나므로 안 됨).
신고 진입점: 답장 카드의 깃발 · 연애 연습 화면 위 깃발(상대의 가장 최근 말)·상대 말풍선 길게 누르기·코치 피드백 옆 깃발 · 상대 분석 보고서 아래 「이 보고서 신고」 · 속마음 풀이의 「이 풀이 신고」 · 마이 → 「AI 답변 신고하기」. (연습 끝내기는 깃발이 아니라 「끝내기」 글자 버튼)
신고는 `api/report.ts` 가 Supabase `ai_report` 표에 저장합니다(기기 ID·IP 없이, 하루 300건·DB 400MB 상한, 1년 뒤 자동 파기). **서버 배포 전에는 신고가 실패하므로 검토를 보내면 안 됩니다.**

| 순서 | 할 일 | 누가 |
|---|---|---|
| 0 | **배포 전에 운영 DB 가 가입·1.0 최신 스키마인지 먼저 확인하고, 아니면 맞춘다.** 운영 서버는 이미 1.0 d2ff088 이다(`vercel.yml` run 37652636150, 10-08 01:30 KST 배포. 10-08 09시에 운영 `privacy.html` 이 d2ff088 판과 바이트 단위로 같은 것도 확인). 134bf0f 이후의 1.0 서버 코드는 그 전 fcd2ccc 배포(run 37615101944, 10-07 20:35 KST)부터 운영 중이다 — 운영에 나간 판 가운데 `take_quota` 를 부르는 것은 fcd2ccc 가 처음(KB 단위)이고, `delete_device` 는 어느 운영 판이든 인자 하나로 부른다. 서버는 `take_quota` 를 부르지 못하면(함수가 없으면 404) 상한 없이 그대로 저장하므로(`api/_supabase.ts` 의 `rpc` 가 null 을 돌려주고 `api/track.ts`·`api/coach.ts` 는 `false` 일 때만 막음), DB 에 `take_quota` 가 없다면 하루 저장 상한은 이번 배포 때가 아니라 fcd2ccc 배포 때부터 **이미** 꺼져 있는 것이다. 작업 기록에는 10-07 오후 가입 dded16c 판을 실행한 뒤 저녁에 5409c46 판(`take_quota` 포함)까지 적용·확인했다고 남아 있지만, 이 줄을 쓰며 운영 DB 를 직접 보지는 않았다 → ②로 확인한 뒤 정한다. ① ✅ 원격 1.0 합치기는 끝남 — 1ee5fe9(d843d33)와 이번 병합(d2ff088)으로 이 브랜치의 `api/track.ts`·`api/admin.ts` 도 `delete_device(p_device)` 를 운영과 같은 인자 하나로 부르고 `take_quota` 는 KB 단위다. 예전 134bf0f 판의 `delete_device(p_device, p_before)` → PostgREST 404 → 502 문제는 이제 없다. fcd2ccc 뒤로 1.0 의 DB 스키마 변경은 없음 ② **먼저** 확인(읽기만): `select p.oid::regprocedure, p.prosrc like '%member_device%' as signup_purge from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname in ('delete_device','take_quota','purge_old_records');` → `delete_device(text)`·`purge_old_records()`·`take_quota(text,integer,bigint)` 세 줄이고 `purge_old_records()` 줄의 `signup_purge` 가 true 면(가입 판 파기 줄까지 있음) ③을 건너뛰고 1번 `ai_report.sql` 만 실행한다 ③ 아니면(`take_quota` 가 없거나, `delete_device(text,timestamp with time zone)` 이 남아 있거나, `signup_purge` 가 false 면) Supabase SQL Editor 에 **가입 브랜치 최신 `supabase/schema.sql`**(origin/feature/signup c3932ab 판 — 5409c46 판과 바이트 단위로 같음(sha256 48b3a388…, 28,523바이트). 가입 판 줄과 1.0 fcd2ccc 줄을 모두 담은 상위 집합이고, `if not exists`·`create or replace`·`on conflict do nothing`·예약 작업을 지우고 다시 만드는 식이라 여러 번 실행해도 되게 쓰여 있음)을 실행하고 ②를 다시 돌린다. 그때 `take_quota` 가 없었다면 「fcd2ccc 배포(10-07 20:35)부터 이 실행까지 하루 저장 상한이 꺼져 있었음」을 실행 날짜와 함께 이 줄에 적어 둔다. 신고 표는 어느 경우든 1번의 `supabase/ai_report.sql` 로 더한다. **이 브랜치의 `schema.sql` 은 운영에 실행하지 말 것** — 그 `purge_old_records()` 에는 가입 판의 `bonus_spent`(탈퇴 1년 지난 보너스 기기)·`member_device`(회원이 없는 기기 이력) 파기 줄이 없어, 실행하면 운영의 매일 파기에서 그 줄이 빠진다(1.0 의 `schema.sql` 도 마찬가지). 운영 서버(d2ff088)도 `delete_device` 를 인자 하나로만 부르므로 ③으로 DB 를 먼저 바꿔도 안전 | 🙋 승인 |
| 1 | Supabase SQL Editor 에 **`supabase/ai_report.sql`** 실행 — `ai_report` 표·인덱스·RLS, 하루 저장 상한 트리거(한국 날짜 300건 · DB 400MB), 신고 전용 1년 파기(`purge_ai_report()` + pg_cron `mylovecoach-purge-report` 매일 03:35). `purge_old_records()` 는 건드리지 않으므로 0번의 `schema.sql` 과 어느 순서로 실행해도 되고, 나중에 어느 판의 `schema.sql` 을 다시 실행해도 신고 파기가 사라지지 않는다. 끝의 확인 쿼리에서 예약 작업 `mylovecoach-purge`·`mylovecoach-purge-report` 둘 다 active 인지 본다 | 🙋 승인 |
| 2 | **돌리기 전에 5번(처리방침 시행일·16번 이력 — 고쳐서 1.0 에 푸시)부터 끝낸다.** 1.0 브랜치에서 `gh workflow run vercel.yml` (api/report · 처리방침 「AI 답변 신고」 · 관리자 페이지 신고 표). **먼저 운영 `/api/coach` 가 Gemini 결제 문제(402 등) 없이 200 인지 확인** — 배포 뒤 동작 확인은 운영이 이미 바뀐 다음에 돈다. 동작 확인은 동의 헤더가 있는 요청·없는 예전 앱 요청·`/api/report`(GET 405) 셋을 본다(예전 앱 요청은 평소 200, 아래 「AI 분석 동의」 7번의 `AI_CONSENT_REQUIRED=1` 을 켠 뒤에는 426 이 정상) | 코드 (승인) |
| 3 | **Play 검토 전에 꼭** 운영 확인: 앱에서 신고 1건 → 관리자 페이지 맨 아래 「AI 답변 신고」 표에 보이는지 → 시험 행 삭제. 표에 「신고 목록을 읽지 못했어요」가 보이면 1번을 안 한 것(그동안 앱 신고는 「저장하지 못했어요」로 실패) | 코드·🙋 |
| 4 | 관리자 페이지에서 주 1회 신고를 보고, 같은 유형이 반복되면 연습 상대역 규칙(`src/lib/ai-tasks.ts`)이나 Gemini 안전 설정(`src/lib/gemini.ts`)을 고친다 | 🙋 팀 |
| 5 | 배포 직전에(2번의 `vercel.yml` 전에) 처리방침(`site/privacy.html`) **시행일과 16번 「방침의 변경」 이력을 실제 배포일에 맞춘다.** 1.0(179de65)이 시행일 「2026년 10월 8일 (개정)」과 10-08·10-07 이력을 적어 두었고 운영(d2ff088)에도 같은 시행일·같은 이력이 나가 있지만, 이 브랜치가 더한 **AI 답변 신고**(2번 「AI 답변 신고」(`#report`)와 그 보관 — 1번 표와 그 아래 두 문단, 2번 AI 전송 문단·국외 이전 머리말과 Vercel·Supabase 행, 5번·6번·10번·11번)는 이력에 없다(국외 이전 머리말에 함께 더한 「팀원 명단 보관」·「문의 메일 처리」는 10-08 이력에 이미 든 국외 이전 표와 맞춘 것). 그대로 배포하면 시행일·이력은 그대로인 채 내용만 바뀐다. 10-08 에 배포하면 10-08 줄에 「AI 답변 신고(2번)와 그 보관·파기(1번·국외 이전 표·5·6·10·11번)」를 더하고, 10-09 이후에 배포하면 시행일을 그날로 바꾸고 그 날짜 줄(예: 「AI 답변 신고(2번)와 그 보관·파기(1번·국외 이전 표·5·6·10·11번)를 추가했습니다.」)을 새로 적는다(10-08 줄은 그대로) | 코드·🙋 |

## AI 분석 동의 (`fix/ai-consent`) — 출시 전에 꼭

심사 중인 iOS 1.0(빌드 116), Play 빌드 113, APK 105, 지금 배포된 웹에는 **AI 분석 동의 시트가 없습니다**. 묻지 않고 대화 캡처·프로필을 Google 로 보내서 애플 지침 5.1.2(i)에 어긋납니다. 이 브랜치를 머지한 빌드로 바꿔야 합니다.

| 순서 | 할 일 | 누가 |
|---|---|---|
| 1 | **맨 먼저** 1.0 의 「버전 출시」를 **수동 출시**로 — 116 이 먼저 승인돼도 출시되지 않게. 심사 대기 중이라 바뀌지 않으면 심사에서 뺀 뒤 바꿈 | 🙋 화면 (또는 API `releaseType=MANUAL`) |
| 2 | 서버 Gemini 키의 Google Cloud 프로젝트에 **결제(Cloud Billing)가 연결된 유료 등급**인지 확인. 무료 등급은 Google 이 입력·출력을 서비스 개선에 쓰고 사람이 검토할 수 있고, 약관상 개인정보를 보내면 안 됨 → 유료로 바꾸거나, 처리방침 2번 표·6번과 동의 시트 「보관」 줄에 그 사실을 적음. 유료면 Google 문서의 보관 기간 근거를 처리방침에 적음 | 🙋 화면 |
| 3 | `fix/ai-consent` 머지 → `vercel.yml` 배포 (웹 + 처리방침 개정판 + 서버). 서버는 이제 Gemini 로만 보내고, `GEMINI_API_KEY` 시크릿이 없으면 배포가 실패함 | 코드 |
| 4 | 새 iOS 빌드 → 1.0 제출에서 116 을 빼고 새 빌드로 바꿔 다시 제출. 아래 심사 메모를 붙임. **이미 구운 117 은 `fix/ai-consent`(3d51388) 판이라 1.0 의 f8b50ef·134bf0f 가 빠져 있다**: 이용 기록에 동의 판(`consentVersion`)을, 코칭 요청에 `x-consent-version` 을 보내지 않아 직접 체크해 동의해도 서버가 204 로 받기만 하고 저장하지 않으며(이용 기록·코칭 기록 0건), AI 답변 신고·철회 삭제 재전송·팀원 확인 머리글도 없다. 앱 동작과 개인정보 쪽 위험은 없음. → 출시용은 이 브랜치까지 합친 1.0 HEAD 로 새로 굽기를 권장(다음 빈 번호 — 118·119 는 TestFlight 전용 무제한 빌드(feat/intro-memory-testflight 3942f26·0a265e5)에, 120 은 d2ff088 에 이미 썼다. 120 에는 f8b50ef·134bf0f·179de65 가 들었지만 AI 답변 신고가 없다). 117 을 그대로 내면 「117 은 iOS 이용 기록이 쌓이지 않고 신고 진입점이 없음」을, 120 을 내면 「신고 진입점이 없음」을 알고 낼 것 | 코드·🙋 |
| 5 | Play 검토에 보낼 AAB·APK 도 이 커밋이 든 빌드로 (113·105 에는 동의 시트가 없음) | 코드 |
| 6 | 예전 첫 화면은 이용 기록 체크박스가 **미리 체크**돼 있었음 → 새 빌드는 그 동의를 「아직 묻지 않음」으로 읽어, 다시 켜야 수집. 10-06 저장을 켠 뒤 쌓인 기록은 미리 체크된 동의로 받은 것이라 **파기할지 결정** → 10-08 결정: 예전 기록은 둔다(10-07 「새 동의만 저장, 예전 기록은 둔다」. 처리방침 4번 「동의 방법」에 보유 기간과 지우는 방법을 적음). 스위치가 꺼진 것으로 보여 「끄면 서버 기록도 지워요」로는 지울 수 없던 빈틈은 1.0 179de65 가 메움 — 판 표시 없는 「동의」로 저장된 기기에 `legacyServerRecords` 를 켜고, 마이 탭 「예전에 보낸 이용 기록 지우기」로 서버 삭제를 요청. 다만 179de65 이전의 동의 판 코드(3d51388, ace5799~d843d33, 그 위의 feat/intro-memory-testflight)로 구운 빌드 — iOS 117(3d51388), TestFlight 118·119(3942f26·0a265e5, ace5799 기반) — 를 한 번이라도 연 기기는 그 판이 이 동의를 null 로 다시 저장해 두어 표시가 켜지지 않는다(코드로 확인) — 그런 기기는 메일 삭제 요청으로 지운다. 운영 웹은 `vercel.yml` 실행 기록상 fcd2ccc 에서 d2ff088 로 바로 넘어가 해당 없음(fcd2ccc 는 동의 판 처리가 없어 미리 체크된 동의를 true 로 두고, d2ff088 이 그 기기에 표시를 켬). 안드로이드는 10-05 뒤로 CI 빌드가 없다. 나중에 파기로 바꾸려면 persist 판은 1 그대로 두고(아래 「되돌리지 말 것」) `src/store/app-store.ts` 의 `merge` 에서 고친다: 지금은 한 번짜리 예전 판 정리(`legacyDeletionChecked` — 꺼 둔 기기·만 14세 미만만 삭제 요청)가 있는데, 거기에만 조건을 더하면 이미 정리를 지난 기기가 빠지므로 `legacyServerRecords` 가 켜진 기기에도 `pendingDeletion` 을 넣는다 | 🙋 팀 |
| 7 | 새 iOS·Android·APK 가 퍼지고 116 을 심사에서 뺀 뒤 Vercel 환경변수 `AI_CONSENT_REQUIRED=1` → 재배포. 동의 헤더(`x-ai-consent`) 없는 예전 앱의 AI 요청을 426 「최신 버전으로 업데이트해 주세요」로 막는다 (끄려면 변수 삭제 + 재배포). 꺼져 있는 동안 헤더 없는 예전 앱은 그 판 처리방침대로 Google 에 동의한 것으로 보고 받는다(`api/coach.ts` 의 `LEGACY_APP_COMPANY` — 보낼 회사 `RELAY_COMPANY` 를 바꾸면 예전 앱도 같이 503). `vercel.yml` 의 배포 뒤 동작 확인은 켠 뒤의 426 을 정상으로 본다. TestFlight 의 예전 빌드 만료, GitHub 의 APK 105 릴리스 내리기도 함께 | 코드·🙋 |

**10-08 진행 상황**: 1 ✅ (수동 출시 MANUAL) · 3 ✅ (ace5799 병합, 10-08 웹 배포) · 6 ✅ 결정 — 예전 기록은 두고, 그 기기는 마이 탭 「예전에 보낸 이용 기록 지우기」로 지울 수 있게 함 · 2 ⏳ 결제 연결 전이라 처리방침 2번에 무료 등급 안내를 적어 둠 — **유료 전환 뒤 그 문단과 10번의 단서를 지울 것** · 4·5·7 진행 중.

### 운영 웹을 fcd2ccc(또는 그 이전) 배포로 되돌리지 말 것

10-07 의 fcd2ccc·663645b 판은 저장 판 2 이고 migrate 가 「판 2 미만이면서 동의가 true 가 아닌 기기」에 서버 기록 삭제를 요청한다. 지금 판(판 1·동의 판 표시)으로 한 번 연 웹 기기를 그 판으로 되돌리면, 미리 체크된 예전 기록이 지워지고(「예전 기록은 둔다」 결정과 반대) 판 2 로 받은 동의·AI 분석 동의가 풀린다.
문제가 생기면 저장소 부분(`version`·`migrate`·`merge`·`partialize`)은 그대로 두고 문제 기능만 되돌린 커밋을 **앞으로** 배포한다.

심사 메모 (1.0 → 앱 심사 정보 → 메모에 추가):

> Before any AI feature sends data, the app shows a consent sheet explaining what is sent (chat screenshots, typed text, profile details of the user and the other person, recent coaching history), who receives it (Google LLC's Gemini API through our relay server hosted on Vercel, or the provider of the user's own API key), why, and how it is kept. Nothing is sent unless the user taps "동의하고 계속" (Agree and continue). If the user declines, AI features stay off and everything else keeps working. Consent can be withdrawn at any time in My tab → "AI 분석 동의" (AI analysis consent).

## App Store — 1.0(빌드 116) 승인됨 · 출시 버튼 대기 (2026-10-08 새벽, 수동 출시라 출시 안 됨)

| 항목 | 상태 |
|---|---|
| 등록 정보·스크린샷(10-05 판 6장)·연령 등급·심사 메모 | ✅ 완료 |
| 판매 국가 (대한민국) · 무료 | ✅ 완료 |
| 빌드 116 연결 | ✅ 완료 |
| 인앱결제: 주간 프리미엄 · 평생 프리미엄 | ✅ 버전과 함께 심사 대기 |
| 지원 URL·개인정보 처리방침 URL | ✅ 완료 |
| 「앱이 수집하는 개인정보」 설문 | ✅ 게시 (구입 내역 포함 8개 항목, 추적 없음) |
| 유료 앱 계약 | ✅ 활성화됨 |
| 심사 제출 | ✅ 10-05 제출 → **10-08 새벽 승인** (PENDING_DEVELOPER_RELEASE) · 주간 구독·평생권도 APPROVED |
| 출시 방식 | ✅ 수동 출시(MANUAL) — 승인됐지만 출시되지 않음 |

**10-08 사용자 결정: 116 을 먼저 출시하고, AI 분석 동의 등은 1.0.1 업데이트로 바로 낸다.** (출시가 늦어지는 교체보다 빠른 출시가 우선)

1. App Store Connect → 앱 → 1.0 → 「이 버전 출시」 (🙋 화면)
2. 1.0.1 빌드는 이미 만듦 — `app.json` 버전 1.0.1, 기본 브랜치에서 `ios.yml` 실행
3. 출시 확인 뒤 `gh workflow run app-store.yml -f build=<1.0.1 빌드 번호> -f submit=true -f wait_minutes=60` — 1.0.1 버전을 새로 만들고 「새로운 기능」 문구까지 넣어 제출
4. 1.0.1 이 퍼지기 전까지 Vercel `AI_CONSENT_REQUIRED=1` 을 켜지 말 것 (켜면 116 사용자의 AI 기능이 「업데이트하세요」로 막힘). 1.0.1 출시 뒤 켜면 116 사용자를 업데이트로 유도할 수 있음

아래는 결정 전 「교체 후 출시」 순서 (참고용):

**교체 순서 (상품이 승인돼 이제 화면 한 번 + 명령 하나):**
1. App Store Connect 웹 → 앱 → 버전 1.0 페이지 위 안내의 「심사에서 이 버전 제거」 → 제거 (승인된 버전은 API 로 못 뺌 — 끝난 심사 묶음 항목 수정이 404, 10-08 확인). 버전이 DEVELOPER_REJECTED 가 됨
2. `node tools/asc-listing.mjs --build 120 --submit` — 120 연결 + 심사 메모 갱신 + 제출 (빌드 번호 꼭 지정: 118·119 는 TestFlight 전용 무제한). 처음 내는 상품이 묶음에 빠지면 제출을 멈추는 안전장치가 있음(지금은 상품이 승인돼 해당 없음)
3. `node tools/asc-release.mjs` 로 MANUAL·빌드 120 확인 → 승인되면 사람이 「출시」
`app-store-autosubmit.yml` 은 꺼져 있다(disabled_manually) — 다음 버전이 저절로 제출되지 않도록 그대로 둔다.

## Google Play — 길이 두 가지

개인 개발자 계정(2023-11-13 이후 생성)은 프로덕션 전에 **비공개 테스트 12명 이상 × 14일 연속**이 필요합니다.
사업자(조직) 계정은 이 요건이 없습니다. 두 길을 **동시에** 진행해도 됩니다.

### 길 A. 비공개 테스트 14일

| 단계 | 상태 |
|---|---|
| 국가 (대한민국) | ✅ 완료 |
| 테스터 (이메일 목록 5개 전부) · 의견 이메일 | ✅ 완료 |
| 버전 1.0.0 (빌드 113) · 출시 노트 | ✅ 저장됨 |
| 앱 콘텐츠 선언 | ✅ 모두 완료 |
| **한국 개발자 추가 정보** | ✅ 10-06 17:35 저장됨 (사업자등록번호·통신판매업 신고번호·성북구청, 연락처 전화 인증 완료) |
| 검토를 위해 변경사항 14개 전송 | 🙋 **지금 가능** — 게시 개요 버튼 활성(10-06 20:10 확인). 보내기 전에 ①첫 검토 빌드(지금 저장된 113 = 10-01 무료 무제한판, 회의 기능 없음 / 새 `android.yml` 빌드는 플로팅 버블을 빼서 포그라운드 서비스 신고 없이 낼 수 있음 — 대신 위 「AI 답변 신고」 서버 배포가 먼저) ②데이터 보안 설문 갱신(9월판 「저장 안 함」 → 10-06 부터 서버 이용 기록 저장 켜짐, AI 답변 신고 포함 — `docs/APP_PRIVACY.md` 「AI 답변 신고」) 결정. 순서는 아래 「Play 검토 보내기 전 순서」 |

**Play 검토 보내기 전 순서** (`android.yml -f track=internal` 은 **내부 테스트에만** 올린다 — 비공개 테스트(alpha) 출시에는 지금 113 이 저장돼 있어, 그대로 검토를 보내면 동의 시트·AI 답변 신고가 없는 113 이 검토된다)

1. 위 「AI 답변 신고」 0~3번과 5번 (DB·처리방침 이력·서버 배포·운영 신고 확인 — 5번은 2번 배포 전에)
2. 원격 기본 브랜치에 이 브랜치의 `android.yml`(버블 빼기·매니페스트 검사)이 올라갔는지 확인: `gh workflow view android.yml --ref claude/jolly-pascal-tr47bw --yaml | grep floating_bubble`
3. 빌드·내부 테스트 업로드: `gh workflow run android.yml --ref claude/jolly-pascal-tr47bw -f track=internal -f floating_bubble=false` — `floating_bubble=false` 를 늘 적는다(그 입력이 없는 예전 워크플로면 GitHub 이 422 로 실행을 거부해, 버블이 든 AAB 가 검사 없이 올라가지 않음)
4. 내부 테스트의 새 빌드를 비공개 테스트로: `gh workflow run play-closed-test.yml -f dry_run=true` 로 먼저 확인 → `gh workflow run play-closed-test.yml` (또는 콘솔에서 비공개 테스트 출시의 빌드를 새 빌드로 교체). 비공개 테스트 출시에 새 versionCode 가 들어갔는지 콘솔에서 본다
5. 데이터 보안 설문 갱신 저장(②) → 「검토를 위해 변경사항 전송」

**🙋 한국 개발자 추가 정보 (본인만 가능)** — Play Console → 설정 → 개발자 계정 → **계정 세부정보**
- **계정 세부정보 탭** 맨 아래 「한국 개발자의 경우 추가 정보 필요」
  - 사업자 등록 번호
  - 전자상거래 라이선스 번호 = **통신판매업 신고번호**
  - 전자상거래 라이선스 대행사 = 신고한 기관 (예: 서울특별시 성북구청)
- **연락처 세부정보 탭** → 개발자 전화번호 입력 → **문자로 인증**
- 통신판매업 신고를 아직 안 했다면 정부24 「통신판매업 신고」로 신청 (사업장 관할 구청, 보통 1~3일)

> ⚠️ 이 정보가 없으면 **새 빌드 업로드(내부 테스트 포함)도 전부 거부**됩니다
> ("To comply with Korean law, developers in Korea must provide additional information").
> 그동안 갤럭시 테스터는 `android-apk.yml` 로 만든 직접 설치 파일로 받아야 합니다.

이걸 저장하면 게시 개요의 「검토를 위해 변경사항 14개 제출」 버튼이 열립니다.
구글 검토가 끝나면 테스터에게 참여 링크를 보냅니다:
`https://play.google.com/apps/testing/app.mylovecoach.android`

그 뒤 **12명 이상이 참여한 채로 14일** 유지 → 대시보드에서 **프로덕션 액세스 신청**.

> 테스터는 참여를 취소하면 안 됩니다. 14일은 「12명 이상이 계속 참여 중」인 날만 셉니다.
> 데이터 보안 설문은 9월 기준(이용 기록 저장 안 함)입니다. Supabase 를 연결해 실제로 저장을 시작하기 전에 App Store 설문과 같은 내용으로 고쳐야 합니다.

### 길 B. 사업자(조직) 계정으로 전환

같은 Play Console 계정을 그대로 두고 조직용 결제 프로필을 새로 만들어 연결하는 방식입니다. 앱을 옮길 필요는 없습니다.

1. **사업자등록** 이 있어야 합니다 (개인사업자 포함)
2. **D-U-N-S 번호** 발급 — 한국의 유일한 발급 기관은 **NICE디앤비**입니다
   - 무료로 받으려면 애플 개발자 사이트의 [D-U-N-S 조회·신청](https://developer.apple.com/enroll/duns-lookup/) 경로로 신청하면 되고, 같은 번호를 구글에도 씁니다
   - NICE디앤비에 직접 신청하는 경로(dnb1@nicednb.com)는 유료 대행이 섞여 있으니 주의
   - 발급까지 보통 1~3주, 길면 30일
   - 사업자등록증의 상호·주소와 **글자 하나까지 똑같이** 신청해야 구글 인증이 통과합니다
3. Play Console → 설정 → **개발자 계정 → 계정 정보** → 계정 유형 변경 → 조직
4. 조직용 결제 프로필 생성 → D-U-N-S·서류 제출 → 구글 인증 대기
5. 인증이 끝나면 비공개 테스트 없이 프로덕션 출시 가능

> D-U-N-S 발급 + 구글 인증을 합치면 14일보다 오래 걸릴 수도 있습니다. 그래서 길 A 를 먼저 시작해 두는 걸 권합니다.
> 조직 계정은 스토어에 **상호·주소가 공개**됩니다.

## 출처

- [계정 유형 변경 (Play Console 도움말)](https://support.google.com/googleplay/android-developer/answer/13634888?hl=en)
- [신규 개인 개발자 계정의 앱 테스트 요건 (Play Console 도움말)](https://support.google.com/googleplay/android-developer/answer/14151465?hl=en)
- [NICE디앤비 D-U-N-S 발급 안내](https://global.nicednb.com/servOtsInfo.do)
- [국내 개인사업자 D-U-N-S 무료 등록 가이드](https://uxdev.org/entry/%EA%B5%AD%EB%82%B4-%EA%B0%9C%EC%9D%B8%EC%82%AC%EC%97%85%EC%9E%90-D-U-N-S-%EB%B2%88%ED%98%B8-%EB%AC%B4%EB%A3%8C-%EB%93%B1%EB%A1%9D-%EA%B0%80%EC%9D%B4%EB%93%9C-%EC%95%A0%ED%94%8C-%EA%B2%BD%EB%A1%9C%EB%A1%9C-%EB%B0%9C%EA%B8%89%EB%B0%9B%EC%95%84-%EA%B5%AC%EA%B8%80%C2%B7%EC%95%A0%ED%94%8C%EC%97%90%EC%84%9C-%EA%B0%99%EC%9D%B4-%EC%93%B0%EA%B8%B0-%EB%8B%A8-%EA%B5%AC%EA%B8%80%EC%9D%80-D-U-N-S-%EC%97%86%EC%9D%B4%EB%8F%84-%EA%B0%80%EB%8A%A5)
