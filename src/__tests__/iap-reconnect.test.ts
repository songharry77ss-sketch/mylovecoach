/**
 * 스토어 상품 조회가 실패할 때 (10-29 Android 「상품 정보를 불러오지 못했어요. (query-product)」)
 * - 한 번 실패하면 스토어 연결을 새로 맺고 다시 묻는다
 * - 그래도 실패하면 Google Play 응답 코드를 안내 문구에 붙이고, 원인을 lastStoreProblem 으로 남긴다
 * - 일회성 상품과 구독을 따로 물어서, 한쪽이 실패해도 다른 쪽은 판다
 */
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
      .mockResolvedValueOnce([product('mylovecoach.pass.day'), product('mylovecoach.premium.lifetime')])
      .mockResolvedValueOnce([]);

    const list = await iap.loadPlanProducts();

    expect(mockIap.endConnection).toHaveBeenCalledTimes(1);
    expect(mockIap.initConnection).toHaveBeenCalledTimes(2);
    expect(list.find((p) => p.plan === 'day')?.available).toBe(true);
    expect(list.find((p) => p.plan === 'lifetime')?.available).toBe(true);
    // 구매 이벤트 리스너는 한 번만 붙는다 (다시 연결해도 중복 충전이 생기지 않게)
    expect(mockIap.purchaseUpdatedListener).toHaveBeenCalledTimes(1);
  });

  it('일회성 상품과 구독을 따로 묻는다 — 구독 조회가 실패해도 하루 이용권·평생권은 판다', async () => {
    mockIap.fetchProducts.mockImplementation(async ({ type }: { type: string }) => {
      if (type === 'subs') throw playError(-2);
      return [product('mylovecoach.pass.day'), product('mylovecoach.premium.lifetime')];
    });

    const list = await iap.loadPlanProducts();

    expect(mockIap.fetchProducts).toHaveBeenCalledWith(expect.objectContaining({ type: 'in-app' }));
    expect(mockIap.fetchProducts).toHaveBeenCalledWith({ skus: ['mylovecoach.premium.weekly'], type: 'subs' });
    expect(list.find((p) => p.plan === 'day')?.available).toBe(true);
    expect(list.find((p) => p.plan === 'weekly')?.available).toBe(false);
  });

  it('다시 물어도 실패하면 기본 목록을 주고, 원인(오류 코드·Google Play 응답 코드)을 남긴다', async () => {
    mockIap.fetchProducts.mockRejectedValue(playError(3));

    const list = await iap.loadPlanProducts();

    expect(list.every((p) => p.available === undefined)).toBe(true);
    expect(iap.lastStoreProblem()).toEqual({ code: 'query-product', responseCode: 3 });
  });

  it('결제 직전 조회가 「결제 사용 불가(3)」로 실패하면 스토어 앱 확인을 안내하고 응답 코드를 붙인다', async () => {
    mockIap.fetchProducts.mockRejectedValue(playError(3));

    const outcome = await iap.purchasePlan({ plan: 'lifetime', productId: 'mylovecoach.premium.lifetime', displayPrice: '₩29,800' });

    expect(outcome.status).toBe('error');
    if (outcome.status !== 'error') return;
    expect(outcome.message).toContain('스토어 앱을 열어 로그인·업데이트');
    expect(outcome.message).toContain('(query-product · 3)');
    expect(mockIap.requestPurchase).not.toHaveBeenCalled();
  });

  it('결제 직전 조회가 한 번 실패해도 다시 연결해 찾으면 결제 시트를 띄운다', async () => {
    mockIap.fetchProducts.mockRejectedValueOnce(playError(-1)).mockResolvedValueOnce([product('mylovecoach.premium.lifetime')]);

    void iap.purchasePlan({ plan: 'lifetime', productId: 'mylovecoach.premium.lifetime', displayPrice: '₩29,800' });
    await new Promise((r) => setTimeout(r, 0));

    expect(mockIap.endConnection).toHaveBeenCalledTimes(1);
    expect(mockIap.requestPurchase).toHaveBeenCalledWith({
      type: 'in-app',
      request: { apple: { sku: 'mylovecoach.premium.lifetime' }, google: { skus: ['mylovecoach.premium.lifetime'] } },
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
