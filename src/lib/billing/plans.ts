/**
 * 요금제 정의. 상품 ID 는 App Store Connect / Play Console 에 등록한 것과 같아야 합니다.
 * 실제 표시 가격은 스토어에서 받아온 값(displayPrice)을 쓰고, 아래 값은 불러오기 전/실패 시의 표시용입니다.
 *
 * 요금 사다리 (2026-10 회의): 하루 2,700원 · 일주일 9,900원 · 평생 29,800원 · 횟수제
 * 2026-11-07 사장님 결정: 하루 이용권 정가 3,900원(11-07부터) · 타임 세일 특가 2,900원(11-28부터 — 할인 전 가격은 최근 20일 판매가여야 해서)
 * 2026-11-07 사장님 결정: 평생권 판매를 멈추고 1년권(29,800원, 결제한 날부터 1년, 자동 결제 없음)으로 바꾼다. 이미 산 평생권은 평생 그대로 인정한다
 * - weekly / year / lifetime : 프리미엄. 스토어 구매 내역으로 상태를 판정한다 (복원 가능). lifetime 은 새로 팔지 않는다
 * - day / credits     : 소모성 상품. 살 때마다 이 기기에 충전한다 (하루 이용권 24시간, 횟수권 10회)
 * - 하루 이용권 특가(DAY_SALE_PRODUCT_ID) : 타임 세일 동안만 파는 별도 소모성 상품. 효과는 하루 이용권과 같다
 */
export type PlanKey = 'weekly' | 'year' | 'lifetime' | 'day' | 'credits';
export type PremiumPlanKey = 'weekly' | 'year' | 'lifetime';
export type ConsumablePlanKey = 'day' | 'credits';

export const PRODUCT_IDS: Record<PlanKey, string> = {
  weekly: 'mylovecoach.premium.weekly',
  /** 1년권 — iOS 「자동 갱신 없는 구독」(Non-Renewing Subscription), Android 구독 상품의 「선불 요금제」(아래 ANDROID_YEAR_BASE_PLAN) */
  year: 'mylovecoach.pass.year',
  /** 2026-11-07 판매 중지. 이미 산 사람은 계속 인정한다 (entitlement.ts) */
  lifetime: 'mylovecoach.premium.lifetime',
  day: 'mylovecoach.pass.day',
  credits: 'mylovecoach.credits.10',
};

/** Play 구독의 기본 요금제(base plan) ID */
export const ANDROID_WEEKLY_BASE_PLAN = 'weekly';
/** Play 1년권 구독(mylovecoach.pass.year)의 선불 기본 요금제 ID — 기간 1년(P1Y), 자동 갱신 없음 */
export const ANDROID_YEAR_BASE_PLAN = 'year';
export const ANDROID_PACKAGE = 'app.mylovecoach.android';

export const FALLBACK_PRICES: Record<PlanKey, string> = {
  day: '₩3,900',
  weekly: '₩9,900',
  year: '₩29,800',
  lifetime: '₩29,800',
  credits: '₩4,900',
};

/** 횟수권 한 번에 충전되는 코칭 횟수 */
export const CREDITS_PER_PACK = 10;
/** 하루 이용권 길이 */
export const DAY_PASS_MS = 24 * 60 * 60 * 1000;

/**
 * 무료 횟수 제한과 프리미엄 안내를 모두 끄는 스위치. 기본은 꺼짐(= 유료 판매).
 * 빌드할 때 EXPO_PUBLIC_FREE_UNLIMITED=1 을 주면 켜진다.
 *
 * 스토어를 거치지 않는 직접 설치 APK(android-apk.yml)는 인앱결제가 동작하지 않으므로
 * 이 값을 켜서 만든다. 그래야 테스터가 결제할 수 없는 결제 화면에 막히지 않는다.
 * App Store·Play 빌드(ios.yml, android.yml)와 웹은 끈 채로 만든다.
 */
export const FREE_UNLIMITED = process.env.EXPO_PUBLIC_FREE_UNLIMITED === '1';

/** 처음 설치한 사용자에게 주는 무료 코칭 횟수 (회원가입을 쓸 수 없는 빌드) */
export const FREE_TRIAL_TOTAL = 3;
/** 체험을 다 쓴 뒤 매일 충전되는 무료 횟수 */
export const FREE_DAILY = 1;

/**
 * 회원가입을 쓸 수 있는 빌드의 무료 규칙 (2026-10 결정):
 * 비회원은 맛보기 1회 → 카카오·Google·Apple 로 가입하면 보너스 3회 + 매일 1회 충전.
 */
export const GUEST_TRIAL_TOTAL = 1;
export const SIGNUP_BONUS = 3;

