/**
 * src/lib/analytics.ts — 기본 이용 기록(만 14세 이상, 선택 동의 없이 처리방침에 알리고 수집), 이름은 싣지 않음,
 * 「코칭 내용 저장」은 선택 동의한 경우에만, 세션 이어 쓰기(30분 안에 돌아오면 같은 세션), iOS inactive 는 떠난 것으로 보지 않음,
 * 저장소를 다 읽기 전·전체 삭제 요청 중·만 14세 미만은 보내지 않음.
 */
import {
  BASIC_LOG_VERSION,
  contentLoggingEnabled,
  flushAnalytics,
  initAnalytics,
  pauseAnalytics,
  resumeAnalytics,
  SESSION_GAP_MS,
  sessionStateForTest,
  track,
  trackScreen,
  updateIdentity,
} from '@/lib/analytics';
import type { UserProfile } from '@/lib/types';

jest.mock('@/lib/config', () => ({
  APP_CONFIG: { apiUrl: 'https://api.example', apiSameOrigin: false, apiToken: '', supportEmail: '', privacyUrl: '', termsUrl: '' },
}));

interface SentBody {
  deviceId?: string;
  sessionId: string;
  consentVersion?: number;
  user?: Record<string, unknown> | null;
  endSession: boolean;
  sessionDurationMs?: number;
  events: { type: string; name: string; durationMs?: number; props?: Record<string, unknown> }[];
}

const sent: SentBody[] = [];
const T0 = 1_900_000_000_000;
const MIN = 60 * 1000;
const user = (age: number) => ({ name: '테스트', gender: 'female', age, defaultTone: 'natural' }) as unknown as UserProfile;

beforeAll(() => {
  jest.useFakeTimers({ now: T0 });
  global.fetch = jest.fn(async (_url: string, init: { body?: string } = {}) => {
    if (init.body) sent.push(JSON.parse(init.body));
    return { ok: true, status: 204 };
  }) as unknown as typeof fetch;
  // 선택 동의 없이 — 저장소를 다 읽은 만 14세 이상 이용자
  initAnalytics({ deviceId: 'd_session_test', ready: true, user: user(25) });
  trackScreen('/(tabs)');
});

afterAll(() => {
  jest.useRealTimers();
});

const at = (ms: number) => jest.setSystemTime(T0 + ms);
const lastSent = () => sent[sent.length - 1];

describe('기본 이용 기록 (선택 동의 없이 만 14세 이상)', () => {
  it('동의하지 않아도 app_open·화면 기록을 보내고, 판 3(기본 이용 기록)으로 표시하며 이름은 싣지 않는다', () => {
    flushAnalytics(false);
    const body = lastSent();
    expect(BASIC_LOG_VERSION).toBe(3);
    expect(body.consentVersion).toBe(BASIC_LOG_VERSION);
    expect(body.events.map((e) => e.name)).toEqual(expect.arrayContaining(['app_open', '/(tabs)']));
    expect(body.user).toEqual({ gender: 'female', age: 25, mbti: null, defaultTone: 'natural' });
    expect(body.user).not.toHaveProperty('name');
  });

  it('코칭 내용 기록은 「코칭 내용 저장」에 동의했을 때만 켜지고, 내용 삭제 요청 중에는 내용만 멈춘다', () => {
    expect(contentLoggingEnabled()).toBe(false);
    updateIdentity({ contentConsent: true });
    expect(contentLoggingEnabled()).toBe(true);

    const { sessionId } = sessionStateForTest();
    updateIdentity({ contentDeletionPending: true });
    expect(contentLoggingEnabled()).toBe(false);
    // 기본 이용 기록은 그대로 — 같은 세션에 계속 쌓인다
    track('during_content_deletion');
    expect(sessionStateForTest()).toMatchObject({ sessionId });
    expect(sessionStateForTest().queued).toBeGreaterThan(0);

    updateIdentity({ contentDeletionPending: false, contentConsent: false });
    expect(contentLoggingEnabled()).toBe(false);
  });
});

describe('세션', () => {
  it('iOS inactive(앱 전환기·알림 센터)는 떠난 것으로 보지 않지만 세션 끝은 보내 둔다 — 전환기에서 바로 꺼도 남게', () => {
    const { sessionId } = sessionStateForTest();
    at(1 * MIN);
    pauseAnalytics('inactive');
    expect(lastSent()).toMatchObject({ sessionId, endSession: true, sessionDurationMs: 1 * MIN });
    expect(sessionStateForTest()).toMatchObject({ sessionId, backgroundAt: 0, foregroundSince: T0 });
  });

  it('잠깐 백그라운드(사진 선택·결제 창)에 다녀오면 같은 세션을 이어 쓰고, 떠나 있던 시간은 세지 않는다', () => {
    const { sessionId } = sessionStateForTest();
    at(2 * MIN);
    pauseAnalytics('background');
    expect(lastSent()).toMatchObject({ sessionId, endSession: true, sessionDurationMs: 2 * MIN });

    at(7 * MIN); // 5분 뒤 돌아옴
    resumeAnalytics();
    expect(sessionStateForTest()).toMatchObject({ sessionId, backgroundAt: 0, foregroundSince: T0 + 7 * MIN });

    at(10 * MIN);
    pauseAnalytics('background');
    // 앞에 나와 있던 시간만: 0~2분 + 7~10분 = 5분
    expect(lastSent()).toMatchObject({ sessionId, endSession: true, sessionDurationMs: 5 * MIN });
    // 화면 체류도 백그라운드 시간을 빼고 센다 (7~10분 구간 3분)
    const screen = lastSent().events.filter((e) => e.type === 'screen').pop();
    expect(screen?.durationMs).toBe(3 * MIN);
  });

  it('30분 넘게 떠나 있다 돌아오면 새 세션을 열고 app_open(resume) 을 남긴다', () => {
    const { sessionId } = sessionStateForTest();
    at(10 * MIN + SESSION_GAP_MS + MIN);
    resumeAnalytics();
    const next = sessionStateForTest();
    expect(next.sessionId).not.toBe(sessionId);
    expect(next.sessionStartedAt).toBe(T0 + 10 * MIN + SESSION_GAP_MS + MIN);
    flushAnalytics(false);
    expect(lastSent().events.some((e) => e.name === 'app_open' && e.props?.resume === true)).toBe(true);
  });
});

