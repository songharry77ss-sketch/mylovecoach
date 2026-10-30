/**
 * KKTI 결과 카드 그림 (PNG) 만들기 — 링크 미리보기(og)·인스타 스토리(story)·피드(square).
 * 혼자 결과면 그 사람의 연애 컬러로 물든 유형 카드, 둘이면 궁합 카드, 결과가 없으면 테스트 소개 카드가 나온다.
 *
 * 디자인은 채널 게시물(scripts/make-channel-assets.ts)과 같은 말투다: 프리텐다드 Black 을 크게 · 검은 테두리와
 * 딱 떨어지는 그림자의 스티커 · 카톡 말풍선 · 3D 이모지(Fluent). 게시물에서 본 그림을 친구가 보낸 카드에서 다시 알아보게.
 *
 * - 그림에는 유형·색·궁합처럼 답 코드에서 계산되는 것만 들어간다 (이름·대화 같은 개인정보 없음).
 * - 글꼴(Pretendard, OFL)·3D 이모지(Microsoft Fluent Emoji, MIT)·평면 이모지(Twemoji, CC-BY 4.0)는 api/_assets 에 넣어 두고 읽는다
 *   — 그릴 때 외부로 나가지 않는다. 3D 가 없는 이모지(글 속에 섞인 것 등)는 Twemoji 로 그린다.
 *   유형·등급 이모지를 바꾸면 `npx tsx scripts/fetch-fluent-emoji.ts`(3D)와 `npx tsx scripts/make-kkti-emoji.ts`(평면)를 다시 돌린다.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { Resvg } from '@resvg/resvg-js';
import satori from 'satori';

import { KKTI_FIT_LABEL, codeLetters, kktiMatch, readableTextOn, type KktiCardShape, type KktiFit, type KktiResult } from '../src/lib/kkti';

export const CARD_SIZE: Record<KktiCardShape, { width: number; height: number }> = {
  og: { width: 1200, height: 630 },
  story: { width: 1080, height: 1920 },
  square: { width: 1080, height: 1080 },
};

/** 카드에 쓰는 이모지 가운데 유형·궁합 등급·축에 없는 것 (이모지 그림을 받을 때 함께 받는다) */
export const CARD_EXTRA_EMOJI = ['💬', '💞', '🎨', '🧬', '🔢', '📲', '⚡', '🎉', '🚀', '👀', '✨'];

const INK = '#0E0E12';
const PAPER = '#FFFDF7';
const PINK = '#FF3D7F';
const LIME = '#C6FF3D';
const LILAC = '#B9A2FF';
const SKY = '#7FD8FF';
const SUN = '#FFD43D';
const MUTED = '#55555C';
const BRAND = 'KKTI · 카톡으로 보는 진짜 연애 MBTI';
const FIT_BG: Record<KktiFit, string> = { good: LIME, ok: SUN, care: '#FFB3CC' };

// ───────────────────────── 그림 재료 ─────────────────────────

export type Style = Record<string, string | number>;
export interface Node {
  type: string;
  props: { style?: Style; children?: Child | Child[]; src?: string; width?: number; height?: number };
}
export type Child = Node | string | null | false;

// 안쪽 여백을 크기에 포함하고(border-box), 겹쳐 놓는 자식(position: absolute)은 바로 위 상자를 기준으로 놓이게 한다
export const box = (style: Style, ...children: Child[]): Node => ({
  type: 'div',
  props: { style: { display: 'flex', boxSizing: 'border-box', position: 'relative', ...style }, children: children.filter(Boolean) as Child[] },
});
export const text = (value: string, style: Style): Node => ({ type: 'div', props: { style: { display: 'flex', wordBreak: 'keep-all', ...style }, children: value } });

function assetDir(): string {
  const candidates = [path.join(__dirname, '_assets'), path.join(process.cwd(), 'api', '_assets')];
  return candidates.find((dir) => existsSync(dir)) ?? candidates[0];
}

