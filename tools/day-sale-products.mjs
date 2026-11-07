// PC 에서 실행: node tools/day-sale-products.mjs [--ios] [--android] [--price <원>] [--shot <심사용 캡처.png>] [--apply] [--secrets <폴더>]
// 하루 이용권 타임 세일용 특가 상품 mylovecoach.pass.day.sale (소모성, 효과는 하루 이용권과 같은 24시간 무제한)을 두 스토어에 만든다.
//
//   기본은 확인만 한다(dry-run) — 상품이 이미 있는지, 원하는 가격에 맞는 App Store 가격대가 있는지 GET 으로만 본다. 아무것도 만들지 않는다.
//   --apply  : 실제로 만든다. --price 가 꼭 있어야 하고(2026-11-07 결정: 2900), 정가 하루 이용권(₩3,900)보다 싸야 한다(거짓 할인 방지).
//   ※ 정가를 ₩3,900 으로 올린 날(11-07)부터 20일이 지난 11-28 이후에 연다 — 할인 전 가격은 최근 20일 실제 판매가 중 가장 낮은 값이어야 한다.
//   --ios / --android : 한쪽 스토어만 (없으면 둘 다)
//   --shot   : App Store 심사용 스크린샷 — 특가가 보이는 결제 화면 캡처(실기기·TestFlight). 없으면 docs/store-assets/iap-review-paywall-sale.png
//
// ※ 상품 ID 는 한 번 만들면 지워도 다시 못 쓴다 → 가격·이름을 확정한 뒤에 --apply.
// ※ App Store: 처음 내는 소모성 상품은 새 앱 버전과 함께 심사에 올려야 한다 — App Store Connect 웹의 버전 페이지
//   「앱 내 구입 및 구독」에서 이 상품을 골라야 묶음에 들어간다(API 불가). 심사용 스크린샷이 없으면 「제출 준비 완료」가 되지 않는다.
// ※ Play: 결제 권한이 든 AAB 가 이미 올라가 있어 바로 만들 수 있다. 만들면 바로 활성(판매 가능)이 되지만, 앱은 특가를 지원하는 새 빌드부터 보여 준다.
// ※ 만들기 전에 src/lib/billing/plans.ts 의 DAY_SALE_PRICE_KRW 를 같은 가격으로 고쳐 서버를 배포한다 (Google 실시간 알림에 금액이 없어 서버가 이 값으로 매출을 적는다). --apply 는 값이 다르면 멈춘다.
// 자세한 순서: docs/DAY_PASS_SALE.md
import { Buffer } from 'node:buffer';
import { createSign } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
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

// 앱 코드(src/lib/billing/plans.ts)와 같은 상품 ID 여야 한다
const PRODUCT_ID = 'mylovecoach.pass.day.sale';
const REGULAR_ID = 'mylovecoach.pass.day';
const REGULAR_PRICE = 3900;
const PACKAGE = 'app.mylovecoach.android';
const LANG = 'ko-KR';
const LOCALE = 'ko';
const TERRITORY = 'KOR';

const priceArg = argOf('--price');
const price = priceArg == null ? null : Number(priceArg);
if (priceArg != null && (!Number.isInteger(price) || price <= 0)) {
  console.error('--price 는 원 단위 정수로 적는다 (예: --price 2900).');
  process.exit(1);
}
if (price != null && price >= REGULAR_PRICE) {
  console.error(`특가(₩${price.toLocaleString()})가 정가 하루 이용권(₩${REGULAR_PRICE.toLocaleString()})보다 싸지 않다 — 앱은 이런 세일을 보여 주지 않는다(거짓 할인 방지).`);
  process.exit(1);
}
if (apply && price == null) {
  console.error('--apply 에는 --price 가 꼭 필요하다 (2026-11-07 결정: --price 2900).');
  process.exit(1);
}
// 순서: 앱·서버의 가격 상수(DAY_SALE_PRICE_KRW)를 먼저 같은 값으로 고쳐 배포한 뒤에 만든다 — 그래야 Android 특가 매출이 「금액 미정」으로 빠지지 않는다
if (apply) {
  const plansSrc = readFileSync(join(repo, 'src', 'lib', 'billing', 'plans.ts'), 'utf8');
  const declared = (plansSrc.match(/DAY_SALE_PRICE_KRW\s*:\s*number\s*\|\s*null\s*=\s*(\d+|null)/) ?? [])[1];
  if (declared !== String(price)) {
    console.error(`src/lib/billing/plans.ts 의 DAY_SALE_PRICE_KRW(${declared ?? '찾지 못함'})가 --price ${price} 와 다르다. 먼저 같은 값으로 고쳐 서버를 배포한 뒤 다시 실행한다 (docs/DAY_PASS_SALE.md).`);
    process.exit(1);
  }
}
const shot = argOf('--shot') ?? join(repo, 'docs', 'store-assets', 'iap-review-paywall-sale.png');