describe('저장소 준비·나이·삭제 대기', () => {
  it('서버 기록 전체 삭제 요청이 끝날 때까지는 보내지 않고, 끝나면 새 세션부터 보낸다', () => {
    track('before_pending');
    updateIdentity({ deletionPending: true });
    expect(sessionStateForTest().queued).toBe(0);
    const count = sent.length;
    track('while_pending');
    flushAnalytics(true);
    expect(sent.length).toBe(count);

    const { sessionId } = sessionStateForTest();
    updateIdentity({ deletionPending: false });
    expect(sessionStateForTest().sessionId).not.toBe(sessionId);
    track('after_deleted');
    flushAnalytics(false);
    expect(lastSent().events.filter((e) => e.type === 'event').map((e) => e.name)).toEqual(['after_deleted']);
  });

  it('저장소를 다 읽기 전(임시 기기 ID)에는 보내지 않고, 다 읽으면 그때부터 새 세션으로 센다', () => {
    track('before_unready');
    updateIdentity({ ready: false });
    expect(sessionStateForTest().queued).toBe(0);
    const offSession = sessionStateForTest().sessionId;
    track('while_unready');
    expect(sessionStateForTest().queued).toBe(0);

    at(60 * MIN + 3 * 60 * MIN);
    trackScreen('/(tabs)/my');
    updateIdentity({ ready: true });
    const on = sessionStateForTest();
    expect(on.sessionId).not.toBe(offSession);
    expect(on.sessionStartedAt).toBe(T0 + 60 * MIN + 3 * 60 * MIN);
    expect(on.currentScreen).toEqual({ name: '/(tabs)/my', at: T0 + 60 * MIN + 3 * 60 * MIN });
  });

  it('같은 값으로 다시 알려도 세션이 바뀌지 않는다', () => {
    const { sessionId } = sessionStateForTest();
    updateIdentity({ ready: true, deletionPending: false });
    expect(sessionStateForTest().sessionId).toBe(sessionId);
  });

  it('나이를 만 14세 미만으로 바꾸면 보내지 않고, 다시 14세 이상이면 새 세션부터 보낸다', () => {
    track('adult_event');
    updateIdentity({ user: user(13) });
    expect(sessionStateForTest().queued).toBe(0);
    const count = sent.length;
    track('child_event');
    flushAnalytics(true);
    expect(sent.length).toBe(count);

    const { sessionId } = sessionStateForTest();
    updateIdentity({ user: user(15) });
    expect(sessionStateForTest().sessionId).not.toBe(sessionId);
    track('teen_event');
    flushAnalytics(false);
    expect(lastSent().events.map((e) => e.name)).toContain('teen_event');
    expect(lastSent().events.map((e) => e.name)).not.toContain('child_event');
  });

  it('만 14세 미만이면 코칭 내용 저장에 동의했어도 내용 기록을 켜지 않는다', () => {
    updateIdentity({ user: user(12), contentConsent: true });
    expect(contentLoggingEnabled()).toBe(false);
    updateIdentity({ user: user(20) });
    expect(contentLoggingEnabled()).toBe(true);
    updateIdentity({ contentConsent: false });
  });
});

describe('저장소를 늦게 읽은 실행', () => {
  it('처음에는 보내지 않다가 다 읽으면 app_open 을 남기고, 그 실행에서 다시 켜져도 또 남기지 않는다', () => {
    const mine = () => sent.filter((b) => b.deviceId === 'd_late_ready');
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const fresh = require('@/lib/analytics') as typeof import('@/lib/analytics');
      fresh.initAnalytics({ deviceId: 'd_late_ready', ready: false, user: user(30) });
      expect(fresh.analyticsEnabled()).toBe(false);
      fresh.updateIdentity({ ready: true });
      fresh.track('first');
      fresh.flushAnalytics(false);
      expect(mine().at(-1)?.events.map((e) => e.name)).toEqual(['app_open', 'first']);

      fresh.updateIdentity({ ready: false });
      fresh.updateIdentity({ ready: true });
      fresh.track('second');
      fresh.flushAnalytics(false);
      expect(mine().at(-1)?.events.map((e) => e.name)).toEqual(['second']);
    });
  });
});
