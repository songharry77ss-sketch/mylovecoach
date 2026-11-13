// 「KKTI 두 유형 궁합」 캐러셀 — 자료는 scripts/make-kkti-pairs.ts 가 앱 계산(kktiMatch)으로 뽑은 그대로 (지어낸 숫자 없음).
// 표지(두 유형) → 둘의 카톡 스타일 → 항목별로 잘 맞는 점·맞춰 갈 점 → 궁합 % 와 꿀팁 → 정리(열린 질문)
import path from 'node:path';

import { C, body, box, card, col, emoji, headline, pager, row, saveJpg, signature, tag, text } from '../kit.mjs';

const W = 1080;
const H = 1350;

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const mix = (a, b, t) => `#${hex(a).map((v, i) => Math.round(v + (hex(b)[i] - v) * t).toString(16).padStart(2, '0')).join('')}`;
const FIT = { good: { label: '잘 맞아', color: C.mint, soft: C.mintSoft }, ok: { label: '무난', color: C.amber, soft: C.amberSoft }, care: { label: '맞춰 가기', color: C.red, soft: C.redSoft } };

function page({ head, main, i, n, dark = false, bg }) {
  return col(
    { width: W, height: H, backgroundColor: bg ?? (dark ? C.ink : C.canvas), fontFamily: 'Pretendard', padding: '78px 60px 56px', overflow: 'hidden' },
    head,
    col({ flexGrow: 1, justifyContent: 'center', padding: '30px 0' }, ...[main].flat()),
    row({ justifyContent: 'space-between', alignItems: 'flex-end' }, signature(), pager(i, n, dark ? { color: '#8B95A1' } : {})),
  );
}

const typeCard = (p, rotate = 0, width = 440) =>
  col(
    { width, alignItems: 'center', backgroundColor: C.card, borderRadius: 44, padding: '40px 28px 36px', boxShadow: '0 16px 48px rgba(25,31,40,0.10)', transform: `rotate(${rotate}deg)` },
    box({ width: 190, height: 190, borderRadius: 64, backgroundColor: mix(p.color, '#FFFFFF', 0.55), alignItems: 'center', justifyContent: 'center' }, emoji(p.emoji, 140)),
    text(p.name, { marginTop: 26, fontSize: 44, fontWeight: 900, color: C.ink, letterSpacing: -1.5, textAlign: 'center', justifyContent: 'center' }),
    row({ marginTop: 14, gap: 8 }, ...p.letters.map((l) => box({ padding: '6px 12px', borderRadius: 12, backgroundColor: C.canvas }, text(l.letter, { fontSize: 28, fontWeight: 900, color: C.ink })))),
    text(p.mbti, { marginTop: 12, fontSize: 26, fontWeight: 700, color: C.faint, letterSpacing: 1 }),
  );

