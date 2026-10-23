/**
 * 결제 루프 — 무료 횟수가 없어 막힌 동작을 결제·가입 뒤 한 번 이어서 실행한다.
 * 1) useResumeAfterPaywall: 횟수가 0 → 생기는 순간 한 번만, 30분이 지났거나 잊으면 실행하지 않음
 * 2) 연애 연습 화면: 막혀서 결제 화면으로 간 뒤 횟수권이 들어오면, 입력해 둔 말을 다시 누르지 않아도 보낸다
 */
import { act } from 'react';
import { TextInput } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { create, type ReactTestRenderer } from 'react-test-renderer';

import PracticeSessionScreen from '@/app/practice/[id]';
import { RESUME_WINDOW_MS, useResumeAfterPaywall } from '@/hooks/use-resume-after-paywall';
import { dayKey, EMPTY_WALLET } from '@/lib/billing/quota';
import type { PracticePersona } from '@/lib/types';
import { useAppStore } from '@/store/app-store';

jest.setTimeout(30_000);

jest.mock('@react-native-async-storage/async-storage', () => {
  const mem = new Map<string, string>();
  return {
    __esModule: true,
    default: {
      getItem: async (k: string) => mem.get(k) ?? null,
      setItem: async (k: string, v: string) => void mem.set(k, v),
      removeItem: async (k: string) => void mem.delete(k),
    },
  };
});
// 스토어 빌드처럼 중계 서버가 있는 상태 — 무료 횟수 제한이 걸린다
jest.mock('@/lib/config', () => ({
  APP_CONFIG: { apiUrl: 'https://coach.test', apiSameOrigin: false, apiToken: 'app-token', supportEmail: '', privacyUrl: 'https://coach.test/privacy.html', termsUrl: '' },
}));
jest.mock('react-native-worklets', () => jest.requireActual('react-native-worklets/src/mock'));
jest.mock('react-native-reanimated', () => jest.requireActual('react-native-reanimated/mock'));
const mockPush = jest.fn();
jest.mock('expo-router', () => {
  const { createElement, Fragment } = jest.requireActual('react');
  return {
    Stack: { Screen: ({ options }: { options?: { headerRight?: () => unknown } }) => createElement(Fragment, null, options?.headerRight?.() ?? null) },
    useLocalSearchParams: () => ({ id: 'pr_resume' }),
    useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
  };
});
jest.mock('@/components/ui/button', () => {
  const { createElement } = jest.requireActual('react');
  const { Text: RNText } = jest.requireActual('react-native');
  return {
    Button: ({ title, onPress, disabled, loading }: { title: string; onPress?: () => void; disabled?: boolean; loading?: boolean }) =>
      createElement(RNText, { accessibilityRole: 'button', accessibilityState: { disabled: Boolean(disabled || loading) }, onPress: disabled || loading ? undefined : onPress }, title),
  };
});
jest.mock('@/components/ui/toast', () => ({ useToast: () => ({ show: jest.fn() }) }));
jest.mock('@/lib/analytics', () => ({ track: jest.fn(), trackScreen: jest.fn(), flushAnalytics: jest.fn() }));

const METRICS = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } };
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

const PERSONA: PracticePersona = {
  id: 'blind',
  name: '민지',
  emoji: '🙂',
  gender: 'female',
  age: 28,
  mbti: 'ENFP',
  job: '마케터',
  style: [],
  relationship: 'blind_date',
  scenario: '소개팅 다음 날',
  opener: '어제 잘 들어갔어요?',
  speech: 'polite',
  difficulty: 2,
  hint: '질문으로 이어 가기',
  color: '#FFD6E0',
};

type FakeResponse = { ok: boolean; status: number; json: () => Promise<unknown> };
const fetchMock = jest.fn(
  async (_url: string, _init?: { body?: string }): Promise<FakeResponse> => ({
    ok: true,
    status: 200,
    json: async () => ({ result: { replies: ['좋아요 ㅎㅎ'], heatDelta: 3, mood: '😊', feedback: '좋은 질문', better: '', ended: false } }),
  }),
);

/** 무료 체험·오늘 충전을 다 쓴 상태 */
const exhausted = () => ({ total: 99, day: dayKey(Date.now()), dayCount: 99 });

beforeAll(async () => {
  jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask', 'setImmediate', 'clearImmediate'] });
  global.fetch = fetchMock as unknown as typeof fetch;
  for (let i = 0; i < 50 && !useAppStore.persist.hasHydrated(); i += 1) await act(flush);
});
afterEach(() => jest.clearAllTimers());
afterAll(() => jest.useRealTimers());

