/**
 * KKTI 두 유형 궁합 136가지(같은 유형끼리 포함)를 자동 생산 창고 항목(format: 'kkti-pair')으로 뽑는다.
 *   npx tsx scripts/make-kkti-pairs.ts <출력.json>
 * 숫자·문장은 모두 앱의 실제 계산(src/lib/kkti — kktiMatch)과 유형 설명에서 가져온다. 지어낸 숫자 없음.
 * 순서: 찰떡(bestMatch)·상극(worstMatch) 조합을 먼저, 그다음 궁합 높은 것과 낮은 것을 번갈아.
 */
import { writeFileSync } from 'node:fs';

import { KKTI_CODES, KKTI_TYPES, kktiMatch, type KktiResult } from '../src/lib/kkti';
import { typical } from './make-channel-assets';

const results = new Map<string, KktiResult>(KKTI_CODES.map((c) => [c, typical(c)]));

const person = (r: KktiResult) => ({
  code: r.code,
  name: r.type.name,
  emoji: r.type.emoji,
  mbti: r.mbti.type,
  color: r.color.hex,
  oneLiner: r.type.oneLiner,
  strength: r.type.strengths[0],
  watchOut: r.type.watchOut[0],
  letters: r.axes.map((a) => ({ letter: a.pole.letter, label: a.pole.label })),
});

const pairs: { a: KktiResult; b: KktiResult; kind: 'best' | 'worst' | 'same' | 'other' }[] = [];
for (let i = 0; i < KKTI_CODES.length; i++) {
  for (let j = i; j < KKTI_CODES.length; j++) {
    const a = results.get(KKTI_CODES[i])!;
    const b = results.get(KKTI_CODES[j])!;
    const kind = i === j ? 'same' : KKTI_TYPES[a.code].bestMatch === b.code ? 'best' : KKTI_TYPES[a.code].worstMatch === b.code ? 'worst' : 'other';
    pairs.push({ a, b, kind });
  }
}

const withMatch = pairs.map((p) => ({ ...p, m: kktiMatch(p.a, p.b) }));
const head = [...withMatch.filter((p) => p.kind === 'best'), ...withMatch.filter((p) => p.kind === 'worst')];
// 찰떡·상극을 번갈아
const best = head.filter((p) => p.kind === 'best');
const worst = head.filter((p) => p.kind === 'worst');
const lead: typeof withMatch = [];
for (let i = 0; i < Math.max(best.length, worst.length); i++) {
  if (best[i]) lead.push(best[i]);
  if (worst[i]) lead.push(worst[i]);
}
const rest = withMatch.filter((p) => p.kind !== 'best' && p.kind !== 'worst').sort((x, y) => y.m.percent - x.m.percent);
const tail: typeof withMatch = [];
while (rest.length) {
  tail.push(rest.shift()!);
  if (rest.length) tail.push(rest.pop()!);
}

const items = [...lead, ...tail].map(({ a, b, m, kind }) => {
  const pa = person(a);
  const pb = person(b);
  const same = kind === 'same';
  return {
    id: `kkti-${pa.mbti.toLowerCase()}-${pb.mbti.toLowerCase()}`,
    format: 'kkti-pair',
    kind,
    a: pa,
    b: pb,
    match: {
      percent: m.percent,
      tier: { label: m.tier.label, emoji: m.tier.emoji, line: m.tier.line },
      axes: m.axes.map((x) => ({ label: x.label, emoji: x.emoji, fit: x.fit, line: x.line })),
      tip: m.tip,
    },
    caption: [
      same ? `${pa.name} 둘이 만나면? 카톡 궁합 ${m.percent}% ${m.tier.emoji}` : `${pa.name} × ${pb.name} 카톡 궁합 ${m.percent}% ${m.tier.emoji}`,
      '',
      m.tier.line,
      '',
      '너희 둘은 무슨 조합이야? 카톡 습관 12문항이면 내 유형이 나오고, 둘 다 하면 궁합까지 나와. 테스트는 프로필 링크에.',
      '',
      '#KKTI #카톡궁합 #MBTI궁합 #연애유형 #썸',
    ].join('\n'),
  };
});

const out = process.argv[2];
if (!out) throw new Error('출력 파일 경로를 주세요');
writeFileSync(out, `${JSON.stringify(items, null, 2)}\n`);
console.log(`KKTI 궁합 ${items.length}개 → ${out} (찰떡 ${best.length} · 상극 ${worst.length})`);
