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

확인 기준은 2026-10-08이며 자세한 순서는 **`docs/LAUNCH_CHECKLIST.md`**에 정리한다.

- App Store: 1.0(116) `READY_FOR_SALE`; 1.0.1 `WAITING_FOR_REVIEW`·`MANUAL`. 최신 121은 `VALID`지만 외부 TestFlight 그룹은 119까지 연결돼 있다. 업로드·외부 설치·심사·출시를 구분한다.
- Play: API에서 internal·alpha의 116 `completed`, 콘솔 변경 2건은 검토 미제출 상태를 유지했다. 실제 설치 가능 여부는 별도 확인한다. 현재 9유형 답안은 무가입 빌드 기준이며 다음 가입 빌드는 이메일·사용자 ID 등과 계정 삭제 답안을 추가 검토한다.
- PR #5는 `a51b488a7ce3e3572016ebd709d691e0072f2d28`로 병합·운영 웹 배포 완료. Vercel 실행 `37727616053` 성공, 배포 `dpl_BNW522otXtatHuhBkX74xXvt5tRq`는 `READY`, `mylovecoach.vercel.app` SHA도 일치했다. TypeScript·ESLint·Jest 28모음 413개·웹 export 통과, 로컬 인트로·약관 키보드 링크·취소 복귀 및 운영 가입 화면·새 약관 문구 HTTP 200 확인.
- Supabase 공개 설정에서 Apple·Kakao·Google 활성화, Email 가입 비활성화를 재확인했다. 운영 Google 계정 선택·Kakao 로그인 화면까지 진입했으며 실제 회원가입·재로그인·탈퇴는 하지 않았다. Kakao 콘솔은 세션 만료로 비즈 앱·동의항목 3개 재확인이 로그인 대기이고, Google 홈페이지 소유권·브랜딩 확인도 미완료다.
- Supabase 프로젝트·기존 회원 스키마·신고 DB와 운영 신고 저장 검증은 완료 기록이 있다. 프로젝트를 새로 만들거나 과거 스키마를 확인 없이 다시 실행하지 않는다.
- 운영 Gemini 유료 연결·GenerateContent 선택 저장 꺼짐·로그 0·데이터셋 없음 확인 기록을 유지한다. 남용 방지 보관 55일과 별도이며 키 값은 조회·기록하지 않는다.
- 새 네이티브 빌드는 실행하지 않았다. CI의 서명키 임시파일 사용은 사용자의 키 파일 저장 금지 규칙과의 허용 범위 확인 대기다. 다음 테스트 빌드는 미사용 번호를 명시하고 로그인 복귀·가입·탈퇴·AI 동의·신고·구매 복원을 실기 검증한다.
- 운영 Gemini 3.6과 구버전 동의 헤더 없는 요청 허용을 유지했다. 배포 CI에서 코치 API Google 헤더 200·헤더 없음 200, 신고 API GET 405 확인. 새 네이티브 버전이 실제 배포·설치 가능해지기 전에는 `AI_CONSENT_REQUIRED=1`로 기존 116을 먼저 차단하지 않는다. 자동 스토어 심사 제출은 계속 비활성화한다.
- Supabase 감사 로그는 FREE 플랜·DB 저장 꺼짐·감사 표 0행을 10-08 확인했다. 외부 Auth Audit Logs는 공식 Free 1시간 기준이고 회원 탈퇴 즉시 삭제와는 별개다. 향후 DB 기록을 켜면 별도 보관·파기 기준을 정한다(`docs/AUTH_SETUP.md`).
- 이전 기록에 남은 키 교체 필요 여부는 실제 처리 이력 확인 대상으로 둔다. 확인 없이 키를 재발급하거나 값을 파일·로그·대화에 남기지 않는다.
