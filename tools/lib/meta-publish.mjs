// 인스타그램(Instagram API with Instagram Login)·쓰레드(Threads API) 게시와 성과 읽기.
// 흐름은 둘 다 같다: 공개 주소의 그림·영상으로 「컨테이너」를 만들고 → 처리 완료를 기다려 → 게시(publish).
// 토큰은 POST 본문에만 싣고 주소·기록에 남기지 않는다. 오류 문구에도 넣지 않는다.
// 참고: 월하(wolha-tools/src/lib/marketing/publish/meta.ts)에서 겪은 함정 — 메타 5xx 는 몇 초 뒤 재시도, 영상은 처리에 1분 안팎.

const IG = 'https://graph.instagram.com/v23.0';
const TH = 'https://graph.threads.net/v1.0';

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
    const err = new Error(`${base === IG ? '인스타' : '쓰레드'} ${method} ${path.replace(/\/\d{6,}/g, '/…')} → ${res.status} ${e.message ?? ''}`.trim());
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

export async function igMe(token) {
  const me = await call('GET', IG, '/me', { fields: 'user_id,username' }, token);
  return { id: String(me.user_id ?? me.id), username: String(me.username ?? '') };
}

async function igPublish(userId, containerId, token) {
  const pub = await call('POST', IG, `/${userId}/media_publish`, { creation_id: containerId }, token);
  const id = String(pub.id ?? '');
  if (!id) throw new Error('인스타 게시 응답에 id 가 없어요');
  const info = await call('GET', IG, `/${id}`, { fields: 'permalink' }, token).catch(() => ({}));
  return { id, url: info.permalink ?? 'https://www.instagram.com/' };
}

/** 사진 1장 · 캐러셀(2~10장) · 릴스. media 는 공개 주소 목록 */
export async function igPost({ userId, token, kind, media, caption }) {
  if (kind === 'reel') {
    const c = await call('POST', IG, `/${userId}/media`, { media_type: 'REELS', video_url: media[0], caption, share_to_feed: 'true' }, token);
    await sleep(15_000);
    await waitReady(IG, c.id, token, 'status_code', 80);
    return igPublish(userId, c.id, token);
  }
  if (kind === 'image') {
    const c = await call('POST', IG, `/${userId}/media`, { image_url: media[0], caption }, token);
    await waitReady(IG, c.id, token, 'status_code', 20);
    return igPublish(userId, c.id, token);
  }
  // 캐러셀: 장마다 컨테이너 → 묶음 컨테이너 → 게시. 순서는 media 순서 그대로
  const children = [];
  for (const url of media) {
    const c = await call('POST', IG, `/${userId}/media`, { image_url: url, is_carousel_item: 'true' }, token);
    children.push(c.id);
  }
  for (const id of children) await waitReady(IG, id, token, 'status_code', 20);
  const c = await call('POST', IG, `/${userId}/media`, { media_type: 'CAROUSEL', children: children.join(','), caption }, token);
  await waitReady(IG, c.id, token, 'status_code', 20);
  return igPublish(userId, c.id, token);
}

export async function igRecent(userId, token, limit = 15) {
  const json = await call('GET', IG, `/${userId}/media`, { fields: 'id,caption,media_type,permalink,timestamp,like_count,comments_count', limit: String(limit) }, token);
  return (json.data ?? []).map((m) => ({ id: m.id, text: m.caption ?? '', type: m.media_type, url: m.permalink, at: m.timestamp, likes: m.like_count, comments: m.comments_count }));
}

/** 게시물 성과 — 지표 이름은 게시물 종류마다 달라서, 안 되는 지표는 빼고 다시 묻는다 */
export async function igInsights(mediaId, token, type) {
  const wanted = type === 'VIDEO' || type === 'REELS' ? ['views', 'reach', 'saved', 'shares', 'total_interactions'] : ['views', 'reach', 'saved', 'shares', 'total_interactions'];
  let metrics = wanted;
  for (let i = 0; i < 3 && metrics.length; i++) {
    try {
      const json = await call('GET', IG, `/${mediaId}/insights`, { metric: metrics.join(',') }, token);
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

/** 장기 토큰(60일) 연장 — 받은 지 24시간이 지나야 된다. 새 토큰을 돌려준다(저장은 부르는 쪽 몫) */
export async function refreshToken(channel, token) {
  const url =
    channel === 'threads'
      ? `https://graph.threads.net/refresh_access_token?${new URLSearchParams({ grant_type: 'th_refresh_token', access_token: token })}`
      : `https://graph.instagram.com/refresh_access_token?${new URLSearchParams({ grant_type: 'ig_refresh_token', access_token: token })}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.access_token) throw new Error(`${channel} 토큰 연장 실패 (${res.status} ${json?.error?.message ?? ''})`.trim());
  return { token: String(json.access_token), expiresInDays: Math.round(Number(json.expires_in ?? 0) / 86400) };
}
