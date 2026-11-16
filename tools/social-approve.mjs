// 실행: node tools/social-approve.mjs --queue <queue.json> (--ids <all | id1,id2> | --drop <id1,id2>) [--by 이름] [--reschedule]
// 사람이 「게시 허락」 실행(social-approve.yml) — Actions 에서 누르거나, 미리 보기 이슈에 「허락」 댓글 — 으로 쓴다.
//   --ids        고른 항목을 approved: true 로
//   --drop       아직 안 올린 항목을 큐에서 뺀다 (queue.dropped 에 남겨 자동 생산이 다시 고르지 않게)
//   --reschedule 날짜가 지난 피드는 오늘·내일부터 하루 하나씩으로 다시 잡는다
// 허락은 사람만 한다: 이 스크립트는 그 실행 안에서만 돌린다.
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { queueProblems, reschedule } from './lib/social.mjs';

const args = process.argv.slice(2);
const argOf = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
const file = argOf('--queue') ?? 'marketing/social/queue.json';
const ids = String(argOf('--ids') ?? '').trim();
const drop = String(argOf('--drop') ?? '').trim();
const LIST = /^[a-z0-9-]+(,[a-z0-9-]+)*$/;
if (drop ? !LIST.test(drop) : !ids || !(ids === 'all' || LIST.test(ids))) throw new Error('--ids 는 all 또는 id1,id2 · --drop 은 id1,id2');
const by = argOf('--by') ?? 'GitHub 실행';
const readJson = (f) => JSON.parse(readFileSync(f, 'utf8').replace(/^﻿/, ''));

const queue = readJson(file);
const postedFile = path.join(path.dirname(file), 'posted.json');
const posted = existsSync(postedFile) ? readJson(postedFile) : { posts: [] };
const done = new Set(posted.posts.map((p) => p.id));
const issues = queueProblems(queue);
if (issues.length) throw new Error(`큐에 문제가 있어 바꾸지 않아요:\n${issues.join('\n')}`);
const want = drop ? new Set(drop.split(',')) : ids === 'all' ? null : new Set(ids.split(','));
const missing = want ? [...want].filter((id) => !queue.entries.some((e) => e.id === id)) : [];
if (missing.length) throw new Error(`큐에 없는 id: ${missing.join(', ')}`);

const now = new Date();
const lines = [];
if (drop) {
  const gone = queue.entries.filter((e) => want.has(e.id) && !done.has(e.id));
  const already = [...want].filter((id) => done.has(id));
  queue.entries = queue.entries.filter((e) => !gone.includes(e));
  queue.dropped = [...new Set([...(queue.dropped ?? []), ...gone.map((e) => e.id)])];
  lines.push('## 큐에서 뺐어요', ...(gone.length ? gone.map((e) => `- ${e.at} · ${e.kind} · ${e.id}`) : ['- 뺀 항목 없음']));
  if (already.length) lines.push(`- 이미 올라간 것은 못 빼요: ${already.join(', ')} (인스타에서 직접 지워 주세요)`);
} else {
  const changed = [];
  for (const e of queue.entries) {
    if (want && !want.has(e.id)) continue;
    if (e.approved === true || done.has(e.id)) continue;
    e.approved = true;
    e.approvedBy = `${by} ${now.toISOString()}`;
    changed.push(e);
  }
  lines.push('## 게시 허락', ...(changed.length ? changed.map((e) => `- ${e.at} · ${e.channel} ${e.kind} · ${e.id}`) : ['- 새로 허락한 항목 없음 (이미 허락됨)']));
}
if (args.includes('--reschedule')) {
  const moved = reschedule(queue, now, posted);
  if (moved.length) lines.push('', '## 밀린 일정 다시 잡음', ...moved.map((m) => `- ${m.id}: ${m.from} → ${m.to}`));
}
writeFileSync(file, `${JSON.stringify(queue, null, 2)}\n`);
const out = lines.join('\n');
console.log(out);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${out}\n`);
if (process.env.APPROVE_RESULT) writeFileSync(process.env.APPROVE_RESULT, `${out}\n`);
