// PC 에서 실행: node tools/asc-iap.mjs [--secrets <폴더>]
// App Store Connect 에 인앱결제 상품 2개를 만든다 (앱 레코드가 먼저 있어야 함). 여러 번 실행해도 안전하다.
//   mylovecoach.premium.weekly   — 자동 갱신 구독 1주, ₩9,900  (구독 그룹 「프리미엄」)
//   mylovecoach.premium.lifetime — 비소모성, ₩29,800
// 각 상품: 한국어 표시 이름·설명, 가격(대한민국 기준), 판매 지역(대한민국), 심사용 스크린샷·메모.
// ※ 첫 인앱결제는 앱 버전과 함께 심사에 올라가야 한다 → 버전 페이지의 「앱 내 구입 및 구독」에서 두 상품을 선택 (화면 작업).
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createAscClient, pickPricePoint, secretsRoot, step } from './lib/asc-api.mjs';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const { api, getAll, uploadAsset, findApp } = createAscClient(secretsRoot(process.argv.slice(2)));

const LOCALE = 'ko';
const TERRITORY = 'KOR';
const REVIEW_SHOT = join(repo, 'docs', 'store-assets', 'iap-review-paywall.png');
const REVIEW_NOTE =
  '무료 코칭(처음 3회 + 이후 하루 1회)을 다 쓰거나, 마이 탭 → 「프리미엄 시작하기」를 누르면 구매 화면이 열립니다. 구매하면 코칭 횟수 제한이 없어집니다. 같은 화면에 구매 복원, 이용약관, 개인정보 처리방침 링크가 있습니다.';

const WEEKLY = { productId: 'mylovecoach.premium.weekly', reference: '주간 프리미엄', name: '주간 프리미엄', description: '횟수 제한 없는 AI 연애 코칭 (매주 자동 갱신)', price: 9900 };
const LIFETIME = { productId: 'mylovecoach.premium.lifetime', reference: '평생 프리미엄', name: '평생 프리미엄', description: '한 번 결제로 횟수 제한 없는 AI 연애 코칭', price: 29800 };
const GROUP = { reference: '프리미엄', name: '프리미엄' };

const rel = (type, id) => ({ data: { type, id } });
/** 이미 만들어져 있어서 나는 409 는 성공으로 본다 (다시 실행해도 안전하도록) */
const tolerate409 = (promise) =>
  promise.then(
    () => '',
    (e) => {
      if (e.status === 409) return '이미 설정됨';
      throw e;
    },
  );
const notes = [];

