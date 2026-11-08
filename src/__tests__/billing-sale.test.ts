/**
 * 하루 이용권 타임 세일 — 정직한 규칙 (lib/billing/sale.ts) 과 특가 상품을 하루 이용권과 똑같이 인정하는지.
 * - 처음 조건에 맞는 결제 화면에서 10분, 끝나면 7일 쉬고 다시 10분. 다시 열어도 처음부터 돌지 않는다
 * - 특가·정가 하루 이용권이 둘 다 스토어에서 확인되고, 숫자로 특가가 더 쌀 때만
 * - 앱(planOfProduct)·서버 알림(_store)·결제 흐름 알림(_funnel-alert)이 특가를 하루 이용권으로 센다
 */
import { reportMessage } from '../../api/daily-report';
import { eventLine } from '../../api/_funnel-alert';
import { formatRevenue, listPriceKrw, planLabel, planOf, storeAlertText, sumRevenue } from '../../api/_store';
import { DAY_PASS_MS, DAY_SALE_PRICE_KRW, DAY_SALE_PRODUCT_ID, PRODUCT_IDS, isConsumablePlan, isSaleProduct, planOfProduct, premiumPlanOfProduct } from '@/lib/billing/plans';
import { EMPTY_WALLET, formatPassEnd, grantConsumable, passEndIfBoughtNow } from '@/lib/billing/quota';
import { SALE_COOLDOWN_MS, SALE_WINDOW_MS, isSaleActive, priceNumber, saleAudience, saleOffer, saleWindow, shouldStartSale } from '@/lib/billing/sale';

const MIN = 60 * 1000;
const DAY = 24 * 60 * MIN;
const T = new Date(2026, 10, 6, 15, 42, 10).getTime(); // 11월 6일 오후 3:42 (기기 현지 시간)

describe('세일 시간 규칙', () => {
  it('10분 동안만, 7일 쉬고 다시 열린다', () => {
    expect(SALE_WINDOW_MS).toBe(10 * MIN);
    expect(SALE_COOLDOWN_MS).toBe(7 * DAY);
  });

  it('아직 시작하지 않았으면 시작할 수 있다', () => {
    expect(saleWindow(null, T)).toMatchObject({ phase: 'ready', endsAt: null, remainingMs: 0 });
    expect(shouldStartSale(null, T)).toBe(true);
    expect(isSaleActive(null, T)).toBe(false);
  });

  it('시작하면 10분 동안 진행되고 남은 시간이 줄어든다 — 다시 계산해도 처음부터 돌지 않는다', () => {
    expect(saleWindow(T, T)).toEqual({ phase: 'active', endsAt: T + 10 * MIN, remainingMs: 10 * MIN, nextOpenAt: T + 10 * MIN + 7 * DAY });
    expect(saleWindow(T, T + 4 * MIN).remainingMs).toBe(6 * MIN);
    expect(shouldStartSale(T, T + 4 * MIN)).toBe(false);
    expect(isSaleActive(T, T + 10 * MIN - 1)).toBe(true);
  });

  it('10분이 지나면 끝나고 7일 동안 다시 열리지 않는다', () => {
    expect(saleWindow(T, T + 10 * MIN)).toMatchObject({ phase: 'cooldown', remainingMs: 0, nextOpenAt: T + 10 * MIN + 7 * DAY });
    expect(shouldStartSale(T, T + 10 * MIN + 7 * DAY - 1)).toBe(false);
    expect(isSaleActive(T, T + 3 * DAY)).toBe(false);
  });

  it('7일이 지나면 다시 시작할 수 있다', () => {
    expect(shouldStartSale(T, T + 10 * MIN + 7 * DAY)).toBe(true);
  });

  it('기기 시계를 되돌려도 10분보다 긴 타이머를 보여 주지 않는다', () => {
    expect(saleWindow(T, T - 10 * MIN)).toMatchObject({ phase: 'cooldown', remainingMs: 0 });
    for (const now of [T, T + 1, T + 9 * MIN]) expect(saleWindow(T, now).remainingMs).toBeLessThanOrEqual(10 * MIN);
  });

  it('이미 무제한인 사람(프리미엄·팀원·하루 이용권 이용 중)에게는 세일을 열지 않는다', () => {
    expect(['premium', 'team', 'pass'].map((k) => saleAudience(k as never))).toEqual([false, false, false]);
    expect(['trial', 'daily', 'bonus', 'credits', 'exhausted'].map((k) => saleAudience(k as never))).toEqual([true, true, true, true, true]);
  });
});

