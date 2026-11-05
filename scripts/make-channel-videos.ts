/**
 * 채널 게시용 KKTI 모션 그래픽 영상 (1080×1920 · 30fps · 효과음 포함)을 docs/channel-assets/video/ 에 만든다.
 *   FFMPEG=<ffmpeg 경로> npx tsx scripts/make-channel-videos.ts [01|02|03 …]
 *   (ffmpeg 가 없으면 `npm i --no-save ffmpeg-static` 으로 받은 것을 쓴다)
 *
 * 화면 녹화가 아니라 프레임마다 직접 그린다 — 글씨가 튀어나오고, 숫자가 차오르고, 화면이 흔들리고, 하트가 터진다.
 * 그림 재료(글꼴·스티커·말풍선·3D 이모지)는 scripts/make-channel-assets.ts 와 같다. 효과음은 ffmpeg 로 합성한다(외부 음원 없음).
 * 숫자·유형은 앱의 실제 계산(src/lib/kkti)으로 정한다. 01 은 이야기로 꾸민 장면이라 「연출」 표시가 들어간다.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { KKTI_CODES, KKTI_MATCH_TIERS, KKTI_QUESTIONS, KKTI_TYPES, computeKkti, kktiMatch, mixHex, type KktiResult } from '../src/lib/kkti';
import { INK, LILAC, LIME, PAPER, PINK, SKY, SUN, box, bubble, emoji, emojiSticker, inkOn, letterTiles, nameLines, pill, render, sticker, text, typical, type Child, type Node, type Style } from './make-channel-assets';

const W = 1080;
const H = 1920;
const FPS = 30;
const OUT = path.join(__dirname, '..', 'docs', 'channel-assets', 'video');

function ffmpegPath(): string {
  if (process.env.FFMPEG) return process.env.FFMPEG;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- 있으면 쓰는 선택 도구라 정적 import 를 하지 않는다
    return require('ffmpeg-static') as string;
  } catch {
    return 'ffmpeg';
  }
}

// ───────────────────────── 움직임 ─────────────────────────

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
/** start 부터 dur 동안 0 → 1 */
const p = (t: number, start: number, dur: number) => clamp01((t - start) / dur);
const outCubic = (x: number) => 1 - (1 - x) ** 3;
const outBack = (x: number, s = 1.9) => (x <= 0 ? 0 : 1 + (s + 1) * (x - 1) ** 3 + s * (x - 1) ** 2);
const lerp = (a: number, b: number, x: number) => a + (b - a) * x;

/** 튀어나오기 — 0 에서 커지며 살짝 넘쳤다 돌아온다 */
const popIn = (t: number, at: number, dur = 0.32): Style => {
  const x = p(t, at, dur);
  return { opacity: clamp01(x * 3), transform: `scale(${outBack(x).toFixed(4)})` };
};
/** 아래에서 올라오기 */
const rise = (t: number, at: number, dur = 0.35, dist = 90): Style => {
  const x = outCubic(p(t, at, dur));
  return { opacity: x, transform: `translate(0px, ${((1 - x) * dist).toFixed(1)}px)` };
};
/** 크게 찍히듯 내려앉기 */
const slam = (t: number, at: number, from = 1.9, rotate = 0): Style => {
  const x = p(t, at, 0.22);
  const s = lerp(from, 1, outCubic(x));
  return { opacity: clamp01(x * 4), transform: `scale(${s.toFixed(4)}) rotate(${(rotate * (1 - x)).toFixed(2)}deg)` };
};
/** 부딪힐 때 화면 흔들림 (at 부터 dur 동안 줄어든다) */
function shake(t: number, at: number, dur = 0.3, amp = 22): string {
  const x = p(t, at, dur);
  if (x <= 0 || x >= 1) return 'translate(0px, 0px)';
  const k = amp * (1 - x);
  return `translate(${(Math.sin(t * 95) * k).toFixed(1)}px, ${(Math.cos(t * 77) * k).toFixed(1)}px)`;
}

/** 전체 화면 바탕 */
const stage = (bg: string, ...children: Child[]): Node =>
  box({ width: W, height: H, backgroundColor: bg, fontFamily: 'Pretendard', overflow: 'hidden' }, ...children);
/** 화면 어디든 놓기 */
const at = (x: number, y: number, style: Style, ...children: Child[]): Node => box({ position: 'absolute', left: x, top: y, ...style }, ...children);
/** 가로 가운데 줄 */
const center = (y: number, style: Style, ...children: Child[]): Node => box({ position: 'absolute', left: 0, top: y, width: W, justifyContent: 'center', ...style }, ...children);
const big = (value: string, size: number, color: string, shadow?: string, style: Style = {}): Node =>
  text(value, { fontSize: size, fontWeight: 900, color, letterSpacing: -size * 0.05, lineHeight: 1.04, ...(shadow ? { textShadow: `${Math.round(size / 24)}px ${Math.round(size / 24)}px 0 ${shadow}` } : {}), ...style });

/** 3D 이모지가 없는 글자(문항 보기 속 이모지)는 영상에서 뺀다 — 네모로 깨지지 않게 */
const plain = (value: string) => value.replace(/\p{Extended_Pictographic}️?/gu, '').replace(/\s+/g, ' ').trim();

/** 화면 아래를 계속 흘러가는 띠 자막 */
function ticker(t: number, y: number, bg = INK, color = LIME, rotate = -4, words = 'KKTI · 카톡 궁합 · 1분 테스트 · 둘 다 해야 열림 · '): Node {
  const size = 46;
  const unit = Math.round(words.length * size * 0.82);
  const shift = -((t * 260) % unit);
  return box(
    { position: 'absolute', left: -120, top: y, width: W + 240, height: 100, backgroundColor: bg, alignItems: 'center', overflow: 'hidden', transform: `rotate(${rotate}deg)`, border: `5px solid ${INK}` },
    box({ position: 'absolute', left: Math.round(shift), top: 18, width: unit * 4 }, text(words.repeat(4), { fontSize: size, fontWeight: 900, color, letterSpacing: -0.5, whiteSpace: 'nowrap' })),
  );
}

const kktiTag = (): Node => at(70, 110, {}, box({ padding: '12px 26px', borderRadius: 999, backgroundColor: INK, border: `4px solid ${PAPER}` }, text('KKTI', { fontSize: 34, fontWeight: 900, color: PAPER, letterSpacing: 1 })));
const stagedTag = (): Node => at(W - 70 - 150, 110, { width: 150, justifyContent: 'flex-end' }, pill('연출', 30, PAPER, INK));

/** 터지는 이모지 — 가운데에서 사방으로 날아가 떨어진다 (모양은 매번 같게) */
function burst(t: number, start: number, cx: number, cy: number, emojiValue: string, count = 16, power = 1): Node[] {
  const τ = t - start;
  if (τ < 0 || τ > 1.6) return [];
  const out: Node[] = [];
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + Math.sin(i * 12.9898) * 0.35;
    const speed = (900 + ((i * 137) % 7) * 120) * power;
    const size = 70 + ((i * 53) % 5) * 22;
    const x = cx + Math.cos(angle) * speed * τ - size / 2;
    const y = cy + Math.sin(angle) * speed * τ + 0.5 * 2600 * τ * τ - size / 2;
    const fade = 1 - p(τ, 1.0, 0.6);
    // 화면 밖으로 완전히 나간 것은 그리지 않는다 (resvg 가 보이지 않는 그림의 경계를 계산하다 멈춘다)
    if (fade <= 0 || x > W || y > H || x + size < 0 || y + size < 0) continue;
    out.push(emoji(emojiValue, size, { position: 'absolute', left: Math.round(x), top: Math.round(y), opacity: fade, transform: `rotate(${(((i % 2) * 2 - 1) * τ * 220).toFixed(1)}deg)` })!);
  }
  return out;
}

