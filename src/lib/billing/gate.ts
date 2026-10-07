import { FREE_UNLIMITED } from '@/lib/billing/plans';
import { quotaStatus, type QuotaStatus } from '@/lib/billing/quota';
import { useTestInstall } from '@/lib/billing/test-install';
import { APP_CONFIG } from '@/lib/config';
import { isDemoMode } from '@/lib/demo';
import { useAppStore } from '@/store/app-store';

/** 우리 서버(코치 API)를 쓰는 빌드인지 — 데모 모드나 개인 API 키 모드는 우리 비용이 들지 않으므로 제한하지 않아요 */
const serverQuota = !isDemoMode && (Boolean(APP_CONFIG.apiUrl) || APP_CONFIG.apiSameOrigin);

/**
 * 무료 횟수 제한을 적용하는지.
 * 무제한 테스트 빌드(FREE_UNLIMITED — TestFlight 전용 빌드·직접 설치 APK)라도 테스트 경로 설치가 확인된 뒤에만 끈다.
 * iOS 는 TestFlight(샌드박스) 설치일 때만 확인되므로(test-install.ts), 이 빌드가 App Store 에 나가도 이용자에게는 유료 동작이다
 */
export function isQuotaEnforced(testUnlimited = useTestInstall.getState().unlimited): boolean {
  return serverQuota && !(FREE_UNLIMITED && testUnlimited);
}

const UNLIMITED: QuotaStatus = { kind: 'premium', remaining: Infinity };

export function currentQuota(now = Date.now()): QuotaStatus {
  if (!isQuotaEnforced()) return UNLIMITED;
  const { premium, usage, wallet, team } = useAppStore.getState();
  return quotaStatus(premium, usage, now, wallet, team);
}

/** 화면용: 저장소 변화에 맞춰 다시 계산되는 남은 횟수 */
export function useQuota(): QuotaStatus & { enforced: boolean } {
  const premium = useAppStore((s) => s.premium);
  const usage = useAppStore((s) => s.usage);
  const wallet = useAppStore((s) => s.wallet);
  const team = useAppStore((s) => s.team);
  const testUnlimited = useTestInstall((s) => s.unlimited);
  if (!isQuotaEnforced(testUnlimited)) return { ...UNLIMITED, enforced: false };
  return { ...quotaStatus(premium, usage, Date.now(), wallet, team), enforced: true };
}

/** 무제한(프리미엄·팀원·하루 이용권·제한 없음)인지 */
export const isUnlimited = (q: QuotaStatus) => q.kind === 'premium' || q.kind === 'team' || q.kind === 'pass';
