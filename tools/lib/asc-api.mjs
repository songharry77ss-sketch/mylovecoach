// App Store Connect API 공용 도우미 (asc-listing.mjs, asc-iap.mjs 에서 사용). 키 값은 출력하지 않는다.
import { Buffer } from 'node:buffer';
import { createHash, createSign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const BUNDLE_ID = 'app.mylovecoach.ios';

export const secretsRoot = (args) => {
  const i = args.indexOf('--secrets');
  return (i >= 0 ? args[i + 1] : undefined) ?? process.env.MYLOVECOACH_SECRETS ?? join(homedir(), 'wolha-secrets');
};

export const entries = (file) =>
  Object.fromEntries(
    readFileSync(file, 'utf8')
      .split(/\r?\n/)
      .filter((l) => /^[A-Z_]+\s*=/.test(l.trim()))
      .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
  );

export function createAscClient(root) {
  const sign = () => {
    const { KEY_ID, ISSUER_ID } = entries(join(root, 'asc-key.txt'));
    const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const now = Math.floor(Date.now() / 1000);
    const unsigned = `${b64({ alg: 'ES256', kid: KEY_ID, typ: 'JWT' })}.${b64({ iss: ISSUER_ID, iat: now, exp: now + 1100, aud: 'appstoreconnect-v1' })}`;
    const sig = createSign('SHA256').update(unsigned).sign({ key: readFileSync(join(root, 'asc-key.p8')), dsaEncoding: 'ieee-p1363' }).toString('base64url');
    return `${unsigned}.${sig}`;
  };
  let jwt = sign();
  let jwtAt = Date.now();

  async function api(method, path, body) {
    if (Date.now() - jwtAt > 900_000) [jwt, jwtAt] = [sign(), Date.now()];
    const res = await fetch(path.startsWith('http') ? path : `https://api.appstoreconnect.apple.com${path}`, {
      method,
      headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = res.status === 204 ? {} : await res.json().catch(() => ({}));
    if (!res.ok) {
      const e = new Error(`${method} ${path.split('?')[0]} → ${res.status}: ${(json.errors ?? []).map((x) => x.detail ?? x.title).join(' | ')}`);
      e.status = res.status;
      e.errors = json.errors ?? [];
      throw e;
    }
    return json;
  }

  /** 페이지를 끝까지 따라가며 data 를 모은다 */
  async function getAll(path) {
    const out = [];
    let next = path;
    while (next) {
      const page = await api('GET', next);
      out.push(...(page.data ?? []));
      next = page.links?.next;
    }
    return out;
  }

  /** 예약(POST)으로 받은 uploadOperations 대로 파일을 올리고 완료 처리(PATCH)한다 */
  async function uploadAsset(type, created, buf) {
    for (const op of created.attributes.uploadOperations ?? []) {
      const r = await fetch(op.url, { method: op.method, headers: Object.fromEntries(op.requestHeaders.map((h) => [h.name, h.value])), body: buf.subarray(op.offset, op.offset + op.length) });
      if (!r.ok) throw new Error(`파일 업로드 실패 (${r.status})`);
    }
    await api('PATCH', `/v1/${type}/${created.id}`, { data: { type, id: created.id, attributes: { uploaded: true, sourceFileChecksum: createHash('md5').update(buf).digest('hex') } } });
  }

  async function findApp() {
    const apps = await api('GET', `/v1/apps?filter[bundleId]=${BUNDLE_ID}`);
    return apps.data?.[0] ?? null;
  }

  return { api, getAll, uploadAsset, findApp };
}

export const step = async (label, fn) => {
  try {
    const out = await fn();
    console.log(`✓ ${label}${out ? ` — ${out}` : ''}`);
    return true;
  } catch (e) {
    console.log(`✗ ${label} — ${e.message}`);
    return false;
  }
};

/** 원하는 금액과 같은(없으면 가장 가까운) 가격 포인트를 고른다 */
export function pickPricePoint(points, wanted) {
  const priced = points.map((p) => ({ p, price: Number(p.attributes.customerPrice) })).filter((x) => Number.isFinite(x.price));
  priced.sort((a, b) => Math.abs(a.price - wanted) - Math.abs(b.price - wanted));
  return priced[0] ? { point: priced[0].p, price: priced[0].price, exact: priced[0].price === wanted } : null;
}
