// 「실제 앱 사용 릴스」 — 받은 카톡(훅) → 폰 틀 안의 실제 앱 녹화(진짜 AI 답장 3개) → 고른 답장을 보내면(예상 반응) → 「센딧」 검색.
// 레퍼런스: 해외 AI 연애 앱(RIZZ 등)이 「막힌 순간의 해결사」로 앱 화면을 그대로 보여 주는 영상.
// 정직: 앱 부분은 실제 앱(데모 웹 빌드) 화면과 운영 코치 서버의 실제 결과(coach-call.mjs)다. 받은 카톡·상대 반응은 지어낸 장면이라 「연출」·「예상 반응」을 붙인다.
//
// 항목 (bank.json):
// { id, format: 'app-reel', label?, hook: '"주말에 뭐해?"\n이렇게 답하면', hookEm?, name: '민준', avatar: '🐶', gender: 'male' | 'female',
//   relationship?: 'talking'(썸·기본) | 'crush' | 'blind_date' | 'friend' | 'dating' | 'ex', myGender?,
//   messages: [{ from: 'them' | 'me', text, time? }] (마지막은 상대 말), typed? (앱 입력창에 칠 글 — 없으면 messages 를 「이름: 말」 줄로),
//   pick? (고를 답장 0~2 — 없으면 성공 확률이 가장 높은 것), steps? (자막 4개), result?: { title }, end?: { ask }, caption,
//   analysis? (실제 결과를 고정해 둘 때 — 보통은 비워 두고 <폴더>/analysis.json 에 받아 둔다) }
import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Resvg } from '@resvg/resvg-js';

import { analysisProblems, coachRequestOf, demoUser, realAnalysis, requestMismatch, typedText } from '../coach-call.mjs';
import { C, body, box, chat, col, emoji, headline, missingEmoji, row, saveJpg, signature, tag, text } from '../kit.mjs';
import { VIEW, recordApp } from '../record-app.mjs';
import { FPS, saveMp4 } from '../video.mjs';

const W = 1080;
const H = 1920;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const ease = (x) => 1 - (1 - x) ** 3;
const easeInOut = (x) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2);
const clamp01 = (x) => Math.max(0, Math.min(1, x));

export const RELATIONSHIPS = ['talking', 'crush', 'blind_date', 'friend', 'dating', 'ex'];
/** 훅·결과 카톡 장면의 대화 크기 (chat-reel 보다 조금 크게 — 말풍선이 적어서) */
const CHAT_SCALE = 1.12;
export const DEFAULT_STEPS = ['채팅방 만들고', '받은 카톡 넣고', 'AI가 답장 3개 추천', '골라서 복사'];

/** AI 글 속 이모지 중 그림이 없는 것은 뺀다 (네모로 깨지지 않게) */
const safe = (s) => {
  let out = String(s ?? '');
  for (const e of missingEmoji(out)) out = out.split(e).join('');
  return out.replace(/\s{2,}/g, ' ').trim();
};

/** 고를 답장 — 항목이 정하지 않았으면 성공 확률이 가장 높은 것 */
export function pickIndex(it, analysis) {
  const replies = analysis.replies.slice(0, 3);
  if (Number.isInteger(it.pick) && it.pick >= 0 && it.pick < replies.length) return it.pick;
  return replies.reduce((best, r, i) => ((r.successRate ?? 0) > (replies[best].successRate ?? 0) ? i : best), 0);
}

// ───────────── 장면: 훅 ─────────────

function popLast(chatTree, p) {
  if (p >= 1) return chatTree;
  const listNode = chatTree.props.children.at(-1);
  const last = listNode.props.children.at(-1);
  const k = ease(p);
  last.props.style = { ...last.props.style, opacity: Math.min(1, k * 1.6), transform: `translate(0px, ${((1 - k) * 40).toFixed(1)}px) scale(${(0.92 + 0.08 * k).toFixed(3)})` };
  return chatTree;
}

/** 말풍선 shown 개까지 (그 앞의 날짜 줄 포함) */
function upTo(messages, shown) {
  const out = [];
  let n = 0;
  for (const m of messages) {
    if (!m.day && n >= shown) break;
    out.push(m);
    if (!m.day) n += 1;
  }
  return out;
}

