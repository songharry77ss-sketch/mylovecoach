import { entitlementFrom } from '@/lib/billing/entitlement';
import {
  CREDITS_PER_PACK,
  DAY_PASS_MS,
  FALLBACK_PRICES,
  FREE_DAILY,
  FREE_TRIAL_TOTAL,
  GUEST_TRIAL_TOTAL,
  PRODUCT_IDS,
  SELLING_PLANS,
  SIGNUP_BONUS,
  freeRules,
  isConsumablePlan,
  isSubscriptionPlan,
  planOfProduct,
  premiumPlanOfProduct,
  yearPassEnd,
} from '@/lib/billing/plans';
import {
  consumeFree,
  consumeOne,
  dayKey,
  EMPTY_USAGE,
  EMPTY_WALLET,
  grantConsumable,
  grantSignupBonus,
  isPremiumActive,
  isTeamActive,
  premiumUntilLabel,
  premiumUntilSentence,
  quotaLabel,
  quotaStatus,
  type PremiumState,
  type TeamState,
} from '@/lib/billing/quota';

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date(2026, 8, 18, 12, 0, 0).getTime();

describe('무료 횟수', () => {
  it('처음에는 체험 횟수만큼 쓸 수 있다', () => {
    expect(quotaStatus(null, EMPTY_USAGE, NOW)).toEqual({ kind: 'trial', remaining: FREE_TRIAL_TOTAL, free: FREE_TRIAL_TOTAL, credits: 0 });
  });

  it('체험을 다 쓰면 하루 무료 횟수로 넘어가고, 그것도 쓰면 소진된다', () => {
    let usage = EMPTY_USAGE;
    for (let i = 0; i < FREE_TRIAL_TOTAL; i++) usage = consumeFree(usage, NOW);
    // 체험으로 쓴 횟수는 같은 날의 일일 무료 횟수를 깎지 않는다
    expect(quotaStatus(null, usage, NOW)).toEqual({ kind: 'daily', remaining: FREE_DAILY, free: FREE_DAILY, credits: 0 });
    usage = consumeFree(usage, NOW);
    expect(quotaStatus(null, usage, NOW)).toEqual({ kind: 'exhausted', remaining: 0, free: 0, credits: 0 });
  });

  it('다음 날이 되면 일일 무료 횟수가 다시 충전된다', () => {
    let usage = EMPTY_USAGE;
    for (let i = 0; i < FREE_TRIAL_TOTAL + FREE_DAILY; i++) usage = consumeFree(usage, NOW);
    expect(quotaStatus(null, usage, NOW).kind).toBe('exhausted');
    expect(quotaStatus(null, usage, NOW + DAY)).toEqual({ kind: 'daily', remaining: FREE_DAILY, free: FREE_DAILY, credits: 0 });
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
    expect(planOfProduct(PRODUCT_IDS.day)).toBe('day');
    expect(planOfProduct(PRODUCT_IDS.credits)).toBe('credits');
    expect(planOfProduct('x')).toBeNull();
    expect(premiumPlanOfProduct(PRODUCT_IDS.day)).toBeNull();
    expect(isConsumablePlan('day')).toBe(true);
    expect(isConsumablePlan('weekly')).toBe(false);
  });

  it('하루 이용권·횟수권은 프리미엄으로 치지 않는다', () => {
    expect(entitlementFrom([{ productId: PRODUCT_IDS.day, purchaseState: 'purchased' }], NOW)).toBeNull();
  });
});

