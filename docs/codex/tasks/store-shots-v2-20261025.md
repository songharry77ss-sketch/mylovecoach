# 작업: 스토어 소개 이미지 2차 — 사람 사진·화려함·가시성 (2026-10-25)

1차(`docs/store-assets/candidates-20261024/`)에 대한 사장님 평가: 「레퍼런스(Bumble·Instagram·듀오링고)에 비해 퀄리티가 너무 떨어진다. 예쁘고 잘생긴 젊은 남녀 사진도 넣고, 화려하고 가시성 좋고 이해가 잘 되게 다시.」
1차의 문제: ①앱 화면 조각만 있고 사람·장면이 없어 감정이 안 산다 ②카드가 작고 배경이 단조로워 썸네일에서 무엇을 하는 앱인지 한눈에 안 들어온다 ③글자·여백 비율이 아마추어 같다 ④PIL 로 그려 그림자·유리·빛 같은 질감이 약하다.

이번에는 **AI 로 만든 20대 남녀 라이프스타일 사진 + 진짜 앱 화면을 담은 아이폰 목업 + 큰 한 줄 메시지** 로, Bumble·Instagram 스토어 이미지 수준을 목표로 한다. 시안은 3종(P·S·N)만, 대신 완성도를 높인다.

## 작업 위치·규칙 (1차와 같음)

- 폴더 `C:\Users\shsop\mylovecoach-codex-shots`(브랜치 `design/store-shots-20261024`)만. 새 파일은 `docs/store-assets/candidates-20261025/` 아래에만 만든다. 앱 코드·기존 이미지·1차 시안은 고치지 않는다.
- git 커밋·push 는 하지 않는다(Claude 세션이 한다). 스토어·서버 작업 없음.
- 레퍼런스 보드(첨부 이미지)는 분위기만 참고, 저장소에 넣지 않는다. 다른 앱의 로고·화면·인물을 옮기지 않는다.

## 1단계 — 사진 만들기 (이미지 생성 도구)

이미지 생성 도구로 **실존하지 않는 인물**의 사진을 8~10장 만든다. 세로 사진(예: 1024×1536), 광고 사진 품질.
`docs/store-assets/candidates-20261025/_photos/` 에 저장하고, 쓴 프롬프트를 `_photos/prompts.md` 에 적는다.

공통 조건 (프롬프트에 꼭 넣기):
- **20대 중반의 한국인 성인**(대학 졸업 후 사회초년생 느낌). 미성년자로 보이는 얼굴·교복·아동스러운 소품 금지.
- 매력적이고 세련된 외모, 자연스러운 표정, 단정한 일상복(니트·셔츠·재킷 등). 노출·선정적 포즈·속옷·수영복 금지.
- 실존 인물·연예인·아이돌을 닮게 하지 않는다. 사진에 글자·로고·워터마크 없음.
- 휴대폰이 나오면 **뒷면이나 화면이 안 보이는 각도** — 가짜 앱 화면을 만들지 않는다(실제 화면은 목업에 넣는다).
- 손가락·눈·치아 왜곡이 있으면 다시 만든다.

장면 예 (필요하면 바꿔도 됨, 남녀 비율 반반):
1. 여성 — 햇살 드는 카페 창가, 휴대폰을 보며 설레는 미소 (따뜻한 톤, 얕은 심도)
2. 남성 — 밤 도시 거리 네온 아래 휴대폰을 들고 고민하는 옆모습 (시네마틱)
3. 여성 — 밤, 침대 위 쿠션에 기대 휴대폰을 보며 살짝 걱정 (따뜻한 스탠드 조명)
4. 남성 — 밝은 단색 배경 스튜디오, 휴대폰을 들고 자신감 있는 미소 (S 시안용 — 배경이 단순해 오려 쓰기 좋게)
5. 여성 — 밝은 단색 배경 스튜디오, 놀란 듯 기뻐하는 표정 (S 시안용)
6. 커플 — 노을 무렵 한강 같은 강변을 웃으며 걷는 뒷모습/옆모습 (호감 온도·보고서용)
7. 친구 둘(여성) — 휴대폰을 함께 보며 웃음 (KKTI·공유용)
8. 남성 — 아늑한 방에서 소파에 앉아 웃으며 휴대폰 (연습용)

## 2단계 — 화면 만들기 (HTML/CSS → PNG)