describe('세일 상품 묶음 — 스토어가 둘 다 확인하고 특가가 정말 쌀 때만', () => {
  const regular = { plan: 'day', productId: PRODUCT_IDS.day, displayPrice: '₩2,700', available: true, price: 2700, currency: 'KRW' };
  const sale = { plan: 'day', productId: DAY_SALE_PRODUCT_ID, displayPrice: '₩1,900', available: true, price: 1900, currency: 'KRW', sale: true };
  const lifetime = { plan: 'lifetime', productId: PRODUCT_IDS.lifetime, displayPrice: '₩29,800', available: true };

  it('둘 다 있으면 정가·특가·할인율(내림)', () => {
    expect(saleOffer([regular, lifetime, sale])).toEqual({ regular, sale, percent: 29 });
  });

  it('특가 상품이 스토어에 없거나 확인되지 않으면 없음', () => {
    expect(saleOffer([regular, lifetime])).toBeNull();
    expect(saleOffer([regular, { ...sale, available: false }])).toBeNull();
    expect(saleOffer([{ ...regular, available: undefined }, sale])).toBeNull();
    expect(saleOffer(null)).toBeNull();
  });

  it('정가 하루 이용권이 스토어에 없으면 없음 (취소선 정가를 지어내지 않는다)', () => {
    expect(saleOffer([sale, lifetime])).toBeNull();
  });

  it('특가가 정가보다 싸지 않거나 가격을 비교할 수 없으면 없음 (거짓 할인 방지)', () => {
    expect(saleOffer([regular, { ...sale, price: 2700, displayPrice: '₩2,700' }])).toBeNull();
    expect(saleOffer([regular, { ...sale, price: 3300, displayPrice: '₩3,300' }])).toBeNull();
    expect(saleOffer([{ ...regular, price: null, displayPrice: '$1.99' }, { ...sale, price: null, displayPrice: '$0.99' }])).toBeNull();
    expect(saleOffer([regular, { ...sale, currency: 'USD' }])).toBeNull();
    // 한쪽이라도 통화를 모르면 열지 않는다
    expect(saleOffer([regular, { ...sale, currency: null }])).toBeNull();
    expect(saleOffer([{ ...regular, currency: undefined }, sale])).toBeNull();
  });

  it('숫자 가격이 없으면 원화 표시 가격에서 읽는다', () => {
    expect(priceNumber({ price: null, displayPrice: '₩2,700' })).toBe(2700);
    expect(priceNumber({ price: undefined, displayPrice: '$1.99' })).toBeNull();
    expect(saleOffer([{ ...regular, price: null }, { ...sale, price: null }])?.percent).toBe(29);
  });
});

describe('특가 상품은 하루 이용권과 똑같다', () => {
  it('상품 ID → 하루 이용권(소모성), 프리미엄 아님', () => {
    expect(DAY_SALE_PRODUCT_ID).toBe('mylovecoach.pass.day.sale');
    expect(isSaleProduct(DAY_SALE_PRODUCT_ID)).toBe(true);
    expect(isSaleProduct(PRODUCT_IDS.day)).toBe(false);
    expect(planOfProduct(DAY_SALE_PRODUCT_ID)).toBe('day');
    expect(isConsumablePlan(planOfProduct(DAY_SALE_PRODUCT_ID)!)).toBe(true);
    expect(premiumPlanOfProduct(DAY_SALE_PRODUCT_ID)).toBeNull();
    expect(planOfProduct('constructor')).toBeNull();
  });

  it('충전하면 24시간 (이용 중이면 이어 붙음) — 결제 화면의 「지금 시작하면 …까지」와 같은 계산', () => {
    const wallet = grantConsumable(EMPTY_WALLET, planOfProduct(DAY_SALE_PRODUCT_ID) as 'day', 'tx-sale-1', T)!;
    expect(wallet.passUntil).toBe(T + DAY_PASS_MS);
    expect(passEndIfBoughtNow(0, T)).toBe(T + DAY_PASS_MS);
    expect(passEndIfBoughtNow(T + 5 * 60 * MIN, T)).toBe(T + 5 * 60 * MIN + DAY_PASS_MS);
    // 같은 거래는 두 번 충전하지 않는다
    expect(grantConsumable(wallet, 'day', 'tx-sale-1', T)).toBeNull();
  });

  it('끝나는 시각은 오늘·내일·모레·날짜로', () => {
    expect(formatPassEnd(T + DAY_PASS_MS, T)).toBe('내일 오후 3:42');
    expect(formatPassEnd(T + 2 * DAY_PASS_MS, T)).toBe('모레 오후 3:42');
    expect(formatPassEnd(T + 3 * DAY_PASS_MS, T)).toBe('11월 9일 오후 3:42');
    expect(formatPassEnd(new Date(2026, 10, 6, 23, 5).getTime(), T)).toBe('오늘 오후 11:05');
    expect(formatPassEnd(new Date(2026, 10, 7, 0, 30).getTime(), T)).toBe('내일 오전 12:30');
  });
});

