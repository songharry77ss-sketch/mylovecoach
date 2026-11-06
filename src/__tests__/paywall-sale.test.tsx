/**
 * 결제 화면의 하루 이용권 주인공 카드와 타임 세일 — 가짜 상품 목록으로 확인한다 (웹에는 스토어가 없어 세일이 안 보인다).
 * - 「{이름}님을 위한 하루 무제한 이용권」, 「지금 시작하면 내일 오후 3:42까지 무제한」(이용권이 실제로 끝나는 시각)
 * - 특가 상품과 정가 하루 이용권이 둘 다 스토어에서 확인될 때만 세일을 연다. 처음 볼 때 시작해 30분, 다시 열어도 처음부터 돌지 않음
 * - 30분이 지나면 정가로 돌아가고 7일 동안 다시 열리지 않는다. 세일 중에 사면 특가 상품을 산다
 */
import { act } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';

import Paywall from '@/app/paywall';
import { track } from '@/lib/analytics';
import { purchasePlan } from '@/lib/billing/iap';
import { EMPTY_WALLET } from '@/lib/billing/quota';
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
jest.mock('@/lib/haptics', () => ({ haptic: { thud: jest.fn(), tap: jest.fn(), select: jest.fn(), celebrate: jest.fn() } }));
jest.mock('@/lib/billing/iap', () => ({
  billingSupported: true,
  purchasePlan: jest.fn(),
  restorePremium: jest.fn(),
  lastStoreProblem: () => null,
}));

const DAY_REGULAR = { plan: 'day', productId: 'mylovecoach.pass.day', displayPrice: '₩2,700', available: true, price: 2700, currency: 'KRW' };
const DAY_SALE = { plan: 'day', productId: 'mylovecoach.pass.day.sale', displayPrice: '₩1,900', available: true, price: 1900, currency: 'KRW', sale: true };
const OTHERS = [
  { plan: 'weekly', productId: 'mylovecoach.premium.weekly', displayPrice: '₩9,900', available: true },
  { plan: 'lifetime', productId: 'mylovecoach.premium.lifetime', displayPrice: '₩29,800', available: true },
];
let mockProducts: unknown[] = [];
// 상품 목록만 가짜로 — 정가를 고르는 onSalePrice 는 진짜 함수를 쓴다 (특가 상품을 정가로 잘못 고르지 않는지까지 확인)
jest.mock('@/hooks/use-plan-products', () => ({
  ...jest.requireActual('@/hooks/use-plan-products'),
  usePlanProducts: () => mockProducts,
}));

const MIN = 60 * 1000;
const DAY = 24 * 60 * MIN;
const T = new Date(2026, 10, 6, 15, 42, 10).getTime(); // 11월 6일 오후 3:42
let now = T;
const USER = { name: '수연', gender: 'female' as const, style: [], defaultTone: 'natural' as const, emoji: 'on' as const, createdAt: 1 };

let renderer: ReactTestRenderer | undefined;
function mount() {
  act(() => {
    renderer = create(
      <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
        <Paywall />
      </SafeAreaProvider>,
    );
  });
}
function unmount() {
  act(() => renderer?.unmount());
  renderer = undefined;
}
const textOf = (node: ReactTestInstance): string => node.children.map((c) => (typeof c === 'string' ? c : textOf(c))).join('');
const screen = () => textOf(renderer!.root);
/** 결제 버튼 (맨 아래 그라데이션 버튼) */
const buyButton = () => renderer!.root.findAll((n) => typeof n.props.onPress === 'function' && /시작하기|충전하기/.test(textOf(n)))[0];
const tracked = track as jest.Mock;

beforeEach(() => {
  now = T;
  jest.spyOn(Date, 'now').mockImplementation(() => now);
  tracked.mockClear();
  (purchasePlan as jest.Mock).mockReset();
  mockProducts = [DAY_REGULAR, ...OTHERS, DAY_SALE];
  useAppStore.setState({ saleOfferStartedAt: null, wallet: EMPTY_WALLET, premium: null, team: null, member: null, user: USER });
});
afterEach(() => {
  if (renderer) unmount();
  jest.restoreAllMocks();
});

