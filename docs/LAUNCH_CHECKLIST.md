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
| **Play: 포그라운드 서비스(specialUse) 신고** — 플로팅 버블 때문에 필요 | 🙋 화면 | Play Console → 앱 콘텐츠 → 포그라운드 서비스 권한 → 「기타(특수 용도)」 설명·영상 링크 |
| ~~새 빌드~~ ✅ iOS 116 (스토어에 없는 하루권 문구 제거판) — 10-06 TestFlight 내부 그룹·외부 「테스터」(베타 심사 승인) 모두 설치 가능, APK 105 (GitHub 릴리스) | 코드 | `ios.yml` → `node tools/asc-testflight.mjs --wait 35`, `android-apk.yml` |
| ~~심사 초안 정리~~ ✅ 2026-10-05: 앱 1.0(빌드 116) + 구독 그룹 「프리미엄」 + 평생 프리미엄 + 주간 프리미엄, 새 스크린샷 6장, 상품별 심사 메모 | 코드·화면 | 초안에 든 버전은 스크린샷을 못 지운다(409) → 초안에서 버전을 잠시 빼고 바꾼 뒤 다시 넣음 |
| ~~애플 유료 앱 계약~~ ✅ 10-06 확인: 계약·은행(하나 사업자)·세금 양식 3종·전자상거래법 규정 준수 모두 「활성화됨」 | 🙋 화면 | App Store Connect → 비즈니스 |
| ~~심사 제출~~ ✅ 2026-10-05 21:03 (`asc-submit.mjs --submit`) — 버전 1.0·주간 구독·평생권 모두 심사 대기 | 코드 | 상태 확인은 `node tools/asc-status.mjs` (제출하지 않음) |
| 계약이 활성화됐으니 TestFlight 116 에서 **샌드박스 결제·복원** 직접 확인 (TestFlight 결제는 실제 청구 없음) | 🙋 팀 | 마이 → 이용권 보기 → 주간/평생 결제 → 앱 삭제 후 재설치 → 구매 복원 |

상품이 스토어에 아직 없으면 앱 결제 화면은 그 상품을 **자동으로 숨깁니다** (주간·평생권만 보임). 그래서 코드 배포를 먼저 해도 안전합니다.


API 와 브라우저로 할 수 있는 건 전부 끝났습니다. 🙋 표시는 본인만 할 수 있는 단계입니다.
현재 상태는 언제든 `gh workflow run status.yml` 로 확인할 수 있습니다.

## AI 분석 동의 (`fix/ai-consent`) — 출시 전에 꼭

심사 중인 iOS 1.0(빌드 116), Play 빌드 113, APK 105, 지금 배포된 웹에는 **AI 분석 동의 시트가 없습니다**. 묻지 않고 대화 캡처·프로필을 Google 로 보내서 애플 지침 5.1.2(i)에 어긋납니다. 이 브랜치를 머지한 빌드로 바꿔야 합니다.

| 순서 | 할 일 | 누가 |
|---|---|---|
| 1 | **맨 먼저** 1.0 의 「버전 출시」를 **수동 출시**로 — 116 이 먼저 승인돼도 출시되지 않게. 심사 대기 중이라 바뀌지 않으면 심사에서 뺀 뒤 바꿈 | 🙋 화면 (또는 API `releaseType=MANUAL`) |
| 2 | 서버 Gemini 키의 Google Cloud 프로젝트에 **결제(Cloud Billing)가 연결된 유료 등급**인지 확인. 무료 등급은 Google 이 입력·출력을 서비스 개선에 쓰고 사람이 검토할 수 있고, 약관상 개인정보를 보내면 안 됨 → 유료로 바꾸거나, 처리방침 2번 표·6번과 동의 시트 「보관」 줄에 그 사실을 적음. 유료면 Google 문서의 보관 기간 근거를 처리방침에 적음 | 🙋 화면 |
| 3 | `fix/ai-consent` 머지 → `vercel.yml` 배포 (웹 + 처리방침 개정판 + 서버). 서버는 이제 Gemini 로만 보내고, `GEMINI_API_KEY` 시크릿이 없으면 배포가 실패함 | 코드 |
| 4 | 새 iOS 빌드 → 1.0 제출에서 116 을 빼고 새 빌드로 바꿔 다시 제출. 아래 심사 메모를 붙임 | 코드·🙋 |
| 5 | Play 검토에 보낼 AAB·APK 도 이 커밋이 든 빌드로 (113·105 에는 동의 시트가 없음) | 코드 |
| 6 | 예전 첫 화면은 이용 기록 체크박스가 **미리 체크**돼 있었음 → 새 빌드는 그 동의를 「아직 묻지 않음」으로 읽어, 다시 켜야 수집. 10-06 저장을 켠 뒤 쌓인 기록은 미리 체크된 동의로 받은 것이라 **파기할지 결정** | 🙋 팀 |

