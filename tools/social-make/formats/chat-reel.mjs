// 「카톡 재현 릴스」 — 위에 훅 한 줄, 아래 대화가 한 줄씩 올라오고(상대는 「입력 중…」 뒤에), 해설 꼬리표가 붙고, 마지막에 판정 카드.
// 항목 모양 (bank.json):
// { id, format: 'chat-reel', hook: '썸남 답장이\n갑자기 단답이 됐다', hookEm: ['단답'], name: '민준', avatar: '🐶',
//   messages: [{ from: 'them'|'me', text, time?, unread?, note?, hl? } | { day }],
//   end: { title: '식은 걸까?', body: '…', ask: '너라면 뭐라고 답해? 댓글로 👇' }, caption, audio? }
import { C, body, box, chat, col, headline, row, saveJpg, signature, tag, text } from '../kit.mjs';
import { saveMp4 } from '../video.mjs';

const W = 1080;
const H = 1920;
const MAX_VISIBLE = 7;

const ease = (x) => 1 - (1 - x) ** 3;
const readTime = (s) => Math.min(2.4, Math.max(0.9, 0.55 + [...String(s ?? '')].length * 0.05));

function scene(item, { shown, pop = 1, typing = 0, end = 0, cover = false }) {
  const msgs = item.messages.slice(0, shown);
  // 화면에 다 안 들어가면 오래된 것부터 위로 밀어낸다 (날짜 줄은 맨 앞 것만 남김)
  const visible = msgs.length > MAX_VISIBLE ? msgs.slice(-MAX_VISIBLE) : msgs;
  const list = visible.map((m, i) => {
    if (i !== visible.length - 1 || pop >= 1) return m;
    return { ...m, note: undefined, _pop: pop }; // 해설 꼬리표는 말풍선이 다 뜬 뒤에
  });
  if (typing) list.push({ from: 'them', typing: true, dots: typing });
  const chatTree = chat({ name: item.name, avatar: item.avatar, messages: list.map(({ _pop, ...m }) => m), width: 980 });
  // 마지막 말풍선만 튀어 오르게 — chat() 결과의 말풍선 목록에서 마지막 것에 효과를 준다
  if (pop < 1) {
    const listNode = chatTree.props.children.at(-1);
    const last = listNode.props.children.at(-1);
    const k = ease(pop);
    last.props.style = { ...last.props.style, opacity: Math.min(1, k * 1.6), transform: `translate(0px, ${((1 - k) * 40).toFixed(1)}px) scale(${(0.92 + 0.08 * k).toFixed(3)})` };
  }
  const k = ease(end);
  return col(
    // 표지는 프로필 격자(가운데 4:5 = 위아래 285px 잘림) 안에 훅이 다 보이게 조금 내린다
    { width: W, height: H, backgroundColor: C.canvas, fontFamily: 'Pretendard', padding: `${cover ? 330 : 200}px 50px 0`, overflow: 'hidden' },
    tag(item.label ?? '썸 카톡 해석', { size: 30 }),
    headline(item.hook, { size: 78, em: item.hookEm ?? [], style: { marginTop: 22 } }),
    // 대비형(예: F 남친 vs T 여친)은 누가 어느 쪽인지 위에 고정
    item.cast
      ? row(
          { marginTop: 22, gap: 16 },
          ...[
            [C.mine, item.cast.me],
            ['#FFFFFF', item.cast.them],
          ].map(([bg, label]) => row({ gap: 12, padding: '12px 22px 12px 14px', borderRadius: 999, backgroundColor: '#FFFFFF', boxShadow: '0 4px 14px rgba(25,31,40,0.06)' }, box({ width: 30, height: 30, borderRadius: 10, backgroundColor: bg, border: '2px solid #D1D6DB' }), text(label, { fontSize: 30, fontWeight: 800, color: C.ink }))),
        )
      : null,
    col({ marginTop: item.cast ? 28 : 40 }, chatTree),
    end > 0
      ? col(
          { position: 'absolute', left: 50, right: 50, bottom: 330, backgroundColor: C.card, borderRadius: 44, padding: '46px 48px', boxShadow: '0 20px 60px rgba(25,31,40,0.18)', opacity: Math.min(1, k * 1.4), transform: `translate(0px, ${((1 - k) * 80).toFixed(1)}px)` },
          item.end.badge ? tag(item.end.badge, { size: 28, bg: item.end.tone === 'red' ? C.redSoft : item.end.tone === 'mint' ? C.mintSoft : C.blueSoft, color: item.end.tone === 'red' ? C.red : item.end.tone === 'mint' ? C.mint : C.blue }) : null,
          headline(item.end.title, { size: 62, style: { marginTop: item.end.badge ? 18 : 0 } }),
          item.end.body ? body(item.end.body, { size: 34, style: { marginTop: 16 } }) : null,
          item.end.reply
            ? col(
                { marginTop: 24, gap: 10, alignItems: 'flex-end' },
                text('이렇게 보내 보면?', { fontSize: 26, fontWeight: 800, color: C.faint }),
                box({ padding: '20px 28px', borderRadius: 30, borderTopRightRadius: 8, backgroundColor: C.mine, maxWidth: 820 }, text(item.end.reply, { fontSize: 36, fontWeight: 600, color: C.ink, lineHeight: 1.4, letterSpacing: -0.5 })),
              )
            : null,
          item.end.ask ? text(item.end.ask, { marginTop: 22, fontSize: 36, fontWeight: 800, color: C.blue, letterSpacing: -0.6 }) : null,
          signature({ marginTop: 28 }),
        )
      : null,
  );
}

/** 표지 — 훅 + 대화 전부(판정은 숨김) */
export async function makeChatReelCover(item, file) {
  await saveJpg(scene(item, { shown: item.messages.length, cover: true }), W, H, file);
}

export async function makeChatReel(item, file) {
  const frames = [];
  const add = (state, dur, pop = false) => frames.push({ tree: scene(item, state), dur, pop });
  // 0: 훅만 (첫 장면이 표지 — 아무 말풍선 없이 0.9초)
  add({ shown: 0 }, 0.9);
  let shown = 0;
  for (const m of item.messages) {
    if (m.from === 'them' && !m.day) {
      // 입력 중 … (점 세 개가 차례로)
      for (let r = 0; r < 2; r++) for (const d of [1, 2, 3]) add({ shown, typing: d }, 0.14);
    }
    shown += 1;
    if (m.day) {
      add({ shown }, 0.25);
      continue;
    }
    for (const p of [0.25, 0.55, 0.8]) add({ shown, pop: p }, 1 / 30, p === 0.25);
    add({ shown }, readTime(m.text) + (m.note ? 0.9 : 0));
  }
  add({ shown }, 0.5);
  for (const e of [0.2, 0.45, 0.7, 0.9]) add({ shown, end: e }, 1 / 30, e === 0.2);
  add({ shown, end: 1 }, Math.max(2.6, readTime(item.end.body) + 1.4));
  return saveMp4(frames, W, H, file);
}
