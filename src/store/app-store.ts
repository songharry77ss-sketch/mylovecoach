import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { AiProvider } from '@/lib/ai-consent';
import type { ConsumablePlanKey } from '@/lib/billing/plans';
import type { Acquisition } from '@/lib/analytics';
import { consumeOne, EMPTY_USAGE, EMPTY_WALLET, grantConsumable, type PremiumState, type TeamState, type UsageState, type WalletState } from '@/lib/billing/quota';
import { createId } from '@/lib/id';
import type {
  ChatMessage,
  CoachAnalysis,
  Crush,
  CrushReport,
  HistoryTurn,
  KktiSaved,
  MindAnswer,
  MindReading,
  PracticePersona,
  PracticeSession,
  PracticeTurn,
  Temperature,
  Tone,
  UserProfile,
} from '@/lib/types';
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
  /** 하루 이용권·횟수권 */
  wallet: WalletState;
  /** 관리자가 무제한을 허용한 팀원 기기면 그 정보 (서버 확인 결과의 캐시) */
  team: TeamState | null;
  /** 채팅 하단의 프리미엄 안내 카드를 닫았는지 */
  upsellDismissed: boolean;
  /** 기기 구분용 무작위 ID (광고 ID 아님, 이용 기록 수집에만 사용) */
  deviceId: string;
  /** 서비스 개선을 위한 이용 기록 수집 동의 (선택) — null 이면 아직 묻지 않음 */
  analyticsConsent: boolean | null;
  /** 이용 기록 동의를 받은 방식의 판 (ANALYTICS_CONSENT_VERSION). 이 표시 없이 저장된 예전 「동의」는 다시 묻는다 */
  analyticsConsentVersion: number | null;
  /** AI 분석 동의 (대화 캡처·글·프로필을 외부 AI 로 보내기) — null 이면 아직 묻지 않음, false 면 동의 안 함·철회 */
  aiConsent: boolean | null;
  /** 동의할 때 안내한 AI 회사. 개인 키로 다른 회사에 보내게 되면 다시 묻는다 */
  aiConsentProvider: AiProvider | null;
  /** AI 분석 동의에 마지막으로 답한(동의·동의 안 함·철회) 시각 */
  aiConsentAt: number | null;
  /** 처음 앱을 연 곳 (동의한 경우에만 이용 기록과 함께 전송) */
  acquisition: Acquisition | null;
  /** 진동 효과 */
  hapticsOn: boolean;
  /** 채팅방 목록에서 대화 미리보기 숨기기 */
  hidePreviews: boolean;
  /** KKTI 검사 결과 */
  kkti: KktiSaved | null;
  /** 연애 연습 기록 (최근 12개) */
  practice: Record<string, PracticeSession>;
  /** 최근에 본 속마음 풀이 (최근 10개, 최신이 앞) */
  mindHistory: MindAnswer[];
  /** 속마음 풀이 결과 재사용 — 같은 상황·대상 성별·내 프로필이면 AI 를 다시 부르지 않는다. 키(mindCacheKey) → { reading, at } */
  mindCache: Record<string, { reading: MindReading; at: number }>;

  setHydrated: () => void;
  setUser: (user: UserProfile) => void;
  updateUser: (patch: Partial<UserProfile>) => void;

  addCrush: (input: Omit<Crush, 'id' | 'createdAt' | 'updatedAt'>) => Crush;
  /** 가입·설문 없이 바로 시작 — 기본 프로필과 첫 채팅방을 만들고 채팅방 id 를 돌려준다 */
  quickStart: () => string;
  /** 비밀 상담 채팅방 — 저장되지 않고, 나가면 지운다 */
  createSecretChat: () => string;
  updateCrush: (id: string, patch: Partial<Omit<Crush, 'id' | 'createdAt'>>) => void;
  removeCrush: (id: string) => void;
  saveReport: (crushId: string, report: CrushReport, basedOn: number) => void;

  addMessage: (message: Omit<ChatMessage, 'id' | 'createdAt'> & { id?: string; createdAt?: number }) => ChatMessage;
  updateMessage: (crushId: string, id: string, patch: Partial<ChatMessage>) => void;
  removeMessage: (crushId: string, id: string) => void;
  clearMessages: (crushId: string) => void;
  /** 분석 결과 반영. applyHeat 면 누적 호감 온도를 움직인다 (다른 답장 더 보기·저장된 결과 재사용은 제외) */
  completeAnalysis: (crushId: string, messageId: string, analysis: CoachAnalysis, options?: { applyHeat?: boolean; fromCapture?: boolean }) => void;
  selectReply: (crushId: string, messageId: string, index: number) => void;

  setHasApiKey: (v: boolean) => void;
  getCachedAnalysis: (key: string) => CoachAnalysis | null;
  putCachedAnalysis: (key: string, analysis: CoachAnalysis) => void;
  setAnalyticsConsent: (consent: boolean) => void;
  /** AI 분석 동의 기록 — 동의한 AI 회사, 동의 안 함·철회면 null */
  setAiConsent: (provider: AiProvider | null) => void;
  setAcquisition: (acquisition: Acquisition) => void;
  setPremium: (premium: PremiumState | null) => void;
  setTeam: (team: TeamState | null) => void;
  /** 하루 이용권·횟수권 결제 1건 충전. 이미 충전한 거래면 무시하고 false */
  grantConsumable: (plan: ConsumablePlanKey, transactionId: string) => boolean;
  /** AI 를 한 번 쓴 만큼 차감 (무료 → 횟수권 순, 프리미엄·하루 이용권은 차감 없음) */
  consumeQuota: () => void;
  /** 예전 이름 — consumeQuota 와 같다 */
  consumeFreeCredit: () => void;
  dismissUpsell: () => void;
  setHapticsOn: (on: boolean) => void;
  setHidePreviews: (on: boolean) => void;
  setKkti: (kkti: KktiSaved | null) => void;

  startPractice: (persona: PracticePersona) => string;
  addPracticeTurn: (sessionId: string, turn: Omit<PracticeTurn, 'id' | 'at'> & { id?: string }) => PracticeTurn | null;
  updatePracticeTurn: (sessionId: string, turnId: string, patch: Partial<PracticeTurn>) => void;
  applyPracticeResult: (sessionId: string, delta: number, mood: string, ended: boolean) => void;
  endPractice: (sessionId: string) => void;
  removePractice: (sessionId: string) => void;
  /** 속마음 기록에 넣는다. 같은 키(같은 상황·대상·내 프로필)의 예전 기록은 빼서 한 번만 보이게 */
  addMindAnswer: (answer: MindAnswer) => void;
  getCachedMind: (key: string) => MindReading | null;
  putCachedMind: (key: string, reading: MindReading) => void;
  resetAll: () => void;
}

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_MAX = 40;
/** 속마음 풀이는 대화처럼 지나가는 내용이 아니라서 오래 둔다 (새로 풀고 싶으면 「다시 풀이」) */
const MIND_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MIND_CACHE_MAX = 60;
const PRACTICE_MAX = 12;
export const HEAT_MIN = -20;
export const HEAT_MAX = 100;