type Weight = 500 | 700 | 800 | 900;
let fonts: { name: string; data: Buffer; weight: Weight; style: 'normal' }[] | null = null;
function loadFonts() {
  fonts ??= ([
    ['Pretendard-Medium.otf', 500],
    ['Pretendard-Bold.otf', 700],
    ['Pretendard-ExtraBold.otf', 800],
    ['Pretendard-Black.otf', 900],
  ] as const).map(([file, weight]) => ({ name: 'Pretendard', data: readFileSync(path.join(assetDir(), 'fonts', file)), weight, style: 'normal' as const }));
  return fonts;
}

let emojiSvg: Record<string, string> | null = null;
/** 이모지 → Twemoji SVG(평면). 받아 둔 게 없으면 null */
export function emojiImage(emoji: string): string | null {
  emojiSvg ??= JSON.parse(readFileSync(path.join(assetDir(), 'emoji.json'), 'utf8')) as Record<string, string>;
  const svg = emojiSvg[emoji];
  return svg ? `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}` : null;
}

/** 3D 이모지 파일 이름 — scripts/fetch-fluent-emoji.ts 의 fluentName 과 같은 규칙 */
export const fluentName = (emoji: string) => `${[...emoji].map((c) => c.codePointAt(0)!.toString(16)).filter((c) => c !== 'fe0f').join('-')}.png`;
const fluentCache = new Map<string, string | null>();
/** 이모지 → Fluent 3D PNG. 받아 둔 게 없으면 null */
export function fluentImage(emoji: string): string | null {
  if (!fluentCache.has(emoji)) {
    const file = path.join(assetDir(), 'fluent', fluentName(emoji));
    fluentCache.set(emoji, existsSync(file) ? `data:image/png;base64,${readFileSync(file).toString('base64')}` : null);
  }
  return fluentCache.get(emoji)!;
}

/** 3D 가 있으면 3D, 없으면 평면, 둘 다 없으면 빈자리 */
export function emoji(value: string, size: number, style: Style = {}): Node | null {
  const src = fluentImage(value) ?? emojiImage(value);
  return src ? { type: 'img', props: { src, width: size, height: size, style: { width: size, height: size, ...style } } } : null;
}

/** 검은 테두리 + 딱 떨어지는 그림자 */
const sticker = (px: number, shadow: number, shadowColor = INK): Style => ({ border: `${px}px solid ${INK}`, boxShadow: `${shadow}px ${shadow}px 0 0 ${shadowColor}` });

/** 둥근 스티커 안의 3D 이모지 */
function emojiSticker(value: string, size: number, rotate = -6, bg = PAPER): Node {
  return box(
    { width: size, height: size, flexShrink: 0, borderRadius: size / 2, backgroundColor: bg, alignItems: 'center', justifyContent: 'center', transform: `rotate(${rotate}deg)`, ...sticker(Math.max(4, Math.round(size / 48)), Math.round(size / 22)) },
    emoji(value, Math.round(size * 0.74)),
  );
}

/** 카톡 말풍선 (왼쪽 아래 모서리만 뾰족) */
function bubble(value: string, fontSize: number, style: Style = {}, bg = PAPER): Node {
  return box(
    { padding: `${Math.round(fontSize * 0.62)}px ${Math.round(fontSize * 0.9)}px`, borderRadius: Math.round(fontSize * 1.1), borderBottomLeftRadius: Math.round(fontSize * 0.25), backgroundColor: bg, flexShrink: 0, ...sticker(Math.max(3, Math.round(fontSize / 9)), Math.round(fontSize / 5)), ...style },
    text(value, { fontSize, fontWeight: 700, color: INK, lineHeight: 1.35, letterSpacing: -0.5 }),
  );
}

/** 알약 모양 이름표 — 이모지를 앞에 붙일 수 있다 */
function pill(value: string, fontSize: number, bg: string, color: string, icon?: string, style: Style = {}): Node {
  return box(
    { padding: `${Math.round(fontSize * 0.42)}px ${Math.round(fontSize * 0.85)}px`, borderRadius: 999, backgroundColor: bg, alignItems: 'center', flexShrink: 0, gap: Math.round(fontSize * 0.3), ...sticker(Math.max(3, Math.round(fontSize / 10)), Math.round(fontSize / 6)), ...style },
    icon ? emoji(icon, Math.round(fontSize * 1.15)) : null,
    text(value, { fontSize, fontWeight: 800, color, letterSpacing: -0.3, whiteSpace: 'nowrap' }),
  );
}

