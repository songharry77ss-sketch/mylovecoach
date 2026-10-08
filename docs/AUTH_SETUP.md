# 회원가입 (카카오 · Apple · Google) 설정

회원가입·Google 로그인은 기본 브랜치에 병합됐습니다(`81b5f29`, 2026-10-08). 운영 웹 적용과 새 iOS·Android 테스트 빌드 준비를 구분합니다. **현재 스토어의 무가입 빌드에 웹 회원가입이 소급해서 추가되는 것은 아닙니다.**

## 확인된 상태 (2026-10-08)

| 구분 | 상태 |
|---|---|
| Supabase 프로젝트 | `mylovecoach`, 조직 CRAVING, ref `cridqlgriezwkzevytjs`; 기존 회원 스키마·신고 표와 서버 연결 확인 기록 있음 |
| Supabase 로그인 제공자 | Apple·Kakao·Google 활성화, Email 가입 비활성화 유지; Apple Client ID `app.mylovecoach.ios` |
| Google | Web OAuth 클라이언트 생성·기본 `openid email profile` 설정, 계정 선택 화면까지 진입 확인; 최종 회원 연결·재로그인·탈퇴는 실기 검증 필요 |
| Google 브랜딩 | 홈페이지 소유권 확인이 미완료라는 자동 검사 안내 확인; Search Console 소유권 확인 후 콘솔이 안내한 반영 시간(24시간)을 기다려 재검사·게시 필요 |
| Kakao | 제공자 활성화와 카카오 앱 ID 1599398 확인; 비즈 앱 표시·이메일 선택 동의의 최종 상태는 별도 확인 필요 |
| Supabase 감사 로그 | FREE 플랜, `Write audit logs to the database` 꺼짐, `auth.audit_log_entries` 0행 확인; 외부 Auth Audit Logs는 요금표의 Free 1시간 기준 |
| Apple 설정 | 앱 ID의 Sign in with Apple 설정 및 빌드 플러그인 있음; 실제 가입·토큰 취소는 새 iOS 빌드에서 검증 필요 |
| App Store | 1.0은 `READY_FOR_SALE`; 1.0.1은 `WAITING_FOR_REVIEW`·`MANUAL`; 최신 빌드 121은 `VALID`, 외부 TestFlight 그룹에는 119까지 연결됨 |
| Play | API에서 internal·alpha 트랙의 116이 `completed`; 콘솔 게시·검토 진행 및 설치 가능 여부는 API 트랙 상태와 별도로 확인 |
| 다음 빌드 | 회원가입·Google 통합 테스트 빌드는 아직 이 문서에서 완료로 기록하지 않음; 번호·실행·설치·로그인 결과를 각각 확인 |

기존 Apple·Kakao 설정과 Email 가입 비활성화를 유지합니다. 키·시크릿 값은 설정 화면 사이에서만 옮기며 문서·파일·채팅·로그에 출력하거나 저장하지 않습니다. 이미 있는 키를 설정 확인 목적으로 재발급하지 않습니다.

## 어떻게 동작하나

- 가입을 지원하는 빌드: 비회원 맛보기 1회 → 선택 가입 시 보너스 3회 + 매일 1회. 보너스는 회원당·기기당 한 번입니다.
- `EXPO_PUBLIC_SUPABASE_URL`·`EXPO_PUBLIC_SUPABASE_ANON_KEY`가 없는 빌드는 가입을 숨기고 예전 무료 규칙(체험 3회 + 매일 1회)을 사용합니다.
- 카카오·Google은 브라우저 인증 후 Supabase PKCE로 복귀합니다. iOS는 Apple 기기 로그인도 제공합니다.
- 로그인 후 `POST /api/member`가 `member_link()`를 호출해 회원과 기기를 연결합니다. 로그아웃은 이 기기의 세션만 지웁니다.
- 회원 표에는 제공자·닉네임·이메일, 인증 서비스에는 계정 식별자와 제공되는 기본 프로필(이름·프로필 사진 주소·이메일 확인 상태 등)이 남을 수 있습니다. 프로필 사진 파일은 별도로 저장하지 않습니다.
- 채팅방·캡처는 기기에 보관합니다. 이용 기록 수집에 따로 동의했다면 코칭 질문·답 등의 기록이 서버에도 저장되고 회원과 연결됩니다. 가입 자체를 이용 기록 수집 동의로 처리하지 않습니다.

## Supabase와 제공자 설정 확인

