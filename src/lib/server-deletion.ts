/**
 * 서버에 남은 이 기기의 이용 기록 지우기 — 동의 철회·「모든 데이터 삭제」·만 14세 미만일 때.
 *
 * 요청은 store 의 pendingDeletion 에 남겨 두고, 서버가 지웠다고 답할 때까지 앱을 켤 때·돌아올 때 다시 보낸다
 * (네트워크가 끊겼거나 앱이 바로 꺼져도 빠지지 않게). 철회 직전에 보낸 코칭 요청은 최대 120초 뒤에 저장될 수 있어,
 * 철회 2분 30초 뒤에 한 번 더 지운 다음에 요청을 지운다. 서버는 철회 시각(before) 뒤 3분까지 생긴 기록만 지우므로
 * 그 사이 다시 동의해 생긴 새 기록은 남는다.
 */
import { APP_CONFIG } from '@/lib/config';
import { isDemoMode } from '@/lib/demo';
import { useAppStore, type PendingDeletion } from '@/store/app-store';

/** 철회 뒤 이만큼 지나 한 번 더 지운다 */
export const SETTLE_MS = 150 * 1000;

let inFlight = false;
let settleTimer: ReturnType<typeof setTimeout> | null = null;

async function sendDeletion(pending: PendingDeletion): Promise<boolean> {
  try {
    const res = await fetch(`${APP_CONFIG.apiUrl}/api/track`, {
      method: 'DELETE',
      headers: { 'content-type': 'application/json', ...(APP_CONFIG.apiToken ? { 'x-app-token': APP_CONFIG.apiToken } : {}) },
      body: JSON.stringify({ deviceId: pending.deviceId, before: pending.at }),
      keepalive: true,
    });
    // 400(형식 오류)은 다시 보내도 같으므로 끝난 것으로 본다
    return res.ok || res.status === 400;
  } catch {
    return false;
  }
}

function scheduleSettle(pending: PendingDeletion, now: number): void {
  if (settleTimer) return;
  settleTimer = setTimeout(
    () => {
      settleTimer = null;
      processPendingDeletion().catch(() => {});
    },
    Math.max(0, pending.at + SETTLE_MS - now) + 1000,
  );
}

/** 남아 있는 삭제 요청을 보낸다. 앱을 켤 때·돌아올 때·새 요청이 생겼을 때 부른다 */
export async function processPendingDeletion(now = Date.now()): Promise<void> {
  const pending = useAppStore.getState().pendingDeletion;
  if (!pending || inFlight) return;
  // 코치 서버가 없는 빌드(데모·개인 키)는 서버에 남은 기록도 없다
  if (isDemoMode || !(APP_CONFIG.apiSameOrigin || APP_CONFIG.apiUrl)) {
    useAppStore.getState().clearPendingDeletion();
    return;
  }
  const settled = now - pending.at >= SETTLE_MS;
  if (pending.sent > 0 && !settled) return scheduleSettle(pending, now);

  inFlight = true;
  let ok = false;
  try {
    ok = await sendDeletion(pending);
  } finally {
    inFlight = false;
  }
  const latest = useAppStore.getState().pendingDeletion;
  if (latest !== pending) {
    // 보내는 사이에 새 삭제 요청이 생겼다 — 그것을 이어서 처리한다
    if (latest) setTimeout(() => processPendingDeletion().catch(() => {}), 0);
    return;
  }
  if (!ok) return;
  if (settled) useAppStore.getState().clearPendingDeletion();
  else {
    useAppStore.getState().markDeletionSent();
    scheduleSettle(pending, now);
  }
}

/** 시험용: 모듈 상태 초기화 */
export function resetDeletionStateForTest(): void {
  inFlight = false;
  if (settleTimer) clearTimeout(settleTimer);
  settleTimer = null;
}