/** 유형 이름 — 두 단어 이상이면 줄을 나눠 아주 크게 */
function nameLines(name: string): string[] {
  const words = name.split(' ');
  return words.length === 1 ? [name] : [words[0], words.slice(1).join(' ')];
}
/** 가장 긴 줄이 width 안에 들어가는 글자 크기 (한글 한 글자 ≈ 0.94em) */
const fitSize = (lines: string[], width: number, max: number) => Math.min(max, Math.floor(width / (Math.max(...lines.map((l) => l.length)) * 0.94)));

function bigName(name: string, width: number, max: number, tone: Tone, oneLine = false): Node {
  const lines = oneLine ? [name] : nameLines(name);
  const size = fitSize(lines, width, max);
  const shadow = Math.max(3, Math.round(size / 22));
  return box(
    { flexDirection: 'column', flexShrink: 0 },
    ...lines.map((line) => text(line, { fontSize: size, fontWeight: 900, color: tone.ink, letterSpacing: -size * 0.055, lineHeight: 1.04, textShadow: `${shadow}px ${shadow}px 0 ${tone.shadow}`, whiteSpace: 'nowrap' })),
  );
}

/** 결과 코드 네 글자 — 종이 타일 */
function letterTiles(result: KktiResult, size: number): Node {
  return box(
    { gap: Math.round(size * 0.14), flexShrink: 0 },
    ...codeLetters(result.code).map((letter, i) =>
      box(
        { flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: size, height: Math.round(size * 1.08), borderRadius: Math.round(size * 0.2), backgroundColor: PAPER, transform: `rotate(${[-3, 2, -2, 3][i]}deg)`, ...sticker(Math.max(3, Math.round(size / 26)), Math.round(size / 14)) },
        text(letter, { fontSize: Math.round(size * 0.56), fontWeight: 900, color: INK, lineHeight: 1.05, letterSpacing: -2 }),
        text(result.axes[i].pole.label, { fontSize: Math.round(size * 0.135), fontWeight: 700, color: MUTED, marginTop: 2 }),
      ),
    ),
  );
}

/** 배경에 크게 깔리는 유형 코드 글자 */
const ghost = (value: string, size: number, color: string, style: Style): Node =>
  box({ position: 'absolute', ...style }, text(value, { fontSize: size, fontWeight: 900, color, letterSpacing: -size * 0.06, lineHeight: 1, whiteSpace: 'nowrap' }));

interface Tone {
  ink: string;
  shadow: string;
  ghost: string;
}
/** 연애 컬러 위에서 읽히는 글자색 — 밝은 바탕엔 검정 글자 + 흰 그림자, 어두운 바탕엔 그 반대 */
function toneOn(hex: string): Tone {
  const light = readableTextOn(hex) === '#FFFFFF';
  return light ? { ink: PAPER, shadow: INK, ghost: 'rgba(255,255,255,0.10)' } : { ink: INK, shadow: PAPER, ghost: 'rgba(14,14,18,0.08)' };
}

const kktiTag = (fontSize: number): Node => box({ padding: `${Math.round(fontSize * 0.36)}px ${Math.round(fontSize * 0.76)}px`, borderRadius: 999, backgroundColor: INK, flexShrink: 0 }, text('KKTI', { fontSize, fontWeight: 900, color: PAPER, letterSpacing: 1 }));

/** 맨 위 줄 — 처음 보는 사람도 아는 「진짜 MBTI」로 결과를 먼저 말한다 */
const mbtiLine = (result: KktiResult) => `카톡 속 진짜 MBTI는 ${result.mbti.type}`;
function topBar(right: Node, tagSize: number): Node {
  return box({ justifyContent: 'space-between', alignItems: 'center', width: '100%', flexShrink: 0, gap: 16 }, kktiTag(tagSize), right);
}

