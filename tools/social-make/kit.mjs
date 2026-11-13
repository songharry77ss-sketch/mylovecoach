// 게시물 그림 재료 — satori(글·상자 → SVG) + resvg(SVG → 픽셀) + ffmpeg(픽셀 → JPG·MP4).
// 디자인 결: 토스·센딧 앱처럼 옅은 회색 바탕 + 흰 카드 + 큰 굵은 글씨. 금속·네온·영어 라벨 없음.
// 카톡 화면은 「알아보게」만 그린다 (노란 내 말풍선·흰 상대 말풍선·안 읽음 1) — 카카오 로고·상표는 쓰지 않고, 장면마다 「연출」 표시를 붙인다.
import { Buffer } from 'node:buffer';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Resvg } from '@resvg/resvg-js';
import satori from 'satori';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export const C = {
  ink: '#191F28',
  sub: '#4E5968',
  faint: '#8B95A1',
  line: '#E5E8EB',
  canvas: '#F3F5F9',
  card: '#FFFFFF',
  blue: '#3D63F5',
  blueSoft: '#EDF1FF',
  violet: '#7559F6',
  violetSoft: '#F1EEFF',
  pink: '#FF4D7E',
  pinkSoft: '#FFEEF3',
  mint: '#20B97A',
  mintSoft: '#E6F8F0',
  amber: '#F5A623',
  amberSoft: '#FFF5E1',
  red: '#F04452',
  redSoft: '#FFEDEE',
  // 카톡 장면
  chatBg: '#B9CDE0',
  mine: '#FEE500',
  theirs: '#FFFFFF',
  unread: '#FFB800',
};

// ───────────── 글꼴 · 이모지 ─────────────

const fontFile = (file) => [path.join(ROOT, 'scripts', 'assets', 'fonts', file), path.join(ROOT, 'api', '_assets', 'fonts', file)].find((p) => existsSync(p));
const FONTS = [
  ['Pretendard-Medium.otf', 500],
  ['Pretendard-SemiBold.otf', 600],
  ['Pretendard-Bold.otf', 700],
  ['Pretendard-ExtraBold.otf', 800],
  ['Pretendard-Black.otf', 900],
].map(([file, weight]) => ({ name: 'Pretendard', data: readFileSync(fontFile(file)), weight, style: 'normal' }));

const emojiFile = (e) => path.join(ROOT, 'scripts', 'assets', 'fluent', `${[...e].map((c) => c.codePointAt(0).toString(16)).filter((c) => c !== 'fe0f').join('-')}.png`);
const emojiCache = new Map();
function emojiUri(e) {
  if (!emojiCache.has(e)) {
    const f = emojiFile(e);
    emojiCache.set(e, existsSync(f) ? `data:image/png;base64,${readFileSync(f).toString('base64')}` : '');
  }
  return emojiCache.get(e);
}
/** 이 이모지를 그릴 수 있나 (scripts/assets/fluent 에 있어야 함 — scripts/fetch-fluent-emoji.ts) */
export const hasEmoji = (e) => !!emojiUri(e);
/** 글 속 이모지 중 그림이 없는 것 (없으면 네모로 깨져 나옴) */
export const missingEmoji = (s) => [...new Set(String(s ?? '').match(/\p{Extended_Pictographic}(‍\p{Extended_Pictographic})*/gu) ?? [])].filter((e) => !hasEmoji(e));

// ───────────── 상자 · 글 ─────────────

export const box = (style, ...children) => ({
  type: 'div',
  props: { style: { display: 'flex', boxSizing: 'border-box', position: 'relative', ...style }, children: children.flat().filter((c) => c !== null && c !== undefined && c !== false) },
});
export const text = (value, style) => ({ type: 'div', props: { style: { display: 'flex', wordBreak: 'keep-all', whiteSpace: 'pre-wrap', ...style }, children: String(value) } });
export const col = (style, ...children) => box({ flexDirection: 'column', ...style }, ...children);
export const row = (style, ...children) => box({ flexDirection: 'row', alignItems: 'center', ...style }, ...children);

export function emoji(e, size, style = {}) {
  const src = emojiUri(e);
  if (!src) return text(e, { fontSize: Math.round(size * 0.86), lineHeight: 1, ...style });
  return { type: 'img', props: { src, width: size, height: size, style: { width: size, height: size, ...style } } };
}

