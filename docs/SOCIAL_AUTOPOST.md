# 인스타·쓰레드 자동 게시

폰 없이, PC 가 꺼져 있어도 매일 21:00(KST)에 게시물이 올라가게 하는 장치입니다. 공식 API 만 씁니다.

## 흐름

1. **내용**은 `social-queue` 가지의 `marketing/social/queue.json` 에 있습니다 (그림·영상도 같은 가지의 `marketing/social/` 아래).
   기본 가지와 따로 두어, 게시물을 넣고 고칠 때마다 PR 을 병합하지 않아도 됩니다.
2. 사람이 보고 **허락한 항목만** `"approved": true` 가 됩니다. 허락은 사람이 GitHub 의 **「인스타·쓰레드 게시 허락」 실행**(Actions → Run workflow → `all` 또는 id)으로 누릅니다 — 휴대폰 GitHub 앱에서도 됩니다. 허락 전에는 시간이 돼도 올라가지 않습니다.
3. `.github/workflows/social-post.yml` 이 매시간 `tools/social-post.mjs --due` 를 돌려,
   허락받고 시간이 됐고(36시간 안) 아직 안 올린 항목을 올리고, 기록을 `posted.json` 에 남깁니다.
   GitHub 예약 실행은 몇 시간씩 밀릴 수 있어서(2026-11 에 21:00 예약이 04:30 에 돎) 매시간 돌리고,
   **예정 시각부터 3시간 안일 때만** 올립니다 — 21:00 항목이면 21:00~23:59. 놓치면 다음 날 같은 시간대에 올라갑니다.
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
| instagram | `carousel` · `image` · `reel` · `story` | 캐러셀 2~10장, **JPG 만**, 릴스는 mp4 1개, 스토리는 jpg 또는 mp4 1개(글 안 씀) | 글 2,200자 · 해시태그 30개 · 하루 50개 안팎 |
| threads | `text` · `image` · `carousel` | 캐러셀 2~20장 | 글 500자 · 링크 5개 · 하루 250개 |

검사: `node tools/social-post.mjs --queue <queue.json> --check` (토큰 없이). 계산 부분 테스트: `node --test tools/lib/social.test.mjs`.

## 릴스 음원 (Audio API)

릴스 항목에 `audio` 를 넣으면 인스타 음원을 붙여 올립니다. **`IG_ACCESS_TOKEN` 이 페이스북 로그인 토큰일 때만** 됩니다
(메타 Audio API 는 인스타 로그인 토큰을 받지 않음). 토큰 종류는 모양으로 알아서 고릅니다 — `IG` 로 시작하면 인스타 로그인,
아니면 페이스북 로그인. 억지로 정하려면 저장소 변수 `IG_API` = `instagram` | `facebook`.

```json
"audio": { "search": ["곡 제목 가수"], "trending": true, "videoVolume": 1, "minSeconds": 15 }
```

| 칸 | 뜻 |
|---|---|
| `id` | 곡 고정 — 「인스타 음원 찾기」 실행(social-audio.yml) 표의 `audio_id` |
| `search` | 검색어 1~5개를 차례로 — 제목·가수에 낱말이 다 들어간 첫 곡 |
| `trending` | 위에서 못 찾으면 지금 인기 음원 (최근 5개 게시물에 쓴 곡은 건너뜀) |
| `audioVolume` · `videoVolume` | 1~100 (기본 100). 효과음판 영상에 `videoVolume: 1` 이면 음악만 들림 |
| `minSeconds` | 이보다 짧은 곡은 뺌 (영상 길이) |
| `required` | `true` 면 음원을 못 붙일 때 올리지 않음. 기본은 음원 없이 영상 소리 그대로 올림 |

- 다른 앱에서 쓰도록 허가된 곡만 나와서 인스타 앱 목록과 다를 수 있습니다. 대신 저작권 걱정이 적습니다.
- 곡의 **구간은 못 고릅니다**(처음부터). 「(Preview)」처럼 짧게 잘린 곡은 대개 후렴이라 잘 맞습니다.
- 올리기 전에 들어 볼 수 없습니다. 연습 실행(dry-run)이 고를 곡 이름을 요약에 보여 줍니다.

## API 로 안 되는 것 (앱에서)

