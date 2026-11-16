#!/usr/bin/env node
// 콘텐츠 창고(bank.json) → 그림·영상 → 게시 큐(queue.json).
//
//   검사:      node tools/social-make/make.mjs --bank <bank.json> --check
//   하나 보기:  node tools/social-make/make.mjs --bank <bank.json> --id <항목> --out <폴더>
//   큐 채우기:  node tools/social-make/make.mjs --bank <bank.json> --queue <queue.json> --root <social-queue 폴더> --fill [--ahead 8] [--days 7] [--from 2026-11-16] [--time 21:00] [--approve]
//
// 큐 채우기: 창고에서 아직 큐에 없는 항목을 하루 하나씩(마지막 예정일 다음 날부터) 넣는다.
// 무엇을 고를지는 지난 성과로 배운 것(<root>/marketing/learn/stats.json → tools/lib/learn.mjs)을 따른다:
//   잘 된 포맷은 칸을 더 받고, 같은 포맷 안에서는 잘 된 주제 먼저. 성과가 3개 미만이면 기본 한 주 구성(WEEK).
// 그림·영상은 <root>/marketing/social/<id>/ 에 만들고, 큐 항목은 approved:false — 사람이 「게시 허락」을 눌러야 올라간다.
// --approve: 바로 허락된 채로 넣는다 (저장소 변수 SOCIAL_AUTO_APPROVE=on 일 때만 실행이 붙인다 — 사장님이 켜는 것)
// 흐름: docs/SOCIAL_AUTOPOST.md 「자동 생산」
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { learnModel, rankItems, reportMarkdown, topicsOf } from '../lib/learn.mjs';
import { problems as entryProblems } from '../lib/social.mjs';
import { missingEmoji } from './kit.mjs';
import { FORMATS } from './formats/index.mjs';
import { WEEK, firstFreeDay, howMany, nextDay, pickForDays } from './plan.mjs';

const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const argOf = (f) => (args.includes(f) ? args[args.indexOf(f) + 1] : undefined);
const readJson = (f) => JSON.parse(readFileSync(f, 'utf8').replace(/^﻿/, ''));

const bankPath = argOf('--bank');
if (!bankPath) throw new Error('--bank <bank.json> 이 필요해요');
const bank = readJson(bankPath);
const items = bank.items ?? [];

/** 창고 항목 검사 — 문제 목록 */
export function bankProblems(list) {
  const out = [];
  const seen = new Set();
  for (const it of list) {
    const say = (m) => out.push(`${it?.id ?? '(id 없음)'}: ${m}`);
    if (!/^[a-z0-9][a-z0-9-]{1,60}$/.test(String(it?.id ?? ''))) say('id 는 영어 소문자·숫자·- 로');
    if (seen.has(it.id)) say('id 가 겹쳐요');
    seen.add(it.id);
    const fmt = FORMATS[it.format];
    if (!fmt) {
      say(`format 은 ${Object.keys(FORMATS).join('·')} 중 하나`);
      continue;
    }
    for (const p of fmt.check(it)) say(p);
    const missing = missingEmoji(JSON.stringify({ ...it, caption: '' }));
    if (missing.length) say(`그림이 없는 이모지: ${missing.join(' ')} (scripts/fetch-fluent-emoji.ts 에 추가)`);
    // 캡션·종류는 게시 검사와 같은 규칙으로
    const fake = { id: it.id, at: '2026-01-01 21:00', channel: 'instagram', kind: fmt.kind, media: fmt.kind === 'reel' ? ['x.mp4'] : Array.from({ length: fmt.slides?.(it) ?? 2 }, (_, i) => `${i}.jpg`), caption: it.caption, approved: false };
    for (const p of entryProblems(fake)) out.push(p);
    if (!String(it.caption ?? '').trim()) say('caption 이 비었어요');
  }
  return out;
}

const problems = bankProblems(items);
if (has('--check') || problems.length) {
  if (problems.length) {
    console.error(`창고 문제 ${problems.length}개:\n- ${problems.join('\n- ')}`);
    process.exit(1);
  }
  const by = {};
  for (const it of items) by[it.format] = (by[it.format] ?? 0) + 1;
  console.log(`창고 ${items.length}개 이상 없음 — ${Object.entries(by).map(([k, v]) => `${k} ${v}`).join(' · ')}`);
  if (has('--check')) process.exit(0);
}

/** 항목 하나를 dir 에 만들고 큐 항목 모양으로 돌려준다 (media 는 relTo 기준 상대 경로) */
async function build(it, dir, relTo) {
  mkdirSync(dir, { recursive: true });
  const fmt = FORMATS[it.format];
  const started = Date.now();
  const made = await fmt.make(it, dir);
  console.log(`  ${it.id} (${it.format}) ${made.media.length}개 · ${((Date.now() - started) / 1000).toFixed(0)}초`);
  const rel = (f) => path.relative(relTo, f).split(path.sep).join('/');
  return {
    id: it.id,
    channel: 'instagram',
    kind: fmt.kind,
    media: made.media.map(rel),
    ...(made.cover ? { cover: rel(made.cover) } : {}),
    caption: it.caption.trim(),
    ...(fmt.kind === 'reel' ? { audio: it.audio ?? { trending: true, videoVolume: 25, minSeconds: Math.ceil(made.seconds ?? 10) } } : {}),
    approved: false,
    note: `자동 생산 · ${it.format}${it.ref ? ` · 참고 ${it.ref}` : ''}`,
  };
}