/** 무료 횟수 규칙 — 체험 횟수와 매일 충전 횟수 */
export interface FreeRules {
  trial: number;
  daily: number;
}

/** 예전 규칙 (가입 없음): 체험 3회 + 매일 1회 */
export const DEFAULT_RULES: FreeRules = { trial: FREE_TRIAL_TOTAL, daily: FREE_DAILY };

/** 가입을 쓸 수 있으면 비회원은 맛보기 1회만, 회원은 매일 1회 충전 */
export const freeRules = (authAvailable: boolean, member: boolean): FreeRules =>
  !authAvailable ? DEFAULT_RULES : { trial: GUEST_TRIAL_TOTAL, daily: member ? FREE_DAILY : 0 };

export const isConsumablePlan = (plan: PlanKey): plan is ConsumablePlanKey => plan === 'day' || plan === 'credits';

/**
 * 스토어에 「구독」 종류로 묻고 사는 요금제 — 주간 구독과 1년권.
 * 1년권은 자동 결제가 없지만 iOS 「자동 갱신 없는 구독」, Android 「선불 요금제」라 두 스토어 모두 구독(subs)으로 다룬다.
 * (expo-iap 5.6.2 가 쓰는 OpenIAP Apple 3.4.0 은 iOS 자동 갱신 없는 구독을 in-app 조회 결과에서 빼고 subs 조회 결과에 넣는다)
 */
export const isSubscriptionPlan = (plan: PlanKey): boolean => plan === 'weekly' || plan === 'year';

/** 지금 파는 요금제 — 결제 화면·상품 조회 순서. 평생권은 2026-11-07 부터 팔지 않는다 */
export const SELLING_PLANS: readonly PlanKey[] = ['day', 'weekly', 'year', 'credits'];

/**
 * 1년권이 끝나는 시각 — 결제한 시각에서 달력으로 1년 뒤 같은 날짜·시각 (UTC 기준).
 * 다음 해에 같은 날이 없으면(2월 29일) 그달 마지막 날(2월 28일)로 맞춘다.
 * iOS 자동 갱신 없는 구독은 스토어가 만료를 알려 주지 않아 앱이 이 값으로 판정한다
 */
export function yearPassEnd(purchasedAt: number): number {
  const d = new Date(purchasedAt);
  const month = d.getUTCMonth();
  d.setUTCFullYear(d.getUTCFullYear() + 1);
  if (d.getUTCMonth() !== month) d.setUTCDate(0);
  return d.getTime();
}

/**
 * 구독을 따로 취소할 스토어 이름. 아이폰 앱에는 Google Play 를 적지 않는다 — App Store 심사 2.3.10(다른 플랫폼 언급)으로 1.0.3 이 거절됐다.
 * 웹은 어느 스토어에서 샀는지 모르므로 둘 다 적는다
 */
export const subscriptionStoreName = (os: string): string =>
  os === 'ios' ? 'App Store' : os === 'android' ? 'Google Play' : 'App Store 또는 Google Play';

/**
 * 하루 이용권 타임 세일용 특가 상품 (소모성). 효과는 하루 이용권과 똑같다 — 결제한 때부터 24시간 무제한.
 * 앱·서버는 이 상품을 plan 'day' 로 인정하고(planOfProduct), 상품 ID 로만 특가인지 구분한다.
 * 스토어에 아직 없으면 결제 화면이 세일을 보여 주지 않는다 (lib/billing/sale.ts · docs/DAY_PASS_SALE.md).
 */
export const DAY_SALE_PRODUCT_ID = 'mylovecoach.pass.day.sale';

/**
 * 특가 상품 가격(원) — Google 실시간 알림에는 금액이 없어 서버가 이 값으로 매출을 적는다 (api/_store.ts).
 * 2026-11-07 결정: 2,900원 (정가 3,900원). 스토어 상품 가격과 같아야 한다. 정하기 전(null)에는 금액 없이 알린다.
 */
export const DAY_SALE_PRICE_KRW: number | null = 2900;

export const isSaleProduct = (productId: string | null | undefined): boolean => productId === DAY_SALE_PRODUCT_ID;

/** 상품 ID → 요금제. 특가 상품은 하루 이용권('day')과 똑같이 인정한다 */
export const planOfProduct = (productId: string): PlanKey | null =>
  isSaleProduct(productId) ? 'day' : ((Object.keys(PRODUCT_IDS) as PlanKey[]).find((k) => PRODUCT_IDS[k] === productId) ?? null);

/** 프리미엄(주간 구독·1년권·평생권) 상품만 */
export const premiumPlanOfProduct = (productId: string): PremiumPlanKey | null => {
  const plan = planOfProduct(productId);
  return plan === 'weekly' || plan === 'year' || plan === 'lifetime' ? plan : null;
};
