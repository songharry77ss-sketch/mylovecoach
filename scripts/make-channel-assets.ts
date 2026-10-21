/**
 * 채널에 바로 올릴 KKTI 그림을 docs/channel-assets/ 에 만든다 (docs/CHANNEL_PLAYBOOK.md 가 이 파일들을 가리킨다).
 *   npx tsx scripts/fetch-fluent-emoji.ts   (3D 이모지가 없을 때 한 번)
 *   npx tsx scripts/make-channel-assets.ts
 *
 * 디자인: 프리텐다드 Black·ExtraBold 를 크게 · 검은 테두리와 딱 떨어지는 그림자의 스티커 · 카톡 말풍선 · 3D 이모지(Fluent).
 * 앱 안의 공유 카드(api/_kkti-card)와는 따로 그린다 (그쪽은 서버에서 그리는 가벼운 판).
 *
 * - types-square/01-esfj.png … : 16유형 소개 카드 (1080×1080 — 인스타 캐러셀·X·스레드). 번호는 KKTI_CODES 순서
 * - types-story/… : 같은 카드의 세로판 (1080×1920 — 인스타 스토리·틱톡 포토)
 * - tiers-square/1.png … 5.png : 궁합 등급 다섯 가지 (천생연분 → 극과 극)
 * - cover-* · cta-* · match-teaser-* : 캐러셀 표지 · 마지막 장 · 「둘 다 해야 열리는 궁합」
 * - sample-* : 결과·궁합 카드 견본 (유형 소개용, 실제 이용자 결과가 아님)
 * 영상은 scripts/make-channel-videos.ts
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { Resvg } from '@resvg/resvg-js';
import satori from 'satori';

import { KKTI_AXES, KKTI_CODES, KKTI_MATCH_TIERS, KKTI_QUESTIONS, KKTI_TYPES, codeLetters, computeKkti, kktiMatch, mixHex, readableTextOn, type KktiResult } from '../src/lib/kkti';
import { fluentFile } from './fetch-fluent-emoji';

const OUT = path.join(__dirname, '..', 'docs', 'channel-assets');
export const INK = '#0E0E12';
export const PAPER = '#FFFDF7';
export const PINK = '#FF3D7F';
export const LIME = '#C6FF3D';
export const LILAC = '#B9A2FF';
export const SKY = '#7FD8FF';
export const SUN = '#FFD43D';

// ───────────────────────── 그리기 재료 ─────────────────────────

export type Style = Record<string, string | number>;
export interface Node {
  type: string;
  props: { style?: Style; children?: Child | Child[]; src?: string; width?: number; height?: number };
}
export type Child = Node | string | null | false;

export const box = (style: Style, ...children: Child[]): Node => ({
  type: 'div',
  props: { style: { display: 'flex', boxSizing: 'border-box', position: 'relative', ...style }, children: children.filter(Boolean) as Child[] },
});
export const text = (value: string, style: Style): Node => ({ type: 'div', props: { style: { display: 'flex', wordBreak: 'keep-all', ...style }, children: value } });

const fontDirs = [path.join(__dirname, 'assets', 'fonts'), path.join(__dirname, '..', 'api', '_assets', 'fonts')];
const font = (file: string) => readFileSync(fontDirs.map((d) => path.join(d, file)).find((p) => existsSync(p))!);
export const FONTS = (
  [
    ['Pretendard-Medium.otf', 500],
    ['Pretendard-SemiBold.otf', 600],
    ['Pretendard-Bold.otf', 700],
    ['Pretendard-ExtraBold.otf', 800],
    ['Pretendard-Black.otf', 900],
  ] as const
).map(([file, weight]) => ({ name: 'Pretendard', data: font(file), weight, style: 'normal' as const }));

const emojiCache = new Map<string, string>();
function emojiUri(emoji: string): string {
  if (!emojiCache.has(emoji)) {
    const file = fluentFile(emoji);
    emojiCache.set(emoji, existsSync(file) ? `data:image/png;base64,${readFileSync(file).toString('base64')}` : '');
  }
  return emojiCache.get(emoji)!;
}
export const emoji = (value: string, size: number, style: Style = {}): Node | null => {
  const src = emojiUri(value);
  if (!src) throw new Error(`3D 이모지 없음: ${value} — scripts/fetch-fluent-emoji.ts 에 추가하고 다시 받으세요`);
  return { type: 'img', props: { src, width: size, height: size, style: { width: size, height: size, ...style } } };
};

/** 검은 테두리 + 딱 떨어지는 그림자 */
export const sticker = (px: number, shadow = 10): Style => ({ border: `${px}px solid ${INK}`, boxShadow: `${shadow}px ${shadow}px 0 0 ${INK}` });

