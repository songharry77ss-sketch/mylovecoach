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
gh workflow run ios.yml                       # TestFlight
gh workflow run android.yml -f track=internal # Play 내부 테스트
gh workflow run android-apk.yml               # 플레이스토어 없이 바로 설치할 APK
gh workflow run app-store.yml -f build=112 -f wait_minutes=60        # App Store 등록 정보 갱신 + 빌드 처리를 기다렸다가 버전에 연결
# 심사 제출은 app-store-autosubmit.yml 이 15분마다 알아서 시도한다 (출시되면 스스로 꺼짐)

# Play 비공개 테스트 (개인 계정은 12명 × 14일 해야 프로덕션 가능)
gh workflow run play-closed-test.yml          # 내부 테스트 최신 빌드를 비공개 테스트에 (앱 초안이면 초안까지만)

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
- `modules/floating-bubble/` — 안드로이드 플로팅 버블 로컬 Expo 모듈 (iOS·웹은 아무것도 안 함)
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
- 무료 무제한 스위치 `FREE_UNLIMITED` 는 빌드 환경변수 `EXPO_PUBLIC_FREE_UNLIMITED=1` 일 때만 켜진다. **스토어 빌드(ios.yml·android.yml)와 웹은 유료 판매**(무료 3회 + 하루 1회 → 페이월), **직접 설치 APK(android-apk.yml)만 무료 무제한**이다 (APK 는 스토어 결제가 안 되므로). 스토어 문구(`docs/STORE_LISTING.md`)·지원 페이지도 유료 기준이다.
- 평생권 가격은 Play ₩29,800, App Store ₩29,900 (애플에 ₩29,800 가격대가 없음). 그래서 공용 설명에는 평생권 금액을 적지 않는다. 앱은 스토어가 주는 실제 가격을 표시한다.
- 하루 이용권(`mylovecoach.pass.day`)·횟수권(`mylovecoach.credits.10`)은 스토어에 **아직 없다**. `tools/asc-iap.mjs --consumables`, `tools/play-setup.mjs --products --consumables` 로 만든다 (상품 ID 는 한 번 만들면 재사용 불가 → 가격 확정 뒤). 스토어에 없는 상품은 결제 화면에서 자동으로 숨는다.
- 소모성 상품은 복원이 안 된다(기기 지갑). 같은 결제가 두 번 충전되지 않게 거래 ID 를 `wallet.granted` 에 남긴다.
- 플로팅 버블 때문에 `SYSTEM_ALERT_WINDOW` 를 더 이상 막지 않는다. Play Console 에 포그라운드 서비스(specialUse) 신고가 필요하다.
- App Store 「앱이 수집하는 개인정보」 설문은 API 가 없다 (`/v1/apps/{id}/appDataUsages` 등 전부 404). 답안은 `docs/APP_PRIVACY.md`. 화면에서 **게시**하면 `app-store-autosubmit.yml` 이 15분 안에 심사 제출한다.
- 개인정보 설문 답과 `site/privacy.html` 은 실제 전송 항목(`src/lib/analytics.ts`, `api/coach.ts`)과 맞아야 한다. 수집 항목을 바꾸면 셋을 같이 고칠 것.
- 문의처는 크레이빙 회사 메일 `contact@craving.win` (songharry77ss@gmail.com 으로 전달됨 · 2026-10-07 사용자 결정, 처리방침 보호책임자 연락처와 같음). `mylovecoach.app` 도메인은 존재하지 않는다. 지원 URL 은 `/support.html`.
- 내부 앱 공유(`play-share.yml`)는 앱이 「앱 초안」이면 `NOT_PUBLISHED` 로 거부된다. 앱 설정 체크리스트를 끝내면 쓸 수 있다.
- `git push` 가 거부되면 다른 세션(휴대폰·클라우드)이 같은 브랜치에 올렸을 수 있다. diff 를 먼저 보고 rebase.

## 남은 일

정식 출시까지 남은 화면 작업은 **`docs/LAUNCH_CHECKLIST.md`** 에 정리돼 있다.

- App Store: 「앱이 수집하는 개인정보」 설문 게시만 남음 (답안 `docs/APP_PRIVACY.md`). 게시하면 15분 안에 자동 제출
- Play: 비공개 테스트 12명 × 14일, 또는 사업자(조직) 계정 전환. 비공개 테스트 초안은 API 로 만들어 둠
- Supabase 프로젝트 생성 → `docs/ANALYTICS_SETUP.md` 1단계 (사용자가 해야 함)
- 채팅에 노출된 적 있는 Gemini 키 교체
