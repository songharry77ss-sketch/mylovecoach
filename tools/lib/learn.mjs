// 인스타 게시물 성과로 스스로 배우는 부분 (계산만 — API·파일은 tools/social-learn.mjs 가 한다. 검사: learn.test.mjs)
//
// 1) 기록: 매일 아침 게시물마다 조회·도달·공유·저장·댓글을 스냅숏으로 쌓는다 (addSnapshot)
// 2) 점수: 올린 지 3일쯤의 숫자로 「조회 지수 + 퍼짐 지수」를 매긴다 (scorePosts) — 둘 다 계정 중앙값 대비 log2 배율
//    퍼짐 = 100명이 보면 공유·저장·댓글이 몇 번 (공유 3 · 저장 2 · 댓글 1 가중) — 인스타가 남에게 퍼뜨릴 때 가장 크게 보는 게 「보내기」
// 3) 배우기: 포맷·주제별 평균 점수를 표본이 적으면 0(계정 평균) 쪽으로 당겨서 계산한다 (learnModel)
// 4) 쓰기: 다음 주 포맷 구성(planWeek)과 같은 포맷 안에서 고를 순서(rankItems)를 정한다 — 안 해 본 포맷은 주마다 한 칸씩 시험
// 흐름: docs/SOCIAL_AUTOPOST.md 「스스로 배우기」

const HOUR = 3_600_000;

/** 점수를 매길 기준 나이 — 이보다 어린 게시물은 「재는 중」 */
export const SCORE_AGE_H = 60;
/** 표본이 이만큼은 있어야 평균을 그대로 믿는다 (작으면 0 쪽으로 당김) */
export const SHRINK = 3;
/** 한 주 칸 수와 한 포맷 최대 칸 */
export const WEEK_SLOTS = 7;
export const MAX_SLOTS = 3;
/** 스냅숏은 게시물마다 이만큼만 남긴다 */
const KEEP_SNAPS = 12;

export const FORMAT_NAMES = {
  'chat-reel': '카톡 재현 릴스',
  'pick-reel': '「몇 번?」 릴스',
  'app-reel': '실제 앱 사용 릴스',
  'real-reel': '사장님 실사 릴스',
  'pick-carousel': '답장 고르기 캐러셀',
  'list-carousel': '체크리스트 캐러셀',
  'kkti-pair': 'KKTI 궁합 캐러셀',
  'old-reel': '예전 릴스',
  'old-carousel': '예전 캐러셀',
  'old-image': '예전 사진',
};
export const formatName = (f) => FORMAT_NAMES[f] ?? f;

/** 해시태그 → 주제 묶음. 어디에나 붙는 태그(#연애·#카톡답장 …)는 빼고 본다 */
const TOPIC_TAGS = {
  썸: ['썸', '썸남', '썸녀', '썸신호', '썸끝', '애매한관계', '어장'],
  '연락 텀·읽씹': ['읽씹', '안읽씹', '단답', '칼답', '카톡습관', '자니'],
  커플: ['커플', '커플카톡', '장기연애', '연애초기'],
  '성향·궁합': ['TF', 'T여친', 'F남친', 'MBTI궁합', 'KKTI', '연애유형', '카톡궁합'],
  애착유형: ['불안형', '회피형', '애착유형'],
  '재회·전 애인': ['전애인', '재회', '전남친', '전여친'],
  '약속·데이트': ['데이트', '약속취소', '애프터', '소개팅', '크리스마스데이트'],
  '시즌': ['크리스마스', '기말고사', '연말', '새해', '발렌타인', '화이트데이'],
};
const TAG_TOPIC = new Map(Object.entries(TOPIC_TAGS).flatMap(([topic, tags]) => tags.map((t) => [t.toLowerCase(), topic])));

