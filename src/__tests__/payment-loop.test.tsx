/**
 * 결제 루프 (2026-11-17 — 11/12 회의 10·11번, 사장님 결정)
 * - A/B 「처음 5분 무제한」: 실험군은 첫 코칭이 끝난 순간부터 5분 동안 횟수를 깎지 않는다(첫 코칭은 1회 깎임). 대조군·실험 전 기기는 그대로
 * - 무료를 다 써서 막히면 타임어택 특가 팝업(/sale) — 비회원은 가입을 먼저(결제 화면), 7일 쉬는 중이면 결제 화면
 * - 팝업이 뜨는 순간 10분 특가가 시작되고, 팝업에서 바로 특가 상품을 산다. 특가가 없으면 결제 화면으로 바뀐다. 마감 뒤에는 특가로 결제하지 않는다
 * - 채팅 입력창 안내 줄은 체험 남은 시간을 스스로 줄여 보여 준다
 */
import { act } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';

import SalePopup from '@/app/sale';
import { Composer } from '@/components/coach/composer';
import { track } from '@/lib/analytics';
import { currentQuota, isUnlimited } from '@/lib/billing/gate';
import { purchasePlan } from '@/lib/billing/iap';
import { paywallTarget, salePopupEligible } from '@/lib/billing/paywall-route';
import { INTRO_FREE_MS } from '@/lib/billing/plans';
import { EMPTY_USAGE, EMPTY_WALLET, quotaLabel, quotaStatus } from '@/lib/billing/quota';
import { saleAudience, SALE_COOLDOWN_MS, SALE_WINDOW_MS } from '@/lib/billing/sale';
import { introUntil, useAppStore } from '@/store/app-store';

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
const mockRouter = { canGoBack: () => true, back: jest.fn(), replace: jest.fn(), push: jest.fn() };
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => ({ reason: 'quota' }),
  useIsFocused: () => true,
}));
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
    default: { View: RN.View, Text: RN.Text, ScrollView: RN.ScrollView, createAnimatedComponent: target },
    FadeIn: entering,
    FadeOut: entering,
    FadeInDown: entering,
    FadeInUp: entering,
    SlideInDown: entering,
    ZoomIn: entering,
    Easing: { out: () => same, in: () => same, inOut: () => same, back: () => same, cubic: same, quad: same, ease: same, linear: same, sin: same },
    useSharedValue: (value: unknown) => useRef({ value }).current,
    useAnimatedStyle: (style: () => object) => style(),
    useAnimatedReaction: () => {},
    useReducedMotion: () => false,
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
jest.mock('expo-linear-gradient', () => {
  const { View } = jest.requireActual('react-native');
  return { LinearGradient: View };
});
jest.mock('@/lib/analytics', () => ({ track: jest.fn() }));
let mockAuth = false;
jest.mock('@/lib/supabase', () => ({
  get authAvailable() {
    return mockAuth;
  },
}));
jest.mock('@/components/fx/celebration', () => ({ useCelebrate: () => jest.fn() }));
jest.mock('@/lib/haptics', () => ({ haptic: new Proxy({}, { get: () => () => {} }) }));
jest.mock('@/lib/billing/iap', () => ({
  billingSupported: true,
  purchasePlan: jest.fn(),
  restorePremium: jest.fn(),
  lastStoreProblem: () => null,
}));
const REGULAR = { plan: 'day', productId: 'mylovecoach.pass.day', displayPrice: '₩3,900', available: true, price: 3900, currency: 'KRW' };
const SALE = { plan: 'day', productId: 'mylovecoach.pass.day.sale', displayPrice: '₩2,900', available: true, price: 2900, currency: 'KRW', sale: true };
let mockProducts: unknown[] | null = [REGULAR, SALE];
jest.mock('@/hooks/use-plan-products', () => ({
  ...jest.requireActual('@/hooks/use-plan-products'),
  usePlanProducts: () => mockProducts,
}));

const MIN = 60 * 1000;
const T = new Date(2026, 10, 17, 21, 0, 0).getTime();
let now = T;
const tracked = track as jest.Mock;

beforeEach(() => {
  now = T;
  mockAuth = false;
  mockProducts = [REGULAR, SALE];
  jest.spyOn(Date, 'now').mockImplementation(() => now);
  tracked.mockClear();
  mockRouter.replace.mockClear();
  mockRouter.back.mockClear();
  (purchasePlan as jest.Mock).mockReset();
  useAppStore.setState({
    usage: EMPTY_USAGE,
    wallet: EMPTY_WALLET,
    premium: null,
    team: null,
    member: null,
    saleOfferStartedAt: null,
    introArm: 'off',
    introStartedAt: null,
    user: { name: '민준', gender: 'male', style: [], defaultTone: 'natural', emoji: 'on', createdAt: 1 },
  });
});
afterEach(() => jest.restoreAllMocks());

