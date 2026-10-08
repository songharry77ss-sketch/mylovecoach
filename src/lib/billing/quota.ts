import { CREDITS_PER_PACK, DAY_PASS_MS, DEFAULT_RULES, SIGNUP_BONUS, type ConsumablePlanKey, type FreeRules, type PremiumPlanKey } from '@/lib/billing/plans';

/** 기기에 저장해 두는 프리미엄 상태 (스토어 조회 결과의 캐시) */
export interface PremiumState {
  plan: PremiumPlanKey;
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

/** 소모성 상품으로 충전한 이용권 (이 기기에만 저장) */
export interface WalletState {
  /** 하루 이용권이 끝나는 시각(ms). 0 이면 없음 */
  passUntil: number;
  /** 남은 코칭 횟수권 */
  credits: number;
  /** 남은 가입 보너스 무료 횟수 (예전에 저장된 지갑에는 없음) */
  bonus?: number;
  /** 이미 지급한 거래 ID (같은 결제가 두 번 충전되지 않게, 최근 50개) */
  granted: string[];
}

/** 관리자 페이지에서 무제한을 허용한 팀원 (서버 확인 결과의 캐시) */
export interface TeamState {
  label: string;
  /** 서버에서 마지막으로 확인한 시각 */
  verifiedAt: number;
}

export const EMPTY_USAGE: UsageState = { total: 0, day: '', dayCount: 0 };
export const EMPTY_WALLET: WalletState = { passUntil: 0, credits: 0, granted: [] };

const DAY_MS = 24 * 60 * 60 * 1000;
/** 오프라인 등으로 스토어 재확인을 못 했을 때 주간 구독 캐시를 믿어 주는 기간 (1주 + 여유 1일) */
const WEEKLY_TRUST_MS = 8 * DAY_MS;
/** 만료 직후 갱신 결제가 반영될 때까지의 여유 */
const EXPIRY_GRACE_MS = DAY_MS;
/** 오프라인 등으로 서버 재확인을 못 했을 때 팀원 캐시를 믿어 주는 기간 */
const TEAM_TRUST_MS = 7 * DAY_MS;

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

export function isTeamActive(team: TeamState | null | undefined, now: number): boolean {
  return team != null && now - team.verifiedAt < TEAM_TRUST_MS;
}

export type QuotaKind = 'premium' | 'team' | 'pass' | 'trial' | 'daily' | 'bonus' | 'credits' | 'exhausted';

export interface QuotaStatus {
  kind: QuotaKind;
  /** 지금 쓸 수 있는 횟수 (무료 + 횟수권). 프리미엄·팀원·하루 이용권은 Infinity */
  remaining: number;
  /** 남은 무료 횟수 */
  free?: number;
  /** 남은 횟수권 */
  credits?: number;
  /** 남은 가입 보너스 */
  bonus?: number;
  /** 매일 충전되는 무료 횟수가 없으면 0 (비회원) */
  daily?: number;
  /** 하루 이용권이 끝나는 시각 */
  until?: number;
}

function freeLeft(usage: UsageState, now: number, rules: FreeRules): { kind: 'trial' | 'daily'; left: number } {
  const trialLeft = Math.max(0, rules.trial - usage.total);
  if (trialLeft > 0) return { kind: 'trial', left: trialLeft };
  const usedToday = usage.day === dayKey(now) ? usage.dayCount : 0;
  return { kind: 'daily', left: Math.max(0, rules.daily - usedToday) };
}

const bonusOf = (wallet: WalletState) => Math.max(0, wallet.bonus ?? 0);

export function quotaStatus(
  premium: PremiumState | null | undefined,
  usage: UsageState,
  now: number,
  wallet: WalletState = EMPTY_WALLET,
  team: TeamState | null = null,
  rules: FreeRules = DEFAULT_RULES,
): QuotaStatus {
  if (isPremiumActive(premium, now)) return { kind: 'premium', remaining: Infinity };
  if (isTeamActive(team, now)) return { kind: 'team', remaining: Infinity };
  if (wallet.passUntil > now) return { kind: 'pass', remaining: Infinity, until: wallet.passUntil };
  const free = freeLeft(usage, now, rules);
  const bonus = bonusOf(wallet);
  const credits = Math.max(0, wallet.credits);
  const extra = bonus ? { bonus } : {};
  if (free.left > 0) return { kind: free.kind, remaining: free.left + bonus + credits, free: free.left, credits, ...extra };
  if (bonus > 0) return { kind: 'bonus', remaining: bonus + credits, free: 0, credits, bonus };
  if (credits > 0) return { kind: 'credits', remaining: credits, free: 0, credits };
  return { kind: 'exhausted', remaining: 0, free: 0, credits: 0, ...(rules.daily === 0 ? { daily: 0 } : {}) };
}

/** 무료 코칭 1회 사용을 기록한 새 상태 */
export function consumeFree(usage: UsageState, now: number, rules: FreeRules = DEFAULT_RULES): UsageState {
  const today = dayKey(now);
  const inTrial = usage.total < rules.trial;
  const usedToday = usage.day === today ? usage.dayCount : 0;
  // 체험 횟수로 쓴 것은 일일 무료 횟수에서 차감하지 않는다
  return { total: usage.total + 1, day: today, dayCount: inTrial ? usedToday : usedToday + 1 };
}

/**
 * 한 번 사용 처리. 프리미엄·팀원·하루 이용권이면 아무것도 깎지 않고,
 * 무료 횟수 → 가입 보너스 → 횟수권 순서로 차감한다.
 */
export function consumeOne(
  premium: PremiumState | null | undefined,
  usage: UsageState,
  wallet: WalletState,
  now: number,
  team: TeamState | null = null,
  rules: FreeRules = DEFAULT_RULES,
): { usage: UsageState; wallet: WalletState } {
  if (isPremiumActive(premium, now) || isTeamActive(team, now) || wallet.passUntil > now) return { usage, wallet };
  if (freeLeft(usage, now, rules).left > 0) return { usage: consumeFree(usage, now, rules), wallet };
  if (bonusOf(wallet) > 0) return { usage, wallet: { ...wallet, bonus: bonusOf(wallet) - 1 } };
  if (wallet.credits > 0) return { usage, wallet: { ...wallet, credits: wallet.credits - 1 } };
  return { usage: consumeFree(usage, now, rules), wallet };
}

/** 가입 보너스 지급 (같은 회원에게 두 번 주지 않음). 이미 줬으면 null */
export function grantSignupBonus(wallet: WalletState, memberKey: string): WalletState | null {
  const key = `signup:${memberKey}`;
  if (wallet.granted.includes(key)) return null;
  return { ...wallet, bonus: bonusOf(wallet) + SIGNUP_BONUS, granted: [...wallet.granted, key].slice(-50) };
}

/** 소모성 상품 결제 1건을 지갑에 충전한다. 이미 충전한 거래면 null */
export function grantConsumable(wallet: WalletState, plan: ConsumablePlanKey, transactionId: string, now: number): WalletState | null {
  if (transactionId && wallet.granted.includes(transactionId)) return null;
  const granted = transactionId ? [...wallet.granted, transactionId].slice(-50) : wallet.granted;
  if (plan === 'day') return { ...wallet, passUntil: Math.max(now, wallet.passUntil) + DAY_PASS_MS, granted };
  return { ...wallet, credits: wallet.credits + CREDITS_PER_PACK, granted };
}

const clock = (at: number) => {
  const d = new Date(at);
  const h = d.getHours();
  return `${h < 12 ? '오전' : '오후'} ${h % 12 === 0 ? 12 : h % 12}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/** 화면에 보여 줄 남은 횟수 안내 문구 */
export function quotaLabel(status: QuotaStatus): string {
  const creditNote = `${status.bonus && status.kind !== 'bonus' ? ` · 가입 보너스 ${status.bonus}회` : ''}${status.credits ? ` · 횟수권 ${status.credits}회` : ''}`;
  switch (status.kind) {
    case 'premium':
      return '프리미엄 · 무제한';
    case 'team':
      return '팀원 · 무제한';
    case 'pass':
      return `하루 이용권 · ${status.until ? `${clock(status.until)}까지 ` : ''}무제한`;
    case 'trial':
      return `무료 코칭 ${status.free ?? status.remaining}회 남았어요${creditNote}`;
    case 'daily':
      return `오늘의 무료 코칭 ${status.free ?? status.remaining}회 남았어요${creditNote}`;
    case 'bonus':
      return `가입 보너스 무료 코칭 ${status.bonus ?? status.remaining}회 남았어요${status.credits ? ` · 횟수권 ${status.credits}회` : ''}`;
    case 'credits':
      return `코칭 횟수권 ${status.remaining}회 남았어요`;
    case 'exhausted':
      return status.daily === 0 ? `무료 맛보기를 다 썼어요 · 가입하면 무료 ${SIGNUP_BONUS}회 더` : '오늘의 무료 코칭을 다 썼어요 · 내일 다시 충전돼요';
  }
}
