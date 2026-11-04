# 인스타·쓰레드 자동 게시

폰 없이, PC 가 꺼져 있어도 매일 21:00(KST)에 게시물이 올라가게 하는 장치입니다. 공식 API 만 씁니다.

## 흐름

1. **내용**은 `social-queue` 가지의 `marketing/social/queue.json` 에 있습니다 (그림·영상도 같은 가지의 `marketing/social/` 아래).
   기본 가지와 따로 두어, 게시물을 넣고 고칠 때마다 PR 을 병합하지 않아도 됩니다.
2. 사람이 보고 **허락한 항목만** `"approved": true` 가 됩니다. 허락은 사람이 GitHub 의 **「인스타·쓰레드 게시 허락」 실행**(Actions → Run workflow → `all` 또는 id)으로 누릅니다 — 휴대폰 GitHub 앱에서도 됩니다. 허락 전에는 시간이 돼도 올라가지 않습니다.
3. `.github/workflows/social-post.yml` 이 매일 21:00 에 `tools/social-post.mjs --due` 를 돌려,
   허락받고 시간이 됐고(36시간 안) 아직 안 올린 항목을 올리고, 기록을 `posted.json` 에 남깁니다.
4. `.github/workflows/social-insights.yml` 이 매일 10:00 에 최근 게시물 성과를 표로 남기고, 월요일엔 토큰을 연장합니다.

그림 주소는 jsDelivr(`cdn.jsdelivr.net/gh/…@커밋/…`)를 씁니다 — 저장소가 공개라 따로 그림 서버가 필요 없고, 커밋에 고정돼 바뀌지 않으며,
영상도 `video/mp4` 로 나갑니다(GitHub raw 는 영상을 octet-stream 으로 줘서 인스타가 못 받을 수 있음).

## 항목 모양

```json
{
  "id": "d3-ig-carousel",
  "at": "2026-11-04 21:00",
  "channel": "instagram",
  "kind": "carousel",
  "media": ["marketing/social/d3/01.jpg", "…"],
  "caption": "카톡 습관만 봐도 …",
  "approved": false,
  "note": "사람이 읽는 메모 (게시에는 안 쓰임)"
}
```

| channel | kind | 그림·영상 | 제한 |
|---|---|---|---|
| instagram | `carousel` · `image` · `reel` | 캐러셀 2~10장, **JPG 만**, 릴스는 mp4 1개 | 글 2,200자 · 해시태그 30개 · 하루 50개 안팎 |
| threads | `text` · `image` · `carousel` | 캐러셀 2~20장 | 글 500자 · 링크 5개 · 하루 250개 |

검사: `node tools/social-post.mjs --queue <queue.json> --check` (토큰 없이). 계산 부분 테스트: `node --test tools/lib/social.test.mjs`.

## API 로 안 되는 것 (앱에서)

- **인스타 음원** — 캐러셀·사진에 인스타 음원을 붙이는 API 가 없습니다. 릴스는 영상에 소리를 넣어(효과음판) 올립니다.
  2026-07 부터 앱에서 「이미 올린 게시물의 음원 바꾸기」가 생겼지만, 음원이 없던 게시물에 새로 넣을 수 있는지는 확인 전입니다.
- 소개·링크 수정, 프로필 고정, 스토리 링크·투표 스티커, 프로필 사진 — 앱에서 (폰 무선 adb 로 할 수 있음, 메모리 참고).

## 처음 한 번 (사람이 할 일)

1. 메타 개발자 앱 `mylovecoach-marketing` (인스타 「메시지 및 콘텐츠 관리」 + 「Threads API 액세스」, 개발 모드).
   비즈니스 포트폴리오 「나만의 연애 코치」에 연결돼 있다 (2026-11-04).
2. 앱 역할에 `my.lovecoach` 를 인스타·쓰레드 **테스터**로 추가하고, 인스타·쓰레드 앱의 「웹사이트 권한 → 앱 및 웹사이트 → 테스터 초대」에서 수락.
3. **인스타 토큰** — 2026-11 부터 새 앱은 「Instagram 로그인」 대신 **「API setup with Unified login」(통합 로그인)** 만 된다.
   이용 사례 → Instagram API → API setup with Unified login → 1. 구성(「Instagram API(통합 로그인)」, 시스템 사용자 토큰·만료 없음) → 2. 「계정 추가」로 `my.lovecoach` 연결 → 토큰 생성.
   - 토큰이 `EAA…` 이면 graph.facebook.com 으로 보낸다. 화면에 보이는 인스타 계정 id(숫자)를 저장소 **변수** `IG_USER_ID` 에 넣으면 계정을 바로 찾는다(비밀값 아님).
   - 토큰이 `IG…` 이면 예전 인스타 로그인 토큰(60일)이라 graph.instagram.com 으로 보내고, 월요일마다 연장한다.
   쓰레드는 Threads 이용 사례의 토큰 생성기에서. 둘 다 저장소 시크릿 `IG_ACCESS_TOKEN` · `THREADS_ACCESS_TOKEN` 에 넣는다 (토큰은 사람만 다룬다 — 채팅·코드에 붙이지 않는다).
4. (선택) 60일 토큰 자동 연장을 시크릿에 저장하려면 이 저장소의 Secrets 쓰기 권한만 가진 fine-grained 토큰을 `SOCIAL_SECRETS_PAT` 로.
   없으면 60일마다 3번을 다시 하면 됩니다 (성과 표 요약에 알림이 남음). 통합 로그인의 시스템 사용자 토큰은 만료가 없어 연장하지 않는다.

토큰이 다른 계정 것이면 게시 전에 멈춥니다 (`SOCIAL_EXPECT_IG` · `SOCIAL_EXPECT_THREADS` = `my.lovecoach`).