1. Site URL은 `https://mylovecoach.vercel.app`, 허용 Redirect URLs는 `mylovecoach://auth/callback`과 `https://mylovecoach.vercel.app/auth/callback`입니다.
2. 카카오와 Google의 OAuth 제공자 콜백은 `https://cridqlgriezwkzevytjs.supabase.co/auth/v1/callback`입니다. 앱의 딥링크를 이 제공자 콜백 대신 넣지 않습니다.
3. Kakao는 기존 REST API 키·활성화된 클라이언트 시크릿을 쓰며, 이메일 미제공 가입을 허용합니다. 닉네임 필수·사진 선택·이메일 선택 동의와 비즈 앱 상태는 Kakao 콘솔에서 확인합니다.
4. Google Web OAuth의 JavaScript origin은 `https://mylovecoach.vercel.app`입니다. 기본 `openid`·`email`·`profile`만 요청하며 추가 데이터 권한이나 `offline_access`/`access_type=offline`은 요청하지 않습니다.
5. Apple은 iOS 기기 로그인용 Client ID `app.mylovecoach.ios`와 앱의 Sign in with Apple capability를 유지합니다. `app.json`의 `usesAppleSignIn`·`expo-apple-authentication` 및 새 프로비저닝 프로파일을 확인합니다.
6. 저장 전 각 입력칸을 확인합니다. 브라우저 자동완성이 프로젝트 이름·비밀번호 등으로 덮어쓴 값이 없어야 합니다. 코드나 콘솔 설정의 존재만으로 로그인 성공을 판단하지 않습니다.

