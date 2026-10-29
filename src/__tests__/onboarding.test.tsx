/**
 * 처음 실행 흐름 — 사용법 소개(세 장) → 이용약관 동의 → 「나에 대해 알려주세요」(건너뛰기 가능) → 첫 캡처 화면.
 * 연애 연습 숨김(마이 → 추가 기능에서 켜기), 별점 요청 조건, 예전 이용자 저장값 읽기도 함께 본다.
 */
import { act } from 'react';
import { Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';

import AboutMe from '@/app/about-me';
import Index from '@/app/index';
import Welcome from '@/app/welcome';
import { track } from '@/lib/analytics';
import { REVIEW_GAP_MS, REVIEW_MIN_WINS, shouldAskReview } from '@/lib/store-review';
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
  APP_CONFIG: { apiUrl: 'https://api.example', apiSameOrigin: false, apiToken: '', supportEmail: 'contact@craving.win', privacyUrl: 'https://site.example/privacy.html', termsUrl: 'https://site.example/terms.html' },
}));
const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true };
let mockRedirect: string | null = null;
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => ({}),
  useFocusEffect: () => {},
  Redirect: ({ href }: { href: string }) => {
    mockRedirect = href;
    return null;
  },
}));
jest.mock('react-native-reanimated', () => {
  const RN = jest.requireActual('react-native');
  const { useRef } = jest.requireActual('react');
  const entering: Record<string, () => unknown> = {};
  for (const name of ['delay', 'duration', 'springify', 'damping']) entering[name] = () => entering;
  const target = (value: unknown) => value;
  const last = (...values: unknown[]) => values[values.length - 1];
  return {
    __esModule: true,
    default: { View: RN.View, Text: RN.Text, createAnimatedComponent: target },
    FadeIn: entering,
    FadeOut: entering,
    FadeInDown: entering,
    FadeInUp: entering,
    useSharedValue: (value: unknown) => useRef({ value }).current,
    useAnimatedStyle: (style: () => object) => style(),
    withSequence: last,
    withTiming: target,
    withRepeat: target,
    withSpring: target,
  };
});
jest.mock('@expo/vector-icons', () => ({ Ionicons: Object.assign(() => null, { glyphMap: {} }) }));
jest.mock('expo-linear-gradient', () => {
  const { View } = jest.requireActual('react-native');
  return { LinearGradient: View };
});
jest.mock('@/components/ui/button', () => {
  const { createElement } = jest.requireActual('react');
  const { Text: RNText } = jest.requireActual('react-native');
  return {
    Button: ({ title, onPress, disabled }: { title: string; onPress?: () => void; disabled?: boolean }) =>
      createElement(RNText, { accessibilityRole: 'button', accessibilityState: { disabled: Boolean(disabled) }, onPress: disabled ? undefined : onPress }, title),
  };
});
jest.mock('@/lib/haptics', () => ({ haptic: new Proxy({}, { get: () => () => {} }), setHapticsEnabled: () => {} }));
jest.mock('@/lib/analytics', () => ({ track: jest.fn() }));

