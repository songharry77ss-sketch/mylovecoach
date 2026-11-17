// 피드 글을 알리는 스토리 그림 (캐러셀용) — 첫 장을 가운데 카드로 + 열린 질문 한 줄. 릴스는 스토리에 영상을 그대로 쓴다.
// 사장님 규칙 「릴스·피드마다 스토리도」 — make.mjs 가 피드 항목마다 「<id>-story」(after: <id>)를 같이 넣는다.
// API 로는 스티커(링크·투표)를 못 붙여서, 답장(DM)으로 말 걸게 하는 문구로 끝낸다.
import { readFileSync } from 'node:fs';

import { C, box, col, row, saveJpg, tag, text } from '../kit.mjs';

const W = 1080;
const H = 1920;
/** 첫 장(1080×1350)을 이만큼 줄여 가운데에 */
const SLIDE_W = 860;
const SLIDE_H = Math.round((SLIDE_W * 1350) / 1080);

const img = (src, style) => ({ type: 'img', props: { src, width: style.width, height: style.height, style } });

/** slideFile(첫 장 JPG) → out(스토리 JPG). ask: 아래 질문 (없으면 기본 문구) */
export async function makeFeedStory(slideFile, out, { ask, label = '새 게시물' } = {}) {
  const src = `data:image/jpeg;base64,${readFileSync(slideFile).toString('base64')}`;
  const question = String(ask ?? '').trim() || '너라면 어떻게 할래?';
  const tree = col(
    { width: W, height: H, backgroundColor: C.canvas, alignItems: 'center', justifyContent: 'center', padding: '0 80px' },
    row({ marginBottom: 44 }, tag(label, { size: 34, bg: C.blue, color: '#FFFFFF' })),
    box(
      { width: SLIDE_W, height: SLIDE_H, borderRadius: 44, overflow: 'hidden', border: `2px solid ${C.line}`, backgroundColor: C.card },
      img(src, { width: SLIDE_W, height: SLIDE_H }),
    ),
    col(
      { marginTop: 56, alignItems: 'center' },
      text(question, { fontSize: 50, fontWeight: 800, color: C.ink, letterSpacing: -1, lineHeight: 1.3, textAlign: 'center', justifyContent: 'center' }),
      text('답장으로 알려 줘 💬', { marginTop: 18, fontSize: 34, fontWeight: 600, color: C.sub, letterSpacing: -0.5 }),
    ),
  );
  await saveJpg(tree, W, H, out);
  return out;
}
