# 회원가입 (카카오 · Apple · Google) 설정

회원가입과 Google 로그인을 운영 웹에 먼저 적용하는 설정 순서입니다. 기존 `feature/signup`에 Google 로그인을 더하는 작업은 `feat/google-signin-20261008` 브랜치에서 진행합니다. **기존 스토어 앱 1.0(116)은 무로그인 상태를 유지하며, 새 스토어 빌드·제출은 이 작업에 포함하지 않습니다.** 콘솔 설정·실기 검증·배포 완료 여부는 별도로 확인합니다.

## 어떻게 동작하나

```
비회원: 맛보기 1회 ──▶ 다 쓰면 결제 화면 맨 위 「가입하고 무료 3회 더」
                          │ 카카오 / Google / Apple(아이폰만) 로그인 — Supabase Auth
                          ▼
앱 ──▶ POST /api/member (로그인 토큰) ──▶ member_link() : 회원 생성·기기 연결·보너스(회원당·기기당 1회)
                          ▼
회원: 보너스 3회 + 매일 1회 충전          마이 → 로그아웃 · 회원 탈퇴(DELETE /api/member)
```

- `EXPO_PUBLIC_SUPABASE_URL` · `EXPO_PUBLIC_SUPABASE_ANON_KEY` 가 없는 빌드는 가입 화면을 숨기고 예전 규칙(체험 3회 + 매일 1회)을 씁니다.
- 대화 캡처·채팅방은 가입해도 기기에만 저장됩니다. 서버에는 회원 정보(제공자·닉네임·이메일)와 로그인한 기기 ID(`member_device`)가 남고,
  이용 기록 수집에 동의한 기기라면 그 이용 기록(코칭 질문·답 포함)이 회원과 연결됩니다. 탈퇴하면 이어진 기기의 이용 기록과 함께 지웁니다.
- 애플 규정: 아이폰에서 카카오 로그인을 보여 주면 Apple 로그인도 함께 보여 줘야 해서(4.8), Apple 버튼을 위에 둡니다. 계정을 만들 수 있으면 앱 안에서 탈퇴도 돼야 해서(5.1.1(v)) 마이 탭에 「회원 탈퇴」가 있습니다.

## 현황 (2026-10-06)

| 단계 | 상태 |
|---|---|
| Supabase 프로젝트 `mylovecoach` (조직 CRAVING, ref `cridqlgriezwkzevytjs`, 서울) · schema.sql · Vercel 연결 · GitHub 변수 | ✅ |
| Supabase Auth: Site URL·Redirect URLs, Apple(Client ID `app.mylovecoach.ios`) 켬, Email 가입 끔 | ✅ |
| 카카오 앱 「나만의 연애코치」(ID 1599398): 카카오 로그인 ON, 리다이렉트 URI, 닉네임 필수·프로필 사진 선택, 아이콘 | ✅ |
| 카카오 **비즈 앱 전환**(사업자 정보 또는 개인 개발자 본인인증) → 이메일 「선택 동의」 | 🙋 사장님 |
| Supabase Kakao provider 에 REST API 키·클라이언트 시크릿 붙여넣기 + 「Allow users without an email」 | 🙋 사장님 (키 입력) |
| Apple Developer 앱 ID `app.mylovecoach.ios` 에 Sign In with Apple 켬 (기존 In-App Purchase 유지, 기존 배포 프로파일은 무효 → `ios.yml` 의 `fetch-signing-files --create` 가 새로 받음) | ✅ 10-06 |
| 탈퇴 때 연결 끊기 키: Apple **Sign in with Apple 키(.p8)** 만들기 + 카카오 **Admin 키** 파일 → `node tools/set-signup-keys.mjs --p8 … --kakao` (아래 5번) | 🙋 1.1 출시 전 |
| 카카오 연결 해제 웹훅(User Unlinked) → member_delete | 나중에 |

## 1. Supabase (한 번)

1. 프로젝트 생성 후 SQL Editor 에 `supabase/schema.sql` 전체를 붙여넣고 Run (여러 번 실행해도 안전)
2. `%USERPROFILE%\wolha-secrets\mylovecoach-supabase.txt` 에 `SUPABASE_URL=…` / `SUPABASE_SERVICE_ROLE_KEY=…`(secret 키)
   → `node tools/set-analytics-env.mjs --analytics on --deploy`
