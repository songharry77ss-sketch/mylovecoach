/**
 * KKTI 결과 카드 그림 (PNG) 만들기 — 링크 미리보기(og)·인스타 스토리(story)·피드(square).
 * 혼자 결과면 그 사람의 연애 컬러로 물든 유형 카드, 둘이면 궁합 카드가 나온다.
 *
 * - 그림에는 유형·색·궁합처럼 답 코드에서 계산되는 것만 들어간다 (이름·대화 같은 개인정보 없음).
 * - 글꼴(Pretendard, OFL)과 이모지 그림(Twemoji, CC-BY 4.0)은 api/_assets 에 넣어 두고 읽는다 — 그릴 때 외부로 나가지 않는다.
 *   유형 이모지를 바꾸면 `npx tsx scripts/make-kkti-emoji.ts` 로 이모지 그림을 다시 받아야 한다 (테스트가 빠진 이모지를 잡는다).
 * - 언어: 한국어(기본)와 영어 두 가지 (l=en). 한국어가 아닌 사람이 보낸 링크는 모두 영어 카드 — Pretendard 는 한글·라틴 글꼴이라
 *   일본어·아랍어 같은 글자는 그리지 못한다. 영어 문구는 src/lib/kkti-en-text.ts (앱 화면과 같은 문구), 카드에만 쓰는 짧은 영어는 아래 CARD_COPY.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { Resvg } from '@resvg/resvg-js';
import satori from 'satori';

import {
  KKTI_FIT_LABEL,
  codeLetters,
  hexToRgba,
  kktiMatch,
  mixHex,
  readableTextOn,
  type KktiAxisResult,
  type KktiCardShape,
  type KktiFit,
  type KktiMatch,
  type KktiResult,
} from '../src/lib/kkti';
import { KKTI_AXES_EN, KKTI_COLORS_EN, KKTI_TYPES_EN, kktiEnglishCode, kktiEnneagramTitleEn, kktiMatchEn } from '../src/lib/kkti-en-text';

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
/** 궁합 축 표시 — 맞춰 가요(care)는 분홍 대신 센딧 보라 */
const FIT_COLOR: Record<KktiFit, string> = { good: '#12B886', ok: '#F59F00', care: '#7559F6' };

// ───────────────────────── 카드 문구 (언어별) ─────────────────────────

/** 카드 그림의 언어 — 한국어가 아니면 모두 영어 (src/lib/kkti-en-text.ts 의 kktiCardLang) */
export type CardLang = 'ko' | 'en';

/** 카드에 들어가는 글 — 한국어는 kkti.ts 값 그대로, 영어는 kkti-en-text.ts 값 (빠진 칸은 한국어로 둔다) */
interface CardCopy {
  latin: boolean;
  brand: string;
  mbtiPill: (mbti: string) => string;
  /** 혼자 카드의 아래 버튼 */
  cta: string;
  ogFoot: (code: string) => string;
  pairHead: string;
  pairCtaLong: string;
  pairCtaShort: string;
  introTitle: string;
  introLine: string;
  introMeta: string;
  code: (r: KktiResult) => string;
  name: (r: KktiResult) => string;
  oneLiner: (r: KktiResult) => string;
  colorName: (r: KktiResult) => string;
  enneagram: (r: KktiResult) => string;
  pole: (axis: KktiAxisResult, side: 'plus' | 'minus' | 'pole') => { letter: string; label: string };
  match: (m: KktiMatch) => { tier: { label: string; line: string }; axes: { label: string; fitLabel: string; line: string }[] };
}

