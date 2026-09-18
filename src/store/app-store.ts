import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { consumeFree, EMPTY_USAGE, type PremiumState, type UsageState } from '@/lib/billing/quota';
import { createId } from '@/lib/id';
import type { ChatMessage, CoachAnalysis, Crush, HistoryTurn, Tone, UserProfile } from '@/lib/types';
import { appStorage } from '@/store/storage';

export interface AppState {
  hydrated: boolean;
  user: UserProfile | null;
  crushes: Record<string, Crush>;
  messages: Record<string, ChatMessage[]>; // crushId -> messages (오래된 순)
  /** 직접 호출 모드 API 키 보유 여부 (실제 키는 SecureStore) */
  hasApiKey: boolean;
  /** 동일 요청(캡처+질문+톤) 재호출 방지용 결과 캐시. 키 → { analysis, at } */
  analysisCache: Record<string, { analysis: CoachAnalysis; at: number }>;
  /** 프리미엄 상태 (스토어 조회 결과의 캐시). null 이면 무료 이용자 */
  premium: PremiumState | null;
  /** 무료 코칭 사용량 */
  usage: UsageState;
  /** 채팅 하단의 프리미엄 안내 카드를 닫았는지 */
  upsellDismissed: boolean;
  /** 기기 구분용 무작위 ID (광고 ID 아님, 이용 기록 수집에만 사용) */
  deviceId: string;
  /** 서비스 개선을 위한 이용 기록 수집 동의 (선택) — null 이면 아직 묻지 않음 */
  analyticsConsent: boolean | null;

  setHydrated: () => void;
  setUser: (user: UserProfile) => void;
  updateUser: (patch: Partial<UserProfile>) => void;

  addCrush: (input: Omit<Crush, 'id' | 'createdAt' | 'updatedAt'>) => Crush;
  updateCrush: (id: string, patch: Partial<Omit<Crush, 'id' | 'createdAt'>>) => void;
  removeCrush: (id: string) => void;

  addMessage: (message: Omit<ChatMessage, 'id' | 'createdAt'> & { id?: string; createdAt?: number }) => ChatMessage;
  updateMessage: (crushId: string, id: string, patch: Partial<ChatMessage>) => void;
  removeMessage: (crushId: string, id: string) => void;
  clearMessages: (crushId: string) => void;
  completeAnalysis: (crushId: string, messageId: string, analysis: CoachAnalysis) => void;
  selectReply: (crushId: string, messageId: string, index: number) => void;

