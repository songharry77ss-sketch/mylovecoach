// 실행: node tools/social-approve.mjs --queue <queue.json> --ids <all | id1,id2>
// 사람이 GitHub 의 「게시 허락」 실행(social-approve.yml)으로 누를 때 쓴다 — 고른 항목을 approved: true 로 바꾸고 목록을 보여 준다.
// 허락은 사람만 한다: 이 스크립트는 그 실행 안에서만 돌린다.
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';

import { queueProblems } from './lib/social.mjs';

const args = process.argv.slice(2);
const argOf = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
const path = argOf('--queue') ?? 'marketing/social/queue.json';
const ids = String(argOf('--ids') ?? '').trim();
if (!ids || !/^(all|[a-z0-9-]+(,[a-z0-9-]+)*)$/.test(ids)) throw new Error('--ids 는 all 또는 id1,id2');
const by = argOf('--by') ?? 'GitHub 실행';

const queue = JSON.parse(readFileSync(path, 'utf8'));
const issues = queueProblems(queue);
if (issues.length) throw new Error(`큐에 문제가 있어 허락하지 않아요:\n${issues.join('\n')}`);
const want = ids === 'all' ? null : new Set(ids.split(','));
const missing = want ? [...want].filter((id) => !queue.entries.some((e) => e.id === id)) : [];
if (missing.length) throw new Error(`큐에 없는 id: ${missing.join(', ')}`);

const now = new Date().toISOString();
const changed = [];
for (const e of queue.entries) {
  if (want && !want.has(e.id)) continue;
  if (e.approved === true) continue;
  e.approved = true;
  e.approvedBy = `${by} ${now}`;
  changed.push(e);
}
writeFileSync(path, `${JSON.stringify(queue, null, 2)}\n`);
const lines = changed.length ? changed.map((e) => `- ${e.at} · ${e.channel} ${e.kind} · ${e.id}`) : ['- 새로 허락한 항목 없음 (이미 허락됨)'];
const out = ['## 게시 허락', ...lines].join('\n');
console.log(out);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${out}\n`);