/** 「너도 하면 나랑 궁합 나옴」 — 검은 알약에 흰 그림자 */
function cta(value: string, fontSize: number, style: Style = {}): Node {
  return box(
    { alignItems: 'center', flexShrink: 0, gap: Math.round(fontSize * 0.34), padding: `${Math.round(fontSize * 0.5)}px ${Math.round(fontSize * 0.9)}px`, borderRadius: 999, backgroundColor: INK, boxShadow: `${Math.round(fontSize / 4)}px ${Math.round(fontSize / 4)}px 0 0 ${PAPER}`, ...style },
    emoji('💞', Math.round(fontSize * 1.2)),
    text(value, { fontSize, fontWeight: 900, color: PAPER, whiteSpace: 'nowrap' }),
  );
}

// ───────────────────────── 혼자 결과 ─────────────────────────

function soloStory(result: KktiResult): Node {
  const tone = toneOn(result.color.hex);
  return box(
    { width: '100%', height: '100%', flexDirection: 'column', backgroundColor: result.color.hex, fontFamily: 'Pretendard', padding: '190px 72px 250px', overflow: 'hidden' },
    ghost(result.code, 330, tone.ghost, { left: -30, bottom: -50, transform: 'rotate(-6deg)' }),
    topBar(pill(mbtiLine(result), 32, PAPER, INK, '🧬'), 38),
    box({ marginTop: 60, justifyContent: 'center', flexShrink: 0 }, emojiSticker(result.type.emoji, 300, -6)),
    box({ marginTop: 50, justifyContent: 'center', flexShrink: 0 }, letterTiles(result, 140)),
    box({ marginTop: 48 }, bigName(result.type.name, 936, 180, tone)),
    box({ marginTop: 32, alignSelf: 'flex-start' }, bubble(result.type.oneLiner, 36, { maxWidth: 936 })),
    box({ marginTop: 28, gap: 16, flexWrap: 'wrap', flexShrink: 0 }, pill(result.color.name, 28, PAPER, INK, '🎨'), pill(result.enneagram.title, 28, PAPER, INK, '🔢')),
    box({ flexGrow: 1 }),
    cta('너도 하면 나랑 궁합 나옴', 38, { alignSelf: 'flex-start' }),
    text(BRAND, { marginTop: 26, fontSize: 26, fontWeight: 700, color: tone.ink, flexShrink: 0 }),
  );
}

function soloSquare(result: KktiResult): Node {
  const tone = toneOn(result.color.hex);
  return box(
    { width: '100%', height: '100%', flexDirection: 'column', backgroundColor: result.color.hex, fontFamily: 'Pretendard', padding: 64, overflow: 'hidden' },
    ghost(result.code, 330, tone.ghost, { right: -40, bottom: -70, transform: 'rotate(-8deg)' }),
    topBar(pill(mbtiLine(result), 28, PAPER, INK, '🧬'), 34),
    box({ marginTop: 40, alignItems: 'center', gap: 40, flexShrink: 0 }, emojiSticker(result.type.emoji, 210, -7), letterTiles(result, 110)),
    box({ marginTop: 36 }, bigName(result.type.name, 952, 160, tone)),
    box({ flexGrow: 1 }),
    box({ alignSelf: 'flex-start' }, bubble(result.type.oneLiner, 30, { maxWidth: 952 })),
    box({ marginTop: 28, justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }, cta('너도 하면 나랑 궁합 나옴', 28), text('KKTI 1분 테스트', { fontSize: 24, fontWeight: 800, color: tone.ink })),
  );
}