export async function makeKktiPair(it, dir) {
  const { a, b, match } = it;
  const same = a.code === b.code;
  const n = 5;
  const files = [];
  const save = async (tree) => {
    const f = path.join(dir, `${String(files.length + 1).padStart(2, '0')}.jpg`);
    await saveJpg(tree, W, H, f);
    files.push(f);
  };
  const bg = mix(mix(a.color, b.color, 0.5), '#FFFFFF', 0.82);
  // 1 표지
  await save(
    page({
      bg,
      head: tag(it.kind === 'best' ? 'KKTI 찰떡 조합' : it.kind === 'worst' ? 'KKTI 정반대 조합' : 'KKTI 카톡 궁합', {}),
      main: [
        headline(same ? `${a.name}\n둘이 사귀면?` : '이 둘이 사귀면\n카톡은 어떨까?', { size: 84 }),
        row({ marginTop: 60, justifyContent: 'center', alignItems: 'center', gap: 0 }, typeCard(a, -4), text('×', { fontSize: 80, fontWeight: 900, color: C.ink, margin: '0 -6px' }), typeCard(b, 4)),
      ],
      i: 1,
      n,
    }),
  );
  // 2 둘의 카톡 스타일
  const style = (p) =>
    card(
      { gap: 14, padding: '40px 44px' },
      row({ gap: 18 }, box({ width: 84, height: 84, borderRadius: 28, backgroundColor: mix(p.color, '#FFFFFF', 0.55), alignItems: 'center', justifyContent: 'center' }, emoji(p.emoji, 60)), col({}, text(p.name, { fontSize: 40, fontWeight: 900, color: C.ink, letterSpacing: -1 }), text(p.letters.map((l) => l.label).join(' · '), { fontSize: 26, fontWeight: 700, color: C.faint }))),
      body(`“${p.oneLiner}”`, { size: 38, color: C.ink, weight: 700 }),
    );
  await save(page({ head: tag('둘의 카톡 스타일', {}), main: [headline(same ? '똑같은 둘이 만나면' : '카톡 하는 방식부터\n이렇게 달라', { size: 70 }), col({ marginTop: 44, gap: 28 }, style(a), same ? null : style(b))], i: 2, n }));
  // 3 항목별
  await save(
    page({
      head: tag('항목별로 보면', {}),
      main: [
        headline('어디가 잘 맞고\n어디서 부딪힐까', { size: 70 }),
        col(
          { marginTop: 40, gap: 20 },
          ...match.axes.map((x) =>
            card(
              { padding: '30px 36px', gap: 10, borderRadius: 32 },
              row({ justifyContent: 'space-between' }, row({ gap: 12 }, emoji(x.emoji, 40), text(x.label, { fontSize: 34, fontWeight: 900, color: C.ink })), tag(FIT[x.fit].label, { size: 26, bg: FIT[x.fit].soft, color: FIT[x.fit].color })),
              body(x.line, { size: 32 }),
            ),
          ),
        ),
      ],
      i: 3,
      n,
    }),
  );
  // 4 궁합 %
  await save(
    page({
      head: tag('카톡 궁합', {}),
      main: [
        row({ alignItems: 'flex-end' }, text(String(match.percent), { fontSize: 300, fontWeight: 900, color: C.blue, letterSpacing: -16, lineHeight: 0.95 }), text('%', { fontSize: 120, fontWeight: 900, color: C.blue, marginBottom: 26 })),
        row({ marginTop: 20, gap: 16 }, emoji(match.tier.emoji, 64), text(match.tier.label, { fontSize: 64, fontWeight: 900, color: C.ink, letterSpacing: -2 })),
        body(match.tier.line, { size: 40, style: { marginTop: 20 } }),
        card({ marginTop: 44, gap: 12, backgroundColor: C.blueSoft, boxShadow: 'none' }, text('이 조합 꿀팁', { fontSize: 34, fontWeight: 900, color: C.blue }), body(match.tip, { size: 38, color: C.ink })),
      ],
      i: 4,
      n,
    }),
  );
  // 5 정리
  await save(
    page({
      dark: true,
      head: tag('너희 둘은?', { bg: 'rgba(255,255,255,0.12)', color: '#FFFFFF' }),
      main: [
        headline('너랑 그 사람은\n무슨 조합이야?', { size: 84, color: '#FFFFFF' }),
        body('카톡 습관 12문항이면 내 유형이 나오고, 둘 다 하면 궁합까지 나와.', { size: 42, color: '#D1D6DB', style: { marginTop: 34 } }),
        box({ marginTop: 56, padding: '30px 36px', borderRadius: 32, backgroundColor: 'rgba(255,255,255,0.08)', alignSelf: 'flex-start' }, text('1분 테스트 · 프로필 링크', { fontSize: 40, fontWeight: 800, color: '#FFFFFF' })),
        text('카톡 습관으로 보는 재미용 유형이에요', { marginTop: 26, fontSize: 28, fontWeight: 600, color: '#8B95A1' }),
      ],
      i: 5,
      n,
    }),
  );
  return { media: files };
}
