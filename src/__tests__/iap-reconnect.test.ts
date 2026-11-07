/**
 * 스토어 상품 조회가 실패할 때 (10-29 Android 「상품 정보를 불러오지 못했어요. (query-product)」)
 * - 한 번 실패하면 스토어 연결을 새로 맺고 다시 묻는다
 * - 그래도 실패하면 Google Play 응답 코드를 안내 문구에 붙이고, 원인을 lastStoreProblem 으로 남긴다
 * - 일회성 상품과 구독을 따로 물어서, 한쪽이 실패해도 다른 쪽은 판다
 * - 1년권(2026-11-07): iOS 자동 갱신 없는 구독·Android 선불 요금제라 구독(subs)으로 묻고 산다. 평생권은 더 묻지 않는다
 */
import { yearPassEnd } from '@/lib/billing/plans';

const mockIap = {
  initConnection: jest.fn(async () => true),
  endConnection: jest.fn(async () => true),
  fetchProducts: jest.fn(),
  purchaseUpdatedListener: jest.fn(() => ({ remove: jest.fn() })),
  purchaseErrorListener: jest.fn(() => ({ remove: jest.fn() })),
  isUserCancelledError: jest.fn(() => false),
  getUserFriendlyErrorMessage: jest.fn(() => ''),
  requestPurchase: jest.fn(() => new Promise(() => {})),
  getAvailablePurchases: jest.fn(async () => []),
  finishTransaction: jest.fn(async () => {}),
};
jest.mock('expo-iap', () => mockIap);

type Iap = typeof import('@/lib/billing/iap');
let iap: Iap;

const product = (id: string) => ({ id, displayPrice: `₩${id.length}`, platform: 'ios', type: 'in-app' });
const playError = (responseCode: number) => Object.assign(new Error('Failed to query products'), { code: 'query-product', responseCode });

beforeEach(() => {
  jest.clearAllMocks();
  jest.resetModules();
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- 테스트마다 스토어 연결 상태를 새로 시작한다
  iap = require('@/lib/billing/iap');
});

describe('스토어 상품 조회 실패', () => {
  it('처음 조회가 끊김(-1)으로 실패하면 연결을 새로 맺고 다시 물어 상품을 보여 준다', async () => {
    mockIap.fetchProducts
      .mockRejectedValueOnce(playError(-1))
      .mockResolvedValueOnce([product('mylovecoach.pass.day'), product('mylovecoach.credits.10')])
      .mockResolvedValueOnce([]);

    const list = await iap.loadPlanProducts();

    expect(mockIap.endConnection).toHaveBeenCalledTimes(1);
    expect(mockIap.initConnection).toHaveBeenCalledTimes(2);
    expect(list.find((p) => p.plan === 'day')?.available).toBe(true);
    expect(list.find((p) => p.plan === 'credits')?.available).toBe(true);
    // 구매 이벤트 리스너는 한 번만 붙는다 (다시 연결해도 중복 충전이 생기지 않게)
    expect(mockIap.purchaseUpdatedListener).toHaveBeenCalledTimes(1);
  });

  it('일회성 상품과 구독을 따로 묻는다 — 구독 조회가 실패해도 하루 이용권·횟수권은 판다', async () => {
    mockIap.fetchProducts.mockImplementation(async ({ type }: { type: string }) => {
      if (type === 'subs') throw playError(-2);
      return [product('mylovecoach.pass.day'), product('mylovecoach.credits.10')];
    });

    const list = await iap.loadPlanProducts();

    expect(mockIap.fetchProducts).toHaveBeenCalledWith(expect.objectContaining({ type: 'in-app' }));
    expect(mockIap.fetchProducts).toHaveBeenCalledWith({ skus: ['mylovecoach.premium.weekly', 'mylovecoach.pass.year'], type: 'subs' });
    expect(list.find((p) => p.plan === 'day')?.available).toBe(true);
    expect(list.find((p) => p.plan === 'weekly')?.available).toBe(false);
    expect(list.find((p) => p.plan === 'year')?.available).toBe(false);
  });

  it('다시 물어도 실패하면 기본 목록을 주고, 원인(오류 코드·Google Play 응답 코드)을 남긴다', async () => {
    mockIap.fetchProducts.mockRejectedValue(playError(3));

    const list = await iap.loadPlanProducts();

    expect(list.every((p) => p.available === undefined)).toBe(true);
    expect(iap.lastStoreProblem()).toEqual({ code: 'query-product', responseCode: 3 });
  });

  it('결제 직전 조회가 「결제 사용 불가(3)」로 실패하면 스토어 앱 확인을 안내하고 응답 코드를 붙인다', async () => {
    mockIap.fetchProducts.mockRejectedValue(playError(3));

    const outcome = await iap.purchasePlan({ plan: 'credits', productId: 'mylovecoach.credits.10', displayPrice: '₩4,900' });

    expect(outcome.status).toBe('error');
    if (outcome.status !== 'error') return;
    expect(outcome.message).toContain('스토어 앱을 열어 로그인·업데이트');
    expect(outcome.message).toContain('(query-product · 3)');
    expect(mockIap.requestPurchase).not.toHaveBeenCalled();
  });

  it('결제 직전 조회가 한 번 실패해도 다시 연결해 찾으면 결제 시트를 띄운다', async () => {
    mockIap.fetchProducts.mockRejectedValueOnce(playError(-1)).mockResolvedValueOnce([product('mylovecoach.credits.10')]);

    void iap.purchasePlan({ plan: 'credits', productId: 'mylovecoach.credits.10', displayPrice: '₩4,900' });
    await new Promise((r) => setTimeout(r, 0));

    expect(mockIap.endConnection).toHaveBeenCalledTimes(1);
    expect(mockIap.requestPurchase).toHaveBeenCalledWith({
      type: 'in-app',
      request: { apple: { sku: 'mylovecoach.credits.10' }, google: { skus: ['mylovecoach.credits.10'] } },
    });
    expect(iap.lastStoreProblem()).toEqual({ code: 'query-product', responseCode: -1 });
  });
});

