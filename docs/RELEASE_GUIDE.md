# 출시 가이드 (App Store · Google Play)

코드는 출시 가능한 상태로 준비돼 있습니다. 아래 단계 중 **계정·결제·서명**은 사람이 직접 해야 하는 항목입니다.
사람이 해야 하는 항목은 🙋 표시, 터미널에서 실행하는 항목은 💻 표시입니다.

## 0. 준비물 체크리스트

| 항목 | 필요한 이유 | 비용 |
|---|---|---|
| 🙋 Apple Developer Program 가입 | iOS 빌드 서명 + App Store 제출 | 연 $99 (승인까지 최대 48시간) |
| 🙋 Google Play Console 개발자 등록 | Android 제출 | 1회 $25 (신원 확인 필요) |
| 🙋 Expo 계정 (expo.dev) | EAS Build/Submit 클라우드 빌드 | 무료 플랜 가능 |
| 🙋 Anthropic API 키 (console.anthropic.com) **또는** Gemini API 키 (aistudio.google.com) | AI 코치 서버 동작 | 사용량 과금 (Gemini 는 무료 티어 있음) |
| 🙋 Vercel 계정 | 코치 API 프록시 + 개인정보 처리방침 페이지 호스팅 | 무료 플랜 가능 |

> ⚠️ 2024년 이후 Google Play는 **개인 개발자 신규 계정**에 "12명 이상 테스터로 14일 이상 비공개 테스트" 를 요구합니다. 오늘 당장 프로덕션 공개는 Google 정책상 불가능할 수 있으니, **내부 테스트 트랙**으로 먼저 올리는 것을 기본 계획으로 잡았습니다 (`eas.json` 의 `track: internal`).

## 1. 코치 서버 배포 (Vercel) 💻

```bash
npm i -g vercel
vercel login
vercel link                       # 새 프로젝트로 연결 (root = 저장소 루트)
vercel env add ANTHROPIC_API_KEY production   # sk-ant-... 입력 (Claude 사용 시)
# 또는 Gemini 를 쓰려면:
vercel env add GEMINI_API_KEY production      # AIza... 입력
vercel env add AI_PROVIDER production         # gemini
vercel env add COACH_APP_TOKEN production     # 임의의 긴 문자열 (선택)
vercel --prod
```

배포 주소(예: `https://mylovecoach.vercel.app`)를 확인한 뒤

- `eas.json` 의 `EXPO_PUBLIC_API_URL` 값을 배포 주소로 바꾸고,
- `COACH_APP_TOKEN` 을 설정했다면 `EXPO_PUBLIC_API_TOKEN` 도 같은 값으로 `eas.json` 각 프로필의 `env` 에 추가하세요.
- `site/privacy.html`, `site/terms.html` 이 자동으로 호스팅됩니다. 스토어 심사에 필요한 URL 입니다.

동작 확인:

```bash
curl -X POST https://<배포주소>/api/coach -H 'content-type: application/json' \
  -d '{"crush":{"name":"민지","gender":"female","relationship":"talking","style":[],"notes":""},"user":{"name":"지훈","gender":"male","style":[]},"tone":"natural","text":"첫 메시지 뭐라고 보낼까?","history":[]}'
```

## 2. EAS 프로젝트 연결 💻

```bash
npm i -g eas-cli
eas login
eas init                          # app.json 의 extra.eas.projectId 자동 기록
```

## 3. iOS 빌드 & 제출

1. 🙋 App Store Connect → *나의 앱 → +* 로 앱 생성 (이름 **나만의 연애코치**, 번들 ID `app.mylovecoach.ios`, SKU 임의).
2. 🙋 생성된 앱의 **Apple ID(숫자)** 와 개발자 계정의 **Team ID** 를 `eas.json` → `submit.production.ios` 에 입력.
3. 💻 빌드 & 제출

```bash
eas build --platform ios --profile production      # 처음엔 Apple 로그인 + 인증서/프로비저닝 자동 생성
eas submit --platform ios --latest
```