export const clampHeat = (v: number) => Math.max(HEAT_MIN, Math.min(HEAT_MAX, Math.round(v)));

/** 예전 서버(온도 변화 폭을 주지 않음) 응답이면 분위기로 대신 정한다 */
const FALLBACK_DELTA: Record<Temperature, number> = { hot: 10, warm: 5, neutral: 0, cold: -6, unknown: 0 };

/**
 * 이용 기록 동의를 받는 방식의 판. 2 = 첫 화면 체크박스를 직접 눌러야 켜지는 방식.
 * 예전 첫 화면은 체크박스가 미리 체크돼 있어서, 그때 저장된 동의(판 표시 없음)는 유효한 선택 동의로 보지 않는다
 */
const ANALYTICS_CONSENT_VERSION = 2;

/** 「분석 중」인 채로 저장돼 있던 코치 말풍선을 앱을 다시 켤 때 바꿔 읽는 안내 (「다시 시도」 버튼이 뜬다) */
const STALLED_ERROR = '분석이 중간에 멈췄어요. 다시 시도해주세요.';

/** 저장된 이용 기록 동의 — 판 표시 없이 저장된 「동의」는 미리 체크된 체크박스로 받은 것이라 「아직 묻지 않음」으로 읽는다 */
function savedAnalyticsConsent(saved: Partial<AppState>): boolean | null {
  if (saved.analyticsConsent === false) return false;
  return saved.analyticsConsent === true && saved.analyticsConsentVersion === ANALYTICS_CONSENT_VERSION ? true : null;
}

