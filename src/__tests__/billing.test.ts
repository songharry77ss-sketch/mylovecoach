import { entitlementFrom } from '@/lib/billing/entitlement';
import { FREE_DAILY, FREE_TRIAL_TOTAL, PRODUCT_IDS, planOfProduct } from '@/lib/billing/plans';
import { consumeFree, dayKey, EMPTY_USAGE, isPremiumActive, quotaLabel, quotaStatus, type PremiumState } from '@/lib/billing/quota';

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date(2026, 8, 18, 12, 0, 0).getTime();

describe('무료 횟수', () => {
  it('처음에는 체험 횟수만큼 쓸 수 있다', () => {
    expect(quotaStatus(null, EMPTY_USAGE, NOW)).toEqual({ kind: 'trial', remaining: FREE_TRIAL_TOTAL });
  });

  it('체험을 다 쓰면 하루 무료 횟수로 넘어가고, 그것도 쓰면 소진된다', () => {
    let usage = EMPTY_USAGE;
    for (let i = 0; i < FREE_TRIAL_TOTAL; i++) usage = consumeFree(usage, NOW);
    // 체험으로 쓴 횟수는 같은 날의 일일 무료 횟수를 깎지 않는다
    expect(quotaStatus(null, usage, NOW)).toEqual({ kind: 'daily', remaining: FREE_DAILY });
    usage = consumeFree(usage, NOW);
    expect(quotaStatus(null, usage, NOW)).toEqual({ kind: 'exhausted', remaining: 0 });
  });

  it('다음 날이 되면 일일 무료 횟수가 다시 충전된다', () => {
    let usage = EMPTY_USAGE;
    for (let i = 0; i < FREE_TRIAL_TOTAL + FREE_DAILY; i++) usage = consumeFree(usage, NOW);
    expect(quotaStatus(null, usage, NOW).kind).toBe('exhausted');
    expect(quotaStatus(null, usage, NOW + DAY)).toEqual({ kind: 'daily', remaining: FREE_DAILY });
    expect(dayKey(NOW)).toBe('2026-09-18');
  });

  it('프리미엄이면 사용량과 무관하게 무제한', () => {
    const usage = { total: 99, day: dayKey(NOW), dayCount: 9 };
    const lifetime: PremiumState = { plan: 'lifetime', productId: PRODUCT_IDS.lifetime, expiresAt: null, verifiedAt: NOW - 400 * DAY };
    expect(quotaStatus(lifetime, usage, NOW)).toEqual({ kind: 'premium', remaining: Infinity });
    expect(quotaLabel(quotaStatus(lifetime, usage, NOW))).toContain('무제한');
  });

  it('안내 문구에 남은 횟수가 들어간다', () => {
    expect(quotaLabel({ kind: 'trial', remaining: 2 })).toContain('2회');
    expect(quotaLabel({ kind: 'exhausted', remaining: 0 })).toContain('내일');
  });
});

describe('프리미엄 유효 기간', () => {
  it('주간 구독: 만료일이 있으면 만료일(+여유 1일) 기준', () => {
    const base = { plan: 'weekly' as const, productId: PRODUCT_IDS.weekly, verifiedAt: NOW - 30 * DAY };
    expect(isPremiumActive({ ...base, expiresAt: NOW + DAY }, NOW)).toBe(true);
    expect(isPremiumActive({ ...base, expiresAt: NOW - DAY / 2 }, NOW)).toBe(true);
    expect(isPremiumActive({ ...base, expiresAt: NOW - 2 * DAY }, NOW)).toBe(false);
  });

  it('주간 구독: 만료일이 없으면(Android) 마지막 확인 후 8일까지만 믿는다', () => {
    const base = { plan: 'weekly' as const, productId: PRODUCT_IDS.weekly, expiresAt: null };
    expect(isPremiumActive({ ...base, verifiedAt: NOW - 7 * DAY }, NOW)).toBe(true);
    expect(isPremiumActive({ ...base, verifiedAt: NOW - 9 * DAY }, NOW)).toBe(false);
  });

  it('구매 내역이 없으면 무료', () => {
    expect(isPremiumActive(null, NOW)).toBe(false);
  });
});

describe('구매 내역 → 프리미엄 판정', () => {
  it('평생권이 구독보다 우선한다', () => {
    const result = entitlementFrom(
      [
        { productId: PRODUCT_IDS.weekly, purchaseState: 'purchased', expirationDateIOS: NOW + DAY },
        { productId: PRODUCT_IDS.lifetime, purchaseState: 'purchased' },
      ],
      NOW,
    );
    expect(result).toEqual({ plan: 'lifetime', productId: PRODUCT_IDS.lifetime, expiresAt: null, verifiedAt: NOW });
  });

  it('만료됐거나 승인 대기·환불된 구매는 인정하지 않는다', () => {
    expect(entitlementFrom([{ productId: PRODUCT_IDS.weekly, purchaseState: 'purchased', expirationDateIOS: NOW - 1 }], NOW)).toBeNull();
    expect(entitlementFrom([{ productId: PRODUCT_IDS.lifetime, purchaseState: 'pending' }], NOW)).toBeNull();
    expect(entitlementFrom([{ productId: PRODUCT_IDS.lifetime, purchaseState: 'purchased', revocationDateIOS: NOW - DAY }], NOW)).toBeNull();
    expect(entitlementFrom([{ productId: 'other.product', purchaseState: 'purchased' }], NOW)).toBeNull();
  });

  it('활성 구독은 가장 늦은 만료일을 쓴다', () => {
    const result = entitlementFrom(
      [
        { productId: PRODUCT_IDS.weekly, purchaseState: 'purchased', expirationDateIOS: NOW + DAY },
        { productId: PRODUCT_IDS.weekly, purchaseState: 'purchased', expirationDateIOS: NOW + 5 * DAY },
      ],
      NOW,
    );
    expect(result?.plan).toBe('weekly');
    expect(result?.expiresAt).toBe(NOW + 5 * DAY);
  });

  it('상품 ID 로 요금제를 찾는다', () => {
    expect(planOfProduct(PRODUCT_IDS.weekly)).toBe('weekly');
    expect(planOfProduct(PRODUCT_IDS.lifetime)).toBe('lifetime');
    expect(planOfProduct('x')).toBeNull();
  });
});