한 장 = HTML 한 파일. 렌더링은 이미 준비된 도구로:
`node C:/Users/shsop/mylovecoach-codex-tools/render.mjs <html> <out.png> 1290 2796 [<html> <out.png> 1290 2796 ...]`
(Edge 헤드리스. 글꼴은 `@font-face { src: url("file:///C:/Users/shsop/mylovecoach-codex-shots/api/_assets/fonts/Pretendard-Bold.otf") }` 처럼 file 주소로. 이모지는 Edge 의 컬러 이모지로 나온다)
샌드박스 때문에 렌더가 안 되면 HTML 과 사진까지만 만들고 멈춰서 그 오류를 실행 기록에 그대로 적는다 — Claude 세션이 렌더한다.

### 구성 원칙 (세 시안 공통)

- **한 장 = 한 메시지.** 위쪽 30% 안에 제목 두 줄(한 줄 14자 이하), 1290 폭 기준 **제목 130~150px**, 굵게. 핵심 단어 하나만 색·형광펜 강조. 보조 문구는 한 줄, 48px 안팎.
- **아이폰 목업**: CSS 로 그린 검은 베젤 + 다이내믹 아일랜드 + 둥근 모서리, 안에 원본 캡처(`docs/store-assets/ios-6.7/N-*.png`)를 넣는다. 목업은 화면 높이의 50~65%. 살짝 기울이거나 사진 속 인물 옆에 배치.
- **떠 있는 UI 카드**: 원본 캡처에서 핵심 부분(답장 말풍선과 「성공 확률 95%」, 「호감 온도」 게이지, 속마음 % 막대, KKTI 유형 카드 등)을 잘라 목업 밖으로 크게 띄운다(그림자·흰 테두리·살짝 회전). 이것이 썸네일에서 「무슨 앱인지」를 알려 준다.
- **사진**: 인물 사진을 배경 전체 또는 목업 뒤/옆에. 글자 위치에는 그라데이션 덮개를 깔아 대비 확보(WCAG 대비 4.5 이상).
- 질감: CSS 그림자(여러 겹), 유리 카드(backdrop-filter), 빛 번짐(radial-gradient), 스티커(이모지·SVG 하트·말풍선).
- 위 150px·아래 120px 은 비워 둔다. 모든 장 오른쪽 아래에 작게 `01/06` 번호는 넣지 않아도 됨.

### 시안 3종

| 시안 | 이름 | 참고 | 핵심 |
|---|---|---|---|
| P | 라이프스타일 | Bumble(인물 사진 전면 + 큰 제목 + UI 카드 하나) | 장마다 인물 사진이 화면 전체, 아래쪽에 목업·UI 카드, 위쪽 제목은 흰색+노랑/코랄 강조. 따뜻하고 설레는 톤 |
| S | 스티커 팝 | Instagram(진한 마젠타·보라 + 손그림 스티커), 듀오링고(장마다 다른 진한 색) | 진한 단색/그라데이션 배경, 단색 배경 스튜디오 사진의 인물을 동그랗게·말풍선 모양으로 잘라 붙이고, 가운데 목업, 하트·불꽃·말풍선 스티커가 사방에 |
| N | 나이트 시네마 | BeReal(검정)·Character.AI(네온) | 밤 사진(네온 거리·침대 스탠드) 위에 어두운 덮개, 네온 핑크·보라 빛을 받은 목업과 UI 카드, 흰 제목 + 네온 강조 |

### 카피 (문제 → 해결이 바로 읽히게, 그대로 써도 되고 더 좋게 바꿔도 됨 — 바꾸면 README 에 이유)

| 장 | 원본 | 제목 | 보조 문구 | 띄울 UI 카드 |
|---|---|---|---|---|
| 1 | 1-chat-replies | 뭐라고 답장하지?<br>캡처 한 장이면 끝 | 호칭·말투 그대로, 답장 3가지 | 답장 말풍선 + 「성공 확률 95%」 |
| 2 | 2-practice | 실전 전에<br>AI랑 카톡 연습 | 보낼 때마다 코치가 바로 피드백 | 연습 대화 말풍선 + 「+10°」 |
| 3 | 3-mind | 읽씹한 그 사람<br>속마음은 몇 %? | 남자·여자 속마음을 가능성별로 | 속마음 % 막대 |
| 4 | 4-report | 대화할수록 오르는<br>호감 온도 | 상대 분석 보고서까지 | 호감 온도 게이지(25°) |
| 5 | 5-kkti | 카톡 습관으로 보는<br>진짜 연애 MBTI | 16가지 유형 · 나만의 연애 컬러 | KKTI 유형 카드(직진 불도저) |
| 6 | 6-home | 캡처 없이<br>상황만 적어도 OK | 연습·속마음·비밀 상담까지 한 앱에 | 홈 메뉴 카드 |