describe('하루 이용권 · 횟수권', () => {
  it('하루 이용권은 24시간 무제한이고, 이어서 사면 24시간이 더 붙는다', () => {
    const once = grantConsumable(EMPTY_WALLET, 'day', 'tx1', NOW)!;
    expect(once.passUntil).toBe(NOW + DAY_PASS_MS);
    expect(quotaStatus(null, EMPTY_USAGE, NOW + DAY_PASS_MS - 1, once)).toEqual({ kind: 'pass', remaining: Infinity, until: NOW + DAY_PASS_MS });
    expect(quotaStatus(null, EMPTY_USAGE, NOW + DAY_PASS_MS + 1, once).kind).toBe('trial');
    const twice = grantConsumable(once, 'day', 'tx2', NOW + 1000)!;
    expect(twice.passUntil).toBe(NOW + 2 * DAY_PASS_MS);
    expect(quotaLabel(quotaStatus(null, EMPTY_USAGE, NOW, twice))).toContain('하루 이용권');
  });

  it('같은 거래는 두 번 충전하지 않는다', () => {
    const once = grantConsumable(EMPTY_WALLET, 'credits', 'tx1', NOW)!;
    expect(once.credits).toBe(CREDITS_PER_PACK);
    expect(grantConsumable(once, 'credits', 'tx1', NOW)).toBeNull();
  });

  it('무료 횟수를 먼저 쓰고, 그다음 횟수권을 쓴다', () => {
    let usage = EMPTY_USAGE;
    let wallet = grantConsumable(EMPTY_WALLET, 'credits', 'tx1', NOW)!;
    expect(quotaStatus(null, usage, NOW, wallet)).toEqual({ kind: 'trial', remaining: FREE_TRIAL_TOTAL + CREDITS_PER_PACK, free: FREE_TRIAL_TOTAL, credits: CREDITS_PER_PACK });
    for (let i = 0; i < FREE_TRIAL_TOTAL + FREE_DAILY; i++) ({ usage, wallet } = consumeOne(null, usage, wallet, NOW));
    expect(wallet.credits).toBe(CREDITS_PER_PACK);
    expect(quotaStatus(null, usage, NOW, wallet)).toEqual({ kind: 'credits', remaining: CREDITS_PER_PACK, free: 0, credits: CREDITS_PER_PACK });
    ({ usage, wallet } = consumeOne(null, usage, wallet, NOW));
    expect(wallet.credits).toBe(CREDITS_PER_PACK - 1);
    expect(quotaLabel(quotaStatus(null, usage, NOW, wallet))).toContain(`${CREDITS_PER_PACK - 1}회`);
  });

  it('프리미엄·하루 이용권이면 아무것도 차감하지 않는다', () => {
    const lifetime: PremiumState = { plan: 'lifetime', productId: PRODUCT_IDS.lifetime, expiresAt: null, verifiedAt: NOW };
    const wallet = { ...EMPTY_WALLET, credits: 3 };
    expect(consumeOne(lifetime, EMPTY_USAGE, wallet, NOW)).toEqual({ usage: EMPTY_USAGE, wallet });
    const pass = grantConsumable(wallet, 'day', 'tx', NOW)!;
    expect(consumeOne(null, EMPTY_USAGE, pass, NOW)).toEqual({ usage: EMPTY_USAGE, wallet: pass });
  });
});

describe('팀원 무제한', () => {
  const team: TeamState = { label: '디자인 지민', verifiedAt: NOW };
  const spent = { total: FREE_TRIAL_TOTAL, day: dayKey(NOW), dayCount: FREE_DAILY };

  it('관리자가 허용한 팀원은 무료 횟수를 다 써도 무제한이다', () => {
    expect(quotaStatus(null, spent, NOW, EMPTY_WALLET, team)).toEqual({ kind: 'team', remaining: Infinity });
    expect(quotaLabel(quotaStatus(null, spent, NOW, EMPTY_WALLET, team))).toBe('팀원 · 무제한');
  });

  it('팀원이면 아무것도 차감하지 않는다', () => {
    const wallet = { ...EMPTY_WALLET, credits: 3 };
    expect(consumeOne(null, spent, wallet, NOW, team)).toEqual({ usage: spent, wallet });
  });

  it('구매한 프리미엄이 있으면 프리미엄으로 보인다', () => {
    const lifetime: PremiumState = { plan: 'lifetime', productId: PRODUCT_IDS.lifetime, expiresAt: null, verifiedAt: NOW };
    expect(quotaStatus(lifetime, spent, NOW, EMPTY_WALLET, team).kind).toBe('premium');
  });

  it('서버 재확인 없이 7일이 지나면 팀원 캐시를 믿지 않는다', () => {
    expect(isTeamActive(team, NOW + 7 * DAY - 1)).toBe(true);
    expect(isTeamActive(team, NOW + 7 * DAY)).toBe(false);
    expect(quotaStatus(null, spent, NOW + 7 * DAY, EMPTY_WALLET, team).kind).not.toBe('team');
    expect(isTeamActive(null, NOW)).toBe(false);
  });
});