4. 🙋 App Store Connect 에서 스크린샷(6.7", 6.5" 필수), 설명(`docs/STORE_LISTING.md`), 개인정보 처리방침 URL, 연령 등급(17+ 권장: 잦은/강한 성적 내용 아님 → "드문/경미한 성숙한 테마" 선택), **App Privacy** 항목 입력 후 심사 제출.
   - App Privacy: "데이터 수집 안 함" 이 아니라 **사진/이미지(앱 기능, 사용자와 연결되지 않음, 추적 안 함)** 와 **기타 사용자 콘텐츠** 로 신고하세요. 서버에 저장하지는 않지만 처리 목적으로 전송되기 때문입니다.
   - 심사 메모에 "AI 코칭은 사용자가 업로드한 캡처를 Anthropic API 로 분석하며 서버에 저장하지 않음" 을 적어두면 통과가 빠릅니다.

## 4. Android 빌드 & 제출

1. 🙋 Play Console → *앱 만들기* (이름 **나만의 연애코치**, 기본 언어 한국어, 무료 앱).
2. 🙋 Play Console → *설정 → API 액세스* 에서 서비스 계정을 만들고 JSON 키를 다운로드 → 저장소 루트에 `google-play-service-account.json` 으로 저장 (gitignore 되어 있음). 서비스 계정에 앱의 *릴리스 관리자* 권한 부여.
3. 💻

```bash
eas build --platform android --profile production   # 키스토어 자동 생성 (EAS 가 보관)
eas submit --platform android --latest              # 내부 테스트 트랙에 초안 업로드
```

4. 🙋 Play Console 에서 **첫 AAB 는 콘솔에서 수동 업로드**를 요구할 수 있습니다. 그 경우 `eas build` 결과의 .aab 를 받아 *테스트 → 내부 테스트* 에 직접 올린 뒤 이후부터 `eas submit` 사용.
5. 🙋 스토어 등록정보(설명·스크린샷·그래픽 이미지 1024×500), 개인정보 처리방침 URL, 데이터 보안 양식(사진 → 앱 기능 목적, 암호화 전송, 삭제 요청 가능), 콘텐츠 등급 설문, 대상 연령 작성.

## 5. 출시 전 최종 점검 💻

```bash
npm run typecheck && npm test && npm run lint
npx expo-doctor
```

## 6. 이후 업데이트

- 버전은 `app.json` 의 `version` 만 올리면 됩니다. `buildNumber`/`versionCode` 는 EAS 가 원격에서 자동 증가(`autoIncrement`).
- 프롬프트/모델 변경은 `src/lib/coach-schema.ts` 한 곳에서 관리되며, 서버만 재배포하면 앱 업데이트 없이 반영됩니다.

## 준비된 스토어 자산

- `docs/store-assets/ios-6.7/` – iPhone 6.7" 규격(1290×2796) 스크린샷 6장
- `docs/store-assets/android/` – 안드로이드 규격(1082×2402) 스크린샷 6장
- `docs/store-assets/feature-graphic-1024x500.png` – Play 스토어 그래픽 이미지
- `assets/images/icon.png` – 앱 아이콘 1024×1024
- 등록 문구: `docs/STORE_LISTING.md`

## 권장 경로: GitHub Actions 로 빌드·업로드 (월하와 동일한 방식, Expo/Codemagic 계정 불필요)

월하 출시 때 만든 열쇠 폴더(`C:\Users\shsop\wolha-secrets`)를 그대로 재사용합니다.
App Store Connect API 키·팀 ID·배포 인증서는 팀 단위라 새 앱에도 그대로 쓰이고, Android 업로드 키만 이 앱용으로 새로 만듭니다.

| 워크플로 | 러너 | 하는 일 |
|---|---|---|
| `.github/workflows/ios.yml` | macos-15 | `expo prebuild` → 번들 ID·인증서·프로파일 자동 생성(codemagic-cli-tools) → IPA → App Store Connect 업로드(TestFlight) |
| `.github/workflows/android.yml` | ubuntu | `expo prebuild` → 업로드 키로 서명한 AAB → 산출물 저장, `track` 지정 시 Play Console 트랙 업로드 |

### 1. PC 에서 시크릿 등록 (5분) 💻

```bash
git clone https://github.com/songharry77ss-sketch/mylovecoach -b claude/jolly-pascal-tr47bw
cd mylovecoach
node tools/set-ci-secrets.mjs --api-url https://<코치서버주소>   # 서버를 아직 안 올렸으면 --api-url 생략
```

스크립트가 하는 일: `wolha-secrets` 의 `asc-key.p8`/`asc-key.txt`/`apns-key.txt`(+ `*.p12` 가 있으면) 를 읽어 GitHub 시크릿 등록,
Android 업로드 키(`mylovecoach-upload.jks`) 가 없으면 생성, App Store Connect 에 번들 ID `app.mylovecoach.ios` 등록.
`gh auth login` 이 되어 있어야 합니다 (월하 때 사용).

