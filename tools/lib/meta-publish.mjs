// 인스타그램·쓰레드(Threads API) 게시와 성과 읽기.
// 인스타는 토큰 두 종류를 다 받는다 — 인스타 로그인(graph.instagram.com, 토큰이 IG 로 시작)과
// 페이스북 로그인(graph.facebook.com). 릴스 음원(Audio API)은 페이스북 로그인 토큰에서만 된다.
// 흐름은 둘 다 같다: 공개 주소의 그림·영상으로 「컨테이너」를 만들고 → 처리 완료를 기다려 → 게시(publish).
// 토큰은 POST 본문에만 싣고 주소·기록에 남기지 않는다. 오류 문구에도 넣지 않는다.
// 참고: 월하(wolha-tools/src/lib/marketing/publish/meta.ts)에서 겪은 함정 — 메타 5xx 는 몇 초 뒤 재시도, 영상은 처리에 1분 안팎.
import { igApiFor } from './social.mjs';

const IG_HOSTS = { instagram: 'https://graph.instagram.com/v23.0', facebook: 'https://graph.facebook.com/v23.0' };
const TH = 'https://graph.threads.net/v1.0';

/** 이 토큰이 어느 인스타 API 것인지 — IG_API 환경변수가 있으면 그것, 없으면 토큰 모양으로 */
export const igApi = (token) => igApiFor(token, process.env.IG_API);
const ig = (token) => IG_HOSTS[igApi(token)];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function call(method, base, path, params, token) {
  const body = new URLSearchParams({ ...params, access_token: token });
  const url = method === 'GET' ? `${base}${path}?${body}` : `${base}${path}`;
  const init = method === 'GET' ? {} : { method: 'POST', body, headers: { 'content-type': 'application/x-www-form-urlencoded' } };
  let res;
  for (let i = 0; i < 4; i++) {
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(60_000) });
    if (res.status < 500) break;
    await sleep(4000 * (i + 1));
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = json?.error ?? {};
    const err = new Error(`${base === TH ? '쓰레드' : '인스타'} ${method} ${path.replace(/\/\d{6,}/g, '/…')} → ${res.status} ${e.message ?? ''}`.trim());
    err.code = e.code;
    err.subcode = e.error_subcode;
    throw err;
  }
  return json;
}

/** 컨테이너가 FINISHED 가 될 때까지 기다린다 (그림은 몇 초, 영상은 1분 안팎) */
async function waitReady(base, id, token, field, tries) {
  for (let i = 0; i < tries; i++) {
    const json = await call('GET', base, `/${id}`, { fields: field === 'status' ? 'status,error_message' : 'status_code' }, token);
    const status = String(json[field] ?? '');
    if (status === 'FINISHED') return;
    if (status === 'ERROR' || status === 'EXPIRED') throw new Error(`컨테이너 처리 실패: ${status} ${json.error_message ?? ''}`.trim());
    await sleep(3000);
  }
  throw new Error('컨테이너 처리를 기다리다 시간이 넘었어요');
}

// ───────────────────────── 인스타그램 ─────────────────────────

/**
 * 토큰 주인 인스타 계정 { id, username }.
 * 페이스북 로그인 토큰은 페이스북 페이지에 연결된 인스타 계정을 찾는다 — IG_USER_ID 가 있으면 그 계정,
 * 없으면 expected(계정 이름)와 같은 것, 하나뿐이면 그것.
 */
export async function igMe(token, expected = process.env.SOCIAL_EXPECT_IG) {
  if (igApi(token) === 'instagram') {
    const me = await call('GET', ig(token), '/me', { fields: 'user_id,username' }, token);
    return { id: String(me.user_id ?? me.id), username: String(me.username ?? '') };
  }
  const base = ig(token);
  if (process.env.IG_USER_ID) {
    const me = await call('GET', base, `/${process.env.IG_USER_ID}`, { fields: 'id,username' }, token);
    return { id: String(me.id), username: String(me.username ?? '') };
  }
  const field = 'instagram_business_account{id,username}';
  // 사용자 토큰은 관리하는 페이지 목록에서, 페이지 토큰은 그 페이지에서 찾는다
  let found = [];
  try {
    const pages = await call('GET', base, '/me/accounts', { fields: `name,${field}`, limit: '100' }, token);
    found = (pages.data ?? []).map((p) => p.instagram_business_account).filter(Boolean);
  } catch {
    found = [];
  }
  if (!found.length) {
    const page = await call('GET', base, '/me', { fields: field }, token).catch(() => ({}));
    if (page.instagram_business_account) found = [page.instagram_business_account];
  }
  if (!found.length) throw new Error('이 페이스북 토큰으로 연결된 인스타 계정을 못 찾았어요 (페이지에 인스타 연결 · 권한 instagram_basic·pages_show_list 확인)');
  const pick = (expected && found.find((a) => String(a.username).toLowerCase() === String(expected).toLowerCase())) || (found.length === 1 ? found[0] : null);
  if (!pick) throw new Error(`인스타 계정이 여러 개예요 (${found.map((a) => a.username).join(', ')}) — IG_USER_ID 를 정해 주세요`);
  return { id: String(pick.id), username: String(pick.username ?? '') };
}

