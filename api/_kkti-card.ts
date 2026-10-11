/**
 * KKTI 결과 카드 그림 (PNG) 만들기 — 링크 미리보기(og)·인스타 스토리(story)·피드(square).
 * 혼자 결과면 그 사람의 연애 컬러로 물든 유형 카드, 둘이면 궁합 카드가 나온다.
 *
 * - 그림에는 유형·색·궁합처럼 답 코드에서 계산되는 것만 들어간다 (이름·대화 같은 개인정보 없음).
 * - 글꼴(Pretendard, OFL)과 이모지 그림(Twemoji, CC-BY 4.0)은 api/_assets 에 넣어 두고 읽는다 — 그릴 때 외부로 나가지 않는다.
 *   유형 이모지를 바꾸면 `npx tsx scripts/make-kkti-emoji.ts` 로 이모지 그림을 다시 받아야 한다 (테스트가 빠진 이모지를 잡는다).
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { Resvg } from '@resvg/resvg-js';
import satori from 'satori';

import { KKTI_FIT_LABEL, codeLetters, hexToRgba, kktiMatch, mixHex, readableTextOn, type KktiCardShape, type KktiFit, type KktiResult } from '../src/lib/kkti';

export const CARD_SIZE: Record<KktiCardShape, { width: number; height: number }> = {
  og: { width: 1200, height: 630 },
  story: { width: 1080, height: 1920 },
  square: { width: 1080, height: 1080 },
};

/** 카드에 쓰는 이모지 가운데 유형·궁합 등급에 없는 것 (이모지 그림을 받을 때 함께 받는다) */
export const CARD_EXTRA_EMOJI = ['💬', '💞', '🎨', '🧬', '🔢', '📲', '⚡', '🎉', '🚀', '👀', '✨'];

const INK = '#191F28';
const INK_SOFT = '#4E5968';
const INK_FAINT = '#8B95A1';
const WHITE = '#FFFFFF';
const BRAND = 'KKTI · 카톡으로 보는 진짜 연애 MBTI';
const FIT_COLOR: Record<KktiFit, string> = { good: '#12B886', ok: '#F59F00', care: '#F06595' };

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

let fonts: { name: string; data: Buffer; weight: 500 | 700; style: 'normal' }[] | null = null;
function loadFonts() {
  fonts ??= ([
    ['Pretendard-Medium.otf', 500],
    ['Pretendard-Bold.otf', 700],
  ] as const).map(([file, weight]) => ({ name: 'Pretendard', data: readFileSync(path.join(assetDir(), 'fonts', file)), weight, style: 'normal' as const }));
  return fonts;
}

let emojiSvg: Record<string, string> | null = null;
/** 이모지 → Twemoji SVG. 받아 둔 게 없으면 null (그 자리는 비어 보인다) */
export function emojiImage(emoji: string): string | null {
  emojiSvg ??= JSON.parse(readFileSync(path.join(assetDir(), 'emoji.json'), 'utf8')) as Record<string, string>;
  const svg = emojiSvg[emoji];
  return svg ? `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}` : null;
}

export function emoji(value: string, size: number): Node | null {
  const src = emojiImage(value);
  return src ? { type: 'img', props: { src, width: size, height: size, style: { width: size, height: size } } } : null;
}

/** 색 위에 얹는 은은한 빛 (위는 밝게, 아래는 살짝 어둡게) */
export const sheen = (): Node =>
  box({
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundImage: 'linear-gradient(160deg, rgba(255,255,255,0.34) 0%, rgba(255,255,255,0) 45%, rgba(0,0,0,0.12) 100%)',
  });

export interface Tone {
  ink: string;
  soft: string;
  glass: string;
}
export function toneOn(hex: string): Tone {
  const ink = readableTextOn(hex);
  const light = ink === WHITE;
  return { ink, soft: light ? 'rgba(255,255,255,0.88)' : 'rgba(25,31,40,0.74)', glass: light ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.5)' };
}

// ───────────────────────── 혼자 결과 ─────────────────────────

export function letterTiles(result: KktiResult, tone: Tone, size: number): Node {
  return box(
    { gap: Math.round(size * 0.1) },
    ...codeLetters(result.code).map((letter, i) =>
      box(
        { flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: size, height: Math.round(size * 1.12), borderRadius: Math.round(size * 0.22), backgroundColor: tone.glass },
        text(letter, { fontSize: Math.round(size * 0.56), fontWeight: 700, color: tone.ink, lineHeight: 1.1 }),
        text(result.axes[i].pole.label, { fontSize: Math.round(size * 0.135), fontWeight: 500, color: tone.soft, marginTop: Math.round(size * 0.04) }),
      ),
    ),
  );
}