describe('가입 규칙 (맛보기 1회 → 가입 보너스 3회 + 매일 1회)', () => {
  const guest = freeRules(true, false);
  const member = freeRules(true, true);

  it('가입을 쓸 수 없는 빌드는 예전 규칙(체험 3회 + 매일 1회)', () => {
    expect(freeRules(false, false)).toEqual({ trial: FREE_TRIAL_TOTAL, daily: FREE_DAILY });
  });

  it('비회원은 맛보기 1회 뒤 막히고, 가입하면 3회를 더 쓴다', () => {
    expect(quotaStatus(null, EMPTY_USAGE, NOW, EMPTY_WALLET, null, guest)).toEqual({ kind: 'trial', remaining: GUEST_TRIAL_TOTAL, free: GUEST_TRIAL_TOTAL, credits: 0 });
    let usage = consumeOne(null, EMPTY_USAGE, EMPTY_WALLET, NOW, null, guest).usage;
    const blocked = quotaStatus(null, usage, NOW, EMPTY_WALLET, null, guest);
    expect(blocked).toEqual({ kind: 'exhausted', remaining: 0, free: 0, credits: 0, daily: 0 });
    expect(quotaLabel(blocked)).toContain('가입하면');
    // 다음 날이 돼도 비회원은 충전되지 않는다
    expect(quotaStatus(null, usage, NOW + DAY, EMPTY_WALLET, null, guest).kind).toBe('exhausted');

    let wallet = grantSignupBonus(EMPTY_WALLET, 'user-1')!;
    expect(grantSignupBonus(wallet, 'user-1')).toBeNull();
    // 가입한 날: 오늘 무료 1회 + 보너스 3회
    expect(quotaStatus(null, usage, NOW, wallet, null, member)).toEqual({ kind: 'daily', remaining: FREE_DAILY + SIGNUP_BONUS, free: FREE_DAILY, credits: 0, bonus: SIGNUP_BONUS });
    ({ usage, wallet } = consumeOne(null, usage, wallet, NOW, null, member));
    expect(quotaStatus(null, usage, NOW, wallet, null, member)).toEqual({ kind: 'bonus', remaining: SIGNUP_BONUS, free: 0, credits: 0, bonus: SIGNUP_BONUS });
    for (let i = 0; i < SIGNUP_BONUS; i++) ({ usage, wallet } = consumeOne(null, usage, wallet, NOW, null, member));
    expect(wallet.bonus).toBe(0);
    expect(quotaLabel(quotaStatus(null, usage, NOW, wallet, null, member))).toContain('내일');
    expect(quotaStatus(null, usage, NOW + DAY, wallet, null, member).kind).toBe('daily');
  });

  it('보너스는 횟수권보다 먼저 쓴다', () => {
    const wallet = { ...grantSignupBonus(EMPTY_WALLET, 'u')!, credits: 2 };
    const spent = { total: 5, day: dayKey(NOW), dayCount: 1 };
    const next = consumeOne(null, spent, wallet, NOW, null, member).wallet;
    expect([next.bonus, next.credits]).toEqual([SIGNUP_BONUS - 1, 2]);
  });
});

