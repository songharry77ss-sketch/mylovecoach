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

// ───────────────────────── 내보내기 ─────────────────────────

const VIDEOS: Record<string, { name: string; seconds: number; frame: (t: number) => Node; cues: Cue[] }> = {
  '01': { name: '01-link-match', seconds: V1.seconds, frame: frame1, cues: cues1 },
  '02': { name: '02-type-slot', seconds: V2.seconds, frame: frame2, cues: cues2 },
  '03': { name: '03-tier-countdown', seconds: V3.seconds, frame: frame3, cues: cues3 },
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

export { frame1, frame2, frame3, VIDEOS };