function chips(result: KktiResult, tone: Tone, fontSize: number): Node {
  const items: [string, string][] = [
    ['🎨', result.color.name],
    ['🧬', result.mbti.type],
    ['🔢', result.enneagram.title],
  ];
  return box(
    { flexWrap: 'wrap', justifyContent: 'center', gap: Math.round(fontSize * 0.4) },
    ...items.map(([icon, label]) =>
      box(
        { alignItems: 'center', gap: Math.round(fontSize * 0.3), padding: `${Math.round(fontSize * 0.34)}px ${Math.round(fontSize * 0.7)}px`, borderRadius: 999, backgroundColor: tone.glass },
        emoji(icon, Math.round(fontSize * 1.05)),
        text(label, { fontSize, fontWeight: 700, color: tone.ink }),
      ),
    ),
  );
}

function axisBars(result: KktiResult, tone: Tone, width: number): Node {
  return box(
    { flexDirection: 'column', width, gap: 22 },
    ...result.axes.map((axis) => {
      const plusSide = axis.pole.letter === axis.plus.letter;
      return box(
        { flexDirection: 'column', gap: 10 },
        box(
          { justifyContent: 'space-between' },
          text(`${axis.plus.letter} ${axis.plus.label}`, { fontSize: 30, fontWeight: plusSide ? 700 : 500, color: plusSide ? tone.ink : tone.soft }),
          text(`${axis.minus.label} ${axis.minus.letter}`, { fontSize: 30, fontWeight: plusSide ? 500 : 700, color: plusSide ? tone.soft : tone.ink }),
        ),
        box(
          { height: 22, borderRadius: 11, backgroundColor: tone.glass, justifyContent: plusSide ? 'flex-start' : 'flex-end' },
          box({ width: `${axis.percent}%`, height: 22, borderRadius: 11, backgroundColor: tone.ink }),
        ),
      );
    }),
  );
}

function soloStory(result: KktiResult): Node {
  const tone = toneOn(result.color.hex);
  return box(
    { width: '100%', height: '100%', flexDirection: 'column', alignItems: 'center', backgroundColor: result.color.hex, fontFamily: 'Pretendard', padding: '170px 90px 190px' },
    sheen(),
    box({ padding: '14px 34px', borderRadius: 999, backgroundColor: tone.glass }, text('나의 KKTI 연애 유형', { fontSize: 34, fontWeight: 700, color: tone.ink })),
    box({ marginTop: 40, width: 250, height: 250, flexShrink: 0, borderRadius: 125, backgroundColor: tone.glass, alignItems: 'center', justifyContent: 'center' }, emoji(result.type.emoji, 144)),
    box({ marginTop: 40, flexShrink: 0 }, letterTiles(result, tone, 172)),
    text(result.type.name, { marginTop: 36, flexShrink: 0, fontSize: result.type.name.length > 7 ? 88 : 104, fontWeight: 700, color: tone.ink, letterSpacing: -2 }),
    text(result.type.oneLiner, { marginTop: 14, fontSize: 38, fontWeight: 500, color: tone.soft, textAlign: 'center', justifyContent: 'center', lineHeight: 1.4, maxWidth: 860 }),
    box({ marginTop: 36, flexShrink: 0 }, chips(result, tone, 32)),
    box({ marginTop: 48, flexShrink: 0 }, axisBars(result, tone, 860)),
    box({ flexGrow: 1 }),
    box(
      { alignItems: 'center', gap: 14, flexShrink: 0, padding: '22px 44px', borderRadius: 999, backgroundColor: tone.ink },
      emoji('💞', 44),
      text('너도 하면 나랑 궁합이 나와', { fontSize: 38, fontWeight: 700, color: tone.ink === WHITE ? INK : WHITE }),
    ),
    text(BRAND, { marginTop: 24, fontSize: 28, fontWeight: 500, color: tone.soft }),
  );
}

