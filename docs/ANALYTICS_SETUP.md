# 이용 기록 데이터베이스 + 관리자 페이지 설정

누가 들어왔고, 어떤 화면에 얼마나 머물렀고, 무엇을 물어봤는지를 모아 보는 구조입니다.

```
앱/웹  ──(동의한 경우에만)──▶  api/track   ─┐
                                            ├──▶  Supabase (PostgreSQL)  ──▶  api/admin  ──▶  /admin.html
코치 요청 ─────────────────▶  api/coach   ─┘
```

- 동의하지 않은 이용자는 **아무것도 전송하지 않습니다**. 앱 기능은 그대로 쓸 수 있습니다.
- 업로드한 **대화 캡처 이미지는 저장하지 않습니다**. 첨부 여부(`has_image`)만 남습니다.
- 계정을 만들지 않으므로 이메일·전화번호는 수집하지 않고, 기기에서 만든 무작위 ID 로만 구분합니다.

---

## 1. Supabase 프로젝트 만들기 🙋 (약 3분)

1. [supabase.com](https://supabase.com) → **Start your project** → GitHub 계정으로 로그인
2. **New project**
   - Name: `mylovecoach`
   - Database Password: 아무거나 (잊어도 됩니다. 아래에서 쓰는 건 다른 키입니다)
   - Region: **Northeast Asia (Seoul)**
3. 프로젝트가 만들어지면 좌측 **SQL Editor** → **New query** → 이 저장소의
   [`supabase/schema.sql`](../supabase/schema.sql) 내용을 통째로 붙여넣고 **Run**
4. 좌측 **Project Settings → API** 에서 두 값을 복사
   - `Project URL` (예: `https://abcdefgh.supabase.co`)
   - `service_role` 키 (⚠️ 비밀키입니다. 절대 앱이나 깃허브에 넣지 마세요 — 서버 환경변수로만 씁니다)

## 2. 서버에 연결 💻

복사한 두 값을 `C:\Users\shsop\wolha-secrets\mylovecoach-supabase.txt` 에 이렇게 저장하고,

```
SUPABASE_URL=https://abcdefgh.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOi...
```

아래를 실행하면 Vercel 환경변수 등록 + 재배포까지 한 번에 됩니다.

```bash
node tools/set-analytics-env.mjs
```

## 3. 관리자 페이지 열기

- 주소: **https://mylovecoach.vercel.app/admin.html**
- 비밀번호: `C:\Users\shsop\wolha-secrets\mylovecoach-admin-token.txt` 의 `ADMIN_TOKEN` 값
- 검색엔진에 노출되지 않도록 `noindex` 처리돼 있고, 비밀번호 없이는 아무 데이터도 내려가지 않습니다.

보이는 것:

| 구역 | 내용 |
|---|---|
| 상단 숫자 | 전체/신규/활동 이용자, 프리미엄 수, 실행 횟수, **평균 체류 시간**, 코칭 요청 수 |
| 날짜별 코칭 요청 | 하루에 몇 건·몇 명이 썼는지 |
| 화면별 체류 시간 | 어느 화면(`/(tabs)`, `/crush/[id]`, `/paywall` …)에 얼마나 머물렀는지 |
| 관계 단계 · 톤 | 썸/소개팅/연인 비율, 어떤 말투를 고르는지 |
| 이벤트 | 온보딩 완료, 페이월 열림, 구매 시작/완료, 무료 소진 등 |
| 최근 코칭 기록 | **무엇을 물어봤는지**(입력한 상황 글), 상대 MBTI·관계, 결과 호감 온도·요약 |

## 4. 스토어 신고 내용 갱신 🙋

이용 기록을 저장하기 시작하면 아래 두 곳의 답변을 바꿔야 합니다. (지금은 "저장하지 않음"으로 신고돼 있습니다)

- **Play Console → 앱 콘텐츠 → 데이터 보안**: 해당 데이터 유형에서 「데이터가 임시로 처리됨」을 **아니요**로 바꾸고, 목적에 「분석」을 추가
- **App Store Connect → 앱이 수집하는 개인정보**: `사용자 콘텐츠`, `사용 데이터`, `식별자(기기 ID)` 를 「앱 기능·분석」 목적으로 수집, **사용자에게 연결되지 않음**으로 신고

앱의 개인정보 처리방침(`site/privacy.html` 4번 조항)은 이미 이 내용으로 갱신돼 있습니다.

## 자주 묻는 것

**Q. Supabase 무료 플랜으로 충분한가요?**
무료 플랜은 500MB 데이터베이스 + 월 5GB 전송입니다. 이 앱의 기록은 한 건에 1KB 안팎이라 수십만 건까지 여유가 있습니다.

**Q. Supabase 를 연결하지 않으면 어떻게 되나요?**
`api/track` 은 조용히 204 를 돌려주고, `api/admin` 은 "아직 연결되지 않았어요" 를 표시합니다. 앱과 코칭 기능은 정상 동작합니다.

**Q. 이용자가 동의를 철회하면?**
앱 「마이 → 이용 기록 수집」 스위치를 끄면 즉시 전송이 멈춥니다. 이미 쌓인 기록을 지우려면 Supabase SQL Editor 에서
`delete from app_user where device_id = '…';` 처럼 해당 기기 ID 의 행을 지우면 됩니다.
