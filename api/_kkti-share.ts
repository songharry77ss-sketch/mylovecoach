/**
 * GET /k/코드 (vercel.json 이 /api/kkti-card?route=share&c=코드 로 넘긴다) — KKTI 공유 링크가 닿는 곳.
 * 함수 개수 한도(Vercel Hobby 12개) 때문에 따로 함수로 두지 않고 api/kkti-card.ts 가 route=share 일 때 부른다.
 *  - /k/내코드          → 내 유형 카드가 미리보기로 뜨고, 결과 화면(/kkti/result?a=…)으로 넘어간다
 *  - /k/내코드-상대코드 → 둘의 궁합 카드가 미리보기로 뜨고, 궁합 화면(/kkti/result?a=…&w=…)으로 넘어간다
 *  - /k (코드 없음·잘못됨) → 테스트 소개 카드가 미리보기로 뜨고, 테스트 첫 화면(/kkti)으로 넘어간다
 * 주소창에서 복사한 앱 화면 주소(/kkti, /kkti/result?a=…&w=…)도 미리보기 수집기가 열면 vercel.json 이 여기로 넘긴다
 *  (user-agent 로 가린다. 사람과 검색 엔진은 앱 화면을 그대로 받는다). 그때는 답 코드가 a·w 쿼리로 온다.
 * 카톡·인스타·X·스레드는 화면을 그리지 않고 이 페이지의 og 태그만 읽어 미리보기를 만든다.
 * 앱 화면(/kkti/…)은 정적 파일 하나라 주소마다 다른 미리보기를 줄 수 없어서 이 페이지를 따로 둔다.
 * 광고·게시물 링크에 붙인 utm_* 은 넘어갈 때 그대로 싣는다 (앱이 유입 경로로 읽는다). 아무것도 저장하지 않는다.
 * 넘어가기는 스크립트로만 한다 — meta refresh 를 두면 미리보기 수집기가 따라가 og 태그가 없는 앱 화면을 읽을 수 있다.
 *
 * 언어 (2026-11-28 세계화): 세계판 앱이 보낸 링크는 /k/코드?l=언어 (앱 화면 주소면 ?lang=언어).
 *  - l 이 없거나 ko → 지금까지와 똑같은 한국어 페이지 (이미 나간 링크는 그대로)
 *  - 그 밖 → 미리보기 제목·설명은 그 언어 (영어 문장을 열쇠로 번역 사전 src/i18n/dict/<언어>.json 에서 찾고, 없으면 영어),
 *    카드 그림은 영어(l=en — 글꼴이 한글·라틴뿐), 결과 화면은 ?lang=언어 로 넘긴다 (웹 앱이 그 언어로 뜬다)
 *  - og:url 에도 l 을 싣는다 — 페이스북·카톡은 og:url 로 미리보기를 기억하므로, 언어마다 따로 기억하게
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';

import { loadDict } from '../src/i18n/dicts';
import { KKTI_SITE, cardUrl, kktiFromCode, kktiMatch, parseShareCode, type KktiResult } from '../src/lib/kkti';
import { KKTI_COLORS_EN, KKTI_MATCH_TIERS_EN, KKTI_TYPES_EN, kktiCardLang, kktiEnglishCode, kktiShareLang, withKktiLang, type KktiShareLang } from '../src/lib/kkti-en-text';

const DEFAULT_HOST = 'mylovecoach.vercel.app';
/**
 * 미리보기 주소(og:url·og:image)에 써도 되는 호스트 — 운영 주소, KKTI 전용 주소(EXPO_PUBLIC_KKTI_SITE),
 * 이 프로젝트의 배포별 주소, 로컬 확인. 그 밖의 값은 운영 주소로 바꿔 쓴다 (남의 주소가 찍힌 페이지가 CDN 에 남지 않게)
 */