function soloSquare(result: KktiResult): Node {
  const tone = toneOn(result.color.hex);
  return box(
    { width: '100%', height: '100%', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: result.color.hex, fontFamily: 'Pretendard', padding: 70 },
    sheen(),
    box({ padding: '12px 30px', borderRadius: 999, backgroundColor: tone.glass }, text('나의 KKTI 연애 유형', { fontSize: 30, fontWeight: 700, color: tone.ink })),
    box({ marginTop: 30, width: 210, height: 210, borderRadius: 105, backgroundColor: tone.glass, alignItems: 'center', justifyContent: 'center' }, emoji(result.type.emoji, 120)),
    box({ marginTop: 30 }, letterTiles(result, tone, 150)),
    text(result.type.name, { marginTop: 30, fontSize: result.type.name.length > 7 ? 76 : 90, fontWeight: 700, color: tone.ink, letterSpacing: -2 }),
    text(result.type.oneLiner, { marginTop: 10, fontSize: 32, fontWeight: 500, color: tone.soft, textAlign: 'center', justifyContent: 'center', lineHeight: 1.4, maxWidth: 880 }),
    box({ marginTop: 30 }, chips(result, tone, 28)),
    text(BRAND, { marginTop: 34, fontSize: 26, fontWeight: 500, color: tone.soft }),
  );
}

function soloOg(result: KktiResult): Node {
  const tone = toneOn(result.color.hex);
  return box(
    { width: '100%', height: '100%', backgroundColor: result.color.hex, fontFamily: 'Pretendard', padding: '54px 64px', alignItems: 'center', gap: 56 },
    sheen(),
    box(
      { flexDirection: 'column', alignItems: 'center', gap: 26 },
      box({ width: 230, height: 230, borderRadius: 115, backgroundColor: tone.glass, alignItems: 'center', justifyContent: 'center' }, emoji(result.type.emoji, 132)),
      letterTiles(result, tone, 78),
    ),
    box(
      { flexDirection: 'column', flexGrow: 1, flexShrink: 1, flexBasis: 0, gap: 14 },
      text('나의 KKTI 연애 유형', { fontSize: 30, fontWeight: 700, color: tone.soft }),
      text(result.type.name, { fontSize: result.type.name.length > 7 ? 78 : 92, fontWeight: 700, color: tone.ink, letterSpacing: -2, lineHeight: 1.12 }),
      text(result.type.oneLiner, { fontSize: 32, fontWeight: 500, color: tone.soft, lineHeight: 1.38 }),
      box(
        { marginTop: 14, alignSelf: 'flex-start', alignItems: 'center', gap: 12, padding: '16px 30px', borderRadius: 999, backgroundColor: tone.ink },
        emoji('💞', 34),
        text('너도 하면 나랑 궁합이 나와', { fontSize: 30, fontWeight: 700, color: tone.ink === WHITE ? INK : WHITE }),
      ),
    ),
  );
}

// ───────────────────────── 둘의 궁합 ─────────────────────────

function person(result: KktiResult, circle: number, nameSize: number): Node {
  return box(
    { flexDirection: 'column', alignItems: 'center', gap: Math.round(circle * 0.1), width: Math.round(circle * 1.7) },
    box(
      { width: circle, height: circle, flexShrink: 0, borderRadius: circle / 2, backgroundColor: mixHex(result.color.hex, WHITE, 0.45), alignItems: 'center', justifyContent: 'center', border: `${Math.max(5, Math.round(circle * 0.04))}px solid ${result.color.hex}` },
      emoji(result.type.emoji, Math.round(circle * 0.56)),
    ),
    text(result.type.name, { fontSize: nameSize, fontWeight: 700, color: INK, textAlign: 'center', justifyContent: 'center' }),
    text(result.code, { fontSize: Math.round(nameSize * 0.7), fontWeight: 500, color: INK_FAINT }),
  );
}

const pairBackground = (a: KktiResult, b: KktiResult) => `linear-gradient(140deg, ${a.color.hex} 0%, ${mixHex(a.color.hex, b.color.hex, 0.5)} 50%, ${b.color.hex} 100%)`;

function matchRows(a: KktiResult, b: KktiResult, width: number): Node {
  const match = kktiMatch(a, b);
  return box(
    { flexDirection: 'column', width, gap: 16 },
    ...match.axes.map((axis) =>
      box(
        { alignItems: 'center', gap: 22, padding: '18px 26px', borderRadius: 30, backgroundColor: '#F4F6F8' },
        emoji(axis.emoji, 46),
        box(
          { flexDirection: 'column', flexGrow: 1, flexShrink: 1, flexBasis: 0, gap: 6 },
          box(
            { alignItems: 'center', gap: 12 },
            text(axis.label, { fontSize: 30, fontWeight: 700, color: INK }),
            box({ padding: '4px 16px', borderRadius: 999, backgroundColor: hexToRgba(FIT_COLOR[axis.fit], 0.16) }, text(KKTI_FIT_LABEL[axis.fit], { fontSize: 22, fontWeight: 700, color: FIT_COLOR[axis.fit] })),
          ),
          text(axis.line, { fontSize: 26, fontWeight: 500, color: INK_SOFT, lineHeight: 1.36 }),
        ),
      ),
    ),
  );
}

