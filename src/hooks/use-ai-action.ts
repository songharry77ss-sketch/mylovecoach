import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

import { track } from '@/lib/analytics';
import { beginAiRequest } from '@/lib/ai-request-lifetime';
import { currentQuota } from '@/lib/billing/gate';
import { aiRouteOf, CoachError, requireAiConsent, type AiFeature } from '@/lib/coach-client';
import { useAppStore } from '@/store/app-store';
import { loadApiKey } from '@/store/storage';

export type PaywallReason = 'quota' | 'regenerate' | 'my' | 'banner' | 'report' | 'practice' | 'mind';

/**
 * 보고서·속마음·연습처럼 AI 를 한 번 부르는 기능의 공통 흐름.
 * - 남은 횟수가 없으면 결제 화면을 띄우고 부르지 않는다
 * - AI 분석 동의를 먼저 받고, 동의한 뒤에만 「분석 중」(busy)을 켜고 call 을 부른다. 동의 안 함이면 안내(error)만 남긴다
 * - 성공했을 때만 1회 차감한다 (chargeable=false 면 차감 없음 — 연습 대화의 두 번째 턴부터 등)
 */
export function useAiAction() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** 남은 횟수가 없어 부르지 못했는지 (화면에서 이용권 안내를 보여 준다) */
  const [blocked, setBlocked] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => () => abortRef.current?.abort(), []);

  const openPaywall = useCallback((reason: PaywallReason) => router.push({ pathname: '/paywall', params: { reason } }), [router]);

  /** 남은 횟수 확인. 없으면 결제 화면을 띄우고 false */
  const ensureQuota = useCallback(
    (reason: PaywallReason): boolean => {
      if (currentQuota().remaining > 0) return true;
      track('ai_blocked', { reason });
      openPaywall(reason);
      return false;
    },
    [openPaywall],
  );

  const run = useCallback(
    async <T>(
      name: Exclude<AiFeature, 'coach'>,
      call: (options: { directApiKey: string | null; signal: AbortSignal }) => Promise<T>,
      options: { chargeable?: boolean; reason: PaywallReason },
    ): Promise<T | null> => {
      const chargeable = options.chargeable ?? true;
      setBlocked(false);
      if (chargeable && !ensureQuota(options.reason)) {
        setBlocked(true);
        return null;
      }
      setError(null);
      abortRef.current?.abort();
      const request = beginAiRequest();
      const { controller } = request;
      abortRef.current = controller;
      try {
        const directApiKey = await loadApiKey();
        if (!request.active()) return null;
        await requireAiConsent(name, directApiKey);
        request.confirmConsent(aiRouteOf(directApiKey)?.provider);
        if (!request.active()) return null;
        setBusy(true);
        const result = await call({ directApiKey, signal: controller.signal });
        if (!request.active()) return null;
        // 무제한(프리미엄·제한 없음)이면 차감하지 않는다. 하루 이용권은 consumeQuota 가 알아서 건너뛴다
        if (chargeable && currentQuota().kind !== 'premium') useAppStore.getState().consumeQuota();
        track(`${name}_success`);
        return result;
      } catch (e) {
        const message = e instanceof CoachError ? e.message : e instanceof Error ? e.message : '알 수 없는 오류가 발생했어요.';
        if (!controller.signal.aborted) setError(message);
        track(`${name}_error`, { code: e instanceof CoachError ? e.code : 'server' });
        return null;
      } finally {
        request.finish();
        // 새 요청이 이어받았으면(빠르게 두 번 누름) 그 요청이 아직 진행 중이니 busy 는 그대로 둔다
        if (abortRef.current === controller) {
          abortRef.current = null;
          setBusy(false);
        }
      }
    },
    [ensureQuota],
  );

  const cancel = useCallback(() => abortRef.current?.abort(), []);

  return { run, busy, error, setError, blocked, ensureQuota, openPaywall, cancel };
}
