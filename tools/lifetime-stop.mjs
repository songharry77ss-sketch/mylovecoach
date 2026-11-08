// PC 에서 실행: node tools/lifetime-stop.mjs [--ios] [--android] [--apply] [--secrets <폴더>]
// 평생권(mylovecoach.premium.lifetime) 새 판매를 두 스토어에서 멈춘다 — 2026-11-07 사장님 결정(평생권 → 1년권).
//
//   기본은 확인만 한다(dry-run) — 지금 판매 상태만 GET 으로 본다.
//   --apply : 실제로 멈춘다.
//     App Store : 판매 지역을 비운다(= 판매 중단). 이미 산 사람의 「구매 복원」·이용은 그대로 된다(비소모성 거래 기록은 남는다).
//     Google Play: 구매 옵션을 비활성화한다. 이미 산 사람의 구매 기록은 그대로라 복원·이용이 된다.
//   --ios / --android : 한쪽 스토어만 (없으면 둘 다)
//
// ※ 1.1.1(1년권)이 두 스토어에 공개된 뒤에 실행한다 — 1.1.0 이하 앱의 결제 화면에서는 평생권이 「지금은 살 수 없음」으로 보인다.
// ※ 상품을 지우지 않는다(지우면 복원·서버 검증이 깨질 수 있고 ID 도 다시 못 쓴다).
import { Buffer } from 'node:buffer';
import { createSign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { createAscClient, secretsRoot, step } from './lib/asc-api.mjs';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const onlyIos = args.includes('--ios') && !args.includes('--android');
const onlyAndroid = args.includes('--android') && !args.includes('--ios');
const root = secretsRoot(args);
const PRODUCT_ID = 'mylovecoach.premium.lifetime';
const PACKAGE = 'app.mylovecoach.android';

console.log(`${apply ? '실제로 판매를 멈춘다' : '확인만 한다 (dry-run — 아무것도 바꾸지 않음)'} · ${PRODUCT_ID}`);

async function ios() {
  console.log('\n[App Store]');
  const { api, getAll, findApp } = createAscClient(root);
  const rel = (type, id) => ({ data: { type, id } });
  const app = await findApp();
  if (!app) throw new Error('앱 레코드를 찾지 못했다');
  const iap = (await getAll(`/v1/apps/${app.id}/inAppPurchasesV2?limit=200`)).find((i) => i.attributes.productId === PRODUCT_ID);
  if (!iap) return console.log('· 평생권 상품이 없다');
  const territories = async () => {
    const res = await api('GET', `/v2/inAppPurchases/${iap.id}/inAppPurchaseAvailability?include=availableTerritories`).catch((e) => (e.status === 404 ? null : Promise.reject(e)));
    return (res?.data?.relationships?.availableTerritories?.data ?? []).map((t) => t.id);
  };
  const before = await territories();
  console.log(`· 상태 ${iap.attributes.state} · 판매 지역 ${before.length ? before.join(', ') : '없음(판매 중단)'}`);
  if (!apply || !before.length) return;
  await step('판매 지역 비우기 (판매 중단)', async () => {
    await api('POST', '/v1/inAppPurchaseAvailabilities', {
      data: { type: 'inAppPurchaseAvailabilities', attributes: { availableInNewTerritories: false }, relationships: { inAppPurchase: rel('inAppPurchases', iap.id), availableTerritories: { data: [] } } },
    });
    const after = await territories();
    return `확인: 판매 지역 ${after.length ? after.join(', ') : '없음'}`;
  });
}

async function android() {
  console.log('\n[Google Play]');
  const sa = JSON.parse(readFileSync(join(root, 'play-service-account.json'), 'utf8'));
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/androidpublisher', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3000 })}`;
  const assertion = `${unsigned}.${createSign('RSA-SHA256').update(unsigned).sign(sa.private_key).toString('base64url')}`;
  const tok = await (await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }) })).json();
  if (!tok.access_token) throw new Error(`Play 서비스 계정 인증 실패: ${tok.error_description ?? tok.error}`);
  const BASE = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PACKAGE}`;
  const call = async (method, url, body) => {
    const res = await fetch(url, { method, headers: { Authorization: `Bearer ${tok.access_token}`, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`${method} ${url.replace(/^https:\/\/[^/]+/, '').split('?')[0]} → ${res.status}: ${json.error?.message ?? ''}`);
    return json;
  };
  const states = (p) => (p.purchaseOptions ?? []).map((o) => ({ id: o.purchaseOptionId, state: o.state }));
  const cur = await call('GET', `${BASE}/oneTimeProducts/${PRODUCT_ID}`);
  console.log(`· 구매 옵션 ${states(cur).map((o) => `${o.id}:${o.state}`).join(', ') || '없음'}`);
  if (!apply) return;
  const active = states(cur).filter((o) => o.state === 'ACTIVE');
  if (!active.length) return console.log('· 이미 판매 중이 아니다');
  await step('구매 옵션 비활성화 (판매 중단)', async () => {
    await call('POST', `${BASE}/oneTimeProducts/${PRODUCT_ID}/purchaseOptions:batchUpdateStates`, {
      requests: active.map((o) => ({ deactivatePurchaseOptionRequest: { packageName: PACKAGE, productId: PRODUCT_ID, purchaseOptionId: o.id } })),
    });
    const after = await call('GET', `${BASE}/oneTimeProducts/${PRODUCT_ID}`);
    return `확인: ${states(after).map((o) => `${o.id}:${o.state}`).join(', ')}`;
  });
}

try {
  if (!onlyAndroid) await ios().catch((e) => console.log(`✗ App Store — ${e.message}`));
  if (!onlyIos) await android().catch((e) => console.log(`✗ Google Play — ${e.message}`));
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
}