/** 「분석 중」인 채로 저장된 코치 말풍선을 「다시 시도」할 수 있는 실패로 바꾼다 */
function settlePending(messages: Record<string, ChatMessage[]>): Record<string, ChatMessage[]> {
  return Object.fromEntries(
    Object.entries(messages).map(([crushId, list]) => [
      crushId,
      Array.isArray(list) ? list.map((m) => (m.pending ? { ...m, pending: false, error: STALLED_ERROR, text: 'network' } : m)) : list,
    ]),
  );
}

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
      wallet: EMPTY_WALLET,
      team: null,
      upsellDismissed: false,
      deviceId: createId('d_'),
      analyticsConsent: null,
      analyticsConsentVersion: null,
      aiConsent: null,
      aiConsentProvider: null,
      aiConsentAt: null,
      acquisition: null,
      hapticsOn: true,
      hidePreviews: false,
      kkti: null,
      practice: {},
      mindHistory: [],
      mindCache: {},

      setHydrated: () => set({ hydrated: true }),
      setUser: (user) => set({ user }),
      updateUser: (patch) => set((s) => (s.user ? { user: { ...s.user, ...patch } } : {})),

      addCrush: (input) => {
        const now = Date.now();
        const crush: Crush = { heat: 0, ...input, id: createId('c_'), createdAt: now, updatedAt: now };
        set((s) => ({ crushes: { ...s.crushes, [crush.id]: crush }, messages: { ...s.messages, [crush.id]: [] } }));
        return crush;
      },
      quickStart: () => {
        const s = get();
        const existing = Object.values(s.crushes)
          .filter((c) => !c.secret)
          .sort((a, b) => a.createdAt - b.createdAt)[0];
        if (!s.user) set({ user: { name: '', gender: 'other', style: [], defaultTone: 'natural', emoji: 'on', createdAt: Date.now() } });
        if (existing) return existing.id;
        return s.addCrush({ name: '상대', gender: 'female', relationship: 'talking', style: [], notes: '' }).id;
      },
      createSecretChat: () => {
        const s = get();
        if (!s.user) set({ user: { name: '', gender: 'other', style: [], defaultTone: 'natural', emoji: 'on', createdAt: Date.now() } });
        return s.addCrush({ name: '비밀 상담', gender: 'other', relationship: 'talking', style: [], notes: '', secret: true }).id;
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
      saveReport: (crushId, report, basedOn) =>
        set((s) => {
          const crush = s.crushes[crushId];
          if (!crush) return {};
          return { crushes: { ...s.crushes, [crushId]: { ...crush, report: { data: report, at: Date.now(), basedOn } } } };
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
      completeAnalysis: (crushId, messageId, analysis, options = {}) => {
        const crush = get().crushes[crushId];
        if (!crush) return;
        const before = crush.heat ?? 0;
        const delta = options.applyHeat ? (analysis.heatDelta ?? FALLBACK_DELTA[analysis.temperature]) : 0;
        const after = clampHeat(before + delta);
        const now = Date.now();
        get().updateMessage(crushId, messageId, {
          analysis,
          pending: false,
          error: undefined,
          heat: options.applyHeat ? { before, after, delta: after - before } : undefined,
        });
        // 캡처에서 읽은 호칭·말투를 기억해 두면, 캡처 없이 물어볼 때도 같은 호칭·말투로 답장이 나온다.
        // 말투는 캡처가 있을 때만 믿는다 (글만 보낸 요청의 말투는 기본값 추측이라서). 호칭은 글에서도 읽힌다 (예: 「오빠가 바쁘대」)
        const callName = analysis.callName?.trim();
        const speech = options.fromCapture !== false && (analysis.speechLevel === 'polite' || analysis.speechLevel === 'casual') ? analysis.speechLevel : undefined;
        const detected = callName || speech ? { ...crush.detected, ...(callName ? { callName } : {}), ...(speech ? { speech } : {}), at: now } : crush.detected;
        set((s) => {
          const current = s.crushes[crushId];
          if (!current) return {};
          return {
            crushes: {
              ...s.crushes,
              [crushId]: {
                ...current,
                detected,
                heat: after,
                heatLog: options.applyHeat ? [...(current.heatLog ?? []), { at: now, value: after, delta: after - before }].slice(-60) : current.heatLog,
                lastTemperature: analysis.temperature,
                lastInterestScore: analysis.interestScore ?? current.lastInterestScore,
                lastMessageAt: now,
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
      setAnalyticsConsent: (analyticsConsent) => set({ analyticsConsent, analyticsConsentVersion: ANALYTICS_CONSENT_VERSION }),
      setAiConsent: (provider) => set({ aiConsent: provider !== null, aiConsentProvider: provider, aiConsentAt: Date.now() }),
      setAcquisition: (acquisition) => set({ acquisition }),
      setPremium: (premium) => set({ premium }),
      setTeam: (team) => set({ team }),
      grantConsumable: (plan, transactionId) => {
        const next = grantConsumable(get().wallet, plan, transactionId, Date.now());
        if (!next) return false;
        set({ wallet: next });
        return true;
      },
      consumeQuota: () =>
        set((s) => {
          const next = consumeOne(s.premium, s.usage, s.wallet, Date.now(), s.team);
          return { usage: next.usage, wallet: next.wallet };
        }),
      consumeFreeCredit: () => get().consumeQuota(),
      dismissUpsell: () => set({ upsellDismissed: true }),
      setHapticsOn: (hapticsOn) => set({ hapticsOn }),
      setHidePreviews: (hidePreviews) => set({ hidePreviews }),
      setKkti: (kkti) => set({ kkti }),

      startPractice: (persona) => {
        const now = Date.now();
        const id = createId('pr_');
        const opener: PracticeTurn = { id: createId('t_'), role: 'them', text: persona.opener, at: now };
        const session: PracticeSession = { id, persona, turns: [opener], heat: 0, mood: persona.emoji, startedAt: now, updatedAt: now };
        set((s) => {
          const kept = Object.values(s.practice)
            .sort((a, b) => b.updatedAt - a.updatedAt)
            .slice(0, PRACTICE_MAX - 1);
          return { practice: { ...Object.fromEntries(kept.map((p) => [p.id, p])), [id]: session } };
        });
        return id;
      },
      addPracticeTurn: (sessionId, input) => {
        const session = get().practice[sessionId];
        if (!session) return null;
        const turn: PracticeTurn = { ...input, id: input.id ?? createId('t_'), at: Date.now() };
        set((s) => ({ practice: { ...s.practice, [sessionId]: { ...session, turns: [...session.turns, turn], updatedAt: turn.at } } }));
        return turn;
      },
      updatePracticeTurn: (sessionId, turnId, patch) =>
        set((s) => {
          const session = s.practice[sessionId];
          if (!session) return {};
          return { practice: { ...s.practice, [sessionId]: { ...session, turns: session.turns.map((t) => (t.id === turnId ? { ...t, ...patch } : t)) } } };
        }),
      applyPracticeResult: (sessionId, delta, mood, ended) =>
        set((s) => {
          const session = s.practice[sessionId];
          if (!session) return {};
          return {
            practice: {
              ...s.practice,
              [sessionId]: { ...session, heat: clampHeat(session.heat + delta), mood: mood || session.mood, ended: session.ended || ended, charged: true, updatedAt: Date.now() },
            },
          };
        }),
      endPractice: (sessionId) =>
        set((s) => {
          const session = s.practice[sessionId];
          if (!session) return {};
          return { practice: { ...s.practice, [sessionId]: { ...session, ended: true, updatedAt: Date.now() } } };
        }),
      removePractice: (sessionId) =>
        set((s) => {
          const practice = { ...s.practice };
          delete practice[sessionId];
          return { practice };
        }),
      addMindAnswer: (answer) =>
        set((s) => ({ mindHistory: [answer, ...s.mindHistory.filter((h) => !answer.key || h.key !== answer.key)].slice(0, 10) })),
      getCachedMind: (key) => {
        const hit = get().mindCache[key];
        if (!hit || Date.now() - hit.at > MIND_CACHE_TTL_MS) return null;
        return hit.reading;
      },
      putCachedMind: (key, reading) =>
        set((s) => {
          const entries = Object.entries(s.mindCache)
            .filter(([k, v]) => k !== key && Date.now() - v.at <= MIND_CACHE_TTL_MS)
            .sort((a, b) => b[1].at - a[1].at)
            .slice(0, MIND_CACHE_MAX - 1);
          return { mindCache: { ...Object.fromEntries(entries), [key]: { reading, at: Date.now() } } };
        }),
      // 구매 상태·이용권·무료 사용량·팀원 여부는 「모든 데이터 삭제」로 지우지 않는다 (구매는 스토어 계정에 묶여 있고, 삭제로 무료 횟수가 초기화되면 안 됨)
      // AI 분석 동의는 처음 상태로 돌려, 다시 AI 를 쓸 때 묻는다
      resetAll: () =>
        set({ user: null, crushes: {}, messages: {}, hasApiKey: false, analysisCache: {}, kkti: null, practice: {}, mindHistory: [], mindCache: {}, aiConsent: null, aiConsentProvider: null, aiConsentAt: null }),
    }),
    {
      name: 'mylovecoach.store.v1',
      storage: appStorage,
      version: 1,
      // 비밀 상담 채팅방과 그 메시지는 기기에 저장하지 않는다
      partialize: (s) => {
        const secretIds = Object.values(s.crushes)
          .filter((c) => c.secret)
          .map((c) => c.id);
        const crushes = secretIds.length ? Object.fromEntries(Object.entries(s.crushes).filter(([id]) => !secretIds.includes(id))) : s.crushes;
        const messages = secretIds.length ? Object.fromEntries(Object.entries(s.messages).filter(([id]) => !secretIds.includes(id))) : s.messages;
        return {
          user: s.user,
          crushes,
          messages,
          hasApiKey: s.hasApiKey,
          analysisCache: s.analysisCache,
          premium: s.premium,
          usage: s.usage,
          wallet: s.wallet,
          team: s.team,
          upsellDismissed: s.upsellDismissed,
          deviceId: s.deviceId,
          analyticsConsent: s.analyticsConsent,
          analyticsConsentVersion: s.analyticsConsentVersion,
          aiConsent: s.aiConsent,
          aiConsentProvider: s.aiConsentProvider,
          aiConsentAt: s.aiConsentAt,
          acquisition: s.acquisition,
          hapticsOn: s.hapticsOn,
          hidePreviews: s.hidePreviews,
          kkti: s.kkti,
          practice: s.practice,
          mindHistory: s.mindHistory,
          mindCache: s.mindCache,
        };
      },
      // 저장값은 읽을 때 바로잡는다. version 을 올리면 이전 버전 앱(되돌린 웹 배포 등)이 저장값을 통째로 버리므로 올리지 않는다
      // - 예전 버전에서 올라온 기기에는 AI 분석 동의 기록이 없다 → 「아직 묻지 않음」(null)으로 읽어 처음 AI 를 쓸 때 묻는다
      // - 저장소를 늦게 다 읽었으면(루트 레이아웃의 2.5초 안전장치로 먼저 시작) 그사이 시트에서 고른 답이 더 새롭다 → 그 답을 남긴다
      // - 미리 체크된 첫 화면에서 받은 이용 기록 동의(판 표시 없음)는 「아직 묻지 않음」으로 읽는다. 동의 안 함은 그대로
      // - 「분석 중」인 채로 저장된 코치 말풍선은 답을 받기 전에 앱이 닫힌 것 → 「다시 시도」할 수 있는 실패로 읽는다 (막 켠 앱에는 진행 중인 요청이 없다)
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<AppState>;
        const provider = saved.aiConsentProvider === 'google' || saved.aiConsentProvider === 'anthropic' ? saved.aiConsentProvider : null;
        const savedAiAt = typeof saved.aiConsentAt === 'number' ? saved.aiConsentAt : null;
        const answeredMeanwhile = current.aiConsentAt != null && (savedAiAt == null || current.aiConsentAt > savedAiAt);
        return {
          ...current,
          ...saved,
          ...(answeredMeanwhile
            ? { aiConsent: current.aiConsent, aiConsentProvider: current.aiConsentProvider, aiConsentAt: current.aiConsentAt }
            : { aiConsent: saved.aiConsent === false ? false : saved.aiConsent === true && provider ? true : null, aiConsentProvider: provider, aiConsentAt: savedAiAt }),
          ...('analyticsConsent' in saved
            ? { analyticsConsent: savedAnalyticsConsent(saved), analyticsConsentVersion: typeof saved.analyticsConsentVersion === 'number' ? saved.analyticsConsentVersion : null }
            : {}),
          ...(saved.messages ? { messages: settlePending(saved.messages) } : {}),
        };
      },
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

/** 상대 분석 보고서용 코칭 기록 (최근 15개, 오래된 순) */
export function buildReportSessions(messages: ChatMessage[], limit = 15) {
  const sessions: { at: number; note?: string; summary: string; insights: string[]; temperature: Temperature; chosenReply?: string }[] = [];
  let lastNote: string | undefined;
  for (const m of messages) {
    if (m.role === 'user') {
      lastNote = m.text?.startsWith('🔄') ? lastNote : m.text?.trim() || (m.imageUri ? '(대화 캡처)' : undefined);
      continue;
    }
    if (!m.analysis) continue;
    sessions.push({
      at: m.createdAt,
      note: lastNote?.slice(0, 400),
      summary: m.analysis.summary.slice(0, 600),
      insights: m.analysis.insights.slice(0, 5).map((s) => s.slice(0, 200)),
      temperature: m.analysis.temperature,
      chosenReply: m.selectedReplyIndex != null ? m.analysis.replies[m.selectedReplyIndex]?.text?.slice(0, 300) : undefined,
    });
  }
  return sessions.slice(-limit);
}

/**
 * 마지막 보고서 뒤로 새 코칭 기록이 생겼는지 — 없으면 「다시 분석하기」를 막는다 (같은 기록으로 다시 부르면 비슷한 보고서에 1회만 쓰인다).
 * 분석 개수가 늘었거나, 채팅을 지운 뒤 다시 쌓은 경우처럼 보고서보다 늦게 생긴 분석이 있으면 새 기록으로 본다. 보고서가 없으면 언제나 true
 */
export function hasNewSessionsSince(report: { at: number; basedOn: number } | undefined, messages: ChatMessage[]): boolean {
  if (!report) return true;
  const analyzed = messages.filter((m) => m.analysis);
  return analyzed.length > report.basedOn || analyzed.some((m) => m.createdAt > report.at);
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

export function analysisCacheKey(parts: { crushId: string; tone: string; text: string; imageBase64?: string; variation?: boolean; emoji?: string }): string {
  return quickHash([parts.crushId, parts.tone, parts.text.trim(), parts.imageBase64 ?? '', parts.variation ? 'v' : '', parts.emoji ?? ''].join('\u0001'));
}

/** 속마음 풀이 재사용 키 — AI 에 보내는 것(상황 글·대상 성별·묻는 사람의 성별·나이·MBTI)이 같으면 같은 키 */
export function mindCacheKey(parts: { situation: string; perspective: string; user?: { gender: string; age?: number; mbti?: string } }): string {
  return quickHash(['mind', parts.situation.trim(), parts.perspective, parts.user?.gender ?? '', parts.user?.age ?? '', parts.user?.mbti ?? ''].join('\u0001'));
}
