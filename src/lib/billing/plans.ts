/**
 * 요금제 정의. 상품 ID 는 App Store Connect / Play Console 에 등록한 것과 같아야 합니다.
 * 실제 표시 가격은 스토어에서 받아온 값(displayPrice)을 쓰고, 아래 값은 불러오기 전/실패 시의 표시용입니다.
 *
 * 요금 사다리 (2026-10 회의): 하루 2,700원 · 일주일 9,900원 · 평생 29,800원 · 횟수제
 * - weekly / lifetime : 프리미엄. 스토어 구매 내역으로 상태를 판정한다 (복원 가능)
 * - day / credits     : 소모성 상품. 살 때마다 이 기기에 충전한다 (하루 이용권 24시간, 횟수권 10회)
 */
export type PlanKey = 'weekly' | 'lifetime' | 'day' | 'credits';
export type PremiumPlanKey = 'weekly' | 'lifetime';
export type ConsumablePlanKey = 'day' | 'credits';

export const PRODUCT_IDS: Record<PlanKey, string> = {
  weekly: 'mylovecoach.premium.weekly',
  lifetime: 'mylovecoach.premium.lifetime',
  day: 'mylovecoach.pass.day',
  credits: 'mylovecoach.credits.10',
};

/** Play 구독의 기본 요금제(base plan) ID */
export const ANDROID_WEEKLY_BASE_PLAN = 'weekly';
export const ANDROID_PACKAGE = 'app.mylovecoach.android';

export const FALLBACK_PRICES: Record<PlanKey, string> = {
  day: '₩2,700',
  weekly: '₩9,900',
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

export const planOfProduct = (productId: string): PlanKey | null =>
  (Object.keys(PRODUCT_IDS) as PlanKey[]).find((k) => PRODUCT_IDS[k] === productId) ?? null;

/** 프리미엄(구독·평생권) 상품만 */
export const premiumPlanOfProduct = (productId: string): PremiumPlanKey | null => {
  const plan = planOfProduct(productId);
  return plan === 'weekly' || plan === 'lifetime' ? plan : null;
};