### 2. 스토어에 앱 만들기 🙋

- **App Store Connect** → 나의 앱 → + → 이름 `나만의 연애코치`, 번들 ID `app.mylovecoach.ios`(1번이 등록해 둠), SKU `mylovecoach`, 기본 언어 한국어.
- **Play Console** → 앱 만들기 → 이름 `나만의 연애코치`, 기본 언어 한국어, 앱, 무료.

### 3. 빌드 실행 💻 (또는 Claude 에게 "빌드 돌려줘")

```bash
gh workflow run ios.yml --repo songharry77ss-sketch/mylovecoach --ref claude/jolly-pascal-tr47bw
gh workflow run android.yml --repo songharry77ss-sketch/mylovecoach --ref claude/jolly-pascal-tr47bw
```

- iOS: 20~30분 뒤 TestFlight 에 빌드가 나타납니다. App Store Connect 에서 버전 정보·스크린샷을 채우고 심사 제출.
- Android: Actions 산출물(`mylovecoach-android-<versionCode>.aab`) 을 내려받아 Play Console **내부 테스트**에 첫 업로드(새 앱은 첫 AAB 를 콘솔에서 올려야 API 업로드가 열립니다). 이후부터는 `-f track=internal` 로 자동 업로드.
  Play 서비스 계정에 이 앱 권한을 주려면 Play Console → 사용자 및 권한 → 서비스 계정 → 앱 추가.

### 4. 웹 + 코치 서버 (Vercel) 🙋/💻

한 Vercel 프로젝트가 **웹 앱(브라우저에서 바로 사용) + 코치 API + 약관 페이지**를 모두 서비스합니다.

- **자동(권장)**: vercel.com/account/tokens 에서 토큰 발급 → `wolha-secrets/vercel-token.txt` 에 `VERCEL_TOKEN=…`, `gemini-api-key.txt` 에 `GEMINI_API_KEY=…` 저장 → `node tools/set-ci-secrets.mjs` → `gh workflow run vercel.yml`. 로그 마지막에 배포 주소가 나옵니다.
- **수동**: Vercel 대시보드 → Add New Project → GitHub 에서 `mylovecoach` 가져오기(브랜치 `claude/jolly-pascal-tr47bw`) → Environment Variables 에 `GEMINI_API_KEY`, `AI_PROVIDER=gemini` → Deploy.

주소가 나오면 `node tools/set-ci-secrets.mjs --api-url https://<주소>` 로 앱 빌드에 연결하고, 개인정보 처리방침 URL 은 `<주소>/privacy.html` 입니다.

---

## 대안 경로: EAS Build (Expo 계정이 있을 때)

`eas.json` 이 준비돼 있어 `eas build` / `eas submit` 으로도 올릴 수 있습니다. 아래는 그 방법입니다.

## 사용자 PC 에서 실행할 명령 (요약)

> 이 저장소를 만든 클라우드 세션에서는 Expo/Vercel/Google 서버 접근이 차단돼 있어 빌드·제출은 PC 에서 실행해야 합니다.

```bash
git clone https://github.com/songharry77ss-sketch/mylovecoach -b claude/jolly-pascal-tr47bw
cd mylovecoach && npm install

# 1) 코치 서버 (Gemini 키 사용)
npm i -g vercel && vercel login && vercel link
vercel env add GEMINI_API_KEY production      # AQ.… 또는 AIza… 입력
vercel env add AI_PROVIDER production         # gemini
vercel --prod                                 # 배포 주소 확인 → eas.json 의 EXPO_PUBLIC_API_URL 에 반영

# 2) 빌드 & 제출
npm i -g eas-cli && eas login && eas init
eas build --platform android --profile production
eas build --platform ios --profile production
eas submit --platform android --latest        # google-play-service-account.json 필요
eas submit --platform ios --latest            # eas.json 의 ascAppId / appleTeamId 입력 후
```

## 스크린샷 촬영 팁

`npx expo start --web` 후 브라우저 개발자 도구를 iPhone 15 Pro Max(430×932) 로 맞춰 촬영하거나, `eas build --profile preview` 로 만든 앱을 실기기에 설치해 촬영하세요. 채팅방에 캡처를 올린 결과 화면, 홈 목록, 온보딩 1장, 팁 화면 순서를 추천합니다.