  setHasApiKey: (v: boolean) => void;
  getCachedAnalysis: (key: string) => CoachAnalysis | null;
  putCachedAnalysis: (key: string, analysis: CoachAnalysis) => void;
  setAnalyticsConsent: (consent: boolean) => void;
  setPremium: (premium: PremiumState | null) => void;
  consumeFreeCredit: () => void;
  dismissUpsell: () => void;
  resetAll: () => void;
}

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_MAX = 40;

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      hydrated: false,
      user: null,
      crushes: {},
      messages: {},
      hasApiKey: false,
      analysisCache: {},
      premium: null,
      usage: EMPTY_USAGE,
      upsellDismissed: false,
      deviceId: createId('d_'),
      analyticsConsent: null,

      setHydrated: () => set({ hydrated: true }),
      setUser: (user) => set({ user }),
      updateUser: (patch) => set((s) => (s.user ? { user: { ...s.user, ...patch } } : {})),

      addCrush: (input) => {
        const now = Date.now();
        const crush: Crush = { ...input, id: createId('c_'), createdAt: now, updatedAt: now };
        set((s) => ({ crushes: { ...s.crushes, [crush.id]: crush }, messages: { ...s.messages, [crush.id]: [] } }));
        return crush;
      },
      updateCrush: (id, patch) =>
        set((s) => {
          const prev = s.crushes[id];
          if (!prev) return {};
          return { crushes: { ...s.crushes, [id]: { ...prev, ...patch, updatedAt: Date.now() } } };
        }),
      removeCrush: (id) =>
        set((s) => {
          const crushes = { ...s.crushes };
          const messages = { ...s.messages };
          delete crushes[id];
          delete messages[id];
          return { crushes, messages };
        }),

      addMessage: (input) => {
        const message: ChatMessage = { ...input, id: input.id ?? createId('m_'), createdAt: input.createdAt ?? Date.now() };
        set((s) => {
          const list = s.messages[message.crushId] ?? [];
          const crush = s.crushes[message.crushId];
          return {
            messages: { ...s.messages, [message.crushId]: [...list, message] },
            crushes: crush ? { ...s.crushes, [crush.id]: { ...crush, lastMessageAt: message.createdAt } } : s.crushes,
          };
        });
        return message;
      },
      updateMessage: (crushId, id, patch) =>
        set((s) => ({
          messages: {
            ...s.messages,
            [crushId]: (s.messages[crushId] ?? []).map((m) => (m.id === id ? { ...m, ...patch } : m)),
          },
        })),
      removeMessage: (crushId, id) =>
        set((s) => ({
          messages: { ...s.messages, [crushId]: (s.messages[crushId] ?? []).filter((m) => m.id !== id) },
        })),
      clearMessages: (crushId) => set((s) => ({ messages: { ...s.messages, [crushId]: [] } })),
      completeAnalysis: (crushId, messageId, analysis) => {
        get().updateMessage(crushId, messageId, { analysis, pending: false, error: undefined });
        set((s) => {
          const crush = s.crushes[crushId];
          if (!crush) return {};
          return {
            crushes: {
              ...s.crushes,
              [crushId]: {
                ...crush,
                lastTemperature: analysis.temperature,
                lastInterestScore: analysis.interestScore ?? crush.lastInterestScore,
                lastMessageAt: Date.now(),
              },
            },
          };
        });
      },
      selectReply: (crushId, messageId, index) => get().updateMessage(crushId, messageId, { selectedReplyIndex: index }),

      setHasApiKey: (hasApiKey) => set({ hasApiKey }),
      getCachedAnalysis: (key) => {
        const hit = get().analysisCache[key];
        if (!hit) return null;
        if (Date.now() - hit.at > CACHE_TTL_MS) return null;
        return hit.analysis;
      },
      putCachedAnalysis: (key, analysis) =>
        set((s) => {
          const entries = Object.entries(s.analysisCache)
            .filter(([, v]) => Date.now() - v.at <= CACHE_TTL_MS)
            .sort((a, b) => b[1].at - a[1].at)
            .slice(0, CACHE_MAX - 1);
          return { analysisCache: { ...Object.fromEntries(entries), [key]: { analysis, at: Date.now() } } };
        }),
      setAnalyticsConsent: (analyticsConsent) => set({ analyticsConsent }),
      setPremium: (premium) => set({ premium }),
      consumeFreeCredit: () => set((s) => ({ usage: consumeFree(s.usage, Date.now()) })),
      dismissUpsell: () => set({ upsellDismissed: true }),
      // 구매 상태와 무료 사용량은 「모든 데이터 삭제」로 지우지 않는다 (구매는 스토어 계정에 묶여 있고, 삭제로 무료 횟수가 초기화되면 안 됨)
      resetAll: () => set({ user: null, crushes: {}, messages: {}, hasApiKey: false, analysisCache: {} }),
    }),
    {
      name: 'mylovecoach.store.v1',
      storage: appStorage,
      version: 1,
      partialize: (s) => ({
        user: s.user,
        crushes: s.crushes,
        messages: s.messages,
        hasApiKey: s.hasApiKey,
        analysisCache: s.analysisCache,
        premium: s.premium,
        usage: s.usage,
        upsellDismissed: s.upsellDismissed,
        deviceId: s.deviceId,
        analyticsConsent: s.analyticsConsent,
      }),
      onRehydrateStorage: () => (state) => state?.setHydrated(),
    },
  ),
);

/** 최근 코칭 맥락을 모델에 넘길 형태로 압축 */
export function buildHistory(messages: ChatMessage[], limit = 6): HistoryTurn[] {
  const turns: HistoryTurn[] = [];
  for (const m of messages) {
    if (m.pending || m.error) continue;
    if (m.role === 'user') {
      turns.push({ userNote: m.text?.trim() || (m.imageUri ? '(대화 캡처 업로드)' : undefined) });
    } else if (m.analysis) {
      const last = turns[turns.length - 1];
      const chosen = m.selectedReplyIndex != null ? m.analysis.replies[m.selectedReplyIndex]?.text : undefined;
      if (last && last.coachSummary == null) {
        last.coachSummary = m.analysis.summary;
        last.chosenReply = chosen;
      } else {
        turns.push({ coachSummary: m.analysis.summary, chosenReply: chosen });
      }
    }
  }
  return turns.slice(-limit);
}

/** 채팅방 목록 정렬 (최근 활동순). 셀렉터 안에서 새 배열을 만들면 무한 렌더가 나므로 useMemo 로 감싸 사용 */
export const sortCrushes = (crushes: Record<string, Crush>): Crush[] =>
  Object.values(crushes).sort((a, b) => (b.lastMessageAt ?? b.updatedAt) - (a.lastMessageAt ?? a.updatedAt));

export const defaultTone = (s: AppState): Tone => s.user?.defaultTone ?? 'natural';

/** 빠른 문자열 해시 (djb2). 캐시 키 용도라 암호학적 강도는 필요 없음 */
export function quickHash(input: string): string {
  let h = 5381;
  for (let i = 0; i < input.length; i++) h = ((h << 5) + h + input.charCodeAt(i)) >>> 0;
  return h.toString(36) + input.length.toString(36);
}

export function analysisCacheKey(parts: { crushId: string; tone: string; text: string; imageBase64?: string; variation?: boolean }): string {
  return quickHash([parts.crushId, parts.tone, parts.text.trim(), parts.imageBase64 ?? '', parts.variation ? 'v' : ''].join('\u0001'));
}