## 반드시 지킬 것 (스토어 심사)

1. 앱 화면은 **원본 캡처만** — 자르기·확대·회전은 되지만 없는 기능·숫자를 만들지 않는다. 각 장에 실제 앱 화면(목업 또는 UI 카드)이 분명히 보여야 한다.
2. 사람 사진은 AI 로 만든 가상 인물만(위 조건), 실존 인물·연예인·스톡 사진 다운로드 금지.
3. 「1위」「최고」 순위·수상·별점·후기·다운로드 수 금지. iOS 이미지에 「Google Play」「안드로이드」 글자 금지. 카톡 로고 금지.
4. 썸네일(폭 230px 정도로 줄였을 때)에서도 제목이 읽혀야 한다 — 다 만들고 `contact.png` 를 그 크기로 보고 확인.

## 출력

```
docs/store-assets/candidates-20261025/
  _photos/*.png, _photos/prompts.md
  P/1.png … 6.png (1290×2796), P/play-1.png … play-6.png (1242×2208, 9:16 — 같은 HTML 을 다른 크기로 렌더하거나 비율에 맞게 다시 배치)
  P/contact.png (6장 가로 나란히, 높이 900) ・ S/… ・ N/…
  html/<시안>-<번호>.html (다시 렌더할 수 있게)
  overview.png (3종의 1번 장 나란히)
  README.md (시안별 콘셉트·색·사진 사용·카피·확인 결과)
```
PNG 한 장 3MB 이하(필요하면 품질을 유지한 채 줄이기).

## 실행 기록

- **2026-10-25 · Codex 실행 완료** — 지정 폴더 `C:\Users\shsop\mylovecoach-codex-shots`와 `design/store-shots-20261024` 브랜치에서 작업했다. 새 결과는 `docs/store-assets/candidates-20261025/` 아래에만 만들고 이 실행 기록을 갱신했다. **git add·커밋·push 없음**, 스토어·서버·비밀 폴더 접근 없음. 앱 코드·원본 캡처·1차 작업서·1차 결과는 수정하지 않았다.
- **사진:** 내장 `image_gen`으로 1024×1536 가상 한국인 성인 사진 **8장**을 각각 생성해 `_photos/`에 저장했다. 25–28세 성인, 단정한 일상복, 실존 인물/연예인 비참조, 노출·선정적 포즈 없음, 휴대폰 뒷면만 보이게 하는 조건을 사용했다. 커플·친구 포함 남성 5명·여성 5명 등장. 손·눈·치아·폰 화면 비노출을 생성 직후 직접 확인했다. 정확한 프롬프트·생성 원본 경로는 `_photos/prompts.md`에 기록했다. 레퍼런스 보드 파일·타사 인물·화면·로고는 옮기지 않았다.
- **시안:** P 라이프스타일(전면 인물·따뜻한 브라운·노랑 강조), S 스티커 팝(6색 배경·스튜디오 인물 말풍선·새 SVG 스티커), N 나이트 시네마(밤 사진·검정·핑크/보라 네온) 각 **6장**. iOS **18장 1290×2796**, Play **18장 1242×2208**을 만들었다. 시안별 높이 900px 비교 6개, 폭 230px 검토용 비교 3개, 첫 장 비교 2개를 포함해 **PNG 총 55개**다. 처음 볼 파일은 `overview.png`, 전체 탐색은 `index.html`이다.
- **합성과 렌더:** 독립 HTML 18개와 비교용 HTML 11개를 만들고, 사용자 지정 `C:/Users/shsop/mylovecoach-codex-tools/render.mjs`를 수정하지 않고 Edge로 렌더했다. CSS 베젤·다이내믹 아일랜드·그림자·그라데이션·유리 캡션을 사용했다. 실제 앱 캡처를 폰과 확대 카드에 직접 참조했고 UI를 새로 만들지 않았다. Play는 미디어 쿼리로 별도 재배치했다. **샌드박스 차단·렌더 오류 없음**, 생략한 요청 산출물 없음.
- **카피 변경:** 3번 원본이 읽씹 상황이 아니므로 `그 사람 속마음 / 가능성은 몇 %?`로 수정했다. 4번은 상승 보장 대신 `대화 속에 담긴 / 우리 호감 온도`로 바꿨다. 5번은 `카톡 습관 속 / 나의 연애 유형`으로 간결하게 정리했다. 6번에는 1번 원본의 실제 상황 입력창 크롭을 추가했다. `95%`, `+10°`, `50%/30%/20%`, `25°`, `직진 불도저` 등은 원본 그대로다. 상세 카피와 변경 이유는 결과 README에 기록했다.
- **검증:** iOS·Play **36/36 브라우저 배치 검사 통과**, 이미지·Pretendard 로딩, 제목 134–140px/한 줄 14자 이하, 제목 영역 상단 30%, 상·하단 여백과 원본 UI 출처를 확인했다. 회전된 폰 높이는 iOS 57.14–62.03%, Play 59.59–62.18%다. 전체 PNG 55개가 **3,000,000바이트 이하**, 최대 **2,232,028바이트**여서 추가 압축·양자화 없이 RGB 원본 출력을 보존했다. 원본 앱 캡처 6개 SHA-256 모두 일치. `manifest.json`, `validation-layout.json`, `validation-files.json`에 기록했다.
- **시각 확인:** P/S/N iOS·Play 비교와 폭 230px 비교를 직접 확인했다. 첫 장·큰 속마음 크롭·KKTI·상황 입력 장을 개별 검토했다. P 인물 얼굴 가림과 사진 경계, Play 목업 하단 여백을 수정했고 N 인물 밝기를 높였다. KKTI 5번 iOS·Play 6개에서 원본의 X·Threads 로고는 전면 카드 뒤에 가려져 노출되지 않는다.
- **명암 대비:** 36개 구성 × 제목 두 줄·강조어·보조 문구 = **144개 영역**의 실제 합성 배경을 측정했다. 최저 **5.6056:1**, 4.5:1 미만 0개. `validation-contrast.json`과 재현 스크립트 `contrast_audit.mjs/.py`에 기록했다. QA용 임시 배경 이미지 144개는 측정 후 개별 삭제했다. 모든 최종 PNG 합성 출력은 지정 `render.mjs`를 사용했다.
- **남은 일:** 사장님의 시안 선택 및 Claude 세션의 추후 출시 작업. 이번 범위의 사진·HTML·PNG·비교 이미지·README·실행 기록은 작성했다.
- **작업 중 보조 도구 오류:** 파일 검색용 `rg`가 없어 PowerShell 목록 조회로 대체했다. 독립 검증 스크립트 최초 실행에서 Windows 절대 경로 ESM import 오류가 있어 새 검증 스크립트의 import만 `file:///C:/...`로 고쳤다. 렌더러·환경·패키지 설정은 바꾸지 않았다. 오류 원문은 다음과 같다.