3. GitHub 저장소 **변수**(공개 값): `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`(publishable/anon 키)
   ```bash
   gh variable set EXPO_PUBLIC_SUPABASE_URL --body "https://<ref>.supabase.co"
   gh variable set EXPO_PUBLIC_SUPABASE_ANON_KEY --body "<publishable 키>"
   ```
4. Authentication → URL Configuration
   - Site URL: `https://mylovecoach.vercel.app`
   - Redirect URLs: `mylovecoach://auth/callback`, `https://mylovecoach.vercel.app/auth/callback`

## 2. 카카오 로그인 🙋 (카카오 계정으로 developers.kakao.com 로그인 필요)

1. 내 애플리케이션 → 애플리케이션 추가: 앱 이름 「나만의 연애코치」, 회사명 「크레이빙」
2. 앱 설정 → 플랫폼 → Web: 사이트 도메인 `https://mylovecoach.vercel.app`
3. 카카오 로그인 → 활성화 ON, Redirect URI: `https://<ref>.supabase.co/auth/v1/callback`
4. 카카오 로그인 → 동의항목: 닉네임(필수), 프로필 사진(선택), 카카오계정(이메일)(선택 — 비즈 앱 전환이 필요하면 사업자 정보로 전환)
5. 보안 → Client Secret 코드 생성 · 활성화
6. Supabase → Authentication → Sign In / Providers → Kakao: Enable, Client ID = **REST API 키**, Client Secret = 5번 코드.
   이메일 동의를 받지 못하면 「Allow users without an email」을 켭니다.

## 3. Apple 로그인

1. Supabase → Providers → Apple: Enable, **Client IDs** 에 `app.mylovecoach.ios` (아이폰 앱의 기기 로그인만 쓰므로 Secret 은 비워 둠)
2. Apple Developer → Identifiers → `app.mylovecoach.ios` → **Sign In with Apple** 체크
   (ASC API 키로도 가능: `bundleIdCapabilities` 에 `APPLE_ID_AUTH`). 기능을 바꾸면 기존 배포 프로비저닝 프로파일이 무효가 되므로
   `ios.yml` 빌드 전에 프로파일을 지우고 새로 받게 한다.
3. `app.json` 에 `ios.usesAppleSignIn: true` 와 `expo-apple-authentication` 플러그인이 들어 있음 (이 브랜치)

## 3-1. Google 로그인 (설정·실기 검증은 별도)

이 브랜치에는 Google 브라우저 OAuth를 추가합니다. **2026-10-08 확인:** Google Cloud의 Web OAuth 클라이언트를 만들었고, Supabase Google을 활성화했습니다. 기존 Apple·Kakao 활성화와 Email 가입 비활성화는 유지했습니다. Google Cloud의 기본 권한 설정과 운영 웹 배포·실제 로그인·회원 탈퇴 검증은 진행 중이므로, 설정 활성화만으로 최종 로그인이 검증됐다고 판단하지 않습니다.

1. Google Cloud의 **Google Auth Platform**에서 사용할 프로젝트를 선택하고 Branding에 앱 이름, 지원 연락처, 홈페이지 `https://mylovecoach.vercel.app`, 개인정보 처리방침 `https://mylovecoach.vercel.app/privacy.html` 등을 등록합니다. Audience와 테스트 사용자/게시 상태는 실제 출시 대상에 맞춥니다.
2. Data Access는 로그인에 필요한 **`openid`, `email`, `profile`**만 사용합니다. 이름·프로필 사진 주소는 제공되는 경우에만 받고, 회원 식별자·이메일·이메일 확인 상태를 로그인에 씁니다.
3. Clients에서 **Web application** OAuth 클라이언트를 준비합니다.
   - Authorized JavaScript origins: `https://mylovecoach.vercel.app`
   - Authorized redirect URIs: **`https://cridqlgriezwkzevytjs.supabase.co/auth/v1/callback`**
   - 앱의 `mylovecoach://auth/callback`은 Google 콘솔의 redirect URI 대신 아래 Supabase 허용 목록에 둡니다.
