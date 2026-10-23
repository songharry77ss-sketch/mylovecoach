import { useCallback, useEffect, useMemo, useRef } from 'react';

import { track } from '@/lib/analytics';
import { useQuota } from '@/lib/billing/gate';

/** 막힌 뒤 이만큼 지난 요청은 저절로 보내지 않는다 */
export const RESUME_WINDOW_MS = 30 * 60 * 1000;
/**
 * 결제 화면이 닫힌 뒤 이 시간 안에 횟수가 생겨야 이어 준다.
 * 결제·가입으로 닫힐 때는 횟수가 거의 함께 생기고(가입 보너스는 서버 응답을 기다려 조금 늦을 수 있음),
 * 결제 없이 닫고 한참 뒤에 자정 충전 등으로 횟수가 생겼을 때 예전 요청이 저절로 나가지 않게 한다.
 */
export const CLOSE_GRACE_MS = 15 * 1000;

interface Pending {
  run: () => void;
  at: number;
  owner: number;
  feature: string;
  /** 결제 화면이 닫힌 시각 (아직 열려 있으면 null) */
  closedAt: number | null;
}

// 앱 전체에서 한 칸 — 마지막으로 막힌 것만 이어 간다 (여러 화면이 각자 기억해 한꺼번에 실행되지 않게)
let slot: Pending | null = null;
let nextOwner = 1;

/** 결제 화면이 닫힐 때 부른다 (paywall.tsx). 이후 CLOSE_GRACE_MS 안에 횟수가 생기지 않으면 이어 가지 않는다 */
export function paywallClosed(now = Date.now()): void {
  if (slot && slot.closedAt == null) slot.closedAt = now;
}

/** 테스트용 */
export function resetResumeSlot(): void {
  slot = null;
}

/**
 * 무료 횟수가 없어 막힌 동작을 기억해 두었다가, 결제·가입 보너스로 횟수가 생기면 한 번만 다시 실행한다.
 * 결제하고 돌아왔는데 보내기를 다시 눌러야 하는(또는 결제가 안 된 줄 아는) 일을 없앤다.
 * - remember(run): 막힌 순간(결제 화면을 띄우기 직전·직후)에 부른다. run 은 최신 함수를 부르도록 ref 를 거친다
 * - 결제 화면이 열려 있는 동안이나 닫힌 직후(CLOSE_GRACE_MS) 횟수가 생기면 실행하고 잊는다
 * - 기억한 화면이 사라지거나 forget 하면 버린다. 다른 화면에서 새로 막히면 그것으로 바뀐다
 * - AI 분석 동의 같은 절차는 run 안에서 평소처럼 거친다 (여기서 건너뛰지 않음)
 */
export function useResumeAfterPaywall(feature: string) {
  const quota = useQuota();
  const owner = useRef(0);
  if (!owner.current) owner.current = nextOwner++;

  const remember = useCallback(
    (run: () => void) => {
      slot = { run, at: Date.now(), owner: owner.current, feature, closedAt: null };
    },
    [feature],
  );
  const forget = useCallback(() => {
    if (slot?.owner === owner.current) slot = null;
  }, []);

  // 화면이 사라지면 이 화면이 기억한 것은 버린다 (사라진 화면의 함수를 부르지 않게)
  useEffect(() => {
    const id = owner.current;
    return () => {
      if (slot?.owner === id) slot = null;
    };
  }, []);

  useEffect(() => {
    const p = slot;
    if (!p || p.owner !== owner.current || quota.remaining <= 0) return;
    slot = null;
    const now = Date.now();
    if (now - p.at > RESUME_WINDOW_MS) return;
    if (p.closedAt != null && now - p.closedAt > CLOSE_GRACE_MS) return;
    track('paywall_resume', { feature: p.feature, kind: quota.kind });
    p.run();
  }, [quota.remaining, quota.kind]);

  return useMemo(() => ({ remember, forget }), [remember, forget]);
}