```text
rg : The term 'rg' is not recognized as the name of a cmdlet, function, script file, or operable program. Check the spe
lling of the name, or if a path was included, verify that the path is correct and try again.
At line:2 char:48
+ git status --short; git branch --show-current; rg --files -g 'AGENTS. ...
+                                                ~~
    + CategoryInfo          : ObjectNotFound: (rg:String) [], CommandNotFoundException
    + FullyQualifiedErrorId : CommandNotFoundException
```

```text
node:internal/modules/esm/load:199
    throw new ERR_UNSUPPORTED_ESM_URL_SCHEME(parsed, schemes);
          ^

Error [ERR_UNSUPPORTED_ESM_URL_SCHEME]: Only URLs with a scheme in: file, data, and node are supported by the default ESM loader. On Windows, absolute paths must be valid file:// URLs. Received protocol 'c:'
    at throwIfUnsupportedURLScheme (node:internal/modules/esm/load:199:11)
    at defaultLoadSync (node:internal/modules/esm/load:146:3)
    at #loadAndMaybeBlockOnLoaderThread (node:internal/modules/esm/loader:770:12)
    at #loadSync (node:internal/modules/esm/loader:790:49)
    at ModuleLoader.load (node:internal/modules/esm/loader:756:26)
    at ModuleLoader.loadAndTranslate (node:internal/modules/esm/loader:488:31)
    at #getOrCreateModuleJobAfterResolve (node:internal/modules/esm/loader:549:36)
    at afterResolve (node:internal/modules/esm/loader:597:52)
    at ModuleLoader.getOrCreateModuleJob (node:internal/modules/esm/loader:603:12)
    at ModuleJob.syncLink (node:internal/modules/esm/module_job:163:33) {
  code: 'ERR_UNSUPPORTED_ESM_URL_SCHEME'
}

Node.js v24.16.0
```
