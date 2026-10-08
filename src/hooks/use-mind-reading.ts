import { useCallback, useRef, useState } from 'react';

import { useAiAction } from '@/hooks/use-ai-action';
import { track } from '@/lib/analytics';
import { requestAi } from '@/lib/coach-client';
import type { Gender, MindReading } from '@/lib/types';
import { mindCacheKey, useAppStore } from '@/store/app-store';

/** 풀이를 한 번 요청한 결과 — fresh: AI 가 새로 풂 · reused: 저장된 풀이를 다시 보여 줌 · failed: 실패(안내는 error·blocked) · null: 물어볼 상황이 없음 */
export type MindOutcome = 'fresh' | 'reused' | 'failed' | null;

/**
 * 속마음 풀이 흐름.
 * 같은 상황 글·대상 성별·내 프로필(성별·나이·MBTI)로 전에 풀어 둔 결과가 있으면 AI 를 다시 부르지 않고 그대로 보여 준다
 * (기기 안 저장 · 횟수 차감 없음 · 아무것도 보내지 않으니 AI 분석 동의도 묻지 않음).
 * 「다시 풀이」(ask(true))만 저장된 결과를 건너뛰고 새로 부른다 — 이때는 보통처럼 1회 차감
 */
export function useMindReading(situation: string, perspective: Gender, initial?: MindReading | null) {
  const action = useAiAction();
  const { run } = action;
  const user = useAppStore((s) => s.user);
  const [reading, setReading] = useState<MindReading | null>(initial ?? null);
  /** 저장된 풀이를 다시 보여 주는 중인지 (화면에 짧게 알린다) */
  const [reused, setReused] = useState(false);
  /** 마지막 요청이 「다시 풀이」였는지 — 실패 뒤 「다시 시도」도 같은 방식으로 */
  const lastForce = useRef(false);

  const ask = useCallback(
    async (force: boolean): Promise<MindOutcome> => {
      if (!situation) return null;
      const epoch = useAppStore.getState().resetEpoch;
      const asker = user ? { gender: user.gender, age: user.age, mbti: user.mbti } : undefined;
      const key = mindCacheKey({ situation, perspective, user: asker });
      if (!force) {
        const saved = useAppStore.getState().getCachedMind(key);
        if (saved) {
          setReading(saved);
          setReused(true);
          useAppStore.getState().addMindAnswer({ situation, perspective, reading: saved, at: Date.now(), key });
          track('mind_success', { cached: true });
          return 'reused';
        }
      }
      lastForce.current = force;
      const fresh = await run('mind', (o) => requestAi('mind', { situation, perspective, user: asker }, o), { reason: 'mind' });
      if (!fresh || useAppStore.getState().resetEpoch !== epoch) return 'failed';
      setReading(fresh);
      setReused(false);
      const store = useAppStore.getState();
      store.putCachedMind(key, fresh);
      store.addMindAnswer({ situation, perspective, reading: fresh, at: Date.now(), key });
      return 'fresh';
    },
    [situation, perspective, user, run],
  );

  const retry = useCallback(() => ask(lastForce.current), [ask]);

  return { ...action, reading, reused, ask, retry };
}
