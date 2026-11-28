# 세계판 검색 페이지 (My Love Coach, 2026-11-28~)

해외에서 「what to text when left on read」 같은 검색으로 들어오는 사람을 위한 정적 페이지다.
한국어 검색 페이지(`/guide/*`·`/kkti/type/*`, `tools/seo-pages.mjs`)와 같은 방식 — **웹 빌드 때 HTML 을 만들어 `dist/` 에 넣고, 서버 함수는 늘리지 않는다.**

## 생기는 주소

| 주소 | 내용 | 만드는 곳 |
|---|---|---|
| `/en/` `/ja/` `/es/` `/pt/` | 언어별 소개(랜딩) — 스토어 버튼, 사용법 3줄, 기능 설명 | `tools/seo-global.mjs` (`LANDING` + `docs/store-listing/<언어>.json`) |
| `/en/guide` | 영어 가이드 모아 보기 | `tools/seo-global.mjs` |
| `/en/guide/<slug>` | 영어 상황별 문자 가이드 12편 | 글: `tools/seo-guides-en.mjs` |
| `sitemap.xml` | 위 주소 + 영어 약관·지원(`/en/*.html`)을 뒤에 더함 | `tools/seo-pages.mjs` 의 `staticPages()` |

그림: `site/en/og.png`(링크 미리보기 — `docs/store-assets/en-1.5/feature-graphic-1024x500.png` 복사본), `site/en/app-replies.jpg`(랜딩의 앱 화면 — `play-framed/2-replies.png` 를 540px JPEG 로 줄인 것).

## 어떻게 만들어지나

```
npm run build:web
  └ expo export --platform web              → dist/ (앱 화면)
  └ node tools/copy-site.mjs                 → site/ 복사 + 검색 페이지 쓰기
       └ tools/seo-pages.mjs  staticPages()  → 한국어 페이지 + sitemap.xml
            └ tools/seo-global.mjs globalPages() → /en/ /ja/ /es/ /pt/, /en/guide/*
```

- `vercel.json` rewrites 가 `/en`·`/en/`(ja·es·pt 같음)·`/en/guide`·`/en/guide/:slug` 를 각 `index.html` 로 보낸다. **앱 화면 넘기기(`/((?!api/).*)` → `/index.html`) 보다 앞에** 있어야 한다.
- **hreflang**: 랜딩 4개와 한국어 홈(`/`)을 서로 묶는다(`x-default` = `/en/`). 한국어 홈 머리말에도 같은 묶음이 들어간다(`HOME.head` 의 `hreflangLinks()`). 한국어 가이드와 영어 가이드는 주제가 달라 묶지 않는다.
- **한국어 페이지는 그대로**: 바뀌는 건 한국어 홈 머리말의 hreflang 6줄과 sitemap 뒤쪽 주소뿐이다. 나머지 한국어 결과물은 바이트까지 같다(2026-11-28 확인).
- **스토어 버튼**: 안드로이드는 Google Play, 아이폰은 App Store 를 크게 앞에(다른 쪽은 글자 링크), PC 는 둘 다. `<head>` 의 한 줄 스크립트가 `<html>` 에 `is-android`/`is-ios` 를 붙일 뿐이고, 스크립트가 꺼져 있으면 둘 다 보인다. App Store 는 나라 없는 주소(`apps.apple.com/app/id…`)라 보는 사람의 나라 스토어로 열린다.
- **유입 집계**: Play 링크에 `referrer=utm_source=seo&utm_medium=<언어>_landing|en_guide&utm_campaign=<slug|landing|hub>` 를 붙인다 → 앱의 설치 경로(`src/lib/install-attribution.ts`)가 읽어 관리자 화면 「가입 경로」에 `seo` 로 남는다. 「브라우저에서 써 보기」(`/start?lang=en&…`)는 웹이 `utm_*` 를 처음부터 읽는다. App Store 는 캠페인 토큰(pt)이 없어 따로 집계되지 않는다.

## 원칙 (글을 고치거나 더할 때)

- **기능·가격·약속은 스토어 문구에 있는 것만.** 랜딩의 기능 설명은 `docs/store-listing/<언어>.json` 의 `description` 을 그대로 보여 준다(이모지로 시작하는 줄 = 카드 제목, `• ` = 목록, 사이트 주소 = 링크). 스토어 문구를 고치면 다음 빌드에 랜딩도 따라 바뀐다.
- **지어낸 숫자·통계·후기 금지.** 테스트가 가이드 글에서 `%`·「studies show」 같은 말을 막는다.
- **건강한 연애.** 상대를 조종하는 기술(네깅·떠보기·밀당 공식), 거절을 무시하라는 조언은 넣지 않는다. 「싫다」는 답을 존중하는 문장을 넣는다.
- 가벼운 페이지: 스크립트는 기기 판별 한 줄과 JSON-LD 뿐, 그림은 `loading="lazy"`, 페이지 60KB 이하(테스트가 본다).

## 검사

```bash
node --test tools/seo-global.test.mjs     # 가이드 단어 수(600~1000)·예시·FAQ, hreflang, sitemap, vercel.json 경로, 링크 깨짐, 페이지 크기
npx jest src/__tests__/kkti-share-api     # 기존 vercel.json 경로 순서
npx eslint tools/seo-*.mjs tools/copy-site.mjs --max-warnings=0
```