4. Supabase 프로젝트 `cridqlgriezwkzevytjs` → Authentication → Sign In / Providers → **Google**을 활성화하고 위 OAuth Client ID와 Client Secret을 입력합니다. 값은 승인된 설정 화면에서만 옮기며, 문서·파일·대화·로그에는 기록하지 않습니다. Gemini API 키와 별개의 자격증명입니다.
5. Supabase URL Configuration에서 기존 Site URL과 Redirect URLs를 확인합니다.
   - Site URL: `https://mylovecoach.vercel.app`
   - Redirect URLs: `mylovecoach://auth/callback`, `https://mylovecoach.vercel.app/auth/callback`
   - Apple 활성화(Client ID `app.mylovecoach.ios`)와 Email 가입 비활성화는 유지합니다.
6. 앱은 기존 Supabase **PKCE 및 `/auth/callback` 코드 교환**을 재사용합니다. Google의 별도 데이터 권한과 오프라인 접근(`access_type=offline` / `offline_access`)은 추가하지 않습니다. iOS의 Apple 로그인 버튼도 함께 유지합니다.
7. 검증에서는 Google 로그인 취소 후 복귀, 성공 후 회원 연결·재로그인, 앱 회원 탈퇴를 확인합니다. 콘솔이 아직 비활성화된 상태에서 버튼 코드만으로 로그인이 완료된다고 판단하지 않습니다.