export function allowedHost(host: string): boolean {
  const h = host.toLowerCase();
  return h === DEFAULT_HOST || h === new URL(KKTI_SITE).host || /^mylovecoach-[a-z0-9-]{1,80}\.vercel\.app$/.test(h) || /^localhost(:\d{1,5})?$/.test(h);
}
const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign'] as const;
const UTM_VALUE = /^[A-Za-z0-9_.-]{1,80}$/;

const first = (value: unknown): string => (Array.isArray(value) ? String(value[0] ?? '') : typeof value === 'string' ? value : '');

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (ch) => ESCAPES[ch]);

export interface SharePage {
  title: string;
  description: string;
  /** 넘어갈 앱 화면 경로 (같은 사이트 안) */
  target: string;
  image: string;
  url: string;
  /** 페이지 언어 (없으면 한국어) */
  lang?: KktiShareLang;
  /** og:site_name (없으면 KKTI) */
  siteName?: string;
  /** 스크립트를 끈 곳에서 보이는 본문 링크 글 (없으면 한국어) */
  linkText?: string;
}

// ───────────────────────── 한국어가 아닌 미리보기 문구 ─────────────────────────

/** og:locale — 페이스북·카톡이 읽는 언어_나라 꼴 */
const OG_LOCALE: Record<KktiShareLang, string> = {
  ko: 'ko_KR', en: 'en_US', ja: 'ja_JP', 'zh-Hans': 'zh_CN', 'zh-Hant': 'zh_TW', es: 'es_ES', pt: 'pt_BR', fr: 'fr_FR', de: 'de_DE',
  it: 'it_IT', ru: 'ru_RU', tr: 'tr_TR', id: 'id_ID', vi: 'vi_VN', th: 'th_TH', ar: 'ar_AR', hi: 'hi_IN', pl: 'pl_PL', nl: 'nl_NL',
  sv: 'sv_SE', da: 'da_DK', nb: 'nb_NO', fi: 'fi_FI', cs: 'cs_CZ', sk: 'sk_SK', hu: 'hu_HU', ro: 'ro_RO', uk: 'uk_UA', el: 'el_GR',
  he: 'he_IL', hr: 'hr_HR', ms: 'ms_MY', ca: 'ca_ES',
};

/** 번역 사전 (영어 문장 → 그 언어). 영어·한국어거나 읽지 못하면 null — 그때는 영어 그대로 */
function dictFor(lang: KktiShareLang): Record<string, string> | null {
  if (lang === 'ko' || lang === 'en') return null;
  try {
    return loadDict(lang);
  } catch {
    return null;
  }
}

/**
 * 영어 문장 → 그 언어. 앱 화면과 같은 영어 문장을 열쇠로 쓴다 (src/lib/i18n.ts 의 T() 와 같은 사전).
 * 틀 문장(`My texting MBTI is {0} {1} "{2}"`)은 자리에 값을 넣는다 — 이름 같은 값도 사전에 있으면 번역한다.
 */
function translator(lang: KktiShareLang) {
  const dict = dictFor(lang);
  const word = (en: string) => dict?.[en] || en;
  const fill = (template: string, ...values: string[]) => word(template).replace(/\{(\d+)\}/g, (_, n: string) => values[Number(n)] ?? '');
  return { word, fill };
}

