import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { AiProvider } from '@/lib/ai-consent';
import { freeRules, type ConsumablePlanKey } from '@/lib/billing/plans';
import type { Acquisition } from '@/lib/analytics';
import { consumeOne, EMPTY_USAGE, EMPTY_WALLET, grantConsumable, grantSignupBonus, type PremiumState, type TeamState, type UsageState, type WalletState } from '@/lib/billing/quota';
import type { CoachRequest } from '@/lib/coach-schema';
import { createId } from '@/lib/id';
import { authAvailable } from '@/lib/supabase';
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

/** 카카오·Apple 로 가입한 회원 정보 (로그인 세션은 Supabase 가 따로 저장) */
export interface MemberState {
  userId: string;
  /** kakao · apple */
  provider: string;
  nickname: string | null;
  joinedAt: number;
}

/** 서버 이용 기록 삭제 요청 — 어느 기기의 기록을, 언제(철회 시각) 기준으로 지울지 */
export interface PendingDeletion {
  deviceId: string;
  at: number;
  sent: number;
}

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
  /** 가입한 회원이면 그 정보. null 이면 비회원 */
  member: MemberState | null;
  /** 「내 기기 ID」를 눌러 팀원 등록을 하려는 기기 — 이때부터 팀원 여부를 서버에 묻는다 (teamCheckAt 부터 14일 동안) */
  teamCheck: boolean;
  /** 팀원 확인을 켠 시각 (0 이면 예전 판에서 켠 것 — 처음 확인할 때 지금으로 채운다) */
  teamCheckAt: number;
  /**
   * 서버에 남은 이 기기의 이용 기록 삭제 요청 (동의 철회·모든 데이터 삭제·만 14세 미만).
   * 서버가 지웠다고 답할 때까지 남아 있다가 앱을 켤 때·돌아올 때 다시 보낸다. sent 는 성공한 횟수(철회 직후 1번 + 2분 30초 뒤 1번)
   */
  pendingDeletion: PendingDeletion | null;
  /** 예전 판 정리(동의를 꺼 둔 기기·만 14세 미만 기기의 서버 기록 삭제 요청)를 한 번 했는지 — 저장값을 읽을 때(merge) 쓴다 */
  legacyDeletionChecked: boolean;
  /**
   * 예전 첫 화면(미리 체크된 체크박스)의 「동의」로 이용 기록을 보냈던 기기 — 그 동의는 「아직 묻지 않음」으로 읽지만
   * 서버에 기록이 남아 있을 수 있어, 마이 탭에서 지울 수 있게 표시한다. 서버 기록 삭제를 요청하면(requestServerDeletion·동의 철회) 내린다
   */
  legacyServerRecords: boolean;
  /** 「모든 데이터 삭제」 횟수 (저장하지 않음) — 삭제 전에 보낸 AI 요청의 늦은 결과를 다시 저장하지 않으려고 쓴다 */
  resetEpoch: number;
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
  /** 보고서 저장. profileKey 는 보고서를 만들 때 보낸 프로필의 지문 (reportProfileKey) */
  saveReport: (crushId: string, report: CrushReport, basedOn: number, profileKey?: string) => void;

  addMessage: (message: Omit<ChatMessage, 'id' | 'createdAt'> & { id?: string; createdAt?: number }) => ChatMessage;
  updateMessage: (crushId: string, id: string, patch: Partial<ChatMessage>) => void;
  removeMessage: (crushId: string, id: string) => void;
  clearMessages: (crushId: string) => void;
  /** 분석 결과 반영. applyHeat 면 누적 호감 온도를 움직인다 (다른 답장 더 보기·저장된 결과 재사용은 제외) */
  completeAnalysis: (crushId: string, messageId: string, analysis: CoachAnalysis, options?: { applyHeat?: boolean; fromCapture?: boolean }) => void;
  selectReply: (crushId: string, messageId: string, index: number) => void;

  setHasApiKey: (v: boolean) => void;
  /** since 를 주면 그 시각보다 먼저 만든 결과는 쓰지 않는다 (그 뒤 사용자가 새 요청을 했으면 다시 답해야 하므로) */
  getCachedAnalysis: (key: string, since?: number | null) => CoachAnalysis | null;
  putCachedAnalysis: (key: string, analysis: CoachAnalysis) => void;
  setAnalyticsConsent: (consent: boolean) => void;
  /** AI 분석 동의 기록 — 동의한 AI 회사, 동의 안 함·철회면 null */
  setAiConsent: (provider: AiProvider | null) => void;
  setAcquisition: (acquisition: Acquisition) => void;
  setPremium: (premium: PremiumState | null) => void;
  setTeam: (team: TeamState | null) => void;
  setMember: (member: MemberState | null) => void;
  /** 가입 보너스 지급 (같은 회원에게 한 번). 지급했으면 true */
  grantSignupBonus: (userId: string) => boolean;
  enableTeamCheck: () => void;
  disableTeamCheck: () => void;
  /** 서버에 남은 이 기기의 이용 기록을 지워 달라고 요청해 둔다 (실제 전송은 lib/server-deletion) */
  requestServerDeletion: () => void;
  markDeletionSent: () => void;
  clearPendingDeletion: () => void;
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
      member: null,
      teamCheck: false,
      teamCheckAt: 0,
      pendingDeletion: null,
      legacyDeletionChecked: false,
      legacyServerRecords: false,
      resetEpoch: 0,
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
          // 해시 키만 남는 재사용 사본은 방별로 역추적할 수 없으므로 함께 비운다. 다른 방 원본은 보존한다.
          return { crushes, messages, analysisCache: {} };
        }),
      saveReport: (crushId, report, basedOn, profileKey) =>
        set((s) => {
          const crush = s.crushes[crushId];
          if (!crush) return {};
          return { crushes: { ...s.crushes, [crushId]: { ...crush, report: { data: report, at: Date.now(), basedOn, profileKey } } } };
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
      getCachedAnalysis: (key, since) => {
        const hit = get().analysisCache[key];
        if (!hit) return null;
        if (Date.now() - hit.at > CACHE_TTL_MS) return null;
        if (since != null && hit.at < since) return null;
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
      // 동의를 껐으면(켜져 있다가 꺼짐) 어느 화면에서 껐든 서버 기록 삭제를 요청한다. 판 표시는 이용자가 직접 고른 답이라는 뜻
      setAnalyticsConsent: (analyticsConsent) =>
        set((s) =>
          s.analyticsConsent === true && analyticsConsent === false
            ? { analyticsConsent, analyticsConsentVersion: ANALYTICS_CONSENT_VERSION, pendingDeletion: { deviceId: s.deviceId, at: Date.now(), sent: 0 }, legacyServerRecords: false }
            : { analyticsConsent, analyticsConsentVersion: ANALYTICS_CONSENT_VERSION },
        ),
      setAiConsent: (provider) => set({ aiConsent: provider !== null, aiConsentProvider: provider, aiConsentAt: Date.now() }),
      setAcquisition: (acquisition) => set({ acquisition }),
      setPremium: (premium) => set({ premium }),
      setTeam: (team) => set({ team }),
      setMember: (member) => set({ member }),
      grantSignupBonus: (userId) => {
        const next = grantSignupBonus(get().wallet, userId);
        if (!next) return false;
        set({ wallet: next });
        return true;
      },
      enableTeamCheck: () => set({ teamCheck: true, teamCheckAt: Date.now() }),
      disableTeamCheck: () => set({ teamCheck: false, teamCheckAt: 0 }),
      // 기기의 서버 기록을 모두 지우므로 예전 기록 표시도 내린다
      requestServerDeletion: () => set((s) => ({ pendingDeletion: { deviceId: s.deviceId, at: Date.now(), sent: 0 }, legacyServerRecords: false })),
      markDeletionSent: () => set((s) => (s.pendingDeletion ? { pendingDeletion: { ...s.pendingDeletion, sent: s.pendingDeletion.sent + 1 } } : {})),
      clearPendingDeletion: () => set({ pendingDeletion: null }),
      grantConsumable: (plan, transactionId) => {
        const next = grantConsumable(get().wallet, plan, transactionId, Date.now());
        if (!next) return false;
        set({ wallet: next });
        return true;
      },
      consumeQuota: () =>
        set((s) => {
          const next = consumeOne(s.premium, s.usage, s.wallet, Date.now(), s.team, freeRules(authAvailable, s.member != null));
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
      // 구매 상태·이용권·무료 사용량·팀원·회원 여부는 「모든 데이터 삭제」로 지우지 않는다 (회원은 마이 → 로그아웃·탈퇴로)
      // (구매는 스토어 계정에 묶여 있고, 삭제로 무료 횟수가 초기화되면 안 됨). 서버에 남은 이 기기의 이용 기록도 지워 달라고 요청하고,
      // AI 분석·이용 기록 동의는 처음 상태로 돌려 다시 묻는다 (첫 화면 체크박스는 꺼진 채로 보이므로, 저장된 동의도 지워야 화면과 실제가 맞는다)
      resetAll: () =>
        set((s) => ({
          analyticsConsent: null,
          analyticsConsentVersion: null,
          legacyServerRecords: false,
          resetEpoch: s.resetEpoch + 1,
          user: null,
          crushes: {},
          messages: {},
          hasApiKey: false,
          analysisCache: {},
          kkti: null,
          practice: {},
          mindHistory: [],
          mindCache: {},
          aiConsent: null,
          aiConsentProvider: null,
          aiConsentAt: null,
          teamCheck: false,
          teamCheckAt: 0,
          pendingDeletion: { deviceId: s.deviceId, at: Date.now(), sent: 0 },
        })),
    }),
    {
      name: 'mylovecoach.store.v1',
      storage: appStorage,
      // 판은 올리지 않는다 (아래 merge 설명). 10-07 의 웹 배포 하나가 판 2 로 저장했으므로, 판이 달라도 저장값을 그대로 받아 merge 에 넘긴다
      version: 1,
      migrate: (persisted) => persisted as AppState,
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
          member: s.member,
          teamCheck: s.teamCheck,
          teamCheckAt: s.teamCheckAt,
          pendingDeletion: s.pendingDeletion,
          legacyDeletionChecked: s.legacyDeletionChecked,
          legacyServerRecords: s.legacyServerRecords,
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
      // - 예전 판 정리(한 번, legacyDeletionChecked): 서버 기록 삭제 요청(pendingDeletion)이 생기기 전에 동의를 직접 꺼 뒀거나
      //   만 14세 미만 나이로 저장된 기기는 서버 기록 삭제를 한 번 요청한다. 미리 체크된 예전 「동의」는 「아직 묻지 않음」으로 읽을 뿐
      //   그 기록은 지우지 않는다 (사용자 결정 10-07 「새 동의만 저장, 예전 기록은 둔다」)
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<AppState>;
        const provider = saved.aiConsentProvider === 'google' || saved.aiConsentProvider === 'anthropic' ? saved.aiConsentProvider : null;
        const savedAiAt = typeof saved.aiConsentAt === 'number' ? saved.aiConsentAt : null;
        // 저장소를 늦게 다 읽었고(2.5초 안전장치로 먼저 시작) 그사이 이번 실행에서 동의를 새로 골랐으면 그 답이 더 새롭다 —
        // 기기 시계와 상관없이 지금 고른 답을 남긴다 (저장소를 다시 읽는 곳은 없으므로 current 의 답은 이번 실행의 것)
        const answeredMeanwhile = current.aiConsentAt != null;
        const analyticsMeanwhile = current.analyticsConsentVersion != null;
        const underAge = saved.user?.age != null && saved.user.age < 14;
        const legacyDeletion =
          !saved.legacyDeletionChecked && !saved.pendingDeletion && saved.deviceId && (saved.analyticsConsent === false || (saved.analyticsConsent === true && underAge))
            ? { pendingDeletion: { deviceId: saved.deviceId, at: Date.now(), sent: 0 } }
            : {};
        // 저장돼 있던 동의를 그사이 「동의 안 함」으로 바꾼 셈이면 서버 기록도 지운다
        const withdrawnMeanwhile =
          analyticsMeanwhile && current.analyticsConsent !== true && saved.analyticsConsent === true && !saved.pendingDeletion && saved.deviceId
            ? { pendingDeletion: { deviceId: saved.deviceId, at: Date.now(), sent: 0 } }
            : {};
        // 판 표시 없는 「동의」(미리 체크된 예전 첫 화면) → 서버에 기록이 남아 있을 수 있다는 표시 (지우지는 않음, 마이 탭에서 지울 수 있게)
        const prechecked = saved.analyticsConsent === true && saved.analyticsConsentVersion == null && !underAge && !('pendingDeletion' in withdrawnMeanwhile);
        return {
          ...current,
          ...saved,
          ...(answeredMeanwhile
            ? { aiConsent: current.aiConsent, aiConsentProvider: current.aiConsentProvider, aiConsentAt: current.aiConsentAt }
            : { aiConsent: saved.aiConsent === false ? false : saved.aiConsent === true && provider ? true : null, aiConsentProvider: provider, aiConsentAt: savedAiAt }),
          ...(analyticsMeanwhile
            ? { analyticsConsent: current.analyticsConsent, analyticsConsentVersion: current.analyticsConsentVersion }
            : 'analyticsConsent' in saved
              ? { analyticsConsent: savedAnalyticsConsent(saved), analyticsConsentVersion: typeof saved.analyticsConsentVersion === 'number' ? saved.analyticsConsentVersion : null }
              : {}),
          ...(saved.messages ? { messages: settlePending(saved.messages) } : {}),
          ...legacyDeletion,
          ...withdrawnMeanwhile,
          ...(prechecked ? { legacyServerRecords: true } : {}),
          legacyDeletionChecked: true,
        };
      },
      onRehydrateStorage: () => (state) => state?.setHydrated(),
    },
  ),
);