/** 둥근 꼬리표 */
export const tag = (value, { size = 30, bg = C.blueSoft, color = C.blue, style = {} } = {}) =>
  box({ padding: `${Math.round(size * 0.36)}px ${Math.round(size * 0.7)}px`, borderRadius: 999, backgroundColor: bg, alignSelf: 'flex-start', ...style }, text(value, { fontSize: size, fontWeight: 800, color, letterSpacing: -0.3, lineHeight: 1.1 }));

/** 큰 제목 — 줄바꿈은 \n 으로. em: 강조할 낱말(파란색) */
export function headline(value, { size = 76, color = C.ink, em = [], emColor = C.blue, align = 'left', style = {} } = {}) {
  const lines = String(value).split('\n');
  return col(
    { alignItems: align === 'center' ? 'center' : 'flex-start', ...style },
    ...lines.map((line) => row({ flexWrap: 'wrap', justifyContent: align === 'center' ? 'center' : 'flex-start' }, ...splitEm(line, em).map(([s, on]) => text(s, { fontSize: size, fontWeight: 900, color: on ? emColor : color, letterSpacing: -size * 0.045, lineHeight: 1.22 })))),
  );
}
function splitEm(line, em) {
  if (!em.length) return [[line, false]];
  const re = new RegExp(`(${em.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'g');
  return line.split(re).filter(Boolean).map((s) => [s, em.includes(s)]);
}

export const body = (value, { size = 38, color = C.sub, weight = 600, style = {} } = {}) => text(value, { fontSize: size, fontWeight: weight, color, lineHeight: 1.5, letterSpacing: -0.6, ...style });

/** 흰 카드 */
export const card = (style, ...children) => col({ backgroundColor: C.card, borderRadius: 40, padding: 48, boxShadow: '0 12px 40px rgba(25,31,40,0.08)', ...style }, ...children);

/** 아래 작은 서명 — 광고 티 안 나게 */
export const signature = (style = {}) =>
  row({ gap: 12, ...style }, box({ width: 34, height: 34, borderRadius: 10, backgroundImage: `linear-gradient(135deg, ${C.blue}, ${C.violet})` }), text('센딧 · 나만의 연애 코치', { fontSize: 26, fontWeight: 700, color: C.faint, letterSpacing: -0.4 }));

/** 몇 번째 장인지 */
export const pager = (i, n, style = {}) => text(`${i} / ${n}`, { fontSize: 26, fontWeight: 700, color: C.faint, ...style });

// ───────────── 카톡 장면 ─────────────

const AVATAR_BG = ['#FFD6E0', '#D6E4FF', '#E2D9FF', '#D9F5E8', '#FFE7C7'];
const avatarBg = (name) => AVATAR_BG[[...String(name)].reduce((a, c) => a + c.codePointAt(0), 0) % AVATAR_BG.length];

/**
 * 대화 화면 한 덩어리.
 * messages: [{ from: 'them' | 'me', text, time?, unread? (내 말풍선 옆 1), hl? (강조 테두리 색), note? (말풍선 아래 작은 해설) }]
 *          또는 { day: '11월 13일 목요일' } (날짜 줄), { typing: true, from } (입력 중 …)
 * name: 상대 이름, avatar: 상대 프로필 이모지
 */
export function chat({ name = '썸', avatar = '🙂', messages = [], width = 960, scale = 1, title = true, badge = '연출', style = {} } = {}) {
  const px = (n) => Math.round(n * scale);
  const out = [];
  let prevFrom = null;
  for (const m of messages) {
    if (m.day) {
      out.push(row({ justifyContent: 'center', margin: `${px(10)}px 0` }, text(m.day, { fontSize: px(22), fontWeight: 600, color: '#FFFFFF', backgroundColor: 'rgba(25,31,40,0.18)', padding: `${px(6)}px ${px(18)}px`, borderRadius: 999 })));
      prevFrom = null;
      continue;
    }
    const mine = m.from === 'me';
    const first = m.from !== prevFrom;
    prevFrom = m.from;
    const bubbleStyle = {
      maxWidth: px(mine ? 620 : 600),
      padding: `${px(18)}px ${px(24)}px`,
      borderRadius: px(30),
      backgroundColor: mine ? C.mine : C.theirs,
      ...(first ? (mine ? { borderTopRightRadius: px(8) } : { borderTopLeftRadius: px(8) }) : {}),
      ...(m.hl ? { border: `${px(5)}px solid ${m.hl}` } : {}),
    };
    const bubble = m.typing
      ? box({ ...bubbleStyle, gap: px(10), padding: `${px(24)}px ${px(30)}px` }, ...[0, 1, 2].map((i) => box({ width: px(14), height: px(14), borderRadius: px(7), backgroundColor: '#A9B2BC', opacity: m.dots ? (m.dots === i + 1 ? 1 : 0.4) : 0.7 })))
      : box(bubbleStyle, text(m.text, { fontSize: px(34), fontWeight: 500, color: C.ink, lineHeight: 1.42, letterSpacing: -0.5 }));
    const meta = col(
      { alignItems: mine ? 'flex-end' : 'flex-start', justifyContent: 'flex-end', gap: px(2), padding: `0 ${px(8)}px ${px(4)}px` },
      m.unread ? text('1', { fontSize: px(22), fontWeight: 800, color: C.unread }) : null,
      m.time ? text(m.time, { fontSize: px(20), fontWeight: 500, color: '#5F6B78' }) : null,
    );
    const line = mine ? row({ justifyContent: 'flex-end', alignItems: 'flex-end' }, meta, bubble) : row({ alignItems: 'flex-end' }, bubble, meta);
    const block = mine
      ? col({ alignItems: 'flex-end', marginTop: px(first ? 18 : 8) }, line)
      : row(
          { alignItems: 'flex-start', marginTop: px(first ? 18 : 8) },
          first ? box({ width: px(76), height: px(76), borderRadius: px(28), backgroundColor: avatarBg(name), alignItems: 'center', justifyContent: 'center', marginRight: px(16) }, emoji(avatar, px(50))) : box({ width: px(92) }),
          col({}, first ? text(name, { fontSize: px(24), fontWeight: 600, color: '#3C4650', marginBottom: px(8) }) : null, line),
        );
    out.push(block);
    if (m.note) out.push(row({ justifyContent: mine ? 'flex-end' : 'flex-start', marginTop: px(8), paddingLeft: mine ? 0 : px(92) }, text(m.note, { fontSize: px(26), fontWeight: 800, color: m.hl ?? C.blue, backgroundColor: '#FFFFFF', padding: `${px(8)}px ${px(18)}px`, borderRadius: 999 })));
  }
  return col(
    { width: px(width), backgroundColor: C.chatBg, borderRadius: px(44), overflow: 'hidden', ...style },
    title
      ? row(
          { justifyContent: 'space-between', padding: `${px(26)}px ${px(32)}px`, backgroundColor: 'rgba(255,255,255,0.35)' },
          text(name, { fontSize: px(30), fontWeight: 800, color: C.ink }),
          badge ? text(badge, { fontSize: px(20), fontWeight: 700, color: '#5F6B78', backgroundColor: 'rgba(255,255,255,0.6)', padding: `${px(6)}px ${px(14)}px`, borderRadius: 999 }) : null,
        )
      : null,
    col({ padding: `${px(10)}px ${px(30)}px ${px(34)}px` }, ...out),
  );
}

// ───────────── 내보내기 ─────────────

export async function svgOf(tree, width, height) {
  return satori(tree, { width, height, fonts: FONTS, loadAdditionalAsset: async (code, segment) => (code === 'emoji' ? emojiUri(segment) : '') });
}
/** 장면 → RGBA 픽셀 */
export async function pixels(tree, width, height) {
  const img = new Resvg(await svgOf(tree, width, height), { fitTo: { mode: 'width', value: width }, background: '#FFFFFF' }).render();
  return Buffer.from(img.pixels);
}
export async function png(tree, width, height) {
  return Buffer.from(new Resvg(await svgOf(tree, width, height), { fitTo: { mode: 'width', value: width } }).render().asPng());
}

export function ffmpegPath() {
  if (process.env.FFMPEG) return process.env.FFMPEG;
  const r = spawnSync('ffmpeg', ['-hide_banner', '-version'], { stdio: 'ignore' });
  if (r.status === 0) return 'ffmpeg';
  throw new Error('ffmpeg 가 없어요 — FFMPEG=<경로> 로 알려 주세요');
}

/** 장면 → JPG 파일 (인스타 API 는 JPG 만 받음) */
export async function saveJpg(tree, width, height, file) {
  const raw = await pixels(tree, width, height);
  execFileSync(ffmpegPath(), ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${width}x${height}`, '-i', '-', '-frames:v', '1', '-q:v', '2', file], { input: raw });
}
