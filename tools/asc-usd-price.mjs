// 앱 내 구입(소모성·비소모성) 해외 가격을 달러 기준으로 — 한국 가격은 그대로 (2026-11-27 세계 출시)
//   node tools/asc-usd-price.mjs mylovecoach.pass.day.sale=0.99 [다른상품=가격 …] [--apply]
// 가격 일정을 「기준 지역 USA(달러) + 한국 수동 가격(지금 값 유지)」으로 바꾼다. 다른 지역은 Apple 이 USA 기준으로 자동 환산.
// 구독(주간·1년권)은 이 도구 대상이 아니다. --apply 없으면 확인만.
import { createAscClient, secretsRoot } from './lib/asc-api.mjs';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const targets = args.filter((a) => a.includes('=')).map((a) => {
  const [id, v] = a.split('=');
  return { id, usd: Number(v) };
});
if (!targets.length) {
  console.log('사용법: node tools/asc-usd-price.mjs <상품ID>=<달러> … [--apply]');
  process.exit(1);
}
const { api, getAll, findApp } = createAscClient(secretsRoot(args));
const rel = (type, id) => ({ data: { type, id } });
const app = await findApp();
const iaps = await getAll(`/v1/apps/${app.id}/inAppPurchasesV2?limit=200`);

for (const t of targets) {
  const iap = iaps.find((x) => x.attributes.productId === t.id);
  if (!iap) {
    console.log(`✗ ${t.id}: 상품 없음`);
    process.exitCode = 1;
    continue;
  }
  const sched = await api('GET', `/v2/inAppPurchases/${iap.id}/iapPriceSchedule?include=baseTerritory`);
  const manual = await getAll(`/v1/inAppPurchasePriceSchedules/${sched.data.id}/manualPrices?include=inAppPurchasePricePoint,territory&limit=200`);
  // 지금 한국 수동 가격 (시작일 없는 것 = 현재)
  const krNow = manual.find((p) => p.relationships?.territory?.data?.id === 'KOR' && !p.attributes?.startDate) ?? manual.find((p) => p.relationships?.territory?.data?.id === 'KOR');
  const krPointId = krNow?.relationships?.inAppPurchasePricePoint?.data?.id;
  if (!krPointId) {
    console.log(`✗ ${t.id}: 한국 가격을 찾지 못함 — 건드리지 않음`);
    process.exitCode = 1;
    continue;
  }
  const usPoints = await getAll(`/v2/inAppPurchases/${iap.id}/pricePoints?filter[territory]=USA&limit=200`);
  const us = usPoints.find((p) => Number(p.attributes.customerPrice) === t.usd);
  if (!us) {
    console.log(`✗ ${t.id}: USA ${t.usd} 가격 포인트 없음`);
    process.exitCode = 1;
    continue;
  }
  console.log(`· ${t.id}: 기준 지역 ${sched.data.relationships?.baseTerritory?.data?.id ?? '?'} → USA · USA $${t.usd} · 한국 가격 그대로 유지${apply ? '' : ' (확인만)'}`);
  if (!apply) continue;
  await api('POST', '/v1/inAppPurchasePriceSchedules', {
    data: {
      type: 'inAppPurchasePriceSchedules',
      relationships: {
        inAppPurchase: rel('inAppPurchases', iap.id),
        baseTerritory: rel('territories', 'USA'),
        manualPrices: { data: [{ type: 'inAppPurchasePrices', id: '${us}' }, { type: 'inAppPurchasePrices', id: '${kr}' }] },
      },
    },
    included: [
      { type: 'inAppPurchasePrices', id: '${us}', attributes: { startDate: null }, relationships: { inAppPurchaseV2: rel('inAppPurchases', iap.id), inAppPurchasePricePoint: rel('inAppPurchasePricePoints', us.id) } },
      { type: 'inAppPurchasePrices', id: '${kr}', attributes: { startDate: null }, relationships: { inAppPurchaseV2: rel('inAppPurchases', iap.id), inAppPurchasePricePoint: rel('inAppPurchasePricePoints', krPointId) } },
    ],
  });
  // 확인: 기준 지역과 몇 나라 가격
  const after = await api('GET', `/v2/inAppPurchases/${iap.id}/iapPriceSchedule?include=baseTerritory`);
  const auto = await getAll(`/v1/inAppPurchasePriceSchedules/${after.data.id}/automaticPrices?include=inAppPurchasePricePoint,territory&limit=200`).catch(() => []);
  console.log(`  ✓ 기준 지역 ${after.data.relationships?.baseTerritory?.data?.id} · 자동 환산 지역 ${auto.length}곳`);
}
