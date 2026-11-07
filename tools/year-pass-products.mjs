// PC 에서 실행: node tools/year-pass-products.mjs [--ios] [--android] [--shot <심사용 캡처.png>] [--apply] [--secrets <폴더>]
// 2026-11-07 사장님 결정: 「평생권」 판매를 멈추고 「1년권」(₩29,800, 결제한 날부터 1년, 자동 결제 없음)으로 바꾼다.
//   App Store : mylovecoach.pass.year — 자동 갱신 없는 구독(NON_RENEWING_SUBSCRIPTION), ₩29,900(한국 가격대에 ₩29,800 이 없음). 만료는 앱이 거래 시각 + 1년으로 계산한다
//   Play      : mylovecoach.pass.year — 구독 상품의 선불 요금제(prepaid base plan) year, 기간 1년(P1Y), 자동 갱신 없음
// 앱 코드(src/lib/billing/plans.ts)와 같은 상품 ID·요금제 ID 여야 한다.
//
//   기본은 확인만 한다(dry-run) — 상품이 이미 있는지, App Store 에 ₩29,800 가격대가 있는지 GET 으로만 본다.
//   --apply : 실제로 만든다. 상품 ID 는 한 번 만들면 지워도 다시 못 쓴다.
//   --ios / --android : 한쪽 스토어만 (없으면 둘 다)
//   --shot  : App Store 심사용 스크린샷 — 1년권이 보이는 결제 화면. 없으면 docs/store-assets/iap-review-paywall-year.png
//
// ※ App Store: 처음 내는 이 종류 상품은 새 앱 버전(1.1.1)과 함께 심사에 올려야 한다 — App Store Connect 웹의 버전 페이지
//   「앱 내 구입 및 구독」에서 「1년권」을 골라야 묶음에 들어간다(API 불가).
// ※ Play: 만들면 바로 판매 가능. 1.1.0 이하 앱은 이 상품을 묻지 않으니 영향 없음 — 1.1.1 부터 결제 화면에 나온다.
// ※ 평생권(mylovecoach.premium.lifetime)은 이미 산 사람이 계속 쓰므로 지우지 않는다. 판매 중단은 1.1.1 이 나간 뒤 따로.
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

const PRODUCT_ID = 'mylovecoach.pass.year';
const BASE_PLAN = 'year';
const PRICE = 29800;
const PACKAGE = 'app.mylovecoach.android';
const LANG = 'ko-KR';
const LOCALE = 'ko';
const TERRITORY = 'KOR';
const shot = argOf('--shot') ?? join(repo, 'docs', 'store-assets', 'iap-review-paywall-year.png');

const YEAR = {
  reference: '1년권',
  name: '1년권',
  description: '결제한 날부터 1년 동안 AI 연애 코칭 무제한',
  benefits: ['코칭 횟수 제한 없음', '다른 답장 더 보기 무제한', '자동 결제 없음'],
  note:
    '무료 코칭을 다 쓰거나 마이 탭 → 「이용권 보기」를 누르면 구매 화면이 열리고, 「다른 이용권도 있어요」 목록에 1년권이 있습니다. ' +
    '1년권은 1회 결제로 결제한 날부터 1년 동안 코칭 횟수 제한이 없어지는 자동 갱신 없는 구독이며, 기간이 끝나면 자동으로 결제되지 않고 이용이 끝납니다. ' +
    '같은 Apple 계정이면 다른 기기에서도 「구매 복원」으로 이어서 쓸 수 있습니다. 같은 화면에 구매 복원, 이용약관, 개인정보 처리방침 링크가 있습니다.',
};

// 앱 코드와 상품 ID 가 같은지 확인한다 (다르면 만든 상품을 앱이 찾지 못한다)
const plansSrc = readFileSync(join(repo, 'src', 'lib', 'billing', 'plans.ts'), 'utf8');
if (apply && !plansSrc.includes(`'${PRODUCT_ID}'`)) {
  console.error(`src/lib/billing/plans.ts 에 ${PRODUCT_ID} 가 없다 — 앱 코드(1년권)를 먼저 넣은 뒤 만든다.`);
  process.exit(1);
}
const won = (n) => `₩${Number(n).toLocaleString('ko-KR')}`;
console.log(`${apply ? '실제로 만든다' : '확인만 한다 (dry-run — 아무것도 바꾸지 않음)'} · ${PRODUCT_ID} 1년권 ${won(PRICE)}`);

