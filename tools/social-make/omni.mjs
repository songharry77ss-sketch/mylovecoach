// 사람 장면 영상 만들기 — Google Gemini Omni Flash (Gemini API · Interactions). ai-reel 이 부른다.
//   POST /v1beta/interactions { model, input, response_format: { type: 'video', aspect_ratio, resolution, duration } }
//   (Veo 3.1 미리 보기는 2026-10-22 Gemini API 에서 끝났다 — 안내대로 Omni Flash 로)
// 돈이 든다 (유료 등급만 · 1080p 초당 약 $0.10 — 12초 한 편 약 $1.3). 그래서:
//   - 환경 변수 SOCIAL_AI_VIDEO=on 일 때만 부른다 (없으면 오류 — 자동 생산이 모르는 새 돈을 쓰지 않게)
//   - 한 번 만든 영상은 <폴더>/person.mp4 로 남겨 두고 다시 부르지 않는다
// 키: GEMINI_API_KEY (Google 주소에만 보낸다 · 기록에 남기지 않는다)
import https from 'node:https';

const HOST = 'generativelanguage.googleapis.com';
export const OMNI_MODEL = process.env.OMNI_MODEL || 'gemini-omni-1.2-flash';
/** 해상도별 대략 값 (2026-11 가격표) — 기록용 */
const PER_SEC = { '360p': 0.023, '720p': 0.07, '1080p': 0.104, '4k': 0.209 };

/** https 요청 하나 (fetch 는 응답 머리를 5분까지만 기다려서 직접 쓴다). 구글 주소에만 키를 붙인다 */
function call(method, url, { key, body, timeoutMs = 20 * 60_000, hops = 0 } = {}) {
  const u = new URL(url);
  const data = body ? Buffer.from(JSON.stringify(body)) : null;
  const headers = { ...(u.hostname === HOST && key ? { 'x-goog-api-key': key } : {}), ...(data ? { 'content-type': 'application/json', 'content-length': data.length } : {}) };
  return new Promise((resolve, reject) => {
    const req = https.request(u, { method, headers, timeout: timeoutMs }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && hops < 5) {
        res.resume();
        resolve(call('GET', new URL(res.headers.location, u).toString(), { key, timeoutMs, hops: hops + 1 }));
        return;
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, buf: Buffer.concat(chunks) }));
      res.on('error', reject);
    });
    req.on('timeout', () => req.destroy(new Error(`응답이 ${Math.round(timeoutMs / 1000)}초 넘게 없어요`)));
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

const jsonOf = (r) => {
  try {
    return JSON.parse(r.buf.toString('utf8'));
  } catch {
    return null;
  }
};
const errText = (r) => {
  const j = jsonOf(r);
  return String(j?.error?.message ?? j?.error ?? r.buf.toString('utf8')).replace(/\s+/g, ' ').slice(0, 400);
};

/** 응답 어디에 있든 영상 조각({ type:'video' | mime_type:'video/…', data | uri })을 찾는다 */
export function findVideo(node, depth = 0) {
  if (!node || typeof node !== 'object' || depth > 12) return null;
  const isVideo = node.type === 'video' || /^video\//.test(String(node.mime_type ?? node.mimeType ?? ''));
  if (isVideo && (typeof node.data === 'string' || typeof node.uri === 'string')) return node;
  if (node.output_video && typeof node.output_video === 'object') {
    const v = findVideo({ type: 'video', ...node.output_video }, depth + 1);
    if (v) return v;
  }
  for (const v of Array.isArray(node) ? node : Object.values(node)) {
    const got = findVideo(v, depth + 1);
    if (got) return got;
  }
  return null;
}

/** 다 끝났는지 (상태 이름이 바뀌어도 「진행 중」 류만 기다린다) */
export const pending = (status) => /^(in_progress|queued|pending|running|processing|created|generating)$/i.test(String(status ?? ''));