const SALE = {
  productId: PRODUCT_ID,
  reference: '하루 이용권 특가',
  name: '하루 이용권 특가',
  description: '결제 후 24시간 동안 AI 연애 코칭 무제한 (타임 세일)',
  optionId: 'daysale',
  note:
    '하루 이용권(mylovecoach.pass.day)과 효과가 같은 소모성 상품으로, 결제 화면의 타임 세일 동안에만 판매합니다. ' +
    '무료 코칭을 다 쓰거나 마이 탭 → 「이용권 보기」로 결제 화면을 처음 열면 30분 동안 특가가 열리고(남은 시간 표시), 끝나면 정가로 돌아가며 7일 동안 다시 열리지 않습니다. ' +
    '정가(취소선)는 실제 판매 중인 하루 이용권 가격입니다. 결제한 때부터 24시간 동안 코칭 횟수 제한이 없어지며 자동 결제가 없습니다. ' +
    '같은 화면에 구매 복원, 이용약관, 개인정보 처리방침 링크가 있습니다.',
};

console.log(`${apply ? '실제로 만든다' : '확인만 한다 (dry-run — 아무것도 바꾸지 않음)'} · 상품 ${PRODUCT_ID}${price != null ? ` · 특가 ₩${price.toLocaleString()}` : ' · 가격 미정 (사장님 결정 필요, 예: ₩1,900)'}`);

const rel = (type, id) => ({ data: { type, id } });