/** 최근 코칭 맥락을 모델에 넘길 형태로 압축 */
/** 코칭 요청에 그대로 싣는 최근 턴 수 (서버 상한 8) */
export const HISTORY_TURNS = 8;
/** 그중 코치가 제안한 답장·읽어낸 포인트까지 싣는 최근 턴 수 (토큰을 아끼려고 최근 것만) */
const DETAILED_TURNS = 3;
/** 최근 턴보다 앞선 대화에서 사용자가 직접 쓴 말을 몇 개까지 싣는지 (서버 상한 12) */
const EARLIER_NOTES = 10;

interface ChatTurn {
  /** 요청에 실을 사용자 메모 (캡처 표시 포함) */
  note?: string;
  /** 사용자가 직접 쓴 글만 (「다른 답장 더 보기」 같은 자동 문구 제외) */
  typed?: string;
  analysis?: CoachAnalysis;
  selectedReplyIndex?: number;
}

/** 채팅방 메시지를 「사용자 → 코치」 턴으로 묶는다 (실패·대기 중 메시지는 뺀다) */
function chatTurns(messages: ChatMessage[]): ChatTurn[] {
  const turns: ChatTurn[] = [];
  for (const m of messages) {
    if (m.pending || m.error) continue;
    if (m.role === 'user') {
      const text = m.text?.trim() || undefined;
      const auto = Boolean(text?.startsWith('🔄'));
      // 캡처와 글을 같이 보냈으면 둘 다 남긴다 — 캡처는 다시 보내지 않으므로 「캡처를 올렸었다」는 사실이 맥락이다
      const note = m.imageUri ? (text ? `(대화 캡처 업로드) ${text}` : '(대화 캡처 업로드)') : text;
      turns.push({ note, typed: auto ? undefined : text });
    } else if (m.analysis) {
      const last = turns[turns.length - 1];
      if (last && !last.analysis) {
        last.analysis = m.analysis;
        last.selectedReplyIndex = m.selectedReplyIndex;
      } else {
        turns.push({ analysis: m.analysis, selectedReplyIndex: m.selectedReplyIndex });
      }
    }
  }
  return turns;
}

