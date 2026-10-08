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
      // 409 같은 상태 오류는 진짜 원인(빠진 항목)이 meta.associatedErrors 안에 들어 있다
      const details = (json.errors ?? []).flatMap((x) => {
        const assoc = Object.values(x.meta?.associatedErrors ?? {}).flat().map((a) => a.detail ?? a.title ?? a.code);
        return [x.detail ?? x.title, ...assoc];
      });
      const e = new Error(`${method} ${path.split('?')[0]} → ${res.status}: ${details.filter(Boolean).join(' | ')}`);
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

/**
 * 심사 묶음에 빠진 상품이 있는지 본다.
 * 처음 내는 구독·비소모성 상품은 API(subscriptionSubmissions·inAppPurchaseSubmissions)로 낼 수 없다(FIRST_SUBSCRIPTION_MUST_BE_SUBMITTED_ON_VERSION).
 * App Store Connect 웹의 버전 페이지 「앱 내 구입 및 구독」에서 골라야 묶음에 들어간다. 안 고른 채 버전만 내면 결제 상품 없이 심사를 받게 된다.
 * 아직 심사에 안 낸(READY_TO_SUBMIT) 상품 수보다 묶음 안의 상품 항목(버전이 아닌 항목)이 적으면 빠진 것으로 본다.
 */
export async function missingProducts({ getAll, appId, submissionId }) {
  const waiting = [];
  for (const g of await getAll(`/v1/apps/${appId}/subscriptionGroups?limit=10`).catch(() => []))
    for (const s of await getAll(`/v1/subscriptionGroups/${g.id}/subscriptions?limit=50`).catch(() => [])) if (s.attributes.state === 'READY_TO_SUBMIT') waiting.push(s.attributes.productId);
  for (const i of await getAll(`/v1/apps/${appId}/inAppPurchasesV2?limit=50`).catch(() => [])) if (i.attributes.state === 'READY_TO_SUBMIT') waiting.push(i.attributes.productId);
  if (!waiting.length) return [];
  const items = await getAll(`/v1/reviewSubmissions/${submissionId}/items?include=appStoreVersion&limit=50`).catch(() => []);
  const productItems = items.filter((it) => !it.relationships?.appStoreVersion?.data).length;
  return productItems < waiting.length ? waiting : [];
}

export const MISSING_PRODUCTS_HELP =
  'App Store Connect 웹 → 앱 → 버전 페이지 「앱 내 구입 및 구독」에서 상품을 고른 뒤 다시 실행하세요. 처음 내는 상품은 API 로 넣을 수 없습니다. 상품 없이 버전만 내려면 --without-products';

/** 원하는 금액과 같은(없으면 가장 가까운) 가격 포인트를 고른다 */
export function pickPricePoint(points, wanted) {
  const priced = points.map((p) => ({ p, price: Number(p.attributes.customerPrice) })).filter((x) => Number.isFinite(x.price));
  priced.sort((a, b) => Math.abs(a.price - wanted) - Math.abs(b.price - wanted));
  return priced[0] ? { point: priced[0].p, price: priced[0].price, exact: priced[0].price === wanted } : null;
}