Google 기본 로그인 권한은 브랜딩 미검증만으로 일괄 차단되거나 민감 권한용 100명 제한을 받지는 않습니다. 앱 이름·로고를 표시하려면 소유권 확인·브랜딩 검증·게시를 마쳐야 합니다. 계정 선택 화면 도달은 최종 로그인 성공 검증과 다릅니다. [앱 상태](https://developers.google.com/identity/protocols/oauth2/production-readiness/overview), [브랜딩 검증](https://developers.google.com/identity/protocols/oauth2/production-readiness/brand-verification).

## 새 테스트 빌드와 스토어 제출 전 확인

통합 작업 코드에는 가입 카드의 약관·개인정보 링크, 탈퇴 시 구독 별도 취소 안내와 구독 관리 접근, 공개 정책의 감사 로그 구분을 반영했습니다. 같은 채팅방의 과거 대화·코칭 요청 맥락 전송 안내도 AI 동의와 정책에 맞췄습니다. **웹 재배포와 실제 회원가입·탈퇴 검증은 아직 미완료**이며 코드 반영과 운영 검증을 구분합니다.

- 빌드 번호는 실제 사용된 번호를 조회한 뒤 명시합니다. 현재 기록상 iOS는 121보다 큰 미사용 번호, Android는 116보다 큰 미사용 versionCode가 필요합니다. 각 워크플로의 기본 `100 + 실행 번호`는 서로 연동되지 않습니다.
- 가입용 빌드 변수 두 개와 운영 API 주소가 주입됐는지 값 노출 없이 확인합니다. iOS·Android에서 로그인 취소와 앱 복귀, 성공 후 회원 연결, 재실행·재로그인, 보너스 중복 방지를 검증합니다.
- iOS의 Apple 로그인 버튼·가입·탈퇴를 확인하고, Google·Kakao 브라우저 인증의 딥링크 복귀를 각 기기에서 확인합니다.
- 가입 전에 약관·개인정보 처리방침을 열 수 있는 경로, 선택 가입 안내, AI 분석 동의·이용 기록 선택 동의가 서로 구분되는지 확인합니다.
- App Store의 연락처 정보(이메일 주소·이름), 사용자 ID 및 기본 프로필 수집을 검토하고 Play의 OAuth 계정 생성·이메일·사용자 ID·계정 삭제 답안을 갱신합니다. 현재 답변과 다음 빌드 초안은 [APP_PRIVACY.md](APP_PRIVACY.md)에 구분합니다.
- 스토어 설명·심사 메모는 [STORE_LISTING.md](STORE_LISTING.md)의 다음 회원가입 빌드용 초안을 사용합니다. 기존 116·121의 제출 정보를 새 빌드 검증 없이 덮어쓰지 않습니다.
- 웹과 새 빌드의 완료 여부, 스토어 검토 제출·승인·출시, TestFlight 외부 그룹 연결은 각각 따로 기록합니다.

## 회원 탈퇴와 로그인 제공사 연결

`DELETE /api/member`는 ① `member_delete()`로 회원·연결된 기기의 이용 기록 정리 → ② 가능한 제공자 연결 해제 시도 → ③ Supabase 로그인 계정 삭제 순서입니다. ①이 실패하면 계정을 먼저 지우지 않아 재시도할 수 있습니다. 가입 보너스를 받은 기기의 무작위 ID·지급 시각은 중복 지급 방지를 위해 탈퇴 후 1년 보관합니다. 식별자 없는 AI 신고는 날짜·내용으로 별도 삭제를 요청합니다.

2026-10-08 운영 환경변수의 **존재 여부만** 확인한 기록: Kakao 연결 해제용 `KAKAO_ADMIN_KEY`는 없고, Apple의 `APPLE_TEAM_ID`·`APPLE_KEY_ID`·`APPLE_PRIVATE_KEY`는 있습니다. 실제 취소 성공을 확인한 결과는 아닙니다.

- **Apple:** 기기 확인에서 받은 인증 코드로 서버가 토큰 취소를 시도합니다. 확인 창을 취소하면 탈퇴를 멈추지만 그 밖의 오류·코드 미수신 때는 취소를 건너뛰고 탈퇴가 진행될 수 있으므로, 새 테스트 빌드에서 실제 취소 성공과 실패 대응을 확인합니다. [Apple 계정 삭제 안내](https://developer.apple.com/help/app-review/guideline-reference/5-1-1-account-deletion).
- **Kakao:** 현재 확인 기록상 Admin 설정이 없어 연결 해제를 건너뜁니다. 카카오 계정의 연결된 서비스에서 별도로 해제하는 방법을 안내합니다.
- **Google:** 별도 revoke 호출은 구현되지 않았습니다. [Google 계정의 연결된 앱](https://myaccount.google.com/connections)에서 이 앱의 Google 로그인을 사용 중지할 수 있습니다. 제공사 연결 해제와 앱 회원·기록 삭제는 서로 대체하지 않습니다.
- **구독:** 회원 탈퇴로 스토어 자동갱신 구독이 취소되지 않습니다. 탈퇴 전에 결제 지속 여부와 구독 관리 경로를 안내하고, 계정 삭제를 구독 만료 때까지 강제로 미루지 않습니다.
- **웹 삭제 요청:** 앱을 다시 설치하지 않아도 `https://mylovecoach.vercel.app/delete-data.html`에서 요청 방법을 찾을 수 있어야 합니다. [Play 계정 삭제 요구사항](https://support.google.com/googleplay/android-developer/answer/13327111?hl=en).

## Supabase 로그인 감사 로그 — 운영 상태 확인 (2026-10-08)

[공식 Auth Audit Logs 문서](https://supabase.com/docs/guides/auth/audit-logs)는 외부 로그 저장소와 선택적인 Postgres `auth.audit_log_entries` 저장을 구분합니다. 로그인·가입·토큰 갱신·로그아웃 등 인증 사건과 계정·IP 관련 정보가 기록되며, 대시보드의 `Write audit logs to the database`에서 DB 기록을 켜거나 끌 수 있습니다.

운영 화면과 읽기 전용 SQL로 다음을 확인했습니다. 설정·행 삭제·예약 작업은 변경하지 않았습니다.

| 확인 항목 | 결과 |
|---|---|
| 프로젝트 요금제 | FREE |
| `Write audit logs to the database` | 꺼짐 |
| `auth.audit_log_entries` | 0행 |
| public 스키마의 감사 로그 정리 함수 | 0개 |
| 기존 정리 예약 | 이용 기록·신고 cron 2개 모두 활성 |

2026-10-08 [공식 요금표](https://supabase.com/pricing)는 **Auth Audit Logs**를 Free 1시간 / Pro 7일 / Team 28일로 안내하고 Enterprise의 일수는 명시하지 않습니다. 현재 운영의 외부 Auth Audit Logs는 **Free 1시간 기준**으로 안내하며 회원 정보의 탈퇴 시 삭제와 구분합니다. 별도의 **API·Database 로그** 항목(Free 1일 등)을 Auth Audit Logs에 적용하지 않습니다.

현재 DB 감사 로그 저장이 꺼져 있고 행도 없으므로, 이 테이블의 과거 행 파기 기간이 미정이라는 문제는 확인 시점의 운영 상태에 해당하지 않습니다. 다만 DB 저장을 나중에 켜면 별도의 보관·파기 기준을 정해야 합니다. 공식 Auth 문서에는 DB 감사 행의 기본 자동삭제 기간이 명시돼 있지 않으므로 외부 로그 1시간을 DB 행 삭제 주기로 해석하지 않습니다.

공개 처리방침과 삭제 안내에는 **회원 정보와 별도인 인증 보안 로그**, 현재 외부 로그의 Free 1시간 기준, DB 별도 저장 꺼짐을 구분합니다. 회원 탈퇴가 외부 로그를 즉시 모두 삭제한다는 뜻으로 안내하지 않습니다. 이 확인은 제공사 내부의 모든 보안 기록·백업까지 같은 시간에 파기되는 것을 검증한 결과는 아닙니다.

추가 근거: [Supabase Google 로그인](https://supabase.com/docs/guides/auth/social-login/auth-google), [Google OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect).