function hookScene(it, { shown, pop = 1, hint = 0, cover = false }) {
  const msgs = upTo(it.messages, shown);
  return col(
    { width: W, height: H, backgroundColor: C.canvas, fontFamily: 'Pretendard', padding: `${cover ? 330 : 250}px 50px 0`, overflow: 'hidden' },
    tag(it.label ?? '센딧 실사용', { size: 32 }),
    headline(it.hook, { size: 92, em: it.hookEm ?? [], style: { marginTop: 24 } }),
    col({ marginTop: 50 }, popLast(chat({ name: it.name, avatar: it.avatar, messages: msgs, width: 980 / CHAT_SCALE, scale: CHAT_SCALE }), pop)),
    hint > 0
      ? row({ marginTop: 40, gap: 14, opacity: Math.min(1, ease(hint) * 1.4), transform: `translate(0px, ${((1 - ease(hint)) * 30).toFixed(1)}px)` }, text('센딧한테 그대로 물어봤어', { fontSize: 46, fontWeight: 900, color: C.blue, letterSpacing: -1.5 }), emoji('👇', 52))
      : null,
  );
}

// ───────────── 장면: 폰 틀 안의 실제 앱 ─────────────

const SCREEN_W = 600;
const SCREEN_H = Math.round((SCREEN_W * VIEW.height) / VIEW.width);
const BEZEL = 16;
/** 카메라 — z: 확대, fy: 화면에서 볼 곳(위 0 ~ 아래 1), y: 그곳을 둘 영상 높이 */
const CAM = {
  full: { z: 1, fy: 0.5, y: 300 + BEZEL + SCREEN_H / 2 },
  composer: { z: 1.3, fy: 0.86, y: 1200 },
  replies: { z: 1.14, fy: 0.46, y: 1000 },
};
/** 녹화 구간 → 영상 길이(초, 넘으면 빨리 감기) · 카메라 · 자막 번호 */
const SEG = [
  { k: 'home', max: 0.4, cam: 'full', step: 0 },
  { k: 'form', max: 1.9, cam: 'full', step: 0 },
  { k: 'typing', max: 1.9, cam: 'composer', step: 1 },
  { k: 'sent', max: 1.5, cam: 'full', step: 2 },
  { k: 'result', max: 1.4, cam: 'full', step: 2 },
  { k: 'scroll', max: 1.0, cam: 'replies', step: 2, slow: true },
  { k: 'replies', max: 1.4, cam: 'replies', step: 2 },
  { k: 'pick', max: 1.5, cam: 'replies', step: 3 },
];

/** 녹화 시각 ↔ 영상 시각. budget(초)을 넘으면 모든 구간을 같은 비율로 줄인다 */
export function timeline(marks, budget = 11) {
  const raw = SEG.map((s, i) => ({ ...s, a: marks[s.k], b: i + 1 < SEG.length ? marks[SEG[i + 1].k] : marks.end }));
  for (const p of raw) if (!(p.b > p.a)) p.b = p.a + 0.01;
  const want = raw.map((p) => Math.min(p.b - p.a, p.max));
  const sum = want.reduce((a, b) => a + b, 0);
  const k = sum > budget ? budget / sum : 1;
  let at = 0;
  const pieces = raw.map((p, i) => {
    const out = { ...p, o0: at, o1: at + want[i] * k };
    at = out.o1;
    return out;
  });
  const find = (list, v, lo, hi) => list.find((p) => v >= p[lo] && v < p[hi]) ?? (v < list[0][lo] ? list[0] : list.at(-1));
  return {
    total: at,
    pieces,
    rawAt: (o) => {
      const p = find(pieces, o, 'o0', 'o1');
      return p.a + clamp01((o - p.o0) / (p.o1 - p.o0)) * (p.b - p.a);
    },
    outAt: (r) => {
      const p = find(pieces, r, 'a', 'b');
      return p.o0 + clamp01((r - p.a) / (p.b - p.a)) * (p.o1 - p.o0);
    },
    pieceAt: (o) => find(pieces, o, 'o0', 'o1'),
  };
}

function cameraAt(tl, o) {
  const p = tl.pieceAt(o);
  const i = tl.pieces.indexOf(p);
  const to = CAM[p.cam];
  const from = CAM[tl.pieces[i - 1]?.cam ?? p.cam];
  if (from === to) return to;
  const k = easeInOut(clamp01((o - p.o0) / (p.slow ? p.o1 - p.o0 : 0.45)));
  const mix = (a, b) => a + (b - a) * k;
  return { z: mix(from.z, to.z), fy: mix(from.fy, to.fy), y: mix(from.y, to.y) };
}