async function igPublish(userId, containerId, token) {
  const pub = await call('POST', ig(token), `/${userId}/media_publish`, { creation_id: containerId }, token);
  const id = String(pub.id ?? '');
  if (!id) throw new Error('인스타 게시 응답에 id 가 없어요');
  const info = await call('GET', ig(token), `/${id}`, { fields: 'permalink' }, token).catch(() => ({}));
  return { id, url: info.permalink ?? 'https://www.instagram.com/' };
}

/**
 * 사진 1장 · 캐러셀(2~10장) · 릴스. media 는 공개 주소 목록.
 * audio: 릴스 음원 { id, audioVolume?, videoVolume? } — 페이스북 로그인 토큰일 때만 (Audio API)
 */
export async function igPost({ userId, token, kind, media, caption, audio }) {
  const base = ig(token);
  if (kind === 'reel') {
    const params = { media_type: 'REELS', video_url: media[0], caption, share_to_feed: 'true' };
    if (audio) {
      if (igApi(token) !== 'facebook') throw new Error('릴스 음원은 페이스북 로그인 토큰에서만 붙일 수 있어요');
      params.audio_configuration = JSON.stringify({
        audio_id: String(audio.id),
        ...(audio.audioVolume ? { audio_volume: audio.audioVolume } : {}),
        ...(audio.videoVolume ? { video_volume: audio.videoVolume } : {}),
      });
    }
    const c = await call('POST', base, `/${userId}/media`, params, token);
    await sleep(15_000);
    await waitReady(base, c.id, token, 'status_code', 80);
    return igPublish(userId, c.id, token);
  }
  if (kind === 'image') {
    const c = await call('POST', base, `/${userId}/media`, { image_url: media[0], caption }, token);
    await waitReady(base, c.id, token, 'status_code', 20);
    return igPublish(userId, c.id, token);
  }
  // 캐러셀: 장마다 컨테이너 → 묶음 컨테이너 → 게시. 순서는 media 순서 그대로
  const children = [];
  for (const url of media) {
    const c = await call('POST', base, `/${userId}/media`, { image_url: url, is_carousel_item: 'true' }, token);
    children.push(c.id);
  }
  for (const id of children) await waitReady(base, id, token, 'status_code', 20);
  const c = await call('POST', base, `/${userId}/media`, { media_type: 'CAROUSEL', children: children.join(','), caption }, token);
  await waitReady(base, c.id, token, 'status_code', 20);
  return igPublish(userId, c.id, token);
}

/**
 * 릴스에 붙일 수 있는 음원 찾기 (Audio API, 페이스북 로그인 토큰만).
 * query 가 없으면 지금 인기 음원. 다른 앱에서 쓰도록 허가된 곡만 나와서 인스타 앱 목록과 다를 수 있다.
 */
export async function igAudioSearch({ userId, token, query, type = 'music' }) {
  if (igApi(token) !== 'facebook') throw new Error('음원 찾기는 페이스북 로그인 토큰에서만 돼요 (인스타 로그인 토큰은 안 됨)');
  const params = { audio_type: type, user_id: userId };
  if (query) params.search_query = query;
  const json = await call('GET', ig(token), '/ig_audio', params, token);
  return (json.audio ?? json.data ?? []).map(audioInfo);
}

/** 음원 하나의 정보 (id 로 고정해 둔 곡이 아직 있는지 확인할 때) */
export async function igAudioById({ userId, token, id }) {
  if (igApi(token) !== 'facebook') throw new Error('음원 정보는 페이스북 로그인 토큰에서만 볼 수 있어요');
  return audioInfo(await call('GET', ig(token), `/${id}`, { user_id: userId }, token));
}

const audioInfo = (a) => ({
  id: String(a.audio_id ?? a.id ?? ''),
  title: String(a.title ?? ''),
  artist: String(a.display_artist ?? a.ig_username ?? ''),
  durationMs: Number(a.duration_in_ms ?? 0) || null,
  preview: a.on_platform_audio_preview_link ?? null,
});

export async function igRecent(userId, token, limit = 15) {
  const json = await call('GET', ig(token), `/${userId}/media`, { fields: 'id,caption,media_type,permalink,timestamp,like_count,comments_count', limit: String(limit) }, token);
  return (json.data ?? []).map((m) => ({ id: m.id, text: m.caption ?? '', type: m.media_type, url: m.permalink, at: m.timestamp, likes: m.like_count, comments: m.comments_count }));
}

