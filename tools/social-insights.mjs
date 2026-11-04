// 실행: node tools/social-insights.mjs [--limit 12]
// 최근 게시물의 성과(조회·도달·저장·공유·좋아요·댓글)를 표로 낸다. 예약 실행(social-insights.yml)이 매일 아침 GitHub 요약에 남긴다.
// 토큰: IG_ACCESS_TOKEN · THREADS_ACCESS_TOKEN (없는 채널은 건너뜀). 바꾸는 것은 없다(읽기만).
import { appendFileSync } from 'node:fs';

import { igInsights, igMe, igRecent, thInsights, thMe, thRecent } from './lib/meta-publish.mjs';

const args = process.argv.slice(2);
const limit = Number(args.includes('--limit') ? args[args.indexOf('--limit') + 1] : 12) || 12;
const summary = process.env.GITHUB_STEP_SUMMARY;
const out = (line = '') => {
  console.log(line);
  if (summary) appendFileSync(summary, `${line}\n`);
};
const kstDate = (iso) => new Date(new Date(iso).getTime() + 9 * 3600_000).toISOString().slice(5, 16).replace('T', ' ');
const first = (text) => String(text ?? '').split('\n')[0].slice(0, 28).replace(/\|/g, '/');
const n = (v) => (v === null || v === undefined ? '–' : String(v));

if (process.env.IG_ACCESS_TOKEN) {
  const token = process.env.IG_ACCESS_TOKEN;
  const me = await igMe(token);
  out(`## 인스타 @${me.username}`);
  out('| 올린 때(KST) | 첫 줄 | 종류 | 조회 | 도달 | 저장 | 공유 | 좋아요 | 댓글 |');
  out('|---|---|---|---|---|---|---|---|---|');
  for (const m of await igRecent(me.id, token, limit)) {
    const s = await igInsights(m.id, token, m.type);
    out(`| ${kstDate(m.at)} | [${first(m.text) || '(글 없음)'}](${m.url}) | ${m.type} | ${n(s.views)} | ${n(s.reach)} | ${n(s.saved)} | ${n(s.shares)} | ${n(m.likes)} | ${n(m.comments)} |`);
  }
  out();
} else out('인스타 토큰 없음 — 건너뜀');

if (process.env.THREADS_ACCESS_TOKEN) {
  const token = process.env.THREADS_ACCESS_TOKEN;
  const me = await thMe(token);
  out(`## 쓰레드 @${me.username}`);
  out('| 올린 때(KST) | 첫 줄 | 조회 | 좋아요 | 답글 | 리포스트 | 공유 |');
  out('|---|---|---|---|---|---|---|');
  for (const m of await thRecent(me.id, token, limit)) {
    const s = await thInsights(m.id, token);
    out(`| ${kstDate(m.at)} | [${first(m.text) || '(글 없음)'}](${m.url}) | ${n(s.views)} | ${n(s.likes)} | ${n(s.replies)} | ${n(s.reposts)} | ${n(s.shares)} |`);
  }
} else out('쓰레드 토큰 없음 — 건너뜀');
