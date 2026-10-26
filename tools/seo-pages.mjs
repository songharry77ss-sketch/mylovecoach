/**
 * 검색 로봇(구글·네이버)이 읽을 HTML 을 웹 빌드 때 만든다. 서버 함수는 늘리지 않는다 — 전부 dist/ 정적 파일.
 *  - appVariants(expoHtml): Expo 가 만든 앱 화면(dist/index.html)을 주소별 머리말·본문으로 복제한다
 *      index.html       홈(/)과 그 밖의 앱 화면 — 제목·설명·canonical·JSON-LD·로봇용 본문
 *      kkti.html        /kkti — KKTI 테스트 제목·설명·16유형 링크 (vercel.json 이 /kkti 를 여기로 넘긴다)
 *      kkti-result.html /kkti/result — 사람마다 다른 결과라 noindex
 *    <div id="root"> 안의 본문은 JS 가 뜨면 React(createRoot)가 지우고 앱을 그린다. 사람·로봇 모두 같은 HTML 을 받는다.
 *  - staticPages(): /kkti/types, /kkti/type/<mbti> 16개, sitemap.xml
 * 주의: dist/kkti/index.html · dist/kkti/result/… 는 만들지 않는다 — 정적 파일이 rewrites 보다 먼저라
 *       카톡 미리보기(수집기 → api/kkti-card) 규칙이 죽는다. 유형 페이지는 dist/kkti/type/ 아래에만 둔다.
 * src/lib/kkti.ts 를 그대로 불러온다 (Node 22.18+ 는 타입만 지우고 .ts 를 바로 읽는다).
 */
import { KKTI_AXES, KKTI_QUESTIONS, KKTI_TYPES, cardUrl, computeKkti, matchReason } from '../src/lib/kkti.ts';

