/**
 * 채널에 바로 올릴 KKTI 그림을 docs/channel-assets/ 에 만든다 (docs/CHANNEL_PLAYBOOK.md 가 이 파일들을 가리킨다).
 *   npx tsx scripts/make-channel-assets.ts
 * - types-square/01-esfj.png … : 16유형 소개 카드 (1080×1080 — 인스타 캐러셀·X·스레드). 번호는 KKTI_CODES 순서
 * - types-story/… : 같은 카드의 세로판 (1080×1920 — 인스타 스토리·틱톡 포토)
 * - cover-*.png : 캐러셀 표지 / cta-*.png : 마지막 장 (테스트 하러 가기)
 * - tiers-square/1.png … 5.png : 궁합 등급 다섯 가지 (천생연분 → 극과 극)
 * - sample-*.png : 결과 카드·궁합 카드 견본 (앱이 실제로 만들어 주는 그림과 같다)
 * 유형 이름·한 줄 설명을 바꿨으면 다시 돌린다. 실제 이용자 결과가 아니라 유형 소개용 그림이다.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { box, emoji, letterTiles, renderCard, renderTree, sheen, text, toneOn, type Node } from '../api/_kkti-card';
import { KKTI_AXES, KKTI_CODES, KKTI_MATCH_TIERS, KKTI_QUESTIONS, KKTI_TYPES, computeKkti, type KktiResult } from '../src/lib/kkti';

const OUT = path.join(__dirname, '..', 'docs', 'channel-assets');
const INK = '#191F28';
const INK_SOFT = '#4E5968';
const WHITE = '#FFFFFF';
const INTRO_BACKGROUND = 'linear-gradient(135deg, #FFD9E4 0%, #E6DEFF 50%, #D6ECFF 100%)';

/** 그 유형이 가장 뚜렷하게 나오는 답 (축마다 같은 쪽 끝) */
function typical(code: string): KktiResult {
  const letters = Array.from(code);
  return computeKkti(
    KKTI_QUESTIONS.map((q) => {
      const i = KKTI_AXES.findIndex((a) => a.key === q.axis);
      const sign = letters[i] === KKTI_AXES[i].plus.letter ? 1 : -1;
      return q.options.findIndex((o) => o.score === sign * 2);
    }),
  );
}

/** 유형 소개 카드 — 번호 · 이모지 · 글자 4개 · 별명 · 한 줄 · 찰떡 유형 */
function typeCard(result: KktiResult, index: number, tall: boolean): Node {
  const tone = toneOn(result.color.hex);
  const best = KKTI_TYPES[result.type.bestMatch];
  const k = tall ? 1.18 : 1;
  const px = (n: number) => Math.round(n * k);
  return box(
    { width: '100%', height: '100%', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: result.color.hex, fontFamily: 'Pretendard', padding: px(70) },
    sheen(),
    box({ padding: `${px(12)}px ${px(30)}px`, borderRadius: 999, backgroundColor: tone.glass }, text(`KKTI 16유형 · ${String(index + 1).padStart(2, '0')}`, { fontSize: px(30), fontWeight: 700, color: tone.ink })),
    box({ marginTop: px(30), width: px(220), height: px(220), flexShrink: 0, borderRadius: px(110), backgroundColor: tone.glass, alignItems: 'center', justifyContent: 'center' }, emoji(result.type.emoji, px(126))),
    box({ marginTop: px(30), flexShrink: 0 }, letterTiles(result, tone, px(150))),
    text(result.type.name, { marginTop: px(30), flexShrink: 0, fontSize: px(result.type.name.length > 7 ? 76 : 90), fontWeight: 700, color: tone.ink, letterSpacing: -2 }),
    text(result.type.oneLiner, { marginTop: px(10), fontSize: px(32), fontWeight: 500, color: tone.soft, textAlign: 'center', justifyContent: 'center', lineHeight: 1.4, maxWidth: 900 }),
    box(
      { marginTop: px(30), flexShrink: 0, alignItems: 'center', gap: px(12), padding: `${px(12)}px ${px(26)}px`, borderRadius: 999, backgroundColor: tone.glass },
      emoji('💞', px(32)),
      text(`찰떡궁합 ${best.name}`, { fontSize: px(28), fontWeight: 700, color: tone.ink }),
    ),
    text('KKTI · 카톡으로 보는 진짜 연애 MBTI', { marginTop: px(30), fontSize: px(26), fontWeight: 500, color: tone.soft }),
  );
}

