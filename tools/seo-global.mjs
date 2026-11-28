/**
 * 세계판(My Love Coach) 검색 페이지 — 웹 빌드 때 dist/ 정적 HTML 로 만든다. 서버 함수는 늘리지 않는다.
 * tools/seo-pages.mjs 의 staticPages() 가 globalPages() 를 합치고, sitemap.xml 에 GLOBAL_PATHS 를 더한다.
 *
 *  - /en/ · /ja/ · /es/ · /pt/   소개(랜딩). 기능 설명은 스토어 문구 docs/store-listing/<언어>.json 의 description 을
 *                                 그대로 쓴다(지어내지 않음). 언어마다 따로 쓴 건 제목·버튼·사용법 3줄 같은 짧은 문구(LANDING)뿐.
 *  - /en/guide · /en/guide/<slug> 영어 상황별 문자 가이드 (글은 tools/seo-guides-en.mjs)
 *  - hreflang: 랜딩 4개 + 한국어 홈(/)을 서로 묶는다(x-default = /en/). 한국어 가이드와는 주제가 달라 묶지 않는다.
 *  - 스토어 버튼: 안드로이드는 Google Play, 아이폰은 App Store 를 앞에 크게(다른 쪽은 글자 링크로), PC 는 둘 다.
 *    head 의 짧은 스크립트 한 줄이 <html> 에 is-android / is-ios 를 붙일 뿐이고, 스크립트가 없으면 둘 다 보인다.
 *  - Play 링크에는 referrer(utm_source=seo …)를 붙인다 → 앱의 설치 경로(install-attribution)가 읽는다.
 * 쓰는 법·언어/가이드 추가는 docs/GLOBAL_SEO.md.
 */
import { readFileSync } from 'node:fs';

import { GUIDES_EN } from './seo-guides-en.mjs';

