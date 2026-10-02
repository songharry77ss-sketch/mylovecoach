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

/**
 * 무료 횟수 제한과 프리미엄 안내를 모두 끄는 스위치. 기본은 꺼짐(= 유료 판매).
 * 빌드할 때 EXPO_PUBLIC_FREE_UNLIMITED=1 을 주면 켜진다.
 *
 * 스토어를 거치지 않는 직접 설치 APK(android-apk.yml)는 인앱결제가 동작하지 않으므로
 * 이 값을 켜서 만든다. 그래야 테스터가 결제할 수 없는 결제 화면에 막히지 않는다.
 * App Store·Play 빌드(ios.yml, android.yml)와 웹은 끈 채로 만든다.
 */
export const FREE_UNLIMITED = process.env.EXPO_PUBLIC_FREE_UNLIMITED === '1';

/** 처음 설치한 사용자에게 주는 무료 코칭 횟수 */
export const FREE_TRIAL_TOTAL = 3;
/** 체험을 다 쓴 뒤 매일 충전되는 무료 횟수 */
export const FREE_DAILY = 1;

export const planOfProduct = (productId: string): PlanKey | null =>
  productId === PRODUCT_IDS.lifetime ? 'lifetime' : productId === PRODUCT_IDS.weekly ? 'weekly' : null;