async function ensureSubscription(app) {
  let group;
  await step(`구독 그룹 「${GROUP.reference}」`, async () => {
    const groups = await getAll(`/v1/apps/${app.id}/subscriptionGroups?limit=50`);
    group = groups.find((g) => g.attributes.referenceName === GROUP.reference);
    if (!group) group = (await api('POST', '/v1/subscriptionGroups', { data: { type: 'subscriptionGroups', attributes: { referenceName: GROUP.reference }, relationships: { app: rel('apps', app.id) } } })).data;
    const locs = await getAll(`/v1/subscriptionGroups/${group.id}/subscriptionGroupLocalizations?limit=50`);
    if (!locs.some((l) => l.attributes.locale === LOCALE))
      await api('POST', '/v1/subscriptionGroupLocalizations', { data: { type: 'subscriptionGroupLocalizations', attributes: { locale: LOCALE, name: GROUP.name }, relationships: { subscriptionGroup: rel('subscriptionGroups', group.id) } } });
    return group.id;
  });
  if (!group) return;

  let sub;
  await step(`구독 상품 ${WEEKLY.productId}`, async () => {
    const subs = await getAll(`/v1/subscriptionGroups/${group.id}/subscriptions?limit=50`);
    sub = subs.find((s) => s.attributes.productId === WEEKLY.productId);
    if (!sub)
      sub = (
        await api('POST', '/v1/subscriptions', {
          data: {
            type: 'subscriptions',
            attributes: { name: WEEKLY.reference, productId: WEEKLY.productId, subscriptionPeriod: 'ONE_WEEK', familySharable: false, groupLevel: 1, reviewNote: REVIEW_NOTE },
            relationships: { group: rel('subscriptionGroups', group.id) },
          },
        })
      ).data;
    return `${sub.attributes.state ?? ''}`;
  });
  if (!sub) return;

  await step('구독: 한국어 표시 이름·설명', async () => {
    const locs = await getAll(`/v1/subscriptions/${sub.id}/subscriptionLocalizations?limit=50`);
    const attrs = { name: WEEKLY.name, description: WEEKLY.description };
    const loc = locs.find((l) => l.attributes.locale === LOCALE);
    if (loc) await api('PATCH', `/v1/subscriptionLocalizations/${loc.id}`, { data: { type: 'subscriptionLocalizations', id: loc.id, attributes: attrs } });
    else await api('POST', '/v1/subscriptionLocalizations', { data: { type: 'subscriptionLocalizations', attributes: { locale: LOCALE, ...attrs }, relationships: { subscription: rel('subscriptions', sub.id) } } });
    return '';
  });

  await step('구독: 판매 지역 (대한민국)', () =>
    tolerate409(
      api('POST', '/v1/subscriptionAvailabilities', {
        data: { type: 'subscriptionAvailabilities', attributes: { availableInNewTerritories: false }, relationships: { subscription: rel('subscriptions', sub.id), availableTerritories: { data: [{ type: 'territories', id: TERRITORY }] } } },
      }),
    ),
  );

  await step(`구독: 가격 ₩${WEEKLY.price.toLocaleString()} / 주`, async () => {
    const existing = await getAll(`/v1/subscriptions/${sub.id}/prices?filter[territory]=${TERRITORY}&limit=50`);
    if (existing.length) return '이미 설정됨';
    const points = await getAll(`/v1/subscriptions/${sub.id}/pricePoints?filter[territory]=${TERRITORY}&limit=200`);
    const pick = pickPricePoint(points, WEEKLY.price);
    if (!pick) throw new Error('가격 포인트를 찾지 못했습니다');
    if (!pick.exact) notes.push(`주간 구독: ₩${WEEKLY.price} 가격 포인트가 없어 가장 가까운 ₩${pick.price} 로 설정했습니다`);
    await api('POST', '/v1/subscriptionPrices', {
      data: {
        type: 'subscriptionPrices',
        attributes: { startDate: null, preserveCurrentPrice: false },
        relationships: { subscription: rel('subscriptions', sub.id), subscriptionPricePoint: rel('subscriptionPricePoints', pick.point.id), territory: rel('territories', TERRITORY) },
      },
    });
    return `₩${pick.price}`;
  });

  await step('구독: 심사용 스크린샷', async () => {
    const cur = await api('GET', `/v1/subscriptions/${sub.id}/appStoreReviewScreenshot`).catch(() => null);
    if (cur?.data) return '이미 있음';
    const buf = readFileSync(REVIEW_SHOT);
    const created = (await api('POST', '/v1/subscriptionAppStoreReviewScreenshots', { data: { type: 'subscriptionAppStoreReviewScreenshots', attributes: { fileName: 'paywall.png', fileSize: buf.length }, relationships: { subscription: rel('subscriptions', sub.id) } } })).data;
    await uploadAsset('subscriptionAppStoreReviewScreenshots', created, buf);
    return '';
  });
}

