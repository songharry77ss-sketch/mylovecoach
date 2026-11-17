#!/usr/bin/env node
// 다 올린 항목의 그림·영상을 social-queue 가지에서 빼기 (git 기록에는 남는다).
//   node tools/social-make/prune.mjs --root <social-queue 폴더> [--days 1] [--dry]
// 가지가 커지면 jsDelivr 가 그 커밋의 파일을 못 가져온다(2026-11-14 부터 21MB 넘자 mp4 가 404, 마케팅 세션 확인).
// 그래서 폴더를 쓰는 큐 항목(피드·스토리)이 전부 올라가고 days 일 지난 폴더만 지운다. 아무 항목도 안 쓰는 폴더는 건드리지 않는다.
// 매일 「인스타·쓰레드 성과」 실행이 돌린다.
import { existsSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const argOf = (f) => (args.includes(f) ? args[args.indexOf(f) + 1] : undefined);
const root = path.resolve(argOf('--root') ?? '.');
const days = Number(argOf('--days') ?? 1);
const dry = args.includes('--dry');
const readJson = (f) => JSON.parse(readFileSync(f, 'utf8').replace(/^﻿/, ''));

const social = path.join(root, 'marketing', 'social');
const queue = readJson(path.join(social, 'queue.json'));
const postedFile = path.join(social, 'posted.json');
const posted = existsSync(postedFile) ? readJson(postedFile) : { posts: [] };
const postedAt = new Map(posted.posts.map((p) => [p.id, new Date(p.at ?? 0).getTime()]));
const cutoff = Date.now() - days * 86_400_000;

/** 항목이 쓰는 폴더들 (media·cover 경로의 marketing/social/<폴더>/) */
const dirsOf = (e) => [...new Set([...(e.media ?? []), ...(e.cover ? [e.cover] : [])].map((m) => String(m).match(/^marketing\/social\/([^/]+)\//)?.[1]).filter(Boolean))];

const users = new Map();
for (const e of queue.entries ?? []) for (const d of dirsOf(e)) users.set(d, [...(users.get(d) ?? []), e.id]);

const removed = [];
for (const name of readdirSync(social)) {
  const dir = path.join(social, name);
  if (!statSync(dir).isDirectory()) continue;
  const ids = users.get(name);
  if (!ids?.length) continue;
  const done = ids.every((id) => postedAt.has(id) && postedAt.get(id) < cutoff);
  if (!done) continue;
  if (!dry) rmSync(dir, { recursive: true, force: true });
  removed.push(`${name} (${ids.join(', ')})`);
}
console.log(removed.length ? `${dry ? '지울' : '지운'} 폴더 ${removed.length}개:\n- ${removed.join('\n- ')}` : '지울 폴더 없음');