async function ios() {
  const { api, getAll, uploadAsset, findApp } = createAscClient(root);
  const rel = (type, id) => ({ data: { type, id } });
  const tolerate409 = (p) => p.then(() => '', (e) => (e.status === 409 ? '이미 설정됨' : Promise.reject(e)));
  const app = await findApp();
  if (!app) throw new Error('App Store Connect 에서 앱을 찾지 못했다');
  let iap = (await getAll(`/v1/apps/${app.id}/inAppPurchasesV2?limit=200`)).find((i) => i.attributes.productId === PRODUCT_ID);
  console.log(`  · App Store: ${iap ? `이미 있음 (${iap.attributes.inAppPurchaseType} · ${iap.attributes.state})` : '아직 없음'}`);
  if (!apply) {
    if (!existsSync(shot)) console.log(`  · 심사용 스크린샷 없음: ${shot} (1년권이 보이는 결제 화면 캡처가 필요)`);
    return;
  }
  if (!iap)
    await step('App Store: 자동 갱신 없는 구독 만들기', async () => {
      iap = (
        await api('POST', '/v2/inAppPurchases', {
          data: { type: 'inAppPurchases', attributes: { name: YEAR.reference, productId: PRODUCT_ID, inAppPurchaseType: 'NON_RENEWING_SUBSCRIPTION', familySharable: false, reviewNote: YEAR.note }, relationships: { app: rel('apps', app.id) } },
        })
      ).data;
      return iap.attributes.state ?? '';
    });
  if (!iap) return;
  await step('App Store: 한국어 이름·설명', async () => {
    const locs = await getAll(`/v2/inAppPurchases/${iap.id}/inAppPurchaseLocalizations?limit=50`);
    const attrs = { name: YEAR.name, description: YEAR.description };
    const loc = locs.find((l) => l.attributes.locale === LOCALE);
    if (loc) await api('PATCH', `/v1/inAppPurchaseLocalizations/${loc.id}`, { data: { type: 'inAppPurchaseLocalizations', id: loc.id, attributes: attrs } });
    else await api('POST', '/v1/inAppPurchaseLocalizations', { data: { type: 'inAppPurchaseLocalizations', attributes: { locale: LOCALE, ...attrs }, relationships: { inAppPurchaseV2: rel('inAppPurchases', iap.id) } } });
    return '';
  });
  await step('App Store: 판매 지역 (대한민국)', () =>
    tolerate409(
      api('POST', '/v1/inAppPurchaseAvailabilities', {
        data: { type: 'inAppPurchaseAvailabilities', attributes: { availableInNewTerritories: false }, relationships: { inAppPurchase: rel('inAppPurchases', iap.id), availableTerritories: { data: [{ type: 'territories', id: TERRITORY }] } } },
      }),
    ),
  );
  await step(`App Store: 가격 ${won(PRICE)}`, async () => {
    const points = await getAll(`/v2/inAppPurchases/${iap.id}/pricePoints?filter[territory]=${TERRITORY}&limit=200`);
    const pick = pickPricePoint(points, PRICE);
    // App Store 한국 가격대에는 ₩29,800 이 없다 — 평생권처럼 가장 가까운 ₩29,900 을 쓴다(앱은 스토어 가격을 그대로 보여 줌, 약관에 스토어별 가격 표기)
    if (!pick || Math.abs(pick.price - PRICE) > 100) throw new Error(`${won(PRICE)} 근처 가격대가 없다 (가장 가까운 값 ${pick ? won(pick.price) : '?'})`);
    await api('POST', '/v1/inAppPurchasePriceSchedules', {
      data: { type: 'inAppPurchasePriceSchedules', relationships: { inAppPurchase: rel('inAppPurchases', iap.id), baseTerritory: rel('territories', TERRITORY), manualPrices: { data: [{ type: 'inAppPurchasePrices', id: '${price1}' }] } } },
      included: [{ type: 'inAppPurchasePrices', id: '${price1}', attributes: { startDate: null }, relationships: { inAppPurchaseV2: rel('inAppPurchases', iap.id), inAppPurchasePricePoint: rel('inAppPurchasePricePoints', pick.point.id) } }],
    });
    return `${won(pick.price)}${pick.exact ? '' : ` (₩${PRICE.toLocaleString('ko-KR')} 가격대가 없어 가장 가까운 값)`}`;
  });
  await step('App Store: 심사용 스크린샷', async () => {
    const cur = await api('GET', `/v2/inAppPurchases/${iap.id}/appStoreReviewScreenshot`).catch(() => null);
    if (cur?.data) return '이미 있음';
    if (!existsSync(shot)) throw new Error(`파일 없음: ${shot}`);
    const buf = readFileSync(shot);
    const created = (await api('POST', '/v1/inAppPurchaseAppStoreReviewScreenshots', { data: { type: 'inAppPurchaseAppStoreReviewScreenshots', attributes: { fileName: 'paywall-year.png', fileSize: buf.length }, relationships: { inAppPurchaseV2: rel('inAppPurchases', iap.id) } } })).data;
    await uploadAsset('inAppPurchaseAppStoreReviewScreenshots', created, buf);
    return '';
  });
  console.log('  · 다음: App Store Connect 웹 → 1.1.1 버전 페이지 「앱 내 구입 및 구독」에서 「1년권」을 골라 버전과 함께 심사에 올린다.');
}

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
    if (!res.ok) {
      const e = new Error(`${method} ${url.replace(/^https:\/\/[^/]+/, '').split('?')[0]} → ${res.status}: ${json.error?.message ?? ''}`);
      e.status = res.status;
      throw e;
    }
    return json;
  };
  const exists = await call('GET', `${BASE}/subscriptions/${PRODUCT_ID}`).catch((e) => (e.status === 404 ? null : Promise.reject(e)));
  const plan = exists?.basePlans?.find((b) => b.basePlanId === BASE_PLAN);
  console.log(`  · Google Play: ${exists ? `이미 있음 (요금제 ${BASE_PLAN}: ${plan?.state ?? '없음'})` : '아직 없음'}`);
  if (!apply) return;
  await step(`Google Play: 구독 ${PRODUCT_ID} · 선불 요금제 ${BASE_PLAN} (1년, ${won(PRICE)})`, async () => {
    if (!exists)
      await call('POST', `${BASE}/subscriptions?productId=${PRODUCT_ID}&regionsVersion.version=2022/02`, {
        packageName: PACKAGE,
        productId: PRODUCT_ID,
        listings: [{ languageCode: LANG, title: YEAR.name, description: YEAR.description, benefits: YEAR.benefits }],
        basePlans: [
          {
            basePlanId: BASE_PLAN,
            prepaidBasePlanType: { billingPeriodDuration: 'P1Y', timeExtension: 'TIME_EXTENSION_ACTIVE' },
            regionalConfigs: [{ regionCode: 'KR', newSubscriberAvailability: true, price: { currencyCode: 'KRW', units: String(PRICE) } }],
          },
        ],
      });
    const cur = exists ?? (await call('GET', `${BASE}/subscriptions/${PRODUCT_ID}`));
    const bp = (cur.basePlans ?? []).find((b) => b.basePlanId === BASE_PLAN);
    if (bp?.state !== 'ACTIVE') await call('POST', `${BASE}/subscriptions/${PRODUCT_ID}/basePlans/${BASE_PLAN}:activate`, {});
    const after = await call('GET', `${BASE}/subscriptions/${PRODUCT_ID}`);
    const a = (after.basePlans ?? []).find((b) => b.basePlanId === BASE_PLAN);
    return `${exists ? '이미 있음' : '생성'} · 요금제 ${a?.state ?? '?'} · KR ${won(a?.regionalConfigs?.find((c) => c.regionCode === 'KR')?.price?.units ?? '?')}`;
  });
}

if (!onlyAndroid) await ios().catch((e) => console.log(`✗ App Store — ${e.message}`));
if (!onlyIos) await android().catch((e) => console.log(`✗ Google Play — ${e.message}`));