/** 글자(코드포인트) 단위로 자른다 — 이모지를 반으로 잘라 깨진 글자를 보내지 않게 */
const clip = (s: string, max: number) => {
  const chars = Array.from(s);
  return chars.length > max ? `${chars.slice(0, max).join('')}…` : s;
};

/**
 * 코칭 요청에 싣는 최근 대화 맥락 (오래된 순).
 * 최근 DETAILED_TURNS 턴은 코치가 제안한 답장과 읽어낸 포인트까지 싣는다 —
 * 사용자가 「2번 답장 더 짧게」처럼 앞 내용을 가리키거나 「다른 답장 더 보기」를 누를 때 AI 가 앞 답장을 알아야 한다
 */
export function buildHistory(messages: ChatMessage[], limit = HISTORY_TURNS): HistoryTurn[] {
  const turns = chatTurns(messages).slice(-limit);
  return turns.map((t, i) => {
    const turn: HistoryTurn = { userNote: t.note };
    if (!t.analysis) return turn;
    turn.coachSummary = t.analysis.summary;
    turn.chosenReply = t.selectedReplyIndex != null ? t.analysis.replies?.[t.selectedReplyIndex]?.text : undefined;
    if (i >= turns.length - DETAILED_TURNS) {
      const replies = (t.analysis.replies ?? []).map((r) => r.text?.trim()).filter((s): s is string => Boolean(s)).slice(0, 3);
      if (replies.length) turn.replies = replies.map((s) => clip(s, 200));
      const insights = (t.analysis.insights ?? []).map((s) => s?.trim()).filter((s): s is string => Boolean(s)).slice(0, 3);
      if (insights.length) turn.insights = insights.map((s) => clip(s, 160));
    }
    return turn;
  });
}

