#!/usr/bin/env node
/**
 * 홍보 추적 링크 숫자 쌓기 — /api/go-stats 를 읽어 <root>/marketing/promo/clicks.json 에 합치고, 코드별 합계를 요약에 남긴다.
 *   node tools/promo-snapshot.mjs --root queue [--url https://mylovecoach.vercel.app/api/go-stats]
 * 흐름: docs/PROMO_TRACKING.md
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { mergePromo, promoTotals } from './lib/promo.mjs';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const root = arg('root', '.');
const url = arg('url', process.env.PROMO_STATS_URL || 'https://mylovecoach.vercel.app/api/go-stats');
const file = join(root, 'marketing/promo/clicks.json');

const res = await fetch(url, { headers: { 'user-agent': 'mylovecoach-promo-snapshot' }, signal: AbortSignal.timeout(30_000) });
if (!res.ok) throw new Error(`통계를 못 읽었어요 (${res.status})`);
const stats = await res.json();
if (stats.ready === false) console.log('서버가 DB 에 연결되지 않아 빈 통계예요 — 기록은 그대로 둡니다.');

const prev = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;
const next = mergePromo(prev, stats);
mkdirSync(dirname(file), { recursive: true });
writeFileSync(file, `${JSON.stringify(next, null, 2)}\n`);

const totals = promoTotals(next);
const lines = [
  '## 홍보 링크 (/go/코드)',
  '',
  totals.length ? '| 코드 | 클릭 | 안드로이드 | 아이폰 | 그 밖 | 앱 연 사람(웹·30일) | 처음 | 마지막 |' : '아직 눌린 링크가 없어요.',
  ...(totals.length ? ['|---|---:|---:|---:|---:|---:|---|---|'] : []),
  ...totals.map((t) => `| ${t.code} | ${t.clicks} | ${t.android} | ${t.ios} | ${t.web} | ${t.opens} | ${t.first ?? '-'} | ${t.last ?? '-'} |`),
  '',
];
console.log(lines.join('\n'));
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${lines.join('\n')}\n`);