async function ensureLifetime(app) {
  let iap;
  await step(`비소모성 상품 ${LIFETIME.productId}`, async () => {
    const list = await getAll(`/v1/apps/${app.id}/inAppPurchasesV2?limit=50`);
    iap = list.find((i) => i.attributes.productId === LIFETIME.productId);
    if (!iap)
      iap = (
        await api('POST', '/v2/inAppPurchases', {
          data: { type: 'inAppPurchases', attributes: { name: LIFETIME.reference, productId: LIFETIME.productId, inAppPurchaseType: 'NON_CONSUMABLE', familySharable: false, reviewNote: REVIEW_NOTE }, relationships: { app: rel('apps', app.id) } },
        })
      ).data;
    return `${iap.attributes.state ?? ''}`;
  });
  if (!iap) return;

  await step('평생권: 한국어 표시 이름·설명', async () => {
    const locs = await getAll(`/v2/inAppPurchases/${iap.id}/inAppPurchaseLocalizations?limit=50`);
    const attrs = { name: LIFETIME.name, description: LIFETIME.description };
    const loc = locs.find((l) => l.attributes.locale === LOCALE);
    if (loc) await api('PATCH', `/v1/inAppPurchaseLocalizations/${loc.id}`, { data: { type: 'inAppPurchaseLocalizations', id: loc.id, attributes: attrs } });
    else await api('POST', '/v1/inAppPurchaseLocalizations', { data: { type: 'inAppPurchaseLocalizations', attributes: { locale: LOCALE, ...attrs }, relationships: { inAppPurchaseV2: rel('inAppPurchases', iap.id) } } });
    return '';
  });

  await step('평생권: 판매 지역 (대한민국)', () =>
    tolerate409(
      api('POST', '/v1/inAppPurchaseAvailabilities', {
        data: { type: 'inAppPurchaseAvailabilities', attributes: { availableInNewTerritories: false }, relationships: { inAppPurchase: rel('inAppPurchases', iap.id), availableTerritories: { data: [{ type: 'territories', id: TERRITORY }] } } },
      }),
    ),
  );

  await step(`평생권: 가격 ₩${LIFETIME.price.toLocaleString()}`, async () => {
    const points = await getAll(`/v2/inAppPurchases/${iap.id}/pricePoints?filter[territory]=${TERRITORY}&limit=200`);
    const pick = pickPricePoint(points, LIFETIME.price);
    if (!pick) throw new Error('가격 포인트를 찾지 못했습니다');
    if (!pick.exact) notes.push(`평생권: ₩${LIFETIME.price} 가격 포인트가 없어 가장 가까운 ₩${pick.price} 로 설정했습니다 (앱 화면은 스토어 가격을 그대로 표시)`);
    await api('POST', '/v1/inAppPurchasePriceSchedules', {
      data: {
        type: 'inAppPurchasePriceSchedules',
        relationships: { inAppPurchase: rel('inAppPurchases', iap.id), baseTerritory: rel('territories', TERRITORY), manualPrices: { data: [{ type: 'inAppPurchasePrices', id: '${price1}' }] } },
      },
      included: [
        {
          type: 'inAppPurchasePrices',
          id: '${price1}',
          attributes: { startDate: null },
          relationships: { inAppPurchaseV2: rel('inAppPurchases', iap.id), inAppPurchasePricePoint: rel('inAppPurchasePricePoints', pick.point.id) },
        },
      ],
    });
    return `₩${pick.price}`;
  });

  await step('평생권: 심사용 스크린샷', async () => {
    const cur = await api('GET', `/v2/inAppPurchases/${iap.id}/appStoreReviewScreenshot`).catch(() => null);
    if (cur?.data) return '이미 있음';
    const buf = readFileSync(REVIEW_SHOT);
    const created = (await api('POST', '/v1/inAppPurchaseAppStoreReviewScreenshots', { data: { type: 'inAppPurchaseAppStoreReviewScreenshots', attributes: { fileName: 'paywall.png', fileSize: buf.length }, relationships: { inAppPurchaseV2: rel('inAppPurchases', iap.id) } } })).data;
    await uploadAsset('inAppPurchaseAppStoreReviewScreenshots', created, buf);
    return '';
  });
}

async function main() {
  const app = await findApp();
  if (!app) {
    console.log('앱 레코드가 아직 없습니다. App Store Connect 에서 앱을 만든 뒤 다시 실행하세요.');
    process.exitCode = 2;
    return;
  }
  console.log(`앱: ${app.attributes.name} (id ${app.id})`);
  await ensureSubscription(app);
  await ensureLifetime(app);
  for (const n of notes) console.log(`· ${n}`);
  console.log('\n다음: App Store Connect → 앱 → 버전 1.0.0 → 「앱 내 구입 및 구독」에서 두 상품을 선택해 버전과 함께 심사에 제출합니다.');
  console.log('      (유료 앱 계약·은행·세금 정보가 활성 상태여야 상품이 「제출 준비 완료」가 됩니다)');
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
