/**
 * 결제 화면 — 들어온 곳에 따른 기본 상품, 스토어 확인 실패 때의 기본 상품과 「다시 불러오기」.
 * - 채팅 안내(banner·upsell)·막힘(quota)으로 온 사람은 하루 이용권, 마이 탭에서 온 사람은 평생권이 먼저 골라져 있다
 * - 스토어에서 상품을 하나도 확인하지 못하면 주간 구독(자동 결제)이 저절로 골라지지 않고, 다시 불러오기를 권한다
 */
import { act } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';

import Paywall from '@/app/paywall';
import { track } from '@/lib/analytics';

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
let mockReason = 'quota';
jest.mock('expo-router', () => ({
  useRouter: () => ({ canGoBack: () => true, back: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => ({ reason: mockReason }),
}));
jest.mock('react-native-reanimated', () => {
  const RN = jest.requireActual('react-native');
  const { useRef } = jest.requireActual('react');
  const entering: Record<string, () => unknown> = {};
  for (const name of ['delay', 'duration', 'springify', 'damping']) entering[name] = () => entering;
  const target = (value: unknown) => value;
  return {
    __esModule: true,
    default: { View: RN.View, Text: RN.Text, createAnimatedComponent: target },
    FadeIn: entering,
    FadeOut: entering,
    FadeInDown: entering,
    FadeInUp: entering,
    ZoomIn: entering,
    useSharedValue: (value: unknown) => useRef({ value }).current,
    useAnimatedStyle: (style: () => object) => style(),
    withSpring: target,
    withTiming: target,
  };
});
jest.mock('@expo/vector-icons', () => ({ Ionicons: Object.assign(() => null, { glyphMap: {} }) }));
jest.mock('@/lib/analytics', () => ({ track: jest.fn() }));
jest.mock('@/lib/supabase', () => ({ authAvailable: false }));
jest.mock('@/components/ui/toast', () => ({ useToast: () => ({ show: jest.fn() }) }));
jest.mock('@/lib/haptics', () => ({ haptic: { thud: jest.fn(), select: jest.fn(), celebrate: jest.fn() } }));
jest.mock('@/lib/billing/iap', () => ({
  billingSupported: true,
  purchasePlan: jest.fn(),
  restorePremium: jest.fn(),
  lastStoreProblem: () => ({ code: 'query-product', responseCode: 3 }),
}));

const CONFIRMED = [
  { plan: 'day', productId: 'p.day', displayPrice: '₩2,700', available: true },
  { plan: 'weekly', productId: 'p.week', displayPrice: '₩9,900', available: true },
  { plan: 'lifetime', productId: 'p.life', displayPrice: '₩29,800', available: true },
];
// 스토어에 닿지 못했을 때 — 확인 표시가 없는 기본 목록 (화면은 주간·평생만 보여 준다)
const UNCONFIRMED = CONFIRMED.map(({ available: _a, ...p }) => p);
let mockProducts: unknown[] = CONFIRMED;
const mockAttempts: number[] = [];
jest.mock('@/hooks/use-plan-products', () => ({
  usePlanProducts: (attempt = 0) => {
    mockAttempts.push(attempt);
    return mockProducts;
  },
  onSalePrice: (products: { plan: string; available?: boolean; displayPrice: string }[] | null, plan: string) => products?.find((p) => p.plan === plan && p.available)?.displayPrice ?? null,
}));

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
const allText = () => textOf(renderer.root);
/** 결제 버튼 글자 */
const buyLabel = () => {
  const button = renderer.root.findAll((n) => typeof n.props.onPress === 'function' && /결제하기|시작하기/.test(textOf(n)))[0];
  return button ? textOf(button) : '';
};

beforeEach(() => {
  jest.mocked(track).mockClear();
  mockProducts = CONFIRMED;
  mockAttempts.length = 0;
});
afterEach(() => act(() => renderer?.unmount()));

it.each([
  ['quota', '하루 이용권'],
  ['banner', '하루 이용권'],
  ['upsell', '하루 이용권'],
  ['my', '평생권'],
])('%s 로 들어오면 %s 이 먼저 골라져 있다', (reason, plan) => {
  mockReason = reason;
  mount();
  expect(buyLabel()).toContain(plan);
});

it('채팅 속 안내 카드(upsell)는 전용 문구를 보여 준다', () => {
  mockReason = 'upsell';
  mount();
  expect(allText()).toContain('마음에 드는 답장이');
});

it('스토어 확인 실패면 주간 구독이 아닌 평생권이 골라지고, 다시 불러오기를 누르면 다시 묻는다', () => {
  mockReason = 'quota';
  mockProducts = UNCONFIRMED;
  mount();
  expect(buyLabel()).toContain('평생권');
  expect(allText()).toContain('다시 불러오기');
  const reload = renderer.root.findAll((n) => typeof n.props.onPress === 'function' && textOf(n).includes('다시 불러오기'))[0];
  act(() => reload.props.onPress());
  expect(Math.max(...mockAttempts)).toBe(1);
});

it('스토어 확인 실패면 그 원인(오류 코드·Google Play 응답 코드)을 이용 기록에 남긴다', () => {
  mockReason = 'quota';
  mockProducts = UNCONFIRMED;
  mount();
  expect(track).toHaveBeenCalledWith('store_unavailable', { reason: 'quota', code: 'query-product', rc: 3 });
});

it('스토어에서 확인되면 다시 불러오기를 보여 주지 않는다', () => {
  mockReason = 'quota';
  mount();
  expect(allText()).not.toContain('다시 불러오기');
  expect(track).not.toHaveBeenCalledWith('store_unavailable', expect.anything());
});