const METRICS = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } };
let tree: ReactTestRenderer | null = null;
function mount(element: React.ReactElement): ReactTestRenderer {
  act(() => {
    tree = create(<SafeAreaProvider initialMetrics={METRICS}>{element}</SafeAreaProvider>);
  });
  return tree as unknown as ReactTestRenderer;
}
const textOf = (node: ReactTestInstance): string => node.children.map((c) => (typeof c === 'string' ? c : textOf(c))).join('');
const texts = (t: ReactTestRenderer) => t.root.findAllByType(Text).map(textOf).join('\n');
function pressable(t: ReactTestRenderer, label: string): ReactTestInstance {
  const found = t.root.findAll((n) => typeof n.props.onPress === 'function' && textOf(n).includes(label));
  if (!found.length) throw new Error(`「${label}」 버튼이 없어요`);
  return found[found.length - 1];
}
const byLabel = (t: ReactTestRenderer, label: string) => t.root.findAll((n) => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function')[0];

beforeAll(async () => {
  for (let i = 0; i < 50 && !useAppStore.persist.hasHydrated(); i += 1) {
    await act(async () => {
      await new Promise<void>((resolve) => setImmediate(resolve));
    });
  }
});

beforeEach(() => {
  jest.clearAllMocks();
  mockRedirect = null;
  useAppStore.getState().resetAll();
  useAppStore.setState({ hydrated: true, pendingDeletion: null, user: null, crushes: {}, onboardingSeen: false, termsAgreedAt: null, practiceEnabled: false, reviewWins: 0, reviewAsks: [] });
});
afterEach(() => {
  act(() => tree?.unmount());
  tree = null;
});

describe('처음 열면', () => {
  it('처음이면 소개로, 소개를 본 사람은 첫 캡처 화면으로, 시작한 사람은 홈으로', () => {
    mount(<Index />);
    expect(mockRedirect).toBe('/welcome');
    act(() => {
      useAppStore.setState({ onboardingSeen: true });
    });
    expect(mockRedirect).toBe('/start');
    act(() => {
      useAppStore.setState({ user: { name: '', gender: 'other', style: [], defaultTone: 'natural', createdAt: 1 } });
    });
    expect(mockRedirect).toBe('/(tabs)');
  });
});

describe('사용법 소개', () => {
  it('세 장에 스토어와 같은 문장이 있고, 「건너뛰기」는 첫 캡처 화면으로 간다', () => {
    const t = mount(<Welcome />);
    const shown = texts(t);
    expect(shown).toContain('캡처 한 장이면 끝');
    expect(shown).toContain('답장 3가지 추천');
    expect(shown).toContain('호감 온도까지');
    act(() => byLabel(t, '소개 건너뛰기').props.onPress());
    expect(useAppStore.getState().onboardingSeen).toBe(true);
    expect(mockRouter.replace).toHaveBeenCalledWith('/start');
    expect(track).toHaveBeenCalledWith('onboarding', expect.objectContaining({ step: 'slides', action: 'skip' }));
  });

  it('마지막 장의 「시작하기」는 이용약관 동의 창을 띄우고, 동의하면 「나에 대해」로 간다', () => {
    const t = mount(<Welcome />);
    act(() => pressable(t, '다음').props.onPress());
    act(() => pressable(t, '다음').props.onPress());
    act(() => pressable(t, '시작하기').props.onPress());
    expect(texts(t)).toContain('시작하기 전에 확인해 주세요');
    expect(mockRouter.replace).not.toHaveBeenCalled();
    act(() => pressable(t, '모두 동의하고 시작').props.onPress());
    expect(useAppStore.getState().termsAgreedAt).not.toBeNull();
    expect(useAppStore.getState().onboardingSeen).toBe(true);
    expect(mockRouter.replace).toHaveBeenCalledWith('/about-me');
    expect(track).toHaveBeenCalledWith('start_consent', { all: true, content: true, mode: 'onboarding' });
  });

  it('이미 동의한 기기는 동의 창 없이 「나에 대해」로 간다', () => {
    useAppStore.setState({ termsAgreedAt: Date.now() });
    const t = mount(<Welcome />);
    act(() => pressable(t, '다음').props.onPress());
    act(() => pressable(t, '다음').props.onPress());
    act(() => pressable(t, '시작하기').props.onPress());
    expect(texts(t)).not.toContain('시작하기 전에 확인해 주세요');
    expect(mockRouter.replace).toHaveBeenCalledWith('/about-me');
  });
});

describe('나에 대해 알려주세요', () => {
  it('건너뛰면 아무것도 저장하지 않고 첫 캡처 화면으로', () => {
    const t = mount(<AboutMe />);
    act(() => byLabel(t, '나에 대해 알려주기 건너뛰기').props.onPress());
    expect(useAppStore.getState().user).toBeNull();
    expect(mockRouter.replace).toHaveBeenCalledWith('/start');
    expect(track).toHaveBeenCalledWith('onboarding', { step: 'profile', action: 'skip', filled: 0 });
  });

  it('적은 만큼 내 프로필에 저장하고 첫 캡처 화면으로 (추구미는 3개까지)', () => {
    const t = mount(<AboutMe />);
    act(() => t.root.findByProps({ accessibilityLabel: '이름 또는 별명' }).props.onChangeText('  지은 '));
    act(() => pressable(t, '여성').props.onPress());
    act(() => t.root.findByProps({ accessibilityLabel: '나이' }).props.onChangeText('2a5'));
    for (const v of ['다정한', '유쾌한', '솔직한', '센스 있는']) act(() => pressable(t, v).props.onPress());
    act(() => pressable(t, '썸 끝내고 확실하게').props.onPress());
    act(() => pressable(t, '다음').props.onPress());
    const user = useAppStore.getState().user;
    expect(user).toEqual(expect.objectContaining({ name: '지은', gender: 'female', age: 25, goal: '썸 끝내고 확실하게' }));
    expect(user?.vibes).toEqual(['유쾌한', '솔직한', '센스 있는']);
    expect(mockRouter.replace).toHaveBeenCalledWith('/start');
  });
});

describe('별점 요청', () => {
  const now = 1_800_000_000_000;
  it('좋은 순간이 쌓인 뒤에, 60일 간격으로, 1년에 3번까지만', () => {
    expect(shouldAskReview(REVIEW_MIN_WINS - 1, [], now)).toBe(false);
    expect(shouldAskReview(REVIEW_MIN_WINS, [], now)).toBe(true);
    expect(shouldAskReview(10, [now - REVIEW_GAP_MS + 1000], now)).toBe(false);
    expect(shouldAskReview(10, [now - REVIEW_GAP_MS - 1000], now)).toBe(true);
    const day = 24 * 60 * 60 * 1000;
    expect(shouldAskReview(10, [now - 300 * day, now - 200 * day, now - 100 * day], now)).toBe(false);
    expect(shouldAskReview(10, [now - 400 * day, now - 200 * day, now - 100 * day], now)).toBe(true);
  });
});

describe('예전 이용자 저장값', () => {
  const merge = (saved: object) => useAppStore.persist.getOptions().merge!(saved, useAppStore.getState()) as ReturnType<typeof useAppStore.getState>;
  it('연습 기록이 있으면 연애 연습을 켠 채로, 쓰던 사람은 소개를 다시 보지 않는다', () => {
    const withPractice = merge({ deviceId: 'd_1', practice: { p1: { id: 'p1' } }, user: { name: '', gender: 'other', style: [], defaultTone: 'natural', createdAt: 1 } });
    expect(withPractice.practiceEnabled).toBe(true);
    expect(withPractice.onboardingSeen).toBe(true);
    const fresh = merge({ deviceId: 'd_2' });
    expect(fresh.practiceEnabled).toBe(false);
    expect(fresh.onboardingSeen).toBe(false);
    const turnedOff = merge({ deviceId: 'd_3', practice: { p1: { id: 'p1' } }, practiceEnabled: false });
    expect(turnedOff.practiceEnabled).toBe(false);
  });
});
