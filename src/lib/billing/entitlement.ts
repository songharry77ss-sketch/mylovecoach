import { PRODUCT_IDS, yearPassEnd } from '@/lib/billing/plans';
import type { PremiumState } from '@/lib/billing/quota';

/** 스토어 구매 내역에서 판정에 필요한 필드만 추린 형태 (expo-iap 의 Purchase 와 호환) */
export interface PurchaseLike {
  productId: string;
  purchaseState: 'pending' | 'purchased' | 'unknown';
  /** 결제 시각(ms) — iOS 는 StoreKit 거래의 purchaseDate, Android 는 purchaseTime */
  transactionDate?: number | null;
  /** 결제한 스토어 (expo-iap: 'apple' | 'google' …) */
  store?: string | null;
  expirationDateIOS?: number | null;
  revocationDateIOS?: number | null;
}

/** Android(Google Play) 구매인지 — Android 는 활성 구독만 돌려주므로 목록에 있으면 이용 중이다 */
const isAndroidPurchase = (p: PurchaseLike) => p.store === 'google';

/**
 * 1년권 구매 하나 → 끝나는 시각. 인정하지 않으면 null.
 * - iOS(자동 갱신 없는 구독): StoreKit 은 끝난 것도 최신 거래를 계속 돌려주므로 결제 시각 + 1년이 지났으면 버린다
 * - Android(선불 요금제): 스토어가 활성 구독만 돌려주므로 있으면 이용 중. 끝나는 날은 결제 시각 + 1년으로 어림한다(estimated)
 */
function yearTerm(p: PurchaseLike, now: number): { expiresAt: number | null; estimated: boolean } | null {
  const at = typeof p.transactionDate === 'number' && Number.isFinite(p.transactionDate) && p.transactionDate > 0 ? p.transactionDate : null;
  if (isAndroidPurchase(p)) return { expiresAt: at == null ? null : yearPassEnd(at), estimated: true };
  if (at == null) return null;
  const end = yearPassEnd(at);
  return end > now ? { expiresAt: end, estimated: false } : null;
}

/**
 * 스토어가 돌려준 구매 내역으로 프리미엄 상태를 판정.
 * 우선순위: 평생권(2026-11-07 판매 중지, 이미 산 사람은 평생) > 1년권 > 주간 구독. 같은 종류면 늦게 끝나는 쪽
 */
export function entitlementFrom(purchases: PurchaseLike[], now: number): PremiumState | null {
  const valid = purchases.filter((p) => p.purchaseState === 'purchased' && !p.revocationDateIOS);

  if (valid.some((p) => p.productId === PRODUCT_IDS.lifetime)) {
    return { plan: 'lifetime', productId: PRODUCT_IDS.lifetime, expiresAt: null, verifiedAt: now };
  }

  const year = valid
    .filter((p) => p.productId === PRODUCT_IDS.year)
    .map((p) => yearTerm(p, now))
    .filter((t): t is NonNullable<typeof t> => t != null)
    // 끝나는 날을 모르는 것(Android 결제 시각 없음)은 맨 뒤로
    .sort((a, b) => (b.expiresAt ?? 0) - (a.expiresAt ?? 0))[0];
  if (year) {
    return { plan: 'year', productId: PRODUCT_IDS.year, expiresAt: year.expiresAt, ...(year.estimated ? { expiresEstimated: true } : {}), verifiedAt: now };
  }

  const weekly = valid
    .filter((p) => p.productId === PRODUCT_IDS.weekly)
    // iOS 는 만료일을 주므로 이미 끝난 구독은 제외. Android 는 활성 구독만 돌려준다
    .filter((p) => p.expirationDateIOS == null || p.expirationDateIOS > now)
    .sort((a, b) => (b.expirationDateIOS ?? 0) - (a.expirationDateIOS ?? 0))[0];
  if (weekly) return { plan: 'weekly', productId: PRODUCT_IDS.weekly, expiresAt: weekly.expirationDateIOS ?? null, verifiedAt: now };

  return null;
}
