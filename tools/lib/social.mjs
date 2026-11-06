// 인스타·쓰레드 자동 게시의 계산 부분 (네트워크 없음 — social.test.mjs 가 검사한다).
// 게시할 내용은 social-queue 가지의 marketing/social/queue.json 에 있고, tools/social-post.mjs 가 읽어 올린다.
// 자세한 흐름: docs/SOCIAL_AUTOPOST.md

export const REPO = 'songharry77ss-sketch/mylovecoach';
/** 올린 지 이만큼 지난 항목은 올리지 않는다 (예약 실행이 며칠 멈췄다가 한꺼번에 몰아 올리는 일을 막음) */
export const STALE_HOURS = 36;
/**
 * 하루 중 예정 시각부터 이만큼 안에서만 올린다. GitHub 예약 실행이 몇 시간씩 밀려도(2026-11 에 7시간 넘게 밀림)
 * 새벽에 올라가지 않고, 놓치면 다음 날 같은 시간대에 올라간다. 예약 실행은 매시간 돈다.
 */
export const POST_WINDOW_HOURS = 3;
const HOUR = 3600_000;
const DAY = 24 * HOUR;

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
  if (entry.audio !== undefined) audioProblems(entry, say);
  return out;
}

/**
 * 릴스 음원 항목 검사. 모양: { id?, search?: "곡" | ["곡", …], trending?: true, audioVolume?, videoVolume?, minSeconds?, required? }
 * 고르는 순서: id → search 를 차례로 → trending(지금 인기 음원). required 가 아니면 못 찾았을 때 음원 없이 올린다.
 */
function audioProblems(entry, say) {
  const a = entry.audio;
  if (entry.channel !== 'instagram' || entry.kind !== 'reel') return say('음원(audio)은 인스타 릴스에만');
  if (!a || typeof a !== 'object' || Array.isArray(a)) return say('audio 는 { id · search · trending } 객체');
  const searches = a.search === undefined ? [] : [].concat(a.search);
  if (a.id === undefined && !searches.length && a.trending !== true) say('audio 에 id · search · trending 중 하나는 있어야 해요');
  if (a.id !== undefined && !/^\d{5,25}$/.test(String(a.id))) say('audio.id 는 숫자 (「인스타 음원 찾기」 실행에서 나온 값)');
  if (searches.length > 5 || searches.some((q) => typeof q !== 'string' || !q.trim() || q.length > 100)) say('audio.search 는 글자(100자 안) 1~5개');
  if (a.trending !== undefined && typeof a.trending !== 'boolean') say('audio.trending 은 true/false');
  for (const k of ['audioVolume', 'videoVolume']) if (a[k] !== undefined && !(Number.isInteger(a[k]) && a[k] >= 1 && a[k] <= 100)) say(`audio.${k} 는 1~100 정수`);
  if (a.minSeconds !== undefined && !(Number.isFinite(a.minSeconds) && a.minSeconds > 0 && a.minSeconds <= 90)) say('audio.minSeconds 는 1~90 (초)');
  if (a.required !== undefined && typeof a.required !== 'boolean') say('audio.required 는 true/false');
}

/** 인스타 토큰 종류 — 'instagram'(인스타 로그인, 토큰이 IG 로 시작) | 'facebook'(페이스북 로그인). override(IG_API)가 있으면 그것 */
export function igApiFor(token, override) {
  if (override === 'instagram' || override === 'facebook') return override;
  if (override) throw new Error(`IG_API 는 instagram 또는 facebook 이어야 해요: "${override}"`);
  return /^IG/.test(String(token ?? '')) ? 'instagram' : 'facebook';
}

const squash = (s) => String(s ?? '').toLowerCase().replace(/[\s()[\]·.,'"!?~_-]+/g, '');

/**
 * 음원 고르기 — 찾기 결과에서 쓸 한 곡 (없으면 null).
 * query 가 있으면 제목·가수에 검색어 낱말이 모두 들어간 첫 곡, 없으면(인기 음원) 첫 곡.
 * avoid: 빼고 고를 음원 id (최근에 쓴 곡), minSeconds: 이보다 짧은 곡은 뺀다 (영상 길이).
 */
export function pickAudio(list, { query, avoid = new Set(), minSeconds } = {}) {
  const words = String(query ?? '').split(/\s+/).map(squash).filter(Boolean);
  return (
    (list ?? []).find((a) => {
      if (!a?.id || avoid.has(String(a.id))) return false;
      if (minSeconds && a.durationMs && a.durationMs < minSeconds * 1000) return false;
      const hay = squash(`${a.title} ${a.artist}`);
      return words.every((w) => hay.includes(w));
    }) ?? null
  );
}

/** 최근 n개 게시물에 쓴 음원 id — 인기 음원에서 고를 때 같은 곡이 이어지지 않게 */
export const recentAudioIds = (posted, n = 5) =>
  new Set(
    (posted?.posts ?? [])
      .filter((p) => p?.audio?.id)
      .slice(-n)
      .map((p) => String(p.audio.id)),
  );

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
 * 지금 올릴 항목 — 허락(approved: true)받았고, 시간이 됐고, 아직 안 올렸고, 너무 오래 지나지 않았고,
 * 지금이 하루 중 예정 시각부터 POST_WINDOW_HOURS 안인 것.
 * posted: 이미 올린 id 의 집합 (posted.json)
 */
export function dueEntries(queue, now, posted = new Set()) {
  const t = now.getTime();
  return (queue.entries ?? [])
    .filter((e) => e.approved === true && !posted.has(e.id))
    .filter((e) => {
      const late = t - kst(e.at).getTime();
      return late >= 0 && late <= STALE_HOURS * HOUR && late % DAY < POST_WINDOW_HOURS * HOUR;
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
