/**
 * 결제 화면 — 들어온 곳에 따른 기본 상품, 스토어 확인 실패 때의 기본 상품과 「다시 불러오기」.
 * - 어디서 들어와도(채팅 안내·막힘·마이 탭) 맨 위 큰 카드인 하루 이용권이 먼저 골라져 있다 (2026-11-07)
 * - 스토어에서 상품을 하나도 확인하지 못하면 주간 구독(자동 결제)이 저절로 골라지지 않고, 다시 불러오기를 권한다
 */
import { act } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';

import Paywall from '@/app/paywall';
import { track } from '@/lib/analytics';
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
let mockReason = 'quota';
jest.mock('expo-router', () => ({
  useRouter: () => ({ canGoBack: () => true, back: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => ({ reason: mockReason }),
  useIsFocused: () => true,
}));
// Reanimated(네이티브 worklets)는 테스트 환경에서 띄울 수 없어서 바로 끝나는 흉내로 바꾼다 (paywall-tracking.test.tsx 와 같은 방식)
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
    Easing: { out: () => same, in: () => same, inOut: () => same, cubic: same, quad: same, ease: same, linear: same, sin: same },
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
  { plan: 'year', productId: 'p.year', displayPrice: '₩29,800', available: true },
];
// 스토어에 닿지 못했을 때 — 확인 표시가 없는 기본 목록 (화면은 주간 구독·1년권만 보여 준다)
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
  ['quota', '하루 무제한'],
  ['banner', '하루 무제한'],
  ['upsell', '하루 무제한'],
  ['my', '하루 무제한'],
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

it('스토어 확인 실패면 주간 구독이 아닌 1년권이 골라지고, 다시 불러오기를 누르면 다시 묻는다', () => {
  mockReason = 'quota';
  mockProducts = UNCONFIRMED;
  mount();
  expect(buyLabel()).toContain('1년권');
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

describe('평생권 → 1년권 (2026-11-07)', () => {
  // 지금 파는 상품 그대로 — 하루 이용권 → 주간 구독 → 1년권 → 횟수권
  const SELLING = [
    { plan: 'day', productId: 'mylovecoach.pass.day', displayPrice: '₩3,900', available: true },
    { plan: 'weekly', productId: 'mylovecoach.premium.weekly', displayPrice: '₩9,900', available: true },
    { plan: 'year', productId: 'mylovecoach.pass.year', displayPrice: '₩29,800', available: true },
    { plan: 'credits', productId: 'mylovecoach.credits.10', displayPrice: '₩4,900', available: true },
  ];
  const radio = (label: string) => renderer.root.findAll((n) => n.props.accessibilityRole === 'radio' && textOf(n).includes(label))[0];

  it('목록에 평생권은 없고, 1년권이 주간 구독 다음에 있다', () => {
    mockReason = 'my';
    mockProducts = SELLING;
    mount();
    const text = allText();
    expect(text).not.toContain('평생');
    expect(text).toContain('1년권');
    expect(text.indexOf('주간 구독')).toBeLessThan(text.indexOf('1년권'));
    expect(text.indexOf('1년권')).toBeLessThan(text.indexOf('횟수권'));
    // 기본 선택은 그대로 하루 이용권
    expect(buyLabel()).toContain('하루 무제한');
  });

  it('1년권을 고르면 1회 결제·결제한 날부터 1년·자동 갱신 없음·구매 복원을 안내하고, 아이폰에는 Google Play 를 적지 않는다', () => {
    mockReason = 'my';
    mockProducts = SELLING;
    mount();
    act(() => radio('1년권').props.onPress());
    expect(buyLabel()).toBe('1년권 시작하기');
    const text = allText();
    expect(text).toContain('1년권 안내');
    expect(text).toContain('1년권은 29,800원 1회 결제로 결제한 날부터 1년 동안 무제한이에요');
    expect(text).toContain('자동으로 갱신되거나 다시 결제되지 않아요');
    expect(text).toContain('같은 App Store 계정이면 기기를 바꿔도 「구매 복원」으로 다시 쓸 수 있어요');
    expect(text).toContain('29,800원 한 번 결제 · 1년 무제한 · 자동 결제 없음');
    expect(text).not.toMatch(/Google ?Play|평생/);
  });

  it('1년권 이용자는 상품 대신 「1년권으로 … 언제까지」를 본다, 평생권 이용자는 그대로 「평생권」', () => {
    mockReason = 'my';
    mockProducts = SELLING;
    const until = new Date(Date.now() + 200 * 24 * 60 * 60 * 1000);
    until.setHours(12, 0, 0, 0);
    useAppStore.setState({ premium: { plan: 'year', productId: 'mylovecoach.pass.year', expiresAt: until.getTime(), verifiedAt: Date.now() } });
    try {
      mount();
      const date = `${until.getFullYear()}년 ${until.getMonth() + 1}월 ${until.getDate()}일`;
      expect(allText()).toContain(`1년권으로 모든 기능을 무제한으로 쓰고 있어요. ${date}까지 쓸 수 있어요.`);
      expect(allText()).not.toContain('1년권 시작하기');
      act(() => renderer.unmount());
      useAppStore.setState({ premium: { plan: 'lifetime', productId: 'mylovecoach.premium.lifetime', expiresAt: null, verifiedAt: 1 } });
      mount();
      expect(allText()).toContain('평생권으로 모든 기능을 무제한으로 쓰고 있어요.');
    } finally {
      act(() => {
        useAppStore.setState({ premium: null });
      });
    }
  });
});
