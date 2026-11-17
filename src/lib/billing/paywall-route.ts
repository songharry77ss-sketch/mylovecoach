/**
 * 결제 루프 — 무료를 다 써서 막힌 순간 어디로 보낼지 (2026-11-17, 11/12 회의 10번·사장님 「무료를 다 썼을 때 팝업」).
 *
 *   첫 코칭 ─(A/B 실험군: 5분 무제한)→ 무료 소진 ─→ ① 비회원: 결제 화면(가입하면 무료 보너스를 먼저 권함)
 *                                              ② 회원·가입 없는 빌드: 타임어택 특가 팝업(/sale) — 10분 특가 2,900원, 팝업에서 바로 결제
 *                                                  └ 특가를 열 수 없으면(7일 쉬는 중·스토어에 특가 상품 없음) 팝업이 일반 결제 화면으로 바뀐다
 *   결제 → 막혔던 요청이 저절로 이어짐(use-resume-after-paywall) → 하루 이용권이 끝나 갈 때 1년권 안내(채팅방 안내 줄)
 *
 * 막힌 게 아닌 곳(마이 「이용권 보기」·안내 줄의 「무제한 이용」 등)은 늘 일반 결제 화면.
 */
import { currentQuota, quotaEnforced } from '@/lib/billing/gate';
import { billingSupported } from '@/lib/billing/iap';
import { saleWindow } from '@/lib/billing/sale';
import { authAvailable } from '@/lib/supabase';
import { useAppStore } from '@/store/app-store';

/** renew: 하루 이용권이 곧 끝나서 — 1년권을 먼저 고른 결제 화면 */
export type PaywallReason = 'quota' | 'regenerate' | 'my' | 'banner' | 'upsell' | 'report' | 'practice' | 'mind' | 'renew';

/** 하루 이용권이 이만큼 남으면 채팅방 안내 줄에서 1년권을 권한다 */
export const RENEW_NOTICE_MS = 60 * 60 * 1000;

/** 무료를 다 써서 막힌 순간에 쓰는 이유들 */
const BLOCKED_REASONS: ReadonlySet<PaywallReason> = new Set(['quota', 'regenerate', 'report', 'practice', 'mind']);

/** 지금 막힌 이 순간에 특가 팝업을 띄울 수 있는지 (스토어 상품 확인은 팝업이 연 뒤에 한다) */
export function salePopupEligible(now = Date.now()): boolean {
  if (!quotaEnforced || !billingSupported) return false;
  const s = useAppStore.getState();
  // 비회원은 돈보다 가입(무료 보너스)을 먼저 — 결제 화면이 가입 카드를 맨 위에 보여 준다
  if (authAvailable && s.member == null) return false;
  if (currentQuota(now).remaining > 0) return false;
  // 7일 쉬는 기간이면 팝업 대신 일반 결제 화면
  return saleWindow(s.saleOfferStartedAt, now).phase !== 'cooldown';
}

/** 결제 화면으로 갈 때의 경로 — 무료를 다 써서 막혔고 특가를 열 수 있으면 특가 팝업 */
export function paywallTarget(reason: PaywallReason, now = Date.now()): { pathname: '/sale' | '/paywall'; params: { reason: PaywallReason } } {
  return BLOCKED_REASONS.has(reason) && salePopupEligible(now) ? { pathname: '/sale', params: { reason } } : { pathname: '/paywall', params: { reason } };
}