/** 둥근 스티커 안의 3D 이모지 */
export function emojiSticker(value: string, size: number, rotate = -6, bg = PAPER): Node {
  return box(
    { width: size, height: size, flexShrink: 0, borderRadius: size / 2, backgroundColor: bg, alignItems: 'center', justifyContent: 'center', transform: `rotate(${rotate}deg)`, ...sticker(Math.max(4, Math.round(size / 48)), Math.round(size / 22)) },
    emoji(value, Math.round(size * 0.74)),
  );
}

/** 카톡 말풍선 (왼쪽 아래 모서리만 뾰족) */
export function bubble(value: string, fontSize: number, style: Style = {}, bg = PAPER, color = INK): Node {
  return box(
    { padding: `${Math.round(fontSize * 0.62)}px ${Math.round(fontSize * 0.9)}px`, borderRadius: Math.round(fontSize * 1.1), borderBottomLeftRadius: Math.round(fontSize * 0.25), backgroundColor: bg, ...sticker(Math.max(3, Math.round(fontSize / 9)), Math.round(fontSize / 5)), ...style },
    text(value, { fontSize, fontWeight: 700, color, lineHeight: 1.35, letterSpacing: -0.5 }),
  );
}

export const pill = (value: string, fontSize: number, bg: string, color: string, style: Style = {}): Node =>
  box({ padding: `${Math.round(fontSize * 0.42)}px ${Math.round(fontSize * 0.85)}px`, borderRadius: 999, backgroundColor: bg, alignItems: 'center', gap: Math.round(fontSize * 0.3), ...sticker(Math.max(3, Math.round(fontSize / 10)), Math.round(fontSize / 6)), ...style }, text(value, { fontSize, fontWeight: 800, color, letterSpacing: -0.3 }));

/** 유형 이름 — 두 단어 이상이면 줄을 나눠 아주 크게 */
export function nameLines(name: string): string[] {
  const words = name.split(' ');
  if (words.length === 1) return [name];
  return [words[0], words.slice(1).join(' ')];
}

/** 이름 크기: 가장 긴 줄이 width 안에 들어가게 (한글 한 글자 ≈ 0.94em) */
export const fitSize = (lines: string[], width: number, max: number) => Math.min(max, Math.floor(width / (Math.max(...lines.map((l) => l.length)) * 0.94)));

function bigName(name: string, width: number, max: number, color: string, shadow: string): Node {
  const lines = nameLines(name);
  const size = fitSize(lines, width, max);
  return box(
    { flexDirection: 'column' },
    ...lines.map((line) => text(line, { fontSize: size, fontWeight: 900, color, letterSpacing: -size * 0.055, lineHeight: 1.02, textShadow: `${Math.round(size / 22)}px ${Math.round(size / 22)}px 0 ${shadow}` })),
  );
}

export function letterTiles(result: KktiResult, size: number): Node {
  return box(
    { gap: Math.round(size * 0.14) },
    ...codeLetters(result.code).map((letter, i) =>
      box(
        { flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: size, height: Math.round(size * 1.08), borderRadius: Math.round(size * 0.2), backgroundColor: PAPER, transform: `rotate(${[-3, 2, -2, 3][i]}deg)`, ...sticker(Math.max(3, Math.round(size / 26)), Math.round(size / 14)) },
        text(letter, { fontSize: Math.round(size * 0.56), fontWeight: 900, color: INK, lineHeight: 1.05, letterSpacing: -2 }),
        text(result.axes[i].pole.label, { fontSize: Math.round(size * 0.135), fontWeight: 700, color: '#55555C', marginTop: 2 }),
      ),
    ),
  );
}

/** 배경에 크게 깔리는 유형 코드 글자 */
const ghost = (value: string, size: number, color: string, style: Style): Node =>
  box({ position: 'absolute', ...style }, text(value, { fontSize: size, fontWeight: 900, color, letterSpacing: -size * 0.06, lineHeight: 1 }));

// ───────────────────────── 16유형 카드 ─────────────────────────