describe('A/B 「처음 5분 무제한」', () => {
  it('실험군: 첫 코칭은 1회 깎이고 그 순간부터 5분 동안은 깎지 않는다 → 5분 뒤 다시 깎인다', () => {
    useAppStore.setState({ introArm: 'on' });
    useAppStore.getState().consumeQuota();
    expect(useAppStore.getState().usage.total).toBe(1);
    expect(useAppStore.getState().introStartedAt).toBe(T);
    expect(tracked).toHaveBeenCalledWith('intro_start', { min: INTRO_FREE_MS / MIN });
    expect(currentQuota(T + 1000)).toMatchObject({ kind: 'intro', until: T + INTRO_FREE_MS });
    expect(isUnlimited(currentQuota(T + 1000))).toBe(true);

    now = T + 4 * MIN;
    useAppStore.getState().consumeQuota();
    useAppStore.getState().consumeQuota();
    expect(useAppStore.getState().usage.total).toBe(1);

    now = T + INTRO_FREE_MS;
    expect(currentQuota(now).kind).not.toBe('intro');
    useAppStore.getState().consumeQuota();
    expect(useAppStore.getState().usage.total).toBe(2);
    // 체험은 한 번뿐 — 다시 시작하지 않는다
    expect(useAppStore.getState().introStartedAt).toBe(T);
    expect(tracked.mock.calls.filter((c) => c[0] === 'intro_start')).toHaveLength(1);
  });

  it('대조군·실험 전 기기는 지금 규칙 그대로', () => {
    for (const arm of ['off', 'na'] as const) {
      useAppStore.setState({ introArm: arm, introStartedAt: null, usage: EMPTY_USAGE });
      useAppStore.getState().consumeQuota();
      useAppStore.getState().consumeQuota();
      expect(useAppStore.getState().usage.total).toBe(2);
      expect(useAppStore.getState().introStartedAt).toBeNull();
      expect(introUntil(useAppStore.getState())).toBe(0);
    }
  });

  it('체험 중 상태·문구, 체험 중에는 특가를 열지 않는다', () => {
    const s = quotaStatus(null, EMPTY_USAGE, T, EMPTY_WALLET, null, undefined, T + 3 * MIN);
    expect(s).toEqual({ kind: 'intro', remaining: Infinity, until: T + 3 * MIN });
    expect(quotaLabel(s)).toContain('무제한 체험 중');
    expect(saleAudience('intro')).toBe(false);
    // 하루 이용권이 있으면 그쪽이 먼저
    expect(quotaStatus(null, EMPTY_USAGE, T, { ...EMPTY_WALLET, passUntil: T + MIN }, null, undefined, T + 3 * MIN).kind).toBe('pass');
  });
});

describe('막혔을 때 어디로 (paywall-route)', () => {
  const exhaust = () => useAppStore.setState({ usage: { total: 99, day: '2026-11-17', dayCount: 99 } });

  it('무료를 다 써서 막혔으면 특가 팝업 — 막힌 게 아니면 결제 화면', () => {
    exhaust();
    expect(paywallTarget('quota')).toEqual({ pathname: '/sale', params: { reason: 'quota' } });
    expect(paywallTarget('report').pathname).toBe('/sale');
    expect(paywallTarget('practice').pathname).toBe('/sale');
    expect(paywallTarget('my').pathname).toBe('/paywall');
    expect(paywallTarget('banner').pathname).toBe('/paywall');
    expect(paywallTarget('renew').pathname).toBe('/paywall');
  });

  it('아직 횟수가 남았거나, 7일 쉬는 중이면 결제 화면', () => {
    expect(salePopupEligible()).toBe(false);
    exhaust();
    useAppStore.setState({ saleOfferStartedAt: T - SALE_WINDOW_MS - MIN });
    expect(paywallTarget('quota').pathname).toBe('/paywall');
    // 쉬는 기간이 지나면 다시 팝업
    useAppStore.setState({ saleOfferStartedAt: T - SALE_WINDOW_MS - SALE_COOLDOWN_MS });
    expect(paywallTarget('quota').pathname).toBe('/sale');
    // 특가 진행 중이면 팝업(남은 시간 그대로)
    useAppStore.setState({ saleOfferStartedAt: T - MIN });
    expect(paywallTarget('quota').pathname).toBe('/sale');
  });

  it('가입을 쓸 수 있는 빌드의 비회원은 가입(무료 보너스)을 먼저 — 결제 화면', () => {
    mockAuth = true;
    exhaust();
    expect(paywallTarget('quota').pathname).toBe('/paywall');
    useAppStore.setState({ member: { provider: 'kakao', nickname: '민준', joinedAt: 1, userId: 'u1' } as never });
    expect(paywallTarget('quota').pathname).toBe('/sale');
  });
});

