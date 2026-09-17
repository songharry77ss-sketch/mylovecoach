# 나만의 연애코치 💌

대화 캡처 한 장을 올리면 상대에게 딱 맞는 답장 3개와 호감 온도를 알려주는 AI 연애 코치 앱입니다.
미국의 Rizz 앱을 참고했으며, 토스 스타일의 깔끔한 UI에 하늘색·연분홍 파스텔 톤을 입혔습니다.

<p align="center"><img src="docs/app-icon-preview.png" width="120" alt="앱 아이콘"></p>

## 핵심 기능

- **상대별 채팅방** – 이름, 나이, MBTI, 성별, 관계 단계(썸/소개팅/짝사랑…), 스타일 태그, 사진, 메모를 등록
- **캡처 코칭** – 카톡/인스타 DM 캡처를 올리면 상황 요약 · 호감 온도(0~100°) · 읽어낸 포인트 · 톤별 추천 답장 3개 · 다음 스텝 · 주의점을 제공
- **톤 선택** – 자연스럽게 / 설레게 / 유머러스 / 쿨하게 / 진심으로
- **원탭 복사** – 답장을 탭하면 클립보드에 복사, "보냈어요" 표시로 맥락 학습
- **대화 맥락 기억** – 최근 코칭 내용과 실제로 보낸 답장을 다음 요청에 반영
- **연애 팁 라이브러리**, **내 프로필/기본 톤 설정**, **다크 모드**
- 회원가입 없음. 모든 데이터는 기기에만 저장 (API 키는 키체인/키스토어)

## 기술 스택

| 영역 | 선택 |
|---|---|
| 앱 | Expo SDK 57 · React Native 0.86 · expo-router · TypeScript · zustand · reanimated |
| AI | Claude (`claude-opus-5`) Vision + Structured Outputs (zod) |
| 서버 | Vercel Serverless Function (`api/coach.ts`) – 앱 → 서버 → Anthropic 프록시 |
| 배포 | EAS Build / EAS Submit (App Store · Google Play) |

## 프로젝트 구조

```
api/coach.ts            Vercel 서버 함수 (Claude 호출, 구조화 출력)
site/                   랜딩 · 개인정보 처리방침 · 이용약관 (Vercel 정적 호스팅)
src/app/                expo-router 화면
  onboarding.tsx        온보딩 (소개 2장 + 내 프로필)
  (tabs)/index.tsx      홈 – 채팅방 목록
  (tabs)/tips.tsx       연애 팁
  (tabs)/my.tsx         마이 – 프로필/AI 연결/약관/데이터 삭제
  crush/new.tsx         새 채팅방(상대 등록)
  crush/[id]/index.tsx  채팅방 – 캡처 업로드 & 코칭 결과
  crush/[id]/edit.tsx   상대 정보 수정/삭제
  settings/*            내 프로필 · API 키
src/components/         Toss 스타일 UI 킷(ui/) · 코치 카드(coach/) · 상대 폼(crush/)
src/lib/coach-schema.ts 프롬프트 + zod 스키마 (앱/서버 공용)
src/lib/coach-client.ts 프록시 또는 개인 키로 Claude 호출
src/store/app-store.ts  zustand + AsyncStorage 영속화
scripts/generate-icons.py 아이콘/스플래시 생성
docs/                   출시 가이드 · 스토어 등록 문구
```

## 로컬 실행

```bash
npm install
cp .env.example .env        # EXPO_PUBLIC_API_URL 등 설정
npx expo start              # Expo Go 또는 개발 빌드로 실행
```

AI 연결 방법은 둘 중 하나입니다.

1. **프록시 서버(권장, 스토어 배포용)** – `vercel` 로 이 저장소를 배포하고 Vercel 환경변수에 `ANTHROPIC_API_KEY`(필수), `COACH_APP_TOKEN`(선택)을 등록한 뒤, 앱 빌드 시 `EXPO_PUBLIC_API_URL=https://<배포주소>` 를 넣습니다.
2. **개인 API 키(개발/테스트용)** – 앱의 *마이 → AI 코치 연결* 에서 `sk-ant-…` 키를 입력하면 기기에서 Anthropic API를 직접 호출합니다.

## 검증

```bash
npm run typecheck   # tsc --noEmit
npm test            # jest (스키마/프롬프트/스토어 단위 테스트)
npm run lint        # expo lint
npm run export:web  # 웹 번들 빌드 확인
```

## 스토어 출시

[docs/RELEASE_GUIDE.md](docs/RELEASE_GUIDE.md) 에 계정 준비부터 `eas build` / `eas submit` 까지 단계별로 정리돼 있고, 스토어 등록 문구는 [docs/STORE_LISTING.md](docs/STORE_LISTING.md) 에 있습니다.
