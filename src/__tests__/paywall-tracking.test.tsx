/**
 * 결제 화면의 이용 기록 — 관리자 「결제 흐름」이 쓰는 이벤트.
 * 상품 고름(paywall_plan) · 결제 없이 닫음(paywall_close) · 구매 복원(restore_start / restore_result).
 */
import { act } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';

import Paywall from '@/app/paywall';
import { track } from '@/lib/analytics';
import { purchasePlan, restorePremium } from '@/lib/billing/iap';

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
  APP_CONFIG: { apiUrl: 'https://coach.test', apiSameOrigin: false, apiToken: '', supportEmail: '', privacyUrl: '', termsUrl: '' },
}));
jest.mock('expo-router', () => ({
  useRouter: () => ({ canGoBack: () => true, back: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => ({ reason: 'quota' }),
}));
// Reanimated(네이티브 worklets)는 테스트 환경에서 띄울 수 없어서 바로 끝나는 흉내로 바꾼다 (ai-cost.test.tsx 와 같은 방식)
jest.mock('react-native-reanimated', () => {
  const RN = jest.requireActual('react-native');
  const { useRef } = jest.requireActual('react');
  const entering: Record<string, () => unknown> = {};
  for (const name of ['delay', 'duration', 'springify', 'damping']) entering[name] = () => entering;
  const same = (t: number) => t;
  const last = (...values: unknown[]) => values[values.length - 1];
  const target = (value: unknown) => value;
  return {
    __esModule: true,
    default: { View: RN.View, Text: RN.Text, createAnimatedComponent: target },
    FadeIn: entering,
    FadeOut: entering,
    FadeInDown: entering,
    FadeInUp: entering,
    ZoomIn: entering,
    Easing: { out: () => same, in: () => same, inOut: () => same, cubic: same, quad: same, ease: same, linear: same },
    useSharedValue: (value: unknown) => useRef({ value }).current,
    useAnimatedStyle: (style: () => object) => style(),
    useAnimatedReaction: () => {},
    withDelay: last,
    withSequence: last,
    withSpring: target,
    withTiming: target,
    withRepeat: target,
    interpolate: target,
    interpolateColor: () => 'transparent',
    runOnJS: target,
  };
});
// 아이콘 글꼴은 비동기로 불러와 시험이 끝난 뒤 화면을 고치므로(act 경고) 빈 아이콘으로 바꾼다
jest.mock('@expo/vector-icons', () => ({ Ionicons: Object.assign(() => null, { glyphMap: {} }) }));
jest.mock('@/lib/analytics', () => ({ track: jest.fn() }));
// 가입 권유 카드는 이 시험과 상관없다 (로그인 기능이 없는 상태)
jest.mock('@/lib/supabase', () => ({ authAvailable: false }));
jest.mock('@/components/ui/toast', () => ({ useToast: () => ({ show: jest.fn() }) }));
jest.mock('@/lib/haptics', () => ({ haptic: { thud: jest.fn(), select: jest.fn(), celebrate: jest.fn() } }));
jest.mock('@/lib/billing/iap', () => ({
  billingSupported: true,
  purchasePlan: jest.fn(),
  restorePremium: jest.fn(),
}));
jest.mock('@/hooks/use-plan-products', () => {
  const products = [
    { plan: 'day', productId: 'p.day', displayPrice: '₩2,700', available: true },
    { plan: 'weekly', productId: 'p.week', displayPrice: '₩9,900', available: true },
    { plan: 'lifetime', productId: 'p.life', displayPrice: '₩29,000', available: true },
  ];
  return { usePlanProducts: () => products, onSalePrice: () => '₩2,700' };
});

const tracked = track as jest.Mock;
const names = () => tracked.mock.calls.map((c) => c[0]);
const propsOf = (name: string) => tracked.mock.calls.find((c) => c[0] === name)?.[1];

let renderer: ReactTestRenderer;
function mount() {
  act(() => {
    renderer = create(
      <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
        <Paywall />
      </SafeAreaProvider>,
    );
  });
}

const textOf = (node: ReactTestInstance): string =>
  node.children.map((c) => (typeof c === 'string' ? c : textOf(c))).join('');
/** 누를 수 있는 것 중 글자가 들어간 것 */
function pressable(label: string): ReactTestInstance {
  const found = renderer.root.findAll((n) => typeof n.props.onPress === 'function' && textOf(n).includes(label));
  if (!found.length) throw new Error(`「${label}」 버튼이 없어요`);
  return found[0];
}

beforeEach(() => {
  tracked.mockClear();
  (purchasePlan as jest.Mock).mockReset();
  (restorePremium as jest.Mock).mockReset();
});

afterEach(() => {
  act(() => renderer?.unmount());
});

it('결제 화면을 열면 이유를 남기고, 다른 상품을 고르면 그 상품을 남긴다', () => {
  mount();
  expect(propsOf('paywall_open')).toEqual({ reason: 'quota' });
  act(() => pressable('주간 구독').props.onPress());
  expect(propsOf('paywall_plan')).toEqual({ plan: 'weekly', reason: 'quota' });
});

it('결제 없이 닫으면 머문 시간·고른 상품·직접 골랐는지를 남긴다', () => {
  mount();
  act(() => pressable('평생권').props.onPress());
  act(() => renderer.unmount());
  const close = propsOf('paywall_close');
  expect(close).toMatchObject({ reason: 'quota', plan: 'lifetime', picked: true, result: 'none' });
  expect(typeof close.sec).toBe('number');
});

it('결제를 취소하고 닫으면 마지막 결과(취소)를 함께 남긴다', async () => {
  (purchasePlan as jest.Mock).mockResolvedValue({ status: 'cancelled' });
  mount();
  await act(async () => {
    await pressable('결제하기').props.onPress();
  });
  expect(names()).toEqual(expect.arrayContaining(['purchase_start', 'purchase_cancelled']));
  act(() => renderer.unmount());
  expect(propsOf('paywall_close')).toMatchObject({ plan: 'day', picked: false, result: 'cancelled' });
});

it('결제가 끝나 닫힌 경우는 「결제 없이 닫음」으로 세지 않는다', async () => {
  (purchasePlan as jest.Mock).mockResolvedValue({ status: 'granted', plan: 'day' });
  mount();
  await act(async () => {
    await pressable('결제하기').props.onPress();
  });
  act(() => renderer.unmount());
  expect(names()).toContain('purchase_granted');
  expect(names()).not.toContain('paywall_close');
});

it('구매 복원은 누른 것과 결과를 남긴다', async () => {
  (restorePremium as jest.Mock).mockResolvedValue(null);
  mount();
  await act(async () => {
    await pressable('구매 복원').props.onPress();
  });
  expect(names()).toContain('restore_start');
  expect(propsOf('restore_result')).toEqual({ result: 'none' });
});