async function download(video, key) {
  if (typeof video.data === 'string') return Buffer.from(video.data, 'base64');
  let url = video.uri;
  if (/^files\//.test(url)) url = `https://${HOST}/v1beta/${url}`;
  const u = new URL(url);
  if (u.hostname === HOST && /\/files\/[^/:]+$/.test(u.pathname)) {
    // 파일이 준비될 때까지 (ACTIVE)
    for (let i = 0; i < 60; i++) {
      const meta = jsonOf(await call('GET', u.toString(), { key }));
      if (!meta?.state || meta.state === 'ACTIVE') break;
      if (meta.state === 'FAILED') throw new Error('영상 파일 준비 실패');
      await new Promise((r) => setTimeout(r, 5000));
    }
    u.pathname += ':download';
    u.searchParams.set('alt', 'media');
  }
  const r = await call('GET', u.toString(), { key });
  if (r.status !== 200) throw new Error(`영상 받기 실패 (${r.status} · ${errText(r)})`);
  return r.buf;
}

/**
 * 글(+그림) → 세로 영상 MP4 Buffer.
 * opts: { prompt, images?: [{ data: Buffer, mime }], aspectRatio='9:16', resolution='1080p', seconds=12, key, log }
 */
export async function omniVideo({ prompt, images = [], aspectRatio = '9:16', resolution = '1080p', seconds = 12, key = process.env.GEMINI_API_KEY, log = console.log } = {}) {
  if (process.env.SOCIAL_AI_VIDEO !== 'on') throw new Error('AI 영상 만들기가 꺼져 있어요 (SOCIAL_AI_VIDEO=on 일 때만 — 돈이 드는 일이라)');
  if (!key) throw new Error('GEMINI_API_KEY 가 없어요');
  const input = images.length ? [...images.map((im) => ({ type: 'image', data: im.data.toString('base64'), mime_type: im.mime })), { type: 'text', text: prompt }] : prompt;
  const base = { model: OMNI_MODEL, input, response_format: { type: 'video', aspect_ratio: aspectRatio, resolution, duration: `${seconds}s` } };
  const started = Date.now();
  log(`  사람 장면 만드는 중 — ${OMNI_MODEL} · ${resolution} · ${seconds}초 (약 $${((PER_SEC[resolution] ?? 0.1) * seconds).toFixed(2)})`);

  // 뒤에서 만들게(background) 하고 기다린다. 그 옵션을 안 받으면 한 번에 기다리는 방식으로
  let r = await call('POST', `https://${HOST}/v1beta/interactions`, { key, body: { ...base, background: true } });
  if (r.status === 400 && /background/i.test(errText(r))) r = await call('POST', `https://${HOST}/v1beta/interactions`, { key, body: base });
  if (r.status !== 200) throw new Error(`영상 모델이 거절했어요 (${r.status} · ${errText(r)})`);
  let it = jsonOf(r);
  for (let i = 0; it && !findVideo(it) && pending(it.status); i++) {
    if (Date.now() - started > 20 * 60_000) throw new Error('영상이 20분 넘게 안 나와요');
    await new Promise((res) => setTimeout(res, 10_000));
    const g = await call('GET', `https://${HOST}/v1beta/interactions/${encodeURIComponent(it.id)}`, { key });
    if (g.status !== 200) throw new Error(`진행 상황 확인 실패 (${g.status} · ${errText(g)})`);
    it = jsonOf(g);
    if (i % 3 === 2) log(`  … ${Math.round((Date.now() - started) / 1000)}초 (${it?.status})`);
  }
  const video = findVideo(it);
  if (!video) throw new Error(`영상이 안 나왔어요 (상태 ${it?.status ?? '?'} · ${JSON.stringify(it?.error ?? it?.steps?.at?.(-1) ?? {}).slice(0, 300)})`);
  const buf = await download(video, key);
  log(`  사람 장면 ${(buf.length / 1e6).toFixed(1)}MB · ${Math.round((Date.now() - started) / 1000)}초 걸림`);
  return buf;
}
