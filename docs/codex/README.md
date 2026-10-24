# 코덱스 인계 — 나만의 연애코치

Claude Code 세션이 Codex 에 맡길 작업을 `docs/codex/tasks/<작업>.md` 로 써 둔다. 사장님은 Codex 를 그 작업 파일에 적힌 폴더에서 열고 아래 한 줄을 붙여넣는다.

```
docs/codex/README.md 를 먼저 읽고, docs/codex/tasks/<파일>.md 작업을 수행해. 실행 조건이 안 맞으면 멈추고 무엇이 필요한지 말해. 끝나면 그 파일 맨 아래 "실행 기록"에 결과를 적고 커밋·push 해.
```

## 공통 규칙

1. 작업 파일에 적힌 폴더·브랜치에서만 일한다. 다른 worktree(`C:\Users\shsop\mylovecoach`, `mylovecoach-*`)는 다른 세션이 쓴다.
2. 비밀 폴더 `C:\Users\shsop\wolha-secrets\` 는 작업 파일이 허락할 때만 읽고, 값을 화면·로그·커밋에 내보내지 않는다.
3. 스토어(App Store Connect·Play Console)·Vercel·Supabase 운영에 쓰는 일(업로드·제출·환경변수·DB 변경)은 작업 파일에 명시돼 있지 않으면 하지 않는다.
4. 기본 브랜치 `claude/jolly-pascal-tr47bw` 에 직접 push 하지 않는다. 작업 브랜치에 push 만 하고 병합은 Claude 세션·사장님이 한다.
5. 실패하면 오류 본문을 그대로 실행 기록에 적는다. 추측으로 설정을 바꿔 가며 반복하지 않는다.
6. Windows 환경 — Git Bash 는 명령 문자열의 백슬래시를 먹는다. 경로는 슬래시로 쓰거나 PowerShell 을 쓴다.

## 작업 목록

| 파일 | 폴더 | 내용 | 상태 |
|---|---|---|---|
| `tasks/store-shots-20261024.md` | `C:\Users\shsop\mylovecoach-codex-shots` (브랜치 `design/store-shots-20261024`) | 스토어 소개 이미지 시안 4종 | 대기 |
