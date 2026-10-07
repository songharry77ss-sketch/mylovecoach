import { quotaEnforced } from '@/lib/billing/gate';
import type { TeamState } from '@/lib/billing/quota';
import { APP_CONFIG } from '@/lib/config';
import { useAppStore } from '@/store/app-store';

const TIMEOUT_MS = 8000;
/** 앱을 켤 때·돌아올 때·마이 탭을 열 때마다 묻되, 너무 잦으면 건너뛴다 */
const MIN_INTERVAL_MS = 60 * 1000;
/** 「내 기기 ID」를 누른 뒤 이 기간 안에 팀원으로 등록되지 않으면 더 묻지 않는다 */
export const TEAM_CHECK_DAYS = 14;
const TEAM_CHECK_MS = TEAM_CHECK_DAYS * 24 * 60 * 60 * 1000;

/**
 * 관리자 페이지에서 무제한을 허용한 팀원 기기인지 서버에 묻는다.
 * 팀원이면 TeamState, 아니면 null, 서버에 닿지 못했거나 명단이 아직 없으면 undefined (저장된 상태를 그대로 둔다)
 */
export async function fetchTeamStatus(deviceId: string, now = Date.now()): Promise<TeamState | null | undefined> {
  if (!deviceId || !(APP_CONFIG.apiUrl || APP_CONFIG.apiSameOrigin)) return undefined;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    // 기기 ID 는 주소(쿼리)에 실으면 요청 기록에 남으므로 머리글로 보낸다
    const res = await fetch(`${APP_CONFIG.apiUrl}/api/team`, {
      headers: { 'x-device-id': deviceId, ...(APP_CONFIG.apiToken ? { 'x-app-token': APP_CONFIG.apiToken } : {}) },
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

/**
 * 팀원 여부를 다시 확인해 저장한다 (무료 횟수 제한이 걸린 빌드에서만).
 * 기기 ID 를 서버로 보내는 일이라, 이미 팀원인 기기와 「내 기기 ID」를 눌러 팀원 등록을 하려는 기기(누른 뒤 14일 동안)에서만 묻는다
 * (이용 기록에 동의하지 않은 일반 이용자의 기기 ID 는 보내지 않는다).
 */
export async function refreshTeam(options: { force?: boolean } = {}): Promise<void> {
  if (!quotaEnforced) return;
  const { deviceId, setTeam, team, teamCheck, teamCheckAt } = useAppStore.getState();
  const now = Date.now();
  let checking = teamCheck;
  if (teamCheck && !teamCheckAt) useAppStore.setState({ teamCheckAt: now }); // 예전 판에서 켠 확인은 지금부터 14일
  else if (teamCheck && now - teamCheckAt > TEAM_CHECK_MS && !team) {
    useAppStore.getState().disableTeamCheck();
    checking = false;
  }
  if (!team && !checking) return;
  if (!options.force && now - lastCheckedAt < MIN_INTERVAL_MS) return;
  lastCheckedAt = now;
  const result = await fetchTeamStatus(deviceId, now);
  if (result !== undefined) setTeam(result);
}