빌드 결과를 직접 보려면 Expo 웹 출력이 든 임시 폴더에서 돌린다 (작업 폴더의 dist 를 건드리지 않음):

```bash
npx expo export --platform web --output-dir <임시>/expo-web
mkdir <임시>/run && cp -r site <임시>/run/site && cp -r <임시>/expo-web <임시>/run/dist
cd <임시>/run && node <저장소>/tools/copy-site.mjs     # → <임시>/run/dist/en/… · ja/ · sitemap.xml
```

## 랜딩 언어 더하기 (예: 프랑스어)

1. `docs/store-listing/fr.json` 이 있어야 한다 (`node tools/i18n/check-listings.mjs` 통과).
2. `tools/seo-global.mjs` 의 `LANDING` 에 `fr: { htmlLang, ogLocale, label, h1, how, featuresH, cta, shot, guides, footer }` 한 덩어리를 더한다. **짧은 화면 문구만** 쓰고 기능 설명은 쓰지 않는다(스토어 문구가 맡음).
3. `vercel.json` 의 `/:lang(en|ja|es|pt)` 두 줄에 `fr` 을 더한다 (`/:lang(en|ja|es|pt|fr)` 와 `/:lang(en|ja|es|pt|fr)/`).
4. `node --test tools/seo-global.test.mjs` — hreflang 묶음·sitemap·경로는 자동으로 따라온다.

## 영어 가이드 더하기

`tools/seo-guides-en.mjs` 의 `GUIDES_EN` 에 항목 하나를 더하면 페이지·모아 보기·다른 가이드의 「More texting guides」·sitemap 이 모두 따라온다.

```js
{
  slug: 'first-text-to-crush',            // 주소 /en/guide/first-text-to-crush (영어 소문자·하이픈)
  title: '...',                            // 60자 이하 (뒤에 「 | My Love Coach」가 붙는다)
  h1: '...',
  description: '...',                      // 100~165자
  intro: ['문단', '문단'],
  sections: [
    { h: '소제목', body: [
      '문단 — [링크 글자](/en/guide/double-texting) · **굵게** 를 쓸 수 있다',
      { ul: ['목록'] }, { ol: ['번호 목록'] },
      { ex: [{ tone: 'Playful', text: '보낼 문장', why: '왜 통하는지' }] },
    ] },
  ],
  faq: [{ q, a }],                         // 3개 이상 — FAQPage 구조화 데이터
  ctaNote: '...',                          // (선택) 앱 안내 문단에 한 줄 더 — 스토어 문구에 있는 기능만
  q: '웹 앱 입력칸에 미리 채울 상황',        // 200자 이하
}
```

본문은 600~1000 단어, 예시 문장 4개 이상(테스트가 센다). 다른 가이드로 거는 링크는 있는 slug 여야 한다.

## 가이드 번역 (Codex 에 맡길 때)

지금 생성기는 영어 가이드만 만든다. 다른 언어 가이드를 내려면:

1. **글 번역 (Codex)**: `tools/seo-guides-en.mjs` 를 그대로 옮겨 `tools/seo-guides-<언어>.mjs` (`export const GUIDES_JA = [...]`) 를 만든다. 형식·`slug` 는 그대로 두고(같은 slug 끼리 hreflang 으로 묶는다) `title·h1·description·intro·sections·faq·q` 만 번역한다. 직역보다 그 나라 20대가 실제로 쓰는 말(일본어: 既読スルー·脈あり·追いLINE, 스페인어: dejar en visto, 포르투갈어: deixar no vácuo)로. 예시 문장은 그 나라 메신저 말투로 다시 쓴다. 숫자·통계를 더하지 않는다.
2. **생성기 (Claude)**: `seo-global.mjs` 에서 가이드 화면 문구(「Why it works」「Texting guides」「Stuck on your own chat?」 문단·바닥글)를 `LANDING[언어].guide` 로 옮기고, `guidePage`·`guidesHub`·`GLOBAL_PATHS` 가 언어를 받게 바꾼다. 같은 slug 의 언어별 가이드끼리 hreflang 을 넣는다.
3. `vercel.json` 에 `/<언어>/guide`·`/<언어>/guide/:slug` 를 더하고, 랜딩의 「가이드(영어)」 링크를 그 언어 모아 보기로 바꾼다.
4. 테스트의 단어 수 검사는 영어 기준이다 — 일본어는 글자 수(대략 1,500~3,000자)로 따로 본다.

## 출시 뒤 할 일

- Google Search Console 에 `sitemap.xml` 을 다시 제출하고 `/en/` · `/en/guide/left-on-read` URL 검사 → 색인 요청.
- 유럽·영국·스위스는 Play 출시 지역이 아니라(`docs/GLOBAL_LAUNCH.md`) 그곳 사람이 Play 버튼을 누르면 「이 국가에서 사용할 수 없음」이 뜬다. 지역을 열면 저절로 해결.
- App Store 는 세계 판매 지역을 열기 전(`node tools/asc-global.mjs --availability --apply`)에는 한국 밖에서 아이폰 버튼을 누르면 「이 국가 또는 지역에서 사용할 수 없음」이 뜬다. 영어판 승인·지역 열기 뒤 확인할 것.
