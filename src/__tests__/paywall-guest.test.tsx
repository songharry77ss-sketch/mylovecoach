/**
 * 비회원이 무료를 다 써서 막혔을 때의 결제 화면 — 가입(무료 보너스) 한 갈래를 먼저, 결제는 한 줄로 접는다 (2026-11-28 결제 전환).
 */
import { act } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';

import Paywall from '@/app/paywall';
import { track } from '@/lib/analytics';
import { dayKey, EMPTY_WALLET } from '@/lib/billing/quota';
import { useAppStore } from '@/store/app-store';

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
  useIsFocused: () => true,
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
jest.mock('@/lib/supabase', () => ({ authAvailable: true }));
jest.mock('@/components/auth/signup-card', () => {
  const { Text } = jest.requireActual('react-native');
  return { SignupCard: () => <Text>가입 카드</Text> };
});
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
    { plan: 'year', productId: 'p.year', displayPrice: '₩29,000', available: true },
  ];
  return { usePlanProducts: () => products, onSalePrice: () => '₩2,700' };
});

const tracked = track as jest.Mock;
const names = () => tracked.mock.calls.map((c) => c[0]);

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
const textOf = (node: ReactTestInstance): string => node.children.map((c) => (typeof c === 'string' ? c : textOf(c))).join('');
const pressables = (label: string) => renderer.root.findAll((n) => typeof n.props.onPress === 'function' && textOf(n).includes(label));

beforeEach(() => {
  tracked.mockClear();
  const now = Date.now();
  useAppStore.setState({ member: null, premium: null, team: null, wallet: EMPTY_WALLET, saleOfferStartedAt: null, usage: { total: 99, day: dayKey(now), dayCount: 99 } });
});
afterEach(() => act(() => renderer?.unmount()));

it('비회원이 무료를 다 써서 막히면 가입 한 갈래만 — 이용권 목록·아래 결제 버튼은 「가입 없이 바로 이용권 보기」 뒤로', () => {
  mount();
  const text = textOf(renderer.root);
  expect(text).toContain('무료 맛보기를 다 썼어요');
  expect(text).toContain('가입 카드');
  expect(text).toContain('가입 없이 바로 이용권 보기');
  expect(text).toContain('하루 무제한 2,700원');
  expect(pressables('하루 무제한 시작하기')).toHaveLength(0);
  expect(renderer.root.findAll((n) => n.props.accessibilityRole === 'radio')).toHaveLength(0);
});

it('「가입 없이 바로 이용권 보기」를 누르면 이용권과 결제 버튼이 나온다 (가입 없이 사는 길은 늘 남긴다)', () => {
  mount();
  act(() => pressables('가입 없이 바로 이용권 보기')[0].props.onPress());
  expect(names()).toContain('paywall_guest_buy');
  expect(pressables('하루 무제한 시작하기').length).toBeGreaterThan(0);
  expect(textOf(renderer.root)).toContain('가입 카드');
});

it('무료가 남아 있으면 비회원도 가입 카드와 이용권을 함께 본다', () => {
  useAppStore.setState({ usage: { total: 0, day: dayKey(Date.now()), dayCount: 0 } });
  mount();
  expect(textOf(renderer.root)).toContain('가입 카드');
  expect(pressables('하루 무제한 시작하기').length).toBeGreaterThan(0);
});
