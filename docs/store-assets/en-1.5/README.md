# My Love Coach (영어판) 스토어 이미지 — 1.5

한국어판 `sendit-1.1/` 과 같은 디자인(아이폰 틀·그라데이션·3D 아이콘·Pretendard)에 영어 제목과 영어 실제 화면을 넣은 세트입니다.

## 결과물

| 위치 | 규격 | 수량 |
| --- | --- | --- |
| `ios-6.7-framed/` | 1290 × 2796 | 6장 |
| `play-framed/` | 1242 × 2208 | 6장 |
| `feature-graphic-1024x500.png` | 1024 × 500 | 1장 (Play 그래픽 이미지) |
| `board.png` · `board-play.png` | 1968 × 699 · 1968 × 582 | 한눈에 보기 |
| `raw/` | 1290 × 2796 | 영어 원본 화면 6장 |

파일명은 두 폴더 같습니다: `1-hero` · `2-replies` · `3-mind` · `4-memory` · `5-report` · `6-explore`.

| 장 | 제목 | 화면 |
| --- | --- | --- |
| 1 | Your dating coach / for every **text.** | 홈 |
| 2 | One screenshot. / **3 perfect replies.** | 채팅방 답장 3가지·성공 확률 |
| 3 | What are they / **really thinking?** | Read their mind 결과 |
| 4 | A coach that / **remembers it all** | Coach remembers 시트 |
| 5 | Watch their / **interest heat up** | Crush report |
| 6 | Practice, tips & / your **texting type** | Explore 탭 |

## 원본 화면(raw) 다시 찍기

데모 웹(`EXPO_PUBLIC_DEMO_MODE=1 npx expo start --web --port 8099`, 주소 `?lang=en`)을 Edge 헤드리스로 430×932 @3x 로 찍었습니다.
기기 상태(사용자 Alex, 상대 Emma — 토요일 데이트 신청에 "haha maybe 👀")를 localStorage 에 심고, 채팅방에서 실제 데모 흐름으로 답장을 받은 뒤 찍었습니다.
안전 영역(위 59·아래 34)은 CDP `Emulation.setSafeAreaInsetsOverride`, 상태 표시줄(9:41)·홈 막대는 덧그림, 글꼴은 Pretendard(아이폰 글꼴과 비슷하게)·이모지는 Twemoji 입니다.
화면을 다시 찍으면 아래 렌더를 다시 돌립니다(검수가 원본 해시를 새로 기록).

## 렌더·검수

저장소 루트에서 PowerShell 로 실행합니다. 결과물은 이 폴더에만 생깁니다.

```powershell
node docs/store-assets/en-1.5/_source/build.mjs
$manifest = Get-Content -LiteralPath 'docs/store-assets/en-1.5/_source/manifest.json' -Raw | ConvertFrom-Json
$renderArgs = @()
foreach ($job in $manifest.jobs) {
    $renderArgs += @($job.html, $job.png, [string]$job.width, [string]$job.height)
}
& node 'C:/Users/shsop/mylovecoach-codex-tools/render.mjs' @renderArgs
node docs/store-assets/en-1.5/_source/verify.mjs
```

`verify.mjs` 는 한국어판 검사(규격·이미지·폰트 로드·글자가 캔버스 안·제목 폭 80% 이내·화면 비율·위 여백·원본 해시)에
영어판 검사(한글·「Sendit/센딧」 없음, 장마다 핵심 화면이 캔버스 아래로 잘리지 않음)를 더해 `qa-report.json` 에 남깁니다.