const only = argOf('--id');
if (only) {
  const it = items.find((x) => x.id === only);
  if (!it) throw new Error(`창고에 ${only} 가 없어요`);
  const out = path.resolve(argOf('--out') ?? '.');
  const entry = await build(it, path.join(out, it.id), out);
  console.log(JSON.stringify(entry, null, 2));
  process.exit(0);
}

if (has('--fill')) {
  const queuePath = argOf('--queue');
  const root = path.resolve(argOf('--root') ?? '.');
  if (!queuePath) throw new Error('--queue <queue.json> 이 필요해요');
  const queue = readJson(queuePath);
  const entries = queue.entries ?? [];
  const time = argOf('--time') ?? '21:00';
  const day = argOf('--from') ?? firstFreeDay(entries, new Date());
  // --ahead N: 오늘부터 N 일 뒤까지 차도록만 (몇 번을 돌려도 겹치지 않음). 없으면 --days 개
  const max = Number(argOf('--days') ?? 7);
  const days = argOf('--ahead') ? howMany(day, new Date(), Number(argOf('--ahead')), max) : max;
  if (days <= 0) {
    console.log(`큐에 이미 ${argOf('--ahead')}일치가 있어요 — 넣을 게 없어요 (다음 빈 날 ${day}).`);
    process.exit(0);
  }
  const feed = entries.filter((e) => e.kind !== 'story');
  // 큐에 있거나 사람이 뺀(queue.dropped) 항목은 다시 고르지 않는다
  const used = new Set([...entries.map((e) => e.id), ...(queue.dropped ?? [])]);
  const itemOf = (id) => items.find((it) => it.id === id);
  const lastFormat = itemOf(feed.at(-1)?.id)?.format;
  // 배운 것: 남은 항목이 있는 포맷들로 다음 주 구성을 다시 계산한다
  const statsPath = path.join(root, 'marketing', 'learn', 'stats.json');
  const stats = existsSync(statsPath) ? readJson(statsPath) : { posts: {} };
  const formats = [...new Set(items.filter((it) => !used.has(it.id)).map((it) => it.format))];
  const model = learnModel(stats, { formats });
  const pattern = model.scored >= 3 ? model.week : WEEK;
  const recentTopics = feed.slice(-2).reverse().flatMap((e) => topicsOf(itemOf(e.id) ?? {}, e.caption));
  const dayList = [day];
  while (dayList.length < days) dayList.push(nextDay(dayList.at(-1)));
  const picks = pickForDays(items, used, dayList, pattern, { lastFormat, recentTopics, topicsOf, rank: (pool, recent) => rankItems(pool, model, recent) });
  if (!picks.length) {
    console.log('창고에 새 항목이 없어요 — 콘텐츠를 더 넣어 주세요.');
    process.exit(0);
  }
  console.log(`큐에 ${picks.length}개 추가 (${day}부터 하루 하나, ${time}) — 구성: ${model.scored >= 3 ? '배운 대로' : '기본'} ${pattern.join(' · ')}`);
  // --plan: 무엇을 어느 날 넣을지만 보여 주고 끝 (그림·큐는 그대로)
  if (has('--plan')) {
    for (const { day: d, item: it } of picks) console.log(`  ${d} ${it.format.padEnd(14)} ${it.id.padEnd(24)} ${topicsOf(it).join(' · ')}`);
    process.exit(0);
  }
  const approve = has('--approve');
  const added = [];
  for (const { day: d, item: it } of picks) {
    const entry = await build(it, path.join(root, 'marketing', 'social', it.id), root);
    if (approve) Object.assign(entry, { approved: true, approvedBy: `자동 허락 (SOCIAL_AUTO_APPROVE) ${new Date().toISOString()}` });
    added.push({ ...entry, at: `${d} ${time}` });
  }
  // id·at 을 앞으로 (사람이 읽기 좋게)
  queue.entries = [...entries, ...added.map(({ id, at, ...rest }) => ({ id, at, ...rest }))];
  writeFileSync(queuePath, `${JSON.stringify(queue, null, 2)}\n`);
  const left = items.filter((it) => !used.has(it.id) && !picks.some((p) => p.item === it)).length;
  const summary = argOf('--summary');
  if (summary) {
    const made = { added: added.map((e) => ({ id: e.id, at: e.at, kind: e.kind, format: itemOf(e.id)?.format, media: e.media, cover: e.cover, caption: e.caption, note: e.note, approved: e.approved })), left, learned: model.scored >= 3, report: reportMarkdown(model) };
    writeFileSync(summary, JSON.stringify(made, null, 2));
  }
  console.log(`창고에 남은 새 항목: ${left}개`);
  process.exit(0);
}

if (!has('--check')) console.log('할 일을 주세요: --check · --id <항목> --out <폴더> · --fill');
