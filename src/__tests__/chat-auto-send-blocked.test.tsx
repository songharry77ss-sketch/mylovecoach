/**
 * 채팅방 자동 보내기(첫 화면·빠른 코칭에서 고른 캡처·붙여 넣은 글)가 무료 횟수에 막힐 때.
 * 예전: 아무 안내 없이 캡처·글이 사라졌다 → 지금: 입력창에 살려 두고 결제 화면(quota)을 띄우며,
 * 결제·가입으로 횟수가 생기면 다시 누르지 않아도 그 내용으로 코칭을 보낸다.
 */
import { act } from 'react';
import { TextInput } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { create, type ReactTestRenderer } from 'react-test-renderer';

import CrushChat from '@/app/crush/[id]';
import { track } from '@/lib/analytics';
import { dayKey, EMPTY_WALLET } from '@/lib/billing/quota';
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
jest.mock('@/lib/config', () => ({
  APP_CONFIG: { apiUrl: 'https://coach.test', apiSameOrigin: false, apiToken: 'app-token', supportEmail: '', privacyUrl: 'https://coach.test/privacy.html', termsUrl: '' },
}));
jest.mock('react-native-worklets', () => jest.requireActual('react-native-worklets/src/mock'));
jest.mock('react-native-reanimated', () => jest.requireActual('react-native-reanimated/mock'));
const mockPush = jest.fn();
const mockSetParams = jest.fn();
let mockParams: Record<string, string | undefined> = {};
jest.mock('expo-router', () => {
  const { createElement, Fragment } = jest.requireActual('react');
  return {
    Stack: { Screen: () => createElement(Fragment, null) },
    useLocalSearchParams: () => mockParams,
    useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn(), setParams: mockSetParams, dismissTo: jest.fn() }),
  };
});
jest.mock('@/components/ui/toast', () => ({ useToast: () => ({ show: jest.fn() }) }));
jest.mock('@/lib/analytics', () => ({ track: jest.fn(), trackScreen: jest.fn(), flushAnalytics: jest.fn() }));
jest.mock('@/hooks/use-plan-products', () => ({ usePlanProducts: () => null, onSalePrice: () => null }));

const METRICS = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } };
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

type FakeResponse = { ok: boolean; status: number; json: () => Promise<unknown>; headers: { get: () => null } };
const fetchMock = jest.fn(async (_url: string, _init?: { body?: string }): Promise<FakeResponse> => ({ ok: false, status: 500, json: async () => ({ error: '테스트' }), headers: { get: () => null } }));

beforeAll(async () => {
  jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask', 'setImmediate', 'clearImmediate'] });
  global.fetch = fetchMock as unknown as typeof fetch;
  for (let i = 0; i < 50 && !useAppStore.persist.hasHydrated(); i += 1) await act(flush);
});
afterEach(() => jest.clearAllTimers());
afterAll(() => jest.useRealTimers());

it('무료 횟수가 없으면 붙여 넣은 글을 입력창에 살려 두고 결제 화면을 띄우며, 횟수가 생기면 그대로 보낸다', async () => {
  const now = Date.now();
  useAppStore.setState({
    user: { name: '지훈', gender: 'male', style: [], defaultTone: 'natural', createdAt: 0 },
    aiConsent: true,
    aiConsentProvider: 'google',
    aiConsentAt: 1,
    usage: { total: 99, day: dayKey(now), dayCount: 99 },
    wallet: EMPTY_WALLET,
    premium: null,
    team: null,
    crushes: { c_blocked: { id: 'c_blocked', name: '민지', gender: 'female', relationship: 'talking', style: [], notes: '', createdAt: 0, updatedAt: 0 } },
    messages: { c_blocked: [] },
  });
  mockParams = { id: 'c_blocked', pendingText: '주말에 뭐 하냐고 물어봤어' };

  let tree: ReactTestRenderer | null = null;
  await act(async () => {
    tree = create(
      <SafeAreaProvider initialMetrics={METRICS}>
        <CrushChat />
      </SafeAreaProvider>,
    );
    await flush();
  });
  const screen = tree as unknown as ReactTestRenderer;
  await act(flush);
  // 화면 전환이 끝나도록 조금 뒤에 결제 화면을 띄운다
  expect(mockPush).not.toHaveBeenCalled();
  await act(async () => {
    jest.advanceTimersByTime(500);
    await flush();
  });

  // 보내지 않고(메시지 없음) 결제 화면으로, 글은 입력창에 남아 있다
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/paywall', params: { reason: 'quota' } });
  expect(useAppStore.getState().messages.c_blocked).toHaveLength(0);
  expect(screen.root.findByType(TextInput).props.value).toBe('주말에 뭐 하냐고 물어봤어');

  // 결제 화면에서 하루 이용권을 샀다 → 다시 누르지 않아도 그 글로 코칭을 보낸다
  await act(async () => {
    useAppStore.setState({ wallet: { ...EMPTY_WALLET, passUntil: now + 24 * 60 * 60 * 1000 } });
    await flush();
  });
  for (let i = 0; i < 50 && useAppStore.getState().messages.c_blocked.length === 0; i += 1) await act(flush);
  expect(track).toHaveBeenCalledWith('paywall_resume', { feature: 'coach', kind: 'pass' });
  // 막혔던 그 글로 코칭 요청이 시작됐다 (사용자 말풍선 + 코치 답 자리)
  for (let i = 0; i < 10; i += 1) await act(flush);
  const sent = useAppStore.getState().messages.c_blocked;
  // 한 번만 보낸다 (사용자 말풍선 1개 + 코치 답 자리 1개)
  expect(sent.filter((m) => m.role === 'user')).toHaveLength(1);
  expect(sent[0]).toMatchObject({ role: 'user', text: '주말에 뭐 하냐고 물어봤어' });
  expect(sent[1]).toMatchObject({ role: 'coach' });
  // 이어 보냈으니 입력창은 비운다
  expect(screen.root.findByType(TextInput).props.value).toBe('');
  act(() => screen.unmount());
});

it('캡처로 막히면 캡처를 입력창에 살려 둔다', async () => {
  mockPush.mockClear();
  const now = Date.now();
  useAppStore.setState({
    usage: { total: 99, day: dayKey(now), dayCount: 99 },
    wallet: EMPTY_WALLET,
    crushes: { c_img: { id: 'c_img', name: '민지', gender: 'female', relationship: 'talking', style: [], notes: '', createdAt: 0, updatedAt: 0 } },
    messages: { c_img: [] },
  });
  mockParams = { id: 'c_img', pendingImage: 'file:///shot.png', pendingWidth: '1080' };
  let tree: ReactTestRenderer | null = null;
  await act(async () => {
    tree = create(
      <SafeAreaProvider initialMetrics={METRICS}>
        <CrushChat />
      </SafeAreaProvider>,
    );
    await flush();
  });
  const screen = tree as unknown as ReactTestRenderer;
  await act(async () => {
    jest.advanceTimersByTime(500);
    await flush();
  });
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/paywall', params: { reason: 'quota' } });
  expect(useAppStore.getState().messages.c_img).toHaveLength(0);
  const composer = screen.root.findAll((n) => n.props.onPickImage && n.props.onClearImage)[0];
  expect(composer.props.image).toMatchObject({ uri: 'file:///shot.png', width: 1080 });
  act(() => screen.unmount());
});