describe('하루 이용권 특가 (타임 세일 상품)', () => {
  it('스토어가 특가 상품을 돌려주면 숫자 가격과 함께 목록 끝에 붙인다', async () => {
    mockIap.fetchProducts.mockImplementation(async ({ type }: { type: string }) =>
      type === 'subs'
        ? []
        : [
            { id: 'mylovecoach.pass.day', displayPrice: '₩2,700', price: 2700, currency: 'KRW', platform: 'android', type: 'in-app' },
            { id: 'mylovecoach.pass.day.sale', displayPrice: '₩1,900', price: 1900, currency: 'KRW', platform: 'android', type: 'in-app' },
          ],
    );

    const list = await iap.loadPlanProducts();

    expect(mockIap.fetchProducts).toHaveBeenCalledWith(expect.objectContaining({ type: 'in-app', skus: expect.arrayContaining(['mylovecoach.pass.day', 'mylovecoach.pass.day.sale']) }));
    expect(list.find((p) => p.sale)).toEqual({ plan: 'day', productId: 'mylovecoach.pass.day.sale', displayPrice: '₩1,900', available: true, sale: true, price: 1900, currency: 'KRW' });
    expect(list.find((p) => p.plan === 'day' && !p.sale)).toMatchObject({ productId: 'mylovecoach.pass.day', price: 2700, available: true });
  });

  it('스토어에 특가 상품이 없으면 목록에 넣지 않는다 (확인 전에는 보여 줄 가격이 없다)', async () => {
    mockIap.fetchProducts.mockImplementation(async ({ type }: { type: string }) => (type === 'subs' ? [] : [product('mylovecoach.pass.day')]));

    const list = await iap.loadPlanProducts();

    expect(list.some((p) => p.sale)).toBe(false);
    expect(list.find((p) => p.plan === 'day')?.available).toBe(true);
  });

  it('특가 결제가 오면 하루 이용권과 똑같이 충전하고 소비 처리한다', async () => {
    const onConsumable = jest.fn();
    await iap.initBilling({ onPremium: jest.fn(), onConsumable });
    const [listener] = mockIap.purchaseUpdatedListener.mock.calls[0] as unknown as [(purchase: unknown) => Promise<void>];
    const purchase = { productId: 'mylovecoach.pass.day.sale', purchaseState: 'purchased', id: 'tx-sale-1' };

    await listener(purchase);

    expect(onConsumable).toHaveBeenCalledWith('day', 'tx-sale-1');
    expect(mockIap.finishTransaction).toHaveBeenCalledWith({ purchase, isConsumable: true });
  });
});