// ───────────────────────── 효과음 ─────────────────────────

type Sfx = 'pop' | 'tick' | 'thump' | 'whoosh' | 'boom' | 'ding';
interface Cue {
  t: number;
  kind: Sfx;
}

const SFX: Record<Sfx, string> = {
  pop: "aevalsrc='0.55*sin(2*PI*(520+1400*t)*t)*exp(-22*t)':d=0.18",
  tick: "aevalsrc='0.32*sin(2*PI*2100*t)*exp(-70*t)':d=0.06",
  thump: "aevalsrc='0.95*sin(2*PI*(95-55*t)*t)*exp(-10*t)':d=0.35",
  whoosh: 'anoisesrc=d=0.32:c=pink:a=0.5,bandpass=f=1800:width_type=o:w=2,afade=t=in:d=0.12,afade=t=out:st=0.14:d=0.18',
  boom: "aevalsrc='0.9*sin(2*PI*(70-30*t)*t)*exp(-5*t)+0.35*sin(2*PI*880*t)*exp(-6*t)':d=0.9",
  ding: "aevalsrc='0.42*(sin(2*PI*988*t)+0.7*sin(2*PI*1319*t)+0.4*sin(2*PI*1976*t))*exp(-3.5*t)':d=1.3",
};

function soundtrack(cues: Cue[], seconds: number, file: string) {
  const inputs: string[] = [];
  const parts: string[] = [];
  cues.forEach((c, i) => {
    inputs.push('-f', 'lavfi', '-i', SFX[c.kind]);
    const ms = Math.max(0, Math.round(c.t * 1000));
    parts.push(`[${i}:a]aformat=sample_rates=44100:channel_layouts=stereo,adelay=${ms}|${ms}[s${i}]`);
  });
  const mix = `${cues.map((_, i) => `[s${i}]`).join('')}amix=inputs=${cues.length}:normalize=0,alimiter=limit=0.9,apad,atrim=0:${seconds.toFixed(3)}[out]`;
  execFileSync(ffmpegPath(), ['-y', '-loglevel', 'error', ...inputs, '-filter_complex', [...parts, mix].join(';'), '-map', '[out]', '-ar', '44100', file]);
}

// ───────────────────────── 01 · 썸남이 보낸 링크 ─────────────────────────

