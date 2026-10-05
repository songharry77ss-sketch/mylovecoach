/**
 * 인앱결제 (iOS StoreKit 2 / Android Play Billing) — expo-iap 래퍼.
 * 웹은 iap.web.ts 가 대신 쓰이고, 네이티브 모듈이 없는 환경(Expo Go 등)에서는 billingSupported=false 로 조용히 비활성화됩니다.
 */
import { Platform } from 'react-native';

import { entitlementFrom } from '@/lib/billing/entitlement';
import {
  ANDROID_PACKAGE,
  ANDROID_WEEKLY_BASE_PLAN,
  FALLBACK_PRICES,
  PRODUCT_IDS,
  isConsumablePlan,
  planOfProduct,
  type ConsumablePlanKey,
  type PlanKey,
} from '@/lib/billing/plans';
import type { PremiumState } from '@/lib/billing/quota';

type IapModule = typeof import('expo-iap');
let IAP: IapModule | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  IAP = require('expo-iap') as IapModule;
} catch {
  IAP = null;
}

export const billingSupported = IAP != null && (Platform.OS === 'ios' || Platform.OS === 'android');

export interface PlanProduct {
  plan: PlanKey;
  productId: string;
  displayPrice: string;
  /** Android 구독 결제에 필요한 오퍼 토큰 */
  offerToken?: string | null;
  /** 스토어에서 이 상품을 찾았는지 (스토어에 아직 없는 상품은 화면에서 숨긴다) */
  available?: boolean;
}

export type PurchaseOutcome =
  | { status: 'purchased'; premium: PremiumState }
  | { status: 'granted'; plan: ConsumablePlanKey }
  | { status: 'pending' }
  | { status: 'cancelled' }
  | { status: 'error'; message: string };

interface Handlers {
  onPremium: (premium: PremiumState) => void;
  /** 하루 이용권·횟수권 결제 1건 — 거래 ID 로 중복 충전을 막는다 */
  onConsumable: (plan: ConsumablePlanKey, transactionId: string) => void;
}

let connected = false;
let handlers: Handlers | null = null;
let inflight: ((outcome: PurchaseOutcome) => void) | null = null;
let subscriptions: { remove: () => void }[] = [];

const settle = (outcome: PurchaseOutcome) => {
  inflight?.(outcome);
  inflight = null;
};

/** 에러 객체에서 스토어 오류 코드를 꺼낸다 (원인 파악용으로 안내 문구에 붙인다) */
const codeOf = (error: unknown): string => {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === 'string' && code ? ` (${code})` : '';
};

/**
 * 스토어 연결을 보장한다. 앱 시작 때 연결이 실패했어도(네트워크·스토어 지연) 결제 직전에 다시 시도한다.
 * 연결되면 구매 이벤트 리스너를 한 번만 붙인다.
 */
async function ensureConnected(): Promise<boolean> {
  if (!IAP || !billingSupported) return false;
  if (connected) return true;
  try {
    connected = Boolean(await IAP.initConnection());
  } catch {
    connected = false;
  }
  if (!connected || subscriptions.length) return connected;
  const iap = IAP;
  subscriptions = [
    iap.purchaseUpdatedListener(async (purchase) => {
      if (purchase.purchaseState === 'pending') return settle({ status: 'pending' });
      const plan = planOfProduct(purchase.productId);
      if (purchase.purchaseState !== 'purchased' || !plan) return;
      if (isConsumablePlan(plan)) {
        // 충전 먼저, 그다음 「소비 완료」 — 순서가 바뀌면 앱이 그 사이 꺼졌을 때 충전 없이 결제만 끝난다
        handlers?.onConsumable(plan, transactionKey(purchase));
        await iap.finishTransaction({ purchase, isConsumable: true }).catch(() => {});
        return settle({ status: 'granted', plan });
      }
      try {
        // 스토어에 「지급 완료」를 알린다. Android 는 3일 안에 하지 않으면 자동 환불된다
        await iap.finishTransaction({ purchase, isConsumable: false });
      } catch {
        // 다음 실행 때 queryEntitlement 에서 다시 시도
      }
      const premium = entitlementFrom([purchase], Date.now());
      if (!premium) return;
      handlers?.onPremium(premium);
      settle({ status: 'purchased', premium });
    }),
    iap.purchaseErrorListener((error) => {
      if (iap.isUserCancelledError(error)) return settle({ status: 'cancelled' });
      settle({ status: 'error', message: (iap.getUserFriendlyErrorMessage(error) || '결제를 완료하지 못했어요. 잠시 후 다시 시도해주세요.') + codeOf(error) });
    }),
  ];
  return connected;
}

/** 같은 결제를 구분하는 키 (iOS 거래 ID / Android 구매 토큰) */
const transactionKey = (purchase: { id?: string | null; purchaseToken?: string | null; transactionDate?: number; productId: string }) =>
  purchase.id || purchase.purchaseToken || `${purchase.productId}:${purchase.transactionDate ?? ''}`;

/** 앱 시작 시 한 번 호출. 스토어 연결 + 구매 이벤트 수신 + 현재 구매 상태 반환 */
export async function initBilling(h: Handlers): Promise<PremiumState | null | undefined> {
  if (!IAP || !billingSupported) return undefined;
  handlers = h;
  if (!(await ensureConnected())) return undefined;
  return queryEntitlement();
}

