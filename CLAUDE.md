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
gh workflow run app-store.yml -f build=111 -f submit=true   # App Store 등록 정보 입력 + 심사 제출

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

- `src/app/` — 화면 (expo-router). 첫 화면은 `start.tsx`, 채팅은 `crush/[id]/index.tsx`
- `src/components/coach/` — 결과 카드(`analysis-card.tsx`), 입력창(`composer.tsx`)
- `src/lib/coach-schema.ts` — 요청·응답 스키마와 프롬프트. 앱과 서버가 같이 쓴다
- `src/store/app-store.ts` — zustand + AsyncStorage
- `api/` — Vercel 서버리스 (`coach.ts` 가 Gemini 호출, `track.ts`·`admin.ts` 는 이용 기록)
- `tools/` — 스토어 자동화 스크립트. 워크플로가 이걸 불러 쓴다
- `docs/TESTER_GUIDE.md` — 테스터에게 보낼 안내문과 설치 링크

## 알아둘 함정

- 기본 브랜치는 `main` 이 아니라 **`claude/jolly-pascal-tr47bw`**.
- 열쇠 값은 절대 출력하거나 커밋하지 않는다.
- Vercel CLI 는 `EXPO_PUBLIC_` 접두사 값을 secret 으로 등록하면 거부한다 → `--type config`.
- expo-router 57 에는 `@react-navigation/*` 이 없다. `useHeaderHeight` 대신 루트 View 를 `measureInWindow` 로 잰다.
- 안드로이드 릴리스 번들은 Hermes 바이트코드라, 한글 문자열은 UTF-16 으로 찾아야 잡힌다.
- 같은 버전(train)의 이전 빌드가 베타 심사 중이면 새 빌드는 제출이 422 로 막힌다. 앞 빌드가 승인되면 같이 풀린다.
- Play 내부 테스트의 **테스터 이메일 목록은 API 로 못 바꾼다** (API 는 구글 그룹만 지원). Play Console 화면에서만 가능.
- 내부 테스트 **참여 링크**(`play.google.com/apps/internaltest/숫자`)도 API 로 조회되지 않는다. Console 의 테스터 탭에서 복사.
- 무료 횟수 제한은 `src/lib/billing/plans.ts` 의 `FREE_UNLIMITED` 하나로 켜고 끈다. 지금은 켜져 있어(무제한) 스토어 설명·심사 메모도 「전부 무료」 기준이다. 유료로 돌릴 때는 `docs/STORE_LISTING.md` 의 설명·심사 메모도 같이 되돌릴 것.
- App Store 「앱이 수집하는 개인정보」 설문은 API 가 없다. 화면에서 끝내야 `app-store.yml` 의 심사 제출이 통과한다.
- 내부 앱 공유(`play-share.yml`)는 앱이 「앱 초안」이면 `NOT_PUBLISHED` 로 거부된다. 앱 설정 체크리스트를 끝내면 쓸 수 있다.
- `git push` 가 거부되면 다른 세션(휴대폰·클라우드)이 같은 브랜치에 올렸을 수 있다. diff 를 먼저 보고 rebase.

## 남은 일

- Supabase 프로젝트 생성 → `docs/ANALYTICS_SETUP.md` 1단계 (사용자가 해야 함)
- Supabase 연결 후 App Store 「앱이 수집하는 개인정보」 설문 + Play 데이터 보안 재신고
- Play 정식 출시는 테스터 12명 × 14일 비공개 테스트가 선행 조건
- 채팅에 노출된 적 있는 Gemini 키 교체
