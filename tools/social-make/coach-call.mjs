#!/usr/bin/env node
// 앱 사용 영상(app-reel)에 넣을 「진짜 AI 결과」 — 운영 코치 서버(/api/coach)에 앱과 같은 요청을 보내 받아 온다.
//
//   하나 받아 보기: node tools/social-make/coach-call.mjs --bank <bank.json> --id <항목> --out <폴더>
//
// - 요청은 녹화(record-app.mjs)에서 앱이 만드는 것과 같게 만든다 (coachRequestOf). 녹화가 앱이 실제로 만든 요청과 맞춰 보고, 다르면 멈춘다.
// - 결과는 <폴더>/analysis.json 에 남겨 두고 다음부터는 다시 부르지 않는다. 창고 항목에 analysis 가 있으면 그것을 쓴다.
// - 서버 주소·앱 토큰은 환경 변수 EXPO_PUBLIC_API_URL · EXPO_PUBLIC_API_TOKEN 에서 읽고, 화면·파일·로그에 남기지 않는다.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** 녹화 때 앱에 넣어 두는 내 프로필 — 이름은 비워 둔다 (앱의 「빠른 시작」과 같은 모양) */
export const demoUser = (it) => ({ name: '', gender: it.myGender ?? (it.gender === 'male' ? 'female' : 'male'), style: [], defaultTone: it.tone ?? 'natural', emoji: 'on' });

/** 앱 입력창에 칠 글 — 받은 카톡을 「이름: 말」 줄로 (내가 보낸 말은 「나: 말」) */
export function typedText(it) {
  if (typeof it.typed === 'string' && it.typed.trim()) return it.typed.trim();
  return it.messages
    .filter((m) => !m.day)
    .map((m) => `${m.from === 'me' ? '나' : it.name}: ${m.text}`)
    .join('\n');
}

/** 기기의 오늘 날짜 표시 (앱 coach-schema 의 todayLabel 과 같은 모양 · 한국 시각) */
export function todayLabel(now = new Date()) {
  const k = new Date(now.getTime() + 9 * 3_600_000);
  return `${k.getUTCMonth() + 1}/${k.getUTCDate()}(${'일월화수목금토'[k.getUTCDay()]})`;
}

/**
 * 앱이 이 항목으로 만드는 코칭 요청 (hooks/use-coach 의 requestCoaching 인자와 같은 모양).
 * 새로 만든 채팅방(호칭·말투 「캡처 따라」, 온도 0, 기억 없음)에서 첫 질문을 보낸 경우다
 */
export function coachRequestOf(it, now = new Date()) {
  const user = demoUser(it);
  return {
    crush: { name: it.name, gender: it.gender ?? 'female', relationship: it.relationship ?? 'talking', style: [], notes: '', heat: 0 },
    user: { name: user.name, gender: user.gender, style: [] },
    tone: user.defaultTone,
    emoji: 'on',
    toneChosen: false,
    emojiChosen: false,
    text: typedText(it),
    history: [],
    today: todayLabel(now),
  };
}

/** 녹화 때 앱이 만든 요청과 결과를 받을 때 보낸 요청이 같은 질문인지 (날짜 표시는 빼고) — 다르면 문제 목록 */
export function requestMismatch(sent, fromApp) {
  const pick = (r) => ({
    crush: { name: r?.crush?.name, gender: r?.crush?.gender, relationship: r?.crush?.relationship, style: r?.crush?.style ?? [], notes: r?.crush?.notes ?? '' },
    user: { name: r?.user?.name, gender: r?.user?.gender },
    tone: r?.tone,
    emoji: r?.emoji ?? 'on',
    text: String(r?.text ?? '').trim(),
    history: (r?.history ?? []).length,
  });
  const a = pick(sent);
  const b = pick(fromApp);
  const out = [];
  for (const k of Object.keys(a)) if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) out.push(`${k}: 받을 때 ${JSON.stringify(a[k])} · 앱 ${JSON.stringify(b[k])}`);
  return out;
}

