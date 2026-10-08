import { useAppStore } from '@/store/app-store';
import type { AiProvider } from '@/lib/ai-consent';

/** 삭제·동의 철회 뒤에는 진행 중인 AI 요청과 늦게 온 결과를 함께 버린다. */
export function beginAiRequest(crushId?: string) {
  const epoch = useAppStore.getState().resetEpoch;
  const controller = new AbortController();
  let provider: AiProvider | undefined;
  const consentChanged = () => {
    const state = useAppStore.getState();
    return provider !== undefined && (state.aiConsent !== true || state.aiConsentProvider !== provider);
  };
  const unsubscribe = useAppStore.subscribe((state, previous) => {
    const withdrew = previous.aiConsent === true && state.aiConsent !== true;
    if (state.resetEpoch !== epoch || withdrew || consentChanged() || (crushId && !state.crushes[crushId])) controller.abort();
  });
  return {
    controller,
    // 다른 회사로 새로 동의하는 과정은 허용하고, 전송 직전에 해당 요청의 회사로 고정한다.
    confirmConsent: (expectedProvider?: AiProvider) => {
      provider = expectedProvider;
      if (consentChanged()) controller.abort();
    },
    active: () => !controller.signal.aborted && !consentChanged() && useAppStore.getState().resetEpoch === epoch && (!crushId || Boolean(useAppStore.getState().crushes[crushId])),
    finish: unsubscribe,
  };
}