/** 한국어가 아닌 미리보기 — 제목·설명은 그 언어, 카드 그림은 영어 */
function foreignPage(lang: KktiShareLang, a: KktiResult | null, w: KktiResult | null, site: string, utm: URLSearchParams): SharePage {
  const { word, fill } = translator(lang);
  const cardLang = kktiCardLang(lang);
  const name = (r: KktiResult) => word(KKTI_TYPES_EN[r.code]?.name ?? r.type.name);
  const base = { lang, siteName: word('Texting Type Test') };
  const params = new URLSearchParams(a ? { a: a.encoded, ...(w ? { w: w.encoded } : {}) } : {});
  params.set('lang', lang);
  utm.forEach((value, key) => params.set(key, value));

  if (!a) {
    return {
      ...base,
      title: word('Texting Type Test — your real dating MBTI, from how you text'),
      description: `${word('Who texts first, reply speed, emoji habits: they say it all.')} ${word('16 dating types · Your texting MBTI · Enneagram · 5.6M+ love colors')} · ${word('1 minute · 12 questions · Free')}`,
      target: `/kkti?${params.toString()}`,
      image: withKktiLang(`${site}/api/kkti-card`, cardLang),
      url: withKktiLang(`${site}/k`, lang),
      linkText: word('Take the Texting Type Test'),
    };
  }

  const target = `/kkti/result?${params.toString()}`;
  if (w) {
    const match = kktiMatch(a, w);
    const tier = KKTI_MATCH_TIERS_EN[match.tier.min];
    return {
      ...base,
      title: fill('Our texting MBTI match: {0}% {1} "{2}"', String(match.percent), match.tier.emoji, word(tier?.label ?? match.tier.label)),
      description: `${a.mbti.type} ${a.type.emoji} ${name(a)} × ${w.mbti.type} ${w.type.emoji} ${name(w)} — ${word('Take it & see your match')} 👀`,
      target,
      image: withKktiLang(cardUrl(a.encoded, w.encoded, 'og', site), cardLang),
      url: withKktiLang(`${site}/k/${a.encoded}-${w.encoded}`, lang),
      linkText: word('Texting Type Test result'),
    };
  }
  const color = KKTI_COLORS_EN[a.color.namedHex]?.name;
  const oneLiner = word(KKTI_TYPES_EN[a.code]?.oneLiner ?? a.type.oneLiner);
  return {
    ...base,
    title: fill('My texting MBTI is {0} {1} "{2}"', a.mbti.type, a.type.emoji, name(a)),
    description: `${color ? fill('Texting Type {0} · Love color: {1}', kktiEnglishCode(a.code), word(color)) : kktiEnglishCode(a.code)} · "${oneLiner}" — ${word('Take it & see your match')} 👀`,
    target,
    image: withKktiLang(cardUrl(a.encoded, null, 'og', site), cardLang),
    url: withKktiLang(`${site}/k/${a.encoded}`, lang),
    linkText: word('Texting Type Test result'),
  };
}

/** 공유 링크의 코드와 사이트 주소로 미리보기 내용을 정한다. lang 이 ko(기본)면 지금까지와 같은 한국어 페이지 */
export function sharePage(code: string, site: string, utm: Record<string, string> = {}, lang: KktiShareLang = 'ko'): SharePage {
  const pair = parseShareCode(code);
  const a: KktiResult | null = pair ? kktiFromCode(pair.a) : null;
  const w: KktiResult | null = pair?.w ? kktiFromCode(pair.w) : null;
  const query = new URLSearchParams(utm);

  if (lang !== 'ko') return foreignPage(lang, a, w, site, query);

  if (!a) {
    const q = query.toString();
    return {
      // 미리보기 제목은 앞부분만 보일 때가 많다 — 누구나 아는 「진짜 MBTI」를 먼저 둔다
      title: '카톡으로 보는 진짜 연애 MBTI · KKTI',
      description: '선톡, 답장 속도, 이모지 습관으로 보는 나의 진짜 MBTI와 16가지 연애 유형. 1분이면 끝나고, 친구랑 궁합도 볼 수 있어요.',
      target: `/kkti${q ? `?${q}` : ''}`,
      image: `${site}/api/kkti-card`,
      url: `${site}/k`,
    };
  }

  const params = new URLSearchParams({ a: a.encoded, ...(w ? { w: w.encoded } : {}) });
  query.forEach((value, key) => params.set(key, value));
  const target = `/kkti/result?${params.toString()}`;
  if (w) {
    const match = kktiMatch(a, w);
    return {
      title: `우리 카톡 MBTI 궁합 ${match.percent}% ${match.tier.emoji} ${match.tier.label}`,
      description: `${a.mbti.type} ${a.type.emoji} ${a.type.name} × ${w.mbti.type} ${w.type.emoji} ${w.type.name} — 너도 1분 테스트 하고 궁합 봐!`,
      target,
      image: cardUrl(a.encoded, w.encoded, 'og', site),
      url: `${site}/k/${a.encoded}-${w.encoded}`,
    };
  }
  return {
    title: `내 카톡 속 진짜 MBTI는 ${a.mbti.type} ${a.type.emoji} ${a.type.name}`,
    description: `KKTI ${a.code} · "${a.type.oneLiner}" — 너도 1분 테스트 하면 나랑 궁합이 나와 👀`,
    target,
    image: cardUrl(a.encoded, null, 'og', site),
    url: `${site}/k/${a.encoded}`,
  };
}