export const SITE = (process.env.SITE_URL || 'https://mylovecoach.vercel.app').replace(/\/+$/, '');
export const MARK = '<!-- mylovecoach:head -->';
const IOS_APP_ID = '6813404855';
const APP_STORE_URL = `https://apps.apple.com/kr/app/id${IOS_APP_ID}`;
const PLAY_URL = 'https://play.google.com/store/apps/details?id=app.mylovecoach.android';
const BRAND = '나만의 연애코치';

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const e = (s) => String(s).replace(/[&<>"']/g, (c) => ESC[c]);
const ld = (obj) => `<script type="application/ld+json">${JSON.stringify(obj).replace(/</g, '\\u003c')}</script>`;

// ───────── KKTI 유형 → 주소 ─────────
/** 유형 코드(선빠폭직) → MBTI 글자(ESFJ). 축 순서 = MBTI 글자 순서 */
const mbtiOf = (code) => Array.from(code).map((ch, i) => (ch === KKTI_AXES[i].plus.letter ? KKTI_AXES[i].plus.mbti : KKTI_AXES[i].minus.mbti)).join('');
const slugOf = (code) => mbtiOf(code).toLowerCase();
const typePath = (code) => `/kkti/type/${slugOf(code)}`;
/** 유형마다 대표 답 코드 — 결과 카드 그림(og:image, 이미 있는 api/kkti-card)에 쓴다. 테스트의 answersFor 와 같은 방법 */
function encodedOf(code) {
  const letters = Array.from(code);
  const answers = KKTI_QUESTIONS.map((q) => {
    const i = KKTI_AXES.findIndex((a) => a.key === q.axis);
    const sign = letters[i] === KKTI_AXES[i].plus.letter ? 1 : -1;
    return q.options.findIndex((o) => o.score === sign * 2);
  });
  return computeKkti(answers).encoded;
}
const TYPES = Object.values(KKTI_TYPES);

// ───────── 머리말 ─────────
function headTags({ title, description, path, ogTitle = title, ogDescription = description, image = `${SITE}/og.png`, size = [1024, 500], robots, siteName = BRAND, extra = [] }) {
  const url = path == null ? null : `${SITE}${path}`;
  return [
    MARK,
    `<title>${e(title)}</title>`,
    `<meta name="description" content="${e(description)}">`,
    robots ? `<meta name="robots" content="${robots}">` : '',
    url ? `<link rel="canonical" href="${e(url)}">` : '',
    '<meta property="og:type" content="website">',
    `<meta property="og:site_name" content="${e(siteName)}">`,
    '<meta property="og:locale" content="ko_KR">',
    `<meta property="og:title" content="${e(ogTitle)}">`,
    `<meta property="og:description" content="${e(ogDescription)}">`,
    url ? `<meta property="og:url" content="${e(url)}">` : '',
    `<meta property="og:image" content="${e(image)}">`,
    `<meta property="og:image:width" content="${size[0]}">`,
    `<meta property="og:image:height" content="${size[1]}">`,
    '<meta name="twitter:card" content="summary_large_image">',
    '<meta name="theme-color" content="#3DA0F2">',
    ...extra,
  ]
    .filter(Boolean)
    .join('\n');
}

// 소유 확인 메타 태그 (Vercel 환경 변수에 값만 넣는다. HTML 파일 방식이면 site/ 에 파일을 두면 되고 이건 비워 둔다)
const verifyTags = () =>
  [
    process.env.GOOGLE_SITE_VERIFICATION && `<meta name="google-site-verification" content="${e(process.env.GOOGLE_SITE_VERIFICATION)}">`,
    process.env.NAVER_SITE_VERIFICATION && `<meta name="naver-site-verification" content="${e(process.env.NAVER_SITE_VERIFICATION)}">`,
  ].filter(Boolean);

// 아이폰 사파리 앱 설치 배너 — 지금처럼 KKTI 주소(/k, /kkti)에서는 띄우지 않는다
const BANNER = `<script>if(!/^\\/(k|kkti)(\\/|$)/.test(location.pathname))document.write('<meta name="apple-itunes-app" content="app-id=${IOS_APP_ID}">');</script>`;

// 로봇용 본문 스타일 — JS 가 뜨기 전 잠깐 보이므로 인트로 배경색에 맞춘다
const SHELL_CSS = `<style>.seo{flex:1;overflow:auto;padding:40px 20px 64px;background:#EEF7FF;color:#191F28;font:16px/1.65 -apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Pretendard","Noto Sans KR",sans-serif}.seo>*{max-width:560px;margin-left:auto;margin-right:auto}.seo h1{font-size:24px;line-height:1.35;margin-top:0}.seo h2{font-size:18px;margin-top:28px}.seo a{color:#1B6FD1;font-weight:600}.seo .cta a{display:inline-block;margin:4px 12px 4px 0}.seo-center{display:flex;flex-direction:column;justify-content:center;text-align:center;background:#FFF1F5}@media (prefers-color-scheme:dark){.seo{background:#0F1419;color:#E8EDF2}.seo a{color:#7FC0FF}}</style>`;

const ORG = { '@type': 'Organization', '@id': `${SITE}/#org`, name: '크레이빙(CRAVING)', url: `${SITE}/`, email: 'contact@craving.win', logo: `${SITE}/icon.png` };
const APP_DESC = '대화 캡처를 올리면 상대에게 딱 맞는 답장 3개와 호감 온도를 알려주는 AI 연애 코치';
const app = (os, url) => ({
  '@type': 'MobileApplication',
  name: BRAND,
  operatingSystem: os,
  applicationCategory: 'LifestyleApplication',
  inLanguage: 'ko',
  description: APP_DESC,
  image: `${SITE}/icon.png`,
  url,
  installUrl: url,
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'KRW' },
  publisher: { '@id': `${SITE}/#org` },
});

const HOME = {
  head: () =>
    headTags({
      title: '나만의 연애코치 · 카톡 답장 추천·호감도 분석 AI 연애 상담',
      description: '카톡·인스타 DM 캡처 한 장이면 AI가 상대 속마음과 호감 온도를 읽고 보낼 답장 3개를 추천해요. 썸·소개팅·읽씹 고민부터 연애 연습, 카톡 연애 MBTI 테스트까지.',
      ogTitle: '나만의 연애코치 · 캡처 한 장이면 답장이 나와요',
      ogDescription: APP_DESC,
      path: '/',
      extra: [
        ...verifyTags(),
        BANNER,
        ld({
          '@context': 'https://schema.org',
          '@graph': [
            ORG,
            { '@type': 'WebSite', '@id': `${SITE}/#website`, url: `${SITE}/`, name: BRAND, alternateName: ['연애코치', '나만의연애코치'], inLanguage: 'ko-KR', publisher: { '@id': `${SITE}/#org` } },
            app('iOS', APP_STORE_URL),
            app('Android', PLAY_URL),
          ],
        }),
        SHELL_CSS,
      ],
    }),
  body: () => `<main class="seo">
<h1>나만의 연애코치 · 카톡 캡처 한 장으로 받는 AI 연애 상담</h1>
<p>카톡·인스타 DM 캡처를 올리거나 지금 상황을 글로 적으면, AI 연애 코치가 상대의 속마음과 호감 온도를 읽고 지금 보내기 좋은 답장 3개를 추천해요. 회원가입 없이 먼저 체험할 수 있어요.</p>
<h2>이런 고민에 써요</h2>
<ul>
<li><b>카톡 답장 추천</b> — 썸남·썸녀가 「뭐해?」라고 보냈을 때, 톤별 답장 3개를 바로 복사</li>
<li><b>호감도 분석</b> — 답장 속도·질문·이모티콘으로 상대 호감 온도를 숫자로</li>
<li><b>속마음 풀이</b> — 애매한 한마디에 숨은 뜻 해석</li>
<li><b>연애 연습</b> — AI 상대와 소개팅·썸 대화를 미리 연습</li>
<li><b><a href="/kkti">KKTI 연애 MBTI 테스트</a></b> — 카톡 습관 12문항으로 보는 16가지 연애 유형</li>
</ul>
<p class="cta"><a href="/start">웹에서 바로 써 보기</a><a href="${APP_STORE_URL}">App Store에서 받기</a><a href="${PLAY_URL}">Google Play에서 받기</a></p>
<p><a href="/support.html">고객지원·자주 묻는 질문</a> · <a href="/privacy.html">개인정보 처리방침</a> · <a href="/terms.html">이용약관</a></p>
</main>`,
};

const KKTI_TITLE = 'KKTI 연애 MBTI 테스트 · 카톡 습관으로 보는 진짜 연애 유형 (무료 1분)';
const KKTI_DESC = '선톡, 답장 속도, 이모지 습관 12문항으로 보는 카톡 연애 테스트. 16가지 연애 유형과 카톡 속 진짜 MBTI, 애니어그램, 나만의 연애 컬러, 친구와 궁합까지 1분이면 끝나요.';
const KKTI = {
  head: () =>
    headTags({
      title: KKTI_TITLE,
      description: KKTI_DESC,
      ogTitle: '카톡으로 보는 진짜 연애 MBTI · KKTI',
      path: '/kkti',
      siteName: 'KKTI',
      image: `${SITE}/api/kkti-card`,
      size: [1200, 630],
      extra: [
        ld({
          '@context': 'https://schema.org',
          '@type': 'WebApplication',
          name: 'KKTI 카톡 연애 MBTI 테스트',
          url: `${SITE}/kkti`,
          applicationCategory: 'EntertainmentApplication',
          operatingSystem: 'Web',
          inLanguage: 'ko',
          isAccessibleForFree: true,
          description: KKTI_DESC,
          offers: { '@type': 'Offer', price: '0', priceCurrency: 'KRW' },
          publisher: ORG,
        }),
        SHELL_CSS,
      ],
    }),
  // 공유 링크로 오는 사람이 가장 많은 입구라 짧게 — JS 가 뜨기 전 잠깐 보이는 로딩 문구처럼 가운데에 둔다.
  // 16유형 자세한 글은 /kkti/types · /kkti/type/<mbti> 정적 페이지가 맡는다
  body: () => `<main class="seo seo-center">
<h1>KKTI · 카톡으로 보는 진짜 연애 MBTI 테스트</h1>
<p>${e(KKTI_DESC)}</p>
<p><a href="/kkti/types">16가지 연애 유형 보기</a></p>
</main>`,
};

const RESULT = {
  head: () => headTags({ title: 'KKTI 결과 · 카톡으로 보는 진짜 연애 MBTI', description: KKTI_DESC, path: null, robots: 'noindex, follow', siteName: 'KKTI', extra: [SHELL_CSS] }),
  body: () => `<main class="seo"><h1>KKTI 결과</h1><p><a href="/kkti">나도 1분 테스트 하기</a> · <a href="/kkti/types">16유형 보기</a></p></main>`,
};

/** Expo 가 만든 앱 화면 HTML 하나 → 주소별 파일들 */
export function appVariants(expoHtml) {
  for (const anchor of ['</head>', '<div id="root"></div>', '<title>']) {
    if (!expoHtml.includes(anchor)) throw new Error(`dist/index.html 에 ${anchor} 가 없습니다 (Expo 웹 출력 형식이 바뀜)`);
  }
  if (expoHtml.includes(MARK)) throw new Error('dist/index.html 에 이미 머리말이 들어 있습니다 (expo export 를 다시 하세요)');
  const make = ({ head, body }) =>
    expoHtml
      .replace('<html lang="en">', '<html lang="ko">')
      .replace(/<title>[^<]*<\/title>\s*/, '')
      .replace('</head>', `${head()}\n</head>`)
      .replace(/<noscript>[\s\S]*?<\/noscript>/, '<noscript>자바스크립트를 켜면 나만의 연애코치를 바로 쓸 수 있어요.</noscript>')
      .replace('<div id="root"></div>', `<div id="root">${body()}</div>`);
  return { 'index.html': make(HOME), 'kkti.html': make(KKTI), 'kkti-result.html': make(RESULT) };
}

// ───────── 정적 페이지 (유형 16개 + 모아 보기) ─────────
const PAGE_CSS = `:root{color-scheme:light dark}*{box-sizing:border-box}body{margin:0;background:#FFF1F5;color:#191F28;font:16px/1.7 -apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Pretendard","Noto Sans KR",sans-serif}main{max-width:640px;margin:0 auto;padding:32px 20px 72px}nav{font-size:14px;color:#6B7684}nav a,main a{color:#C2185B}h1{font-size:26px;line-height:1.35;margin:12px 0}h2{font-size:19px;margin-top:32px}.card{background:#fff;border-radius:20px;padding:18px 20px;margin:12px 0}.cta{display:block;text-align:center;background:#FF5C8A;color:#fff!important;text-decoration:none;font-weight:700;border-radius:16px;padding:16px;margin:28px 0}img{width:100%;height:auto;border-radius:16px}ul.grid{list-style:none;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px}ul.grid a{display:block;background:#fff;border-radius:14px;padding:10px 12px;text-decoration:none}small{color:#6B7684}@media (prefers-color-scheme:dark){body{background:#17121A;color:#EDE7EE}.card,ul.grid a{background:#241C27}nav,small{color:#A99FAD}main a{color:#FF8FB1}}`;

function page({ path, title, description, image, size = [1200, 630], jsonLd, main }) {
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${headTags({ title, description, path, image, size, siteName: 'KKTI' }).replace(`${MARK}\n`, '')}
<link rel="icon" href="/favicon.ico">
${jsonLd.map(ld).join('\n')}
<style>${PAGE_CSS}</style>
</head>
<body>
<main>
${main}
<p><small>KKTI는 카톡 습관으로 보는 재미용 연애 유형 테스트예요. 공식 MBTI® 검사와는 관계가 없어요. · <a href="/">${BRAND}</a> · <a href="/privacy.html">개인정보 처리방침</a></small></p>
</main>
</body>
</html>
`;
}

const crumbs = (items) => ({
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: items.map(([name, path], i) => ({ '@type': 'ListItem', position: i + 1, name, item: `${SITE}${path}` })),
});
const typeLink = (t) => `<a href="${typePath(t.code)}">${mbtiOf(t.code)} ${t.emoji} ${e(t.name)}</a>`;

function typePage(t) {
  const mbti = mbtiOf(t.code);
  const best = KKTI_TYPES[t.bestMatch];
  const worst = KKTI_TYPES[t.worstMatch];
  const poles = Array.from(t.code).map((ch, i) => {
    const a = KKTI_AXES[i];
    const p = ch === a.plus.letter ? a.plus : a.minus;
    return `<li><b>${a.emoji} ${e(a.label)}</b>: ${e(p.label)} (${e(p.letter)} · ${p.mbti})</li>`;
  });
  const cta = `/kkti?utm_source=seo&utm_medium=kkti_type&utm_campaign=${mbti.toLowerCase()}`;
  return page({
    path: typePath(t.code),
    title: `${mbti} 연애 스타일 · 카톡 속 ${t.name} ${t.emoji} | KKTI 연애 MBTI`,
    description: `${mbti} ${t.name}(${t.code}) — ${t.oneLiner}. ${t.description}`,
    image: cardUrl(encodedOf(t.code), null, 'og', SITE),
    jsonLd: [crumbs([[BRAND, '/'], ['KKTI 연애 MBTI 테스트', '/kkti'], ['16가지 유형', '/kkti/types'], [`${mbti} ${t.name}`, typePath(t.code)]])],
    main: `<nav><a href="/kkti">KKTI 테스트</a> › <a href="/kkti/types">16가지 유형</a> › ${mbti}</nav>
<h1>${mbti} 연애 유형: ${t.emoji} ${e(t.name)} <small>(${e(t.code)})</small></h1>
<p><b>${e(t.oneLiner)}</b></p>
<p>${e(t.description)}</p>
<h2>${mbti} ${e(t.name)}의 카톡 습관</h2>
<ul>${poles.join('')}</ul>
<div class="card"><h2>연애할 때 장점</h2><ul>${t.strengths.map((s) => `<li>${e(s)}</li>`).join('')}</ul></div>
<div class="card"><h2>조심하면 좋은 점</h2><ul>${t.watchOut.map((s) => `<li>${e(s)}</li>`).join('')}</ul></div>
<h2>${mbti}와 잘 맞는 유형</h2>
<p>${typeLink(best)} — ${e(matchReason(t.code, best.code))}</p>
<h2>${mbti}와 안 맞는 유형</h2>
<p>${typeLink(worst)} — ${e(matchReason(t.code, worst.code))}</p>
<h2>연애 코치 한마디</h2>
<p>${e(t.coachTip)}</p>
<a class="cta" href="${cta}">나도 1분 카톡 연애 테스트 하기</a>
<h2>다른 연애 유형</h2>
<ul class="grid">${TYPES.filter((x) => x.code !== t.code).map((x) => `<li>${typeLink(x)}</li>`).join('')}</ul>`,
  });
}

function typesHub() {
  return page({
    path: '/kkti/types',
    title: '연애 MBTI 16유형 총정리 · 카톡 습관으로 보는 KKTI 연애 유형',
    description: '선톡·답장 속도·리액션·진도, 4가지 카톡 습관으로 나누는 16가지 연애 유형. ESFJ 직진 불도저부터 INTP 신비주의 읽씹러까지 유형별 특징과 궁합을 한눈에.',
    image: `${SITE}/api/kkti-card`,
    jsonLd: [
      crumbs([[BRAND, '/'], ['KKTI 연애 MBTI 테스트', '/kkti'], ['16가지 유형', '/kkti/types']]),
      { '@context': 'https://schema.org', '@type': 'ItemList', itemListElement: TYPES.map((t, i) => ({ '@type': 'ListItem', position: i + 1, url: `${SITE}${typePath(t.code)}`, name: `${mbtiOf(t.code)} ${t.name}` })) },
    ],
    main: `<nav><a href="/kkti">KKTI 테스트</a> › 16가지 유형</nav>
<h1>연애 MBTI 16유형 총정리 · KKTI</h1>
<p>KKTI는 카톡 습관 4가지로 연애 유형을 나눠요. 글자 하나가 MBTI 글자 하나와 이어져요.</p>
<ul>${KKTI_AXES.map((a) => `<li><b>${a.emoji} ${e(a.label)}</b>: ${e(a.plus.letter)} ${e(a.plus.label)}(${a.plus.mbti}) / ${e(a.minus.letter)} ${e(a.minus.label)}(${a.minus.mbti})</li>`).join('')}</ul>
${TYPES.map((t) => `<div class="card"><h2>${typeLink(t)}</h2><p>${e(t.oneLiner)}</p></div>`).join('\n')}
<a class="cta" href="/kkti?utm_source=seo&utm_medium=kkti_types">내 유형 1분 만에 알아보기</a>`,
  });
}

function sitemap(paths) {
  const urls = paths.map((p) => `  <url><loc>${SITE}${p}</loc></url>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

/** dist/ 아래 경로 → 내용 */
export function staticPages() {
  const files = { 'kkti/types/index.html': typesHub() };
  for (const t of TYPES) files[`kkti/type/${slugOf(t.code)}/index.html`] = typePage(t);
  files['sitemap.xml'] = sitemap(['/', '/kkti', '/kkti/types', ...TYPES.map((t) => typePath(t.code)), '/support.html', '/privacy.html', '/terms.html']);
  return files;
}
