#!/usr/bin/env node
// 새 창고 항목 받기 — 받은 파일들({items:[…]})을 검사해 콘텐츠 창고(bank.json) 끝에 더한다.
//   node tools/social-make/bank-add.mjs --bank <bank.json> <새 항목.json> [...] [--by 누가]
// 매주 글감 쓰는 Claude 루틴이 claude/bank-* 가지의 marketing/bank-inbox/ 에 올리면 「콘텐츠 창고 받기」 실행(social-bank-inbox.yml)이 돌린다.
// 하나라도 검사에 걸리면 아무것도 더하지 않는다. 이미 창고에 있는 id 는 건너뛴다(같은 파일을 두 번 받아도 안전).
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';

import { bankProblems } from './bank.mjs';

const args = process.argv.slice(2);
const argOf = (f) => (args.includes(f) ? args[args.indexOf(f) + 1] : undefined);
const bankPath = argOf('--bank');
const by = argOf('--by') ?? 'bank-inbox';
const files = args.filter((a, i) => !a.startsWith('--') && !['--bank', '--by'].includes(args[i - 1]));
if (!bankPath || !files.length) throw new Error('사용: bank-add.mjs --bank <bank.json> <새 항목.json> [...]');
const readJson = (f) => JSON.parse(readFileSync(f, 'utf8').replace(/^﻿/, ''));

const bank = readJson(bankPath);
const have = new Set(bank.items.map((it) => it.id));
const incoming = files.flatMap((f) => readJson(f).items ?? []);
const fresh = incoming.filter((it) => !have.has(it?.id));
const today = new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10);
const added = fresh.map((it) => ({ ...it, addedBy: by, addedAt: today }));

// 새 항목만 검사 (창고에 이미 있는 id 는 위에서 뺐고, 새 항목끼리 겹치는 id 는 여기서 걸림)
const problems = bankProblems(added);
const out = [];
if (problems.length) {
  out.push(`## 창고 받기 실패 — 문제 ${problems.length}개 (아무것도 더하지 않음)`, ...problems.map((p) => `- ${p}`));
} else {
  bank.items.push(...added);
  writeFileSync(bankPath, `${JSON.stringify(bank, null, 2)}\n`);
  const count = {};
  for (const it of added) count[it.format] = (count[it.format] ?? 0) + 1;
  out.push(`## 창고에 ${added.length}개 더함 (이미 있던 것 ${incoming.length - fresh.length}개 건너뜀)`, ...added.map((it) => `- \`${it.id}\` ${it.format} — ${String(it.hook ?? it.title ?? '').replace(/\n/g, ' ')}`));
  if (added.length) out.push('', `포맷별: ${Object.entries(count).map(([k, v]) => `${k} ${v}`).join(' · ')}`);
}
console.log(out.join('\n'));
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${out.join('\n')}\n`);
if (problems.length) process.exit(1);
