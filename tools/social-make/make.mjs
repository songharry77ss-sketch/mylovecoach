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
import { bankProblems } from './bank.mjs';
import { FORMATS, closeFormats } from './formats/index.mjs';
import { makeFeedStory } from './formats/story.mjs';
import { WEEK, firstFreeDay, howMany, nextDay, pickForDays } from './plan.mjs';

const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const argOf = (f) => (args.includes(f) ? args[args.indexOf(f) + 1] : undefined);
const readJson = (f) => JSON.parse(readFileSync(f, 'utf8').replace(/^﻿/, ''));

const bankPath = argOf('--bank');
if (!bankPath) throw new Error('--bank <bank.json> 이 필요해요');
const bank = readJson(bankPath);
const items = bank.items ?? [];

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
  // 스토리: 릴스는 영상 그대로, 캐러셀은 첫 장 + 질문 그림
  let story = made.media[0];
  if (fmt.kind === 'carousel') story = await makeFeedStory(made.media[0], path.join(dir, 'story.jpg'), { ask: it.storyAsk ?? STORY_ASK[it.format] ?? it.ask });
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
    ...(story ? { story: rel(story) } : {}),
  };
}

/** 스토리에는 첫 장만 보이니, 첫 장만 보고도 답할 수 있는 질문으로 (창고 항목 storyAsk 가 있으면 그것) */
const STORY_ASK = { 'pick-carousel': '너라면 뭐라고 보낼래?', 'list-carousel': '이 중 몇 개 해당될 것 같아?', 'kkti-pair': '너랑 그 사람은 무슨 조합이야?' };

/** 「21:00」 → 「21:01」 */
const plusMinute = (hm) => {
  const [h, m] = hm.split(':').map(Number);
  const t = (h * 60 + m + 1) % (24 * 60);
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
};

const only = argOf('--id');
if (only) {
  const it = items.find((x) => x.id === only);
  if (!it) throw new Error(`창고에 ${only} 가 없어요`);
  const out = path.resolve(argOf('--out') ?? '.');
  const entry = await build(it, path.join(out, it.id), out).finally(closeFormats);
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
  const failed = [];
  try {
    for (const { item: it } of picks) {
      // 하나가 실패해도(예: 코치 서버 응답 없음) 나머지는 만든다 — 실패한 날은 다음 항목이 당겨 채운다
      let entry;
      try {
        entry = await build(it, path.join(root, 'marketing', 'social', it.id), root);
      } catch (e) {
        console.error(`  ✗ ${it.id} (${it.format}) 만들기 실패: ${e.message}`);
        failed.push({ id: it.id, format: it.format, error: String(e.message).slice(0, 300) });
        continue;
      }
      const d = dayList[added.filter((x) => x.kind !== 'story').length];
      const ok = approve ? { approved: true, approvedBy: `자동 허락 (SOCIAL_AUTO_APPROVE) ${new Date().toISOString()}` } : {};
      const { story, ...feed } = entry;
      added.push({ ...feed, ...ok, at: `${d} ${time}` });
      // 사장님 규칙: 피드마다 스토리도 — 피드가 올라간 뒤(after)에만 나간다
      if (story) added.push({ id: `${it.id}-story`, at: `${d} ${plusMinute(time)}`, channel: 'instagram', kind: 'story', media: [story], approved: false, ...ok, after: it.id, note: `자동 생산 · ${it.format} 스토리` });
    }
  } finally {
    await closeFormats(); // 웹 빌드·서버·브라우저(app-reel)는 한 번만 띄우고 여기서 닫는다
  }
  // id·at 을 앞으로 (사람이 읽기 좋게)
  queue.entries = [...entries, ...added.map(({ id, at, ...rest }) => ({ id, at, ...rest }))];
  writeFileSync(queuePath, `${JSON.stringify(queue, null, 2)}\n`);
  const left = items.filter((it) => !used.has(it.id) && !picks.some((p) => p.item === it)).length;
  const summary = argOf('--summary');
  if (summary) {
    const feedOnly = added.filter((e) => e.kind !== 'story');
    const made = { added: feedOnly.map((e) => ({ id: e.id, at: e.at, kind: e.kind, format: itemOf(e.id)?.format, media: e.media, cover: e.cover, story: added.find((x) => x.after === e.id)?.media?.[0], caption: e.caption, note: e.note, approved: e.approved })), failed, left, learned: model.scored >= 3, report: reportMarkdown(model) };
    writeFileSync(summary, JSON.stringify(made, null, 2));
  }
  console.log(`창고에 남은 새 항목: ${left}개`);
  process.exit(0);
}

if (!has('--check')) console.log('할 일을 주세요: --check · --id <항목> --out <폴더> · --fill');
