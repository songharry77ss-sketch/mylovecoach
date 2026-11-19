/**
 * 쿠폰 코드 — 앱이 입력한 코드가 지금 쓸 수 있는지, 며칠 무제한인지 알려 준다.
 * 코드를 서버에 두는 까닭: 새 코드를 더하거나 끝내는 데 앱 업데이트(스토어 심사)가 필요 없게.
 * 실제 지급은 앱이 이 기기의 하루 이용권 칸(wallet.passUntil)에 기간을 더해서 한다 — 하루 이용권처럼 이 기기에만 저장되고,
 * 같은 기기에서 같은 코드는 한 번만 받는다(lib/billing/quota grantCoupon).
 * 코드 이름은 공개 저장소에 그대로 보이므로, 널리 퍼져도 괜찮은 홍보용 코드만 여기에 둔다.
 */

export interface CouponRule {
  /** 무제한 일수 (받은 때부터, 이미 이용권이 있으면 그 뒤로 이어 붙인다) */
  days: number;
  /** 이 시각(ISO)이 지나면 더는 받을 수 없다. 없으면 끝나는 날 없음 */
  until?: string;
}

export const COUPONS: Record<string, CouponRule> = {
  // 2026-11-19 사장님 요청 — 「FINISH 입력하면 3일 무제한」
  FINISH: { days: 3 },
};

/** 「 finish 」·「Fin-ish」 → 「FINISH」. 영문·숫자만 남기고 대문자로 (24자까지) */
export function normalizeCoupon(input: unknown): string {
  return typeof input === 'string' ? input.normalize('NFKC').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 24) : '';
}

export type CouponCheck = { ok: true; code: string; days: number } | { ok: false; reason: 'empty' | 'unknown' | 'expired' };

export function checkCoupon(input: unknown, now = Date.now(), coupons: Record<string, CouponRule> = COUPONS): CouponCheck {
  const code = normalizeCoupon(input);
  if (!code) return { ok: false, reason: 'empty' };
  const rule = Object.prototype.hasOwnProperty.call(coupons, code) ? coupons[code] : undefined;
  if (!rule || !(rule.days > 0)) return { ok: false, reason: 'unknown' };
  if (rule.until && Date.parse(rule.until) <= now) return { ok: false, reason: 'expired' };
  return { ok: true, code, days: rule.days };
}
