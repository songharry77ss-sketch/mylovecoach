# 센딧 1.1 스토어 이미지

작업 기준: `docs/codex/tasks/sendit-store-20261106.md`

## 결과물

| 위치 | 규격 | 수량 |
| --- | --- | --- |
| `ios-6.7-framed/` | 1290 × 2796 | 6장 |
| `play-framed/` | 1242 × 2208 | 6장 |
| `feature-graphic-1024x500.png` | 1024 × 500 | 1장 |
| `board.png` | 1968 × 699 | iOS 전체 미리보기 |
| `board-play.png` | 1968 × 582 | Play 전체 미리보기 |

두 폴더의 파일명은 동일합니다: `1-hero.png`, `2-replies.png`, `3-mind.png`, `4-memory.png`, `5-report.png`, `6-explore.png`.

## 디자인과 검수

- 실제 화면 PNG를 비율 유지한 채 HTML/CSS 아이폰 틀에 배치했습니다. 원본 이미지·UI 문구·숫자는 수정하지 않았습니다.
- Pretendard Bold/Medium, 라벤더와 블루·퍼플 배경, 핵심 단어의 그라데이션, 장별 3D 아이콘을 사용했습니다.
- Play는 제목·화면 틀 크기와 위치를 별도로 배치했습니다. 탐색은 원본의 분홍 풍선 위쪽까지만 보이도록 하단을 크롭했습니다.
- 생성 사진은 사용하지 않았습니다. 모든 원본과 사용한 로고·아이콘은 저장소의 기존 파일입니다.
- 12장과 가로 그래픽을 직접 열어 글자·겹침·크롭·주요 수치 가독성을 확인했습니다. 보드 2장으로 세트의 일관성을 확인했습니다.
- `qa-report.json`: PNG 15개 규격, 이미지와 폰트 로드, 문구의 캔버스 내 배치, 제목 폭 80% 이내, 화면 비율, 상단 안전 여백, 탐색 풍선 크롭, 원본 SHA-256 일치 검사를 모두 통과했습니다.

## 재생성

저장소 루트에서 PowerShell로 실행합니다. 결과물은 이 폴더에만 생성됩니다.

```powershell
node docs/store-assets/sendit-1.1/_source/build.mjs
$manifest = Get-Content -LiteralPath 'docs/store-assets/sendit-1.1/_source/manifest.json' -Raw | ConvertFrom-Json
$renderArgs = @()
foreach ($job in $manifest.jobs) {
    $renderArgs += @($job.html, $job.png, [string]$job.width, [string]$job.height)
}
& node 'C:/Users/shsop/mylovecoach-codex-tools/render.mjs' @renderArgs
node docs/store-assets/sendit-1.1/_source/verify.mjs
```

`_source/build.mjs`가 HTML과 렌더 목록을 생성하며, `_source/verify.mjs`가 검수 결과를 기록합니다.
