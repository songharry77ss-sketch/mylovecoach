import { PRODUCT_IDS } from '@/lib/billing/plans';
import type { PremiumState } from '@/lib/billing/quota';

/** 스토어 구매 내역에서 판정에 필요한 필드만 추린 형태 (expo-iap 의 Purchase 와 호환) */
export interface PurchaseLike {
  productId: string;
  purchaseState: 'pending' | 'purchased' | 'unknown';
  expirationDateIOS?: number | null;
  revocationDateIOS?: number | null;
}

/** 스토어가 돌려준 구매 내역으로 프리미엄 상태를 판정. 평생권이 구독보다 우선 */
export function entitlementFrom(purchases: PurchaseLike[], now: number): PremiumState | null {
  const valid = purchases.filter((p) => p.purchaseState === 'purchased' && !p.revocationDateIOS);

  if (valid.some((p) => p.productId === PRODUCT_IDS.lifetime)) {
    return { plan: 'lifetime', productId: PRODUCT_IDS.lifetime, expiresAt: null, verifiedAt: now };
  }

  const weekly = valid
    .filter((p) => p.productId === PRODUCT_IDS.weekly)
    // iOS 는 만료일을 주므로 이미 끝난 구독은 제외. Android 는 활성 구독만 돌려준다
    .filter((p) => p.expirationDateIOS == null || p.expirationDateIOS > now)
    .sort((a, b) => (b.expirationDateIOS ?? 0) - (a.expirationDateIOS ?? 0))[0];
  if (weekly) return { plan: 'weekly', productId: PRODUCT_IDS.weekly, expiresAt: weekly.expirationDateIOS ?? null, verifiedAt: now };

  return null;
}
