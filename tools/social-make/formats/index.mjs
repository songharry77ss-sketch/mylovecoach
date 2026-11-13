// 포맷 목록 — 포맷마다 kind(게시 종류) · check(항목 검사) · make(항목, 폴더) → { media: [파일], seconds? }
import path from 'node:path';

import { makeListCarousel, makePickCarousel } from './carousels.mjs';
import { makeChatReel, makeChatReelCover } from './chat-reel.mjs';
import { makeKktiPair } from './kkti-pair.mjs';
import { makePickReel, makePickReelCover } from './pick-reel.mjs';

const str = (v) => typeof v === 'string' && v.trim().length > 0;
const msgProblems = (messages) => {
  const out = [];
  if (!Array.isArray(messages) || !messages.some((m) => m.from)) return ['messages 에 말풍선이 하나도 없어요'];
  messages.forEach((m, i) => {
    if (m.day) return;
    if (!['me', 'them'].includes(m.from)) out.push(`messages[${i}].from 은 me·them`);
    if (!str(m.text)) out.push(`messages[${i}].text 가 비었어요`);
    if ([...String(m.text ?? '')].length > 70) out.push(`messages[${i}] 말풍선이 너무 길어요 (70자까지)`);
  });
  return out;
};

export const FORMATS = {
  'chat-reel': {
    kind: 'reel',
    check(it) {
      const out = [];
      if (!str(it.hook)) out.push('hook(맨 위 한 줄)이 비었어요');
      if (String(it.hook ?? '').split('\n').some((l) => [...l].length > 12)) out.push('hook 한 줄은 12자까지 (\\n 으로 나누기)');
      out.push(...msgProblems(it.messages));
      if (it.messages?.filter((m) => !m.day).length > 14) out.push('말풍선은 14개까지 (40초 안팎)');
      if (it.cast && (!str(it.cast.me) || !str(it.cast.them))) out.push('cast 는 { me, them } 둘 다');
      if (!str(it.end?.title)) out.push('end.title(마지막 판정)이 비었어요');
      if (it.end?.reply !== undefined && (!str(it.end.reply) || [...it.end.reply].length > 50)) out.push('end.reply(추천 답장)는 1~50자');
      if (it.end?.body && [...it.end.body].length > 60) out.push('end.body 는 60자까지 (판정 카드에 들어가게)');
      return out;
    },
    async make(it, dir) {
      const file = path.join(dir, 'reel.mp4');
      const cover = path.join(dir, 'cover.jpg');
      const seconds = await makeChatReel(it, file);
      await makeChatReelCover(it, cover);
      return { media: [file], cover, seconds };
    },
  },

  'pick-reel': {
    kind: 'reel',
    check(it) {
      const out = [];
      if (!str(it.hook)) out.push('hook 이 비었어요');
      if (String(it.hook ?? '').split('\n').some((l) => [...l].length > 12)) out.push('hook 한 줄은 12자까지');
      if (!str(it.message) || [...it.message].length > 40) out.push('message(받은 카톡)는 1~40자');
      if (!Array.isArray(it.options) || it.options.length < 2 || it.options.length > 4) out.push('options 는 2~4개');
      for (const [i, o] of (it.options ?? []).entries()) if (!str(o) || [...o].length > 24) out.push(`options[${i}] 는 1~24자 (한 줄에 들어가게)`);
      return out;
    },
    async make(it, dir) {
      const file = path.join(dir, 'reel.mp4');
      const cover = path.join(dir, 'cover.jpg');
      const seconds = await makePickReel(it, file);
      await makePickReelCover(it, cover);
      return { media: [file], cover, seconds };
    },
  },

  'pick-carousel': {
    kind: 'carousel',
    slides: (it) => 3 + (it.options?.length ?? 0),
    check(it) {
      const out = [];
      if (!str(it.hook)) out.push('hook 이 비었어요');
      if (String(it.hook ?? '').split('\n').some((l) => [...l].length > 12)) out.push('hook 한 줄은 12자까지');
      out.push(...msgProblems(it.messages));
      if (it.messages?.filter((m) => !m.day).length > 5) out.push('상황 카톡은 5개까지 (표지에 다 들어가게)');
      if (!Array.isArray(it.options) || it.options.length < 2 || it.options.length > 4) out.push('options 는 2~4개');
      for (const [i, o] of (it.options ?? []).entries()) {
        if (!str(o.text) || [...o.text].length > 40) out.push(`options[${i}].text 는 1~40자`);
        if (!['good', 'soso', 'bad'].includes(o.verdict)) out.push(`options[${i}].verdict 는 good·soso·bad`);
        if (!str(o.why) || [...o.why].length > 110) out.push(`options[${i}].why 는 1~110자`);
        if (o.reply !== undefined && (!str(o.reply) || [...o.reply].length > 40)) out.push(`options[${i}].reply(예상 반응)는 1~40자`);
      }
      if (!(it.options ?? []).some((o) => o.verdict === 'good')) out.push('good 보기가 하나는 있어야 해요');
      if (!str(it.answer?.title) || !str(it.answer?.body)) out.push('answer.title·body 가 필요해요');
      return out;
    },
    make: makePickCarousel,
  },

  'list-carousel': {
    kind: 'carousel',
    slides: (it) => 2 + (it.points?.length ?? 0),
    check(it) {
      const out = [];
      if (!str(it.hook)) out.push('hook 이 비었어요');
      if (String(it.hook ?? '').split('\n').some((l) => [...l].length > 10)) out.push('hook 한 줄은 10자까지 (표지 글씨가 큼)');
      if (!Array.isArray(it.points) || it.points.length < 3 || it.points.length > 8) out.push('points 는 3~8개');
      for (const [i, p] of (it.points ?? []).entries()) {
        if (!str(p.title) || String(p.title).split('\n').some((l) => [...l].length > 13)) out.push(`points[${i}].title 은 한 줄 13자까지`);
        if (!str(p.body) || [...p.body].length > 120) out.push(`points[${i}].body 는 1~120자`);
        if (p.example) out.push(...msgProblems([p.example]).map((m) => `points[${i}].example: ${m}`));
      }
      if (!str(it.outro?.title) || !str(it.outro?.body)) out.push('outro.title·body 가 필요해요');
      return out;
    },
    make: makeListCarousel,
  },

  // 자료는 scripts/make-kkti-pairs.ts 가 앱 계산으로 뽑는다 — 손으로 고치지 않는다
  'kkti-pair': {
    kind: 'carousel',
    slides: () => 5,
    check(it) {
      const out = [];
      for (const k of ['a', 'b']) if (!str(it[k]?.name) || !str(it[k]?.emoji) || !/^#[0-9a-f]{6}$/i.test(it[k]?.color ?? '')) out.push(`${k} 유형 자료가 모자라요`);
      if (!(it.match?.percent >= 30 && it.match?.percent <= 99)) out.push('match.percent 는 30~99');
      if (it.match?.axes?.length !== 4) out.push('match.axes 는 4개');
      return out;
    },
    make: makeKktiPair,
  },
};
