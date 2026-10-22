/**
 * 서비스 이용 기록 — 만 14세 이상 이용자에게 기본으로 수집한다 (개인정보 처리방침 4번 「서비스 이용 기록」).
 *
 * - 화면 이동·체류 시간, 세션, 버튼·흐름 이벤트(app_open·paywall_*·purchase_*·signup* 등), 처음 들어온 경로, 기기 ID,
 *   대략적인 프로필(성별·나이·MBTI·선호 톤)을 보낸다. 서비스 제공·개선, 결제 흐름 분석, 부정 이용 방지를 위해
 *   처리방침에 알리고 수집하는 정보라 따로 동의를 받지 않고, 마이에 켜고 끄는 스위치도 없다.
 *   처리 정지·삭제는 메일로 요청받는다 (처리방침 10번 — 서버는 ANALYTICS_OPTOUT_DEVICES 에 적은 기기의 기록을 받지 않는다).
 * - 이름(별명)은 보내지 않는다 (분석에 필요 없음). 대화 캡처 이미지도 절대 보내지 않는다.
 * - 코칭 내용(질문·답변)은 여기서 보내지 않는다. 「코칭 내용 저장」(선택)에 동의한 경우에만 coach-client 가 헤더를 붙이고
 *   서버(api/coach)가 기록한다 — contentLoggingEnabled.
 * - 만 14세 미만으로 입력한 이용자, 데모 모드, 서버 주소가 없는 빌드는 보내지 않는다 (법정대리인 동의를 받지 않음).
 * - 저장소를 다 읽기 전(ready 아님)에는 기기 ID 가 임시 값이라 보내지 않는다 — 임시 ID 로 쌓인 기록은 삭제 요청으로 지울 수 없다.
 * - 서버 기록 전체 삭제 요청(모든 데이터 삭제·만 14세 미만·예전 기록 지우기)이 끝날 때까지는 보내지 않는다.
 * - 실패해도 앱 동작에 영향을 주지 않도록 모든 오류를 삼킨다.
 * - 세션: 백그라운드에서 30분 안에 돌아오면 같은 세션을 이어 쓰고, 앞에 나와 있던 시간만 센다.
 */
import { Platform } from 'react-native';

import { FREE_UNLIMITED } from '@/lib/billing/plans';
import { APP_CONFIG } from '@/lib/config';
import { isDemoMode } from '@/lib/demo';
import { createId } from '@/lib/id';
import type { UserProfile } from '@/lib/types';

/** 처음 앱을 연 곳 — 웹은 광고 링크의 utm_*·이전 사이트, 앱은 설치 경로 */
export interface Acquisition {
  /** ios · android · apk(직접 설치) · web */
  channel: string;
  source?: string;
  medium?: string;
  campaign?: string;
  /** 이전 사이트 주소의 도메인 */
  referrer?: string;
  /** 처음 연 경로 */
  landing?: string;
  at: number;
}

// 화면 이동으로 주소가 바뀌기 전에 (모듈을 처음 읽을 때) 웹 주소·이전 사이트를 읽어 둔다
const launchUrl = Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.href : '';
const launchReferrer = Platform.OS === 'web' && typeof document !== 'undefined' ? document.referrer : '';

/** 이번 실행의 유입 정보 (처음 실행 때 한 번 저장해 두고 계속 쓴다) */
export function launchAcquisition(now = Date.now()): Acquisition {
  const channel = Platform.OS === 'web' ? 'web' : Platform.OS === 'android' && FREE_UNLIMITED ? 'apk' : Platform.OS;
  const acquisition: Acquisition = { channel, at: now };
  try {
    if (launchUrl) {
      const url = new URL(launchUrl);
      const pick = (key: string) => url.searchParams.get(key)?.trim().slice(0, 80) || undefined;
      Object.assign(acquisition, { source: pick('utm_source'), medium: pick('utm_medium'), campaign: pick('utm_campaign'), landing: url.pathname.slice(0, 120) });
    }
    if (launchReferrer) {
      const host = new URL(launchReferrer).host;
      if (host && host !== (launchUrl ? new URL(launchUrl).host : '')) acquisition.referrer = host.slice(0, 120);
    }
  } catch {
    // 주소를 못 읽으면 설치 경로만 남긴다
  }
  return acquisition;
}