describe('타임어택 특가 팝업 (/sale)', () => {
  let renderer: ReactTestRenderer | undefined;
  const mount = () =>
    act(() => {
      renderer = create(
        <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
          <SalePopup />
        </SafeAreaProvider>,
      );
    });
  const textOf = (node: ReactTestInstance): string => node.children.map((c) => (typeof c === 'string' ? c : textOf(c))).join('');
  const screen = () => textOf(renderer!.root);
  const cta = () => renderer!.root.findAll((n) => typeof n.props.onPress === 'function' && /바로 이어서 하기/.test(textOf(n)))[0];
  afterEach(() => {
    if (renderer) act(() => renderer!.unmount());
    renderer = undefined;
  });

  it('뜨는 순간 10분 특가가 시작되고 남은 시간·정가 취소선·특가·할인율이 보인다', () => {
    mount();
    expect(useAppStore.getState().saleOfferStartedAt).toBe(T);
    expect(tracked).toHaveBeenCalledWith('sale_offer_start', { reason: 'quota', from: 'popup' });
    const text = screen();
    expect(text).toContain('민준님, 무료 코칭을');
    expect(text).toContain('10:00');
    expect(text).toContain('3,900원');
    expect(text).toContain('2,900원');
    expect(text).toContain('25%');
    expect(text).toContain('7일에 한 번, 10분만 열려요');
  });

  it('팝업에서 바로 특가 상품을 사고, 결제되면 「하루 무제한 시작!」', async () => {
    (purchasePlan as jest.Mock).mockResolvedValue({ status: 'granted', plan: 'day' });
    mount();
    await act(async () => {
      await cta().props.onPress();
    });
    expect(purchasePlan).toHaveBeenCalledWith(expect.objectContaining({ productId: 'mylovecoach.pass.day.sale' }));
    expect(tracked).toHaveBeenCalledWith('purchase_start', { plan: 'day', sale: true, from: 'popup' });
    expect(screen()).toContain('하루 무제한 시작!');
  });

  it('이미 진행 중이던 특가는 남은 시간 그대로 — 마감 뒤에 누르면 특가로 결제하지 않는다', async () => {
    useAppStore.setState({ saleOfferStartedAt: T - SALE_WINDOW_MS + 30 * 1000 });
    mount();
    expect(screen()).toContain('00:30');
    now = T + 31 * 1000;
    await act(async () => {
      await cta()?.props.onPress();
    });
    expect(purchasePlan).not.toHaveBeenCalled();
  });

  it('스토어에 특가 상품이 없으면 곧바로 결제 화면으로 바뀐다', () => {
    mockProducts = [REGULAR];
    mount();
    expect(mockRouter.replace).toHaveBeenCalledWith({ pathname: '/paywall', params: { reason: 'quota' } });
    expect(tracked).toHaveBeenCalledWith('sale_popup_skip', { reason: 'quota', why: 'no_offer' });
    expect(useAppStore.getState().saleOfferStartedAt).toBeNull();
  });

  it('7일 쉬는 중이면 결제 화면으로', () => {
    useAppStore.setState({ saleOfferStartedAt: T - SALE_WINDOW_MS - MIN });
    mount();
    expect(mockRouter.replace).toHaveBeenCalledWith({ pathname: '/paywall', params: { reason: 'quota' } });
  });
});

describe('채팅 입력창 안내 줄 — 체험 남은 시간', () => {
  it('countdownUntil 이 있으면 「· 05:00 남았어요」를 붙인다', () => {
    let tree: ReactTestRenderer | undefined;
    act(() => {
      tree = create(
        <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
          <Composer
            tone="natural"
            onToneChange={() => {}}
            emoji="on"
            onEmojiChange={() => {}}
            image={null}
            onPickImage={() => {}}
            onClearImage={() => {}}
            onSend={() => {}}
            notice={{ text: '⏱ 처음 5분은 무제한이에요', countdownUntil: T + INTRO_FREE_MS }}
          />
        </SafeAreaProvider>,
      );
    });
    const textOf = (node: ReactTestInstance): string => node.children.map((c) => (typeof c === 'string' ? c : textOf(c))).join('');
    expect(textOf(tree!.root)).toContain('처음 5분은 무제한이에요 · 05:00 남았어요');
    act(() => tree!.unmount());
  });
});