/** tools/seo-pages.mjs 의 SITE 와 같은 값 (서로 불러오면 순환이라 같은 식을 둔다 — 테스트가 같은지 본다) */
export const SITE = (process.env.SITE_URL || 'https://mylovecoach.vercel.app').replace(/\/+$/, '');
const IOS_APP_ID = '6813404855';
/** 나라 없는 주소 — 보는 사람의 App Store 나라로 열린다 (한국어 페이지는 /kr/ 주소를 그대로 쓴다) */
export const APP_STORE_URL = `https://apps.apple.com/app/id${IOS_APP_ID}`;
export const PLAY_URL = 'https://play.google.com/store/apps/details?id=app.mylovecoach.android';
const BRAND = 'My Love Coach';
/** 가이드 글을 처음 낸 날 (Article 구조화 데이터·「Updated」 표시). 글을 크게 고치면 UPDATED 를 바꾼다 */
const PUBLISHED = '2026-11-28';
const UPDATED = '2026-11-28';
const OG_IMAGE = { url: `${SITE}/en/og.png`, width: 1024, height: 500 };
const SHOT = { src: '/en/app-replies.jpg', width: 540, height: 960 };

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const e = (s) => String(s).replace(/[&<>"']/g, (c) => ESC[c]);
const ld = (obj) => `<script type="application/ld+json">${JSON.stringify(obj).replace(/</g, '\\u003c')}</script>`;
/** 가이드 글 안의 [글자](/경로) → 링크, **글자** → 굵게 (먼저 이스케이프한다) */
const rich = (s) =>
  e(s)
    .replace(/\[([^\]]+)\]\((\/[^)\s]*)\)/g, '<a href="$2">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
/** 스토어 문구 속 사이트 주소 → 같은 사이트 링크 (글자는 주소 그대로) */
const linkify = (s) => e(s).replace(/https:\/\/mylovecoach\.vercel\.app(\/[^\s<]*)/g, (all, p) => `<a href="${p}">${all}</a>`);

// ───────── 언어별 랜딩 문구 ─────────
// 기능·가격·약속은 스토어 문구(listing)에서만 가져온다. 여기에는 제목·버튼·사용법처럼 짧은 화면 문구만 둔다.
// 새 언어: docs/store-listing/<언어>.json 이 있으면 아래에 한 덩어리 더하면 된다 (docs/GLOBAL_SEO.md).
const LANDING = {
  en: {
    htmlLang: 'en',
    ogLocale: 'en_US',
    label: 'English',
    h1: 'My Love Coach: your AI dating coach for what to text back',
    how: {
      h: 'How it works',
      steps: [
        `Upload a screenshot of your chat — or just describe what's going on.`,
        'Get 3 replies you can send right now, plus how interested they seem.',
        'Pick the one that sounds like you, copy it, and send.',
      ],
    },
    featuresH: 'What My Love Coach does',
    cta: { play: 'Get it on Google Play', ios: 'Download on the App Store', web: 'Or try it in your browser' },
    shot: { alt: 'My Love Coach screen showing 3 suggested replies with success rates', caption: 'From the app, with a demo chat. Success rates are AI estimates.' },
    guides: { h: 'Texting guides', intro: 'Practical, respectful advice for the moments everyone gets stuck on.', all: 'All texting guides' },
    footer: { ai: 'Replies, readings and analysis are AI-generated suggestions — check they fit your situation before sending.', privacy: 'Privacy Policy', terms: 'Terms of Use', support: 'Support' },
  },
  ja: {
    htmlLang: 'ja',
    ogLocale: 'ja_JP',
    label: '日本語',
    h1: 'My Love Coach — トークのスクショから返信を提案するAI恋愛コーチ',
    how: {
      h: '使い方',
      steps: ['トークのスクショをアップ。スクショがなければ、状況を書くだけでもOK。', 'すぐ送れる返信3つと、相手の脈あり度をチェック。', '自分らしい返信を選んでコピーし、送信。'],
    },
    featuresH: 'My Love Coachでできること',
    cta: { play: 'Google Play で手に入れよう', ios: 'App Store からダウンロード', web: 'ブラウザで試す（英語）' },
    shot: { alt: '成功率付きの返信3つを表示するMy Love Coachの画面', caption: 'アプリの画面（デモ会話・英語表示）。成功率はAIによる推定です。' },
    guides: { h: '恋愛メッセージのガイド（英語）', intro: '既読スルー、デートの誘い方、けんかの後の仲直りなど、迷いやすい場面のガイドです（英語）。', all: 'ガイド一覧（英語）' },
    footer: { ai: '返信や分析はAIによる提案です。送信前に、自分の状況に合うか確認してください。', privacy: 'プライバシーポリシー（英語）', terms: '利用規約（英語）', support: 'サポート（英語）' },
  },
  es: {
    htmlLang: 'es',
    ogLocale: 'es_ES',
    label: 'Español',
    h1: 'My Love Coach: tu coach de citas con IA para saber qué responder',
    how: {
      h: 'Cómo funciona',
      steps: ['Sube una captura del chat o, si no tienes, cuenta qué pasa.', 'Recibe 3 respuestas listas para enviar y una estimación de su interés.', 'Elige la que suene a ti, cópiala y envíala.'],
    },
    featuresH: 'Qué puedes hacer con My Love Coach',
    cta: { play: 'Disponible en Google Play', ios: 'Descargar en el App Store', web: 'Probar en el navegador (en inglés)' },
    shot: { alt: 'Pantalla de My Love Coach con 3 respuestas sugeridas y su probabilidad de éxito', caption: 'Captura de la app con un chat de demostración (en inglés). La probabilidad de éxito es una estimación de la IA.' },
    guides: { h: 'Guías para chatear (en inglés)', intro: 'Consejos prácticos y respetuosos para los momentos en los que todos nos atascamos.', all: 'Ver todas las guías (en inglés)' },
    footer: { ai: 'Las respuestas y los análisis son sugerencias de IA. Comprueba que encajan con tu situación antes de enviarlas.', privacy: 'Política de privacidad (en inglés)', terms: 'Condiciones de uso (en inglés)', support: 'Soporte (en inglés)' },
  },
  pt: {
    htmlLang: 'pt-BR',
    ogLocale: 'pt_BR',
    label: 'Português',
    h1: 'My Love Coach: seu coach de paquera com IA para saber o que responder',
    how: {
      h: 'Como funciona',
      steps: ['Envie um print da conversa ou, se preferir, conte o que aconteceu.', 'Receba 3 respostas prontas para enviar e uma estimativa do interesse da pessoa.', 'Escolha a que tem a sua cara, copie e envie.'],
    },
    featuresH: 'O que o My Love Coach faz',
    cta: { play: 'Disponível no Google Play', ios: 'Baixar na App Store', web: 'Testar no navegador (em inglês)' },
    shot: { alt: 'Tela do My Love Coach com 3 respostas sugeridas e chance de sucesso', caption: 'Tela do app com uma conversa de demonstração (em inglês). A chance de sucesso é uma estimativa da IA.' },
    guides: { h: 'Guias de conversa (em inglês)', intro: 'Dicas práticas e respeitosas para os momentos em que todo mundo trava.', all: 'Ver todos os guias (em inglês)' },
    footer: { ai: 'Respostas e análises são sugestões de IA. Veja se combinam com a sua situação antes de enviar.', privacy: 'Política de Privacidade (em inglês)', terms: 'Termos de Uso (em inglês)', support: 'Suporte (em inglês)' },
  },
};

export const LANDING_LANGS = Object.keys(LANDING);
export const landingPath = (lang) => `/${lang}/`;
export const guidePath = (g) => `/en/guide/${g.slug}`;
const GUIDE_HUB = '/en/guide';

/** 스토어 등록 문구 (언어별 원본) */
export const listingOf = (lang) => JSON.parse(readFileSync(new URL(`../docs/store-listing/${lang}.json`, import.meta.url), 'utf8'));

/** 한국어 홈(/)과 언어별 랜딩을 서로 잇는 hreflang — 랜딩마다, 그리고 한국어 홈 머리말에 같은 묶음을 넣는다 */
export function hreflangLinks() {
  const alternates = [['ko', '/'], ...LANDING_LANGS.map((l) => [l, landingPath(l)]), ['x-default', landingPath('en')]];
  return alternates.map(([lang, p]) => `<link rel="alternate" hreflang="${lang}" href="${e(`${SITE}${p}`)}">`);
}

// ───────── 공통 머리말·스타일 ─────────
// 한국어 정적 페이지(tools/seo-pages.mjs PAGE_CSS)와 같은 색·카드·그라데이션 버튼
const CSS = `:root{color-scheme:light dark}*{box-sizing:border-box}body{margin:0;background:#F4F6FF;color:#191F28;font:17px/1.7 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;-webkit-text-size-adjust:100%}html[lang=ja] body{font-family:-apple-system,BlinkMacSystemFont,"Hiragino Sans","Hiragino Kaku Gothic ProN","Noto Sans JP","Yu Gothic UI",Meiryo,sans-serif}a{color:#2F4FE0}main{overflow-wrap:break-word}.card a{overflow-wrap:anywhere}header.top,main,footer{max-width:680px;margin:0 auto;padding-left:20px;padding-right:20px}header.top{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px 16px;padding-top:16px;font-size:14px}.brand{font-weight:800;font-size:16px;color:#191F28;text-decoration:none;white-space:nowrap}.brand::before{content:"";display:inline-block;width:22px;height:22px;margin-right:8px;border-radius:7px;vertical-align:-5px;background:linear-gradient(135deg,#5D86FF 0%,#3D63F5 50%,#7559F6 100%)}header.top nav{display:flex;flex-wrap:wrap;gap:2px 14px}header.top nav a{color:#6B7684;text-decoration:none}header.top nav a[aria-current]{color:#191F28;font-weight:700}main{padding-top:16px;padding-bottom:40px}h1{font-size:30px;line-height:1.25;letter-spacing:-.4px;margin:12px 0}h2{font-size:21px;line-height:1.35;margin:36px 0 10px}h3{font-size:17px;line-height:1.4;margin:22px 0 4px}.card h3{margin-top:0}.lead{font-size:18px;color:#333D4B}.crumbs,.meta,footer,figcaption{font-size:14px;color:#6B7684}.card,.cta-box{background:#fff;border-radius:20px;padding:18px 20px;margin:12px 0}.cta-box{border-radius:24px;padding:22px 20px;margin:36px 0}.cta-box h2{margin-top:0}.card p,.cta-box p{margin:6px 0}.ex{background:#fff;border-radius:20px;padding:16px 18px;margin:12px 0}.ex .tone{margin:0 0 8px;font-size:13px;font-weight:700;letter-spacing:.03em;text-transform:uppercase;color:#3D63F5}.bubble{display:inline-block;margin:0;padding:10px 14px;border-radius:18px 18px 4px 18px;background:linear-gradient(135deg,#5D86FF 0%,#3D63F5 100%);color:#fff;font-size:16px;line-height:1.5}.why{margin:10px 0 0;font-size:15px;color:#4E5968}.stores{display:flex;flex-wrap:wrap;gap:10px;margin:22px 0 6px}.store{flex:1 1 220px;display:block;text-align:center;padding:15px 16px;border-radius:16px;background:linear-gradient(135deg,#5D86FF 0%,#3D63F5 50%,#7559F6 100%);box-shadow:0 10px 24px rgba(61,79,232,.28);color:#fff;font-weight:700;text-decoration:none}.is-ios .store-ios{order:-1}.is-android .store-ios,.is-ios .store-play{flex-basis:100%;padding:4px;background:none;box-shadow:none;color:#2F4FE0;font-size:15px;font-weight:600}.web{margin:6px 0 0;text-align:center;font-size:15px}.shot{max-width:300px;margin:28px auto;text-align:center}.shot img{display:block;width:100%;height:auto;border-radius:24px;box-shadow:0 12px 32px rgba(25,31,40,.18)}figcaption{margin-top:8px}ol.steps{padding-left:22px}ol.steps li{margin:6px 0}ul.guides{list-style:none;padding:0}ul.guides li{margin:8px 0}ul.guides a{display:block;padding:14px 16px;border-radius:16px;background:#fff;text-decoration:none}ul.guides b{display:block;color:#191F28}ul.guides span{display:block;font-size:14px;color:#6B7684;line-height:1.5}footer{padding-bottom:48px}footer p{margin:6px 0}@media (max-width:480px){h1{font-size:26px}}@media (prefers-color-scheme:dark){body{background:#0D1018;color:#F2F4F8}a{color:#9DB4FF}.brand,header.top nav a[aria-current],ul.guides b{color:#F2F4F8}.card,.cta-box,.ex,ul.guides a{background:#161A24}.lead{color:#D1D6DE}.why{color:#AEB6C4}.crumbs,.meta,footer,figcaption,header.top nav a,ul.guides span{color:#AEB6C4}.ex .tone{color:#9DB4FF}.is-android .store-ios,.is-ios .store-play{color:#9DB4FF}}`;

// 기기에 맞는 스토어 버튼을 앞에 — iPadOS 사파리는 맥으로 보이므로 터치 여부로 가른다
const DEVICE_JS = `<script>(function(){var u=navigator.userAgent,c=/Android/i.test(u)?"is-android":(/iPhone|iPad|iPod/i.test(u)||(/Macintosh/.test(u)&&"ontouchend" in document))?"is-ios":"";if(c)document.documentElement.className+=" "+c})()</script>`;

const ORG = {
  '@type': 'Organization',
  '@id': `${SITE}/#org`,
  name: 'CRAVING',
  alternateName: '크레이빙',
  url: `${SITE}/`,
  email: 'contact@craving.win',
  logo: `${SITE}/icon.png`,
  sameAs: ['https://www.instagram.com/my.lovecoach/', APP_STORE_URL, PLAY_URL],
};

const crumbs = (items) => ({
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: items.map(([name, p], i) => ({ '@type': 'ListItem', position: i + 1, name, item: `${SITE}${p}` })),
});

function layout({ ui, path, title, description, ogType = 'website', alternates = [], header, main, footerNote = '', jsonLd = [] }) {
  const url = `${SITE}${path}`;
  return `<!doctype html>
<html lang="${ui.htmlLang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${e(title)}</title>
<meta name="description" content="${e(description)}">
<link rel="canonical" href="${e(url)}">
${alternates.length ? `${alternates.join('\n')}\n` : ''}<meta property="og:type" content="${ogType}">
<meta property="og:site_name" content="${BRAND}">
<meta property="og:locale" content="${ui.ogLocale}">
<meta property="og:title" content="${e(title)}">
<meta property="og:description" content="${e(description)}">
<meta property="og:url" content="${e(url)}">
<meta property="og:image" content="${e(OG_IMAGE.url)}">
<meta property="og:image:width" content="${OG_IMAGE.width}">
<meta property="og:image:height" content="${OG_IMAGE.height}">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#3D63F5">
<meta name="apple-itunes-app" content="app-id=${IOS_APP_ID}">
<link rel="icon" href="/favicon.ico">
${jsonLd.map(ld).join('\n')}
<style>${CSS}</style>
${DEVICE_JS}
</head>
<body>
<header class="top">${header}</header>
<main>
${main}
</main>
<footer>
${footerNote ? `<p>${footerNote}</p>\n` : ''}<p>${e(ui.footer.ai)}</p>
<p>${BRAND} by CRAVING · <a href="/en/privacy.html">${e(ui.footer.privacy)}</a> · <a href="/en/terms.html">${e(ui.footer.terms)}</a> · <a href="/en/support.html">${e(ui.footer.support)}</a></p>
</footer>
</body>
</html>
`;
}

/** 스토어 버튼 둘 + 웹에서 써 보기. medium·campaign 은 유입 집계용 (Play 는 referrer, 웹은 utm_*) */
function storeButtons(ui, { medium, campaign, q }) {
  const utm = `utm_source=seo&utm_medium=${medium}&utm_campaign=${campaign}`;
  const play = `${PLAY_URL}&referrer=${encodeURIComponent(utm)}`;
  const web = `/start?lang=en${q ? `&q=${encodeURIComponent(q)}` : ''}&${utm}`;
  return `<div class="stores"><a class="store store-play" href="${e(play)}">${e(ui.cta.play)}</a><a class="store store-ios" href="${e(APP_STORE_URL)}">${e(ui.cta.ios)}</a></div>
<p class="web"><a href="${e(web)}">${e(ui.cta.web)}</a></p>`;
}

// ───────── 랜딩 ─────────
/** 스토어 설명(description) → 첫 덩어리(소개)와 나머지(이모지 제목이 있으면 기능 카드) */
export function listingBlocks(description) {
  const blocks = description
    .split(/\n\s*\n/)
    .map((b) => b.split('\n').map((s) => s.trim()).filter(Boolean))
    .filter((b) => b.length);
  const [intro, ...rest] = blocks;
  return { intro, rest: rest.map((lines) => (/^\p{Extended_Pictographic}/u.test(lines[0]) ? { head: lines[0], lines: lines.slice(1) } : { head: null, lines })) };
}

function renderLines(lines) {
  let out = '';
  let list = [];
  const flush = () => {
    if (list.length) out += `<ul>${list.map((li) => `<li>${linkify(li)}</li>`).join('')}</ul>`;
    list = [];
  };
  for (const line of lines) {
    if (/^•\s/.test(line)) list.push(line.replace(/^•\s+/, ''));
    else {
      flush();
      out += `<p>${linkify(line)}</p>`;
    }
  }
  flush();
  return out;
}

const langNav = (current) =>
  `<nav aria-label="Language">${[...LANDING_LANGS.map((l) => [l, landingPath(l), LANDING[l].label]), ['ko', '/', '한국어']]
    .map(([l, p, label]) => `<a href="${p}" hreflang="${l}" lang="${l}"${l === current ? ' aria-current="page"' : ''}>${e(label)}</a>`)
    .join('')}</nav>`;

function guideList(guides) {
  return `<ul class="guides">${guides.map((g) => `<li><a href="${guidePath(g)}"><b>${e(g.h1)}</b><span>${e(g.description)}</span></a></li>`).join('')}</ul>`;
}

function landingPage(lang) {
  const ui = LANDING[lang];
  const listing = listingOf(lang);
  const { intro, rest } = listingBlocks(listing.description);
  const path = landingPath(lang);
  const app = (os, url) => ({
    '@type': 'MobileApplication',
    name: BRAND,
    alternateName: [listing.appName, '센딧'],
    operatingSystem: os,
    applicationCategory: 'LifestyleApplication',
    inLanguage: lang,
    description: listing.shortDescription,
    image: `${SITE}/icon.png`,
    url,
    installUrl: url,
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    publisher: { '@id': `${SITE}/#org` },
  });
  const cta = storeButtons(ui, { medium: `${lang}_landing`, campaign: 'landing' });
  // 마지막 「By CRAVING」 한 줄은 바닥글이 대신한다
  const blocks = rest.filter((b, i) => !(i === rest.length - 1 && !b.head && b.lines.length === 1 && /CRAVING/.test(b.lines[0])));
  const features = blocks.map((b) => (b.head ? `<section class="card"><h3>${e(b.head)}</h3>${renderLines(b.lines)}</section>` : renderLines(b.lines))).join('\n');
  const guides =
    lang === 'en'
      ? `<p>${e(ui.guides.intro)}</p>\n${guideList(GUIDES_EN)}`
      : `<p>${e(ui.guides.intro)}</p>\n<p><a href="${GUIDE_HUB}" hreflang="en">${e(ui.guides.all)}</a></p>`;
  return layout({
    ui,
    path,
    title: `${listing.appName} · ${listing.subtitle}`,
    description: listing.promotionalText,
    alternates: hreflangLinks(),
    header: `<a class="brand" href="${path}">${BRAND}</a>${langNav(lang)}`,
    jsonLd: [{ '@context': 'https://schema.org', '@graph': [ORG, app('iOS', APP_STORE_URL), app('Android', PLAY_URL)] }],
    main: `<h1>${e(ui.h1)}</h1>
${intro.map((p, i) => `<p${i === 0 ? ' class="lead"' : ''}>${linkify(p)}</p>`).join('\n')}
${cta}
<figure class="shot"><img src="${SHOT.src}" width="${SHOT.width}" height="${SHOT.height}" alt="${e(ui.shot.alt)}" loading="lazy" decoding="async"><figcaption>${e(ui.shot.caption)}</figcaption></figure>
<h2>${e(ui.how.h)}</h2>
<ol class="steps">${ui.how.steps.map((s) => `<li>${e(s)}</li>`).join('')}</ol>
<h2>${e(ui.featuresH)}</h2>
${features}
<h2>${e(ui.guides.h)}</h2>
${guides}
${cta}`,
  });
}

// ───────── 영어 가이드 ─────────
const EN = LANDING.en;
const guideHeader = (current) => `<a class="brand" href="/en/">${BRAND}</a><nav><a href="${GUIDE_HUB}"${current ? ' aria-current="page"' : ''}>Texting guides</a><a href="/en/">App</a></nav>`;
const GUIDE_FOOTER = 'Example messages are ideas, not scripts. Every person is different — respect their pace and their answer.';

/** 가이드 본문의 모든 글 (단어 수 세기·검사용) */
export function guideTexts(g) {
  const blockTexts = (b) => (typeof b === 'string' ? [b] : b.ul || b.ol || b.ex.flatMap((x) => [x.tone, x.text, x.why]));
  return [g.h1, ...g.intro, ...g.sections.flatMap((s) => [s.h, ...s.body.flatMap(blockTexts)]), ...g.faq.flatMap((f) => [f.q, f.a]), g.ctaNote ?? ''];
}
/** 본문 단어 수 — 링크 표시·굵게 표시는 빼고, 글자나 숫자가 든 낱말만 센다 */
export function guideWords(g) {
  return guideTexts(g)
    .map((s) => s.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/\*\*/g, ''))
    .join(' ')
    .split(/\s+/)
    .filter((w) => /[A-Za-z0-9]/.test(w)).length;
}