async function ios() {
  console.log('\n[App Store]');
  const { api, getAll, uploadAsset, findApp } = createAscClient(root);
  const app = await findApp();
  if (!app) return console.log('앱 레코드를 찾지 못했다.');
  const list = await getAll(`/v1/apps/${app.id}/inAppPurchasesV2?limit=50`);
  const regular = list.find((i) => i.attributes.productId === REGULAR_ID);
  let iap = list.find((i) => i.attributes.productId === PRODUCT_ID);
  console.log(`· 정가 하루 이용권 ${REGULAR_ID}: ${regular ? regular.attributes.state : '없음'}`);
  console.log(`· 특가 ${PRODUCT_ID}: ${iap ? `이미 있음 (${iap.attributes.state})` : '없음'}`);
  // 원하는 가격에 맞는 가격대 — 아직 상품이 없으면 정가 하루 이용권의 가격표로 미리 본다 (소모성 가격표는 같다)
  const probe = iap ?? regular;
  if (price != null && probe) {
    const points = await getAll(`/v2/inAppPurchases/${probe.id}/pricePoints?filter[territory]=${TERRITORY}&limit=200`);
    const pick = pickPricePoint(points, price);
    console.log(pick ? `· App Store 가격대: ₩${pick.price.toLocaleString()}${pick.exact ? ' (정확히 맞음)' : ` — ₩${price.toLocaleString()} 가격대가 없어 가장 가까운 값 (Play 와 다르게 표시된다)`}` : '· 가격대를 찾지 못했다');
  }
  if (!existsSync(shot)) console.log(`· 심사용 스크린샷 없음: ${shot} — 특가가 보이는 결제 화면을 실기기·TestFlight 에서 찍어 둔다`);
  if (!apply) return;

  await step(`소모성 상품 ${PRODUCT_ID}`, async () => {
    if (!iap)
      iap = (
        await api('POST', '/v2/inAppPurchases', {
          data: { type: 'inAppPurchases', attributes: { name: SALE.reference, productId: PRODUCT_ID, inAppPurchaseType: 'CONSUMABLE', familySharable: false, reviewNote: SALE.note }, relationships: { app: rel('apps', app.id) } },
        })
      ).data;
    return `${iap.attributes.state ?? ''}`;
  });
  if (!iap) return;
  await step('한국어 표시 이름·설명', async () => {
    const locs = await getAll(`/v2/inAppPurchases/${iap.id}/inAppPurchaseLocalizations?limit=50`);
    const attrs = { name: SALE.name, description: SALE.description };
    const loc = locs.find((l) => l.attributes.locale === LOCALE);
    if (loc) await api('PATCH', `/v1/inAppPurchaseLocalizations/${loc.id}`, { data: { type: 'inAppPurchaseLocalizations', id: loc.id, attributes: attrs } });
    else await api('POST', '/v1/inAppPurchaseLocalizations', { data: { type: 'inAppPurchaseLocalizations', attributes: { locale: LOCALE, ...attrs }, relationships: { inAppPurchaseV2: rel('inAppPurchases', iap.id) } } });
    return '';
  });
  await step('판매 지역 (대한민국)', () =>
    api('POST', '/v1/inAppPurchaseAvailabilities', {
      data: { type: 'inAppPurchaseAvailabilities', attributes: { availableInNewTerritories: false }, relationships: { inAppPurchase: rel('inAppPurchases', iap.id), availableTerritories: { data: [{ type: 'territories', id: TERRITORY }] } } },
    }).then(
      () => '',
      (e) => (e.status === 409 ? '이미 설정됨' : Promise.reject(e)),
    ),
  );
  await step(`가격 ₩${price.toLocaleString()}`, async () => {
    const points = await getAll(`/v2/inAppPurchases/${iap.id}/pricePoints?filter[territory]=${TERRITORY}&limit=200`);
    const pick = pickPricePoint(points, price);
    if (!pick) throw new Error('가격대를 찾지 못했다');
    if (pick.price >= REGULAR_PRICE) throw new Error(`가장 가까운 가격대 ₩${pick.price} 가 정가보다 싸지 않다`);
    await api('POST', '/v1/inAppPurchasePriceSchedules', {
      data: { type: 'inAppPurchasePriceSchedules', relationships: { inAppPurchase: rel('inAppPurchases', iap.id), baseTerritory: rel('territories', TERRITORY), manualPrices: { data: [{ type: 'inAppPurchasePrices', id: '${price1}' }] } } },
      included: [{ type: 'inAppPurchasePrices', id: '${price1}', attributes: { startDate: null }, relationships: { inAppPurchaseV2: rel('inAppPurchases', iap.id), inAppPurchasePricePoint: rel('inAppPurchasePricePoints', pick.point.id) } }],
    });
    return `₩${pick.price}${pick.exact ? '' : ' (가장 가까운 가격대)'}`;
  });
  await step('심사용 스크린샷', async () => {
    const cur = await api('GET', `/v2/inAppPurchases/${iap.id}/appStoreReviewScreenshot`).catch(() => null);
    if (cur?.data) return '이미 있음';
    if (!existsSync(shot)) throw new Error(`파일이 없다: ${shot} (--shot 으로 지정)`);
    const buf = readFileSync(shot);
    const created = (await api('POST', '/v1/inAppPurchaseAppStoreReviewScreenshots', { data: { type: 'inAppPurchaseAppStoreReviewScreenshots', attributes: { fileName: 'paywall-sale.png', fileSize: buf.length }, relationships: { inAppPurchaseV2: rel('inAppPurchases', iap.id) } } })).data;
    await uploadAsset('inAppPurchaseAppStoreReviewScreenshots', created, buf);
    return '';
  });
  console.log('다음: App Store Connect 웹 → 새 버전 페이지 「앱 내 구입 및 구독」에서 「하루 이용권 특가」를 골라 버전과 함께 심사에 제출 (API 불가).');
}

