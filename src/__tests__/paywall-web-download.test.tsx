/**
 * 웹 결제 화면 — 웹에는 결제가 없으니 보고 있는 기기에 맞는 스토어로 앱 받기를 권한다.
 * 아이폰·아이패드는 App Store, 안드로이드는 Google Play 를 큰 버튼으로, 컴퓨터는 둘을 나란히.
 */
import { act } from 'react';
import { Linking, Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';

import Paywall from '@/app/paywall';
import { Button } from '@/components/ui/button';
import { track } from '@/lib/analytics';
import { APP_STORE_URL, PLAY_STORE_URL, downloadDevice } from '@/lib/app-download';

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
jest.mock('@expo/vector-icons', () => ({ Ionicons: Object.assign(() => null, { glyphMap: {} }) }));
jest.mock('@/lib/analytics', () => ({ track: jest.fn() }));
jest.mock('@/lib/supabase', () => ({ authAvailable: false }));
jest.mock('@/components/ui/toast', () => ({ useToast: () => ({ show: jest.fn() }) }));
jest.mock('@/lib/haptics', () => ({ haptic: { thud: jest.fn(), tap: jest.fn(), select: jest.fn(), celebrate: jest.fn() } }));
// 웹처럼 결제 기능이 없는 상태
jest.mock('@/lib/billing/iap', () => ({
  billingSupported: false,
  purchasePlan: jest.fn(),
  restorePremium: jest.fn(),
}));
jest.mock('@/hooks/use-plan-products', () => ({ usePlanProducts: () => undefined, onSalePrice: () => null }));

const UA = {
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  // iPadOS 사파리 기본값은 맥처럼 보인다 (터치로 가른다)
  ipadDesktop: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
  android: 'Mozilla/5.0 (Linux; Android 14; SM-S921N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36',
  windows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
};

const tracked = track as jest.Mock;
const navigatorBefore = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
let restores: (() => void)[] = [];

/** 웹 브라우저로 보는 것처럼 — 기기 이름(user agent)과 터치 지점 수 */
function onWeb(userAgent: string, maxTouchPoints = 0) {
  const os = jest.replaceProperty(Platform, 'OS', 'web');
  Object.defineProperty(globalThis, 'navigator', { configurable: true, writable: true, value: { userAgent, maxTouchPoints } });
  restores.push(() => os.restore());
}

let renderer: ReactTestRenderer | undefined;
function mount() {
  act(() => {
    renderer = create(
      <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
        <Paywall />
      </SafeAreaProvider>,
    );
  });
  return renderer!;
}

const textOf = (node: ReactTestInstance): string => node.children.map((c) => (typeof c === 'string' ? c : textOf(c))).join('');
const buttons = () => renderer!.root.findAllByType(Button);
const titles = () => buttons().map((b) => b.props.title as string);
const screenText = () => textOf(renderer!.root);

let openURL: jest.SpyInstance;
beforeEach(() => {
  tracked.mockClear();
  openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
});

afterEach(() => {
  act(() => renderer?.unmount());
  renderer = undefined;
  openURL.mockRestore();
  restores.forEach((fn) => fn());
  restores = [];
  if (navigatorBefore) Object.defineProperty(globalThis, 'navigator', navigatorBefore);
  else delete (globalThis as { navigator?: unknown }).navigator;
});

it('아이폰으로 보면 App Store 버튼 하나를 큰 버튼으로 보여 준다', () => {
  onWeb(UA.iphone, 5);
  mount();
  expect(titles()).toEqual(['App Store에서 앱 받기']);
  expect(buttons()[0].props.variant ?? 'primary').toBe('primary');
  expect(screenText()).not.toMatch(/Google ?Play/);
  expect(screenText()).toContain('매일 무료 코칭');
});

it('맥처럼 보이는 아이패드(터치 가능)도 App Store 로 안내한다', () => {
  onWeb(UA.ipadDesktop, 5);
  mount();
  expect(titles()).toEqual(['App Store에서 앱 받기']);
});

it('안드로이드로 보면 Google Play 버튼 하나를 큰 버튼으로 보여 준다', () => {
  onWeb(UA.android, 5);
  mount();
  expect(titles()).toEqual(['Google Play에서 앱 받기']);
  expect(buttons()[0].props.variant ?? 'primary').toBe('primary');
  expect(screenText()).not.toContain('App Store');
});

it('컴퓨터로 보면 두 스토어를 나란히 보여 주고 휴대폰으로 열어 보라고 권한다', () => {
  onWeb(UA.windows);
  mount();
  expect(titles()).toEqual(['App Store', 'Google Play']);
  expect(screenText()).toContain('휴대폰에서 이 페이지를 열면');
  // 터치가 없는 진짜 맥도 컴퓨터
  act(() => renderer?.unmount());
  onWeb(UA.ipadDesktop, 0);
  mount();
  expect(titles()).toEqual(['App Store', 'Google Play']);
});

it('앱 받기를 누르면 그 스토어를 열고 app_download_click 을 남긴다', () => {
  onWeb(UA.android, 5);
  mount();
  act(() => buttons()[0].props.onPress());
  expect(tracked).toHaveBeenCalledWith('app_download_click', { store: 'android', reason: 'quota' });
  expect(openURL).toHaveBeenCalledWith(PLAY_STORE_URL);
});

it('컴퓨터에서 App Store 를 누르면 ios 로 남긴다', () => {
  onWeb(UA.windows);
  mount();
  act(() => buttons()[0].props.onPress());
  expect(tracked).toHaveBeenCalledWith('app_download_click', { store: 'ios', reason: 'quota' });
  expect(openURL).toHaveBeenCalledWith(APP_STORE_URL);
});

it('앱 안(결제 모듈이 없는 개발용 빌드)에서는 그 기기의 스토어만 고른다 — 아이폰 앱에 Google Play 가 나오지 않게', () => {
  const os = jest.replaceProperty(Platform, 'OS', 'ios');
  restores.push(() => os.restore());
  expect(downloadDevice()).toBe('ios');
  os.replaceValue('android');
  expect(downloadDevice()).toBe('android');
});
