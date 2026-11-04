// 인스타·쓰레드 자동 게시의 계산 부분 (네트워크 없음 — social.test.mjs 가 검사한다).
// 게시할 내용은 social-queue 가지의 marketing/social/queue.json 에 있고, tools/social-post.mjs 가 읽어 올린다.
// 자세한 흐름: docs/SOCIAL_AUTOPOST.md

export const REPO = 'songharry77ss-sketch/mylovecoach';
/** 올린 지 이만큼 지난 항목은 올리지 않는다 (예약 실행이 며칠 멈췄다가 한꺼번에 몰아 올리는 일을 막음) */
export const STALE_HOURS = 36;

export const CHANNELS = ['instagram', 'threads'];
export const KINDS = {
  instagram: ['carousel', 'image', 'reel'],
  threads: ['text', 'image', 'carousel'],
};

/** 「2026-11-04 21:00」(한국 시간) → Date */
export function kst(at) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/.exec(String(at ?? '').trim());
  if (!m) throw new Error(`시간 형식이 잘못됐어요: "${at}" (예: 2026-11-04 21:00)`);
  const [, y, mo, d, h, mi] = m.map(Number);
  return new Date(Date.UTC(y, mo - 1, d, h - 9, mi));
}

/** jsDelivr 주소 — 커밋에 고정돼 바뀌지 않고, 그림은 image/*, 영상은 video/mp4 로 나간다 (GitHub raw 는 영상을 octet-stream 으로 줌) */
export function mediaUrl(path, ref) {
  if (!/^[0-9a-f]{7,40}$/.test(String(ref))) throw new Error(`커밋 해시가 필요해요: "${ref}"`);
  const clean = String(path).replace(/^\/+/, '');
  if (clean.includes('..')) throw new Error(`잘못된 경로: ${path}`);
  return `https://cdn.jsdelivr.net/gh/${REPO}@${ref}/${clean.split('/').map(encodeURIComponent).join('/')}`;
}

/** 같은 글인지 볼 때 — 줄 끝 공백·연속 빈 줄 차이는 무시 */
export const normalizeText = (text) => String(text ?? '').replace(/\r/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();

const LIMITS = {
  instagram: { caption: 2200, hashtags: 30, carousel: [2, 10] },
  threads: { caption: 500, links: 5, carousel: [2, 20] },
};

/** 항목 하나를 검사해 문제 목록을 돌려준다 (비어 있으면 통과) */
export function problems(entry) {
  const out = [];
  const say = (m) => out.push(`${entry?.id ?? '(id 없음)'}: ${m}`);
  if (!entry || typeof entry !== 'object') return ['항목이 객체가 아니에요'];
  if (!/^[a-z0-9][a-z0-9-]{1,60}$/.test(String(entry.id ?? ''))) say('id 는 영어 소문자·숫자·- 로');
  if (!CHANNELS.includes(entry.channel)) say(`channel 은 ${CHANNELS.join('·')} 중 하나`);
  else if (!KINDS[entry.channel].includes(entry.kind)) say(`${entry.channel} 의 kind 는 ${KINDS[entry.channel].join('·')} 중 하나`);
  try {
    kst(entry.at);
  } catch (e) {
    say(e.message);
  }
  const media = Array.isArray(entry.media) ? entry.media : [];
  const text = normalizeText(entry.caption);
  const limit = LIMITS[entry.channel];
  if (!limit) return out;
  if ([...text].length > limit.caption) say(`글이 너무 길어요 (${[...text].length}/${limit.caption}자)`);
  if (limit.hashtags && (text.match(/#[^\s#]+/g) ?? []).length > limit.hashtags) say(`해시태그는 ${limit.hashtags}개까지`);
  if (limit.links && (text.match(/https?:\/\//g) ?? []).length > limit.links) say(`링크는 ${limit.links}개까지`);
  if (entry.kind === 'carousel') {
    const [min, max] = limit.carousel;
    if (media.length < min || media.length > max) say(`캐러셀은 ${min}~${max}장 (지금 ${media.length}장)`);
  }
  if (entry.kind === 'image' && media.length !== 1) say('사진 글은 그림 1장');
  if (entry.kind === 'reel' && (media.length !== 1 || !/\.mp4$/i.test(media[0] ?? ''))) say('릴스는 mp4 1개');
  if (entry.kind === 'text' && media.length) say('글만 올리는 항목에는 그림을 넣지 않아요');
  if (entry.kind === 'text' && !text) say('글이 비었어요');
  // 인스타 API 는 그림을 JPEG 로만 받는다
  if (entry.channel === 'instagram' && ['carousel', 'image'].includes(entry.kind) && media.some((m) => !/\.jpe?g$/i.test(m))) say('인스타 그림은 .jpg 만');
  if (entry.kind !== 'reel' && media.some((m) => /\.mp4$/i.test(m)) && entry.channel === 'instagram') say('영상은 reel 로');
  return out;
}

/** 큐 전체 검사 — id 중복까지 */
export function queueProblems(queue) {
  const entries = Array.isArray(queue?.entries) ? queue.entries : null;
  if (!entries) return ['queue.json 에 entries 배열이 없어요'];
  const out = entries.flatMap(problems);
  const seen = new Set();
  for (const e of entries) {
    if (seen.has(e.id)) out.push(`${e.id}: id 가 겹쳐요`);
    seen.add(e.id);
  }
  return out;
}

/**
 * 지금 올릴 항목 — 허락(approved: true)받았고, 시간이 됐고, 아직 안 올렸고, 너무 오래 지나지 않은 것.
 * posted: 이미 올린 id 의 집합 (posted.json)
 */
export function dueEntries(queue, now, posted = new Set()) {
  const t = now.getTime();
  return (queue.entries ?? [])
    .filter((e) => e.approved === true && !posted.has(e.id))
    .filter((e) => {
      const at = kst(e.at).getTime();
      return at <= t && t - at <= STALE_HOURS * 3600_000;
    })
    .sort((a, b) => kst(a.at) - kst(b.at));
}

/** 계정 확인 — 다른 계정 토큰으로 잘못 올리는 일을 막는다 */
export function assertAccount(channel, username, expected) {
  if (!expected) return;
  if (String(username ?? '').toLowerCase() !== String(expected).toLowerCase()) {
    throw new Error(`${channel} 토큰이 ${username || '(알 수 없음)'} 계정 것이에요. ${expected} 계정 토큰이어야 해요`);
  }
}