describe('useResumeAfterPaywall', () => {
  let resume: ReturnType<typeof useResumeAfterPaywall> | null = null;
  function Probe() {
    resume = useResumeAfterPaywall('test');
    return null;
  }

  beforeEach(() => {
    useAppStore.setState({ usage: exhausted(), wallet: EMPTY_WALLET, premium: null, team: null });
  });

  it('횟수가 생기는 순간 기억한 동작을 한 번만 실행한다', async () => {
    let tree: ReactTestRenderer | null = null;
    await act(async () => {
      tree = create(<Probe />);
    });
    const run = jest.fn();
    act(() => resume?.remember(run));
    expect(run).not.toHaveBeenCalled();
    await act(async () => useAppStore.setState({ wallet: { ...EMPTY_WALLET, credits: 10 } }));
    expect(run).toHaveBeenCalledTimes(1);
    // 횟수가 또 바뀌어도 다시 실행하지 않는다
    await act(async () => useAppStore.setState({ wallet: { ...EMPTY_WALLET, credits: 9 } }));
    expect(run).toHaveBeenCalledTimes(1);
    act(() => (tree as unknown as ReactTestRenderer).unmount());
  });

  it('잊었거나 30분이 지났으면 실행하지 않는다', async () => {
    let tree: ReactTestRenderer | null = null;
    await act(async () => {
      tree = create(<Probe />);
    });
    const forgotten = jest.fn();
    act(() => resume?.remember(forgotten));
    act(() => resume?.forget());
    await act(async () => useAppStore.setState({ wallet: { ...EMPTY_WALLET, credits: 10 } }));
    expect(forgotten).not.toHaveBeenCalled();

    await act(async () => useAppStore.setState({ wallet: EMPTY_WALLET }));
    const stale = jest.fn();
    act(() => resume?.remember(stale));
    const now = Date.now();
    const spy = jest.spyOn(Date, 'now').mockReturnValue(now + RESUME_WINDOW_MS + 1000);
    await act(async () => useAppStore.setState({ wallet: { ...EMPTY_WALLET, credits: 10 } }));
    spy.mockRestore();
    expect(stale).not.toHaveBeenCalled();
    act(() => (tree as unknown as ReactTestRenderer).unmount());
  });
});

describe('연애 연습 화면 — 결제 뒤 이어 보내기', () => {
  it('막혀서 결제 화면으로 간 뒤 횟수권이 들어오면 입력해 둔 말을 보낸다', async () => {
    fetchMock.mockClear();
    mockPush.mockClear();
    useAppStore.setState({
      user: { name: '지훈', gender: 'male', style: [], defaultTone: 'natural', createdAt: 0 },
      aiConsent: true,
      aiConsentProvider: 'google',
      aiConsentAt: 1,
      usage: exhausted(),
      wallet: EMPTY_WALLET,
      premium: null,
      team: null,
      practice: { pr_resume: { id: 'pr_resume', persona: PERSONA, turns: [{ id: 't0', role: 'them', text: PERSONA.opener, at: 0 }], heat: 20, mood: '🙂', startedAt: 0, updatedAt: 0, charged: false } },
    });
    let tree: ReactTestRenderer | null = null;
    await act(async () => {
      tree = create(
        <SafeAreaProvider initialMetrics={METRICS}>
          <PracticeSessionScreen />
        </SafeAreaProvider>,
      );
      await flush();
    });
    const screen = tree as unknown as ReactTestRenderer;
    act(() => screen.root.findByType(TextInput).props.onChangeText('네 잘 들어갔어요!'));
    const send = screen.root.findAll((n) => n.props.accessibilityLabel === '보내기' && typeof n.props.onPress === 'function');
    await act(async () => {
      send[send.length - 1].props.onPress();
      await flush();
    });
    // 횟수가 없어 보내지 않고 결제 화면으로
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/paywall', params: { reason: 'practice' } });
    expect(fetchMock).not.toHaveBeenCalled();

    // 결제 화면에서 횟수권을 샀다 — 다시 누르지 않아도 보낸다
    await act(async () => {
      useAppStore.setState({ wallet: { ...EMPTY_WALLET, credits: 10 } });
      await flush();
    });
    for (let i = 0; i < 50 && fetchMock.mock.calls.length === 0; i += 1) await act(flush);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetchMock.mock.calls[0][1]?.body ?? '{}') as { turns: { role: string; text: string }[] };
    expect(body.turns[body.turns.length - 1]).toEqual({ role: 'me', text: '네 잘 들어갔어요!' });
    act(() => screen.unmount());
  });
});
