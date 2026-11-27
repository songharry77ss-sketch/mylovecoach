/** 웹에는 인앱결제가 없습니다. 프리미엄은 앱(iOS/Android)에서만 구매할 수 있어요. */
import { fallbackPrice } from '@/lib/billing/fallback-price';
import { PRODUCT_IDS, SELLING_PLANS, type ConsumablePlanKey, type PlanKey } from '@/lib/billing/plans';
import type { PremiumState } from '@/lib/billing/quota';
import { L } from '@/lib/i18n';

export const billingSupported = false;

export interface PlanProduct {
  plan: PlanKey;
  productId: string;
  displayPrice: string;
  offerToken?: string | null;
  available?: boolean;
  price?: number | null;
  currency?: string | null;
  sale?: boolean;
}

export type PurchaseOutcome =
  | { status: 'purchased'; premium: PremiumState }
  | { status: 'granted'; plan: ConsumablePlanKey }
  | { status: 'pending' }
  | { status: 'cancelled' }
  | { status: 'error'; message: string };

export async function initBilling(_handlers: {
  onPremium: (premium: PremiumState) => void;
  onConsumable: (plan: ConsumablePlanKey, transactionId: string) => void;
}): Promise<PremiumState | null | undefined> {
  return undefined;
}
export interface StoreProblem {
  code: string;
  responseCode?: number;
}
export const lastStoreProblem = (): StoreProblem | null => null;
export function endBilling() {}
export async function loadPlanProducts(): Promise<PlanProduct[]> {
  return SELLING_PLANS.map((plan) => ({ plan, productId: PRODUCT_IDS[plan], displayPrice: fallbackPrice(plan) }));
}
export async function purchasePlan(_product: PlanProduct): Promise<PurchaseOutcome> {
  return { status: 'error', message: L('프리미엄은 앱에서 구매할 수 있어요.', 'You can buy Premium in the app.') };
}
export async function queryEntitlement(): Promise<PremiumState | null | undefined> {
  return undefined;
}
export async function restorePremium(): Promise<PremiumState | null | undefined> {
  return undefined;
}
export async function openSubscriptionManagement(): Promise<void> {}