function soloOg(result: KktiResult): Node {
  const tone = toneOn(result.color.hex);
  return box(
    { width: '100%', height: '100%', backgroundColor: result.color.hex, fontFamily: 'Pretendard', padding: '44px 56px', alignItems: 'center', gap: 48, overflow: 'hidden' },
    ghost(result.code, 260, tone.ghost, { right: -30, bottom: -60, transform: 'rotate(-8deg)' }),
    box({ flexDirection: 'column', alignItems: 'center', gap: 30, flexShrink: 0 }, emojiSticker(result.type.emoji, 230, -7), letterTiles(result, 72)),
    box(
      { flexDirection: 'column', flexGrow: 1, flexShrink: 1, flexBasis: 0, gap: 18 },
      box({ gap: 12, alignItems: 'center' }, kktiTag(24), pill(mbtiLine(result), 24, PAPER, INK, '🧬')),
      bigName(result.type.name, 700, 112, tone),
      box({ alignSelf: 'flex-start' }, bubble(result.type.oneLiner, 24, { maxWidth: 700 })),
      cta('너도 하면 나랑 궁합 나옴', 26, { marginTop: 6, alignSelf: 'flex-start' }),
    ),
  );
}

// ───────────────────────── 둘의 궁합 ─────────────────────────

/** 대각선으로 반씩 두 사람의 연애 컬러 */
const pairBackground = (a: KktiResult, b: KktiResult) => `linear-gradient(135deg, ${a.color.hex} 0%, ${a.color.hex} 50%, ${b.color.hex} 50%, ${b.color.hex} 100%)`;

function person(result: KktiResult, size: number, nameSize: number, rotate: number): Node {
  return box(
    { flexDirection: 'column', alignItems: 'center', gap: Math.round(size * 0.08), width: Math.round(size * 1.6), flexShrink: 0 },
    emojiSticker(result.type.emoji, size, rotate, result.color.hex),
    text(result.type.name, { marginTop: Math.round(size * 0.06), fontSize: nameSize, fontWeight: 900, color: INK, letterSpacing: -1, textAlign: 'center', justifyContent: 'center' }),
    text(`${result.mbti.type} · ${result.code}`, { fontSize: Math.round(nameSize * 0.72), fontWeight: 700, color: MUTED }),
  );
}

function percent(value: number, size: number): Node {
  const shadow = Math.round(size / 24);
  return box(
    { alignItems: 'flex-end', flexShrink: 0 },
    text(String(value), { fontSize: size, fontWeight: 900, color: INK, letterSpacing: -size * 0.06, lineHeight: 1, textShadow: `${shadow}px ${shadow}px 0 ${PINK}` }),
    text('%', { fontSize: Math.round(size * 0.44), fontWeight: 900, color: INK, marginBottom: Math.round(size * 0.1), marginLeft: 4 }),
  );
}

function matchRows(a: KktiResult, b: KktiResult, width: number): Node {
  const match = kktiMatch(a, b);
  return box(
    { flexDirection: 'column', width, gap: 14, flexShrink: 0 },
    ...match.axes.map((axis) =>
      box(
        { alignItems: 'center', gap: 18, padding: '12px 22px', borderRadius: 26, backgroundColor: PAPER, border: `3px solid ${INK}` },
        emoji(axis.emoji, 48),
        box(
          { flexDirection: 'column', flexGrow: 1, flexShrink: 1, flexBasis: 0, gap: 6 },
          box(
            { alignItems: 'center', gap: 12 },
            text(axis.label, { fontSize: 28, fontWeight: 900, color: INK }),
            box({ padding: '3px 14px', borderRadius: 999, backgroundColor: FIT_BG[axis.fit], border: `2px solid ${INK}` }, text(KKTI_FIT_LABEL[axis.fit], { fontSize: 20, fontWeight: 800, color: INK })),
          ),
          text(axis.line, { fontSize: 24, fontWeight: 700, color: MUTED, lineHeight: 1.35 }),
        ),
      ),
    ),
  );
}

/** 흰 종이 판 (검은 테두리 + 그림자) */
const paperCard = (style: Style, ...children: Child[]): Node =>
  box({ flexDirection: 'column', alignItems: 'center', backgroundColor: PAPER, ...sticker(6, 16), ...style }, ...children);

