/** 웹에는 인앱결제가 없습니다. 프리미엄은 앱(iOS/Android)에서만 구매할 수 있어요. */
import { FALLBACK_PRICES, PRODUCT_IDS, type PlanKey } from '@/lib/billing/plans';
import type { PremiumState } from '@/lib/billing/quota';

export const billingSupported = false;

export interface PlanProduct {
  plan: PlanKey;
  productId: string;
  displayPrice: string;
  offerToken?: string | null;
}

export type PurchaseOutcome =
  | { status: 'purchased'; premium: PremiumState }
  | { status: 'pending' }
  | { status: 'cancelled' }
  | { status: 'error'; message: string };

export async function initBilling(_handlers: { onPremium: (premium: PremiumState) => void }): Promise<PremiumState | null | undefined> {
  return undefined;
}
export function endBilling() {}
export async function loadPlanProducts(): Promise<PlanProduct[]> {
  return (['lifetime', 'weekly'] as PlanKey[]).map((plan) => ({ plan, productId: PRODUCT_IDS[plan], displayPrice: FALLBACK_PRICES[plan] }));
}
export async function purchasePlan(_product: PlanProduct): Promise<PurchaseOutcome> {
  return { status: 'error', message: '프리미엄은 앱에서 구매할 수 있어요.' };
}
export async function queryEntitlement(): Promise<PremiumState | null | undefined> {
  return undefined;
}
export async function restorePremium(): Promise<PremiumState | null | undefined> {
  return undefined;
}
export async function openSubscriptionManagement(): Promise<void> {}
