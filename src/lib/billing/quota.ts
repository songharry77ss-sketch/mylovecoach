import { FREE_DAILY, FREE_TRIAL_TOTAL, type PlanKey } from '@/lib/billing/plans';

/** 기기에 저장해 두는 프리미엄 상태 (스토어 조회 결과의 캐시) */
export interface PremiumState {
  plan: PlanKey;
  productId: string;
  /** 구독 만료 시각(ms). iOS 만 제공. 평생권/Android 는 null */
  expiresAt: number | null;
  /** 스토어에서 마지막으로 확인한 시각 */
  verifiedAt: number;
}

export interface UsageState {
  /** 지금까지 무료로 쓴 코칭 횟수 (체험 소진 판단용) */
  total: number;
  /** 일일 무료 횟수를 센 날짜 (YYYY-MM-DD, 기기 현지 시간) */
  day: string;
  dayCount: number;
}

export const EMPTY_USAGE: UsageState = { total: 0, day: '', dayCount: 0 };

const DAY_MS = 24 * 60 * 60 * 1000;
/** 오프라인 등으로 스토어 재확인을 못 했을 때 주간 구독 캐시를 믿어 주는 기간 (1주 + 여유 1일) */
const WEEKLY_TRUST_MS = 8 * DAY_MS;
/** 만료 직후 갱신 결제가 반영될 때까지의 여유 */
const EXPIRY_GRACE_MS = DAY_MS;

export function dayKey(now: number): string {
  const d = new Date(now);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function isPremiumActive(premium: PremiumState | null | undefined, now: number): boolean {
  if (!premium) return false;
  if (premium.plan === 'lifetime') return true;
  if (premium.expiresAt != null) return premium.expiresAt + EXPIRY_GRACE_MS > now;
  return now - premium.verifiedAt < WEEKLY_TRUST_MS;
}

export type QuotaKind = 'premium' | 'trial' | 'daily' | 'exhausted';

export interface QuotaStatus {
  kind: QuotaKind;
  /** 지금 쓸 수 있는 무료 횟수. 프리미엄은 Infinity */
  remaining: number;
}

export function quotaStatus(premium: PremiumState | null | undefined, usage: UsageState, now: number): QuotaStatus {
  if (isPremiumActive(premium, now)) return { kind: 'premium', remaining: Infinity };
  const trialLeft = Math.max(0, FREE_TRIAL_TOTAL - usage.total);
  if (trialLeft > 0) return { kind: 'trial', remaining: trialLeft };
  const usedToday = usage.day === dayKey(now) ? usage.dayCount : 0;
  const dailyLeft = Math.max(0, FREE_DAILY - usedToday);
  return dailyLeft > 0 ? { kind: 'daily', remaining: dailyLeft } : { kind: 'exhausted', remaining: 0 };
}

/** 무료 코칭 1회 사용을 기록한 새 상태 */
export function consumeFree(usage: UsageState, now: number): UsageState {
  const today = dayKey(now);
  const inTrial = usage.total < FREE_TRIAL_TOTAL;
  const usedToday = usage.day === today ? usage.dayCount : 0;
  // 체험 횟수로 쓴 것은 일일 무료 횟수에서 차감하지 않는다
  return { total: usage.total + 1, day: today, dayCount: inTrial ? usedToday : usedToday + 1 };
}

/** 화면에 보여 줄 남은 횟수 안내 문구 */
export function quotaLabel(status: QuotaStatus): string {
  switch (status.kind) {
    case 'premium':
      return '프리미엄 · 무제한';
    case 'trial':
      return `무료 코칭 ${status.remaining}회 남았어요`;
    case 'daily':
      return `오늘의 무료 코칭 ${status.remaining}회 남았어요`;
    case 'exhausted':
      return '오늘의 무료 코칭을 다 썼어요 · 내일 다시 충전돼요';
  }
}