export function shareHtml(page: SharePage): string {
  const e = escapeHtml;
  // 스크립트 안에 넣는 주소는 JSON 으로 감싸고, 태그를 닫는 글자(<)는 한 번 더 숨긴다.
  // 공유 주소(/k…)에서만 넘어간다 — 이 페이지가 앱 화면 주소(/kkti…)로 사람에게 잘못 나가도 같은 주소로 끝없이 넘어가지 않게
  const jsTarget = JSON.stringify(page.target).replace(/</g, '\\u003c');
  const lang = page.lang ?? 'ko';
  return `<!doctype html>
<html lang="${e(lang)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${e(page.title)}</title>
<meta name="description" content="${e(page.description)}">
<meta name="robots" content="noindex">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${e(page.siteName ?? 'KKTI')}">
<meta property="og:locale" content="${e(OG_LOCALE[lang] ?? 'ko_KR')}">
<meta property="og:title" content="${e(page.title)}">
<meta property="og:description" content="${e(page.description)}">
<meta property="og:url" content="${e(page.url)}">
<meta property="og:image" content="${e(page.image)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${e(page.title)}">
<meta name="twitter:description" content="${e(page.description)}">
<meta name="twitter:image" content="${e(page.image)}">
<script>if(location.pathname==='/k'||location.pathname.indexOf('/k/')===0)location.replace(${jsTarget});</script>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Pretendard","Noto Sans KR",sans-serif;background:#FFF1F5;color:#191F28}a{color:#191F28;font-weight:700}</style>
</head>
<body>
<a href="${e(page.target)}">${e(page.linkText ?? 'KKTI 결과 보러 가기')}</a>
</body>
</html>
`;
}

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('cache-control', 'no-store');
    res.status(405).json({ error: 'GET만 지원합니다.' });
    return;
  }
  const host = first(req.headers.host).toLowerCase();
  const site = allowedHost(host) ? `${host.startsWith('localhost') ? 'http' : 'https'}://${host}` : `https://${DEFAULT_HOST}`;
  const utm: Record<string, string> = {};
  for (const key of UTM_KEYS) {
    const value = first(req.query[key]);
    if (UTM_VALUE.test(value)) utm[key] = value;
  }
  res.setHeader('content-type', 'text/html; charset=utf-8');
  // 같은 주소는 같은 내용 — CDN 에 잠깐 두고, 브라우저는 매번 새로 받는다.
  // 단 앱 화면 주소에서 넘어온 요청(via=app)은 같은 주소를 사람이 열면 앱 화면이 나가야 하므로 어디에도 남기지 않는다
  res.setHeader('cache-control', first(req.query.via) === 'app' ? 'no-store' : 'public, max-age=0, s-maxage=3600');
  // /k/코드 는 c 로, 앱 화면 주소(/kkti/result?a=…&w=…)는 a·w 로 온다
  const a = first(req.query.a);
  const w = first(req.query.w);
  const code = first(req.query.c) || (a && w ? `${a}-${w}` : a);
  // 언어: 공유 링크는 l, 주소창에서 복사한 앱 화면 주소는 lang. 없으면 한국어 (예전 링크)
  const lang = kktiShareLang(first(req.query.l) || first(req.query.lang));
  res.status(200).send(shareHtml(sharePage(code, site, utm, lang)));
}
