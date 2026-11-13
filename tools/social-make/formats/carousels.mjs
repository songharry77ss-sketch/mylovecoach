// 캐러셀 포맷 (1080×1350, 4:5 — 피드에서 가장 크게 보임). 장마다 위(꼬리표) · 가운데(본문, 세로 가운데) · 아래(서명·쪽수).
// 인스타는 넘기지 않은 사람에게 2장부터 다시 보여 주기도 해서, 2장도 표지처럼 큰 제목을 단다.
// 「친구한테 보내」·「댓글에 ○○ 써」 같은 참여 요구는 추천에서 빠질 수 있어(인스타 공식) 열린 질문으로 끝낸다.
//
// pick-carousel 「답장 고르기」: 표지(상황 카톡) → 보기 A·B·C → 보기마다 (보내면 상대 반응 + 판정) → 정리
//   { hook, hookEm?, label?, name, avatar, messages, options: [{ text, verdict: 'good'|'soso'|'bad', reply?, why }], answer: { title, em?, body }, ask? }
// list-carousel 「신호·체크리스트」: 표지 → 항목마다 한 장(번호·제목·설명·예시 말풍선) → 정리
//   { hook, hookEm?, label?, emoji, points: [{ title, body, example?: { from, text } }], outro: { title, em?, body }, ask? }
import path from 'node:path';

import { C, body, box, card, chat, col, emoji, headline, pager, row, saveJpg, signature, tag, text } from '../kit.mjs';

const W = 1080;
const H = 1350;

/** 한 장 — head: 위 꼬리표 줄, main: 가운데 본문, foot: { i, n, hint, dark } */
function page({ head, main, foot, dark = false, bg }) {
  return col(
    { width: W, height: H, backgroundColor: bg ?? (dark ? C.ink : C.canvas), fontFamily: 'Pretendard', padding: '78px 60px 56px', overflow: 'hidden' },
    head,
    col({ flexGrow: 1, justifyContent: 'center', padding: '30px 0' }, ...[main].flat()),
    row(
      { justifyContent: 'space-between', alignItems: 'flex-end' },
      col({ gap: 14 }, foot.hint ? text(foot.hint, { fontSize: 32, fontWeight: 800, color: dark ? '#FFFFFF' : C.ink, letterSpacing: -0.5 }) : null, signature()),
      pager(foot.i, foot.n, dark ? { color: '#8B95A1' } : {}),
    ),
  );
}

const VERDICT = {
  good: { label: '보내도 좋아', mark: '🟢', color: C.mint, soft: C.mintSoft, why: '왜 좋냐면' },
  soso: { label: '무난해', mark: '🟡', color: C.amber, soft: C.amberSoft, why: '나쁘진 않은데' },
  bad: { label: '위험해', mark: '🔴', color: C.red, soft: C.redSoft, why: '왜 위험하냐면' },
};
const LETTERS = ['A', 'B', 'C', 'D'];

const myBubble = (value, size = 42, style = {}) =>
  box({ padding: `${Math.round(size * 0.52)}px ${Math.round(size * 0.72)}px`, borderRadius: Math.round(size * 0.85), borderTopRightRadius: 10, backgroundColor: C.mine, maxWidth: 800, ...style }, text(value, { fontSize: size, fontWeight: 600, color: C.ink, lineHeight: 1.38, letterSpacing: -0.6 }));
const letter = (l, bg = C.ink, size = 70) => box({ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }, text(l, { fontSize: Math.round(size * 0.5), fontWeight: 900, color: '#FFFFFF' }));

function saver(dir) {
  const files = [];
  return {
    files,
    async save(tree) {
      const f = path.join(dir, `${String(files.length + 1).padStart(2, '0')}.jpg`);
      await saveJpg(tree, W, H, f);
      files.push(f);
    },
  };
}

/** 정리 장 (어두운 바탕) */
const outroPage = ({ title, em, bodyText, ask, i, n }) =>
  page({
    dark: true,
    head: tag('정리', { bg: 'rgba(255,255,255,0.12)', color: '#FFFFFF' }),
    main: [
      headline(title, { size: 86, color: '#FFFFFF', em: em ?? [], emColor: C.mine }),
      body(bodyText, { size: 42, color: '#D1D6DB', style: { marginTop: 34 } }),
      box({ marginTop: 56, padding: '30px 36px', borderRadius: 32, backgroundColor: 'rgba(255,255,255,0.08)' }, text(ask, { fontSize: 40, fontWeight: 800, color: '#FFFFFF', letterSpacing: -0.6, lineHeight: 1.4 })),
    ],
    foot: { i, n, hint: '헷갈리는 카톡은 캡처 한 장으로 · 프로필 링크', dark: true },
  });