describe('1년권 (2026-11-07 평생권 판매 중지 → 1년권 29,800원)', () => {
  const PAID = Date.UTC(2026, 10, 7, 1, 30, 0); // 2026-11-07 10:30 (한국)
  const ios = (transactionDate: number) => ({ productId: PRODUCT_IDS.year, purchaseState: 'purchased' as const, store: 'apple', transactionDate });
  const android = (transactionDate: number) => ({ productId: PRODUCT_IDS.year, purchaseState: 'purchased' as const, store: 'google', transactionDate });

  it('상품·요금제 — 지금 파는 순서는 하루 → 주간 → 1년 → 횟수, 평생권은 팔지 않는다', () => {
    expect(PRODUCT_IDS.year).toBe('mylovecoach.pass.year');
    expect(FALLBACK_PRICES.year).toBe('₩29,800');
    expect(planOfProduct('mylovecoach.pass.year')).toBe('year');
    expect(premiumPlanOfProduct('mylovecoach.pass.year')).toBe('year');
    expect(premiumPlanOfProduct(PRODUCT_IDS.lifetime)).toBe('lifetime');
    expect(SELLING_PLANS).toEqual(['day', 'weekly', 'year', 'credits']);
    expect(isSubscriptionPlan('year')).toBe(true);
    expect(isSubscriptionPlan('weekly')).toBe(true);
    expect(isSubscriptionPlan('lifetime')).toBe(false);
    expect(isConsumablePlan('year')).toBe(false);
  });

  it('끝나는 시각은 달력으로 1년 뒤 같은 날짜·시각, 2월 29일은 다음 해 2월 28일', () => {
    expect(yearPassEnd(PAID)).toBe(Date.UTC(2027, 10, 7, 1, 30, 0));
    expect(yearPassEnd(Date.UTC(2028, 1, 29, 12, 0, 0))).toBe(Date.UTC(2029, 1, 28, 12, 0, 0));
    expect(yearPassEnd(Date.UTC(2027, 11, 31, 23, 59, 59))).toBe(Date.UTC(2028, 11, 31, 23, 59, 59));
  });

  it('iOS: 결제 시각 + 1년 안이면 이용 중, 지나면 아니다 (StoreKit 이 끝난 거래도 돌려주므로 앱이 판정)', () => {
    const end = yearPassEnd(PAID);
    expect(entitlementFrom([ios(PAID)], PAID + DAY)).toEqual({ plan: 'year', productId: PRODUCT_IDS.year, expiresAt: end, verifiedAt: PAID + DAY });
    expect(entitlementFrom([ios(PAID)], end - 1)?.plan).toBe('year');
    expect(entitlementFrom([ios(PAID)], end)).toBeNull();
    expect(entitlementFrom([ios(PAID)], end + 30 * DAY)).toBeNull();
    // 결제 시각을 모르면 인정하지 않는다
    expect(entitlementFrom([{ productId: PRODUCT_IDS.year, purchaseState: 'purchased', store: 'apple' }], PAID)).toBeNull();
    // 환불된 거래는 인정하지 않는다
    expect(entitlementFrom([{ ...ios(PAID), revocationDateIOS: PAID + DAY }], PAID + 2 * DAY)).toBeNull();
  });

  it('iOS: 저장된 1년권은 끝나는 시각까지만 (자동 갱신이 없어 여유를 두지 않는다)', () => {
    const premium = entitlementFrom([ios(PAID)], PAID)!;
    const end = yearPassEnd(PAID);
    expect(isPremiumActive(premium, end - 1)).toBe(true);
    expect(isPremiumActive(premium, end)).toBe(false);
    expect(quotaStatus(premium, EMPTY_USAGE, end - 1).kind).toBe('premium');
    expect(quotaStatus(premium, EMPTY_USAGE, end + 1).kind).toBe('trial');
  });

  it('Android: 스토어 목록에 있으면 이용 중 — 끝나는 날은 어림값(「예정」)', () => {
    // 연장 결제 등으로 어림한 날이 지나도 스토어가 돌려주면 이용 중
    const result = entitlementFrom([android(PAID)], PAID + 400 * DAY);
    expect(result).toEqual({ plan: 'year', productId: PRODUCT_IDS.year, expiresAt: yearPassEnd(PAID), expiresEstimated: true, verifiedAt: PAID + 400 * DAY });
    expect(entitlementFrom([{ productId: PRODUCT_IDS.year, purchaseState: 'purchased', store: 'google' }], PAID)).toMatchObject({ plan: 'year', expiresAt: null, expiresEstimated: true });
    expect(entitlementFrom([{ ...android(PAID), purchaseState: 'pending' }], PAID)).toBeNull();
  });

  it('Android: 최근에 스토어가 확인했거나 어림한 1년 안이면 이용 중, 둘 다 아니면 끝', () => {
    const end = yearPassEnd(PAID);
    const premium = { plan: 'year' as const, productId: PRODUCT_IDS.year, expiresAt: end, expiresEstimated: true, verifiedAt: PAID };
    // 오프라인이어도 어림한 1년 안이면
    expect(isPremiumActive(premium, end - DAY)).toBe(true);
    // 어림한 날이 지나도 스토어가 방금 확인했으면 (연장 결제)
    expect(isPremiumActive({ ...premium, verifiedAt: end + DAY }, end + 2 * DAY)).toBe(true);
    // 어림한 날도 지났고 오래 확인하지 못했으면
    expect(isPremiumActive(premium, end + DAY)).toBe(false);
  });

  it('우선순위: 평생권 > 1년권 > 주간 구독, 같은 종류면 늦게 끝나는 쪽', () => {
    const weekly = { productId: PRODUCT_IDS.weekly, purchaseState: 'purchased' as const, expirationDateIOS: PAID + 30 * DAY };
    // 이미 산 평생권은 그대로 평생권
    expect(entitlementFrom([ios(PAID), weekly, { productId: PRODUCT_IDS.lifetime, purchaseState: 'purchased' }], PAID + DAY)).toEqual({
      plan: 'lifetime',
      productId: PRODUCT_IDS.lifetime,
      expiresAt: null,
      verifiedAt: PAID + DAY,
    });
    expect(entitlementFrom([weekly, ios(PAID)], PAID + DAY)?.plan).toBe('year');
    const later = PAID + 100 * DAY;
    expect(entitlementFrom([ios(PAID), ios(later)], later + DAY)?.expiresAt).toBe(yearPassEnd(later));
    // 1년권이 끝났으면 주간 구독으로
    expect(entitlementFrom([ios(PAID), { ...weekly, expirationDateIOS: yearPassEnd(PAID) + 7 * DAY }], yearPassEnd(PAID) + DAY)?.plan).toBe('weekly');
  });

  it('언제까지 — iOS 는 확정 날짜, Android 는 「끝날 예정」', () => {
    const at = new Date(2027, 10, 7, 10, 30).getTime();
    const base = { plan: 'year' as const, productId: PRODUCT_IDS.year, expiresAt: at, verifiedAt: NOW };
    expect(premiumUntilLabel(base)).toBe('2027년 11월 7일까지');
    expect(premiumUntilLabel({ ...base, expiresEstimated: true })).toBe('2027년 11월 7일 끝날 예정');
    expect(premiumUntilSentence(base)).toBe('2027년 11월 7일까지 쓸 수 있어요.');
    expect(premiumUntilSentence({ ...base, expiresEstimated: true })).toBe('2027년 11월 7일에 끝날 예정이에요.');
    expect(premiumUntilLabel({ plan: 'lifetime', productId: PRODUCT_IDS.lifetime, expiresAt: null, verifiedAt: NOW })).toBeNull();
    expect(premiumUntilLabel({ ...base, expiresAt: null, expiresEstimated: true })).toBeNull();
  });
});