/** 항목의 주제들 — 창고 항목의 topics 가 있으면 그것, 없으면 캡션 해시태그로. 첫 줄 모양(대비형·받은 카톡형)도 같이 본다 */
export function topicsOf(item = {}, caption = item.caption) {
  if (Array.isArray(item.topics) && item.topics.length) return [...new Set(item.topics)];
  const out = new Set();
  for (const tag of String(caption ?? '').match(/#[^\s#]+/g) ?? []) {
    const topic = TAG_TOPIC.get(tag.slice(1).toLowerCase());
    if (topic) out.add(topic);
  }
  const hook = String(item.hook ?? '');
  if (/\bvs\b/i.test(hook) || item.cast) out.add('꼴: 대비');
  else if (/^["“「]/.test(hook.trim())) out.add('꼴: 받은 카톡');
  return [...out];
}

/** 게시물 하나의 스냅숏 쌓기. stats.posts[id] = { meta, snaps:[{at, ageH, views, …}] } */
export function addSnapshot(stats, id, meta, metrics, now) {
  stats.posts ??= {};
  const post = (stats.posts[id] ??= { snaps: [] });
  post.meta = { ...post.meta, ...meta };
  const ageH = Math.round((now.getTime() - new Date(meta.postedAt).getTime()) / HOUR);
  const snap = { at: now.toISOString(), ageH, ...pickNumbers(metrics) };
  // 같은 날(12시간 안) 두 번 돌면 바꿔 끼운다
  const last = post.snaps.at(-1);
  if (last && Math.abs(last.ageH - ageH) < 12) post.snaps[post.snaps.length - 1] = snap;
  else post.snaps.push(snap);
  // 기준 나이(3일) 근처 것은 꼭 남기고, 나머지는 최근 것만
  if (post.snaps.length > KEEP_SNAPS) {
    const keep = scoreSnap(post.snaps);
    post.snaps = post.snaps.filter((s, i) => s === keep || i >= post.snaps.length - (KEEP_SNAPS - 1));
  }
  return post;
}

const NUMBERS = ['views', 'reach', 'saved', 'shares', 'likes', 'comments', 'follows', 'profileVisits', 'watchMs'];
function pickNumbers(m = {}) {
  const out = {};
  for (const k of NUMBERS) if (Number.isFinite(Number(m[k])) && m[k] !== null && m[k] !== undefined) out[k] = Number(m[k]);
  return out;
}

/** 점수에 쓸 스냅숏 — 기준 나이(60시간) 이상 중 가장 이른 것. 없으면 null(재는 중) */
export function scoreSnap(snaps = []) {
  return snaps.filter((s) => s.ageH >= SCORE_AGE_H).sort((a, b) => a.ageH - b.ageH)[0] ?? null;
}

/** 100명이 보면 공유·저장·댓글이 몇 번 (공유 3 · 저장 2 · 댓글 1) */
export const spreadOf = (s) => (100 * (3 * (s.shares ?? 0) + 2 * (s.saved ?? 0) + (s.comments ?? 0))) / Math.max(s.reach ?? s.views ?? 0, 30);

const median = (xs) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const round = (x, d = 2) => Math.round(x * 10 ** d) / 10 ** d;

/** 점수가 매겨지는 게시물들 — [{ id, meta, snap, views, spread, viewsIdx, spreadIdx, score }] 와 기준값 */
export function scorePosts(stats) {
  const rows = [];
  for (const [id, post] of Object.entries(stats?.posts ?? {})) {
    const snap = scoreSnap(post.snaps);
    // 캐러셀은 조회가 0 으로 오는 때가 있어 도달보다 작으면 도달로 본다 (조회 ≥ 도달)
    const seen = [snap?.views, snap?.reach].filter(Number.isFinite);
    const views = seen.length ? Math.max(...seen) : NaN;
    if (snap && Number.isFinite(views)) rows.push({ id, meta: post.meta ?? {}, snap, views, spread: spreadOf(snap) });
  }
  const base = { views: median(rows.map((r) => r.views)), spread: median(rows.map((r) => r.spread)) };
  for (const r of rows) {
    r.viewsIdx = Math.log2((r.views + 20) / (base.views + 20));
    r.spreadIdx = Math.log2((r.spread + 2) / (base.spread + 2));
    r.score = r.viewsIdx + r.spreadIdx;
  }
  return { rows, base };
}

/** 표본 n 개 합 sum 을 prior 쪽으로 당긴 평균 */
const shrunk = (sum, n, prior = 0) => (sum + SHRINK * prior) / (n + SHRINK);

function groupBy(rows, keysOf) {
  const out = {};
  for (const r of rows) for (const k of keysOf(r)) (out[k] ??= []).push(r);
  return out;
}

const kindOfFormat = (f) => (/reel/.test(f) ? 'reel' : /carousel|pair/.test(f) ? 'carousel' : 'other');

/**
 * 성과 → 모델. formats: 지금 만들 수 있는 포맷 이름들.
 * 포맷 점수는 같은 종류(릴스·캐러셀)의 평균 쪽으로 당긴다 — 새 포맷도 종류 성적만큼은 믿고 시작
 */
export function learnModel(stats, { formats = [], now = new Date(), slots = WEEK_SLOTS } = {}) {
  const { rows, base } = scorePosts(stats);
  const kinds = groupBy(rows, (r) => [r.meta.kind ?? kindOfFormat(r.meta.format ?? '')]);
  const kindScore = Object.fromEntries(Object.entries(kinds).map(([k, rs]) => [k, shrunk(sum(rs), rs.length)]));
  const byFormat = groupBy(rows, (r) => [r.meta.format ?? 'old']);
  const fmt = {};
  for (const f of new Set([...formats, ...Object.keys(byFormat)])) {
    const rs = byFormat[f] ?? [];
    const prior = kindScore[kindOfFormat(f)] ?? 0;
    fmt[f] = { n: rs.length, mean: rs.length ? round(sum(rs) / rs.length) : null, score: round(shrunk(sum(rs), rs.length, prior)), views: rs.length ? Math.round(avg(rs, 'views')) : null, spread: rs.length ? round(avg(rs, 'spread'), 1) : null };
  }
  const byTopic = groupBy(rows, (r) => r.meta.topics ?? []);
  const topics = Object.fromEntries(
    Object.entries(byTopic).map(([t, rs]) => [t, { n: rs.length, score: round(shrunk(sum(rs), rs.length)), views: Math.round(avg(rs, 'views')), spread: round(avg(rs, 'spread'), 1) }]),
  );
  const ranked = [...rows].sort((a, b) => b.score - a.score);
  const brief = (r) => ({ id: r.id, format: r.meta.format, hook: r.meta.hook, url: r.meta.url, views: r.views, shares: r.snap.shares ?? 0, saved: r.snap.saved ?? 0, spread: round(r.spread, 1), score: round(r.score) });
  const model = {
    at: now.toISOString(),
    scored: rows.length,
    measuring: Object.keys(stats?.posts ?? {}).length - rows.length,
    base: { views: Math.round(base.views), spread: round(base.spread, 1) },
    kinds: Object.fromEntries(Object.entries(kindScore).map(([k, v]) => [k, round(v)])),
    formats: fmt,
    topics,
    best: ranked.slice(0, 3).map(brief),
    worst: ranked.length > 3 ? ranked.slice(-2).reverse().map(brief) : [],
  };
  model.week = planWeek(model, formats, slots);
  return model;
}

const sum = (rs) => rs.reduce((a, r) => a + r.score, 0);
const avg = (rs, k) => rs.reduce((a, r) => a + r[k], 0) / rs.length;

/**
 * 다음 주 칸(기본 7, 하루 둘이면 14) — 점수가 1 높으면(log2) 두 배 자주. 해 본 게 2개 미만인 포맷은 한 칸씩 꼭 시험하고, 한 포맷은 7칸에 3칸 비율까지.
 * 순서는 같은 포맷이 붙지 않게, 칸이 많은 포맷부터 번갈아.
 */
export function planWeek(model, formats, slotCount = WEEK_SLOTS) {
  const WEEK_N = slotCount;
  const CAP = Math.ceil((slotCount * MAX_SLOTS) / WEEK_SLOTS); // 7칸에 3칸 비율
  const list = formats.filter((f) => model.formats?.[f]);
  if (!list.length) return [];
  const weight = Object.fromEntries(list.map((f) => [f, 2 ** model.formats[f].score]));
  const total = list.reduce((a, f) => a + weight[f], 0);
  const raw = Object.fromEntries(list.map((f) => [f, (WEEK_N * weight[f]) / total]));
  const slots = Object.fromEntries(list.map((f) => [f, Math.min(CAP, Math.floor(raw[f]))]));
  const byRemainder = [...list].sort((a, b) => raw[b] - Math.floor(raw[b]) - (raw[a] - Math.floor(raw[a])) || weight[b] - weight[a]);
  const byWeight = [...list].sort((a, b) => weight[b] - weight[a]);
  const used = () => list.reduce((a, f) => a + slots[f], 0);
  for (const f of [...byRemainder, ...byWeight]) if (used() < WEEK_N && slots[f] < CAP) slots[f]++;
  // 시험: 표본이 2개 미만인 포맷은 최소 한 칸 (칸이 가장 많은 포맷에서 가져옴)
  for (const f of list) {
    if (slots[f] > 0 || model.formats[f].n >= 2) continue;
    const donor = [...byWeight].reverse().sort((a, b) => slots[b] - slots[a])[0];
    if (donor && slots[donor] > 1) {
      slots[donor]--;
      slots[f]++;
    }
  }
  while (used() < WEEK_N) {
    const f = byWeight.find((x) => slots[x] < CAP) ?? byWeight[0];
    slots[f]++;
  }
  // 순서: 칸이 남은 포맷 중 바로 앞과 다른 포맷, 되도록 다른 종류(릴스↔캐러셀), 칸 많은·점수 높은 순
  const week = [];
  let prev;
  while (week.length < WEEK_N) {
    const left = [...byWeight].filter((x) => slots[x] > 0).sort((a, b) => slots[b] - slots[a] || weight[b] - weight[a]);
    const other = left.filter((x) => x !== prev);
    const f = other.find((x) => !prev || kindOfFormat(x) !== kindOfFormat(prev)) ?? other[0] ?? left[0];
    if (!f) break;
    week.push(f);
    slots[f]--;
    prev = f;
  }
  return week;
}

/** 이 날 올려도 되는 항목인지 — 창고 항목의 from·until(YYYY-MM-DD, 둘 다 포함) */
export const inWindow = (item, day) => (!item.from || day >= item.from) && (!item.until || day <= item.until);

/**
 * 같은 포맷 후보들 중 고를 순서. 주제 점수(배운 것) + 최근 두 게시물과 주제가 겹치면 감점 + 창고 순서(아주 조금).
 * 안 해 본 주제는 0(평균)이라, 성적이 나쁜 주제보다 먼저 나온다 — 자연스러운 시험
 */
export function rankItems(candidates, model, recentTopics = []) {
  const recent = new Set(recentTopics);
  const scored = candidates.map((item, index) => {
    const ts = topicsOf(item);
    const known = ts.map((t) => model?.topics?.[t]?.score).filter((v) => Number.isFinite(v));
    const topic = known.length ? known.reduce((a, b) => a + b, 0) / ts.length : 0;
    const repeat = ts.some((t) => recent.has(t) && !t.startsWith('꼴:') && t !== '썸') ? 0.3 : 0;
    return { item, value: topic - repeat - index * 0.01 };
  });
  return scored.sort((a, b) => b.value - a.value).map((s) => s.item);
}

const sign = (x) => (x > 0 ? `+${x}` : `${x}`);

/** 사람이 읽는 학습 보고 (마크다운) */
export function reportMarkdown(model) {
  const lines = ['## 지난 성과로 배운 것'];
  if (!model?.scored) {
    lines.push('', '아직 올린 지 3일 지난 게시물이 없어 배운 게 없어요. 이번 주는 기본 구성으로 시험해요.');
    return lines.join('\n');
  }
  lines.push(
    '',
    `점수를 매긴 게시물 ${model.scored}개 (재는 중 ${model.measuring}개) · 계정 기준 조회 ${model.base.views} · 퍼짐 ${model.base.spread}`,
    '> 점수 = 조회 지수 + 퍼짐 지수 (계정 중앙값 대비, +1 이면 두 배). 퍼짐 = 100명이 보면 공유×3·저장×2·댓글 합. 올린 지 3일쯤 숫자로 비교해요.',
    '',
    '| 포맷 | 게시물 | 평균 조회 | 퍼짐 | 점수 | 다음 주 칸 |',
    '|---|---|---|---|---|---|',
  );
  const count = (f) => (model.week ?? []).filter((x) => x === f).length;
  const fmts = Object.entries(model.formats).sort((a, b) => b[1].score - a[1].score);
  for (const [f, s] of fmts) {
    if (!s.n && !count(f)) continue;
    lines.push(`| ${formatName(f)} | ${s.n} | ${s.views ?? '–'} | ${s.spread ?? '–'} | ${sign(s.score)}${s.n < 2 ? ' (시험 중)' : ''} | ${count(f) || '–'} |`);
  }
  const topics = Object.entries(model.topics ?? {}).filter(([, s]) => s.n >= 2).sort((a, b) => b[1].score - a[1].score);
  if (topics.length) {
    lines.push('', `**주제:** ${topics.map(([t, s]) => `${t} ${sign(s.score)}(${s.n})`).join(' · ')}`);
  }
  if (model.best?.length) {
    lines.push('', '**잘 된 것**');
    for (const b of model.best) lines.push(`- ${b.url ? `[${(b.hook ?? b.id).replace(/\n/g, ' ')}](${b.url})` : b.id} — 조회 ${b.views} · 공유 ${b.shares} · 저장 ${b.saved} (${sign(b.score)})`);
  }
  if (model.worst?.length) {
    lines.push('', '**덜 된 것**');
    for (const b of model.worst) lines.push(`- ${b.url ? `[${(b.hook ?? b.id).replace(/\n/g, ' ')}](${b.url})` : b.id} — 조회 ${b.views} · 공유 ${b.shares} · 저장 ${b.saved} (${sign(b.score)})`);
  }
  if (model.week?.length) lines.push('', `**다음 주 구성:** ${model.week.map(formatName).join(' → ')}`);
  return lines.join('\n');
}
