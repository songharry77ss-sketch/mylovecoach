#!/usr/bin/env node
// 성과 모으기 + 배우기. 매일 아침 「인스타·쓰레드 성과」 실행(social-insights.yml)이 돌리고, 결과를 social-queue 가지에 쌓는다.
//   node tools/social-learn.mjs --root <social-queue 폴더> [--limit 40] [--offline]
//
// <root>/marketing/learn/
//   stats.json  게시물마다 날짜별 조회·도달·공유·저장·댓글 (스냅숏)
//   model.json  포맷·주제별 점수와 다음 주 구성 — 자동 생산(make.mjs)이 이걸 보고 고른다
//   report.md   사람이 읽는 학습 보고 (미리 보기 이슈에도 붙는다)
// --offline: API 를 부르지 않고 쌓인 stats.json 으로 다시 배우기만 한다
// 토큰: IG_ACCESS_TOKEN (없으면 --offline 처럼). 인스타에 바꾸는 것은 없다(읽기만).
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { addSnapshot, learnModel, reportMarkdown, topicsOf } from './lib/learn.mjs';
import { igInsights, igMe, igRecent } from './lib/meta-publish.mjs';

const args = process.argv.slice(2);
const argOf = (f) => (args.includes(f) ? args[args.indexOf(f) + 1] : undefined);
const root = path.resolve(argOf('--root') ?? '.');
const limit = Number(argOf('--limit') ?? 40) || 40;
const offline = args.includes('--offline') || !process.env.IG_ACCESS_TOKEN;
const readJson = (f, fallback) => (existsSync(f) ? JSON.parse(readFileSync(f, 'utf8').replace(/^﻿/, '')) : fallback);

const dir = path.join(root, 'marketing', 'learn');
const statsPath = path.join(dir, 'stats.json');
const stats = readJson(statsPath, { posts: {} });
const queue = readJson(path.join(root, 'marketing', 'social', 'queue.json'), { entries: [] });
const posted = readJson(path.join(root, 'marketing', 'social', 'posted.json'), { posts: [] });
const bank = readJson(path.join(root, 'marketing', 'content', 'bank.json'), { items: [] });

const KIND = { VIDEO: 'reel', REELS: 'reel', CAROUSEL_ALBUM: 'carousel', IMAGE: 'image' };
const shortcode = (url) => String(url ?? '').match(/\/(?:p|reel|reels)\/([^/?#]+)/)?.[1];
const now = new Date();

/** 인스타 게시물 → 큐 항목 id·포맷·주제 (큐에서 올린 게 아니면 old-<종류>) */
function describe(m) {
  const rec = posted.posts.find((p) => p.channel === 'instagram' && ((p.mediaId && p.mediaId === m.id) || (shortcode(p.url) && shortcode(p.url) === shortcode(m.url))));
  const id = rec?.id ?? `ig-${m.id}`;
  const item = bank.items.find((it) => it.id === id);
  const entry = queue.entries.find((e) => e.id === id);
  const kind = KIND[m.type] ?? 'other';
  const noted = String(entry?.note ?? '').match(/자동 생산 · ([a-z-]+)/)?.[1];
  // 큐 항목에 format 이 있으면 그것, 사장님이 찍은 영상(u-…)은 실사 릴스로 따로 센다
  const real = /^u-/.test(id) && kind === 'reel' ? 'real-reel' : undefined;
  const format = entry?.format ?? item?.format ?? noted ?? real ?? `old-${kind}`;
  const hook = item?.hook ?? String(m.text ?? '').split('\n')[0].slice(0, 40);
  const hourKst = (new Date(m.at).getUTCHours() + 9) % 24;
  return { id, meta: { mediaId: m.id, url: m.url, postedAt: m.at, kind, format, hook, topics: topicsOf(item ?? { hook }, m.text), hourKst } };
}

if (!offline) {
  const token = process.env.IG_ACCESS_TOKEN;
  const me = await igMe(token);
  let n = 0;
  for (const m of await igRecent(me.id, token, limit)) {
    // 한 달 넘은 게시물은 숫자가 거의 안 바뀌어 더 재지 않는다
    if (now - new Date(m.at) > 30 * 86_400_000 && stats.posts?.[describe(m).id]) continue;
    const s = await igInsights(m.id, token, m.type);
    const { id, meta } = describe(m);
    addSnapshot(stats, id, meta, { views: s.views, reach: s.reach, saved: s.saved, shares: s.shares, likes: m.likes, comments: m.comments, follows: s.follows, profileVisits: s.profile_visits, watchMs: s.ig_reels_avg_watch_time }, now);
    n++;
  }
  console.log(`@${me.username} 게시물 ${n}개 성과를 쌓았어요`);
}

// 주제 규칙이 바뀌어도 예전 기록까지 같은 규칙으로 다시 본다
for (const [id, post] of Object.entries(stats.posts ?? {})) {
  const item = bank.items.find((it) => it.id === id);
  if (item) post.meta = { ...post.meta, format: item.format, hook: item.hook, topics: topicsOf(item) };
}

const formats = [...new Set(bank.items.map((it) => it.format))];
const model = learnModel(stats, { formats, now });
const report = reportMarkdown(model);
mkdirSync(dir, { recursive: true });
stats.updatedAt = now.toISOString();
writeFileSync(statsPath, `${JSON.stringify(stats, null, 1)}\n`);
writeFileSync(path.join(dir, 'model.json'), `${JSON.stringify(model, null, 2)}\n`);
writeFileSync(path.join(dir, 'report.md'), `${report}\n`);
console.log(report);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `\n${report}\n`);
