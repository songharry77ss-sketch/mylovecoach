# 회원가입 (카카오 · Apple · Google) 설정

회원가입·Google 로그인은 운영 웹에 배포했으며, 최신 운영 소스는 `32e63f662cf24df36caf6386c5f7014242588c18`입니다. Apple 탈퇴 보완 등을 포함한 [PR #7](https://github.com/songharry77ss-sketch/mylovecoach/pull/7)은 병합됐고 2026-10-08 카카오 설정과 로그인 화면 진입도 재확인했습니다. 운영 웹 적용과 새 iOS·Android 테스트 빌드 준비를 구분합니다. **현재 스토어의 무가입 빌드에 웹 회원가입이 소급해서 추가되는 것은 아닙니다.**

## 확인된 상태 (최신 스토어 조회 2026-10-09)

| 구분 | 상태 |
|---|---|
| Supabase 프로젝트 | `mylovecoach`, 조직 CRAVING, ref `cridqlgriezwkzevytjs`; 기존 회원 스키마·신고 표와 서버 연결 확인 기록 있음 |
| Supabase 로그인 제공자 | 공개 설정에서 Apple·Kakao·Google 활성화, Email 가입 비활성화 재확인; Apple Client ID `app.mylovecoach.ios` |
| Google | Web OAuth 클라이언트 생성·기본 `openid email profile` 설정, 계정 선택 화면까지 진입 확인; 최종 회원 연결·재로그인·탈퇴는 실기 검증 필요 |
| Google 브랜딩 | 홈페이지 소유권 확인이 미완료라는 자동 검사 안내 확인; Search Console 소유권 확인 후 콘솔이 안내한 반영 시간(24시간)을 기다려 재검사·게시 필요 |
| Kakao | 앱 1599398 「나만의 연애코치」의 비즈 앱 표시 확인. 닉네임 필수·프로필 사진 선택·이메일 선택, 이메일 동의 목적 「회원 식별 및 계정 안내」 확인. REST 설정 5779198의 클라이언트 시크릿 활성화 스위치 2개 ON·등록 콜백 일치 확인. Supabase 인증에서 `prompt=login`을 추가한 검증도 카카오 로그인 화면에 도달했으며 KOE 오류 없음·실제 가입 미진행 |
| Supabase 감사 로그 | FREE 플랜, `Write audit logs to the database` 꺼짐, `auth.audit_log_entries` 0행 확인; 외부 Auth Audit Logs는 요금표의 Free 1시간 기준 |
| Apple 설정 | 앱 ID의 Sign in with Apple 설정 및 빌드 플러그인 있음; 실제 가입·토큰 취소는 새 iOS 빌드에서 검증 필요 |
| App Store | 10-09 API에서 1.0.1(121) `READY_FOR_SALE`·`AFTER_APPROVAL` 확인. 1.0.2 초안은 `PREPARE_FOR_SUBMISSION`·`MANUAL`로 생성하고 한국어 새 소식만 저장·일치 검증; 빌드 미연결. 최신 업로드 빌드는 여전히 121 `VALID` |
| App Store 개인정보 | 현재 무가입 버전의 9유형 정정 게시와 새로고침 후 목적·모든 유형 신원 연결/추적 안 함 확인. 가입용 이메일·사용자 ID를 더한 1.0.2의 11유형은 미반영 |
| Play | Alpha 116과 기존 9유형 답안은 출시됨. 이후 진단 필수 정정 1건 저장·자동 사전 검사 완료·검토 미전송. Production 참여자 0명, 정식 출시 신청 비활성 |
| 다음 빌드 | 1.0.2 서명 빌드 iOS 122(TestFlight `VALID`, 그룹 미연결)·Android 117(Play 내부 테스트) 업로드 완료(10-09). 실제 가입·로그인·탈퇴 실기 검증은 이 빌드로 진행 |

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
3. Kakao는 기존 REST API 키·활성화된 클라이언트 시크릿을 쓰며, 이메일 미제공 가입을 허용합니다. 10-08 카카오 콘솔에서 비즈 앱, 닉네임 필수·사진 선택·이메일 선택과 이메일 동의 목적을 확인했습니다. REST 설정의 등록 콜백은 예상 콜백과 일치하는지 비교 결과만 확인했고, 키·시크릿 값은 읽거나 출력하지 않았으며 재발급하지 않았습니다.
4. Google Web OAuth의 JavaScript origin은 `https://mylovecoach.vercel.app`입니다. 기본 `openid`·`email`·`profile`만 요청하며 추가 데이터 권한이나 `offline_access`/`access_type=offline`은 요청하지 않습니다.
5. Apple은 iOS 기기 로그인용 Client ID `app.mylovecoach.ios`와 앱의 Sign in with Apple capability를 유지합니다. `app.json`의 `usesAppleSignIn`·`expo-apple-authentication` 및 새 프로비저닝 프로파일을 확인합니다.
6. 저장 전 각 입력칸을 확인합니다. 브라우저 자동완성이 프로젝트 이름·비밀번호 등으로 덮어쓴 값이 없어야 합니다. 코드나 콘솔 설정의 존재만으로 로그인 성공을 판단하지 않습니다.

Google 기본 로그인 권한은 브랜딩 미검증만으로 일괄 차단되거나 민감 권한용 100명 제한을 받지는 않습니다. 앱 이름·로고를 표시하려면 소유권 확인·브랜딩 검증·게시를 마쳐야 합니다. 계정 선택 화면 도달은 최종 로그인 성공 검증과 다릅니다. [앱 상태](https://developers.google.com/identity/protocols/oauth2/production-readiness/overview), [브랜딩 검증](https://developers.google.com/identity/protocols/oauth2/production-readiness/brand-verification).

## 새 테스트 빌드와 스토어 제출 전 확인

가입 카드의 약관·개인정보 링크, 탈퇴 시 구독 별도 취소 안내와 구독 관리 접근, 감사 로그 구분, 같은 채팅방의 과거 대화·코칭 맥락 전송 안내 및 Apple 수동 탈퇴 경로를 운영 웹/API에 반영했습니다. 최신 [배포 실행 37782999282](https://github.com/songharry77ss-sketch/mylovecoach/actions/runs/37782999282)은 성공했고, 배포 `dpl_EeJw2ZUHPeULw6o6CUZWpMVenam2`는 `READY`, 공개 별칭의 SHA는 위 운영 소스와 일치합니다. 운영 문구 HTTP 200과 Google 계정 선택·Kakao 로그인 화면 진입을 확인했습니다. **실제 회원가입·회원 연결·재로그인·탈퇴는 아직 검증하지 않았습니다.** 전체 인가 리다이렉트 URL과 키·시크릿은 문서·로그에 저장하지 않습니다.

- 빌드 번호는 실제 사용된 번호를 조회한 뒤 명시합니다. 현재 기록상 iOS는 121보다 큰 미사용 번호, Android는 116보다 큰 미사용 versionCode가 필요합니다. 각 워크플로의 기본 `100 + 실행 번호`는 서로 연동되지 않습니다.
- 가입용 빌드 변수 두 개와 운영 API 주소가 주입됐는지 값 노출 없이 확인합니다. iOS·Android에서 로그인 취소와 앱 복귀, 성공 후 회원 연결, 재실행·재로그인, 보너스 중복 방지를 검증합니다.
- iOS의 Apple 로그인 버튼·가입·탈퇴를 확인하고, Google·Kakao 브라우저 인증의 딥링크 복귀를 각 기기에서 확인합니다.
- 가입 전에 약관·개인정보 처리방침을 열 수 있는 경로, 선택 가입 안내, AI 분석 동의·이용 기록 선택 동의가 서로 구분되는지 확인합니다.
- App Store 현재 공개 답안은 메시지·사진 연결·맞춤 코칭 목적을 정정한 9유형입니다. 새 가입 빌드의 이메일 주소·사용자 ID 2유형과 Play의 OAuth 계정 생성·계정 삭제 답안은 제출 버전과 맞춰 별도로 반영합니다. 현재 게시 답안과 다음 11유형 초안은 [APP_PRIVACY.md](APP_PRIVACY.md)에 구분합니다.
- 스토어 설명·심사 메모는 [STORE_LISTING.md](STORE_LISTING.md)의 다음 회원가입 빌드용 초안을 사용합니다. 기존 116·121의 제출 정보를 새 빌드 검증 없이 덮어쓰지 않습니다.
- 웹과 새 빌드의 완료 여부, 스토어 검토 제출·승인·출시, TestFlight 외부 그룹 연결은 각각 따로 기록합니다.

## 회원 탈퇴와 로그인 제공사 연결

`DELETE /api/member`는 인증된 회원의 Apple 연결이 있으면 먼저 자동 취소 성공을 확인하거나 명시적인 수동 해제 안내 확인을 요구합니다. 이 조건을 충족한 뒤 `member_delete()`로 회원·연결 기기의 이용 기록 정리 → 가능한 카카오 연결 해제 시도 → Supabase 로그인 계정 삭제 순서로 진행합니다. Apple 자동 취소 실패 시 회원을 보존하고 재시도·수동 안내 경로를 제공합니다. 데이터 정리가 실패하면 로그인 계정을 먼저 지우지 않아 재시도할 수 있습니다. 가입 보너스를 받은 기기의 무작위 ID·지급 시각은 중복 지급 방지를 위해 탈퇴 후 1년 보관합니다. 식별자 없는 AI 신고는 날짜·내용으로 별도 삭제를 요청합니다.

2026-10-08 운영 환경변수의 **존재 여부만** 확인한 기록: Kakao 연결 해제용 `KAKAO_ADMIN_KEY`는 없고, Apple의 `APPLE_TEAM_ID`·`APPLE_KEY_ID`·`APPLE_PRIVATE_KEY`는 있습니다. 실제 취소 성공을 확인한 결과는 아닙니다.

- **Apple:** 기기 확인에서 받은 인증 코드로 서버가 계정 일치를 확인하고 토큰 취소를 시도합니다. 확인 창 취소는 탈퇴를 중단하며, 코드 미수신·자동 취소 실패 때도 자동으로 회원을 지우지 않습니다. 재시도하거나 [수동 연결 해제 안내](https://support.apple.com/102571)를 확인한 뒤 별도 최종 확인으로 회원 삭제를 요청할 수 있습니다. 수동 회원 삭제는 Apple 자동 연결 해제 성공을 뜻하지 않습니다. 이 보완은 운영 웹/API에 배포됐지만 실제 계정의 취소·탈퇴 성공은 새 테스트 빌드에서 검증해야 합니다. [Apple 계정 삭제 안내](https://developer.apple.com/help/app-review/guideline-reference/5-1-1-account-deletion).
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