**탈퇴 범위:** 기존 `DELETE /api/member`로 회원·연결된 기기의 이용 기록과 Supabase 로그인 계정을 삭제합니다. **Google OAuth 연결을 취소하는 별도 revoke 호출은 구현돼 있지 않습니다.** Google 계정 자체를 지우지 않으며, 사용자가 Google 측 연결도 지우려면 [Google 계정의 연결된 앱](https://myaccount.google.com/connections)에서 이 앱의 Google 로그인을 사용 중지합니다. 반대로 Google 연결만 해제해도 앱의 저장 데이터가 자동 삭제되는 것은 아닙니다. 기기 ID 없는 AI 답변 신고는 신고 날짜·내용으로 별도 삭제를 요청합니다.

근거: [Supabase Google 로그인](https://supabase.com/docs/guides/auth/social-login/auth-google), [Google OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect), [Google 계정 연결 관리](https://support.google.com/accounts/answer/13533235?hl=ko).

## 4. 웹 회원가입 공개와 추후 스토어 업데이트

- **웹 공개 때**: 이 브랜치의 `site/privacy.html`·`site/delete-data.html`을 회원가입·Google 로그인 코드와 함께 배포하고, Supabase Google provider·리다이렉트 및 웹 로그인·탈퇴를 검증합니다. Google Cloud·Supabase 설정 완료 여부는 위 3-1절의 실제 검증 결과로 따로 기록합니다.
- **회원가입을 포함한 스토어 빌드를 나중에 제출할 때** App Store 「앱이 수집하는 개인정보」의 연락처 정보(이메일 주소·이름), 식별자(사용자 ID)를 앱 기능·사용자에게 연결됨으로 검토합니다. 현재 116의 개인정보 답안이나 출시 상태를 웹 공개만으로 변경하지 않습니다.
- **회원가입을 포함한 Android 빌드를 나중에 배포할 때** Play 「데이터 보안」은 `docs/APP_PRIVACY.md`의 기존 9유형을 바탕으로 회원가입의 이메일·사용자 ID·로그인 기본 프로필 수집을 추가 검토하고, 계정 생성 방식(OAuth)과 계정 삭제 방법(앱 안 「회원 탈퇴」 + 웹 요청 주소)을 갱신합니다. 기존 9유형 저장 상태가 회원가입 공개까지 포함하는 것은 아닙니다.
- 추후 스토어 업데이트 때 `docs/STORE_LISTING.md`·스토어 설명의 무료 안내를 해당 빌드에 맞춥니다(「처음 3회」 → 「맛보기 1회, 가입하면 3회 더 + 매일 1회」).
- `site/privacy.html` 시행일·개정 이력은 실제 웹 배포일에 맞춥니다.
- Supabase Auth 의 로그인 기록(`auth.audit_log_entries`, 로그인 시각·IP 주소)은 탈퇴해도 지워지지 않는다 → 보관 기간을 정해(예: 1년) 지우는 방법을 확인하고
  처리방침 5번 「로그인 기록」에 보관 기간을 적는다. (`purge_old_records` 에 넣으려면 postgres 역할이 auth 표를 지울 수 있는지 먼저 확인 — 안 되면 함수 전체가 실패한다)

## 5. 회원 탈퇴 때 카카오·Apple 연결 끊기 (스토어 회원가입 출시 전 확인)

**2026-10-08 운영 환경변수 메타데이터 확인 결과:** 카카오 연결 해제용 `KAKAO_ADMIN_KEY`는 없고, Apple의 `APPLE_TEAM_ID`·`APPLE_KEY_ID`·`APPLE_PRIVATE_KEY`는 존재합니다(값은 조회·기록하지 않음). 이는 설정의 존재 여부이며 실제 Apple 취소 성공까지 확인한 결과는 아닙니다. 현재 카카오 연결 해제는 키가 없어 건너뛰고, Google revoke는 구현돼 있지 않으므로 웹 회원 탈퇴와 외부 제공사의 연결 해제를 같은 것으로 안내하지 않습니다.

탈퇴(DELETE /api/member)는 ① 데이터베이스 정리(member_delete) → ② 카카오·Apple 연결 끊기 → ③ 로그인 계정 삭제 순서입니다.
①이 실패하면 ③을 하지 않아 다시 시도할 수 있고, ②는 실패해도 탈퇴를 마칩니다(서버 기록에만 남김). 키가 없으면 ②를 건너뜁니다.

- **Apple** (App Store 심사 기준 5.1.1(v): Apple 로 가입한 계정을 지울 때 토큰을 취소해야 함)
  1. Apple Developer → Keys → + → 이름(예: `mylovecoach Sign in with Apple`) → 「Sign in with Apple」 체크 → Configure 에서 Primary App ID `app.mylovecoach.ios` → Save → Continue → Register → `.p8` 내려받기(한 번만 가능).
     기존 「Wolha」 키(AJ962XQS37)는 월하 앱 ID 에 묶여 있어 쓸 수 없다.
  2. `node tools/set-signup-keys.mjs --p8 "$env:USERPROFILE\Downloads\AuthKey_<키ID>.p8"` (PowerShell — 윈도우 터미널·VS Code 기본) → `APPLE_TEAM_ID`(apns-key.txt 의 TEAM_ID)·`APPLE_KEY_ID`·`APPLE_PRIVATE_KEY` 를 Vercel 에 올리고 .p8 을 wolha-secrets 에 보관.
     - cmd: `node tools/set-signup-keys.mjs --p8 "%USERPROFILE%\Downloads\AuthKey_<키ID>.p8"`
     - Git Bash: `node tools/set-signup-keys.mjs --p8 "$USERPROFILE/Downloads/AuthKey_<키ID>.p8"`

     Apple 은 진짜 인증 코드 없이는 키가 맞는지 알려 주지 않으므로, 1.1 테스트 빌드에서 Apple 계정으로 가입 → 탈퇴해 서버 기록에 `apple=failed` 가 없는지 본다.
  3. 앱은 아이폰에서 Apple 회원이 탈퇴할 때 Apple 확인 창을 한 번 더 띄워 받은 코드를 보냅니다. 서버가 그 코드로 토큰을 받아 `/auth/revoke` 를 부릅니다.
- **카카오**: 카카오 디벨로퍼스 → 앱 → 앱 키 → **Admin 키**를 `wolha-secrets/mylovecoach-kakao.txt` 에 `KAKAO_ADMIN_KEY=…` 한 줄로 저장 →
  `node tools/set-signup-keys.mjs --kakao` (읽기 전용 사용자 목록 API 로 키를 확인한 뒤 올림). 서버는 탈퇴 때 `POST https://kapi.kakao.com/v1/user/unlink`(target_id_type=user_id, 카카오 회원번호)를 부릅니다.
- 둘 다 한 번에: `node tools/set-signup-keys.mjs --p8 <경로> --kakao`. 확인만 하려면 `--dry-run`. 환경변수는 다음 배포부터 반영된다.
- 키는 비밀값이라 채팅에 붙여넣지 않는다. 자동 모드는 키 생성·입력(비밀 저장소 쓰기)을 막으므로 위 1번과 키 파일 저장, 도구 실행은 사용자가 직접 한다.