function pairStory(a: KktiResult, b: KktiResult): Node {
  const match = kktiMatch(a, b);
  return box(
    { width: '100%', height: '100%', flexDirection: 'column', alignItems: 'center', backgroundImage: pairBackground(a, b), fontFamily: 'Pretendard', padding: '180px 60px 200px' },
    box(
      { flexDirection: 'column', alignItems: 'center', width: '100%', flexGrow: 1, borderRadius: 64, backgroundColor: WHITE, padding: '54px 50px 46px' },
      box({ alignItems: 'center', gap: 12, padding: '12px 30px', borderRadius: 999, backgroundColor: '#F4F6F8' }, emoji('💬', 34), text('KKTI 카톡 궁합', { fontSize: 32, fontWeight: 700, color: INK })),
      box({ marginTop: 34, flexShrink: 0, alignItems: 'flex-start', justifyContent: 'center' }, person(a, 180, 36), text('×', { fontSize: 60, fontWeight: 500, color: INK_FAINT, marginTop: 52 }), person(b, 180, 36)),
      box(
        { marginTop: 18, flexShrink: 0, alignItems: 'flex-end' },
        text(String(match.percent), { fontSize: 200, fontWeight: 700, color: INK, letterSpacing: -7, lineHeight: 1 }),
        text('%', { fontSize: 84, fontWeight: 700, color: INK, marginBottom: 24, marginLeft: 6 }),
      ),
      box({ marginTop: 6, flexShrink: 0, alignItems: 'center', gap: 14, padding: '14px 36px', borderRadius: 999, backgroundColor: INK }, emoji(match.tier.emoji, 44), text(match.tier.label, { fontSize: 44, fontWeight: 700, color: WHITE })),
      text(match.tier.line, { marginTop: 18, flexShrink: 0, fontSize: 32, fontWeight: 500, color: INK_SOFT, textAlign: 'center', justifyContent: 'center' }),
      box({ marginTop: 28, flexShrink: 0 }, matchRows(a, b, 860)),
      box({ flexGrow: 1 }),
      text('너도 1분 테스트 하고 나랑 궁합 보기', { flexShrink: 0, fontSize: 32, fontWeight: 700, color: INK }),
      text(BRAND, { marginTop: 8, flexShrink: 0, fontSize: 26, fontWeight: 500, color: INK_FAINT }),
    ),
  );
}