/**
 * 최근 맥락(buildHistory) 밖으로 밀려난 더 앞선 턴에서 사용자가 직접 쓴 말 (오래된 순).
 * 「이모지 빼 줘」「상대는 회사 선배야」처럼 앞에서 한 요청·정보를 대화가 길어져도 계속 지키게 한다
 */
export function buildEarlierNotes(messages: ChatMessage[], recent = HISTORY_TURNS, limit = EARLIER_NOTES): string[] {
  const turns = chatTurns(messages);
  return typedOf(turns.slice(0, Math.max(0, turns.length - recent)))
    .slice(-limit)
    .map((s) => clip(s, 160));
}

const typedOf = (turns: ChatTurn[]) => turns.map((t) => t.typed?.replace(/\s+/g, ' ')).filter((s): s is string => Boolean(s));

/** 이 캡처(지문)를 이 채팅방에서 이미 분석했는지 — 그 요청 바로 뒤 코치 답이 결과를 냈으면 이미 누적 온도에 반영된 캡처 */
export function analyzedCaptureBefore(messages: ChatMessage[], imageHash: string): boolean {
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    if (m.role !== 'user' || m.imageHash !== imageHash) continue;
    const reply = messages.slice(i + 1).find((x) => x.role === 'coach');
    if (reply?.analysis) return true;
  }
  return false;
}