it('주인공 카드: 이름·실제로 끝나는 시각·가격', () => {
  mockProducts = [DAY_REGULAR, ...OTHERS];
  mount();
  const text = screen();
  expect(text).toContain('수연님을 위한');
  expect(text).toContain('하루 무제한 이용권');
  expect(text).toContain('지금 시작하면 내일 오후 3:42까지 무제한');
  expect(text).toContain('2,700원');
  expect(textOf(buyButton())).toBe('하루 무제한 시작하기');
});

it('이름이 없으면 「오늘 하루 무제한 이용권」', () => {
  useAppStore.setState({ user: null });
  mockProducts = [DAY_REGULAR, ...OTHERS];
  mount();
  expect(screen()).toContain('오늘 하루무제한 이용권');
  expect(screen()).not.toContain('님을 위한');
});

it('특가·정가 하루 이용권이 둘 다 있으면 처음 볼 때 30분 세일을 시작한다 — 취소선 정가·특가·할인율', () => {
  mount();
  expect(useAppStore.getState().saleOfferStartedAt).toBe(T);
  const text = screen();
  expect(text).toContain('특가 마감까지');
  expect(text).toContain('30:00');
  expect(text).toContain('2,700원');
  expect(text).toContain('1,900원');
  expect(text).toContain('29%');
  expect(textOf(buyButton())).toBe('특가로 하루 무제한 시작하기');
  expect(tracked).toHaveBeenCalledWith('sale_offer_start', { reason: 'quota' });
  expect(tracked).toHaveBeenCalledWith('sale_offer_view', { reason: 'quota', left: 1800 });
});

it('세일 중에 사면 특가 상품을 산다 — 하루 이용권처럼 충전되고 축하 화면', async () => {
  (purchasePlan as jest.Mock).mockResolvedValue({ status: 'granted', plan: 'day' });
  mount();
  await act(async () => {
    await buyButton().props.onPress();
  });
  expect(purchasePlan).toHaveBeenCalledWith(expect.objectContaining({ plan: 'day', productId: 'mylovecoach.pass.day.sale' }));
  expect(tracked).toHaveBeenCalledWith('purchase_start', { plan: 'day', sale: true });
  expect(tracked).toHaveBeenCalledWith('purchase_granted', { plan: 'day', sale: true });
  expect(screen()).toContain('하루 무제한 시작!');
  // 결제로 끝났으니 「결제 없이 닫음」으로 세지 않는다
  unmount();
  expect(tracked.mock.calls.map((c) => c[0])).not.toContain('paywall_close');
});

it('결제 화면을 다시 열어도 타이머가 처음부터 돌지 않는다', () => {
  mount();
  unmount();
  now = T + 12 * MIN;
  mount();
  expect(useAppStore.getState().saleOfferStartedAt).toBe(T);
  expect(screen()).toContain('18:00');
  expect(tracked.mock.calls.filter((c) => c[0] === 'sale_offer_start')).toHaveLength(1);
});

it('30분이 지나면 정가로 돌아가고 정가 상품을 산다 — 7일 동안 다시 열리지 않는다', async () => {
  useAppStore.setState({ saleOfferStartedAt: T - 31 * MIN });
  (purchasePlan as jest.Mock).mockResolvedValue({ status: 'cancelled' });
  mount();
  expect(screen()).not.toContain('특가');
  expect(textOf(buyButton())).toBe('하루 무제한 시작하기');
  await act(async () => {
    await buyButton().props.onPress();
  });
  expect(purchasePlan).toHaveBeenCalledWith(expect.objectContaining({ productId: 'mylovecoach.pass.day' }));
  expect(tracked).toHaveBeenCalledWith('purchase_start', { plan: 'day' });
  unmount();
  now = T + 6 * DAY;
  mount();
  expect(useAppStore.getState().saleOfferStartedAt).toBe(T - 31 * MIN);
  expect(screen()).not.toContain('특가 마감까지');
});