const KO_COPY: CardCopy = {
  latin: false,
  brand: 'KKTI · 카톡으로 보는 진짜 연애 MBTI',
  mbtiPill: (mbti) => `카톡 속 진짜 MBTI는 ${mbti}`,
  cta: '너도 하면 나랑 궁합이 나와',
  ogFoot: (code) => `KKTI ${code} · 1분 · 12문항`,
  pairHead: 'KKTI · 카톡 MBTI 궁합',
  pairCtaLong: '너도 1분 테스트 하고 나랑 궁합 보기',
  pairCtaShort: '너도 테스트 하고 나랑 궁합 보기',
  introTitle: 'KKTI',
  introLine: '카톡으로 보는 진짜 연애 MBTI',
  introMeta: '1분 · 12문항 · 친구랑 궁합까지',
  code: (r) => r.code,
  name: (r) => r.type.name,
  oneLiner: (r) => r.type.oneLiner,
  colorName: (r) => r.color.name,
  enneagram: (r) => r.enneagram.title,
  pole: (axis, side) => {
    const p = side === 'pole' ? axis.pole : axis[side];
    return { letter: p.letter, label: p.label };
  },
  match: (m) => ({ tier: { label: m.tier.label, line: m.tier.line }, axes: m.axes.map((a) => ({ label: a.label, fitLabel: KKTI_FIT_LABEL[a.fit], line: a.line })) }),
};

const EN_COPY: CardCopy = {
  latin: true,
  brand: 'Texting Type Test · What your texts say about you',
  mbtiPill: (mbti) => `My texting MBTI is ${mbti}`,
  cta: 'Take it & see your match',
  ogFoot: (code) => `Texting Type ${code} · 1 min · 12 questions`,
  pairHead: 'Texting Type Test · Our match',
  pairCtaLong: 'Take the 1-min test & see your match with me',
  pairCtaShort: 'Take it & see your match',
  introTitle: 'Texting Type Test',
  introLine: 'Your real dating MBTI, from how you text',
  introMeta: '1 min · 12 questions · Match with friends',
  code: (r) => kktiEnglishCode(r.code),
  name: (r) => KKTI_TYPES_EN[r.code]?.name ?? r.type.name,
  oneLiner: (r) => KKTI_TYPES_EN[r.code]?.oneLiner ?? r.type.oneLiner,
  colorName: (r) => KKTI_COLORS_EN[r.color.namedHex]?.name ?? r.color.name,
  enneagram: (r) => kktiEnneagramTitleEn(r.enneagram.number) ?? r.enneagram.title,
  pole: (axis, side) => {
    const en = KKTI_AXES_EN[axis.key];
    const which = side === 'pole' ? (axis.pole.letter === axis.plus.letter ? 'plus' : 'minus') : side;
    return en ? { letter: en[which].letter, label: en[which].label } : KO_COPY.pole(axis, side);
  },
  match: (m) => {
    const en = kktiMatchEn(m);
    return { tier: en.tier, axes: en.axes };
  },
};

const copyOf = (lang: CardLang): CardCopy => (lang === 'en' ? EN_COPY : KO_COPY);

/**
 * 유형 이름 글자 크기 — 한글 이름은 4~9글자라 한 줄에 크게, 영어 이름은 14~26글자라 줄여서 두 줄까지.
 * (Pretendard 라틴 글자는 대략 글자 크기의 0.55배 폭)
 */
function nameSize(c: CardCopy, name: string, big: number, small: number, lineWidth: number): number {
  if (!c.latin) return name.length > 7 ? small : big;
  // 두 줄 안에 들어가는 가장 큰 크기 (긴 단어 하나가 한 줄을 넘지 않게도 본다)
  const longestWord = Math.max(...name.split(/\s+/).map((w) => w.length));
  const twoLines = (lineWidth * 2) / (name.length * 0.58);
  const oneWord = lineWidth / (longestWord * 0.6);
  return Math.round(Math.min(big * 0.86, twoLines, oneWord));
}

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

export function letterTiles(result: KktiResult, tone: Tone, size: number, lang: CardLang = 'ko'): Node {
  const c = copyOf(lang);
  return box(
    { gap: Math.round(size * 0.1) },
    ...codeLetters(c.code(result)).map((letter, i) =>
      box(
        { flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: size, height: Math.round(size * 1.12), borderRadius: Math.round(size * 0.22), backgroundColor: tone.glass },
        text(letter, { fontSize: Math.round(size * 0.56), fontWeight: 700, color: tone.ink, lineHeight: 1.1 }),
        text(c.pole(result.axes[i], 'pole').label, { fontSize: Math.round(size * (c.latin ? 0.125 : 0.135)), fontWeight: 500, color: tone.soft, marginTop: Math.round(size * 0.04) }),
      ),
    ),
  );
}