export function endBilling() {
  subscriptions.forEach((s) => s.remove());
  subscriptions = [];
  if (connected) IAP?.endConnection().catch(() => {});
  connected = false;
}

/** 스토어에서 상품 정보(현지 통화 표시 가격)를 가져온다. 실패하면 기본 표시 가격을 쓴다 */
export async function loadPlanProducts(): Promise<PlanProduct[]> {
  const order: PlanKey[] = ['day', 'weekly', 'lifetime', 'credits'];
  const fallback: PlanProduct[] = order.map((plan) => ({ plan, productId: PRODUCT_IDS[plan], displayPrice: FALLBACK_PRICES[plan] }));
  if (!IAP || !(await ensureConnected())) return fallback;
  try {
    const items = (await IAP.fetchProducts({ skus: Object.values(PRODUCT_IDS), type: 'all' })) ?? [];
    return fallback.map((f) => {
      const item = items.find((i) => i.id === f.productId);
      if (!item) return { ...f, available: false };
      let offerToken: string | null | undefined;
      let displayPrice = item.displayPrice;
      if (item.platform === 'android' && item.type === 'subs') {
        const offers = item.subscriptionOffers ?? [];
        const offer = offers.find((o) => o.basePlanIdAndroid === ANDROID_WEEKLY_BASE_PLAN) ?? offers[0];
        offerToken = offer?.offerTokenAndroid;
        displayPrice = offer?.displayPrice || displayPrice;
      }
      return { ...f, displayPrice: displayPrice || f.displayPrice, offerToken, available: true };
    });
  } catch {
    return fallback;
  }
}

/** 결제 시트를 띄우고 결과를 기다린다 (결과는 스토어 이벤트로 도착) */
export async function purchasePlan(product: PlanProduct): Promise<PurchaseOutcome> {
  if (!IAP || !(await ensureConnected())) return { status: 'error', message: '스토어에 연결하지 못했어요. 네트워크를 확인하고 다시 시도해주세요.' };
  const iap = IAP;
  // 스토어가 이 상품을 내려주지 않으면 결제 시트가 뜨지 않는다 — 조용히 실패하지 말고 이유를 알린다
  try {
    const found = (await iap.fetchProducts({ skus: [product.productId], type: product.plan === 'weekly' ? 'subs' : 'in-app' })) ?? [];
    if (!found.some((i) => i.id === product.productId))
      return { status: 'error', message: `스토어에서 이 상품을 찾지 못했어요. 잠시 후 다시 시도해주세요. (${product.productId})` };
  } catch (error) {
    return { status: 'error', message: `상품 정보를 불러오지 못했어요.${codeOf(error)}` };
  }
  settle({ status: 'cancelled' });
  return new Promise<PurchaseOutcome>((resolve) => {
    inflight = resolve;
    const sku = product.productId;
    const request =
      product.plan === 'weekly'
        ? iap.requestPurchase({
            type: 'subs',
            request: { apple: { sku }, google: { skus: [sku], subscriptionOffers: product.offerToken ? [{ sku, offerToken: product.offerToken }] : [] } },
          })
        : iap.requestPurchase({ type: 'in-app', request: { apple: { sku }, google: { skus: [sku] } } });
    request.catch((error: unknown) => {
      if (iap.isUserCancelledError(error as never)) return settle({ status: 'cancelled' });
      settle({ status: 'error', message: `결제를 시작하지 못했어요. 잠시 후 다시 시도해주세요.${codeOf(error)}` });
    });
  });
}

/** 현재 구매 상태를 스토어에서 확인. 스토어에 닿지 못하면 undefined (저장된 상태 유지) */
export async function queryEntitlement(): Promise<PremiumState | null | undefined> {
  if (!IAP || !connected) return undefined;
  try {
    const purchases = (await IAP.getAvailablePurchases({ onlyIncludeActiveItemsIOS: true })) ?? [];
    for (const p of purchases) {
      const plan = planOfProduct(p.productId);
      if (p.purchaseState !== 'purchased' || !plan) continue;
      // 결제 직후 앱이 종료돼 충전·소비 처리가 안 된 이용권을 마무리한다 (거래 ID 로 중복 충전 방지)
      if (isConsumablePlan(plan)) {
        handlers?.onConsumable(plan, transactionKey(p));
        await IAP.finishTransaction({ purchase: p, isConsumable: true }).catch(() => {});
        continue;
      }
      // 결제 직후 앱이 종료돼 「지급 완료」 처리가 안 된 Android 구매를 마무리한다
      if ('isAcknowledgedAndroid' in p && p.isAcknowledgedAndroid === false) {
        await IAP.finishTransaction({ purchase: p, isConsumable: false }).catch(() => {});
      }
    }
    return entitlementFrom(purchases, Date.now());
  } catch {
    return undefined;
  }
}

/** 구매 복원 (기기 변경·재설치 후) */
export async function restorePremium(): Promise<PremiumState | null | undefined> {
  if (!IAP || !(await ensureConnected())) return undefined;
  try {
    await IAP.restorePurchases();
  } catch {
    // 조회로 이어서 확인
  }
  return queryEntitlement();
}

/** 스토어의 구독 관리(해지) 화면 열기 */
export async function openSubscriptionManagement(): Promise<void> {
  if (!IAP) return;
  await IAP.deepLinkToSubscriptions({ skuAndroid: PRODUCT_IDS.weekly, packageNameAndroid: ANDROID_PACKAGE });
}
