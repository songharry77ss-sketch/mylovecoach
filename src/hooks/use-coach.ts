import { useCallback, useRef, useState } from 'react';

import { track } from '@/lib/analytics';
import { currentQuota } from '@/lib/billing/gate';
import { CoachError, requestCoaching, requireAiConsent } from '@/lib/coach-client';
import { crushToRequest, userToRequest } from '@/lib/coach-schema';
import { encodeForModel, type PickedImage } from '@/lib/images';
import type { EmojiPref, KktiSaved, Tone } from '@/lib/types';
import { analysisCacheKey, buildHistory, useAppStore } from '@/store/app-store';
import { loadApiKey } from '@/store/storage';

export interface SendInput {
  crushId: string;
  image: PickedImage | null;
  text: string;
  tone: Tone;
  /** 답장에 이모지 넣기 (없으면 내 프로필 기본값) */
  emoji?: EmojiPref;
  /** 같은 캡처로 다른 답장을 요청하는 경우 */
  variationOf?: string;
}

export type SendResult = 'sent' | 'blocked' | 'skipped';

/** 프롬프트에 넣을 KKTI 한 줄 (예: 선빠폭직 직진 불도저) */
export const kktiLabel = (k: KktiSaved | null | undefined) => (k ? `${k.code} ${k.name}`.slice(0, 40) : undefined);

/**
 * 코칭 요청 전체 플로우 (메시지 추가 → AI 분석 동의 → 이미지 인코딩 → API → 결과 반영).
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
    if (quota.remaining <= 0) {
      track('coach_blocked', { reason: 'quota' });
      return 'blocked';
    }

    const userMessage = state.addMessage({
      crushId: crush.id,
      role: 'user',
      imageUri: input.variationOf ? undefined : (input.image?.uri ?? undefined),
      text: input.variationOf ? '🔄 다른 답장 더 보기' : input.text || undefined,
      tone: input.tone,
    });
    // 「분석 중」 말풍선은 AI 분석 동의를 받은 뒤에 띄운다 — 동의 시트가 떠 있는 동안 분석이 시작된 것처럼 보이지 않게.
    // 동의 안 함이면 아무것도 보내지 않고 안내만 남긴다 (횟수도 그대로)
    const directApiKey = await loadApiKey();
    try {
      await requireAiConsent('coach', directApiKey);
    } catch (e) {
      const code = e instanceof CoachError ? e.code : 'server';
      state.addMessage({ crushId: crush.id, role: 'coach', pending: false, error: e instanceof Error ? e.message : '알 수 없는 오류가 발생했어요.', text: code });
      track('coach_error', { code });
      return 'sent';
    }
    const coachMessage = state.addMessage({ crushId: crush.id, role: 'coach', pending: true });

    setSending(true);
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const emoji = input.emoji ?? user.emoji ?? 'on';
    // 비밀 상담은 결과를 캐시에 남기지 않고, 이용 기록용 기기 ID 도 보내지 않는다
    const secret = Boolean(crush.secret);

    try {
      const history = buildHistory((useAppStore.getState().messages[crush.id] ?? []).filter((m) => m.id !== userMessage.id && m.id !== coachMessage.id));
      const image = input.image ? await encodeForModel(input.image.uri, input.image.width) : undefined;
      const noteParts = [input.text.trim()];
      if (input.variationOf) noteParts.push('이전에 제안한 답장과는 다른 각도의 새로운 답장 3개를 제안해주세요.');
      const text = noteParts.filter(Boolean).join(' ');

      // 같은 캡처·질문·톤을 다시 보내면 API 를 다시 부르지 않고 저장된 결과를 씁니다 (비용 절감)
      const cacheKey = analysisCacheKey({ crushId: crush.id, tone: input.tone, text, imageBase64: image?.base64, variation: Boolean(input.variationOf), emoji });
      const cached = input.variationOf || secret ? null : useAppStore.getState().getCachedAnalysis(cacheKey);
      const latest = useAppStore.getState().crushes[crush.id] ?? crush;
      const analysis =
        cached ??
        (await requestCoaching(
          {
            crush: crushToRequest(latest),
            user: userToRequest(user, kktiLabel(useAppStore.getState().kkti)),
            tone: input.tone,
            emoji,
            text: text || undefined,
            image,
            history,
          },
          { directApiKey, deviceId: secret ? undefined : useAppStore.getState().deviceId, signal: controller.signal },
        ));
      if (!cached && !input.variationOf && !secret) useAppStore.getState().putCachedAnalysis(cacheKey, analysis);
      // 실제로 AI 를 호출해 결과를 받은 경우에만 횟수를 차감한다 (오류·저장된 결과 재사용·무제한은 차감 없음)
      if (!cached && quota.kind !== 'premium') useAppStore.getState().consumeQuota();
      // 누적 온도는 새로 분석한 대화에서만 움직인다 (같은 캡처 재사용·다른 답장 더 보기는 그대로)
      useAppStore.getState().completeAnalysis(crush.id, coachMessage.id, analysis, { applyHeat: !cached && !input.variationOf, fromCapture: Boolean(image) });
      // 비밀 상담은 내용(결과 온도·톤·캡처 여부)을 이용 기록으로 보내지 않고 이용했다는 사실만 남긴다
      track(
        'coach_success',
        secret
          ? { secret: true }
          : { cached: Boolean(cached), hasImage: Boolean(image), tone: input.tone, variation: Boolean(input.variationOf), temperature: analysis.temperature, secret, emoji },
      );
    } catch (e) {
      const message = e instanceof CoachError ? e.message : e instanceof Error ? e.message : '알 수 없는 오류가 발생했어요.';
      const code = e instanceof CoachError ? e.code : 'server';
      useAppStore.getState().updateMessage(crush.id, coachMessage.id, { pending: false, error: message, text: code });
      track('coach_error', secret ? { code, secret: true } : { code });
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setSending(false);
    }
    return 'sent';
  }, []);

  const cancel = useCallback(() => abortRef.current?.abort(), []);

  return { send, sending, cancel };
}
