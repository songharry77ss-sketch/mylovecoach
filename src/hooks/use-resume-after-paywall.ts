import { useCallback, useEffect, useMemo, useRef } from 'react';

import { track } from '@/lib/analytics';
import { useQuota } from '@/lib/billing/gate';

/** 결제 화면에 다녀오는 동안만 이어 준다 — 너무 오래 지난 요청은 저절로 보내지 않는다 */
export const RESUME_WINDOW_MS = 30 * 60 * 1000;

/**
 * 무료 횟수가 없어 막힌 동작을 기억해 두었다가, 결제·가입 보너스로 횟수가 생기면 한 번만 다시 실행한다.
 * 결제하고 돌아왔는데 보내기를 다시 눌러야 하는(또는 결제가 안 된 줄 아는) 일을 없앤다.
 * - remember(run): 막힌 순간에 부른다. run 은 그때의 화면 상태가 아니라 최신 함수를 부르도록 ref 를 거친다
 * - 횟수가 0 에서 생기는 순간(결제 완료·하루 이용권·횟수권·가입 보너스·팀원 허용)에 실행하고 잊는다
 * - AI 분석 동의 같은 절차는 run 안에서 평소처럼 거친다 (여기서 건너뛰지 않음)
 */
export function useResumeAfterPaywall(feature: string) {
  const quota = useQuota();
  const pending = useRef<{ run: () => void; at: number } | null>(null);

  const remember = useCallback((run: () => void) => {
    pending.current = { run, at: Date.now() };
  }, []);
  const forget = useCallback(() => {
    pending.current = null;
  }, []);

  useEffect(() => {
    const p = pending.current;
    if (!p || quota.remaining <= 0) return;
    pending.current = null;
    if (Date.now() - p.at > RESUME_WINDOW_MS) return;
    track('paywall_resume', { feature, kind: quota.kind });
    p.run();
  }, [quota.remaining, quota.kind, feature]);

  return useMemo(() => ({ remember, forget }), [remember, forget]);
}
