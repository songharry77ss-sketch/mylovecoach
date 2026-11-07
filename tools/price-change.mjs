// PC 에서 실행: node tools/price-change.mjs --product <상품 ID> --price <원> [--ios] [--android] [--apply] [--secrets <폴더>]
// 이미 판매 중인 일회성 상품(하루 이용권·횟수권 등)의 한국 가격을 두 스토어에서 바꾼다.
//
//   기본은 확인만 한다(dry-run) — 지금 가격과 바꿀 가격, App Store 에 그 가격대가 있는지 GET 으로만 본다.
//   --apply : 실제로 바꾼다. App Store 는 새 가격 일정(시작일 없음 = 지금부터), Play 는 구매 옵션의 KR 가격을 고친다.
//   --ios / --android : 한쪽 스토어만 (없으면 둘 다)
//
// ※ 하루 이용권(mylovecoach.pass.day)은 src/lib/billing/plans.ts 의 FALLBACK_PRICES.day 를 먼저 같은 가격으로 고쳐
//   서버를 배포한다 — Google 실시간 알림에는 금액이 없어 서버가 이 값으로 매출을 적는다. --apply 는 값이 다르면 멈춘다.
// ※ 구독(주간 구독 등) 가격은 이 도구로 바꾸지 않는다 (기존 구독자 가격 변경 동의 절차가 따로 있다).
// 2026-11-07 사장님 결정: 하루 이용권 ₩2,700 → ₩3,900 (타임 세일 특가 ₩2,900 은 11-28부터 — docs/DAY_PASS_SALE.md)
import { Buffer } from 'node:buffer';
import { createSign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createAscClient, pickPricePoint, secretsRoot, step } from './lib/asc-api.mjs';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const argOf = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
const apply = args.includes('--apply');
const onlyIos = args.includes('--ios') && !args.includes('--android');
const onlyAndroid = args.includes('--android') && !args.includes('--ios');
const root = secretsRoot(args);
const PACKAGE = 'app.mylovecoach.android';
const TERRITORY = 'KOR';

const productId = argOf('--product');
const price = Number(argOf('--price'));
if (!productId || !Number.isInteger(price) || price <= 0) {
  console.error('사용법: node tools/price-change.mjs --product mylovecoach.pass.day --price 3900 [--apply]');
  process.exit(1);
}
const won = (n) => `₩${Number(n).toLocaleString('ko-KR')}`;

// 하루 이용권은 서버가 매출을 적는 가격 상수와 같아야 한다
if (apply && productId === 'mylovecoach.pass.day') {
  const plans = readFileSync(join(repo, 'src', 'lib', 'billing', 'plans.ts'), 'utf8');
  const declared = (plans.match(/^\s*day:\s*'₩([\d,]+)'/m) ?? [])[1]?.replace(/,/g, '');
  if (declared !== String(price)) {
    console.error(`src/lib/billing/plans.ts 의 FALLBACK_PRICES.day(₩${declared ?? '?'})가 ${won(price)} 와 다르다. 먼저 같은 값으로 고쳐 서버를 배포한 뒤 다시 실행한다.`);
    process.exit(1);
  }
}

console.log(`${apply ? '실제로 바꾼다' : '확인만 한다 (dry-run — 아무것도 바꾸지 않음)'} · ${productId} → ${won(price)}`);