/**
 * 폰 그림자 — 한 번만 그려 두고 그림으로 깐다. resvg 의 흐림(box-shadow)은 프레임마다 그리면 한 장에 몇 초씩 걸린다
 * (반 크기로 그려 늘려 쓴다 — 흐린 그림이라 티가 안 난다)
 */
const SHADOW_M = 90;
let shadowUri = null;
function phoneShadow() {
  if (shadowUri) return shadowUri;
  const s = 0.5;
  const pw = (SCREEN_W + BEZEL * 2) * s;
  const ph = (SCREEN_H + BEZEL * 2) * s;
  const m = SHADOW_M * s;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${pw + m * 2}" height="${ph + m * 2}"><filter id="b" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${18 * s * 2}"/></filter><rect x="${m}" y="${m}" width="${pw}" height="${ph}" rx="${74 * s}" fill="rgba(25,31,40,0.30)" filter="url(#b)"/></svg>`;
  shadowUri = `data:image/png;base64,${Buffer.from(new Resvg(svg, { font: { loadSystemFonts: false } }).render().asPng()).toString('base64')}`;
  return shadowUri;
}

function phone(src, cam) {
  const z = cam.z;
  const sw = SCREEN_W * z;
  const sh = SCREEN_H * z;
  const bz = BEZEL * z;
  const left = W / 2 - sw / 2 - bz;
  const top = cam.y - bz - cam.fy * sh;
  const m = SHADOW_M * z;
  return [
    { type: 'img', props: { src: phoneShadow(), width: sw + bz * 2 + m * 2, height: sh + bz * 2 + m * 2, style: { position: 'absolute', left: left - m, top: top - m + 28 * z, width: sw + bz * 2 + m * 2, height: sh + bz * 2 + m * 2 } } },
    box(
      { position: 'absolute', left, top, width: sw + bz * 2, height: sh + bz * 2, borderRadius: 74 * z, backgroundColor: '#14171C', padding: bz },
      { type: 'img', props: { src, width: sw, height: sh, style: { width: sw, height: sh, borderRadius: 58 * z } } },
    ),
  ];
}

function stepPill(n, label, k = 1) {
  return row(
    { gap: 18, padding: '16px 34px 16px 16px', borderRadius: 999, backgroundColor: '#FFFFFF', border: `2px solid ${C.line}`, opacity: Math.min(1, k * 1.5), transform: `translate(0px, ${((1 - k) * 24).toFixed(1)}px)` },
    box({ width: 68, height: 68, borderRadius: 34, backgroundColor: C.blue, alignItems: 'center', justifyContent: 'center' }, text(String(n), { fontSize: 38, fontWeight: 900, color: '#FFFFFF' })),
    text(label, { fontSize: 54, fontWeight: 900, color: C.ink, letterSpacing: -2 }),
  );
}

const realTag = () =>
  row(
    { gap: 10, padding: '12px 22px', borderRadius: 999, backgroundColor: '#FFFFFF', border: `2px solid ${C.line}` },
    box({ width: 14, height: 14, borderRadius: 7, backgroundColor: C.pink }),
    text('실제 앱 화면', { fontSize: 28, fontWeight: 800, color: C.sub, letterSpacing: -0.5 }),
  );

function appScene(src, cam, step, stepK, steps) {
  return box(
    { width: W, height: H, backgroundColor: C.canvas, fontFamily: 'Pretendard', overflow: 'hidden' },
    box({ position: 'absolute', left: 0, right: 0, top: 1730, justifyContent: 'center' }, signature()),
    phone(src, cam),
    box({ position: 'absolute', left: 44, top: 148 }, stepPill(step + 1, steps[step], stepK)),
    box({ position: 'absolute', right: 44, top: 260 }, realTag()),
  );
}

// ───────────── 장면: 보내면? (연출 · 예상 반응) ─────────────

function resultScene(it, mine, theirs, rate, { stage, pop = 1, dots = 0 }) {
  const msgs = it.messages.map((m) => ({ ...m }));
  const sentTime = it.sentTime ?? msgs.filter((m) => !m.day).at(-1)?.time;
  if (stage >= 1) msgs.push({ from: 'me', text: mine, time: sentTime, unread: stage === 1, note: stage === 1 && pop < 1 ? undefined : `센딧 추천 · 성공 확률 ${rate}%` });
  if (dots) msgs.push({ from: 'them', typing: true, dots });
  if (stage >= 2) msgs.push({ from: 'them', text: theirs, time: sentTime, note: pop >= 1 ? '예상 반응' : undefined });
  // 화면에 다 안 들어가면 오래된 것부터 밀어낸다
  const visible = msgs.slice(-6);
  return col(
    { width: W, height: H, backgroundColor: C.canvas, fontFamily: 'Pretendard', padding: '250px 50px 0', overflow: 'hidden' },
    tag('연출 · 예상 반응', { size: 32, bg: C.violetSoft, color: C.violet }),
    headline(it.result?.title ?? '이렇게 보내면', { size: 92, em: it.result?.em ?? [], style: { marginTop: 24 } }),
    col({ marginTop: 50 }, popLast(chat({ name: it.name, avatar: it.avatar, messages: visible, width: 980 / CHAT_SCALE, scale: CHAT_SCALE }), pop)),
    stage >= 2 && pop >= 1 ? body('상대 반응은 센딧 AI가 예상한 답장이에요', { size: 32, color: C.faint, style: { marginTop: 28 } }) : null,
  );
}

// ───────────── 장면: 끝 카드 ─────────────

let iconUri = null;
const appIcon = (size) => {
  iconUri ??= `data:image/png;base64,${readFileSync(path.join(ROOT, 'assets', 'images', 'icon.png')).toString('base64')}`;
  return { type: 'img', props: { src: iconUri, width: size, height: size, style: { width: size, height: size, borderRadius: size * 0.23, boxShadow: '0 18px 50px rgba(61,99,245,0.35)' } } };
};

function searchBar() {
  return row(
    { width: 760, gap: 22, padding: '30px 40px', borderRadius: 999, backgroundColor: '#FFFFFF', boxShadow: '0 12px 40px rgba(25,31,40,0.10)' },
    // 돋보기
    box({ width: 46, height: 46 }, box({ position: 'absolute', left: 0, top: 0, width: 34, height: 34, borderRadius: 17, border: `6px solid ${C.faint}` }), box({ position: 'absolute', left: 28, top: 32, width: 18, height: 7, borderRadius: 4, backgroundColor: C.faint, transform: 'rotate(45deg)' })),
    text('센딧', { fontSize: 52, fontWeight: 800, color: C.ink, letterSpacing: -1.5 }),
    box({ width: 4, height: 54, backgroundColor: C.blue, borderRadius: 2 }),
  );
}

function endScene(it, k = 1) {
  const e = ease(k);
  return col(
    { width: W, height: H, backgroundColor: C.canvas, fontFamily: 'Pretendard', alignItems: 'center', paddingTop: 330 },
    col(
      { alignItems: 'center', opacity: Math.min(1, e * 1.4), transform: `translate(0px, ${((1 - e) * 60).toFixed(1)}px)` },
      appIcon(210),
      text('센딧', { marginTop: 42, fontSize: 150, fontWeight: 900, color: C.ink, letterSpacing: -6, lineHeight: 1.1 }),
      text('나만의 연애 코치', { marginTop: 6, fontSize: 46, fontWeight: 700, color: C.sub, letterSpacing: -1.2 }),
      text('앱스토어 · 플레이스토어에서', { marginTop: 90, fontSize: 40, fontWeight: 700, color: C.sub, letterSpacing: -1 }),
      box({ marginTop: 24 }, searchBar()),
      text(it.end?.ask ?? '너라면 뭐라고 보낼래?', { marginTop: 96, fontSize: 52, fontWeight: 900, color: C.blue, letterSpacing: -1.6, textAlign: 'center' }),
    ),
  );
}

// ───────────── 만들기 ─────────────

const frameAt = (frames, r) => {
  let lo = 0;
  let hi = frames.length - 1;
  if (r <= frames[0].t) return 0;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (frames[mid].t <= r) lo = mid;
    else hi = mid - 1;
  }
  return lo;
};

/** 녹화 결과 → 앱 구간 프레임 목록 (+ 누를 때 톡 소리) */
function appFrames(rec, steps, budget) {
  const tl = timeline(rec.marks, budget);
  const n = Math.round(tl.total * FPS);
  const tapAt = new Set(rec.taps.map((t) => Math.round(tl.outAt(t) * FPS)));
  const out = [];
  let lastIdx = -1;
  let uri = '';
  let prevStep = -1;
  let stepStart = 0;
  for (let i = 0; i < n; i++) {
    const o = i / FPS;
    const p = tl.pieceAt(o);
    if (p.step !== prevStep) {
      prevStep = p.step;
      stepStart = o;
    }
    const idx = frameAt(rec.frames, tl.rawAt(o));
    if (idx !== lastIdx) {
      lastIdx = idx;
      uri = `data:image/jpeg;base64,${rec.frames[idx].jpg.toString('base64')}`;
    }
    const stepK = i === 0 ? 1 : ease(clamp01((o - stepStart) / 0.22));
    out.push({ tree: appScene(uri, cameraAt(tl, o), p.step, stepK, steps), dur: 1 / FPS, pop: tapAt.has(i) });
  }
  return { frames: out, tl };
}

export async function makeAppReel(it, analysis, rec, file) {
  const pick = pickIndex(it, analysis);
  const chosen = analysis.replies[pick];
  const mine = safe(chosen.text);
  const theirs = safe(chosen.expectedReaction);
  const rate = Math.max(1, Math.min(99, Math.round(chosen.successRate ?? 0)));
  const steps = it.steps ?? DEFAULT_STEPS;
  const frames = [];
  const add = (tree, dur, pop = false) => frames.push({ tree, dur, pop });

  // 1) 훅 — 첫 장면부터 제목 + 받은 카톡 전부 (넘기기 전에 상황이 다 보이게), 이어서 「센딧한테 물어봤어」
  const received = it.messages.filter((m) => !m.day);
  add(hookScene(it, { shown: received.length }), 0.95, true);
  for (const h of [0.3, 0.6, 0.85]) add(hookScene(it, { shown: received.length, hint: h }), 1 / FPS, h === 0.3);
  add(hookScene(it, { shown: received.length, hint: 1 }), 0.75);
  const hookSec = frames.reduce((a, f) => a + Math.max(1, Math.round(f.dur * FPS)) / FPS, 0);

  // 3·4) 보내면? · 끝 카드 (먼저 길이를 재서 앱 구간 몫을 정한다)
  const tail = [];
  const addT = (tree, dur, pop = false) => tail.push({ tree, dur, pop });
  addT(resultScene(it, mine, theirs, rate, { stage: 0 }), 0.3);
  for (const p of [0.3, 0.65]) addT(resultScene(it, mine, theirs, rate, { stage: 1, pop: p }), 1 / FPS, p === 0.3);
  addT(resultScene(it, mine, theirs, rate, { stage: 1 }), 0.8);
  for (const d of [1, 2, 3]) addT(resultScene(it, mine, theirs, rate, { stage: 1.5, dots: d }), 0.15);
  for (const p of [0.3, 0.65]) addT(resultScene(it, mine, theirs, rate, { stage: 2, pop: p }), 1 / FPS, p === 0.3);
  addT(resultScene(it, mine, theirs, rate, { stage: 2 }), 1.6);
  for (const e of [0.25, 0.5, 0.75, 0.9]) addT(endScene(it, e), 1 / FPS, e === 0.25);
  addT(endScene(it, 1), 2.2);
  const tailSec = tail.reduce((a, f) => a + Math.max(1, Math.round(f.dur * FPS)) / FPS, 0);

  // 2) 실제 앱 — 전체가 19.5초를 넘지 않게
  const app = appFrames(rec, steps, Math.min(11.5, 19.5 - hookSec - tailSec));
  frames.push(...app.frames, ...tail);
  return saveMp4(frames, W, H, file);
}

/** 표지 — 훅 + 답장 3개가 보이는 실제 앱 화면 (프로필 격자(가운데 4:5)에 훅과 답장이 들어오게) */
export async function makeAppReelCover(it, rec, file) {
  const idx = frameAt(rec.frames, rec.marks.replies + 0.6);
  const src = `data:image/jpeg;base64,${rec.frames[idx].jpg.toString('base64')}`;
  const z = 0.92;
  const tree = box(
    { width: W, height: H, backgroundColor: C.canvas, fontFamily: 'Pretendard', overflow: 'hidden' },
    col({ position: 'absolute', left: 50, top: 330, right: 50 }, tag(it.label ?? '센딧 실사용', { size: 30 }), headline(it.hook, { size: 84, em: it.hookEm ?? [], style: { marginTop: 22 } })),
    phone(src, { z, fy: 0, y: 770 }),
    box({ position: 'absolute', right: 44, top: 700 }, realTag()),
  );
  await saveJpg(tree, W, H, file);
}

// ───────────── 검사 · 만들기 (formats/index.mjs 가 부름) ─────────────

const str = (v) => typeof v === 'string' && v.trim().length > 0;

export function checkAppReel(it, msgProblems) {
  const out = [];
  if (!str(it.hook)) out.push('hook(맨 위 한 줄)이 비었어요');
  if (String(it.hook ?? '').split('\n').some((l) => [...l].length > 12)) out.push('hook 한 줄은 12자까지 (\\n 으로 나누기)');
  if (!str(it.name) || [...it.name].length > 10) out.push('name(상대 이름)은 1~10자');
  if (!str(it.avatar)) out.push('avatar(상대 프로필 이모지)가 필요해요');
  if (it.gender !== undefined && !['male', 'female'].includes(it.gender)) out.push('gender 는 male·female');
  if (it.myGender !== undefined && !['male', 'female', 'other'].includes(it.myGender)) out.push('myGender 는 male·female·other');
  if (it.relationship !== undefined && !RELATIONSHIPS.includes(it.relationship)) out.push(`relationship 은 ${RELATIONSHIPS.join('·')}`);
  out.push(...msgProblems(it.messages));
  const msgs = (it.messages ?? []).filter((m) => !m.day);
  if (msgs.length > 4) out.push('받은 카톡은 4개까지 (훅 화면에 다 들어가게)');
  if (msgs.at(-1)?.from !== 'them') out.push('마지막 카톡은 상대(them) 말이어야 해요 (거기에 답장)');
  if (Array.isArray(it.messages) && it.messages.some((m) => m.from)) {
    const typed = typedText(it);
    if ([...typed].length > 90) out.push(`앱에 칠 글이 너무 길어요 (${[...typed].length}/90자 — typed 로 줄이기)`);
  }
  if (it.typed !== undefined && !str(it.typed)) out.push('typed 가 비었어요');
  if (it.pick !== undefined && !(Number.isInteger(it.pick) && it.pick >= 0 && it.pick <= 2)) out.push('pick 은 0·1·2');
  if (it.steps !== undefined && (!Array.isArray(it.steps) || it.steps.length !== 4 || it.steps.some((s) => !str(s) || [...s].length > 12))) out.push('steps 는 4개, 하나에 12자까지');
  if (it.result?.title !== undefined && (!str(it.result.title) || it.result.title.split('\n').some((l) => [...l].length > 12))) out.push('result.title 한 줄은 12자까지');
  if (it.end?.ask !== undefined && (!str(it.end.ask) || [...it.end.ask].length > 20)) out.push('end.ask(끝 질문)는 1~20자');
  if (it.analysis !== undefined) out.push(...analysisProblems(it.analysis).map((p) => `analysis: ${p}`));
  return out;
}

export async function makeAppReelItem(it, dir) {
  const real = await realAnalysis(it, dir);
  console.log(`  ${it.id}: 진짜 AI 결과 ${real.source === 'api' ? '서버에서 받음' : real.source === 'cache' ? '저장해 둔 것' : '창고의 것'}`);
  const pick = pickIndex(it, real.analysis);
  const rec = await recordApp({
    user: demoUser(it),
    name: it.name,
    gender: it.gender ?? 'female',
    relationship: it.relationship ?? 'talking',
    text: typedText(it),
    analysis: real.analysis,
    pick,
  });
  // 결과를 받을 때 보낸 질문과 앱이 실제로 만든 질문이 다르면 영상에 쓰지 않는다
  const diff = requestMismatch(real.request ?? coachRequestOf(it), rec.request);
  if (diff.length) throw new Error(`${it.id}: 앱이 만든 질문이 결과를 받을 때와 달라요 — ${diff.join(' / ')}`);
  if (rec.errors.length) console.warn(`  ${it.id}: 앱 오류 ${rec.errors.length}개 — ${rec.errors[0]}`);
  const file = path.join(dir, 'reel.mp4');
  const cover = path.join(dir, 'cover.jpg');
  const seconds = await makeAppReel(it, real.analysis, rec, file);
  await makeAppReelCover(it, rec, cover);
  return { media: [file], cover, seconds };
}
