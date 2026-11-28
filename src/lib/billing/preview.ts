/**
 * 잠금 미리보기 — 무료를 다 쓴 뒤에도 하루 한 번은 막지 않고 분석해서 관심도·코치 한마디·답장 1개를 보여 주고,
 * 나머지 답장은 가린다(이용권·가입 보너스가 생기면 바로 보인다).
 *
 * 2026-11-28 결제 전환 검토(김대표 3번): 결과를 하나도 못 본 채 결제 화면만 보면 돈을 낼 이유가 약하다 —
 * 「방금 보낸 캡처」의 결과 일부를 먼저 보여 주면 결제 시도가 1.5~2배(추정). AI 비용이 들어서 하루 한 번만.
 * 앱(스토어 결제가 되는 곳)에서만 — 웹은 결제를 못 하고 비회원 가림(가입 유도)이 따로 있다.
 */
import { currentQuota, quotaEnforced } from '@/lib/billing/gate';
import { billingSupported } from '@/lib/billing/iap';
import { dayKey } from '@/lib/billing/quota';
import { useAppStore } from '@/store/app-store';

/** 미리보기에서 보여 주는 답장 수 (나머지는 가린다) */
export const PREVIEW_VISIBLE_REPLIES = 1;

/** 지금 막힌 요청을 미리보기로 보낼 수 있는지 — 무료를 다 썼고, 오늘 아직 미리보기를 쓰지 않았을 때 */
export function previewAvailable(now = Date.now()): boolean {
  if (!quotaEnforced || !billingSupported) return false;
  if (currentQuota(now).remaining > 0) return false;
  return useAppStore.getState().previewDay !== dayKey(now);
}

/** 미리보기로 받은 결과를 아직 가려야 하는지 — 횟수가 없을 때만 (결제·가입 보너스·다음 날 충전이 생기면 보인다) */
export const previewLocked = (preview: boolean | undefined, remaining: number): boolean => Boolean(preview) && remaining <= 0;