// ── App Store ──
async function ios() {
  const { api, getAll, findApp } = createAscClient(root);
  const rel = (type, id) => ({ data: { type, id } });
  const app = await findApp();
  if (!app) throw new Error('App Store Connect 에서 앱을 찾지 못했다');
  const iap = (await getAll(`/v1/apps/${app.id}/inAppPurchasesV2?limit=200`)).find((i) => i.attributes.productId === productId);
  if (!iap) {
    console.log(`✗ App Store: ${productId} 상품이 없다`);
    return;
  }
  let current = '?';
  await step(`App Store 지금 가격 (${iap.attributes.inAppPurchaseType} · ${iap.attributes.state})`, async () => {
    const res = await api('GET', `/v1/inAppPurchasePriceSchedules/${iap.id}/manualPrices?include=inAppPurchasePricePoint,territory&limit=50`);
    const points = new Map((res.included ?? []).filter((x) => x.type === 'inAppPurchasePricePoints').map((x) => [x.id, x.attributes.customerPrice]));
    const rows = (res.data ?? []).map((p) => `${p.relationships?.territory?.data?.id ?? '?'} ${won(points.get(p.relationships?.inAppPurchasePricePoint?.data?.id) ?? '?')}${p.attributes.startDate ? ` (${p.attributes.startDate}부터)` : ''}`);
    current = rows.join(', ') || '없음';
    return current;
  });
  const points = await getAll(`/v2/inAppPurchases/${iap.id}/pricePoints?filter[territory]=${TERRITORY}&limit=200`);
  const pick = pickPricePoint(points, price);
  if (!pick) throw new Error('가격대를 찾지 못했다');
  console.log(`  · 한국 가격대: ${won(pick.price)}${pick.exact ? ' (정확히 있음)' : ' (같은 가격대가 없어 가장 가까운 값)'}`);
  if (!apply) return;
  if (!pick.exact) {
    console.log(`✗ App Store: ${won(price)} 가격대가 없어 바꾸지 않았다 — 가까운 ${won(pick.price)} 로 할지 정한 뒤 --price 를 그 값으로`);
    return;
  }
  await step(`App Store 가격 → ${won(pick.price)} (지금부터)`, async () => {
    await api('POST', '/v1/inAppPurchasePriceSchedules', {
      data: {
        type: 'inAppPurchasePriceSchedules',
        relationships: { inAppPurchase: rel('inAppPurchases', iap.id), baseTerritory: rel('territories', TERRITORY), manualPrices: { data: [{ type: 'inAppPurchasePrices', id: '${price1}' }] } },
      },
      included: [
        { type: 'inAppPurchasePrices', id: '${price1}', attributes: { startDate: null }, relationships: { inAppPurchaseV2: rel('inAppPurchases', iap.id), inAppPurchasePricePoint: rel('inAppPurchasePricePoints', pick.point.id) } },
      ],
    });
    const res = await api('GET', `/v1/inAppPurchasePriceSchedules/${iap.id}/manualPrices?include=inAppPurchasePricePoint&limit=50`);
    const after = (res.included ?? []).filter((x) => x.type === 'inAppPurchasePricePoints').map((x) => won(x.attributes.customerPrice));
    return `확인: ${after.join(', ') || '?'} (이전 ${current})`;
  });
}

// ── Google Play ──
async function android() {
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
  const describe = (p) =>
    (p.purchaseOptions ?? [])
      .map((o) => {
        const kr = (o.regionalPricingAndAvailabilityConfigs ?? []).find((c) => c.regionCode === 'KR');
        return `${o.purchaseOptionId}:${o.state} KR ${kr?.price ? won(kr.price.units) : '?'}`;
      })
      .join(', ');
  const cur = await call('GET', `${BASE}/oneTimeProducts/${productId}`).catch((e) => {
    console.log(`✗ Google Play: ${productId} — ${e.message}`);
    return null;
  });
  if (!cur) return;
  console.log(`✓ Google Play 지금 — ${describe(cur)}`);
  if (!apply) return;
  await step(`Google Play 가격 → ${won(price)} (지금부터)`, async () => {
    const next = structuredClone(cur);
    let changed = 0;
    for (const o of next.purchaseOptions ?? []) {
      for (const c of o.regionalPricingAndAvailabilityConfigs ?? []) {
        if (c.regionCode !== 'KR') continue;
        c.price = { currencyCode: 'KRW', units: String(price) };
        changed++;
      }
    }
    if (!changed) throw new Error('KR 가격 설정을 찾지 못했다');
    await call('POST', `${BASE}/oneTimeProducts:batchUpdate`, {
      requests: [{ oneTimeProduct: next, updateMask: 'purchaseOptions', regionsVersion: { version: '2022/02' }, latencyTolerance: 'PRODUCT_UPDATE_LATENCY_TOLERANCE_LATENCY_SENSITIVE' }],
    });
    const after = await call('GET', `${BASE}/oneTimeProducts/${productId}`);
    return `확인: ${describe(after)}`;
  });
}

try {
  if (!onlyAndroid) await ios().catch((e) => console.log(`✗ App Store — ${e.message}`));
  if (!onlyIos) await android().catch((e) => console.log(`✗ Google Play — ${e.message}`));
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
}
