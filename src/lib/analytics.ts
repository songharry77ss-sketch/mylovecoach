/**
 * 이용 기록 수집 (선택 동의한 이용자만).
 *
 * - 동의하지 않으면 아무것도 보내지 않습니다 (함수들이 즉시 반환).
 * - 대화 캡처 이미지는 절대 보내지 않습니다. 첨부 여부만 서버가 기록합니다.
 * - 코칭 내용은 서버(api/coach)가 직접 기록하므로 앱은 화면·이벤트만 보냅니다.
 * - 실패해도 앱 동작에 영향을 주지 않도록 모든 오류를 삼킵니다.
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
  consent: boolean;
  user?: UserProfile | null;
  premiumPlan?: string | null;
  crushCount?: number;
  acquisition?: Acquisition | null;
  /** 동의를 받은 방식의 판 — 서버는 직접 체크해 받은 동의(2 이상)만 저장한다 */
  consentVersion?: number | null;
}

const FLUSH_AFTER_MS = 8000;
const FLUSH_AT_COUNT = 12;
const MAX_QUEUE = 100;

let identity: Identity = { deviceId: '', consent: false };
let sessionId = '';
let sessionStartedAt = 0;
let queue: TrackedEvent[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let currentScreen: { name: string; at: number } | null = null;
/** 백그라운드로 가며 세션을 끝냈는지 — 돌아오면 새 세션을 연다 */
let sessionEnded = false;

/** 수집 대상 여부 — 동의 + 서버 주소가 있어야 하고, 데모 모드는 제외 */
function enabled(): boolean {
  return identity.consent && Boolean(identity.deviceId) && !isDemoMode && (APP_CONFIG.apiSameOrigin || Boolean(APP_CONFIG.apiUrl));
}

function endpoint(): string {
  return `${APP_CONFIG.apiUrl}/api/track`;
}

export function initAnalytics(next: Identity): void {
  identity = next;
  if (!sessionId) {
    sessionId = createId('s_');
    sessionStartedAt = Date.now();
  }
  if (enabled()) track('app_open', { platform: Platform.OS });
}

/** 프로필·구매 상태가 바뀌면 호출 (다음 전송에 함께 담김) */
export function updateIdentity(patch: Partial<Identity>): void {
  identity = { ...identity, ...patch };
}

export function setConsent(consent: boolean): void {
  identity = { ...identity, consent };
  if (!consent) queue = [];
}

export function track(name: string, props?: Record<string, unknown>): void {
  if (!enabled()) return;
  push({ type: 'event', name, props, at: Date.now() });
}

/** 화면 전환 — 이전 화면의 체류 시간을 기록하고 새 화면을 시작한다 */
export function trackScreen(name: string): void {
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
 * 앱이 다시 화면에 나왔을 때 — 백그라운드에 있던 시간을 체류·세션 시간으로 세지 않도록
 * 지금 화면의 시작 시각을 다시 잡고, 떠날 때 세션을 끝냈으면 새 세션을 연다.
 */
export function resumeAnalytics(): void {
  const now = Date.now();
  if (currentScreen) currentScreen = { name: currentScreen.name, at: now };
  if (!sessionEnded) return;
  sessionId = createId('s_');
  sessionStartedAt = now;
  sessionEnded = false;
  if (enabled()) track('app_open', { platform: Platform.OS, resume: true });
}

export function currentSessionId(): string {
  return sessionId;
}

export function analyticsEnabled(): boolean {
  return enabled();
}

export function currentConsentVersion(): number | null {
  return identity.consentVersion ?? null;
}

/**
 * 이용 기록 수집을 끈 기기의 서버 기록을 지워 달라고 요청한다 (처리방침 「동의 철회 시 지체 없이 파기」).
 * 실패해도 앱 동작에는 영향이 없다 — 남은 기록은 1년 뒤 자동 파기되고, 메일로도 삭제를 요청할 수 있다.
 */
export function requestServerDeletion(deviceId: string): void {
  if (!deviceId || isDemoMode || !(APP_CONFIG.apiSameOrigin || APP_CONFIG.apiUrl)) return;
  try {
    fetch(endpoint(), {
      method: 'DELETE',
      headers: { 'content-type': 'application/json', ...(APP_CONFIG.apiToken ? { 'x-app-token': APP_CONFIG.apiToken } : {}) },
      body: JSON.stringify({ deviceId }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // 네트워크가 없으면 조용히 넘어간다
  }
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
  if (endSession) sessionEnded = true;

  const body = JSON.stringify({
    deviceId: identity.deviceId,
    sessionId,
    consentVersion: identity.consentVersion ?? null,
    platform: Platform.OS,
    appVersion: process.env.EXPO_PUBLIC_APP_VERSION ?? '1.0.0',
    user: identity.user
      ? {
          name: identity.user.name,
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
    sessionDurationMs: endSession ? Date.now() - sessionStartedAt : undefined,
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