- **캐러셀·사진 음원** — API 가 없습니다. 2026-07 부터 앱에서 「이미 올린 게시물의 음원 바꾸기」가 생겼지만, 음원이 없던 게시물에 새로 넣을 수 있는지는 확인 전입니다.
- 스토리는 `story` 로 그림·영상만 올라갑니다. **링크·투표 스티커와 「릴스를 스토리에 공유」는 API 가 없습니다** — 링크는 그림 안 글자로 「프로필 링크」를 안내하세요.
- 소개·링크 수정, 프로필 고정, 스토리 링크·투표 스티커, 프로필 사진 — 앱에서 (폰 무선 adb 로 할 수 있음, 메모리 참고).

## 처음 한 번 (사람이 할 일)

인스타 토큰은 두 가지 중 하나입니다. **릴스 음원을 쓰려면 B(페이스북 로그인)** 입니다.

**A. 인스타 로그인** (음원 없음 — 효과음판으로만)

1. 메타 개발자 앱 `mylovecoach-marketing` (인스타 「메시지 및 콘텐츠 관리」 + 「Threads API 액세스」, 개발 모드).
2. 앱 역할에 `my.lovecoach` 를 인스타·쓰레드 **테스터**로 추가하고, 인스타·쓰레드 앱의 「웹사이트 권한 → 테스터 초대」에서 수락.
3. 앱 화면에서 **장기 토큰**을 발급해 저장소 시크릿 `IG_ACCESS_TOKEN` 에 넣는다.

**B. 통합 로그인 · 페이스북 쪽 API** (릴스 음원 됨 — 11-04 이 길로 설정 중)

새 앱은 「Instagram 로그인 API 설정」이 막혀 있고 「API setup with Unified login」만 됩니다.

1. 비즈니스 포트폴리오 「나만의 연애 코치」에 앱 `mylovecoach-marketing` 연결 (11-04 완료).
2. 앱 대시보드 → 「API setup with Unified login」 → 구성 「Instagram API(통합 로그인)」: **시스템 사용자 토큰(만료 없음)**,
   권한 `instagram_basic` · `instagram_content_publish` (+ 댓글·메시지) (11-04 완료).
3. `my.lovecoach` 를 Instagram 테스터로 초대 → **휴대폰 인스타 앱에서 수락** → 대시보드 2단계 「계정 추가」.
4. 토큰 → 저장소 시크릿 `IG_ACCESS_TOKEN`. 인스타 계정 id(숫자, 보통 1784… 로 시작) → 저장소 **변수** `IG_USER_ID`.
   시스템 사용자 토큰은 페이지 목록 권한이 없어 계정을 스스로 못 찾으므로 `IG_USER_ID` 가 꼭 필요합니다.
5. 시스템 사용자 토큰은 만료가 없으니 `META_APP_ID` · `META_APP_SECRET` 은 **넣지 않습니다** (넣으면 월요일 연장 단계가 이 토큰을 바꾸려다 실패).
6. 「인스타 음원 찾기」를 한 번 돌려 표가 나오면 연결 끝. 음원 API 가 「페이스북 페이지 연결」을 요구하며 실패하면,
   페이스북 페이지 「나만의 연애코치」를 만들어 인스타를 연결합니다 (페이지 설정 → 연결된 계정 → 인스타그램).

페이스북 로그인 **사용자 토큰**(그래프 API 탐색기 → 장기 토큰, 60일)을 쓸 때는 권한에 `pages_show_list` · `pages_read_engagement` 를 더하면
`IG_USER_ID` 없이도 페이지에 연결된 계정을 찾고, 시크릿 `META_APP_ID` · `META_APP_SECRET` 이 있으면 월요일마다 연장합니다.

**공통**

- 쓰레드 토큰은 쓰레드 앱 화면에서 장기 토큰 → 시크릿 `THREADS_ACCESS_TOKEN`.
- 토큰은 사람만 다룬다 — 채팅·코드에 붙이지 않는다.
- (선택) 연장된 토큰을 시크릿에 자동 저장하려면 이 저장소의 Secrets 쓰기 권한만 가진 fine-grained 토큰을 `SOCIAL_SECRETS_PAT` 로.
  없으면 60일마다 다시 넣으면 됩니다 (성과 표 요약에 알림이 남음).

토큰이 다른 계정 것이면 게시 전에 멈춥니다 (`SOCIAL_EXPECT_IG` · `SOCIAL_EXPECT_THREADS` = `my.lovecoach`).