describe('서버 알림이 특가를 하루 이용권으로 센다', () => {
  it('plan 은 day, 이름은 「하루 이용권 특가」, 금액은 정한 특가 가격(정하기 전에는 없음)', () => {
    expect(planOf(DAY_SALE_PRODUCT_ID)).toBe('day');
    expect(planLabel('day', DAY_SALE_PRODUCT_ID)).toBe('하루 이용권 특가');
    expect(planLabel('day', PRODUCT_IDS.day)).toBe('하루 이용권');
    expect(listPriceKrw('day', DAY_SALE_PRODUCT_ID)).toBe(DAY_SALE_PRICE_KRW);
    expect(listPriceKrw('day', PRODUCT_IDS.day)).toBe(3900);
  });

  it('텔레그램 문구', () => {
    const row = { store: 'google' as const, environment: 'Production', kind: 'purchase' as const, notification: 'ONE_TIME_PRODUCT_PURCHASED', product_id: DAY_SALE_PRODUCT_ID, plan: 'day' as const, amount: 1900, currency: 'KRW', transaction_id: 'h', original_transaction_id: 'h', raw: null };
    expect(storeAlertText(row, null)).toBe('💳 결제 · 하루 이용권 특가 ₩1,900 · Android');
  });

  it('앱이 보낸 결제 흐름(sale: true)도 「특가」로 알린다', () => {
    expect(eventLine({ name: 'purchase_start', props: { plan: 'day', sale: true } })).toBe('🛒 결제창 진입 · 하루 이용권 특가');
    expect(eventLine({ name: 'purchase_granted', props: { plan: 'day' } })).toBe('✅ 앱에서 결제 완료 · 하루 이용권 (스토어 확인 알림이 따로 와요)');
  });
});

it('어제 리포트는 정가 하루 이용권과 특가를 따로 센다', () => {
  const text = reportMessage({
    day: '2026-11-06',
    newMembers: 0,
    members: [],
    totalMembers: 1,
    sales: [
      { store: 'google', kind: 'purchase', plan: 'day', product_id: PRODUCT_IDS.day, amount: 2700, currency: 'KRW' },
      { store: 'google', kind: 'purchase', plan: 'day', product_id: DAY_SALE_PRODUCT_ID, amount: 1900, currency: 'KRW' },
    ],
    launches: 1,
    coaching: 1,
    paywall: 1,
    checkout: 1,
  });
  expect(text).toContain(' · Android 하루 이용권 ₩2,700 (1건)');
  expect(text).toContain(' · Android 하루 이용권 특가 ₩1,900 (1건)');
});

describe('금액을 모르는 결제 (가격을 정하기 전의 Android 특가)', () => {
  it('합계에서 빼고 「금액 미정」으로, 건수는 센다', () => {
    const r = sumRevenue([
      { amount: 2700, currency: 'KRW' },
      { amount: null, currency: null },
      { amount: null, currency: 'KRW' },
    ]);
    expect(r).toEqual({ krw: 2700, count: 3, other: {}, unknown: 2 });
    expect(formatRevenue(r)).toBe('₩2,700 + 금액 미정 2건');
    expect(formatRevenue(sumRevenue([{ amount: null, currency: null }]))).toBe('금액 미정');
    expect(formatRevenue(sumRevenue([{ amount: '9900', currency: 'KRW' }, { amount: 1.99, currency: 'USD' }]))).toBe('₩9,900 + USD 1.99');
    expect(formatRevenue(sumRevenue([]))).toBe('₩0');
  });

  it('어제 리포트에 ₩0 대신 「금액 미정」, 합계에는 넣지 않는다', () => {
    const text = reportMessage({
      day: '2026-11-06',
      newMembers: 0,
      members: [],
      totalMembers: 1,
      sales: [
        { store: 'google', kind: 'purchase', plan: 'day', product_id: PRODUCT_IDS.day, amount: 2700, currency: 'KRW' },
        { store: 'google', kind: 'purchase', plan: 'day', product_id: DAY_SALE_PRODUCT_ID, amount: null, currency: null },
      ],
      launches: 1,
      coaching: 1,
      paywall: 1,
      checkout: 1,
    });
    expect(text).toContain('💰 매출 ₩2,700 + 금액 미정 1건 (2건)');
    expect(text).toContain(' · Android 하루 이용권 특가 금액 미정 (1건)');
    expect(text).not.toContain('₩0');
  });
});
