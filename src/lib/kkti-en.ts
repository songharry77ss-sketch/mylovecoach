/**
 * KKTI 영어판 (Texting Type Test) — 앱 화면 전용 (2026-11-27 세계 출시).
 *
 * kkti.ts 는 서버(api/)가 한국어 공유 카드·미리보기를 그릴 때도 쓰므로 @/lib/i18n 을 못 불러온다.
 * 영어 문구는 서버도 같이 쓰는 kkti-en-text.ts 에 두고(서버가 영어 카드·미리보기를 그린다), 여기서는 다시 내보내기만 한다.
 * 열쇠는 kkti.ts 의 유형 코드(선빠폭직)·문항 id·축 key·색 hex·궁합 등급 min.
 * 점수·궁합·색 계산은 전부 kkti.ts 하나 — 여기는 「무엇을 보여 줄지」만 바꾼다.
 *
 * 화면은 kktiCopy.* 로 지금 언어의 문구를 받는다 (한국어면 kkti.ts 의 값 그대로 → 한국어판은 바뀌는 게 없다).
 *
 * 영어 유형 코드: 축마다 영어 글자 한 개 — F/W(First move·Waits) · R/L(Rapid·Laid-back) · H/D(Hype·Dry) · A/S(All-in·Slow burn).
 * 예: 선빠폭직 → FRHA. 화면에 보이는 글자만 바뀌고, 링크·저장·분석(track)에는 언제나 한국어 내부 코드를 쓴다.
 * 공유 링크·카드 그림 주소는 kktiCopy.link / kktiCopy.card — 한국어가 아니면 ?l=언어 가 붙는다 (받는 사람의 미리보기·카드가 그 언어로).
 */
import { LANG, L, isKo } from '@/lib/i18n';
import {
  ENNEAGRAM_NOTE,
  KKTI_AXES,
  KKTI_FIT_LABEL,
  KKTI_TYPES,
  chatShareText,
  matchChatText,
  matchReason,
  matchReasonParts,
  matchShareText,
  kktiMatch,
  nearestNamedColor,
  shareText,
  type KktiAxisKey,
  type KktiCardShape,
  type KktiColor,
  type KktiEnneagram,
  type KktiFit,
  type KktiMatch,
  type KktiQuestion,
  type KktiResult,
  type KktiSide,
} from '@/lib/kkti';
import {
  ENNEAGRAM_NOTE_EN,
  KKTI_AXES_EN,
  KKTI_COLORS_EN,
  KKTI_ENNEAGRAM_EN,
  KKTI_FIT_LABEL_EN,
  KKTI_LEAD_EN,
  KKTI_QUESTIONS_EN,
  KKTI_TYPES_EN,
  kktiCardUrlFor,
  kktiEnglishCode,
  kktiMatchEn,
  kktiShareUrlFor,
  type KktiMatchCopy,
  type KktiQuestionEn,
} from '@/lib/kkti-en-text';
import type { KktiSaved } from '@/lib/types';

export * from '@/lib/kkti-en-text';

// ───────────────────────── 지금 언어로 고르기 ─────────────────────────

