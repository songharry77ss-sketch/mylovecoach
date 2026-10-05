import { quotaEnforced } from '@/lib/billing/gate';
import type { TeamState } from '@/lib/billing/quota';
import { APP_CONFIG } from '@/lib/config';
import { useAppStore } from '@/store/app-store';

const TIMEOUT_MS = 8000;
/** 앱을 켤 때·돌아올 때·마이 탭을 열 때마다 묻되, 너무 잦으면 건너뛴다 */
const MIN_INTERVAL_MS = 60 * 1000;

/**
 * 관리자 페이지에서 무제한을 허용한 팀원 기기인지 서버에 묻는다.
 * 팀원이면 TeamState, 아니면 null, 서버에 닿지 못했거나 명단이 아직 없으면 undefined (저장된 상태를 그대로 둔다)
 */
export async function fetchTeamStatus(deviceId: string, now = Date.now()): Promise<TeamState | null | undefined> {
  if (!deviceId || !(APP_CONFIG.apiUrl || APP_CONFIG.apiSameOrigin)) return undefined;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${APP_CONFIG.apiUrl}/api/team?deviceId=${encodeURIComponent(deviceId)}`, {
      headers: APP_CONFIG.apiToken ? { 'x-app-token': APP_CONFIG.apiToken } : {},
      signal: controller.signal,
    });
    if (!res.ok) return undefined;
    const data = (await res.json()) as { ready?: boolean; team?: boolean; label?: string };
    if (!data.ready) return undefined;
    return data.team ? { label: data.label || '팀원', verifiedAt: now } : null;
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}

let lastCheckedAt = 0;

/** 팀원 여부를 다시 확인해 저장한다 (무료 횟수 제한이 걸린 빌드에서만) */
export async function refreshTeam(): Promise<void> {
  if (!quotaEnforced) return;
  const now = Date.now();
  if (now - lastCheckedAt < MIN_INTERVAL_MS) return;
  lastCheckedAt = now;
  const { deviceId, setTeam } = useAppStore.getState();
  const result = await fetchTeamStatus(deviceId, now);
  if (result !== undefined) setTeam(result);
}