/** 그 유형이 가장 뚜렷하게 나오는 답 (축마다 같은 쪽 끝) */
export function typical(code: string): KktiResult {
  const letters = Array.from(code);
  return computeKkti(
    KKTI_QUESTIONS.map((q) => {
      const i = KKTI_AXES.findIndex((a) => a.key === q.axis);
      const sign = letters[i] === KKTI_AXES[i].plus.letter ? 1 : -1;
      return q.options.findIndex((o) => o.score === sign * 2);
    }),
  );
}

interface Ink {
  ink: string;
  shadow: string;
  ghost: string;
}
export function inkOn(hex: string): Ink {
  const light = readableTextOn(hex) === '#FFFFFF';
  return light ? { ink: PAPER, shadow: INK, ghost: 'rgba(255,255,255,0.10)' } : { ink: INK, shadow: PAPER, ghost: 'rgba(14,14,18,0.08)' };
}

function topBar(right: string, scale = 1): Node {
  return box(
    { justifyContent: 'space-between', alignItems: 'center', width: '100%' },
    box({ padding: `${Math.round(12 * scale)}px ${Math.round(26 * scale)}px`, borderRadius: 999, backgroundColor: INK }, text('KKTI', { fontSize: Math.round(34 * scale), fontWeight: 900, color: PAPER, letterSpacing: 1 })),
    pill(right, Math.round(28 * scale), PAPER, INK),
  );
}

function typeSquare(result: KktiResult, index: number): Node {
  const tone = inkOn(result.color.hex);
  const best = KKTI_TYPES[result.type.bestMatch];
  return box(
    { width: '100%', height: '100%', flexDirection: 'column', backgroundColor: result.color.hex, fontFamily: 'Pretendard', padding: 64, overflow: 'hidden' },
    ghost(result.code, 330, tone.ghost, { right: -40, bottom: -70, transform: 'rotate(-8deg)' }),
    topBar(`16유형 · ${String(index + 1).padStart(2, '0')}`),
    box({ marginTop: 44, alignItems: 'center', gap: 40 }, emojiSticker(result.type.emoji, 230, -7), letterTiles(result, 116)),
    box({ marginTop: 40 }, bigName(result.type.name, 940, 168, tone.ink, tone.shadow)),
    box({ flexGrow: 1 }),
    bubble(result.type.oneLiner, 31, { alignSelf: 'flex-start', maxWidth: 900 }),
    box(
      { marginTop: 30, justifyContent: 'space-between', alignItems: 'center' },
      box({ alignItems: 'center', gap: 12, padding: '14px 26px', borderRadius: 999, backgroundColor: INK }, emoji('💞', 36), text(`찰떡궁합 · ${best.name}`, { fontSize: 28, fontWeight: 800, color: PAPER })),
      text('내 유형은? 프로필 링크 ↗', { fontSize: 26, fontWeight: 800, color: tone.ink }),
    ),
  );
}

function typeStory(result: KktiResult, index: number): Node {
  const tone = inkOn(result.color.hex);
  const best = KKTI_TYPES[result.type.bestMatch];
  return box(
    { width: '100%', height: '100%', flexDirection: 'column', backgroundColor: result.color.hex, fontFamily: 'Pretendard', padding: '200px 72px 260px', overflow: 'hidden' },
    ghost(result.code, 330, tone.ghost, { left: -30, bottom: -50, transform: 'rotate(-6deg)' }),
    topBar(`16유형 · ${String(index + 1).padStart(2, '0')}`, 1.15),
    box({ marginTop: 70, justifyContent: 'center' }, emojiSticker(result.type.emoji, 360, -6)),
    box({ marginTop: 60, justifyContent: 'center' }, letterTiles(result, 150)),
    box({ marginTop: 56 }, bigName(result.type.name, 930, 200, tone.ink, tone.shadow)),
    box({ marginTop: 40 }, bubble(result.type.oneLiner, 38, { maxWidth: 930 })),
    box({ flexGrow: 1 }),
    box({ alignItems: 'center', gap: 14, alignSelf: 'flex-start', padding: '18px 30px', borderRadius: 999, backgroundColor: INK }, emoji('💞', 44), text(`찰떡궁합 · ${best.name}`, { fontSize: 34, fontWeight: 800, color: PAPER })),
  );
}

// ───────────────────────── 궁합 등급 · 표지 · 마지막 장 ─────────────────────────

