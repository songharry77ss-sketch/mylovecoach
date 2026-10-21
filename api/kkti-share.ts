/**
 * GET /k/코드 (vercel.json 이 /api/kkti-share?c=코드 로 넘긴다) — KKTI 공유 링크가 닿는 곳.
 *  - /k/내코드          → 내 유형 카드가 미리보기로 뜨고, 결과 화면(/kkti/result?a=…)으로 넘어간다
 *  - /k/내코드-상대코드 → 둘의 궁합 카드가 미리보기로 뜨고, 궁합 화면(/kkti/result?a=…&w=…)으로 넘어간다
 *  - /k (코드 없음·잘못됨) → 테스트 소개 카드가 미리보기로 뜨고, 테스트 첫 화면(/kkti)으로 넘어간다
 * 주소창에서 복사한 앱 화면 주소(/kkti, /kkti/result?a=…&w=…)도 미리보기 수집기가 열면 vercel.json 이 여기로 넘긴다
 *  (user-agent 로 가린다. 사람과 검색 엔진은 앱 화면을 그대로 받는다). 그때는 답 코드가 a·w 쿼리로 온다.
 * 카톡·인스타·X·스레드는 화면을 그리지 않고 이 페이지의 og 태그만 읽어 미리보기를 만든다.
 * 앱 화면(/kkti/…)은 정적 파일 하나라 주소마다 다른 미리보기를 줄 수 없어서 이 페이지를 따로 둔다.
 * 광고·게시물 링크에 붙인 utm_* 은 넘어갈 때 그대로 싣는다 (앱이 유입 경로로 읽는다). 아무것도 저장하지 않는다.
 * 넘어가기는 스크립트로만 한다 — meta refresh 를 두면 미리보기 수집기가 따라가 og 태그가 없는 앱 화면을 읽을 수 있다.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';

import { KKTI_SITE, cardUrl, kktiFromCode, kktiMatch, parseShareCode, type KktiResult } from '../src/lib/kkti';

export const config = { maxDuration: 10 };

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
}

/** 공유 링크의 코드와 사이트 주소로 미리보기 내용을 정한다 */
export function sharePage(code: string, site: string, utm: Record<string, string> = {}): SharePage {
  const pair = parseShareCode(code);
  const a: KktiResult | null = pair ? kktiFromCode(pair.a) : null;
  const w: KktiResult | null = pair?.w ? kktiFromCode(pair.w) : null;
  const query = new URLSearchParams(utm);

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
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${e(page.title)}</title>
<meta name="description" content="${e(page.description)}">
<meta name="robots" content="noindex">
<meta property="og:type" content="website">
<meta property="og:site_name" content="KKTI">
<meta property="og:locale" content="ko_KR">
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
<a href="${e(page.target)}">KKTI 결과 보러 가기</a>
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
  res.status(200).send(shareHtml(sharePage(code, site, utm)));
}
