import { Platform } from 'react-native';

import { track } from '@/lib/analytics';
import { quotaEnforced } from '@/lib/billing/gate';
import { couponUsed, formatPassEnd } from '@/lib/billing/quota';
import { APP_CONFIG } from '@/lib/config';
import { L, isKo } from '@/lib/i18n';
import { useAppStore } from '@/store/app-store';

/**
 * 쿠폰 코드 입력 → N일 무제한 (2026-11-19 「FINISH 입력하면 3일 무제한」).
 * 코드가 맞는지·며칠인지는 서버(POST /api/team { coupon }, api/_coupon.ts)가 정하고, 지급은 이 기기의 하루 이용권 칸에 한다.
 *
 * iOS 앱에서는 보여 주지 않는다 — App Store 심사 지침 3.1.1 은 앱 안에서 쓰는 기능을
 * 자체 코드(라이선스 키 등)로 여는 걸 막는다. 웹과 Android 앱에서만.
 */
export const couponSupported = quotaEnforced && Platform.OS !== 'ios';

const TIMEOUT_MS = 8000;

/** 영어판 — 서버(api/team.ts)의 한국어 오류 대신 응답 코드로 고른 영어 문구 */
const COUPON_ERRORS_EN: Record<number, string> = {
  400: 'Enter a coupon code.',
  404: "That code doesn't exist. Check the spelling.",
  410: 'This coupon has expired.',
  429: 'Too many tries. Try again in 10 minutes.',
};

/** 입력 정리 — 서버와 같은 규칙 (영문·숫자만, 대문자, 24자까지) */
export function normalizeCoupon(input: string): string {
  return input.normalize('NFKC').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 24);
}

export type CouponResult = { ok: true; code: string; days: number; until: number; label: string } | { ok: false; message: string };

/** 서버에 코드를 확인받는다 */
async function checkOnServer(code: string): Promise<{ ok: true; code: string; days: number } | { ok: false; message: string }> {
  if (!(APP_CONFIG.apiUrl || APP_CONFIG.apiSameOrigin)) return { ok: false, message: L('지금은 쿠폰을 쓸 수 없어요.', "Coupons aren't available right now.") };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${APP_CONFIG.apiUrl}/api/team`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(APP_CONFIG.apiToken ? { 'x-app-token': APP_CONFIG.apiToken } : {}) },
      body: JSON.stringify({ coupon: code }),
      signal: controller.signal,
    });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; code?: unknown; days?: unknown; error?: unknown };
    if (res.ok && data.ok && typeof data.code === 'string' && typeof data.days === 'number' && data.days > 0) {
      return { ok: true, code: data.code, days: data.days };
    }
    const fallback = L('쿠폰을 확인하지 못했어요. 잠시 후 다시 시도해주세요.', "Couldn't check that coupon. Try again in a moment.");
    if (!isKo) return { ok: false, message: COUPON_ERRORS_EN[res.status] ?? fallback };
    return { ok: false, message: typeof data.error === 'string' && data.error ? data.error : fallback };
  } catch {
    return { ok: false, message: L('인터넷 연결을 확인하고 다시 시도해주세요.', 'Check your connection and try again.') };
  } finally {
    clearTimeout(timer);
  }
}

/** 쿠폰 쓰기 — 확인되면 이 기기에 바로 지급하고 끝나는 때를 돌려준다 */
export async function redeemCoupon(input: string): Promise<CouponResult> {
  const typed = normalizeCoupon(input);
  if (!typed) return { ok: false, message: L('쿠폰 코드를 입력해주세요.', 'Enter a coupon code.') };
  if (couponUsed(useAppStore.getState().wallet, typed)) return { ok: false, message: L('이 기기에서 이미 쓴 쿠폰이에요.', 'This coupon was already used on this device.') };
  const checked = await checkOnServer(typed);
  if (!checked.ok) {
    track('coupon_result', { result: 'rejected' });
    return checked;
  }
  const until = useAppStore.getState().grantCoupon(checked.code, checked.days);
  if (until == null) return { ok: false, message: L('이 기기에서 이미 쓴 쿠폰이에요.', 'This coupon was already used on this device.') };
  track('coupon_result', { result: 'granted', code: checked.code, days: checked.days });
  return { ok: true, code: checked.code, days: checked.days, until, label: formatPassEnd(until, Date.now()) };
}
