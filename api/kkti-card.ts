/**
 * GET /api/kkti-card?a=답코드[&w=상대답코드][&s=og|story|square] — KKTI 결과 카드 그림(PNG).
 *  - a 만 있으면 유형 카드, w 까지 있으면 둘의 궁합 카드, a 가 없거나 잘못됐으면 테스트 소개 카드
 *  - og(기본, 1200×630)는 링크 미리보기, story(1080×1920)는 인스타 스토리, square(1080×1080)는 피드용
 * 같은 주소는 언제나 같은 그림이라 CDN 에 오래 둔다 (새로 배포하면 CDN 기억은 비워진다).
 * 받는 값은 답 코드뿐이고 아무것도 저장하지 않는다.
 *
 * KKTI 서버 일은 모두 이 함수 하나가 맡는다 — Vercel Hobby 는 배포 하나에 함수 12개까지라서다.
 * vercel.json rewrites 가 바깥 주소를 그대로 두고 route 를 붙여 넘긴다 (이미 나간 앱·링크가 쓰는 주소라 바꾸지 않는다):
 *  - /k, /k/코드, 미리보기 수집기가 연 /kkti·/kkti/result → route=share (api/_kkti-share.ts)
 *  - /api/kkti-stat (POST)                               → route=stat  (api/_kkti-stat.ts)
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';

import { kktiFromCode, type KktiCardShape } from '../src/lib/kkti';
import { renderCard } from './_kkti-card';
import shareHandler from './_kkti-share';
import statHandler from './_kkti-stat';

// 메모리와 함께 싣는 파일(글꼴·이모지 그림)은 vercel.json 의 functions 에 적는다
export const config = { maxDuration: 20 };

const SHAPES: readonly KktiCardShape[] = ['og', 'story', 'square'];
const first = (value: unknown): string => (Array.isArray(value) ? String(value[0] ?? '') : typeof value === 'string' ? value : '');

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const route = first(req.query.route);
  if (route === 'share') return shareHandler(req, res);
  if (route === 'stat') return statHandler(req, res);
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('cache-control', 'no-store');
    res.status(405).json({ error: 'GET만 지원합니다.' });
    return;
  }
  const shape = (SHAPES as readonly string[]).includes(first(req.query.s)) ? (first(req.query.s) as KktiCardShape) : 'og';
  const a = kktiFromCode(first(req.query.a));
  const w = a ? kktiFromCode(first(req.query.w)) : null;
  try {
    const png = await renderCard(shape, a, w);
    res.setHeader('content-type', 'image/png');
    res.setHeader('cache-control', 'public, max-age=86400, s-maxage=31536000, immutable');
    res.status(200).send(png);
  } catch (e) {
    console.error('[kkti-card]', e instanceof Error ? e.message : e);
    res.setHeader('cache-control', 'no-store');
    res.status(500).json({ error: '카드를 그리지 못했어요.' });
  }
}