const friend = typical('선빠폭밀');
/** 영상용 내 답 — 친구와 궁합이 87~92% 로 나오는 조합 (실제 계산) */
function pickMine(): KktiResult {
  let seed = 20261021;
  const rand = () => {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let x = Math.imul(seed ^ (seed >>> 15), seed | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = 0; i < 8000; i++) {
    const r = computeKkti(KKTI_QUESTIONS.map((q) => Math.floor(rand() * q.options.length)));
    const m = kktiMatch(r, friend).percent;
    if (m >= 87 && m <= 92 && r.code === '후빠폭밀') return r;
  }
  return typical('후빠폭밀');
}
const mine = pickMine();
const match = kktiMatch(mine, friend);
const QUIZ = KKTI_QUESTIONS.filter((q) => q.bubble).slice(0, 4);

function linkCard(): Node {
  return box(
    { width: 860, alignItems: 'center', gap: 32, padding: '30px 34px', borderRadius: 40, backgroundColor: PAPER, ...sticker(6, 14) },
    emojiSticker(friend.type.emoji, 170, -6, mixHex(friend.color.hex, PAPER, 0.3)),
    box(
      { flexDirection: 'column', gap: 6, flexShrink: 1 },
      text('나의 KKTI는', { fontSize: 30, fontWeight: 700, color: '#55555C' }),
      text(friend.type.name, { fontSize: 62, fontWeight: 900, color: INK, letterSpacing: -2 }),
      text('너도 하면 나랑 궁합 나와 👀', { fontSize: 30, fontWeight: 800, color: INK }),
    ),
  );
}

function quizCard(q: (typeof QUIZ)[number], n: number, chosen: number, picked: boolean): Node {
  return box(
    { flexDirection: 'column', width: 920, gap: 26, padding: '40px 40px 44px', borderRadius: 48, backgroundColor: PAPER, ...sticker(6, 16) },
    box({ alignItems: 'center', gap: 14 }, pill(`Q${n}`, 30, INK, PAPER), text('그 사람', { fontSize: 30, fontWeight: 700, color: '#55555C' })),
    q.bubble ? bubble(plain(q.bubble), 40, { alignSelf: 'flex-start' }, '#EDEBFF') : null,
    text(plain(q.prompt), { fontSize: 46, fontWeight: 900, color: INK, letterSpacing: -1.5, lineHeight: 1.25 }),
    box(
      { flexDirection: 'column', gap: 16 },
      ...q.options.map((o, i) =>
        box(
          { alignItems: 'center', gap: 18, padding: '20px 26px', borderRadius: 28, backgroundColor: picked && i === chosen ? LIME : '#F3F1EA', border: `4px solid ${picked && i === chosen ? INK : '#DAD7CC'}` },
          text(String.fromCharCode(65 + i), { fontSize: 30, fontWeight: 900, color: INK }),
          text(plain(o.label), { fontSize: 32, fontWeight: 700, color: INK, flexShrink: 1, lineHeight: 1.3 }),
        ),
      ),
    ),
  );
}

function person(r: KktiResult, who: string, size: number, rotate: number): Node {
  return box(
    { flexDirection: 'column', alignItems: 'center', gap: 16, width: 400 },
    emojiSticker(r.type.emoji, size, rotate, mixHex(r.color.hex, PAPER, 0.25)),
    pill(who, 32, INK, PAPER),
    text(r.type.name, { fontSize: 44, fontWeight: 900, color: INK, letterSpacing: -1.5, textAlign: 'center', justifyContent: 'center' }),
  );
}

const V1 = { seconds: 15 };
function frame1(t: number): Node {
  // 장면 1 — 링크 도착
  if (t < 2.4) {
    const tap = p(t, 1.95, 0.4);
    return stage(
      INK,
      kktiTag(),
      stagedTag(),
      at(70, 330, rise(t, 0.05), big('썸남이', 150, PAPER)),
      at(70, 500, rise(t, 0.25), big('링크를 보냈다', 132, LIME, PINK)),
      at(90, 860, popIn(t, 0.85), bubble('이거 해 봐 ㅋㅋ', 46)),
      at(90, 1030, popIn(t, 1.25), linkCard()),
      ticker(t, 1640),
      tap > 0 && tap < 1 ? at(700, 1150, { width: 160, height: 160, borderRadius: 80, border: `8px solid ${LIME}`, opacity: 1 - tap, transform: `scale(${(0.4 + tap * 1.4).toFixed(3)})` }) : null,
    );
  }
  // 장면 2 — 궁금해서 해 봄 (빠르게 넘기는 문제 카드)
  if (t < 5.5) {
    const s = t - 2.4;
    const per = 0.76;
    const i = Math.min(QUIZ.length - 1, Math.floor(s / per));
    const local = s - i * per;
    const inX = (1 - outCubic(p(local, 0, 0.2))) * W;
    const outX = -outCubic(p(local, 0.6, 0.16)) * W;
    const q = QUIZ[i];
    const chosen = Math.min(q.options.length - 1, i % 2);
    const progress = clamp01(s / 3.0);
    return stage(
      PINK,
      kktiTag(),
      stagedTag(),
      at(70, 240, {}, big('궁금해서 해 봄 ㅋㅋ', 80, INK, PAPER)),
      at(70, 380, { width: 940, height: 30, borderRadius: 15, backgroundColor: PAPER, border: `4px solid ${INK}` }, box({ width: Math.round(932 * progress), height: 22, borderRadius: 11, backgroundColor: LIME })),
      at(80 + inX + outX, 480, {}, quizCard(q, 3 * i + 3, chosen, local >= 0.38)),
      at(W - 70 - 200, 300, { width: 200, justifyContent: 'flex-end' }, text(`${Math.min(12, 3 * i + 3)}/12`, { fontSize: 44, fontWeight: 900, color: INK })),
    );
  }
  // 장면 3 — 궁합 계산 중
  if (t < 6.7) {
    const beat = 1 + 0.14 * Math.abs(Math.sin((t - 5.5) * Math.PI * 2.2));
    const dots = '.'.repeat(1 + (Math.floor(t * 6) % 3));
    return stage(
      LILAC,
      kktiTag(),
      stagedTag(),
      center(560, { transform: `scale(${beat.toFixed(3)})` }, emojiSticker('💘', 420, -4, PAPER)),
      center(1110, {}, big(`궁합 계산 중${dots}`, 96, INK, PAPER)),
    );
  }
  // 장면 4·5 — 둘이 부딪히고, 궁합이 쾅
  if (t < 12.0) {
    const arrive = outBack(p(t, 6.7, 0.45), 1.2);
    const up = outCubic(p(t, 8.3, 0.4));
    const y = lerp(620, 250, up);
    const leftX = lerp(-460, 60, arrive);
    const rightX = lerp(W + 60, 620, arrive);
    const count = Math.round(match.percent * outCubic(p(t, 8.6, 1.2)));
    const showNumber = t >= 8.55;
    const slammed = t >= 9.8;
    return stage(
      LIME,
      box(
        { position: 'absolute', left: 0, top: 0, width: W, height: H, transform: t < 9 ? shake(t, 7.15, 0.3, 26) : shake(t, 9.8, 0.35, 30) },
        kktiTag(),
        stagedTag(),
        at(leftX, y, {}, person(mine, '나', 300, -8)),
        at(rightX, y, {}, person(friend, '썸남', 300, 8)),
        t >= 7.1 ? center(y + 110, popIn(t, 7.1, 0.25), big('×', 130, INK)) : null,
        showNumber
          ? center(820, slammed ? slam(t, 9.8, 1.35) : {}, box({ alignItems: 'flex-end' }, big(String(count), 400, INK, PINK, { letterSpacing: -24, lineHeight: 1 }), big('%', 170, INK, undefined, { marginBottom: 40 })))
          : null,
        t >= 9.9 ? center(1330, slam(t, 9.9, 2.2, -14), box({ transform: 'rotate(-4deg)' }, pill(`${match.tier.label} 💘`, 78, INK, PAPER))) : null,
        t >= 10.35 ? center(1520, popIn(t, 10.35), bubble(match.tier.line, 40)) : null,
        ...burst(t, 9.85, W / 2, 1000, '💘', 18),
      ),
    );
  }
  // 장면 6 — 너도 해 봐
  const pulse = 1 + 0.045 * Math.sin((t - 12.9) * Math.PI * 3);
  return stage(
    INK,
    kktiTag(),
    stagedTag(),
    at(70, 420, slam(t, 12.0, 1.8), big('너도 해 봐', 200, LIME, PINK)),
    at(70, 700, rise(t, 12.3), big('둘 다 해야 열리는', 76, PAPER)),
    at(70, 800, rise(t, 12.45), big('카톡 궁합 %', 150, PINK, PAPER)),
    t >= 12.9 ? at(70, 1100, { transform: `scale(${pulse.toFixed(4)})` }, box({ padding: '28px 44px', borderRadius: 999, backgroundColor: LIME, ...sticker(6, 12) }, text('프로필 링크에서 1분 테스트 ↗', { fontSize: 50, fontWeight: 900, color: INK }))) : null,
    at(80, 1300, popIn(t, 13.2), emojiSticker('🐹', 190, -10, SUN)),
    at(300, 1340, popIn(t, 13.35), emojiSticker('🦊', 170, 9, SKY)),
    ticker(t, 1660, LIME, INK, 4),
  );
}
const cues1: Cue[] = [
  { t: 0.05, kind: 'whoosh' },
  { t: 0.85, kind: 'pop' },
  { t: 1.25, kind: 'pop' },
  { t: 1.95, kind: 'tick' },
  { t: 2.4, kind: 'whoosh' },
  ...QUIZ.flatMap((_, i) => [{ t: 2.4 + i * 0.76 + 0.38, kind: 'tick' as Sfx }]),
  { t: 5.5, kind: 'thump' },
  { t: 5.95, kind: 'thump' },
  { t: 6.4, kind: 'thump' },
  { t: 6.7, kind: 'whoosh' },
  { t: 7.12, kind: 'boom' },
  ...Array.from({ length: 14 }, (_, i) => ({ t: 8.6 + 1.2 * (1 - Math.cbrt(1 - (i + 1) / 15)), kind: 'tick' as Sfx })),
  { t: 9.8, kind: 'boom' },
  { t: 9.85, kind: 'ding' },
  { t: 10.35, kind: 'pop' },
  { t: 12.0, kind: 'boom' },
  { t: 12.9, kind: 'pop' },
  { t: 13.2, kind: 'pop' },
];

// ───────────────────────── 02 · 16유형 슬롯 ─────────────────────────

const ALL = KKTI_CODES.map(typical);
const SLOT_ORDER = [3, 9, 14, 0, 6, 11, 5, 12, 2, 15, 7, 10, 4, 13, 8, 1];
const LANDING = ALL[KKTI_CODES.indexOf('후빠폭직')];
/** 바뀌는 시각들 — 빠르게 돌다가 점점 느려져 멈춘다 */
const SLOT_TIMES: number[] = (() => {
  const times: number[] = [];
  let tt = 1.7;
  let gap = 0.07;
  while (tt < 6.2) {
    times.push(tt);
    tt += gap;
    gap *= tt > 4.6 ? 1.28 : 1.05;
  }
  return times;
})();
const SLOT_STOP = SLOT_TIMES[SLOT_TIMES.length - 1];

function typeFace(r: KktiResult, scale: number, details: number, t: number): Node {
  const tone = inkOn(r.color.hex);
  const lines = nameLines(r.type.name);
  const size = Math.min(170, Math.floor(920 / (Math.max(...lines.map((l) => l.length)) * 0.95)));
  const below = 1030 + Math.round(lines.length * size * 1.04) + 50;
  return stage(
    r.color.hex,
    kktiTag(),
    at(W - 70 - 260, 110, { width: 260, justifyContent: 'flex-end' }, pill('16유형 중', 32, PAPER, INK)),
    center(330, { transform: `scale(${scale.toFixed(4)})` }, emojiSticker(r.type.emoji, 400, -6)),
    center(810, { transform: `scale(${scale.toFixed(4)})` }, letterTiles(r, 150)),
    at(70, 1030, {}, box({ flexDirection: 'column' }, ...lines.map((l) => big(l, size, tone.ink, tone.shadow)))),
    details > 0 ? at(70, below, popIn(t, SLOT_STOP + 0.5), bubble(r.type.oneLiner, 40, { maxWidth: 940 })) : null,
    details > 0 ? at(70, below + 160, popIn(t, SLOT_STOP + 0.9), box({ alignItems: 'center', gap: 14, padding: '18px 30px', borderRadius: 999, backgroundColor: INK }, emoji('💞', 46), text(`찰떡궁합 · ${KKTI_TYPES[r.type.bestMatch].name}`, { fontSize: 36, fontWeight: 900, color: PAPER }))) : null,
  );
}

const V2 = { seconds: 10.5 };
function frame2(t: number): Node {
  if (t < 1.7) {
    return stage(
      INK,
      kktiTag(),
      at(70, 560, rise(t, 0.05), big('카톡 습관으로 보는', 86, PAPER)),
      at(70, 680, rise(t, 0.3), big('내 연애 유형은?', 150, LIME, PINK)),
      at(70, 900, popIn(t, 0.85), pill('16유형 · 1분 테스트', 44, PINK, PAPER)),
      at(640, 1180, popIn(t, 1.05), emojiSticker('🔮', 300, 8, LILAC)),
      ticker(t, 1660),
    );
  }
  if (t < SLOT_STOP) {
    const idx = SLOT_TIMES.filter((x) => x <= t).length - 1;
    const r = ALL[SLOT_ORDER[idx % SLOT_ORDER.length]];
    const since = t - SLOT_TIMES[Math.max(0, idx)];
    return typeFace(r, 1 + 0.06 * (1 - clamp01(since / 0.08)), 0, t);
  }
  const bounce = outBack(p(t, SLOT_STOP, 0.4), 2.6);
  const flash = 1 - p(t, SLOT_STOP, 0.3);
  const face = typeFace(LANDING, lerp(1.25, 1, bounce), 1, t);
  const pulse = 1 + 0.045 * Math.sin((t - SLOT_STOP) * Math.PI * 3);
  (face.props.children as Child[]).push(
    flash > 0 ? box({ position: 'absolute', left: 0, top: 0, width: W, height: H, backgroundColor: PAPER, opacity: flash * 0.85 }) : null,
    ...burst(t, SLOT_STOP + 0.02, W / 2, 560, '✨', 14, 0.9),
    t >= SLOT_STOP + 1.5 ? center(1780, { transform: `scale(${pulse.toFixed(4)})` }, box({ padding: '22px 40px', borderRadius: 999, backgroundColor: INK, boxShadow: `10px 10px 0 0 ${PAPER}` }, text('너는 뭐 나올까? 👉 프로필 링크', { fontSize: 44, fontWeight: 900, color: PAPER }))) : null,
  );
  return face;
}
const cues2: Cue[] = [
  { t: 0.05, kind: 'whoosh' },
  { t: 0.85, kind: 'pop' },
  { t: 1.05, kind: 'pop' },
  ...SLOT_TIMES.slice(0, -1).map((x) => ({ t: x, kind: 'tick' as Sfx })),
  { t: SLOT_STOP, kind: 'boom' },
  { t: SLOT_STOP + 0.02, kind: 'ding' },
  { t: SLOT_STOP + 0.5, kind: 'pop' },
  { t: SLOT_STOP + 0.9, kind: 'pop' },
  { t: SLOT_STOP + 1.5, kind: 'pop' },
];

// ───────────────────────── 03 · 궁합 등급 카운트다운 ─────────────────────────

const TIER_BG: Record<string, string> = { '극과 극': '#FF7A3D', '반전 케미': LILAC, '티키타카 케미': SUN, 찰떡궁합: '#FF7AC3', 천생연분: PINK };
const TIER_STEP = 1.9;
const TIER_START = 1.4;
const TIERS = [...KKTI_MATCH_TIERS].reverse();

const V3 = { seconds: TIER_START + TIERS.length * TIER_STEP + 2.6 };
function frame3(t: number): Node {
  if (t < TIER_START) {
    return stage(
      INK,
      kktiTag(),
      at(70, 600, rise(t, 0.05), big('우리 궁합,', 130, PAPER)),
      at(70, 760, rise(t, 0.3), big('몇 %부터 찐일까?', 118, LIME, PINK)),
      at(640, 1150, popIn(t, 0.8), emojiSticker('💞', 280, 8, PINK)),
      ticker(t, 1660),
    );
  }
  const i = Math.floor((t - TIER_START) / TIER_STEP);
  if (i < TIERS.length) {
    const tier = TIERS[i];
    const s = TIER_START + i * TIER_STEP;
    const idx = KKTI_MATCH_TIERS.indexOf(tier);
    const top = idx === 0 ? 99 : KKTI_MATCH_TIERS[idx - 1].min - 1;
    return stage(
      TIER_BG[tier.label] ?? PINK,
      box(
        { position: 'absolute', left: 0, top: 0, width: W, height: H, transform: shake(t, s + 0.02, 0.28, 20) },
        kktiTag(),
        at(W - 70 - 240, 110, { width: 240, justifyContent: 'flex-end' }, pill(`${i + 1} / 5`, 34, PAPER, INK)),
        at(620, 300, popIn(t, s + 0.1), emojiSticker(tier.emoji, 330, 8)),
        at(70, 760, slam(t, s, 1.7), big(`${Math.max(30, tier.min)}–${top}%`, 230, INK, PAPER, { letterSpacing: -12 })),
        at(70, 1040, slam(t, s + 0.25, 2.0, -10), box({ transform: 'rotate(-3deg)' }, pill(tier.label, 96, INK, PAPER))),
        at(70, 1280, popIn(t, s + 0.55), bubble(tier.line, 42, { maxWidth: 940 })),
        ticker(t, 1650, INK, PAPER, -4, `${tier.label} · KKTI 카톡 궁합 · `),
        ...(i === TIERS.length - 1 ? burst(t, s + 0.3, W / 2, 900, tier.emoji, 16) : []),
      ),
    );
  }
  const end = TIER_START + TIERS.length * TIER_STEP;
  const pulse = 1 + 0.045 * Math.sin((t - end - 0.8) * Math.PI * 3);
  return stage(
    INK,
    kktiTag(),
    at(70, 520, slam(t, end, 1.8), big('우리는 몇 %?', 160, LIME, PINK)),
    at(70, 760, rise(t, end + 0.3), big('링크 보내고', 84, PAPER)),
    at(70, 860, rise(t, end + 0.45), big('둘 다 하면 열림', 84, PAPER)),
    at(660, 980, popIn(t, end + 0.6), emojiSticker('🔒', 260, 10, LIME)),
    ticker(t, 1660, LIME, INK, 4),
    t >= end + 0.8 ? at(70, 1330, { transform: `scale(${pulse.toFixed(4)})` }, box({ padding: '28px 44px', borderRadius: 999, backgroundColor: PINK, ...sticker(6, 12) }, text('프로필 링크에서 테스트 ↗', { fontSize: 52, fontWeight: 900, color: PAPER }))) : null,
  );
}
const cues3: Cue[] = [
  { t: 0.05, kind: 'whoosh' },
  { t: 0.8, kind: 'pop' },
  ...TIERS.flatMap((_, i) => {
    const s = TIER_START + i * TIER_STEP;
    return [
      { t: s, kind: 'boom' as Sfx },
      { t: s + 0.25, kind: 'pop' as Sfx },
      { t: s + 0.55, kind: 'tick' as Sfx },
    ];
  }),
  { t: TIER_START + (TIERS.length - 1) * TIER_STEP + 0.3, kind: 'ding' },
  { t: TIER_START + TIERS.length * TIER_STEP, kind: 'boom' },
  { t: TIER_START + TIERS.length * TIER_STEP + 0.6, kind: 'pop' },
  { t: TIER_START + TIERS.length * TIER_STEP + 0.8, kind: 'pop' },
];

// ───────────────────────── 04·05 공통 — 카톡 화면 ─────────────────────────

const KAKAO = '#FEE500';
const GRAY = '#6B6B73';
const coachTag = (): Node => at(70, 110, {}, box({ padding: '12px 26px', borderRadius: 999, backgroundColor: INK, border: `4px solid ${PAPER}` }, text('나만의 연애코치', { fontSize: 32, fontWeight: 900, color: PAPER })));
const cornerTag = (value: string, bg = PAPER, color = INK): Node => at(W - 70 - 420, 110, { width: 420, justifyContent: 'flex-end' }, pill(value, 30, bg, color));

interface ChatLine {
  who: 'me' | 'them';
  text: string;
  at: number;
  /** 말풍선 옆 작은 글자 (읽음 표시 등) */
  meta?: string;
}
/** 내 말풍선 — 오른쪽, 카톡 노랑 */
const myBubble = (value: string, size: number): Node => bubble(plain(value), size, { maxWidth: 760, borderBottomLeftRadius: Math.round(size * 1.1), borderBottomRightRadius: Math.round(size * 0.25) }, KAKAO);
const theirBubble = (value: string, size: number): Node => bubble(plain(value), size, { maxWidth: 760 }, PAPER);
/**
 * 아래에서부터 쌓이는 채팅 — 새 말풍선이 오면 위의 것이 밀려 올라가고 칸 밖은 잘린다.
 * 지금 시각까지 온 말풍선만 그리고, 막 온 것은 아래에서 올라온다.
 */
function chat(t: number, lines: ChatLine[], top: number, height: number, size = 40): Node {
  const shown = lines.filter((l) => t >= l.at);
  return box(
    { position: 'absolute', left: 60, top, width: W - 120, height, flexDirection: 'column', justifyContent: 'flex-end', gap: 26, overflow: 'hidden' },
    ...shown.map((l) =>
      box(
        { alignSelf: l.who === 'me' ? 'flex-end' : 'flex-start', alignItems: 'flex-end', gap: 14, ...rise(t, l.at, 0.28, 60) },
        l.who === 'me' && l.meta ? text(l.meta, { fontSize: 26, fontWeight: 700, color: GRAY, marginBottom: 6 }) : null,
        l.who === 'me' ? myBubble(l.text, size) : theirBubble(l.text, size),
        l.who === 'them' && l.meta ? text(l.meta, { fontSize: 26, fontWeight: 700, color: GRAY, marginBottom: 6 }) : null,
      ),
    ),
  );
}
/** 상대가 입력 중… */
const typingDots = (t: number): Node => bubble('•'.repeat(1 + (Math.floor(t * 6) % 3)).padEnd(3, ' '), 40, { alignSelf: 'flex-start' }, PAPER, GRAY);
/** 호감 온도 칩 */
const heatChip = (value: string, size: number, bg = PAPER): Node =>
  box({ alignItems: 'center', gap: Math.round(size * 0.3), padding: `${Math.round(size * 0.35)}px ${Math.round(size * 0.8)}px`, borderRadius: 999, backgroundColor: bg, ...sticker(Math.max(3, Math.round(size / 10)), Math.round(size / 6)) }, emoji('🌡️', Math.round(size * 1.3)), text(value, { fontSize: size, fontWeight: 900, color: INK }));
const countUp = (t: number, from: number, to: number, start: number, dur: number) => Math.round(lerp(from, to, outCubic(p(t, start, dur))));

// ───────────────────────── 04 · 읽씹 2시간 역전극 ─────────────────────────
// 2026-10-22 운영과 같은 코치(api/coach, gemini-3.6-flash)에 아래 상황을 넣어 나온 결과 그대로 — 답장·성공 확률·예상 반응·호감 온도.
// 상황(썸남 민재, 누적 온도 42°): 「"뭐해?" 보내서 "집에서 뒹굴거리는 중 ㅋㅋ 너는?" 하고 답했는데 2시간째 읽씹」
// 상대 답은 코치가 예상한 반응을 그대로 썼다(연출). 그 답을 다시 넣었을 때 온도가 39° → 44° 로 움직였다.

const ASKED = { his: '뭐해?', mine: '집에서 뒹굴거리는 중 ㅋㅋ 너는?' };
const REPLIES = [
  { text: '너무 뒹굴거려서 나 바닥이랑 하나 된 줄 알고 깜짝 놀랐잖아 ㅋㅋ 바빠?', rate: 85, reaction: '아 ㅋㅋㅋ 미안 진짜 갑자기 일 터져서 정신없었어' },
  { text: '혹시 답장 쓰다가 잠든 거야? ㅋㅋ 민재 바쁜가 보네!', rate: 80, reaction: '아 아니야 ㅠㅠ 급한 전화 와서 이제 봤어!' },
  { text: '나 나중에 맛있는 거 먹으러 가려고 ㅋㅋ 너도 맛저해!', rate: 75, reaction: '오 뭐 먹게? 나도 이제 퇴근했다!' },
];
const HEAT4 = { from: 39, to: 44 };

function replyCard(r: (typeof REPLIES)[number], n: number, t: number, start: number): Node {
  return box(
    { flexDirection: 'column', width: 920, gap: 24, padding: '40px 40px 44px', borderRadius: 48, backgroundColor: PAPER, ...sticker(6, 16) },
    box({ alignItems: 'center', justifyContent: 'space-between' }, pill(`버전 ${n}`, 32, INK, PAPER), text(`${n} / 3`, { fontSize: 34, fontWeight: 900, color: GRAY })),
    text(r.text, { fontSize: 50, fontWeight: 900, color: INK, letterSpacing: -1.5, lineHeight: 1.28 }),
    box(
      { alignItems: 'flex-end', gap: 16 },
      text('성공 확률', { fontSize: 36, fontWeight: 800, color: GRAY, marginBottom: 22 }),
      big(`${countUp(t, 0, r.rate, start + 0.15, 0.55)}%`, 150, INK, LIME, { letterSpacing: -6 }),
    ),
    box({ flexDirection: 'column', gap: 12 }, text('예상 반응', { fontSize: 30, fontWeight: 800, color: GRAY }), bubble(plain(r.reaction), 34, { alignSelf: 'flex-start' }, '#EDEBFF')),
  );
}

const V4 = { seconds: 21.5 };
const CARD_T = [7.0, 8.7, 10.4, 12.1];
function frame4(t: number): Node {
  // 장면 1 — 2시간 읽씹
  if (t < 3.0) {
    return stage(
      INK,
      coachTag(),
      stagedTag(),
      at(70, 270, rise(t, 0.05), big('"뭐해?" 하고', 116, PAPER)),
      at(70, 410, rise(t, 0.2), big('2시간 읽씹한 썸남', 104, LIME, PINK)),
      at(70, 540, rise(t, 0.35), big('한테 이렇게 보냈더니', 84, PAPER)),
      chat(t, [
        { who: 'them', text: ASKED.his, at: 0.8 },
        { who: 'me', text: ASKED.mine, at: 1.2, meta: '2시간 전 읽음' },
      ], 760, 520, 46),
      t >= 1.9 ? at(640, 1330, popIn(t, 1.9), emojiSticker('🫠', 230, 8, SUN)) : null,
      ticker(t, 1660, INK, LIME, -4, '나만의 연애코치 · 캡처 한 장 · 답장 3개 · 호감 온도 · '),
    );
  }
  // 장면 2 — 썼다 지웠다
  if (t < 5.4) {
    const drafts = [
      { s: '왜 답장 안 해', from: 3.15, del: 3.95 },
      { s: '바빠..?', from: 4.35, del: 4.95 },
    ];
    const d = t < 4.25 ? drafts[0] : drafts[1];
    const typed = Math.round(lerp(0, d.s.length, p(t, d.from, 0.5)));
    const left = Math.round(lerp(typed, 0, p(t, d.del, 0.25)));
    const shownText = [...d.s].slice(0, Math.min(typed, left)).join('');
    const caret = Math.floor(t * 4) % 2 === 0 ? '|' : ' ';
    return stage(
      SUN,
      coachTag(),
      stagedTag(),
      at(70, 300, slam(t, 3.0, 1.6), big('썼다 지웠다', 150, INK, PAPER)),
      at(70, 480, rise(t, 3.15), big('보내면 지는 것 같고…', 74, INK)),
      at(60, 820, {}, box({ width: W - 120, alignItems: 'center', gap: 20, padding: '30px 36px', borderRadius: 999, backgroundColor: PAPER, ...sticker(6, 12) }, text(`${shownText}${caret}`, { fontSize: 50, fontWeight: 800, color: INK, flexGrow: 1 }), pill('전송', 34, KAKAO, INK))),
      at(80, 1100, popIn(t, 3.4), emojiSticker('😳', 220, -8, PAPER)),
      at(380, 1180, popIn(t, 3.6), emojiSticker('💭', 180, 10, LILAC)),
    );
  }
  // 장면 3 — 코치한테 물어봄
  if (t < 7.0) {
    const beat = 1 + 0.12 * Math.abs(Math.sin((t - 5.4) * Math.PI * 2.2));
    const dots = '.'.repeat(1 + (Math.floor(t * 6) % 3));
    return stage(
      LILAC,
      coachTag(),
      stagedTag(),
      at(70, 300, rise(t, 5.45), big('코치한테 물어봄', 120, INK, PAPER)),
      center(620, { transform: `scale(${beat.toFixed(3)})` }, emojiSticker('💬', 380, -4, PAPER)),
      center(1130, {}, big(`답장 고르는 중${dots}`, 84, INK)),
    );
  }
  // 장면 4 — 답장 3개 넘겨 보기 → 85% 로 돌아옴
  if (t < 13.4) {
    const k = CARD_T.filter((x) => x <= t).length - 1;
    const s = CARD_T[k];
    const idx = k === 3 ? 0 : k;
    const inX = (1 - outCubic(p(t, s, 0.22))) * (k === 3 ? -W : W);
    const outX = k < 3 ? -outCubic(p(t, s + 1.55, 0.15)) * W : 0;
    return stage(
      PINK,
      coachTag(),
      stagedTag(),
      at(70, 240, {}, big('답장 3개 중 뭐 보낼래?', 82, PAPER, INK)),
      at(80 + inX + outX, 420, {}, replyCard(REPLIES[idx], idx + 1, t, s)),
      k === 3 ? center(1390, slam(t, s + 0.3, 2.0, -10), box({ transform: 'rotate(-3deg)' }, pill(`${REPLIES[0].rate}%… 이거다`, 84, LIME, INK))) : null,
      at(70, 1640, {}, text('성공 확률·예상 반응은 AI 예상치예요', { fontSize: 32, fontWeight: 700, color: PAPER })),
      ...(k === 3 ? burst(t, s + 0.32, W / 2, 1400, '✨', 12, 0.8) : []),
    );
  }
  // 장면 5 — 보냈더니 바로 답 옴
  if (t < 16.6) {
    const arrived = 15.0;
    return stage(
      '#BACEE0',
      box(
        { position: 'absolute', left: 0, top: 0, width: W, height: H, transform: shake(t, arrived, 0.3, 20) },
        coachTag(),
        stagedTag(),
        at(70, 240, popIn(t, 13.45), pill('보내 봄', 40, INK, PAPER)),
        chat(t, [
          { who: 'them', text: ASKED.his, at: 0 },
          { who: 'me', text: ASKED.mine, at: 0, meta: '2시간 전' },
          { who: 'me', text: REPLIES[0].text, at: 13.55, meta: '방금' },
          { who: 'them', text: REPLIES[0].reaction, at: arrived },
        ], 380, 900, 42),
        t >= 14.4 && t < arrived ? at(60, 1300, {}, typingDots(t)) : null,
        t >= 15.4 ? center(1420, slam(t, 15.4, 1.8, -8), big('바로 답 옴 ㅋㅋ', 130, INK, PAPER)) : null,
      ),
    );
  }
  // 장면 6 — 호감 온도
  if (t < 19.0) {
    const v = countUp(t, HEAT4.from, HEAT4.to, 16.9, 0.9);
    return stage(
      SUN,
      coachTag(),
      stagedTag(),
      at(70, 300, rise(t, 16.65), big('민재의 호감 온도', 96, INK)),
      at(640, 420, popIn(t, 16.75), emojiSticker('🌡️', 300, 8, PAPER)),
      at(70, 700, t >= 17.8 ? slam(t, 17.8, 1.25) : {}, box({ alignItems: 'flex-end' }, big(String(v), 380, INK, PINK, { letterSpacing: -20, lineHeight: 1 }), big('°', 200, INK, undefined, { marginBottom: 60 }))),
      at(70, 1130, {}, box({ width: 940, height: 54, borderRadius: 27, backgroundColor: PAPER, ...sticker(5, 8) }, box({ width: Math.round(930 * (v / 100)), height: 44, borderRadius: 22, backgroundColor: PINK }))),
      at(70, 1210, rise(t, 17.0), text(`${HEAT4.from}° → ${HEAT4.to}°  (앱이 매긴 상대의 호감 온도)`, { fontSize: 34, fontWeight: 700, color: INK })),
      t >= 17.8 ? center(1400, slam(t, 17.8, 2.0, 8), box({ transform: 'rotate(2deg)' }, pill('온도 올라가는 소리 들림?', 64, INK, PAPER))) : null,
      ...burst(t, 17.85, W / 2, 900, '🔥', 12, 0.8),
    );
  }
  // 장면 7 — 네 카톡도 넣어 봐
  const pulse = 1 + 0.045 * Math.sin((t - 19.8) * Math.PI * 3);
  return stage(
    INK,
    coachTag(),
    at(70, 400, slam(t, 19.0, 1.8), big('네 카톡도', 180, LIME, PINK)),
    at(70, 600, slam(t, 19.15, 1.8), big('넣어 봐', 180, PAPER)),
    at(70, 840, rise(t, 19.45), big('캡처 한 장 → 답장 3개', 80, PINK, PAPER)),
    t >= 19.8 ? at(70, 1060, { transform: `scale(${pulse.toFixed(4)})` }, box({ padding: '26px 40px', borderRadius: 999, backgroundColor: LIME, ...sticker(6, 12) }, text('앱스토어 · 웹 「나만의 연애코치」', { fontSize: 48, fontWeight: 900, color: INK }))) : null,
    t >= 20.1 ? at(70, 1230, popIn(t, 20.1), pill('무료 맛보기 · 가입하면 3번 더', 40, PAPER, INK)) : null,
    at(700, 1330, popIn(t, 20.3), emojiSticker('💌', 220, 10, PINK)),
    ticker(t, 1660, LIME, INK, 4, '나만의 연애코치 · 캡처 한 장 · 답장 3개 · 호감 온도 · '),
  );
}
const cues4: Cue[] = [
  { t: 0.05, kind: 'whoosh' },
  { t: 0.8, kind: 'pop' },
  { t: 1.2, kind: 'pop' },
  { t: 1.9, kind: 'thump' },
  { t: 3.0, kind: 'boom' },
  ...Array.from({ length: 7 }, (_, i) => ({ t: 3.15 + i * 0.07, kind: 'tick' as Sfx })),
  { t: 3.95, kind: 'whoosh' },
  ...Array.from({ length: 5 }, (_, i) => ({ t: 4.35 + i * 0.1, kind: 'tick' as Sfx })),
  { t: 4.95, kind: 'whoosh' },
  { t: 5.4, kind: 'thump' },
  { t: 5.9, kind: 'thump' },
  { t: 6.4, kind: 'thump' },
  ...CARD_T.map((x) => ({ t: x, kind: 'whoosh' as Sfx })),
  ...CARD_T.slice(0, 3).map((x) => ({ t: x + 0.7, kind: 'pop' as Sfx })),
  { t: 12.4, kind: 'boom' },
  { t: 12.42, kind: 'ding' },
  { t: 13.55, kind: 'whoosh' },
  { t: 15.0, kind: 'ding' },
  { t: 15.4, kind: 'boom' },
  { t: 16.65, kind: 'whoosh' },
  ...Array.from({ length: 5 }, (_, i) => ({ t: 16.9 + 0.9 * (1 - Math.cbrt(1 - (i + 1) / 6)), kind: 'tick' as Sfx })),
  { t: 17.8, kind: 'boom' },
  { t: 19.0, kind: 'boom' },
  { t: 19.8, kind: 'pop' },
  { t: 20.1, kind: 'pop' },
];

// ───────────────────────── 05 · AI 플러팅 고수랑 연습 ─────────────────────────
// 2026-10-22 운영과 같은 연습 상대 처리(api/coach mode=practice, gemini-3.6-flash)로 소희(ESTP·★★★)와 실제로 주고받은 대화 그대로.
// 내 말은 직접 골라 쳤고, 소희의 말·온도 변화·코치 한마디는 AI 가 돌려준 값이다. 이모지는 3D 그림이 없어 말풍선에서 뺐다.
// 1트: +2° (간파당함) / 2트: +8° → +4°, 이 판 최고 12°.

const SOHEE = { emoji: '🍒', name: '소희', mbti: 'ESTP', style: '플러팅 고수 · 장난기 많음', opener: '어제 나 먼저 가서 서운했지? ㅋㅋ 표정 다 보였어', hint: '플러팅에 휘둘리지 말고 웃으며 받아쳐요. 진짜 약속은 내가 구체적으로 제안해요.' };
const TRY1 = { me: '아닌데? 나 원래 표정 그래. 너 착각한 듯', them: ['에이 거짓말 ㅋㅋㅋ', '입꼬리는 씰룩거렸으면서 무슨~'], delta: 2, feedback: '조금 더 위트 있게 받아쳤다면 반응이 더 뜨거웠을 거예요.' };
const TRY2 = [
  { me: '들켰네 ㅋㅋ 서운했지. 그러니까 토요일에 맛있는 거 먹으면서 보상해 줘', them: ['오~ 바로 보상 요구하는 거야? ㅋㅋ', '토요일에 뭐 먹고 싶은데? 맛없으면 안 갈 거임'], delta: 8 },
  { me: '너 먹고 싶은 거 다 ㅋㅋ 대신 이번엔 먼저 가기 없기. 토요일 7시 성수 어때?', them: ['오 성수 좋아 ㅋㅋ 근데 아무거나는 좀 성의 없는데~', '내가 제일 좋아하는 거 맞춰봐, 맞추면 7시에 성수에서 봐'], delta: 4 },
];
const BEST5 = TRY2[0].delta + TRY2[1].delta;

function personaCard(): Node {
  return box(
    { width: 920, alignItems: 'center', gap: 30, padding: '30px 36px', borderRadius: 44, backgroundColor: PAPER, ...sticker(6, 14) },
    emojiSticker(SOHEE.emoji, 180, -6, '#FFDCDC'),
    box(
      { flexDirection: 'column', gap: 8, flexShrink: 1 },
      box({ alignItems: 'center', gap: 14 }, text(SOHEE.name, { fontSize: 64, fontWeight: 900, color: INK }), pill(SOHEE.mbti, 30, LILAC, INK)),
      box({ alignItems: 'center', gap: 6 }, text('난이도', { fontSize: 32, fontWeight: 800, color: GRAY, marginRight: 8 }), emoji('⭐', 48), emoji('⭐', 48), emoji('⭐', 48)),
      text(SOHEE.style, { fontSize: 32, fontWeight: 800, color: INK }),
    ),
  );
}
const chatHeader = (label: string, heat: number, t: number, bumpAt: number): Node =>
  box(
    { position: 'absolute', left: 60, top: 230, width: W - 120, alignItems: 'center', justifyContent: 'space-between' },
    box({ alignItems: 'center', gap: 18 }, emojiSticker(SOHEE.emoji, 110, -6, '#FFDCDC'), text(SOHEE.name, { fontSize: 52, fontWeight: 900, color: INK }), pill(label, 34, INK, PAPER)),
    box(bumpAt > 0 && t >= bumpAt ? slam(t, bumpAt, 1.5) : {}, heatChip(`${heat}°`, 46)),
  );

const V5 = { seconds: 23.5 };
function frame5(t: number): Node {
  // 장면 1 — 훅 + 연습 상대 소개 (첫 화면에 「AI 연습 상대」)
  if (t < 2.8) {
    return stage(
      INK,
      coachTag(),
      cornerTag('AI 연습 상대예요', LIME, INK),
      at(70, 290, rise(t, 0.05), big('AI 플러팅 고수랑', 100, PAPER)),
      at(70, 410, rise(t, 0.2), big('카톡 연습했는데', 100, PAPER)),
      at(70, 540, rise(t, 0.35), big('바로 간파당함 ㅋㅋ', 112, LIME, PINK)),
      at(80, 840, popIn(t, 0.9), personaCard()),
      at(700, 1240, popIn(t, 1.4), emojiSticker('😏', 240, 10, PINK)),
      ticker(t, 1660, INK, LIME, -4, 'AI 연습 상대 · 카톡 연애 연습 · 호감 온도 · 나만의 연애코치 · '),
    );
  }
  // 장면 2·3 — 1트
  if (t < 9.8) {
    const heat = t >= 7.5 ? TRY1.delta : 0;
    return stage(
      '#BACEE0',
      coachTag(),
      cornerTag('AI 연습 상대예요'),
      chatHeader('1트', heat, t, 7.5),
      chat(t, [
        { who: 'them', text: SOHEE.opener, at: 2.95 },
        { who: 'me', text: TRY1.me, at: 4.9 },
        { who: 'them', text: TRY1.them[0], at: 6.1 },
        { who: 'them', text: TRY1.them[1], at: 6.7 },
      ], 400, 820, 42),
      t >= 3.4 && t < 4.9 ? center(1360, rise(t, 3.4), big('첫 카톡부터 훅 들어옴', 76, INK, PAPER)) : null,
      t >= 7.5 ? at(60, 1300, rise(t, 7.5), box({ width: W - 120, alignItems: 'center', gap: 16, padding: '22px 30px', borderRadius: 32, backgroundColor: PAPER, ...sticker(5, 10) }, pill('코치', 30, INK, PAPER), text(TRY1.feedback, { fontSize: 32, fontWeight: 700, color: INK, flexShrink: 1, lineHeight: 1.35 }))) : null,
      t >= 7.9 ? center(1500, slam(t, 7.9, 2.0, -8), box({ alignItems: 'center', gap: 20, transform: 'rotate(-3deg)' }, pill(`1트… 간파당함 (+${TRY1.delta}°)`, 66, INK, PAPER), emoji('🫠', 120))) : null,
    );
  }
  // 장면 4 — 힌트
  if (t < 12.0) {
    return stage(
      LIME,
      coachTag(),
      cornerTag('AI 연습 상대예요'),
      at(70, 330, slam(t, 9.8, 1.7), big('힌트 봄', 170, INK, PAPER)),
      at(680, 300, popIn(t, 10.0), emojiSticker('💭', 260, 8, PAPER)),
      at(70, 700, rise(t, 10.2), bubble(SOHEE.hint, 52, { maxWidth: 940 }, PAPER)),
      at(70, 1200, popIn(t, 10.9), big('2트 갑니다', 140, PINK, INK)),
    );
  }
  // 장면 5 — 2트 (온도가 쌓인다)
  if (t < 19.4) {
    const a1 = 13.9;
    const a2 = 17.4;
    const heat = t >= a2 ? BEST5 : t >= a1 ? TRY2[0].delta : 0;
    return stage(
      '#BACEE0',
      coachTag(),
      cornerTag('AI 연습 상대예요'),
      chatHeader('2트', heat, t, t >= a2 ? a2 : a1),
      chat(t, [
        { who: 'them', text: SOHEE.opener, at: 0 },
        { who: 'me', text: TRY2[0].me, at: 12.1 },
        { who: 'them', text: TRY2[0].them[0], at: 13.0 },
        { who: 'them', text: TRY2[0].them[1], at: 13.5 },
        { who: 'me', text: TRY2[1].me, at: 15.0 },
        { who: 'them', text: TRY2[1].them[0], at: 16.2 },
        { who: 'them', text: TRY2[1].them[1], at: 16.8 },
      ], 400, 1000, 40),
      t >= a1 && t < 15.0 ? center(1500, slam(t, a1, 1.8, -6), pill(`+${TRY2[0].delta}°`, 90, PINK, PAPER)) : null,
      t >= a2 ? center(1500, slam(t, a2, 1.8, 6), box({ transform: 'rotate(2deg)' }, pill(`+${TRY2[1].delta}° · 약속까지 잡힘?`, 70, INK, PAPER))) : null,
    );
  }
  // 장면 6 — 이 판 최고 온도
  if (t < 21.4) {
    const v = countUp(t, 0, BEST5, 19.5, 0.8);
    return stage(
      PINK,
      box(
        { position: 'absolute', left: 0, top: 0, width: W, height: H, transform: shake(t, 20.35, 0.3, 24) },
        coachTag(),
        cornerTag('AI 연습 상대예요'),
        at(70, 330, rise(t, 19.45), big('★★★ 소희 상대로', 96, PAPER, INK)),
        at(70, 460, rise(t, 19.6), big('2트 최고 온도', 96, PAPER, INK)),
        at(70, 640, t >= 20.35 ? slam(t, 20.35, 1.3) : {}, box({ alignItems: 'flex-end' }, big(String(v), 460, LIME, INK, { letterSpacing: -24, lineHeight: 1 }), big('°', 220, LIME, INK, { marginBottom: 70 }))),
        at(640, 1150, popIn(t, 20.4), emojiSticker('🔥', 260, 8, SUN)),
        at(70, 1200, rise(t, 20.5), text('실제 연습 기록 · 0°에서 시작', { fontSize: 36, fontWeight: 800, color: PAPER })),
        ...burst(t, 20.38, W / 2, 900, '🔥', 14, 0.9),
      ),
    );
  }
  // 장면 7 — 너는 몇 도까지?
  const pulse = 1 + 0.045 * Math.sin((t - 22.1) * Math.PI * 3);
  return stage(
    INK,
    coachTag(),
    at(70, 400, slam(t, 21.4, 1.8), big('너는 몇 도까지', 140, LIME, PINK)),
    at(70, 560, slam(t, 21.55, 1.8), big('가능?', 180, PAPER)),
    at(70, 800, rise(t, 21.8), big('AI랑 카톡 연애 연습', 80, PINK, PAPER)),
    t >= 22.1 ? at(70, 1020, { transform: `scale(${pulse.toFixed(4)})` }, box({ padding: '26px 40px', borderRadius: 999, backgroundColor: LIME, ...sticker(6, 12) }, text('앱스토어 · 웹 「나만의 연애코치」', { fontSize: 48, fontWeight: 900, color: INK }))) : null,
    t >= 22.4 ? at(70, 1190, popIn(t, 22.4), pill('결과 캡처해서 #온도챌린지', 40, PAPER, INK)) : null,
    at(700, 1300, popIn(t, 22.6), emojiSticker(SOHEE.emoji, 220, 10, '#FFDCDC')),
    ticker(t, 1660, LIME, INK, 4, 'AI 연습 상대 · 카톡 연애 연습 · 호감 온도 · 나만의 연애코치 · '),
  );
}
const cues5: Cue[] = [
  { t: 0.05, kind: 'whoosh' },
  { t: 0.9, kind: 'pop' },
  { t: 1.4, kind: 'pop' },
  { t: 2.95, kind: 'ding' },
  { t: 4.9, kind: 'whoosh' },
  { t: 6.1, kind: 'pop' },
  { t: 6.7, kind: 'pop' },
  { t: 7.5, kind: 'tick' },
  { t: 7.9, kind: 'thump' },
  { t: 9.8, kind: 'boom' },
  { t: 10.2, kind: 'pop' },
  { t: 10.9, kind: 'boom' },
  { t: 12.1, kind: 'whoosh' },
  { t: 13.0, kind: 'pop' },
  { t: 13.5, kind: 'pop' },
  { t: 13.9, kind: 'boom' },
  { t: 13.92, kind: 'ding' },
  { t: 15.0, kind: 'whoosh' },
  { t: 16.2, kind: 'pop' },
  { t: 16.8, kind: 'pop' },
  { t: 17.4, kind: 'boom' },
  ...Array.from({ length: 6 }, (_, i) => ({ t: 19.5 + 0.8 * (1 - Math.cbrt(1 - (i + 1) / 7)), kind: 'tick' as Sfx })),
  { t: 20.35, kind: 'boom' },
  { t: 20.38, kind: 'ding' },
  { t: 21.4, kind: 'boom' },
  { t: 22.1, kind: 'pop' },
  { t: 22.4, kind: 'pop' },
];

// ───────────────────────── 내보내기 ─────────────────────────

const VIDEOS: Record<string, { name: string; seconds: number; frame: (t: number) => Node; cues: Cue[] }> = {
  '01': { name: '01-link-match', seconds: V1.seconds, frame: frame1, cues: cues1 },
  '02': { name: '02-type-slot', seconds: V2.seconds, frame: frame2, cues: cues2 },
  '03': { name: '03-tier-countdown', seconds: V3.seconds, frame: frame3, cues: cues3 },
  '04': { name: '04-ignored-comeback', seconds: V4.seconds, frame: frame4, cues: cues4 },
  '05': { name: '05-flirt-practice', seconds: V5.seconds, frame: frame5, cues: cues5 },
};

async function make(id: string) {
  const v = VIDEOS[id];
  const work = path.join(os.tmpdir(), `kkti-video-${v.name}`);
  rmSync(work, { recursive: true, force: true });
  mkdirSync(work, { recursive: true });
  const frames = Math.round(v.seconds * FPS);
  const started = Date.now();
  for (let f = 0; f < frames; f++) {
    writeFileSync(path.join(work, `f${String(f).padStart(5, '0')}.png`), await render(v.frame(f / FPS), W, H));
    if (f % 60 === 0) console.log(`${v.name} ${f}/${frames} (${((Date.now() - started) / 1000).toFixed(0)}초)`);
  }
  const wav = path.join(work, 'sfx.wav');
  soundtrack(v.cues, v.seconds, wav);
  mkdirSync(OUT, { recursive: true });
  const encode = (out: string, withSound: boolean) =>
    execFileSync(ffmpegPath(), [
      '-y', '-loglevel', 'error',
      '-framerate', String(FPS), '-i', path.join(work, 'f%05d.png'),
      ...(withSound ? ['-i', wav] : []),
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-preset', 'medium', '-r', String(FPS),
      ...(withSound ? ['-c:a', 'aac', '-b:a', '160k', '-shortest'] : ['-an']),
      '-movflags', '+faststart', out,
    ]);
  encode(path.join(OUT, `${v.name}.mp4`), true);
  encode(path.join(OUT, 'silent', `${v.name}.mp4`), false);
  rmSync(work, { recursive: true, force: true });
  console.log(`${v.name} 완료 — ${v.seconds.toFixed(1)}초, ${frames}프레임`);
}

async function main() {
  mkdirSync(path.join(OUT, 'silent'), { recursive: true });
  const ids = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(VIDEOS);
  for (const id of ids) await make(id);
}

if (require.main === module)
  main().catch((e) => {
    if (e?.stderr) console.error(String(e.stderr).slice(0, 800));
    else console.error(e);
    process.exit(1);
  });

export { frame1, frame2, frame3, frame4, frame5, VIDEOS };