function pairStory(a: KktiResult, b: KktiResult): Node {
  const match = kktiMatch(a, b);
  return box(
    { width: '100%', height: '100%', flexDirection: 'column', backgroundImage: pairBackground(a, b), fontFamily: 'Pretendard', padding: '180px 56px 236px' },
    paperCard(
      { width: '100%', flexGrow: 1, borderRadius: 56, padding: '44px 44px 40px' },
      topBar(pill('카톡 MBTI 궁합', 30, PAPER, INK, '💬'), 34),
      box({ marginTop: 26, alignItems: 'flex-start', justifyContent: 'center', gap: 6, flexShrink: 0 }, person(a, 176, 32, -7), text('×', { fontSize: 72, fontWeight: 900, color: INK, marginTop: 50 }), person(b, 176, 32, 7)),
      box({ marginTop: 6 }, percent(match.percent, 210)),
      pill(match.tier.label, 46, INK, PAPER, match.tier.emoji, { marginTop: 8 }),
      box({ marginTop: 22 }, bubble(match.tier.line, 30)),
      box({ marginTop: 26 }, matchRows(a, b, 880)),
      box({ flexGrow: 1 }),
      text('너도 1분 테스트 하고 나랑 궁합 보기', { marginTop: 20, flexShrink: 0, fontSize: 32, fontWeight: 900, color: INK }),
      text(BRAND, { marginTop: 8, flexShrink: 0, fontSize: 24, fontWeight: 700, color: MUTED }),
    ),
  );
}

function pairSquare(a: KktiResult, b: KktiResult): Node {
  const match = kktiMatch(a, b);
  return box(
    { width: '100%', height: '100%', flexDirection: 'column', backgroundImage: pairBackground(a, b), fontFamily: 'Pretendard', padding: 52 },
    paperCard(
      { width: '100%', height: '100%', justifyContent: 'center', borderRadius: 52, padding: '36px 40px' },
      topBar(pill('카톡 MBTI 궁합', 26, PAPER, INK, '💬'), 30),
      box({ marginTop: 20, alignItems: 'flex-start', justifyContent: 'center', gap: 4, flexShrink: 0 }, person(a, 170, 30, -7), text('×', { fontSize: 64, fontWeight: 900, color: INK, marginTop: 50 }), person(b, 170, 30, 7)),
      percent(match.percent, 200),
      pill(match.tier.label, 42, INK, PAPER, match.tier.emoji, { marginTop: 4 }),
      box({ marginTop: 20 }, bubble(match.tier.line, 26)),
      text('너도 1분 테스트 하고 나랑 궁합 보기', { marginTop: 22, flexShrink: 0, fontSize: 26, fontWeight: 900, color: INK }),
    ),
  );
}

function pairOg(a: KktiResult, b: KktiResult): Node {
  const match = kktiMatch(a, b);
  return box(
    { width: '100%', height: '100%', backgroundImage: pairBackground(a, b), fontFamily: 'Pretendard', padding: 36 },
    paperCard(
      { flexDirection: 'row', justifyContent: 'space-between', width: '100%', height: '100%', borderRadius: 44, padding: '26px 30px' },
      person(a, 168, 30, -7),
      box(
        { flexDirection: 'column', alignItems: 'center', flexGrow: 1 },
        box({ gap: 10, alignItems: 'center' }, kktiTag(22), pill('카톡 MBTI 궁합', 22, PAPER, INK, '💬')),
        box({ marginTop: 6 }, percent(match.percent, 190)),
        pill(match.tier.label, 34, INK, PAPER, match.tier.emoji),
        text('너도 테스트 하고 나랑 궁합 보기', { marginTop: 22, fontSize: 24, fontWeight: 900, color: INK }),
      ),
      person(b, 168, 30, 7),
    ),
  );
}

// ───────────────────────── 결과가 없을 때 (테스트 소개) ─────────────────────────

