# 나만의 연애코치

대화 캡처를 올리면 상대에게 맞춘 답장과 호감 온도를 알려주는 앱. Expo SDK 57 / React Native 0.86 / expo-router.

**모든 글은 한국어로.** 답변, 중간 보고, 커밋 메시지, 코드 주석, 도구 실행 설명까지 전부.

## 어디서 작업하느냐에 따라 할 수 있는 일이 다르다

| | PC (로컬) | 휴대폰·클라우드 세션 |
|---|---|---|
| 코드 수정·검사·커밋 | 가능 | 가능 |
| 빌드·배포·스토어 작업 | 로컬 스크립트 또는 워크플로 | **워크플로만** |
| 스토어 열쇠 | `~/wolha-secrets` | 없음 (GitHub 시크릿에만 있음) |

클라우드 세션에는 `~/wolha-secrets` 가 없다. `tools/*.mjs` 를 직접 실행하면 열쇠를 못 찾아 실패한다.
휴대폰에서는 **반드시 `gh workflow run`** 으로 처리할 것. 모든 작업에 대응하는 워크플로가 있다.

## 자주 쓰는 명령

```bash
# 지금 어디까지 됐는지 한 번에 보기 (웹·Play·TestFlight·설치 링크)
gh workflow run status.yml

# 배포
gh workflow run vercel.yml                    # 웹 + API
gh workflow run ios.yml -f build_number=<미사용번호> # TestFlight
gh workflow run android.yml -f track=internal -f version_code=<미사용번호> -f floating_bubble=false # Play 내부 테스트
gh workflow run android-apk.yml               # 플레이스토어 없이 바로 설치할 APK
gh workflow run app-store.yml -f build=<검증한빌드번호> -f wait_minutes=60 # 등록 정보 갱신 + 빌드 연결
# 심사 제출은 별도 작업이다. app-store-autosubmit.yml 은 disabled_manually 상태를 유지한다.

# Play 비공개 테스트 (개인 계정은 12명 × 14일 해야 프로덕션 가능)
gh workflow run play-closed-test.yml -f version_code=<검증한빌드번호> -f dry_run=true # 검증만
# 실제 반영은 send_for_review=true 를 별도로 지정해야 하며, 대기 중인 다른 변경도 검토로 넘어갈 수 있다.

# 테스터
gh workflow run testflight-link.yml -f action=on -f limit=500   # 아이폰 공개 초대 링크
gh workflow run testflight-testers.yml -f emails=a@b.com        # 이메일로 초대

# 결과 보기 — 요약에 링크와 상태가 정리돼 나온다
gh run list --limit 5
gh run view <id> --log-failed
```

## 검사 (코드를 고쳤으면 커밋 전에 셋 다)

```bash
npx tsc --noEmit && npx eslint src --max-warnings=0 && npx jest
```

## 구조

- `src/app/` — 화면 (expo-router). 첫 화면은 `start.tsx`(시연 루프 애니메이션 `components/fx/demo-reel.tsx`), 채팅은 `crush/[id]/index.tsx`
  - 탭: 채팅 `(tabs)/index` · 연애 연습 `(tabs)/practice` · 속마음 `(tabs)/tips` · 마이 `(tabs)/my`
  - 상대 분석 보고서 `crush/[id]/report`, 연습 대화 `practice/[id]`·`practice/custom`, 속마음 풀이 `mind`, 빠른 코칭 `quick`(플로팅 버블·`mylovecoach://quick` 이 여는 곳), KKTI 테스트 `kkti/`