/** 「a, b, and c」 */
function joinEn(items: string[]): string {
  if (items.length <= 1) return items.join('');
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const axisIndexOf = (key: KktiAxisKey) => KKTI_AXES.findIndex((a) => a.key === key);

export interface KktiTypeCopy {
  /** 화면에 보이는 코드 (한국어 선빠폭직 / 영어 FRHA) — 링크·저장에는 쓰지 않는다 */
  code: string;
  name: string;
  emoji: string;
  oneLiner: string;
  description: string;
  strengths: string[];
  watchOut: string[];
  coachTip: string;
}

function typeCopy(code: string): KktiTypeCopy | null {
  const ko = KKTI_TYPES[code];
  if (!ko) return null;
  const en = isKo ? null : KKTI_TYPES_EN[code];
  if (!en) return { ...ko, code: ko.code };
  return { ...en, code: kktiEnglishCode(code), emoji: ko.emoji };
}

function axisLabel(key: KktiAxisKey): string {
  return isKo ? (KKTI_AXES[axisIndexOf(key)]?.label ?? key) : KKTI_AXES_EN[key].label;
}

/** 축 한쪽의 글자·짧은 설명 */
function pole(key: KktiAxisKey, side: KktiSide): { letter: string; label: string } {
  if (!isKo) return KKTI_AXES_EN[key][side];
  const p = KKTI_AXES[axisIndexOf(key)][side];
  return { letter: p.letter, label: p.label };
}

/** 결과의 축에서 고른 쪽 */
function sideOf(axis: { pole: { letter: string }; plus: { letter: string } }): KktiSide {
  return axis.pole.letter === axis.plus.letter ? 'plus' : 'minus';
}

function question(q: KktiQuestion): KktiQuestionEn {
  const en = isKo ? null : KKTI_QUESTIONS_EN[q.id];
  if (!en) return { bubble: q.bubble, prompt: q.prompt, options: q.options.map((o) => o.label) };
  return { bubble: q.bubble ? en.bubble : undefined, prompt: en.prompt, options: q.options.map((o, i) => en.options[i] ?? o.label) };
}

function color(c: Pick<KktiColor, 'name' | 'description' | 'namedHex'>): { name: string; description: string } {
  const en = isKo ? null : KKTI_COLORS_EN[c.namedHex];
  return en ? { name: en.name, description: en.mood } : { name: c.name, description: c.description };
}

function enneagram(e: KktiEnneagram): { title: string; short: string; reason: string; note: string } {
  const en = isKo ? null : KKTI_ENNEAGRAM_EN[e.number];
  const short = L(`${e.number}번`, `Type ${e.number}`);
  if (!en) return { title: e.title, short, reason: e.reason, note: e.note || ENNEAGRAM_NOTE };
  const traits = e.traits.map((t) => KKTI_AXES_EN[t.key][t.side].trait);
  return {
    title: `Type ${e.number} ${en.name}`,
    short,
    reason: `${capitalize(joinEn(traits))}: that's Type ${e.number} ${en.name} energy, ${en.vibe}.`,
    note: ENNEAGRAM_NOTE_EN,
  };
}

function fitLabel(fit: KktiFit): string {
  return isKo ? KKTI_FIT_LABEL[fit] : KKTI_FIT_LABEL_EN[fit];
}

function match(m: KktiMatch): KktiMatchCopy {
  if (isKo) {
    return {
      tier: { label: m.tier.label, line: m.tier.line, emoji: m.tier.emoji },
      axes: m.axes.map((a) => ({ key: a.key, label: a.label, fitLabel: KKTI_FIT_LABEL[a.fit], line: a.line })),
      tip: m.tip,
    };
  }
  return kktiMatchEn(m);
}

/** 두 유형이 왜 잘 맞는지·안 맞는지 한 줄 */
function reason(selfCode: string, otherCode: string): string {
  if (isKo) return matchReason(selfCode, otherCode);
  const { lead, same, diff } = matchReasonParts(selfCode, otherCode);
  const label = (key: KktiAxisKey) => KKTI_AXES_EN[key].label.toLowerCase();
  const head = KKTI_LEAD_EN[lead];
  if (!diff.length) return `${head}, and you're in total sync on ${joinEn(same.map(label))}.`;
  if (!same.length) return `${head}, and you're total opposites on ${joinEn(diff.map(label))}.`;
  return `${head}, but you'll need to meet in the middle on ${joinEn(diff.map(label))}.`;
}

/**
 * 공유 링크 — /k/내코드[-상대코드]. 한국어판은 지금까지와 같은 주소, 그 밖의 언어는 ?l=언어 를 붙인다
 * (받는 사람의 링크 미리보기·카드 그림·넘어간 결과 화면이 보낸 사람의 언어로 나온다). 답 코드는 언어와 상관없다.
 */
function link(answersEncoded: string, withEncoded?: string | null): string {
  return kktiShareUrlFor(LANG, answersEncoded, withEncoded);
}

/** 결과 카드 그림 주소 — 한국어가 아니면 영어 카드 */
function card(answersEncoded: string, withEncoded?: string | null, shape: KktiCardShape = 'og', site?: string): string {
  return kktiCardUrlFor(LANG, answersEncoded, withEncoded, shape, site);
}

/** SNS 공유 문구 (X 280자 안) */
function share(result: KktiResult, url: string = link(result.encoded)): string {
  if (isKo) return shareText(result, url);
  const t = typeCopy(result.code);
  const c = color(result.color);
  return [
    `My texting MBTI is ${result.mbti.type} ${result.type.emoji} "${t?.name ?? result.type.name}"`,
    `"${t?.oneLiner ?? result.type.oneLiner}"`,
    `Texting Type ${t?.code ?? result.code} · Love color: ${c.name}`,
    `Take it and see our match 👉 ${url}`,
    '#TextingTypeTest #MBTI #DatingMBTI',
  ].join('\n');
}

/** 한 사람에게 보내는 짧은 문구 */
function chat(url: string): string {
  if (isKo) return chatShareText(url);
  return `ok you have to try this lol. It figures out your real MBTI from how you text. 1 min and you'll see our match too 👉 ${url}`;
}

/** 궁합 공유 문구 */
function matchShare(mine: KktiResult, theirs: KktiResult, url: string = link(mine.encoded, theirs.encoded)): string {
  if (isKo) return matchShareText(mine, theirs, url);
  const raw = kktiMatch(mine, theirs);
  const m = match(raw);
  const name = (r: KktiResult) => typeCopy(r.code)?.name ?? r.type.name;
  return [
    `Our texting MBTI match: ${raw.percent}% ${m.tier.emoji} "${m.tier.label}"`,
    `${mine.mbti.type} ${mine.type.emoji} ${name(mine)} × ${theirs.mbti.type} ${theirs.type.emoji} ${name(theirs)}`,
    `Take the 1-min test and see your match with me 👉 ${url}`,
    '#TextingTypeTest #CompatibilityTest #DatingMBTI',
  ].join('\n');
}

/** 궁합 결과를 상대에게 돌려보내는 짧은 문구 */
function matchChat(mine: KktiResult, theirs: KktiResult, url: string = link(mine.encoded, theirs.encoded)): string {
  if (isKo) return matchChatText(mine, theirs, url);
  const raw = kktiMatch(mine, theirs);
  const m = match(raw);
  return `we got ${raw.percent}% on the texting MBTI match lol ${m.tier.emoji} ${m.tier.label} 👉 ${url}`;
}

/** 프로필에 저장된 결과를 지금 언어로 (저장값은 한국어 그대로 둔다 — 다른 화면에서도 쓸 수 있게 내보낸다) */
function saved(s: KktiSaved): { code: string; name: string; colorName: string } {
  if (isKo) return { code: s.code, name: s.name, colorName: s.colorName };
  const t = typeCopy(s.code);
  // 저장된 색 이름은 그 색과 가장 가까운 이름 있는 색이다 → 같은 계산으로 영어 이름을 찾는다
  const named = s.color ? KKTI_COLORS_EN[nearestNamedColor(s.color).hex] : undefined;
  return { code: t?.code ?? s.code, name: t?.name ?? s.name, colorName: named?.name ?? s.colorName };
}

/**
 * KKTI 화면 문구 — 한국어면 kkti.ts 값 그대로, 영어면 kkti-en-text.ts 의 영어.
 * 내부 값(유형 코드·답 코드·분석 이벤트)은 언어와 상관없이 kkti.ts 그대로 쓴다. 링크만 언어(l=)를 싣는다.
 */
export const kktiCopy = {
  /** 테스트 이름 */
  testName: isKo ? 'KKTI' : 'Texting Type Test',
  type: typeCopy,
  code: (code: string) => (isKo ? code : kktiEnglishCode(code)),
  axisLabel,
  pole,
  sideOf,
  question,
  color,
  enneagram,
  fitLabel,
  match,
  reason,
  link,
  card,
  share,
  chat,
  matchShare,
  matchChat,
  saved,
};