export async function makePickCarousel(it, dir) {
  const n = 3 + it.options.length;
  const { files, save } = saver(dir);
  const last = [...it.messages].reverse().find((m) => m.from === 'them');
  // 1 표지 — 상황
  await save(
    page({
      head: tag(it.label ?? '답장 고르기', {}),
      main: [headline(it.hook, { size: 88, em: it.hookEm ?? [] }), col({ marginTop: 46 }, chat({ name: it.name, avatar: it.avatar, messages: it.messages, width: 960, scale: 1.06 }))],
      foot: { i: 1, n, hint: '너라면 뭐라고 보낼래? →' },
    }),
  );
  // 2 보기 — 받은 말 + A·B·C
  await save(
    page({
      head: tag('보기', { bg: C.violetSoft, color: C.violet }),
      main: [
        headline(it.optionsTitle ?? '셋 중 하나만\n보낼 수 있다면?', { size: 84 }),
        last ? col({ marginTop: 40 }, chat({ name: it.name, avatar: it.avatar, messages: [{ from: 'them', text: last.text }], width: 960, title: false })) : null,
        col({ marginTop: 40, gap: 26 }, ...it.options.map((o, i) => row({ gap: 22 }, letter(LETTERS[i]), myBubble(o.text, 42)))),
      ],
      foot: { i: 2, n, hint: '골랐으면 넘겨 봐 →' },
    }),
  );
  // 3.. 보기마다 — 보내면 이렇게 될 수도 + 판정
  for (const [i, o] of it.options.entries()) {
    const v = VERDICT[o.verdict];
    const thread = [
      ...(last ? [{ from: 'them', text: last.text }] : []),
      { from: 'me', text: o.text, hl: v.color },
      o.reply ? { from: 'them', text: o.reply } : { from: 'them', typing: true },
    ];
    await save(
      page({
        head: row({ gap: 18 }, letter(LETTERS[i], v.color), tag(v.label, { bg: v.soft, color: v.color, size: 34 })),
        main: [
          text(o.reply ? '이렇게 보내면…' : '이렇게 보내면', { fontSize: 40, fontWeight: 900, color: C.ink, letterSpacing: -1 }),
          col({ marginTop: 24 }, chat({ name: it.name, avatar: it.avatar, messages: thread, width: 960, title: false })),
          card({ marginTop: 40, gap: 16 }, row({ gap: 14 }, emoji(v.mark, 44), text(v.why, { fontSize: 42, fontWeight: 900, color: C.ink })), body(o.why, { size: 38 })),
        ],
        foot: { i: 3 + i, n },
      }),
    );
  }
  await save(outroPage({ title: it.answer.title, em: it.answer.em, bodyText: it.answer.body, ask: it.ask ?? '너는 평소에 어떤 스타일이야?', i: n, n }));
  return { media: files };
}

export async function makeListCarousel(it, dir) {
  const n = 2 + it.points.length;
  const { files, save } = saver(dir);
  const teaser = it.points.filter((p) => p.example).slice(0, 2).map((p) => p.example);
  // 1 표지 — 큰 제목 + 예시 말풍선 미리 보기
  await save(
    page({
      head: row({ justifyContent: 'space-between', alignItems: 'flex-start' }, tag(it.label ?? `${it.points.length}가지 신호`, {}), emoji(it.emoji ?? '💭', 150, { transform: 'rotate(8deg)' })),
      main: [
        headline(it.hook, { size: 104, em: it.hookEm ?? [] }),
        teaser.length ? col({ marginTop: 56 }, chat({ name: it.exampleName ?? '썸', avatar: it.exampleAvatar ?? '🙂', messages: teaser, width: 960, title: false })) : null,
      ],
      foot: { i: 1, n, hint: '저장해 두고 하나씩 확인해 봐 →' },
    }),
  );
  for (const [i, p] of it.points.entries()) {
    await save(
      page({
        head: row({ gap: 20 }, box({ width: 96, height: 96, borderRadius: 32, backgroundColor: C.blue, alignItems: 'center', justifyContent: 'center' }, text(String(i + 1), { fontSize: 54, fontWeight: 900, color: '#FFFFFF' })), text(`${it.points.length}개 중 ${i + 1}`, { fontSize: 30, fontWeight: 700, color: C.faint })),
        main: [
          headline(p.title, { size: 84 }),
          body(p.body, { size: 44, style: { marginTop: 30 } }),
          p.example ? col({ marginTop: 52 }, chat({ name: it.exampleName ?? '썸', avatar: it.exampleAvatar ?? '🙂', messages: [p.example], width: 960, title: false, scale: 1.1 })) : null,
        ],
        foot: { i: 2 + i, n },
      }),
    );
  }
  await save(outroPage({ title: it.outro.title, em: it.outro.em, bodyText: it.outro.body, ask: it.ask ?? '너는 몇 개 해당됐어?', i: n, n }));
  return { media: files };
}