심사 메모 (1.0 → 앱 심사 정보 → 메모에 추가):

> Before any AI feature sends data, the app shows a consent sheet explaining what is sent (chat screenshots, typed text, profile details of the user and the other person, recent coaching history), who receives it (Google LLC's Gemini API through our relay server hosted on Vercel, or the provider of the user's own API key), why, and how it is kept. Nothing is sent unless the user taps "동의하고 계속" (Agree and continue). If the user declines, AI features stay off and everything else keeps working. Consent can be withdrawn at any time in My tab → "AI 분석 동의" (AI analysis consent).

## AI 비용

유료 등급에서는 남용이 곧 비용입니다. 서버에 입력 길이·캡처 크기 상한(넘으면 400·413, AI 를 부르지 않음)이 들어갔지만, 실제 지출을 막는 건 Google 쪽 상한입니다.

| 순서 | 할 일 | 누가 |
|---|---|---|
| 1 | **유료(결제 연결)로 바꾸기 전에** AI Studio → 서버 키의 프로젝트 → **Spend** 에서 월 지출 상한부터 정함 (반영까지 약 10분). 결제 등급별 상한(Tier 1 약 $250)과 따로 둔다 | 🙋 화면 |
| 2 | 비용 스위치는 **기본이 지금 동작 그대로**. 바꾸려면 저장소 변수에 넣고 `gh workflow run vercel.yml` — `GEMINI_MODEL` · `GEMINI_MODEL_LIGHT` · `GEMINI_THINKING_COACH`/`_REPORT`/`_MIND`/`_PRACTICE` · `GEMINI_OMIT_TEMPERATURE` (뜻은 `docs/RELEASE_GUIDE.md` 「AI 비용 스위치」) | 코드 |
| 3 | 스위치를 켜기 전에 **A/B 비교**를 PC 에서 직접 실행 (실제 Gemini 를 불러 기본 조합 60번에 약 $0.4~0.7). 테스트·배포에서는 돌지 않는다 | 🙋 PC |
| 4 | 바꾼 뒤 Vercel 로그의 `"log":"coach_api"` 줄로 토큰(입력·생각·출력·캐시)·재시도·`MAX_TOKENS` 를 확인 | 코드 |

```bash
# 예시 입력은 모두 지어낸 것. 보고서(.md)는 임시 폴더에 저장되고 경로가 마지막에 나온다
GEMINI_API_KEY=AIza... npx tsx scripts/ab-models.ts
GEMINI_API_KEY=AIza... npx tsx scripts/ab-models.ts --models gemini-3.5-flash,gemini-3.6-flash --thinking low,minimal --modes mind,practice
GEMINI_API_KEY=AIza... npx tsx scripts/ab-models.ts --image ./가짜캡처.png --out ./ab.md   # 캡처는 남의 대화가 아닌 지어낸 것으로
```

보고서에는 조합별 평균 토큰·시간·예상 비용(1,000회당)과, 예시마다 조합별 결과가 나란히 들어갑니다. 답장의 호칭·말투·자연스러움을 사람이 읽고 고른 뒤 스위치를 바꿉니다.

## App Store — 심사 대기 (2026-10-05 21:03 제출)

| 항목 | 상태 |
|---|---|
| 등록 정보·스크린샷(10-05 판 6장)·연령 등급·심사 메모 | ✅ 완료 |
| 판매 국가 (대한민국) · 무료 | ✅ 완료 |
| 빌드 116 연결 | ✅ 완료 |
| 인앱결제: 주간 프리미엄 · 평생 프리미엄 | ✅ 버전과 함께 심사 대기 |
| 지원 URL·개인정보 처리방침 URL | ✅ 완료 |
| 「앱이 수집하는 개인정보」 설문 | ✅ 게시 (구입 내역 포함 8개 항목, 추적 없음) |
| 유료 앱 계약 | ✅ 활성화됨 |
| 심사 제출 | ✅ **심사 대기** (보통 1~2일) |
| 승인 즉시 자동 출시 | ⚠️ 설정됨 — **수동 출시로 바꿀 것** (116 에는 AI 분석 동의가 없음 → 위 「AI 분석 동의」 절) |

116 은 그대로 출시하면 안 됩니다. 위 「AI 분석 동의」 절대로 새 빌드로 바꿔 냅니다. 거절되면 사유를 보고 고쳐서 다시 냅니다(자동 재제출 없음).
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
| 검토를 위해 변경사항 14개 전송 | 🙋 **지금 가능** — 게시 개요 버튼 활성(10-06 20:10 확인). 보내기 전에 ①첫 검토 빌드(지금 저장된 113 = 10-01 무료 무제한판, 회의 기능 없음 / 새 빌드는 플로팅 버블 때문에 포그라운드 서비스 신고·영상 필요) ②데이터 보안 설문 갱신(9월판 「저장 안 함」 → 10-06 부터 서버 이용 기록 저장 켜짐) 결정 |

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
