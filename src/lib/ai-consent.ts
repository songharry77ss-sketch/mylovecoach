/**
 * AI 분석 동의 — 대화 캡처·상황 글·프로필을 외부 AI 로 보내기 전에 받는 명시적 동의.
 * 애플 심사 지침 5.1.2(i): 제3자 AI 로 개인정보를 보내기 전에 어디로 가는지 알리고 허락을 받아야 한다.
 *
 * - 앱의 AI 요청은 모두 coach-client 가 실제로 보내기 직전에 ensureAiConsent 를 거친다. 동의 전에는 아무것도 보내지 않는다
 * - 아직 동의하지 않았으면 루트 레이아웃의 동의 시트(AiConsentHost)를 띄우고 답을 기다린다. 요청이 동시에 여러 개 와도 시트는 하나
 * - 동의 안 함·철회는 기록만 하고, 다음에 AI 기능을 쓰면 다시 묻는다
 * - 동의는 안내한 AI 회사에만 유효하다. 개인 키로 다른 회사에 보내게 되면 그 회사로 다시 묻는다
 * - 중계 서버가 예비 AI(Claude·GPT)도 쓰게 되면서(2026-11-20) 예전 중계 동의('google')는 새 중계 경로('relay')를 대신하지 않는다 — 한 번 다시 묻는다
 * - 답을 Claude 가 먼저 만들게 되면서(2026-11-26) 「Google 먼저」 동의('relay')도 「Claude 먼저」 동의('relay2')를 대신하지 않는다 — 한 번 다시 묻는다
 */
import { track } from '@/lib/analytics';
import { useAppStore } from '@/store/app-store';

/**
 * 내용을 받는 AI 회사 (동의 단위).
 * - relay2: 우리 중계 서버 — Anthropic(Claude) 먼저, 답하지 못하면 OpenAI(GPT), 그다음 Google(Gemini) (2026-11-26 처리방침)
 * - relay: 예전 중계 동의 — Google(Gemini) 먼저, 막힐 때만 Claude·GPT (2026-11-20). 저장값을 읽기 위해서만 남긴다
 * - google·anthropic: 개인 키로 기기에서 바로 보낼 때의 회사. 예전 판 중계 동의('google')도 이 값으로 저장돼 있다 — 새 중계 동의를 대신하지 않는다
 */
export type AiProvider = 'relay2' | 'relay' | 'google' | 'anthropic';

/**
 * 중계 동의로 보내도 되는 회사들 — 동의한 순서대로 서버(api/coach.ts)에 x-ai-consent 헤더로 알린다.
 * 서버는 이 순서대로 부른다 (맨 앞이 google 이면 예전 동의로 보고 Gemini 먼저). 예전 앱은 'google' 이나 'google,anthropic,openai' 를 보낸다
 */
export const relayConsentHeader = 'anthropic,openai,google';

/** 요청이 가는 길 — 우리 중계 서버를 거쳐서(relay), 또는 개인 키로 기기에서 바로(direct) */
export interface AiRoute {
  provider: AiProvider;
  via: 'relay' | 'direct';
}

/** 화면에 쓰는 회사·AI 이름 */
export const AI_PROVIDER_LABEL: Record<AiProvider, { company: string; ai: string }> = {
  relay2: { company: 'Anthropic·OpenAI·Google', ai: 'Claude·GPT·Gemini' },
  relay: { company: 'Google·Anthropic·OpenAI', ai: 'Gemini·Claude·GPT' },
  google: { company: 'Google', ai: 'Gemini' },
  anthropic: { company: 'Anthropic', ai: 'Claude' },
};

/** 동의 시트를 띄우고 답(동의 true · 동의 안 함 false)을 돌려준다. 루트 레이아웃의 시트가 등록한다 */
export type AiConsentPrompter = (route: AiRoute) => Promise<boolean>;

let prompter: AiConsentPrompter | null = null;
/** 지금 떠 있는 시트의 답. 그사이 들어온 요청은 시트를 새로 띄우지 않고 이 답을 같이 기다린다 */
let pending: Promise<boolean> | null = null;
let consentRevision = 0;

export function setAiConsentPrompter(next: AiConsentPrompter | null): void {
  prompter = next;
}

/** 이 회사로 보내는 데 동의해 둔 상태인지 */
export function hasAiConsent(provider: AiProvider): boolean {
  const s = useAppStore.getState();
  return s.aiConsent === true && s.aiConsentProvider === provider;
}

/**
 * AI 로 내용을 보내기 직전에 부르는 관문. 이미 동의했으면 바로 true,
 * 아니면 동의 시트를 띄우고(이미 떠 있으면 그 답을 같이) 기다린다.
 * false(동의 안 함, 시트가 아직 없음)면 보내면 안 된다.
 */
export async function ensureAiConsent(route: AiRoute): Promise<boolean> {
  // 저장된 동의를 다 읽기 전에 물으면, 늦게 읽힌 예전 값이 방금 받은 답을 덮어쓸 수 있다
  await whenHydrated();
  if (hasAiConsent(route.provider)) return true;
  if (!pending) {
    const ask = prompter;
    // 시트가 아직 없으면(화면 준비 전) 물을 수 없으니 보내지 않는다
    if (!ask) return false;
    const epoch = useAppStore.getState().resetEpoch;
    const revision = consentRevision;
    pending = Promise.resolve()
      .then(() => ask(route))
      .catch(() => false)
      .then((agreed) => {
        // 시트가 열린 사이 데이터를 지우거나 동의를 철회했으면 지난 시트의 답으로 되살리지 않는다.
        if (useAppStore.getState().resetEpoch !== epoch || consentRevision !== revision) return false;
        useAppStore.getState().setAiConsent(agreed ? route.provider : null);
        track('ai_consent', { agreed, provider: route.provider, via: route.via });
        return agreed;
      })
      .finally(() => {
        pending = null;
      });
  }
  await pending;
  return hasAiConsent(route.provider);
}

/** 마이 탭에서 동의 철회 — 다음에 AI 기능을 쓰면 다시 묻는다 */
export function withdrawAiConsent(): void {
  consentRevision += 1;
  useAppStore.getState().setAiConsent(null);
  track('ai_consent_withdraw');
}

function whenHydrated(): Promise<void> {
  if (useAppStore.getState().hydrated) return Promise.resolve();
  return new Promise((resolve) => {
    const unsubscribe = useAppStore.subscribe((s) => {
      if (!s.hydrated) return;
      unsubscribe();
      resolve();
    });
  });
}