- `src/components/coach/` — 결과 카드(`analysis-card.tsx`), 답장 스와이프(`reply-carousel.tsx`), 누적 온도계(`heat-gauge.tsx`), 입력창(`composer.tsx`)
- `src/components/fx/celebration.tsx` — 하트·꽃가루 효과 (`useCelebrate()`), `src/lib/haptics.ts` — 진동 패턴 모음 (마이 탭에서 끌 수 있음)
- `src/lib/coach-schema.ts` — 코칭 요청·응답 스키마와 프롬프트(호칭·존댓말·이모지·누적 온도). 앱과 서버가 같이 쓴다
- `src/lib/ai-tasks.ts` · `ai-schemas.ts` — 모드별(coach·report·mind·practice) 요청·프롬프트·출력. 서버는 `mode` 로 나눠 처리하고, mode 가 없으면 예전 앱의 코칭 요청
- `src/store/app-store.ts` — zustand + AsyncStorage. 비밀 상담(`crush.secret`)은 `partialize` 에서 빠져 저장되지 않는다
- `src/lib/billing/` — 요금제 4종: 주간·평생(스토어 구매 내역으로 판정) + 하루 이용권·횟수권(소모성, 기기 지갑 `wallet` 에 충전)
- `modules/floating-bubble/` — 안드로이드 플로팅 버블 로컬 Expo 모듈 (iOS·웹은 아무것도 안 함, 스토어 빌드에서는 빠짐 — 아래 「알아둘 함정」)
- `api/` — Vercel 서버리스 (`coach.ts` 가 Gemini 호출, `track.ts`·`admin.ts` 는 이용 기록, `team.ts` 는 관리자가 허용한 팀원 무제한 확인 — `docs/ANALYTICS_SETUP.md`, `report.ts` 는 AI 답변 신고 — 앱의 `components/coach/ai-report-sheet.tsx`, 플레이 생성형 AI 정책상 필수)
- `tools/` — 스토어 자동화 스크립트. 워크플로가 이걸 불러 쓴다
- `docs/TESTER_GUIDE.md` — 테스터에게 보낼 안내문과 설치 링크, `docs/MARKETING.md` — 틱톡·X·스레드 마케팅 실행안

## 알아둘 함정