/** 맨 위 띠 — 처음 보는 사람도 아는 「진짜 MBTI」로 결과를 먼저 말한다 */
function mbtiPill(result: KktiResult, tone: Tone, fontSize: number, c: CardCopy): Node {
  return box(
    { alignItems: 'center', flexShrink: 0, gap: Math.round(fontSize * 0.3), padding: `${Math.round(fontSize * 0.4)}px ${Math.round(fontSize * 0.95)}px`, borderRadius: 999, backgroundColor: tone.glass },
    emoji('🧬', Math.round(fontSize * 1.05)),
    text(c.mbtiPill(result.mbti.type), { fontSize, fontWeight: 700, color: tone.ink }),
  );
}

/** MBTI 는 맨 위 띠에 있으므로 여기엔 컬러·애니어그램만 */
function chips(result: KktiResult, tone: Tone, fontSize: number, c: CardCopy): Node {
  const items: [string, string][] = [
    ['🎨', c.colorName(result)],
    ['🔢', c.enneagram(result)],
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

function axisBars(result: KktiResult, tone: Tone, width: number, c: CardCopy): Node {
  return box(
    { flexDirection: 'column', width, gap: 22 },
    ...result.axes.map((axis) => {
      const plusSide = axis.pole.letter === axis.plus.letter;
      const plus = c.pole(axis, 'plus');
      const minus = c.pole(axis, 'minus');
      return box(
        { flexDirection: 'column', gap: 10 },
        box(
          { justifyContent: 'space-between' },
          text(`${plus.letter} ${plus.label}`, { fontSize: 30, fontWeight: plusSide ? 700 : 500, color: plusSide ? tone.ink : tone.soft }),
          text(`${minus.label} ${minus.letter}`, { fontSize: 30, fontWeight: plusSide ? 500 : 700, color: plusSide ? tone.soft : tone.ink }),
        ),
        box(
          { height: 22, borderRadius: 11, backgroundColor: tone.glass, justifyContent: plusSide ? 'flex-start' : 'flex-end' },
          box({ width: `${axis.percent}%`, height: 22, borderRadius: 11, backgroundColor: tone.ink }),
        ),
      );
    }),
  );
}

function soloStory(result: KktiResult, c: CardCopy): Node {
  const tone = toneOn(result.color.hex);
  const name = c.name(result);
  return box(
    { width: '100%', height: '100%', flexDirection: 'column', alignItems: 'center', backgroundColor: result.color.hex, fontFamily: 'Pretendard', padding: '170px 90px 190px' },
    sheen(),
    mbtiPill(result, tone, 34, c),
    box({ marginTop: 40, width: 250, height: 250, flexShrink: 0, borderRadius: 125, backgroundColor: tone.glass, alignItems: 'center', justifyContent: 'center' }, emoji(result.type.emoji, 144)),
    box({ marginTop: 40, flexShrink: 0 }, letterTiles(result, tone, 172, c.latin ? 'en' : 'ko')),
    text(name, {
      marginTop: 36,
      flexShrink: 0,
      fontSize: nameSize(c, name, 104, 88, 900),
      fontWeight: 700,
      color: tone.ink,
      letterSpacing: -2,
      ...(c.latin ? { textAlign: 'center', justifyContent: 'center', lineHeight: 1.05, maxWidth: 900 } : {}),
    }),
    text(c.oneLiner(result), { marginTop: 14, fontSize: c.latin ? 36 : 38, fontWeight: 500, color: tone.soft, textAlign: 'center', justifyContent: 'center', lineHeight: c.latin ? 1.32 : 1.4, maxWidth: 860 }),
    box({ marginTop: 36, flexShrink: 0 }, chips(result, tone, 32, c)),
    box({ marginTop: 48, flexShrink: 0 }, axisBars(result, tone, 860, c)),
    box({ flexGrow: 1 }),
    box(
      { alignItems: 'center', gap: 14, flexShrink: 0, padding: '22px 44px', borderRadius: 999, backgroundColor: tone.ink },
      emoji('💞', 44),
      text(c.cta, { fontSize: 38, fontWeight: 700, color: tone.ink === WHITE ? INK : WHITE }),
    ),
    text(c.brand, { marginTop: 24, fontSize: 28, fontWeight: 500, color: tone.soft }),
  );
}

function soloSquare(result: KktiResult, c: CardCopy): Node {
  const tone = toneOn(result.color.hex);
  const name = c.name(result);
  return box(
    { width: '100%', height: '100%', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: result.color.hex, fontFamily: 'Pretendard', padding: 70 },
    sheen(),
    mbtiPill(result, tone, 30, c),
    box({ marginTop: 30, width: 210, height: 210, borderRadius: 105, backgroundColor: tone.glass, alignItems: 'center', justifyContent: 'center' }, emoji(result.type.emoji, c.latin ? 110 : 120)),
    box({ marginTop: 30 }, letterTiles(result, tone, 150, c.latin ? 'en' : 'ko')),
    text(name, {
      marginTop: 30,
      fontSize: nameSize(c, name, 90, 76, 920),
      fontWeight: 700,
      color: tone.ink,
      letterSpacing: -2,
      ...(c.latin ? { textAlign: 'center', justifyContent: 'center', lineHeight: 1.05, maxWidth: 920 } : {}),
    }),
    text(c.oneLiner(result), { marginTop: 10, fontSize: c.latin ? 30 : 32, fontWeight: 500, color: tone.soft, textAlign: 'center', justifyContent: 'center', lineHeight: c.latin ? 1.32 : 1.4, maxWidth: 880 }),
    box({ marginTop: 30 }, chips(result, tone, 28, c)),
    text(c.brand, { marginTop: 34, fontSize: 26, fontWeight: 500, color: tone.soft }),
  );
}

function soloOg(result: KktiResult, c: CardCopy): Node {
  const tone = toneOn(result.color.hex);
  const name = c.name(result);
  return box(
    { width: '100%', height: '100%', backgroundColor: result.color.hex, fontFamily: 'Pretendard', padding: '54px 64px', alignItems: 'center', gap: 56 },
    sheen(),
    box(
      { flexDirection: 'column', alignItems: 'center', gap: 26 },
      box({ width: 230, height: 230, borderRadius: 115, backgroundColor: tone.glass, alignItems: 'center', justifyContent: 'center' }, emoji(result.type.emoji, 132)),
      letterTiles(result, tone, 78, c.latin ? 'en' : 'ko'),
    ),
    box(
      { flexDirection: 'column', flexGrow: 1, flexShrink: 1, flexBasis: 0, gap: c.latin ? 12 : 14 },
      box({ alignSelf: 'flex-start' }, mbtiPill(result, tone, c.latin ? 28 : 30, c)),
      text(name, { fontSize: nameSize(c, name, 92, 78, 780), fontWeight: 700, color: tone.ink, letterSpacing: -2, lineHeight: c.latin ? 1.04 : 1.12 }),
      text(c.oneLiner(result), { fontSize: c.latin ? 28 : 32, fontWeight: 500, color: tone.soft, lineHeight: c.latin ? 1.3 : 1.38 }),
      box(
        { marginTop: c.latin ? 8 : 14, alignSelf: 'flex-start', alignItems: 'center', gap: 12, padding: '16px 30px', borderRadius: 999, backgroundColor: tone.ink },
        emoji('💞', 34),
        text(c.cta, { fontSize: 30, fontWeight: 700, color: tone.ink === WHITE ? INK : WHITE }),
      ),
      text(c.ogFoot(c.code(result)), { fontSize: 22, fontWeight: 500, color: tone.soft }),
    ),
  );
}

// ───────────────────────── 둘의 궁합 ─────────────────────────

function person(result: KktiResult, circle: number, nameSize: number, c: CardCopy = KO_COPY): Node {
  return box(
    { flexDirection: 'column', alignItems: 'center', gap: Math.round(circle * 0.1), width: Math.round(circle * 1.7) },
    box(
      { width: circle, height: circle, flexShrink: 0, borderRadius: circle / 2, backgroundColor: mixHex(result.color.hex, WHITE, 0.45), alignItems: 'center', justifyContent: 'center', border: `${Math.max(5, Math.round(circle * 0.04))}px solid ${result.color.hex}` },
      emoji(result.type.emoji, Math.round(circle * 0.56)),
    ),
    // 영어 이름은 길어서(14~26글자) 조금 작게, 두 줄까지
    text(c.name(result), { fontSize: c.latin ? Math.round(nameSize * 0.84) : nameSize, fontWeight: 700, color: INK, textAlign: 'center', justifyContent: 'center', ...(c.latin ? { lineHeight: 1.15 } : {}) }),
    text(`${result.mbti.type} · ${c.code(result)}`, { fontSize: Math.round(nameSize * 0.7), fontWeight: 500, color: INK_FAINT }),
  );
}

const pairBackground = (a: KktiResult, b: KktiResult) => `linear-gradient(140deg, ${a.color.hex} 0%, ${mixHex(a.color.hex, b.color.hex, 0.5)} 50%, ${b.color.hex} 100%)`;

function matchRows(a: KktiResult, b: KktiResult, width: number, c: CardCopy): Node {
  const match = kktiMatch(a, b);
  const copy = c.match(match);
  // 영어 한 줄은 한국어보다 길어 두 줄이 된다 — 카드 높이 안에 들도록 조금 작고 촘촘하게
  const tight = c.latin;
  return box(
    { flexDirection: 'column', width, gap: tight ? 12 : 16 },
    ...match.axes.map((axis, i) =>
      box(
        { alignItems: 'center', gap: 22, padding: tight ? '14px 26px' : '18px 26px', borderRadius: 30, backgroundColor: '#F4F6F8' },
        emoji(axis.emoji, tight ? 42 : 46),
        box(
          { flexDirection: 'column', flexGrow: 1, flexShrink: 1, flexBasis: 0, gap: tight ? 4 : 6 },
          box(
            { alignItems: 'center', gap: 12 },
            text(copy.axes[i].label, { fontSize: tight ? 28 : 30, fontWeight: 700, color: INK }),
            box({ padding: '4px 16px', borderRadius: 999, backgroundColor: hexToRgba(FIT_COLOR[axis.fit], 0.16) }, text(copy.axes[i].fitLabel, { fontSize: 22, fontWeight: 700, color: FIT_COLOR[axis.fit] })),
          ),
          text(copy.axes[i].line, { fontSize: tight ? 24 : 26, fontWeight: 500, color: INK_SOFT, lineHeight: tight ? 1.3 : 1.36 }),
        ),
      ),
    ),
  );
}

function pairStory(a: KktiResult, b: KktiResult, c: CardCopy): Node {
  const match = kktiMatch(a, b);
  const tier = c.match(match).tier;
  const tight = c.latin;
  return box(
    { width: '100%', height: '100%', flexDirection: 'column', alignItems: 'center', backgroundImage: pairBackground(a, b), fontFamily: 'Pretendard', padding: '180px 60px 200px' },
    box(
      { flexDirection: 'column', alignItems: 'center', width: '100%', flexGrow: 1, borderRadius: 64, backgroundColor: WHITE, padding: '54px 50px 46px' },
      box({ alignItems: 'center', gap: 12, padding: '12px 30px', borderRadius: 999, backgroundColor: '#F4F6F8' }, emoji('💬', 34), text(c.pairHead, { fontSize: 32, fontWeight: 700, color: INK })),
      box(
        { marginTop: tight ? 28 : 34, flexShrink: 0, alignItems: 'flex-start', justifyContent: 'center' },
        person(a, tight ? 160 : 180, 36, c),
        text('×', { fontSize: 60, fontWeight: 500, color: INK_FAINT, marginTop: tight ? 44 : 52 }),
        person(b, tight ? 160 : 180, 36, c),
      ),
      box(
        { marginTop: tight ? 10 : 18, flexShrink: 0, alignItems: 'flex-end' },
        text(String(match.percent), { fontSize: tight ? 180 : 200, fontWeight: 700, color: INK, letterSpacing: -7, lineHeight: 1 }),
        text('%', { fontSize: tight ? 76 : 84, fontWeight: 700, color: INK, marginBottom: tight ? 22 : 24, marginLeft: 6 }),
      ),
      box({ marginTop: 6, flexShrink: 0, alignItems: 'center', gap: 14, padding: '14px 36px', borderRadius: 999, backgroundColor: INK }, emoji(match.tier.emoji, 44), text(tier.label, { fontSize: 44, fontWeight: 700, color: WHITE })),
      text(tier.line, { marginTop: 18, flexShrink: 0, fontSize: tight ? 30 : 32, fontWeight: 500, color: INK_SOFT, textAlign: 'center', justifyContent: 'center', ...(tight ? { lineHeight: 1.3, maxWidth: 860 } : {}) }),
      box({ marginTop: tight ? 22 : 28, flexShrink: 0 }, matchRows(a, b, 860, c)),
      box({ flexGrow: 1 }),
      text(c.pairCtaLong, { flexShrink: 0, fontSize: 32, fontWeight: 700, color: INK }),
      text(c.brand, { marginTop: 8, flexShrink: 0, fontSize: 26, fontWeight: 500, color: INK_FAINT }),
    ),
  );
}

function pairSquare(a: KktiResult, b: KktiResult, c: CardCopy): Node {
  const match = kktiMatch(a, b);
  const tier = c.match(match).tier;
  return box(
    { width: '100%', height: '100%', backgroundImage: pairBackground(a, b), fontFamily: 'Pretendard', padding: 56 },
    box(
      { flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%', borderRadius: 60, backgroundColor: WHITE, padding: 44 },
      box({ alignItems: 'center', gap: 12, padding: '12px 30px', borderRadius: 999, backgroundColor: '#F4F6F8' }, emoji('💬', 32), text(c.pairHead, { fontSize: 30, fontWeight: 700, color: INK })),
      box({ marginTop: 34, alignItems: 'flex-start', justifyContent: 'center' }, person(a, 190, 34, c), text('×', { fontSize: 60, fontWeight: 500, color: INK_FAINT, marginTop: 56 }), person(b, 190, 34, c)),
      box(
        { marginTop: 18, alignItems: 'flex-end' },
        text(String(match.percent), { fontSize: c.latin ? 190 : 210, fontWeight: 700, color: INK, letterSpacing: -8, lineHeight: 1 }),
        text('%', { fontSize: c.latin ? 80 : 88, fontWeight: 700, color: INK, marginBottom: c.latin ? 24 : 26, marginLeft: 6 }),
      ),
      box({ marginTop: 6, alignItems: 'center', gap: 14, padding: '14px 34px', borderRadius: 999, backgroundColor: INK }, emoji(match.tier.emoji, 40), text(tier.label, { fontSize: 40, fontWeight: 700, color: WHITE })),
      text(tier.line, { marginTop: 20, fontSize: c.latin ? 28 : 30, fontWeight: 500, color: INK_SOFT, textAlign: 'center', justifyContent: 'center', ...(c.latin ? { lineHeight: 1.3, maxWidth: 860 } : {}) }),
      text(c.brand, { marginTop: 26, fontSize: 24, fontWeight: 500, color: INK_FAINT }),
    ),
  );
}

function pairOg(a: KktiResult, b: KktiResult, c: CardCopy): Node {
  const match = kktiMatch(a, b);
  const tier = c.match(match).tier;
  return box(
    { width: '100%', height: '100%', backgroundImage: pairBackground(a, b), fontFamily: 'Pretendard', padding: 40 },
    box(
      { alignItems: 'center', justifyContent: 'space-between', width: '100%', height: '100%', borderRadius: 48, backgroundColor: WHITE, padding: '30px 36px' },
      person(a, 170, 32, c),
      box(
        { flexDirection: 'column', alignItems: 'center', flexGrow: 1 },
        text(c.pairHead, { fontSize: c.latin ? 24 : 28, fontWeight: 700, color: INK_FAINT }),
        box(
          { alignItems: 'flex-end' },
          text(String(match.percent), { fontSize: 190, fontWeight: 700, color: INK, letterSpacing: -6, lineHeight: 1.05 }),
          text('%', { fontSize: 80, fontWeight: 700, color: INK, marginBottom: 26, marginLeft: 4 }),
        ),
        box({ alignItems: 'center', gap: 12, padding: '12px 30px', borderRadius: 999, backgroundColor: INK }, emoji(match.tier.emoji, 36), text(tier.label, { fontSize: c.latin ? 32 : 36, fontWeight: 700, color: WHITE })),
        text(c.pairCtaShort, { marginTop: 22, fontSize: 26, fontWeight: 700, color: INK_SOFT }),
      ),
      person(b, 170, 32, c),
    ),
  );
}

// ───────────────────────── 결과가 없을 때 (테스트 소개) ─────────────────────────

/** 결과 없이 테스트 소개만 보여 줄 때 — 센딧 앱 아이콘과 같은 하늘색 → 파랑 → 보라 (분홍은 쓰지 않는다) */
const INTRO_BACKGROUND = 'linear-gradient(135deg, #EEF8FF 0%, #E9EEFF 50%, #EFEAFF 100%)';
const INTRO_ORB = 'linear-gradient(135deg, #6FC8FF 0%, #3D63F5 55%, #7559F6 100%)';

function intro(shape: KktiCardShape, c: CardCopy): Node {
  const tall = shape !== 'og';
  const scale = shape === 'story' ? 1.25 : shape === 'square' ? 1.1 : 1;
  const px = (n: number) => Math.round(n * scale);
  // 영어 제목(Texting Type Test)은 KKTI 보다 길어서 작게, 두 줄까지
  const title = c.latin
    ? text(c.introTitle, { fontSize: px(tall ? 112 : 92), fontWeight: 700, color: INK, letterSpacing: -3, lineHeight: 1, maxWidth: px(tall ? 760 : 720), ...(tall ? { textAlign: 'center', justifyContent: 'center' } : {}) })
    : text(c.introTitle, { fontSize: px(150), fontWeight: 700, color: INK, letterSpacing: -4, lineHeight: 1 });
  return box(
    { width: '100%', height: '100%', flexDirection: tall ? 'column' : 'row', alignItems: 'center', justifyContent: 'center', gap: px(tall ? 36 : 60), backgroundImage: INTRO_BACKGROUND, fontFamily: 'Pretendard', padding: px(70) },
    box({ width: px(230), height: px(230), borderRadius: px(115), backgroundImage: INTRO_ORB, alignItems: 'center', justifyContent: 'center', ...(c.latin ? { flexShrink: 0 } : {}) }, emoji('💬', px(124))),
    box(
      { flexDirection: 'column', alignItems: tall ? 'center' : 'flex-start', gap: px(12), ...(c.latin ? { flexShrink: 1 } : {}) },
      title,
      text(c.introLine, { fontSize: px(c.latin ? (tall ? 30 : 38) : 46), fontWeight: 700, color: INK, ...(c.latin && tall ? { textAlign: 'center', justifyContent: 'center' } : {}) }),
      text(c.introMeta, { fontSize: px(c.latin ? 30 : 32), fontWeight: 500, color: INK_SOFT }),
    ),
  );
}

// ───────────────────────── 내보내기 ─────────────────────────

/** 그림의 뼈대 (어떤 요소가 들어가는지 테스트에서 본다). lang 은 카드 글의 언어 — 한국어(기본)·영어 */
export function cardTree(shape: KktiCardShape, a: KktiResult | null, w: KktiResult | null = null, lang: CardLang = 'ko'): Node {
  const c = copyOf(lang);
  if (!a) return intro(shape, c);
  if (w) return shape === 'story' ? pairStory(a, w, c) : shape === 'square' ? pairSquare(a, w, c) : pairOg(a, w, c);
  return shape === 'story' ? soloStory(a, c) : shape === 'square' ? soloSquare(a, c) : soloOg(a, c);
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

export function renderCard(shape: KktiCardShape, a: KktiResult | null, w: KktiResult | null = null, lang: CardLang = 'ko'): Promise<Buffer> {
  const { width, height } = CARD_SIZE[shape];
  return renderTree(cardTree(shape, a, w, lang), width, height);
}