function renderBody(b) {
  if (typeof b === 'string') return `<p>${rich(b)}</p>`;
  if (b.ul) return `<ul>${b.ul.map((x) => `<li>${rich(x)}</li>`).join('')}</ul>`;
  if (b.ol) return `<ol>${b.ol.map((x) => `<li>${rich(x)}</li>`).join('')}</ol>`;
  return b.ex.map((x) => `<div class="ex"><p class="tone">${e(x.tone)}</p><p class="bubble">${e(x.text)}</p><p class="why"><b>Why it works:</b> ${rich(x.why)}</p></div>`).join('\n');
}

const UPDATED_LABEL = new Date(`${UPDATED}T00:00:00Z`).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });

function guidePage(g) {
  const path = guidePath(g);
  const minutes = Math.max(3, Math.round(guideWords(g) / 200));
  return layout({
    ui: EN,
    path,
    title: `${g.title} | ${BRAND}`,
    description: g.description,
    ogType: 'article',
    header: guideHeader(false),
    footerNote: e(GUIDE_FOOTER),
    jsonLd: [
      crumbs([[BRAND, '/en/'], ['Texting guides', GUIDE_HUB], [g.h1, path]]),
      {
        '@context': 'https://schema.org',
        '@type': 'Article',
        headline: g.h1,
        description: g.description,
        inLanguage: 'en',
        datePublished: PUBLISHED,
        dateModified: UPDATED,
        mainEntityOfPage: `${SITE}${path}`,
        image: OG_IMAGE.url,
        author: ORG,
        publisher: ORG,
      },
      { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: g.faq.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) },
    ],
    main: `<p class="crumbs"><a href="/en/">${BRAND}</a> › <a href="${GUIDE_HUB}">Texting guides</a></p>
<h1>${e(g.h1)}</h1>
<p class="meta">Updated ${UPDATED_LABEL} · ${minutes} min read</p>
${g.intro.map((p, i) => `<p${i === 0 ? ' class="lead"' : ''}>${rich(p)}</p>`).join('\n')}
${g.sections.map((s) => `<h2>${e(s.h)}</h2>\n${s.body.map(renderBody).join('\n')}`).join('\n')}
<section class="cta-box">
<h2>Stuck on your own chat?</h2>
<p>Upload a screenshot to ${BRAND} — or just describe what's going on — and get 3 replies you can send right now, in your own texting style, plus how interested they seem.</p>
${g.ctaNote ? `<p>${e(g.ctaNote)}</p>\n` : ''}${storeButtons(EN, { medium: 'en_guide', campaign: g.slug, q: g.q })}
</section>
<h2>FAQ</h2>
${g.faq.map((f) => `<h3>${e(f.q)}</h3>\n<p>${e(f.a)}</p>`).join('\n')}
<h2>More texting guides</h2>
${guideList(GUIDES_EN.filter((x) => x.slug !== g.slug))}`,
  });
}