let accessToken = '';
async function playCall(method, url, body) {
  const res = await fetch(url, { method, headers: { Authorization: `Bearer ${accessToken}`, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body == null ? undefined : JSON.stringify(body) });
  const json = res.status === 204 ? {} : await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = new Error(`${method} ${url.replace(/^https:\/\/[^/]+/, '').split('?')[0]} → ${res.status}: ${json.error?.message ?? ''}`);
    e.status = res.status;
    throw e;
  }
  return json;
}

async function android() {
  console.log('\n[Google Play]');
  const sa = JSON.parse(readFileSync(join(root, 'play-service-account.json'), 'utf8'));
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/androidpublisher', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3000 })}`;
  const assertion = `${unsigned}.${createSign('RSA-SHA256').update(unsigned).sign(sa.private_key).toString('base64url')}`;
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }) });
  const token = await tokenRes.json();
  if (!token.access_token) throw new Error(`서비스 계정 인증 실패: ${token.error_description ?? token.error}`);
  accessToken = token.access_token;

  const BASE = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PACKAGE}`;
  const get = (id) => playCall('GET', `${BASE}/oneTimeProducts/${id}`).catch((e) => (e.status === 404 ? null : Promise.reject(e)));
  const regular = await get(REGULAR_ID);
  const exists = await get(PRODUCT_ID);
  const state = (p) => (p?.purchaseOptions ?? []).map((o) => `${o.purchaseOptionId}:${o.state}`).join(', ') || '옵션 없음';
  console.log(`· 정가 하루 이용권 ${REGULAR_ID}: ${regular ? state(regular) : '없음'}`);
  console.log(`· 특가 ${PRODUCT_ID}: ${exists ? `이미 있음 (${state(exists)})` : '없음'}`);
  if (!apply) return;

  await step(`일회성 상품 ${PRODUCT_ID} (₩${price.toLocaleString()})`, async () => {
    const body = {
      packageName: PACKAGE,
      productId: PRODUCT_ID,
      listings: [{ languageCode: LANG, title: SALE.name, description: SALE.description }],
      purchaseOptions: [
        {
          purchaseOptionId: SALE.optionId,
          buyOption: { legacyCompatible: true, multiQuantityEnabled: false },
          regionalPricingAndAvailabilityConfigs: [{ regionCode: 'KR', price: { currencyCode: 'KRW', units: String(price) }, availability: 'AVAILABLE' }],
        },
      ],
    };
    // 생성은 batchUpdate + allowMissing 으로만 가능하다 (tools/play-setup.mjs 와 같은 방식)
    if (!exists)
      await playCall('POST', `${BASE}/oneTimeProducts:batchUpdate`, {
        requests: [{ oneTimeProduct: body, updateMask: 'listings,purchaseOptions', allowMissing: true, regionsVersion: { version: '2022/02' }, latencyTolerance: 'PRODUCT_UPDATE_LATENCY_TOLERANCE_LATENCY_SENSITIVE' }],
      });
    const cur = exists ?? (await playCall('GET', `${BASE}/oneTimeProducts/${PRODUCT_ID}`));
    const opt = (cur.purchaseOptions ?? []).find((o) => o.purchaseOptionId === SALE.optionId);
    if (opt?.state !== 'ACTIVE')
      await playCall('POST', `${BASE}/oneTimeProducts/${PRODUCT_ID}/purchaseOptions:batchUpdateStates`, {
        requests: [{ activatePurchaseOptionRequest: { packageName: PACKAGE, productId: PRODUCT_ID, purchaseOptionId: SALE.optionId } }],
      });
    return exists ? `이미 있음 · 상태 ${opt?.state ?? '?'} → 활성 확인` : '생성 · 활성화';
  });
}

async function main() {
  if (!onlyAndroid) await ios().catch((e) => console.log(`✗ App Store — ${e.message}`));
  if (!onlyIos) await android().catch((e) => console.log(`✗ Google Play — ${e.message}`));
  console.log(
    apply
      ? '\n잊지 말 것: 이용약관에 특가 안내 추가 · 앱은 특가 지원 빌드부터 세일을 보여 준다.'
      : '\n확인만 했다. 실제로 만들려면 가격을 정한 뒤 --apply --price <원> (2026-11-07 결정: --apply --price 2900, 11-28 이후).',
  );
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