- 기본 브랜치는 `main` 이 아니라 **`claude/jolly-pascal-tr47bw`**.
- 열쇠 값은 절대 출력하거나 커밋하지 않는다.
- Vercel CLI 는 `EXPO_PUBLIC_` 접두사 값을 secret 으로 등록하면 거부한다 → `--type config`.
- expo-router 57 에는 `@react-navigation/*` 이 없다. `useHeaderHeight` 대신 루트 View 를 `measureInWindow` 로 잰다.
- 안드로이드 릴리스 번들은 Hermes 바이트코드라, 한글 문자열은 UTF-16 으로 찾아야 잡힌다.
- 같은 버전(train)의 이전 빌드가 베타 심사 중이면 새 빌드는 제출이 422 로 막힌다. 앞 빌드가 승인되면 같이 풀린다.
- Play 내부 테스트의 **테스터 이메일 목록은 API 로 못 바꾼다** (API 는 구글 그룹만 지원). Play Console 화면에서만 가능.
- 내부 테스트 **참여 링크**(`play.google.com/apps/internaltest/숫자`)도 API 로 조회되지 않는다. Console 의 테스터 탭에서 복사.
- 무료 무제한 스위치 `FREE_UNLIMITED` 는 빌드 환경변수 `EXPO_PUBLIC_FREE_UNLIMITED=1` 일 때만 켜진다. **스토어 빌드(ios.yml·android.yml)와 웹은 유료 판매**다. 가입 지원 빌드는 비회원 맛보기 1회, 가입 보너스 3회 + 매일 1회이며 가입 설정이 없는 기존 빌드는 체험 3회 + 매일 1회다. **직접 설치 APK(android-apk.yml)만 무료 무제한**이다 (APK 는 스토어 결제가 안 되므로). 스토어 문구(`docs/STORE_LISTING.md`)·지원 페이지도 유료 기준이다.
- 평생권 가격은 Play ₩29,800, App Store ₩29,900 (애플에 ₩29,800 가격대가 없음). 그래서 공용 설명에는 평생권 금액을 적지 않는다. 앱은 스토어가 주는 실제 가격을 표시한다.
- 하루 이용권(`mylovecoach.pass.day`)·횟수권(`mylovecoach.credits.10`)은 스토어에 **아직 없다**. `tools/asc-iap.mjs --consumables`, `tools/play-setup.mjs --products --consumables` 로 만든다 (상품 ID 는 한 번 만들면 재사용 불가 → 가격 확정 뒤). 스토어에 없는 상품은 결제 화면에서 자동으로 숨는다.
- 소모성 상품은 복원이 안 된다(기기 지갑). 같은 결제가 두 번 충전되지 않게 거래 ID 를 `wallet.granted` 에 남긴다.
- 플로팅 버블은 **스토어 빌드(`android.yml`)에서 기본으로 뺀다** (Play 포그라운드 서비스 신고 전). CI 사본에서만 autolinking 에서 `floating-bubble` 을 빼고 `SYSTEM_ALERT_WINDOW` 를 막으며, AAB 병합 매니페스트에 `FOREGROUND_SERVICE`·`foregroundServiceType`·`SYSTEM_ALERT_WINDOW` 가 남으면 실패한다. 저장소 설정과 직접 설치 APK(`android-apk.yml`)·로컬 빌드에는 버블이 그대로 있다. 스토어 빌드에 넣으려면 Play Console 에 포그라운드 서비스(specialUse) 신고(설명·시연 영상)를 먼저 하고 `-f floating_bubble=true`.
- App Store 「앱이 수집하는 개인정보」 설문은 API 가 없다 (`/v1/apps/{id}/appDataUsages` 등 전부 404). 답안은 `docs/APP_PRIVACY.md`. 화면의 **게시**와 앱 심사 제출은 별개다. `app-store-autosubmit.yml` 은 2026-10-08 `disabled_manually` 확인, 그대로 유지한다.
- 개인정보 설문 답과 `site/privacy.html` 은 실제 전송 항목(`src/lib/analytics.ts`, `api/coach.ts`, `src/lib/auth.ts`, `api/member.ts`)과 맞아야 한다. 현재 스토어 답안과 다음 가입 빌드 초안을 `docs/APP_PRIVACY.md`에서 구분한다. Google 기본 프로필은 Supabase Auth에 이름·사진 주소가 남을 수 있으므로 회원 표의 닉네임·이메일만으로 수집 범위를 단정하지 않는다.
- 문의처는 크레이빙 회사 메일 `contact@craving.win` (songharry77ss@gmail.com 으로 전달됨 · 2026-10-07 사용자 결정, 처리방침 보호책임자 연락처와 같음). `mylovecoach.app` 도메인은 존재하지 않는다. 지원 URL 은 `/support.html`.
- 내부 앱 공유(`play-share.yml`)는 앱이 「앱 초안」이면 `NOT_PUBLISHED` 로 거부된다. 앱 설정 체크리스트를 끝내면 쓸 수 있다.
- `git push` 가 거부되면 다른 세션(휴대폰·클라우드)이 같은 브랜치에 올렸을 수 있다. diff 를 먼저 보고 rebase.

## 현재 상태와 남은 일

**2026-10-09 저녁 출시 진행(사용자 승인):**
- App Store: 개인정보 설문에 이메일 주소(앱 기능·연결됨·추적 안 함)·사용자 ID(앱 기능+분석·연결됨·추적 안 함)를 추가해 **11유형 게시**. 1.0.2 「버전 출시」를 **자동(승인 즉시 출시)**으로 저장하고 `app-store.yml`(실행 `37943164916`)으로 빌드 122 연결·**심사 제출** → `심사 대기 중`. 122는 TestFlight 그룹에는 아직 없다.
- Play: 데이터 보안을 계정 생성 **OAuth**·계정 삭제 URL `/delete-data.html`, 이메일 주소(선택·앱 기능+계정 관리)·사용자 ID(선택·앱 기능+애널리틱스+계정 관리) 추가로 저장. `play-closed-test.yml`(실행 `37942232649`)로 117을 비공개 테스트(알파)에 출시 → 게시 개요에서 알파 출시·데이터 보안 **구글 검토 중**. 이름·사진·기기 ID의 계정 관리 목적 보강은 아직 안 했다.
- Play Console 알림에 10-08 「결제 계정에 주의가 필요한 긴급한 문제」가 있다 — 사용자가 직접 확인할 일.