export interface TrackedEvent {
  type: 'screen' | 'event';
  name: string;
  durationMs?: number;
  props?: Record<string, unknown>;
  at: number;
}

interface Identity {
  deviceId: string;
  /** 저장소를 다 읽었는지 — 그 전에는 기기 ID 가 임시 값이라 보내지 않는다 */
  ready: boolean;
  user?: UserProfile | null;
  premiumPlan?: string | null;
  crushCount?: number;
  acquisition?: Acquisition | null;
  /** 「코칭 내용 저장」(선택)에 동의했는지 — 코칭 요청에 기록용 헤더를 붙일지만 정한다 (이용 기록 전송과는 상관없음) */
  contentConsent?: boolean;
  /** 서버 기록 전체 삭제 요청이 아직 끝나지 않았으면 true — 그동안은 새 기록을 보내지 않는다 (삭제가 새 기록까지 지우지 않게) */
  deletionPending?: boolean;
  /** 코칭 내용 삭제 요청(동의 철회)이 아직 끝나지 않았으면 true — 그동안은 코칭 내용을 저장하게 하지 않는다 */
  contentDeletionPending?: boolean;
}

/**
 * 서버에 알리는 수집 기준의 판 (api/_supabase.ts 와 같은 값).
 * 2 = 예전 앱(1.0.3 까지)의 선택 동의 — 첫 화면 체크박스를 직접 눌러 켬, 코칭 내용 포함.
 * 3 = 기본 이용 기록 — 처리방침에 알리고 만 14세 이상에게 수집 (1.0.4~). 코칭 내용은 x-content-consent 로 따로 알린다
 */
export const BASIC_LOG_VERSION = 3;

const FLUSH_AFTER_MS = 8000;
const FLUSH_AT_COUNT = 12;
const MAX_QUEUE = 40;
/** 이보다 오래 떠나 있다가 돌아오면 새 세션 (사진 선택·결제 창처럼 잠깐 다녀오는 건 같은 세션) */
export const SESSION_GAP_MS = 30 * 60 * 1000;
/** 만 14세 미만은 이용 기록을 보내지 않는다 */
const MIN_AGE = 14;

