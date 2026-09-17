import { quotaStatus, type QuotaStatus } from '@/lib/billing/quota';
import { APP_CONFIG } from '@/lib/config';
import { isDemoMode } from '@/lib/demo';
import { useAppStore } from '@/store/app-store';

/**
 * 무료 횟수 제한은 우리 서버(코치 API)를 쓸 때만 적용합니다.
 * 데모 모드나 개인 API 키 모드는 우리 비용이 들지 않으므로 제한하지 않아요.
 */
export const quotaEnforced = !isDemoMode && (Boolean(APP_CONFIG.apiUrl) || APP_CONFIG.apiSameOrigin);

const UNLIMITED: QuotaStatus = { kind: 'premium', remaining: Infinity };

export function currentQuota(now = Date.now()): QuotaStatus {
  if (!quotaEnforced) return UNLIMITED;
  const { premium, usage } = useAppStore.getState();
  return quotaStatus(premium, usage, now);
}

/** 화면용: 저장소 변화에 맞춰 다시 계산되는 남은 횟수 */
export function useQuota(): QuotaStatus & { enforced: boolean } {
  const premium = useAppStore((s) => s.premium);
  const usage = useAppStore((s) => s.usage);
  if (!quotaEnforced) return { ...UNLIMITED, enforced: false };
  return { ...quotaStatus(premium, usage, Date.now()), enforced: true };
}