function pairSquare(a: KktiResult, b: KktiResult): Node {
  const match = kktiMatch(a, b);
  return box(
    { width: '100%', height: '100%', backgroundImage: pairBackground(a, b), fontFamily: 'Pretendard', padding: 56 },
    box(
      { flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%', borderRadius: 60, backgroundColor: WHITE, padding: 44 },
      box({ alignItems: 'center', gap: 12, padding: '12px 30px', borderRadius: 999, backgroundColor: '#F4F6F8' }, emoji('💬', 32), text('KKTI 카톡 궁합', { fontSize: 30, fontWeight: 700, color: INK })),
      box({ marginTop: 34, alignItems: 'flex-start', justifyContent: 'center' }, person(a, 190, 34), text('×', { fontSize: 60, fontWeight: 500, color: INK_FAINT, marginTop: 56 }), person(b, 190, 34)),
      box(
        { marginTop: 18, alignItems: 'flex-end' },
        text(String(match.percent), { fontSize: 210, fontWeight: 700, color: INK, letterSpacing: -8, lineHeight: 1 }),
        text('%', { fontSize: 88, fontWeight: 700, color: INK, marginBottom: 26, marginLeft: 6 }),
      ),
      box({ marginTop: 6, alignItems: 'center', gap: 14, padding: '14px 34px', borderRadius: 999, backgroundColor: INK }, emoji(match.tier.emoji, 40), text(match.tier.label, { fontSize: 40, fontWeight: 700, color: WHITE })),
      text(match.tier.line, { marginTop: 20, fontSize: 30, fontWeight: 500, color: INK_SOFT, textAlign: 'center', justifyContent: 'center' }),
      text(BRAND, { marginTop: 26, fontSize: 24, fontWeight: 500, color: INK_FAINT }),
    ),
  );
}

function pairOg(a: KktiResult, b: KktiResult): Node {
  const match = kktiMatch(a, b);
  return box(
    { width: '100%', height: '100%', backgroundImage: pairBackground(a, b), fontFamily: 'Pretendard', padding: 40 },
    box(
      { alignItems: 'center', justifyContent: 'space-between', width: '100%', height: '100%', borderRadius: 48, backgroundColor: WHITE, padding: '30px 36px' },
      person(a, 170, 32),
      box(
        { flexDirection: 'column', alignItems: 'center', flexGrow: 1 },
        text('KKTI 카톡 궁합', { fontSize: 28, fontWeight: 700, color: INK_FAINT }),
        box(
          { alignItems: 'flex-end' },
          text(String(match.percent), { fontSize: 190, fontWeight: 700, color: INK, letterSpacing: -6, lineHeight: 1.05 }),
          text('%', { fontSize: 80, fontWeight: 700, color: INK, marginBottom: 26, marginLeft: 4 }),
        ),
        box({ alignItems: 'center', gap: 12, padding: '12px 30px', borderRadius: 999, backgroundColor: INK }, emoji(match.tier.emoji, 36), text(match.tier.label, { fontSize: 36, fontWeight: 700, color: WHITE })),
        text('너도 테스트 하고 나랑 궁합 보기', { marginTop: 22, fontSize: 26, fontWeight: 700, color: INK_SOFT }),
      ),
      person(b, 170, 32),
    ),
  );
}

// ───────────────────────── 결과가 없을 때 (테스트 소개) ─────────────────────────

const INTRO_BACKGROUND = 'linear-gradient(135deg, #FFD9E4 0%, #E6DEFF 50%, #D6ECFF 100%)';

function intro(shape: KktiCardShape): Node {
  const tall = shape !== 'og';
  const scale = shape === 'story' ? 1.25 : shape === 'square' ? 1.1 : 1;
  const px = (n: number) => Math.round(n * scale);
  return box(
    { width: '100%', height: '100%', flexDirection: tall ? 'column' : 'row', alignItems: 'center', justifyContent: 'center', gap: px(tall ? 36 : 60), backgroundImage: INTRO_BACKGROUND, fontFamily: 'Pretendard', padding: px(70) },
    box({ width: px(230), height: px(230), borderRadius: px(115), backgroundImage: 'linear-gradient(135deg, #FF7EA5 0%, #9B8CFF 100%)', alignItems: 'center', justifyContent: 'center' }, emoji('💬', px(124))),
    box(
      { flexDirection: 'column', alignItems: tall ? 'center' : 'flex-start', gap: px(12) },
      text('KKTI', { fontSize: px(150), fontWeight: 700, color: INK, letterSpacing: -4, lineHeight: 1 }),
      text('카톡으로 보는 진짜 연애 MBTI', { fontSize: px(46), fontWeight: 700, color: INK }),
      text('1분 · 12문항 · 친구랑 궁합까지', { fontSize: px(32), fontWeight: 500, color: INK_SOFT }),
    ),
  );
}

// ───────────────────────── 내보내기 ─────────────────────────

/** 그림의 뼈대 (어떤 요소가 들어가는지 테스트에서 본다) */
export function cardTree(shape: KktiCardShape, a: KktiResult | null, w: KktiResult | null = null): Node {
  if (!a) return intro(shape);
  if (w) return shape === 'story' ? pairStory(a, w) : shape === 'square' ? pairSquare(a, w) : pairOg(a, w);
  return shape === 'story' ? soloStory(a) : shape === 'square' ? soloSquare(a) : soloOg(a);
}

/** 뼈대를 PNG 로 (게시용 그림을 만드는 scripts/make-channel-assets.ts 도 이걸 쓴다) */
export async function renderTree(tree: Node, width: number, height: number): Promise<Buffer> {
  const svg = await satori(tree as unknown as Parameters<typeof satori>[0], {
    width,
    height,
    fonts: loadFonts(),
    // 글 안에 섞인 이모지는 받아 둔 그림으로 (없으면 빈 그림)
    loadAdditionalAsset: async (code, segment) => (code === 'emoji' ? (emojiImage(segment) ?? '') : ''),
  });
  return Buffer.from(new Resvg(svg, { fitTo: { mode: 'width', value: width } }).render().asPng());
}

export function renderCard(shape: KktiCardShape, a: KktiResult | null, w: KktiResult | null = null): Promise<Buffer> {
  const { width, height } = CARD_SIZE[shape];
  return renderTree(cardTree(shape, a, w), width, height);
}
