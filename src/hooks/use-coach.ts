import { useCallback, useRef, useState } from 'react';

import { track } from '@/lib/analytics';
import { currentQuota } from '@/lib/billing/gate';
import { CoachError, requestCoaching, requireAiConsent } from '@/lib/coach-client';
import { crushToRequest, userToRequest } from '@/lib/coach-schema';
import { encodeForModel, type PickedImage } from '@/lib/images';
import type { EmojiPref, KktiSaved, Tone } from '@/lib/types';
import { analysisCacheKey, analyzedCaptureBefore, buildEarlierNotes, buildHistory, lastRequestAt, quickHash, useAppStore } from '@/store/app-store';
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
      // 실패 뒤 「다시 시도」가 같은 카드의 다른 답장을 다시 요청할 수 있게
      ...(input.variationOf ? { variationOf: input.variationOf } : {}),
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
      // 이 채팅방의 지난 대화 — 최근 턴은 그대로, 더 앞선 턴은 사용자가 직접 쓴 말만 (앞에서 한 요청을 계속 기억하게)
      const past = (useAppStore.getState().messages[crush.id] ?? []).filter((m) => m.id !== userMessage.id && m.id !== coachMessage.id);
      const history = buildHistory(past);
      const earlierNotes = buildEarlierNotes(past);
      const image = input.image ? await encodeForModel(input.image.uri, input.image.width) : undefined;
      // 캡처 지문을 남겨 둔다 — 같은 캡처를 질문·톤만 바꿔 다시 물어도 누적 온도는 처음 한 번만
      const imageHash = image ? quickHash(image.base64) : undefined;
      if (imageHash) useAppStore.getState().updateMessage(crush.id, userMessage.id, { imageHash });
      const noteParts = [input.text.trim()];
      if (input.variationOf) {
        // 누른 카드의 답장을 그대로 적어 보낸다 — 「직전 답장」이 누른 카드가 아닐 수도 있으므로
        const target = past.find((m) => m.id === input.variationOf)?.analysis;
        const before = (target?.replies ?? [])
          .map((r, i) => (r.text?.trim() ? `버전${i + 1} "${Array.from(r.text.trim()).slice(0, 200).join('')}"` : ''))
          .filter(Boolean)
          .join(' ');
        noteParts.push(before ? `바꿀 답장(${before})과 겹치지 않는 다른 각도의 새로운 답장 3개를 제안해주세요.` : '이전에 제안한 답장과는 다른 각도의 새로운 답장 3개를 제안해주세요.');
      }
      const text = noteParts.filter(Boolean).join(' ');

      // 같은 캡처·질문·톤을 다시 보내면 API 를 다시 부르지 않고 저장된 결과를 씁니다 (비용 절감).
      // 단 그 결과 뒤에 사용자가 새로 요청했으면(예: 「이모지 빼 줘」, 새 캡처) 쓰지 않는다 — 앞의 요청을 기억해서 다시 답해야 하므로
      const cacheKey = analysisCacheKey({ crushId: crush.id, tone: input.tone, text, imageBase64: image?.base64, variation: Boolean(input.variationOf), emoji });
      // 예전에 같은 요청이나 같은 캡처를 분석한 적이 있으면(재사용은 못 해도) 누적 온도는 다시 움직이지 않는다 — 같은 캡처를 두 번 세지 않게
      const seenBefore = Boolean(useAppStore.getState().analysisCache[cacheKey]) || (imageHash ? analyzedCaptureBefore(past, imageHash) : false);
      const cached = input.variationOf || secret ? null : useAppStore.getState().getCachedAnalysis(cacheKey, lastRequestAt(past));
      const latest = useAppStore.getState().crushes[crush.id] ?? crush;
      const analysis =
        cached ??
        (await requestCoaching(
          {
            crush: crushToRequest(latest),
            user: userToRequest(user, kktiLabel(useAppStore.getState().kkti)),
            tone: input.tone,
            emoji,
            // 입력창에서 프로필 기본값과 다르게 직접 고른 톤·이모지면 표시 — 앞 대화의 요청보다 우선한다
            toneChosen: input.tone !== (user.defaultTone ?? 'natural'),
            emojiChosen: emoji !== (user.emoji ?? 'on'),
            text: text || undefined,
            image,
            history,
            ...(earlierNotes.length ? { earlierNotes } : {}),
          },
          { directApiKey, deviceId: secret ? undefined : useAppStore.getState().deviceId, signal: controller.signal },
        ));
      // 새 결과는 저장하고, 저장된 결과를 다시 쓴 경우도 시각을 새로 고친다 — 같은 요청을 연달아 보내도 계속 재사용되게
      if (!input.variationOf && !secret) useAppStore.getState().putCachedAnalysis(cacheKey, analysis);
      // 실제로 AI 를 호출해 결과를 받은 경우에만 횟수를 차감한다 (오류·저장된 결과 재사용·무제한은 차감 없음)
      if (!cached && quota.kind !== 'premium') useAppStore.getState().consumeQuota();
      // 누적 온도는 처음 분석한 대화에서만 움직인다 (같은 캡처 재사용·다시 분석·다른 답장 더 보기는 그대로)
      useAppStore.getState().completeAnalysis(crush.id, coachMessage.id, analysis, { applyHeat: !cached && !seenBefore && !input.variationOf, fromCapture: Boolean(image) });
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
