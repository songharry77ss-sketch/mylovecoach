import { create } from 'zustand';
import { persist } from 'zustand/middleware';

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
  resetAll: () => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      hydrated: false,
      user: null,
      crushes: {},
      messages: {},
      hasApiKey: false,

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
      resetAll: () => set({ user: null, crushes: {}, messages: {}, hasApiKey: false }),
    }),
    {
      name: 'mylovecoach.store.v1',
      storage: appStorage,
      version: 1,
      partialize: (s) => ({ user: s.user, crushes: s.crushes, messages: s.messages, hasApiKey: s.hasApiKey }),
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