const TIER_BG: Record<string, [string, string]> = {
  천생연분: ['#FF5FA2', '#FF2E63'],
  찰떡궁합: ['#FF7AC3', PINK],
  '티키타카 케미': [SUN, '#FFB13D'],
  '반전 케미': [LILAC, '#8C6BFF'],
  '극과 극': ['#FF8A3D', '#FF3D3D'],
};

function tierSquare(index: number): Node {
  const tier = KKTI_MATCH_TIERS[index];
  const top = index === 0 ? 99 : KKTI_MATCH_TIERS[index - 1].min - 1;
  const [a, b] = TIER_BG[tier.label] ?? [PINK, LILAC];
  return box(
    { width: '100%', height: '100%', flexDirection: 'column', backgroundImage: `linear-gradient(150deg, ${a} 0%, ${b} 100%)`, fontFamily: 'Pretendard', padding: 64, overflow: 'hidden' },
    topBar(`궁합 등급 · ${index + 1}/5`),
    box({ position: 'absolute', right: 70, top: 170 }, emojiSticker(tier.emoji, 210, 9)),
    box({ flexGrow: 1 }),
    text(`${Math.max(tier.min, 30)}–${top}%`, { fontSize: 210, fontWeight: 900, color: INK, letterSpacing: -12, lineHeight: 1, textShadow: `8px 8px 0 ${PAPER}` }),
    box({ marginTop: 26, alignSelf: 'flex-start' }, pill(tier.label, 64, INK, PAPER)),
    box({ marginTop: 34 }, bubble(tier.line, 34)),
    box({ marginTop: 38 }, text('KKTI 카톡 궁합 · 둘 다 테스트하면 열림', { fontSize: 26, fontWeight: 800, color: INK })),
  );
}

function cover(tall: boolean): Node {
  const k = tall ? 1.25 : 1;
  const px = (n: number) => Math.round(n * k);
  return box(
    { width: '100%', height: '100%', flexDirection: 'column', justifyContent: 'center', backgroundColor: INK, fontFamily: 'Pretendard', padding: tall ? '220px 80px 280px' : 70, overflow: 'hidden' },
    box({ position: 'absolute', left: px(60), top: px(tall ? 240 : 70), transform: 'rotate(-8deg)' }, bubble('뭐해?', px(40))),
    box({ position: 'absolute', right: px(60), top: px(tall ? 330 : 120), transform: 'rotate(6deg)' }, bubble('ㅋㅋㅋㅋㅋㅋ', px(40), {}, LIME)),
    box({ position: 'absolute', right: px(110), bottom: px(tall ? 330 : 110), transform: 'rotate(-5deg)' }, bubble('자니…?', px(40), {}, LILAC)),
    box({ position: 'absolute', left: px(70), bottom: px(tall ? 360 : 120) }, emojiSticker('🦊', px(150), -10, SKY)),
    box({ position: 'absolute', left: px(250), bottom: px(tall ? 300 : 70) }, emojiSticker('🐹', px(120), 8, SUN)),
    text('KKTI', { fontSize: px(300), fontWeight: 900, color: LIME, letterSpacing: -px(18), lineHeight: 0.95, textShadow: `${px(10)}px ${px(10)}px 0 ${PINK}` }),
    text('카톡으로 보는', { marginTop: px(20), fontSize: px(64), fontWeight: 900, color: PAPER, letterSpacing: -2 }),
    text('진짜 연애 MBTI', { fontSize: px(64), fontWeight: 900, color: PAPER, letterSpacing: -2 }),
    box({ marginTop: px(30), alignSelf: 'flex-start' }, pill('16유형 중 나는? →', px(34), PINK, PAPER)),
  );
}