let identity: Identity = { deviceId: '', ready: false };
let sessionId = '';
let sessionStartedAt = 0;
/** 이번 세션에서 앞에 나와 있던 시간 (지금 구간 제외) */
let foregroundMs = 0;
/** 지금 앞에 나와 있으면 그 구간의 시작 시각, 뒤에 있으면 0 */
let foregroundSince = 0;
/** 마지막으로 뒤로 간 시각 (앞에 있으면 0) */
let backgroundAt = 0;
let queue: TrackedEvent[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let currentScreen: { name: string; at: number } | null = null;
/** 지금 보고 있는 화면 (수집 전에도 기억해 두었다가, 수집이 켜지면 그 화면부터 센다) */
let lastScreenName = '';
/** 이번 실행에서 app_open 을 보냈는지 — 저장소를 늦게 읽어 수집이 나중에 켜져도 한 번은 남긴다 */
let openSent = false;

const underAge = () => identity.user?.age != null && identity.user.age < MIN_AGE;

/** 수집 대상 여부 — 저장소 준비 + 만 14세 이상 + 전체 삭제 요청 없음 + 서버 주소가 있어야 하고, 데모 모드는 제외 */
function enabled(): boolean {
  return (
    identity.ready &&
    !underAge() &&
    !identity.deletionPending &&
    Boolean(identity.deviceId) &&
    !isDemoMode &&
    (APP_CONFIG.apiSameOrigin || Boolean(APP_CONFIG.apiUrl))
  );
}

function startSession(now: number): void {
  sessionId = createId('s_');
  sessionStartedAt = now;
  foregroundMs = 0;
  foregroundSince = now;
  backgroundAt = 0;
}

/** 이번 세션에서 앞에 나와 있던 시간 */
const sessionDuration = (now: number) => foregroundMs + (foregroundSince ? now - foregroundSince : 0);

/** 수집이 (다시) 켜졌을 때 — 그 전 시간이 세션·체류 시간에 들어가지 않게 새 세션으로 센다 */
function restartForCollection(now: number): void {
  startSession(now);
  currentScreen = lastScreenName ? { name: lastScreenName, at: now } : null;
}

/** 수집이 멈췄을 때 — 대기 중인 기록과 지금 화면 기록을 버린다 */
function dropPending(): void {
  queue = [];
  currentScreen = null;
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
}

function endpoint(): string {
  return `${APP_CONFIG.apiUrl}/api/track`;
}

/** 이번 실행의 첫 app_open — 수집이 켜져 있을 때 한 번만 */
function sendOpen(): void {
  if (openSent || !enabled()) return;
  openSent = true;
  track('app_open', { platform: Platform.OS });
}

export function initAnalytics(next: Identity): void {
  identity = next;
  if (!sessionId) startSession(Date.now());
  sendOpen();
}

/** 프로필·구매 상태·저장소 준비·동의·삭제 요청이 바뀌면 호출 (다음 전송에 함께 담김) */
export function updateIdentity(patch: Partial<Identity>): void {
  const was = enabled();
  identity = { ...identity, ...patch };
  const now = enabled();
  // 나이를 만 14세 미만으로 바꾸거나 전체 삭제를 요청하면 수집이 멈추고(대기 중인 기록도 버림), 다시 켜지면 새 세션부터 센다
  if (was && !now) dropPending();
  else if (!was && now) {
    restartForCollection(Date.now());
    sendOpen();
  }
}

export function track(name: string, props?: Record<string, unknown>): void {
  if (!enabled()) return;
  push({ type: 'event', name, props, at: Date.now() });
}

/** 화면 전환 — 이전 화면의 체류 시간을 기록하고 새 화면을 시작한다 */
export function trackScreen(name: string): void {
  lastScreenName = name;
  if (!enabled()) return;
  const now = Date.now();
  if (currentScreen && currentScreen.name !== name) {
    push({ type: 'screen', name: currentScreen.name, durationMs: now - currentScreen.at, at: currentScreen.at });
  }
  if (!currentScreen || currentScreen.name !== name) currentScreen = { name, at: now };
}

/** 앱이 백그라운드로 가거나 종료될 때 — 남은 기록을 모아 보낸다 */
export function flushAnalytics(endSession = false): void {
  if (!enabled()) return;
  const now = Date.now();
  if (currentScreen) {
    push({ type: 'screen', name: currentScreen.name, durationMs: now - currentScreen.at, at: currentScreen.at }, true);
    currentScreen = { name: currentScreen.name, at: now };
  }
  send(endSession);
}

/**
 * 앱이 화면에서 내려갈 때 — 남은 기록과 함께 지금까지의 세션 끝(시각·길이)을 보낸다.
 * 'background' 면 앞에 있던 시간을 세션 시간에 더하고 떠난 시각을 적는다 (30분 안에 돌아오면 같은 세션을 이어 쓰고,
 * 서버는 같은 세션의 끝 시각·길이를 다시 적는다).
 * iOS 의 'inactive'(앱 전환기·알림 센터·권한 창·결제 시트)는 떠난 것으로 보지 않지만 세션 끝은 보내 둔다 —
 * 앱 전환기에서 바로 밀어 끄면 'background' 없이 끝나기 때문.
 */
export function pauseAnalytics(state: string, now = Date.now()): void {
  if (state === 'background') {
    if (foregroundSince) {
      foregroundMs += now - foregroundSince;
      foregroundSince = 0;
    }
    backgroundAt = now;
  }
  flushAnalytics(true);
}

/**
 * 앱이 다시 화면에 나왔을 때 — 30분 안에 돌아왔으면 같은 세션을 이어 쓰고(떠나 있던 시간은 세지 않음),
 * 오래 떠나 있었으면 새 세션을 연다.
 */
export function resumeAnalytics(now = Date.now()): void {
  if (backgroundAt && now - backgroundAt >= SESSION_GAP_MS) {
    startSession(now);
    if (currentScreen) currentScreen = { name: currentScreen.name, at: now };
    if (enabled()) {
      openSent = true;
      track('app_open', { platform: Platform.OS, resume: true });
    }
    return;
  }
  backgroundAt = 0;
  if (!foregroundSince) foregroundSince = now;
  if (currentScreen) currentScreen = { name: currentScreen.name, at: now };
}

export function currentSessionId(): string {
  return sessionId;
}

export function analyticsEnabled(): boolean {
  return enabled();
}

/**
 * 코칭 내용(질문·답변)을 서버에 기록하게 할지 — 「코칭 내용 저장」(선택) 동의 + 이용 기록 수집 대상 + 내용 삭제 요청 없음.
 * coach-client 가 이 값으로 코칭 요청에 기기 ID·동의 헤더를 붙인다 (비밀 상담은 기기 ID 를 넘기지 않아 기록되지 않는다)
 */
export function contentLoggingEnabled(): boolean {
  return enabled() && identity.contentConsent === true && !identity.contentDeletionPending;
}

/**
 * 대기 중인 기록을 보내지 않고 버린다 — 회원 탈퇴 직전에 부른다.
 * 탈퇴로 서버 기록을 지운 뒤에 탈퇴 전 기록이 뒤늦게 다시 저장되지 않게 한다.
 */
export function discardQueuedAnalytics(): void {
  dropPending();
}

/** 시험용: 세션 상태 */
export function sessionStateForTest() {
  return { sessionId, sessionStartedAt, foregroundMs, foregroundSince, backgroundAt, queued: queue.length, currentScreen, ready: identity.ready };
}

function push(event: TrackedEvent, holdFlush = false): void {
  queue.push(event);
  if (queue.length > MAX_QUEUE) queue = queue.slice(-MAX_QUEUE);
  if (holdFlush) return;
  if (queue.length >= FLUSH_AT_COUNT) return send(false);
  if (!timer) timer = setTimeout(() => send(false), FLUSH_AFTER_MS);
}

function send(endSession: boolean): void {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  const events = queue;
  queue = [];
  if (!events.length && !endSession) return;

  const body = JSON.stringify({
    deviceId: identity.deviceId,
    sessionId,
    consentVersion: BASIC_LOG_VERSION,
    platform: Platform.OS,
    appVersion: process.env.EXPO_PUBLIC_APP_VERSION ?? '1.0.0',
    // 이름(별명)은 보내지 않는다 — 대략적인 프로필만 (나이는 만 14세 미만 제외에도 쓴다)
    user: identity.user
      ? {
          gender: identity.user.gender,
          age: identity.user.age ?? null,
          mbti: identity.user.mbti ?? null,
          defaultTone: identity.user.defaultTone,
        }
      : null,
    premiumPlan: identity.premiumPlan ?? null,
    crushCount: identity.crushCount ?? 0,
    acquisition: identity.acquisition ?? null,
    sessionStartedAt,
    sessionDurationMs: endSession ? sessionDuration(Date.now()) : undefined,
    endSession,
    events,
  });

  try {
    fetch(endpoint(), {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(APP_CONFIG.apiToken ? { 'x-app-token': APP_CONFIG.apiToken } : {}) },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {
    // 네트워크가 없으면 조용히 버린다
  }
}