/** 「다른 답장 더 보기」가 보낸 자동 요청 메시지인지 */
export const isVariationRequest = (m: ChatMessage) => m.role === 'user' && (Boolean(m.variationOf) || Boolean(m.text?.trim().startsWith('🔄')));

/**
 * 코치 카드를 만든 요청 — 같은 턴의 사용자 메시지(「다른 답장」 자동 요청은 건너뛰고 그 앞의 실제 요청).
 * 「다른 버전 더 보기」가 이 요청의 캡처·글로 다시 묻는다
 */
export function turnRequestOf(messages: ChatMessage[], coachMessageId: string): ChatMessage | undefined {
  const idx = messages.findIndex((m) => m.id === coachMessageId);
  for (let i = idx - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== 'user' || isVariationRequest(m)) continue;
    if (m.imageUri || m.text?.trim()) return m;
  }
  return undefined;
}

/** 실패한 「다른 답장」 요청이 바꾸려던 코치 카드 (예전 메시지처럼 id 가 없으면 그 앞의 마지막 결과 카드) */
export function variationTargetOf(messages: ChatMessage[], request: ChatMessage): ChatMessage | undefined {
  if (request.variationOf) return messages.find((m) => m.id === request.variationOf && m.analysis);
  const idx = messages.findIndex((m) => m.id === request.id);
  for (let i = idx - 1; i >= 0; i--) if (messages[i].role === 'coach' && messages[i].analysis) return messages[i];
  return undefined;
}