- 10월 9일 서명 CI 보완: 기존 인증서·Apple 로그인 프로파일만 재사용하고 없으면 실패한다. iOS 임시 키체인·프로파일·업로드 API 키 사본과 Android Gradle 데몬·임시 키를 정리하며, 원본 Xcode 실패 로그는 업로드하지 않는다. GitHub 호스팅 러너만 허용한다. 프로파일 합성 8개·정리 실패 경로 모의 5개·YAML/Bash·ASC 22개·TypeScript·src ESLint·Jest 29모음 470개 통과. 실제 서명 빌드는 사용자 답변 전이라 실행하지 않았다.

App Store 버전·빌드와 Play 번들·트랙은 2026-10-09 최신 조회를 반영하고, 그 밖의 확인은 날짜가 적힌 기존 기록을 유지한다. 자세한 순서는 **`docs/LAUNCH_CHECKLIST.md`**에 정리한다.

- App Store: 10-09 API에서 1.0.1(121)이 `READY_FOR_SALE`·`AFTER_APPROVAL`로 출시됐고 1.0도 `READY_FOR_SALE` 응답이다. 121은 Google·회원가입 추가 전 빌드다. 1.0.2 초안을 API 생성·GET 검증해 `PREPARE_FOR_SUBMISSION`·`MANUAL`, 빌드 미연결을 확인했다. 한국어(ko) 새 소식만 `STORE_LISTING.md`의 `readWhatsNew` 문구로 저장·GET 일치를 확인했고 설명·스크린샷·연령 설정·빌드 연결은 미완료다. 초안 생성은 새 빌드 배포가 아니다.
- **1.0.2 서명 빌드(10-09):** iOS 122(실행 `37910870456`, 15분)가 TestFlight 업로드·처리 `VALID`, 베타 심사 미제출·어느 그룹에도 연결 안 됨 — 아이폰 설치 가능 빌드는 아직 119다. Android 117(실행 `37910873891`, 22분, 버블 제외)이 Play **내부 테스트**에 배포됐다. 비공개 테스트(알파)는 116 그대로. 다음 후보는 iOS 123·Android 118이며 실행 직전 미사용 여부를 다시 확인한다.
- 122를 그룹에 넣는 `testflight-testers.yml` 은 외부 그룹 「테스터」(17명)에 연결하고 베타 심사까지 제출한다. 내부 그룹만 원하면 App Store Connect 화면에서 직접 넣는다. 이 도구가 덮어쓰는 베타 심사 메모는 10-09 1.0.2 기준(가입 선택·비회원 1회)으로 고쳤다.
- 10-09 빌드 변수 `EXPO_PUBLIC_API_URL`·`EXPO_PUBLIC_SUPABASE_URL`·`EXPO_PUBLIC_SUPABASE_ANON_KEY` 3개의 존재·공백 아님만 확인했고 값을 출력하지 않았다. 기존 최신 iOS 배포 프로파일은 `ACTIVE`, Apple Sign in entitlement 있음, 만료일 2027-09-15이며 ASC 제출 대상 검사 22개도 통과했다. 새 빌드의 실제 변수 주입·서명·업로드·로그인 검증 완료를 뜻하지 않는다.
- Play: API의 internal·alpha 116 `completed`에 더해, 콘솔 제출 활동 2에서 Alpha 116(1.0.0) 전체 출시와 기존 9유형 데이터 보안 답안이 10-08 13:57 제출·14:09 출시됨으로 확인됐다. 당시 게시 대기 변경은 없었고 외부 작업에 따른 상태 변화였다. 이후 이 작업에서 현재 116의 운영 API 진단을 반영해 진단을 필수로 정정한 1건을 저장했으며 검토 전송은 하지 않았다. 나머지 8유형·계정 미생성·삭제 URL은 유지했다. Production 테스트 참여자는 0명, 정식 출시 신청 비활성이며 12명·14일 요건은 미충족이다.
- App Store 개인정보는 무가입 116·121에 맞춰 기존 8유형에 메시지를 추가한 9유형을 10-08 정정 게시했다. 사진의 신원 연결 예, 기기 ID의 앱 기능, 이름·메시지·사진·기타 사용자 콘텐츠·기타 데이터의 제품 개인 맞춤화 목적을 반영했다. 새로고침한 상세 미리보기에서 9유형 모두 사용자에게 연결됨·추적 안 함과 각 목적을 확인했다. 그날은 1.0.1 심사 대기를 유지했으며 10-09에는 별도로 출시 상태를 확인했다. 목적 추가 후 일부 연결 표시가 남는 현상은 관련 유형의 아니요→예 재선택·게시로 해결했다.
- 신규 1.0.2 개인정보는 위 App Store 9유형에 가입 이메일·사용자 ID를 더한 11유형, Play도 11유형 초안이며 추가 회원 유형은 아직 콘솔 미반영이다. App Privacy는 앱 전체 공개 설정이므로 아직 없는 네이티브 가입 수집을 선게시하지 않는다. 회원 정보·선택 이용 기록과 별도로 Vercel Hobby 실행 로그 1시간·외부 Drains 없음, Supabase Auth 감사 로그 1시간을 구분한다. Vercel Hobby의 상업적 이용 제한에 맞는 운영 요금제 검토는 미완료다.
- 최신 운영 웹/API 소스는 `32e63f662cf24df36caf6386c5f7014242588c18`이다. Vercel 실행 `37782999282` 성공, 배포 `dpl_EeJw2ZUHPeULw6o6CUZWpMVenam2`는 `READY`, 공개 별칭 `mylovecoach.vercel.app` SHA도 일치했다. PR #7은 `fd38c0549d6197b9428e0b3c0fbe1f7788ae7be6`으로 병합됐다. 운영 배포와 새 스토어 제출을 구분한다.
- 이번 변경 검사는 TypeScript, src+api ESLint, Jest 29모음 470개, ASC 도구 22개, 빌드 변수 8경로, YAML 구문, 웹 export가 통과했다. 운영 index/privacy 200, 코치 API Google 동의 200·헤더 없음 200, 신고 GET 405, 회원 GET 405, 삭제 안내 200 및 Apple 수동 탈퇴 새 문구를 확인했다. 실제 가입·탈퇴·인앱 구매를 수행한 검증은 아니다.
- Supabase 공개 설정에서 Apple·Kakao·Google 활성화, Email 가입 비활성화를 재확인했다. Kakao 콘솔의 앱 1599398은 비즈 앱이며 닉네임 필수·프로필 사진 선택·이메일 선택과 이메일 동의 목적 「회원 식별 및 계정 안내」를 확인했다. REST 설정 5779198의 시크릿 활성화 스위치 2개 ON 및 콜백 일치도 확인했다. 키 값을 읽거나 출력하지 않았고 전체 인가 리다이렉트 URL도 저장하지 않았다. Supabase 경로에서 `prompt=login`을 추가해도 카카오 로그인 화면까지 도달했고 KOE 오류는 없었다. Google 계정 선택까지의 기존 확인과 함께 실제 회원가입·재로그인·탈퇴는 미검증이며 Google 홈페이지 소유권·브랜딩 확인도 미완료다.
- Supabase 프로젝트·기존 회원 스키마·신고 DB와 운영 신고 저장 검증은 완료 기록이 있다. 프로젝트를 새로 만들거나 과거 스키마를 확인 없이 다시 실행하지 않는다.
- 운영 Gemini 유료 연결·GenerateContent 선택 저장 꺼짐·로그 0·데이터셋 없음 확인 기록을 유지한다. 남용 방지 보관 55일과 별도이며 키 값은 조회·기록하지 않는다.
- 서명 없는 iOS 검사 `ios-check` 실행 `37782979607`은 성공했다(전체 15분 27초, 시뮬레이터 Release 컴파일 13분 27초). Android 무서명 arm64 Release 검사 `37785255424`도 성공했다(전체 12분 1초, 컴파일 10분 57초); APK 무서명·버블 권한 제외 통과, 산출물 업로드 0개. 서명 빌드 122·117은 위에 적었다. 이 빌드로 로그인 복귀·가입·탈퇴·AI 동의·신고·구매 복원을 실기 검증한다.
- 1.0.2 준비에는 Apple 자동 연결 해제 실패 시 회원 보존·재시도와 수동 안내 확인 뒤 별도 최종 회원 삭제, 업데이트 문구·심사 접근 안내 정합성을 포함한다. 실제 가입·보너스·재로그인·탈퇴 QA와 반복 사용 가능한 심사 접근 정보는 미완료이며 단위 테스트 성공으로 실기 완료를 대신하지 않는다.
- 운영 Gemini 3.6과 구버전 동의 헤더 없는 요청 허용을 유지했다. 배포 CI에서 코치 API Google 헤더 200·헤더 없음 200, 신고 API GET 405 확인. 새 네이티브 버전이 실제 배포·설치 가능해지기 전에는 `AI_CONSENT_REQUIRED=1`로 기존 116을 먼저 차단하지 않는다. 자동 스토어 심사 제출은 계속 비활성화한다.
- Supabase 감사 로그는 FREE 플랜·DB 저장 꺼짐·감사 표 0행을 10-08 확인했다. 외부 Auth Audit Logs는 공식 Free 1시간 기준이고 회원 탈퇴 즉시 삭제와는 별개다. 향후 DB 기록을 켜면 별도 보관·파기 기준을 정한다(`docs/AUTH_SETUP.md`).
- **연령 정책 결정(2026-10-09 사용자):** 현행 「만 14세 미만 대상 아님」을 유지한다. Gemini API 약관의 18세 미만 대상·접근 가능 서비스 제한에 따른 위험을 설명했고, 사용자가 이를 알고 18세 전용 전환(스토어 18+·문구·앱 내 확인)을 택하지 않았다. 다시 묻지 말고, 사용자가 바꾸라고 할 때만 연령 설정·공개 정책 문구를 고친다.
- **서명 CI 결정(2026-10-09 사용자):** GitHub Actions 에서 서명 열쇠를 실행 중 임시파일로 쓰는 기존 방식을 허용했다. TestFlight·Play 내부 테스트 업로드까지이며, 스토어 심사 제출·출시는 여전히 따로 승인받는다.
- 이전 기록에 남은 키 교체 필요 여부는 실제 처리 이력 확인 대상으로 둔다. 확인 없이 키를 재발급하거나 값을 파일·로그·대화에 남기지 않는다.

### 과거 배포 기록

10월 8일의 App Store 1.0.1(121)은 `WAITING_FOR_REVIEW`·`AFTER_APPROVAL`이었으며 10월 9일 출시 확인으로 현재 상태가 바뀌었다. Apple 공식 iTunes 한국 조회의 공개 버전 1.0·등급 9+도 10월 8일 응답 기록이며 모든 OS의 등급이나 서비스 최소 이용 연령을 확정한 결과는 아니다.

PR #5는 `a51b488a7ce3e3572016ebd709d691e0072f2d28`로 병합됐고 Vercel 실행 `37727616053`·배포 `dpl_BNW522otXtatHuhBkX74xXvt5tRq`로 당시 운영 배포를 확인했다. 이때 TypeScript·ESLint·Jest 28모음 413개·웹 export 및 로컬 인트로·약관 키보드 링크·취소 복귀를 확인했다. 현재 운영 소스·검사 결과는 위 최신 기록을 따른다.
