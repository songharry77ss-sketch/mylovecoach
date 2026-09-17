/**
 * 요금제 정의. 상품 ID 는 App Store Connect / Play Console 에 등록한 것과 같아야 합니다.
 * 실제 표시 가격은 스토어에서 받아온 값(displayPrice)을 쓰고, 아래 값은 불러오기 전/실패 시의 표시용입니다.
 */
export type PlanKey = 'weekly' | 'lifetime';

export const PRODUCT_IDS: Record<PlanKey, string> = {
  weekly: 'mylovecoach.premium.weekly',
  lifetime: 'mylovecoach.premium.lifetime',
};

/** Play 구독의 기본 요금제(base plan) ID */
export const ANDROID_WEEKLY_BASE_PLAN = 'weekly';
export const ANDROID_PACKAGE = 'app.mylovecoach.android';

export const FALLBACK_PRICES: Record<PlanKey, string> = {
  weekly: '₩9,900',
  lifetime: '₩29,800',
};

/** 처음 설치한 사용자에게 주는 무료 코칭 횟수 */
export const FREE_TRIAL_TOTAL = 3;
/** 체험을 다 쓴 뒤 매일 충전되는 무료 횟수 */
export const FREE_DAILY = 1;

export const planOfProduct = (productId: string): PlanKey | null =>
  productId === PRODUCT_IDS.lifetime ? 'lifetime' : productId === PRODUCT_IDS.weekly ? 'weekly' : null;
