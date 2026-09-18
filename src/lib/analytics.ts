/**
 * 이용 기록 수집 (선택 동의한 이용자만).
 *
 * - 동의하지 않으면 아무것도 보내지 않습니다 (함수들이 즉시 반환).
 * - 대화 캡처 이미지는 절대 보내지 않습니다. 첨부 여부만 서버가 기록합니다.
 * - 코칭 내용은 서버(api/coach)가 직접 기록하므로 앱은 화면·이벤트만 보냅니다.
 * - 실패해도 앱 동작에 영향을 주지 않도록 모든 오류를 삼킵니다.
 */
import { Platform } from 'react-native';

import { APP_CONFIG } from '@/lib/config';
import { isDemoMode } from '@/lib/demo';
import { createId } from '@/lib/id';
import type { UserProfile } from '@/lib/types';

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

export function currentSessionId(): string {
  return sessionId;
}

export function analyticsEnabled(): boolean {
  return enabled();
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