function guidesHub() {
  return layout({
    ui: EN,
    path: GUIDE_HUB,
    title: `Texting Guides: What to Text When You're Stuck | ${BRAND}`,
    description: 'Practical, respectful texting advice with example messages: left on read, "haha maybe", double texting, asking someone out, dry texters, first dates, making up and more.',
    header: guideHeader(true),
    footerNote: e(GUIDE_FOOTER),
    jsonLd: [
      crumbs([[BRAND, '/en/'], ['Texting guides', GUIDE_HUB]]),
      { '@context': 'https://schema.org', '@type': 'ItemList', itemListElement: GUIDES_EN.map((g, i) => ({ '@type': 'ListItem', position: i + 1, url: `${SITE}${guidePath(g)}`, name: g.h1 })) },
    ],
    main: `<p class="crumbs"><a href="/en/">${BRAND}</a> › Texting guides</p>
<h1>Texting guides: what to say when you're stuck</h1>
<p class="lead">Left on read, a "haha maybe," a dry texter, the first text after a date — these are the moments everyone overthinks. Each guide explains how to read the situation and gives example messages you can adapt, with a respectful, no-games approach.</p>
${guideList(GUIDES_EN)}
<section class="cta-box">
<h2>Get replies for your own chat</h2>
<p>Upload a screenshot to ${BRAND} — or just describe what's going on — and get 3 replies you can send right now, plus how interested they seem.</p>
${storeButtons(EN, { medium: 'en_guide', campaign: 'hub' })}
</section>`,
  });
}

// ───────── 내보내기 ─────────
/** sitemap.xml 에 더할 주소 (영어 약관·지원 문서도 함께 — site/en/ 에 이미 있는 파일) */
export const GLOBAL_PATHS = [
  ...LANDING_LANGS.map(landingPath),
  GUIDE_HUB,
  ...GUIDES_EN.map(guidePath),
  '/en/support.html',
  '/en/privacy.html',
  '/en/terms.html',
];

/** dist/ 아래 경로 → 내용 (vercel.json rewrites 가 /en·/en/·/en/guide/<slug> 를 이 파일들로 보낸다) */
export function globalPages() {
  const files = {};
  for (const lang of LANDING_LANGS) files[`${lang}/index.html`] = landingPage(lang);
  files['en/guide/index.html'] = guidesHub();
  for (const g of GUIDES_EN) files[`en/guide/${g.slug}/index.html`] = guidePage(g);
  return files;
}