/** 글만 있는 장 (표지·마지막 장) */
function wordCard(lines: { value: string; size: number; weight?: 500 | 700; color?: string }[], icon: string, tall: boolean): Node {
  const k = tall ? 1.2 : 1;
  const px = (n: number) => Math.round(n * k);
  return box(
    { width: '100%', height: '100%', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: px(22), backgroundImage: INTRO_BACKGROUND, fontFamily: 'Pretendard', padding: px(80) },
    box({ width: px(200), height: px(200), flexShrink: 0, borderRadius: px(100), backgroundImage: 'linear-gradient(135deg, #FF7EA5 0%, #9B8CFF 100%)', alignItems: 'center', justifyContent: 'center', marginBottom: px(16) }, emoji(icon, px(108))),
    ...lines.map((line) => text(line.value, { fontSize: px(line.size), fontWeight: line.weight ?? 700, color: line.color ?? INK, textAlign: 'center', justifyContent: 'center', lineHeight: 1.25, letterSpacing: line.size > 80 ? -3 : -1 })),
  );
}

async function save(dir: string, name: string, png: Buffer) {
  mkdirSync(path.join(OUT, dir), { recursive: true });
  writeFileSync(path.join(OUT, dir, `${name}.png`), png);
}

async function main() {
  const results = KKTI_CODES.map(typical);
  for (const [i, result] of results.entries()) {
    // 파일 이름은 영문으로 (한글 파일 이름은 운영체제마다 자모가 다르게 저장돼 git 에서 말썽이 난다) — 번호 + 카톡 속 MBTI
    const name = `${String(i + 1).padStart(2, '0')}-${result.mbti.type.toLowerCase()}`;
    await save('types-square', name, await renderTree(typeCard(result, i, false), 1080, 1080));
    await save('types-story', name, await renderTree(typeCard(result, i, true), 1080, 1920));
  }

  const cover = [
    { value: 'KKTI', size: 170 },
    { value: '카톡으로 보는 진짜 연애 MBTI', size: 50 },
    { value: '16유형 중 나는?', size: 40, weight: 500 as const, color: INK_SOFT },
  ];
  const cta = [
    { value: '내 유형은 뭘까?', size: 84 },
    { value: '1분 · 12문항 · 가입 없이', size: 44, weight: 500 as const, color: INK_SOFT },
    { value: '친구가 하면 둘의 궁합까지', size: 44 },
    { value: '프로필 링크에서 테스트', size: 38, weight: 500 as const, color: INK_SOFT },
  ];
  const match = [
    { value: '둘 다 해야 열리는', size: 56, weight: 500 as const, color: INK_SOFT },
    { value: '카톡 궁합 %', size: 130 },
    { value: '링크 보내고, 그 사람이 테스트하면 끝', size: 40, weight: 500 as const, color: INK_SOFT },
  ];
  for (const [shape, width, height] of [
    ['square', 1080, 1080],
    ['story', 1080, 1920],
  ] as const) {
    await save('', `cover-${shape}`, await renderTree(wordCard(cover, '💬', shape === 'story'), width, height));
    await save('', `cta-${shape}`, await renderTree(wordCard(cta, '✨', shape === 'story'), width, height));
    await save('', `match-teaser-${shape}`, await renderTree(wordCard(match, '💞', shape === 'story'), width, height));
  }

  // 궁합 등급 다섯 가지 — 높은 등급부터. 구간은 등급 기준(min)에서 계산한다
  for (const [i, tier] of KKTI_MATCH_TIERS.entries()) {
    const top = i === 0 ? 99 : KKTI_MATCH_TIERS[i - 1].min - 1;
    const range = `궁합 ${Math.max(tier.min, 30)}~${top}%`;
    const lines = [
      { value: range, size: 44, weight: 500 as const, color: INK_SOFT },
      { value: tier.label, size: tier.label.length > 5 ? 120 : 150 },
      { value: tier.line, size: 40, weight: 500 as const, color: INK_SOFT },
    ];
    await save('tiers-square', String(i + 1), await renderTree(wordCard(lines, tier.emoji, false), 1080, 1080));
  }

  // 앱이 이용자에게 만들어 주는 그림 견본 (게시물에서 「이런 카드가 나와요」로 쓴다)
  const a = results[KKTI_CODES.indexOf('후빠폭밀')];
  const b = results[KKTI_CODES.indexOf('선빠폭밀')];
  const c = results[KKTI_CODES.indexOf('선느담직')];
  await save('', 'sample-result-story', await renderCard('story', a));
  await save('', 'sample-match-story', await renderCard('story', a, b));
  await save('', 'sample-match-square', await renderCard('square', a, b));
  await save('', 'sample-match-low-square', await renderCard('square', a, c));
  await save('', 'sample-link-preview', await renderCard('og', a));
  console.log(`그림 ${results.length * 2 + 11 + KKTI_MATCH_TIERS.length}장 → ${OUT}`);
  // 색이 밝은 유형에서 글자가 흰 바탕에 묻히지 않는지 눈으로 볼 것
  console.log(results.map((r) => `${r.code} ${r.color.hex} ${toneOn(r.color.hex).ink === WHITE ? '흰 글자' : '검은 글자'}`).join('\n'));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