/** 결과가 영상에 쓸 만한지 — 문제 목록 */
export function analysisProblems(a) {
  const out = [];
  if (!a || typeof a !== 'object') return ['결과가 비었어요'];
  if (typeof a.summary !== 'string' || !a.summary.trim()) out.push('summary 가 없어요');
  const replies = Array.isArray(a.replies) ? a.replies.filter((r) => r && typeof r.text === 'string' && r.text.trim()) : [];
  if (replies.length < 3) out.push(`추천 답장이 3개가 아니에요 (${replies.length}개)`);
  if (replies.some((r) => typeof r.expectedReaction !== 'string' || !r.expectedReaction.trim())) out.push('예상 반응(expectedReaction)이 빠진 답장이 있어요');
  if (/데모/.test(JSON.stringify(a))) out.push('데모 표시가 섞여 있어요 — 실제 결과가 아니에요');
  return out;
}

async function callServer(request) {
  const base = String(process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/+$/, '');
  const token = process.env.EXPO_PUBLIC_API_TOKEN ?? '';
  if (!base) throw new Error('EXPO_PUBLIC_API_URL(코치 서버 주소)이 없어요 — 진짜 AI 결과를 받을 수 없어요');
  const res = await fetch(`${base}/api/coach`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { 'x-app-token': token } : {}),
      // 앱과 같이 「보내도 된다고 한 AI 회사」를 알린다 — 서버가 보낼 회사와 다르면 거절한다
      'x-ai-consent': 'google',
      'user-agent': 'sendit-social-make',
    },
    body: JSON.stringify(request),
    signal: AbortSignal.timeout(100_000),
  });
  let body = null;
  try {
    body = await res.json();
  } catch {
    // 아래에서 상태 코드로 알린다
  }
  if (!res.ok) throw new Error(`코치 서버가 거절했어요 (${res.status}${body?.error ? ` · ${body.error}` : ''})`);
  return body?.analysis;
}

/** 실제로 부른 횟수 (같은 실행 안) */
export const calls = { count: 0 };

/**
 * 항목의 진짜 AI 결과 — 창고 항목의 analysis → <dir>/analysis.json → 서버 순서로 찾는다.
 * 돌려줌: { analysis, request, source: 'bank' | 'cache' | 'api' }
 */
export async function realAnalysis(it, dir) {
  const request = coachRequestOf(it);
  if (it.analysis) {
    const p = analysisProblems(it.analysis);
    if (p.length) throw new Error(`${it.id}: 창고의 analysis 를 쓸 수 없어요 — ${p.join(' · ')}`);
    return { analysis: it.analysis, request: it.analysisRequest ?? request, source: 'bank' };
  }
  const file = path.join(dir, 'analysis.json');
  if (existsSync(file)) {
    const saved = JSON.parse(readFileSync(file, 'utf8'));
    // 질문이 바뀌었으면(창고 글을 고침) 다시 받는다
    if (!requestMismatch(saved.request, request).length && !analysisProblems(saved.analysis).length) return { analysis: saved.analysis, request: saved.request, source: 'cache' };
  }
  calls.count += 1;
  const analysis = await callServer(request);
  const p = analysisProblems(analysis);
  if (p.length) throw new Error(`${it.id}: AI 결과를 쓸 수 없어요 — ${p.join(' · ')}`);
  writeFileSync(file, `${JSON.stringify({ at: new Date().toISOString(), note: '운영 코치 서버(/api/coach)가 돌려준 실제 결과 — app-reel 녹화에 넣음', request, analysis }, null, 2)}\n`);
  return { analysis, request, source: 'api' };
}

// ───────────── 손으로 하나 받아 보기 ─────────────
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const argOf = (f) => (args.includes(f) ? args[args.indexOf(f) + 1] : undefined);
  const bank = JSON.parse(readFileSync(argOf('--bank'), 'utf8').replace(/^﻿/, ''));
  const it = bank.items.find((x) => x.id === argOf('--id'));
  if (!it) throw new Error(`창고에 ${argOf('--id')} 가 없어요`);
  const dir = path.resolve(argOf('--out') ?? '.', it.id);
  const { mkdirSync } = await import('node:fs');
  mkdirSync(dir, { recursive: true });
  const got = await realAnalysis(it, dir);
  console.log(`${it.id}: ${got.source === 'api' ? '서버에서 새로 받음' : got.source === 'cache' ? '저장해 둔 결과' : '창고의 결과'}`);
  for (const [i, r] of got.analysis.replies.entries()) console.log(`  ${i + 1}. ${r.text}  (${r.successRate}% · 예상 반응: ${r.expectedReaction})`);
}