/**
 * 이 채팅방에서 사용자가 마지막으로 직접 요청한 시각 — 글이든 캡처든 (「다른 답장 더 보기」 자동 요청은 빼고, 없으면 null).
 * 저장된 코칭 결과는 이보다 나중에 만든 것만 다시 쓴다 — 그 사이 「이모지 빼 줘」 같은 새 요청이나 새 캡처가 있었다면 그걸 기억해서 다시 답해야 하므로
 */
export function lastRequestAt(messages: ChatMessage[]): number | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== 'user' || m.pending || m.error || isVariationRequest(m)) continue;
    if (m.text?.trim() || m.imageUri) return m.createdAt;
  }
  return null;
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

/**
 * 보고서 요청에 넣는 상대·내 프로필의 지문 (관계 단계·목표·MBTI·메모·호칭·말투·내 프로필·KKTI 등 보내는 그대로).
 * 누적 온도는 뺀다 — 온도는 새 코칭 기록과 함께만 바뀌어서 hasNewSessionsSince 가 따로 본다
 */
export function reportProfileKey(profile: { crush: CoachRequest['crush']; user: CoachRequest['user'] }): string {
  return quickHash(JSON.stringify({ crush: { ...profile.crush, heat: undefined }, user: profile.user }));
}

/**
 * 보고서를 (다시) 만들 수 있는 까닭 — 같은 기록·같은 프로필로 다시 부르면 비슷한 보고서에 1회만 쓰이므로 바뀐 게 없으면 null 로 막는다.
 * first: 아직 보고서가 없음 · sessions: 새 코칭 기록이 생김 · profile: 상대·내 프로필이 바뀜 ·
 * unknown: 지문이 없는 예전 보고서 (프로필이 바뀌었는지 알 수 없어 열어 둔다)
 */
export type ReportRefresh = 'first' | 'sessions' | 'profile' | 'unknown' | null;

export function reportRefresh(report: Crush['report'], messages: ChatMessage[], profileKey: string): ReportRefresh {
  if (!report) return 'first';
  if (hasNewSessionsSince(report, messages)) return 'sessions';
  if (!report.profileKey) return 'unknown';
  return report.profileKey === profileKey ? null : 'profile';
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

export function analysisCacheKey(parts: { crushId: string; tone: string; text: string; imageBase64?: string; variation?: boolean; emoji?: string; toneChosen?: boolean; emojiChosen?: boolean }): string {
  return quickHash([parts.crushId, parts.tone, parts.text.trim(), parts.imageBase64 ?? '', parts.variation ? 'v' : '', parts.emoji ?? '', ...(parts.toneChosen ? ['tone-chosen'] : []), ...(parts.emojiChosen ? ['emoji-chosen'] : [])].join('\u0001'));
}

/** 속마음 풀이 재사용 키 — AI 에 보내는 것(상황 글·대상 성별·묻는 사람의 성별·나이·MBTI)이 같으면 같은 키 */
export function mindCacheKey(parts: { situation: string; perspective: string; user?: { gender: string; age?: number; mbti?: string } }): string {
  return quickHash(['mind', parts.situation.trim(), parts.perspective, parts.user?.gender ?? '', parts.user?.age ?? '', parts.user?.mbti ?? ''].join('\u0001'));
}