function cta(tall: boolean): Node {
  const k = tall ? 1.25 : 1;
  const px = (n: number) => Math.round(n * k);
  return box(
    { width: '100%', height: '100%', flexDirection: 'column', justifyContent: 'center', backgroundColor: PINK, fontFamily: 'Pretendard', padding: tall ? '240px 80px 300px' : 72, overflow: 'hidden' },
    box({ position: 'absolute', right: px(70), top: px(tall ? 260 : 80) }, emojiSticker('✨', px(170), 10, LIME)),
    text('내 유형은', { fontSize: px(150), fontWeight: 900, color: INK, letterSpacing: -px(9), lineHeight: 1, textShadow: `${px(7)}px ${px(7)}px 0 ${PAPER}` }),
    text('뭘까?', { fontSize: px(150), fontWeight: 900, color: INK, letterSpacing: -px(9), lineHeight: 1.05, textShadow: `${px(7)}px ${px(7)}px 0 ${PAPER}` }),
    box({ marginTop: px(40), alignSelf: 'flex-start' }, bubble('1분 · 12문항 · 가입 없이', px(40))),
    box({ marginTop: px(22), alignSelf: 'flex-start' }, bubble('친구가 하면 둘의 궁합까지 나옴 💞', px(40), {}, LIME)),
    box(
      { marginTop: px(46), alignSelf: 'flex-start', alignItems: 'center', gap: px(14), padding: `${px(22)}px ${px(38)}px`, borderRadius: 999, backgroundColor: INK, boxShadow: `${px(10)}px ${px(10)}px 0 0 ${PAPER}` },
      text('프로필 링크에서 테스트 ↗', { fontSize: px(40), fontWeight: 900, color: PAPER }),
    ),
  );
}

function matchTeaser(tall: boolean): Node {
  const k = tall ? 1.25 : 1;
  const px = (n: number) => Math.round(n * k);
  return box(
    { width: '100%', height: '100%', flexDirection: 'column', justifyContent: 'center', backgroundColor: LIME, fontFamily: 'Pretendard', padding: tall ? '240px 80px 300px' : 72, overflow: 'hidden' },
    box({ position: 'absolute', right: px(80), top: px(tall ? 280 : 90) }, emojiSticker('🔒', px(190), 8)),
    text('둘 다 해야 열리는', { fontSize: px(58), fontWeight: 900, color: INK, letterSpacing: -2 }),
    text('카톡 궁합', { marginTop: px(8), fontSize: px(150), fontWeight: 900, color: INK, letterSpacing: -px(9), lineHeight: 1 }),
    text('??%', { fontSize: px(250), fontWeight: 900, color: PINK, letterSpacing: -px(14), lineHeight: 1, textShadow: `${px(10)}px ${px(10)}px 0 ${INK}` }),
    box({ marginTop: px(34), alignSelf: 'flex-start' }, bubble('링크 보내고, 그 사람이 테스트하면 끝', px(38))),
  );
}

// ───────────────────────── 결과·궁합 견본 ─────────────────────────

function matchCard(a: KktiResult, b: KktiResult, tall: boolean): Node {
  const match = kktiMatch(a, b);
  const k = tall ? 1.2 : 1;
  const px = (n: number) => Math.round(n * k);
  const person = (r: KktiResult, who: string, rotate: number) =>
    box(
      { flexDirection: 'column', alignItems: 'center', gap: px(14), width: px(330) },
      emojiSticker(r.type.emoji, px(200), rotate, mixHex(r.color.hex, PAPER, 0.35)),
      pill(who, px(24), INK, PAPER),
      text(r.type.name, { fontSize: px(32), fontWeight: 900, color: INK, letterSpacing: -1, textAlign: 'center', justifyContent: 'center' }),
    );
  return box(
    { width: '100%', height: '100%', flexDirection: 'column', justifyContent: 'center', backgroundImage: `linear-gradient(135deg, ${a.color.hex} 0%, ${a.color.hex} 50%, ${b.color.hex} 50%, ${b.color.hex} 100%)`, fontFamily: 'Pretendard', padding: tall ? '200px 64px 260px' : 56 },
    box(
      { flexDirection: 'column', alignItems: 'center', backgroundColor: PAPER, borderRadius: px(56), padding: `${px(48)}px ${px(40)}px`, ...sticker(px(6), px(16)) },
      topBar('카톡 궁합', k),
      box({ marginTop: px(36), alignItems: 'flex-start', justifyContent: 'center', gap: px(10) }, person(a, '나', -7), text('×', { fontSize: px(70), fontWeight: 900, color: INK, marginTop: px(60) }), person(b, '친구', 7)),
      box(
        { marginTop: px(10), alignItems: 'flex-end' },
        text(String(match.percent), { fontSize: px(230), fontWeight: 900, color: INK, letterSpacing: -px(14), lineHeight: 1, textShadow: `${px(9)}px ${px(9)}px 0 ${PINK}` }),
        text('%', { fontSize: px(100), fontWeight: 900, color: INK, marginBottom: px(22) }),
      ),
      box({ marginTop: px(10) }, pill(`${match.tier.label}`, px(48), INK, PAPER)),
      box({ marginTop: px(26) }, bubble(match.tier.line, px(30))),
    ),
  );
}