/** 캐러셀 표지와 같은 그림 — 검은 바탕에 연두 KKTI, 카톡 말풍선과 동물 스티커 */
function intro(shape: KktiCardShape): Node {
  const wide = shape === 'og';
  const k = shape === 'story' ? 1.25 : 1;
  const px = (n: number) => Math.round(n * k);
  const deco: [Style, Node][] = wide
    ? [
        [{ right: 330, top: 58, transform: 'rotate(-8deg)' }, bubble('뭐해?', 34)],
        [{ right: 60, top: 96, transform: 'rotate(6deg)' }, bubble('ㅋㅋㅋㅋㅋㅋ', 34, {}, LIME)],
        [{ right: 90, bottom: 70, transform: 'rotate(-5deg)' }, bubble('자니…?', 34, {}, LILAC)],
        [{ right: 210, top: 250 }, emojiSticker('🦊', 150, -10, SKY)],
        [{ right: 360, bottom: 64 }, emojiSticker('🐹', 120, 8, SUN)],
      ]
    : [
        [{ left: px(60), top: px(shape === 'story' ? 240 : 70), transform: 'rotate(-8deg)' }, bubble('뭐해?', px(40))],
        [{ right: px(60), top: px(shape === 'story' ? 330 : 120), transform: 'rotate(6deg)' }, bubble('ㅋㅋㅋㅋㅋㅋ', px(40), {}, LIME)],
        [{ right: px(110), bottom: px(shape === 'story' ? 330 : 110), transform: 'rotate(-5deg)' }, bubble('자니…?', px(40), {}, LILAC)],
        [{ left: px(70), bottom: px(shape === 'story' ? 360 : 120) }, emojiSticker('🦊', px(150), -10, SKY)],
        [{ left: px(250), bottom: px(shape === 'story' ? 300 : 70) }, emojiSticker('🐹', px(120), 8, SUN)],
      ];
  const big = wide ? 230 : px(300);
  return box(
    { width: '100%', height: '100%', flexDirection: 'column', justifyContent: 'center', backgroundColor: INK, fontFamily: 'Pretendard', padding: wide ? '0 70px' : shape === 'story' ? '220px 80px 280px' : 70, overflow: 'hidden' },
    ...deco.map(([style, node]) => box({ position: 'absolute', ...style }, node)),
    text('KKTI', { fontSize: big, fontWeight: 900, color: LIME, letterSpacing: -Math.round(big * 0.06), lineHeight: 0.95, textShadow: `${Math.round(big / 30)}px ${Math.round(big / 30)}px 0 ${PINK}` }),
    text('카톡으로 보는', { marginTop: px(20), fontSize: wide ? 54 : px(64), fontWeight: 900, color: PAPER, letterSpacing: -2 }),
    text('진짜 연애 MBTI', { fontSize: wide ? 54 : px(64), fontWeight: 900, color: PAPER, letterSpacing: -2 }),
    box({ marginTop: px(30), alignSelf: 'flex-start' }, pill('1분 · 12문항 · 친구랑 궁합까지 →', wide ? 28 : px(34), PINK, PAPER)),
  );
}

// ───────────────────────── 내보내기 ─────────────────────────

/** 그림의 뼈대 (어떤 요소가 들어가는지 테스트에서 본다) */
export function cardTree(shape: KktiCardShape, a: KktiResult | null, w: KktiResult | null = null): Node {
  if (!a) return intro(shape);
  if (w) return shape === 'story' ? pairStory(a, w) : shape === 'square' ? pairSquare(a, w) : pairOg(a, w);
  return shape === 'story' ? soloStory(a) : shape === 'square' ? soloSquare(a) : soloOg(a);
}

/** 뼈대를 PNG 로 */
export async function renderTree(tree: Node, width: number, height: number): Promise<Buffer> {
  const svg = await satori(tree as unknown as Parameters<typeof satori>[0], {
    width,
    height,
    fonts: loadFonts(),
    // 글 안에 섞인 이모지는 받아 둔 그림으로 (3D → 평면 → 빈 그림)
    loadAdditionalAsset: async (code, segment) => (code === 'emoji' ? (fluentImage(segment) ?? emojiImage(segment) ?? '') : ''),
  });
  return Buffer.from(new Resvg(svg, { fitTo: { mode: 'width', value: width } }).render().asPng());
}

export function renderCard(shape: KktiCardShape, a: KktiResult | null, w: KktiResult | null = null): Promise<Buffer> {
  const { width, height } = CARD_SIZE[shape];
  return renderTree(cardTree(shape, a, w), width, height);
}