describe('1년권 (iOS 자동 갱신 없는 구독 · Android 선불 요금제)', () => {
  it('평생권은 묻지 않고, 1년권은 주간 구독과 함께 구독(subs)으로 묻는다 — 아이폰 자동 갱신 없는 구독은 in-app 조회에 나오지 않는다', async () => {
    mockIap.fetchProducts.mockImplementation(async ({ type }: { type: string }) =>
      type === 'subs'
        ? [
            { id: 'mylovecoach.premium.weekly', displayPrice: '₩9,900', platform: 'ios', type: 'subs' },
            // OpenIAP Apple 3.4.0 은 자동 갱신 없는 구독을 ProductSubscriptionIOS(type subs, typeIOS non-renewing-subscription)로 준다
            { id: 'mylovecoach.pass.year', displayPrice: '₩29,900', price: 29900, currency: 'KRW', platform: 'ios', type: 'subs', typeIOS: 'non-renewing-subscription' },
          ]
        : [product('mylovecoach.pass.day')],
    );

    const list = await iap.loadPlanProducts();

    const asked = mockIap.fetchProducts.mock.calls.map(([req]) => req as { skus: string[]; type: string });
    expect(asked.find((r) => r.type === 'in-app')?.skus).not.toEqual(expect.arrayContaining(['mylovecoach.pass.year']));
    expect(asked.flatMap((r) => r.skus)).not.toContain('mylovecoach.premium.lifetime');
    expect(list.map((p) => p.plan)).toEqual(['day', 'weekly', 'year', 'credits']);
    // 아이폰은 스토어가 준 가격을 그대로 쓴다 (App Store 가격대가 29,800원이 아닐 수 있다)
    expect(list.find((p) => p.plan === 'year')).toMatchObject({ productId: 'mylovecoach.pass.year', displayPrice: '₩29,900', available: true });
  });

  it('Android 는 1년권 구독의 선불 기본 요금제(year) 오퍼 토큰을 고른다', async () => {
    const android = (id: string, offers: { basePlanIdAndroid: string; offerTokenAndroid: string; displayPrice: string }[]) => ({ id, displayPrice: '', platform: 'android', type: 'subs', subscriptionOffers: offers });
    mockIap.fetchProducts.mockImplementation(async ({ type }: { type: string }) =>
      type === 'subs'
        ? [
            android('mylovecoach.premium.weekly', [{ basePlanIdAndroid: 'weekly', offerTokenAndroid: 'tok-weekly', displayPrice: '₩9,900' }]),
            android('mylovecoach.pass.year', [{ basePlanIdAndroid: 'year', offerTokenAndroid: 'tok-year', displayPrice: '₩29,800' }]),
          ]
        : [],
    );

    const list = await iap.loadPlanProducts();

    expect(list.find((p) => p.plan === 'weekly')).toMatchObject({ offerToken: 'tok-weekly', available: true });
    expect(list.find((p) => p.plan === 'year')).toMatchObject({ offerToken: 'tok-year', displayPrice: '₩29,800', available: true });
  });

  it('1년권 결제는 구독(subs) 흐름 + 선불 요금제 오퍼 토큰으로 연다', async () => {
    mockIap.fetchProducts.mockResolvedValue([{ id: 'mylovecoach.pass.year', displayPrice: '₩29,800', platform: 'android', type: 'subs' }]);

    void iap.purchasePlan({ plan: 'year', productId: 'mylovecoach.pass.year', displayPrice: '₩29,800', offerToken: 'tok-year' });
    await new Promise((r) => setTimeout(r, 0));

    expect(mockIap.fetchProducts).toHaveBeenCalledWith({ skus: ['mylovecoach.pass.year'], type: 'subs' });
    expect(mockIap.requestPurchase).toHaveBeenCalledWith({
      type: 'subs',
      request: { apple: { sku: 'mylovecoach.pass.year' }, google: { skus: ['mylovecoach.pass.year'], subscriptionOffers: [{ sku: 'mylovecoach.pass.year', offerToken: 'tok-year' }] } },
    });
  });

  it('아이폰 1년권 결제가 오면 지급 완료(소비 아님)로 마무리하고, 결제 시각 + 1년까지 프리미엄', async () => {
    const onPremium = jest.fn();
    await iap.initBilling({ onPremium, onConsumable: jest.fn() });
    const [listener] = mockIap.purchaseUpdatedListener.mock.calls[0] as unknown as [(purchase: unknown) => Promise<void>];
    const paidAt = Date.now() - 1000;
    const purchase = { productId: 'mylovecoach.pass.year', purchaseState: 'purchased', id: 'tx-year-1', store: 'apple', transactionDate: paidAt };

    await listener(purchase);

    expect(mockIap.finishTransaction).toHaveBeenCalledWith({ purchase, isConsumable: false });
    // 끝나는 시각 계산 자체(달력 1년·2월 29일)는 billing.test.ts 가 본다
    expect(onPremium).toHaveBeenCalledWith(expect.objectContaining({ plan: 'year', productId: 'mylovecoach.pass.year', expiresAt: yearPassEnd(paidAt) }));
  });
});
