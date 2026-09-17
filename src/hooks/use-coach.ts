import { useCallback, useRef, useState } from 'react';

import { currentQuota } from '@/lib/billing/gate';
import { CoachError, requestCoaching } from '@/lib/coach-client';
import { crushToRequest, userToRequest } from '@/lib/coach-schema';
import { encodeForModel, type PickedImage } from '@/lib/images';
import type { Tone } from '@/lib/types';
import { analysisCacheKey, buildHistory, useAppStore } from '@/store/app-store';
import { loadApiKey } from '@/store/storage';

export interface SendInput {
  crushId: string;
  image: PickedImage | null;
  text: string;
  tone: Tone;
  /** 같은 캡처로 다른 답장을 요청하는 경우 */
  variationOf?: string;
}

export type SendResult = 'sent' | 'blocked' | 'skipped';

/**
 * 코칭 요청 전체 플로우 (메시지 추가 → 이미지 인코딩 → API → 결과 반영).
 * 무료 횟수를 다 쓴 상태면 아무것도 보내지 않고 'blocked' 를 돌려줍니다 (화면에서 프리미엄 안내를 띄움).
 */
export function useCoach() {
  const [sending, setSending] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const send = useCallback(async (input: SendInput): Promise<SendResult> => {
    const state = useAppStore.getState();
    const crush = state.crushes[input.crushId];
    const user = state.user;
    if (!crush || !user) return 'skipped';
    const quota = currentQuota();
    if (quota.remaining <= 0) return 'blocked';

    const userMessage = state.addMessage({
      crushId: crush.id,
      role: 'user',
      imageUri: input.variationOf ? undefined : (input.image?.uri ?? undefined),
      text: input.variationOf ? '🔄 다른 답장 더 보기' : input.text || undefined,
      tone: input.tone,
    });
    const coachMessage = state.addMessage({ crushId: crush.id, role: 'coach', pending: true });

    setSending(true);
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const history = buildHistory((useAppStore.getState().messages[crush.id] ?? []).filter((m) => m.id !== userMessage.id && m.id !== coachMessage.id));
      const image = input.image ? await encodeForModel(input.image.uri, input.image.width) : undefined;
      const noteParts = [input.text.trim()];
      if (input.variationOf) noteParts.push('이전에 제안한 답장과는 다른 각도의 새로운 답장 3개를 제안해주세요.');
      const text = noteParts.filter(Boolean).join(' ');

      // 같은 캡처·질문·톤을 다시 보내면 API 를 다시 부르지 않고 저장된 결과를 씁니다 (비용 절감)
      const cacheKey = analysisCacheKey({ crushId: crush.id, tone: input.tone, text, imageBase64: image?.base64, variation: Boolean(input.variationOf) });
      const cached = input.variationOf ? null : useAppStore.getState().getCachedAnalysis(cacheKey);
      const analysis =
        cached ??
        (await requestCoaching(
          {
            crush: crushToRequest(crush),
            user: userToRequest(user),
            tone: input.tone,
            text: text || undefined,
            image,
            history,
          },
          { directApiKey: await loadApiKey(), signal: controller.signal },
        ));
      if (!cached && !input.variationOf) useAppStore.getState().putCachedAnalysis(cacheKey, analysis);
      // 실제로 AI 를 호출해 결과를 받은 경우에만 무료 횟수를 차감한다 (오류·저장된 결과 재사용은 차감 없음)
      if (!cached && quota.kind !== 'premium') useAppStore.getState().consumeFreeCredit();
      useAppStore.getState().completeAnalysis(crush.id, coachMessage.id, analysis);
    } catch (e) {
      const message = e instanceof CoachError ? e.message : e instanceof Error ? e.message : '알 수 없는 오류가 발생했어요.';
      const code = e instanceof CoachError ? e.code : 'server';
      useAppStore.getState().updateMessage(crush.id, coachMessage.id, { pending: false, error: message, text: code });
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setSending(false);
    }
    return 'sent';
  }, []);

  const cancel = useCallback(() => abortRef.current?.abort(), []);

  return { send, sending, cancel };
}