it('7일이 지나면 다음에 볼 때 다시 30분', () => {
  useAppStore.setState({ saleOfferStartedAt: T - 8 * DAY });
  mount();
  expect(useAppStore.getState().saleOfferStartedAt).toBe(T);
  expect(screen()).toContain('30:00');
});

it('보고 있는 동안 마감되면 정가로 바뀐다', async () => {
  useAppStore.setState({ saleOfferStartedAt: T - 30 * MIN + 1500 });
  mount();
  expect(screen()).toContain('00:01');
  now = T + 2000;
  // 1초마다 다시 그린다
  await act(async () => {
    await new Promise((r) => setTimeout(r, 1100));
  });
  expect(screen()).not.toContain('특가 마감까지');
  expect(textOf(buyButton())).toBe('하루 무제한 시작하기');
});

it('화면은 특가인데 누르는 순간 마감이 지났으면 정가 결제창을 열지 않고 알린 뒤 정가로 바꾼다', async () => {
  useAppStore.setState({ saleOfferStartedAt: T - 30 * MIN + 1500 });
  mount();
  expect(textOf(buyButton())).toBe('특가로 하루 무제한 시작하기');
  now = T + 2000;
  await act(async () => {
    await buyButton().props.onPress();
  });
  expect(purchasePlan).not.toHaveBeenCalled();
  expect(tracked).toHaveBeenCalledWith('sale_offer_missed', { reason: 'quota' });
  expect(screen()).toContain('특가가 방금 끝났어요');
  expect(screen()).not.toContain('특가 마감까지');
  expect(textOf(buyButton())).toBe('하루 무제한 시작하기');
});

it('특가 안내: 7일에 한 번, 30분', () => {
  mount();
  expect(screen()).toContain('특가는 7일에 한 번, 30분 동안 열려요');
});

it('특가 상품이 스토어에 없으면 세일을 보여 주지도 시작하지도 않는다', () => {
  mockProducts = [DAY_REGULAR, ...OTHERS, { ...DAY_SALE, available: false }];
  mount();
  expect(useAppStore.getState().saleOfferStartedAt).toBeNull();
  expect(screen()).not.toContain('특가');
  expect(screen()).toContain('/ 24시간');
});

it('정가 하루 이용권이 스토어에 없으면 특가만 있어도 세일을 열지 않는다', () => {
  mockProducts = [...OTHERS, DAY_SALE];
  mount();
  expect(useAppStore.getState().saleOfferStartedAt).toBeNull();
  expect(screen()).not.toContain('특가');
  expect(screen()).not.toContain('1,900');
});

it('특가가 정가보다 싸지 않으면 세일을 열지 않는다 (거짓 할인 방지)', () => {
  mockProducts = [DAY_REGULAR, ...OTHERS, { ...DAY_SALE, price: 2700, displayPrice: '₩2,700' }];
  mount();
  expect(useAppStore.getState().saleOfferStartedAt).toBeNull();
  expect(screen()).not.toContain('특가');
});

it('하루 이용권을 이미 쓰는 중이면 세일을 시작하지 않고, 이어 붙인 끝 시각을 보여 준다', () => {
  useAppStore.setState({ wallet: { ...EMPTY_WALLET, passUntil: T + 5 * 60 * MIN } });
  mount();
  expect(useAppStore.getState().saleOfferStartedAt).toBeNull();
  expect(screen()).toContain('지금 연장하면 내일 오후 8:42까지 무제한');
});

it('평생권을 고르면 특가와 상관없이 평생권을 산다', async () => {
  (purchasePlan as jest.Mock).mockResolvedValue({ status: 'cancelled' });
  mount();
  const lifetime = renderer!.root.findAll((n) => n.props.accessibilityRole === 'radio' && textOf(n).includes('평생권'))[0];
  act(() => lifetime.props.onPress());
  expect(textOf(buyButton())).toBe('평생권 시작하기');
  await act(async () => {
    await buyButton().props.onPress();
  });
  expect(purchasePlan).toHaveBeenCalledWith(expect.objectContaining({ plan: 'lifetime' }));
  expect(tracked).toHaveBeenCalledWith('purchase_start', { plan: 'lifetime' });
});
