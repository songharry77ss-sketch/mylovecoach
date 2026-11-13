// 「너라면 몇 번?」 8초 릴스 — 받은 카톡 하나 + 답장 보기 1~4번이 차례로 뜨고 멈춰 있는 화면(반복 재생).
// 레퍼런스: 7초 고르기 쇼츠(조회 대비 댓글 비율 최상위), 밸런스 게임. 정답 없는 고르기라 댓글 장벽이 가장 낮다.
// 항목: { hook, hookEm?, label?, name, avatar, relation?, message, time?, options: [4개 이하], ask?, caption }
import { C, box, chat, col, headline, row, saveJpg, signature, tag, text } from '../kit.mjs';
import { saveMp4 } from '../video.mjs';

const W = 1080;
const H = 1920;
const ease = (x) => 1 - (1 - x) ** 3;

function scene(it, { shown, pop = 1, cover = false }) {
  const opts = it.options.slice(0, shown).map((o, i) => {
    const last = i === shown - 1 && pop < 1;
    const k = ease(pop);
    return row(
      { gap: 22, ...(last ? { opacity: Math.min(1, k * 1.6), transform: `translate(0px, ${((1 - k) * 36).toFixed(1)}px)` } : {}) },
      box({ width: 76, height: 76, borderRadius: 38, backgroundColor: C.ink, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }, text(String(i + 1), { fontSize: 40, fontWeight: 900, color: '#FFFFFF' })),
      box({ padding: '24px 32px', borderRadius: 36, borderTopRightRadius: 10, backgroundColor: C.mine, maxWidth: 820 }, text(o, { fontSize: 42, fontWeight: 600, color: C.ink, lineHeight: 1.38, letterSpacing: -0.6 })),
    );
  });
  return col(
    { width: W, height: H, backgroundColor: C.canvas, fontFamily: 'Pretendard', padding: `${cover ? 330 : 200}px 50px 0`, overflow: 'hidden' },
    tag(it.label ?? '너라면 몇 번?', { size: 30, bg: C.violetSoft, color: C.violet }),
    headline(it.hook, { size: 78, em: it.hookEm ?? [], style: { marginTop: 22 } }),
    col({ marginTop: 36 }, chat({ name: it.relation ? `${it.name} (${it.relation})` : it.name, avatar: it.avatar, messages: [{ from: 'them', text: it.message, time: it.time }], width: 980, title: false })),
    col({ marginTop: 40, gap: 24 }, ...opts),
    shown >= it.options.length ? row({ marginTop: 44, justifyContent: 'space-between', alignItems: 'center' }, text(it.ask ?? '너라면 몇 번이야?', { fontSize: 44, fontWeight: 900, color: C.blue, letterSpacing: -1 }), signature()) : null,
  );
}

export async function makePickReel(it, file) {
  const frames = [];
  const add = (state, dur, pop = false) => frames.push({ tree: scene(it, state), dur, pop });
  add({ shown: 0 }, 0.7); // 첫 장면부터 제목 + 받은 카톡 (넘기지 않게)
  for (let s = 1; s <= it.options.length; s++) {
    for (const p of [0.3, 0.65]) add({ shown: s, pop: p }, 1 / 30, p === 0.3);
    add({ shown: s }, 0.45);
  }
  const used = frames.reduce((a, f) => a + f.dur, 0);
  add({ shown: it.options.length }, Math.max(3.5, 8 - used));
  return saveMp4(frames, W, H, file);
}

export async function makePickReelCover(it, file) {
  await saveJpg(scene(it, { shown: it.options.length, cover: true }), W, H, file);
}