function resultStory(r: KktiResult): Node {
  const tone = inkOn(r.color.hex);
  return box(
    { width: '100%', height: '100%', flexDirection: 'column', backgroundColor: r.color.hex, fontFamily: 'Pretendard', padding: '200px 72px 260px', overflow: 'hidden' },
    ghost(r.code, 330, tone.ghost, { left: -30, bottom: -50, transform: 'rotate(-6deg)' }),
    topBar('나의 연애 유형', 1.15),
    box({ marginTop: 70, justifyContent: 'center' }, emojiSticker(r.type.emoji, 360, -6)),
    box({ marginTop: 60, justifyContent: 'center' }, letterTiles(r, 150)),
    box({ marginTop: 56 }, bigName(r.type.name, 930, 200, tone.ink, tone.shadow)),
    box({ marginTop: 40 }, bubble(r.type.oneLiner, 38, { maxWidth: 930 })),
    box({ flexGrow: 1 }),
    box({ alignItems: 'center', gap: 14, alignSelf: 'flex-start', padding: '20px 34px', borderRadius: 999, backgroundColor: INK, boxShadow: `10px 10px 0 0 ${PAPER}` }, emoji('💞', 46), text('너도 하면 나랑 궁합 나옴', { fontSize: 38, fontWeight: 900, color: PAPER })),
  );
}

// ───────────────────────── 내보내기 ─────────────────────────

export async function render(tree: Node, width: number, height: number): Promise<Buffer> {
  const svg = await satori(tree as unknown as Parameters<typeof satori>[0], {
    width,
    height,
    fonts: FONTS,
    loadAdditionalAsset: async (code, segment) => (code === 'emoji' ? emojiUri(segment) : ''),
  });
  return Buffer.from(new Resvg(svg, { fitTo: { mode: 'width', value: width } }).render().asPng());
}

async function save(dir: string, name: string, tree: Node, width: number, height: number) {
  mkdirSync(path.join(OUT, dir), { recursive: true });
  writeFileSync(path.join(OUT, dir, `${name}.png`), await render(tree, width, height));
}

async function main() {
  // 예전 그림을 지우고 새로 만든다 (영상 폴더는 그대로)
  for (const dir of ['types-square', 'types-story', 'tiers-square']) rmSync(path.join(OUT, dir), { recursive: true, force: true });
  const results = KKTI_CODES.map(typical);
  for (const [i, r] of results.entries()) {
    const name = `${String(i + 1).padStart(2, '0')}-${r.mbti.type.toLowerCase()}`;
    await save('types-square', name, typeSquare(r, i), 1080, 1080);
    await save('types-story', name, typeStory(r, i), 1080, 1920);
  }
  for (let i = 0; i < KKTI_MATCH_TIERS.length; i++) await save('tiers-square', String(i + 1), tierSquare(i), 1080, 1080);
  for (const [shape, w, h] of [
    ['square', 1080, 1080],
    ['story', 1080, 1920],
  ] as const) {
    const tall = shape === 'story';
    await save('', `cover-${shape}`, cover(tall), w, h);
    await save('', `cta-${shape}`, cta(tall), w, h);
    await save('', `match-teaser-${shape}`, matchTeaser(tall), w, h);
  }
  const a = results[KKTI_CODES.indexOf('후빠폭밀')];
  const b = results[KKTI_CODES.indexOf('선빠폭밀')];
  const c = results[KKTI_CODES.indexOf('선느담직')];
  await save('', 'sample-result-story', resultStory(a), 1080, 1920);
  await save('', 'sample-match-story', matchCard(a, b, true), 1080, 1920);
  await save('', 'sample-match-square', matchCard(a, b, false), 1080, 1080);
  await save('', 'sample-match-low-square', matchCard(a, c, false), 1080, 1080);
  rmSync(path.join(OUT, 'sample-link-preview.png'), { force: true });
  console.log(`그림 ${results.length * 2 + KKTI_MATCH_TIERS.length + 10}장 → ${OUT}`);
}

if (require.main === module)
  main().catch((e) => {
  console.error(e);
  process.exit(1);
});