/** 게시물 성과 — 지표 이름은 게시물 종류마다 달라서, 안 되는 지표는 빼고 다시 묻는다 */
export async function igInsights(mediaId, token, type) {
  const wanted = type === 'VIDEO' || type === 'REELS' ? ['views', 'reach', 'saved', 'shares', 'total_interactions'] : ['views', 'reach', 'saved', 'shares', 'total_interactions'];
  let metrics = wanted;
  for (let i = 0; i < 3 && metrics.length; i++) {
    try {
      const json = await call('GET', ig(token), `/${mediaId}/insights`, { metric: metrics.join(',') }, token);
      return Object.fromEntries((json.data ?? []).map((d) => [d.name, d.values?.[0]?.value ?? d.total_value?.value ?? null]));
    } catch (e) {
      const bad = wanted.find((m) => e.message.includes(m));
      metrics = bad ? metrics.filter((m) => m !== bad) : metrics.slice(1);
    }
  }
  return {};
}

// ───────────────────────── 쓰레드 ─────────────────────────

export async function thMe(token) {
  const me = await call('GET', TH, '/me', { fields: 'id,username' }, token);
  return { id: String(me.id), username: String(me.username ?? '') };
}

/** 글만 · 사진 1장 · 캐러셀(2~20장) */
export async function thPost({ userId, token, kind, media, caption }) {
  let containerId;
  if (kind === 'text') {
    containerId = (await call('POST', TH, `/${userId}/threads`, { media_type: 'TEXT', text: caption }, token)).id;
  } else if (kind === 'image') {
    containerId = (await call('POST', TH, `/${userId}/threads`, { media_type: 'IMAGE', image_url: media[0], text: caption }, token)).id;
  } else {
    const children = [];
    for (const url of media) children.push((await call('POST', TH, `/${userId}/threads`, { media_type: 'IMAGE', image_url: url, is_carousel_item: 'true' }, token)).id);
    for (const id of children) await waitReady(TH, id, token, 'status', 20);
    containerId = (await call('POST', TH, `/${userId}/threads`, { media_type: 'CAROUSEL', children: children.join(','), text: caption }, token)).id;
  }
  await waitReady(TH, containerId, token, 'status', 20);
  const pub = await call('POST', TH, `/${userId}/threads_publish`, { creation_id: containerId }, token);
  const id = String(pub.id ?? '');
  if (!id) throw new Error('쓰레드 게시 응답에 id 가 없어요');
  const info = await call('GET', TH, `/${id}`, { fields: 'permalink' }, token).catch(() => ({}));
  return { id, url: info.permalink ?? 'https://www.threads.com/' };
}

export async function thRecent(userId, token, limit = 15) {
  const json = await call('GET', TH, `/${userId}/threads`, { fields: 'id,text,permalink,timestamp,media_type', limit: String(limit) }, token);
  return (json.data ?? []).map((m) => ({ id: m.id, text: m.text ?? '', type: m.media_type, url: m.permalink, at: m.timestamp }));
}

export async function thInsights(mediaId, token) {
  try {
    const json = await call('GET', TH, `/${mediaId}/insights`, { metric: 'views,likes,replies,reposts,quotes,shares' }, token);
    return Object.fromEntries((json.data ?? []).map((d) => [d.name, d.values?.[0]?.value ?? d.total_value?.value ?? null]));
  } catch {
    return {};
  }
}

// ───────────────────────── 토큰 ─────────────────────────

/**
 * 장기 토큰(60일) 연장 — 받은 지 24시간이 지나야 된다. 새 토큰을 돌려준다(저장은 부르는 쪽 몫).
 * 페이스북 로그인 토큰은 앱 id·비밀값(META_APP_ID·META_APP_SECRET)이 있어야 연장된다. 없으면 그대로 돌려준다
 * (페이지 토큰은 만료가 없어 연장이 필요 없다).
 */
export async function refreshToken(channel, token) {
  let url;
  if (channel === 'threads') url = `https://graph.threads.net/refresh_access_token?${new URLSearchParams({ grant_type: 'th_refresh_token', access_token: token })}`;
  else if (igApi(token) === 'instagram') url = `https://graph.instagram.com/refresh_access_token?${new URLSearchParams({ grant_type: 'ig_refresh_token', access_token: token })}`;
  else {
    const { META_APP_ID: id, META_APP_SECRET: secret } = process.env;
    if (!id || !secret) return { token, expiresInDays: null, note: '페이스북 로그인 토큰 — META_APP_ID·META_APP_SECRET 이 없어 연장하지 않음 (페이지 토큰이면 만료 없음)' };
    url = `${IG_HOSTS.facebook}/oauth/access_token?${new URLSearchParams({ grant_type: 'fb_exchange_token', client_id: id, client_secret: secret, fb_exchange_token: token })}`;
  }
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.access_token) throw new Error(`${channel} 토큰 연장 실패 (${res.status} ${json?.error?.message ?? ''})`.trim());
  const days = json.expires_in ? Math.round(Number(json.expires_in) / 86400) : null;
  return { token: String(json.access_token), expiresInDays: days };
}
