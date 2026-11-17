/**
 * 첫 화면·홈 (11/12 회의 반영)
 * - 「이렇게 나와요」 예시 상대는 이용자의 이성 — 남성·모름 「민지 누나」, 여성 「준호 선배」, 기타는 호칭 없이 이름만 (1번)
 * - 사용법 안내 첫 장의 「이런 기능도 있어요」 연애 연습 소개 — 아직 못 본 이용자에게만 (3번)
 * - 홈의 남은 무료 표시: A/B 「처음 5분 무제한」 체험 중이면 1초마다 줄어드는 남은 시간, 끝나면 원래 남은 횟수로
 */
import { act } from 'react';
import { Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';

import HomeScreen, { introClock } from '@/app/(tabs)/index';
import Welcome from '@/app/welcome';
import { demoPartner } from '@/components/fx/demo-reel';
import { INTRO_FREE_MS } from '@/lib/billing/plans';
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
// 코치 서버가 있는 빌드처럼 — 무료 횟수 제한이 걸린다
jest.mock('@/lib/config', () => ({
  APP_CONFIG: { apiUrl: 'https://api.example', apiSameOrigin: false, apiToken: '', supportEmail: 'contact@craving.win', privacyUrl: 'https://site.example/privacy.html', termsUrl: 'https://site.example/terms.html' },
}));
const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true };
jest.mock('expo-router', () => ({ useRouter: () => mockRouter, useLocalSearchParams: () => ({}), useFocusEffect: () => {}, useIsFocused: () => true }));
// Reanimated 는 바로 끝나는 흉내로 (consent-screens.test.tsx 와 같은 방식)
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
    SlideInRight: entering,
    SlideOutLeft: entering,
    Easing: { out: () => same, in: () => same, inOut: () => same, cubic: same, quad: same, sin: same, ease: same, linear: same },
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
jest.mock('@/components/ui/button', () => {
  const { createElement } = jest.requireActual('react');
  const { Text: RNText } = jest.requireActual('react-native');
  return {
    Button: ({ title, onPress, disabled }: { title: string; onPress?: () => void; disabled?: boolean }) =>
      createElement(RNText, { accessibilityRole: 'button', accessibilityState: { disabled: Boolean(disabled) }, onPress: disabled ? undefined : onPress }, title),
  };
});
// 영상 자체는 그리지 않고, 상대를 고르는 demoPartner 만 그대로 쓴다
jest.mock('@/components/fx/demo-reel', () => ({ ...jest.requireActual('@/components/fx/demo-reel'), DemoReel: () => null }));
jest.mock('@/components/ui/toast', () => ({ useToast: () => ({ show: jest.fn() }) }));
jest.mock('@/lib/haptics', () => ({ haptic: new Proxy({}, { get: () => () => {} }), setHapticsEnabled: () => {} }));
jest.mock('@/lib/analytics', () => ({ track: jest.fn() }));
jest.mock('@/lib/images', () => ({ pickImage: jest.fn(async () => null), cleanupOrphanImages: jest.fn(), clearImageCaches: jest.fn(), deleteImageQuietly: jest.fn() }));
jest.mock('@/lib/supabase', () => ({ authAvailable: true }));

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
const labels = (t: ReactTestRenderer) => t.root.findAll((n) => typeof n.props.accessibilityLabel === 'string').map((n) => n.props.accessibilityLabel as string);

beforeAll(async () => {
  for (let i = 0; i < 50 && !useAppStore.persist.hasHydrated(); i += 1) {
    await act(async () => {
      await new Promise<void>((resolve) => setImmediate(resolve));
    });
  }
});

beforeEach(() => {
  jest.clearAllMocks();
  useAppStore.getState().resetAll();
  useAppStore.setState({ hydrated: true, pendingDeletion: null, user: null, crushes: {}, onboardingSeen: false, guideSeen: null, termsAgreedAt: null, privacyNoticeSeen: 99, practiceEnabled: false, practiceDotSeen: false, introArm: 'off', introStartedAt: null });
});

afterEach(() => {
  act(() => tree?.unmount());
  tree = null;
  jest.useRealTimers();
});

describe('「이렇게 나와요」 예시 상대 — 이용자의 이성', () => {
  const SAME_SEX_FOR_MALE = ['형', '오빠', '선배'];
  const SAME_SEX_FOR_FEMALE = ['언니', '누나'];

  it('남성·아직 모름이면 여성 상대 「민지 누나」 — 호칭 「누나」·존댓말을 읽는다', () => {
    for (const g of ['male', undefined, null] as const) {
      const p = demoPartner(g);
      expect(p.title).toBe('민지 누나');
      expect(p.thinking).toContain('호칭 「누나」');
      expect(p.replies.some((r) => r.text.includes('누나'))).toBe(true);
      for (const w of SAME_SEX_FOR_MALE) expect([p.title, p.thinking, ...p.replies.map((r) => r.text)].join(' ')).not.toContain(w);
    }
  });

  it('여성이면 남성 상대 「준호 선배」 — 동성 호칭(언니·누나)은 나오지 않는다', () => {
    const p = demoPartner('female');
    expect(p.title).toBe('준호 선배');
    expect(p.thinking).toContain('호칭 「선배」');
    expect(p.replies.some((r) => r.text.includes('선배'))).toBe(true);
    for (const w of SAME_SEX_FOR_FEMALE) expect([p.title, p.thinking, ...p.replies.map((r) => r.text)].join(' ')).not.toContain(w);
  });

  it('기타면 호칭 없이 이름만', () => {
    const p = demoPartner('other');
    expect(p.title).toBe('지우');
    expect(p.thinking).not.toContain('호칭');
    for (const w of ['누나', '언니', '선배', '오빠', '형']) expect([p.title, ...p.replies.map((r) => r.text)].join(' ')).not.toContain(w);
  });
});

describe('사용법 안내 첫 장 — 「이런 기능도 있어요」 연애 연습', () => {
  it('아직 못 봤으면 첫 장에 연애 연습 소개가 있고, 탐색 탭에서 해 볼 수 있다고 알린다', () => {
    const t = mount(<Welcome />);
    expect(texts(t)).toContain('이런 기능도 있어요');
    expect(texts(t)).toContain('AI 상대와 카톡으로 미리 연습해요');
    expect(texts(t)).toContain('탐색 탭에서 해 볼 수 있어요');
  });

  it('연습을 켰거나 이미 봤으면 띄우지 않는다', () => {
    act(() => {
      useAppStore.getState().setPracticeEnabled(true);
    });
    expect(useAppStore.getState().practiceDotSeen).toBe(true);
    const t = mount(<Welcome />);
    expect(texts(t)).not.toContain('이런 기능도 있어요');
  });
});

describe('홈 — 「처음 5분 무제한」 체험 중 남은 시간', () => {
  it('분:초로 적는다 (분 앞에 0 을 붙이지 않고, 남은 초는 올림)', () => {
    expect(introClock(252_000).text).toBe('4:12');
    expect(introClock(252_000).spoken).toBe('4분 12초');
    expect(introClock(300_000).text).toBe('5:00');
    expect(introClock(400).text).toBe('0:01');
    expect(introClock(0).text).toBe('0:00');
  });

  it('체험 중이면 1초마다 줄어드는 남은 시간을 보여 주고, 끝나면 남은 무료 횟수로 돌아간다', () => {
    const T0 = 1_900_000_000_000;
    jest.useFakeTimers({ now: T0, doNotFake: ['setImmediate', 'nextTick', 'queueMicrotask'] });
    act(() => {
      useAppStore.setState({ introArm: 'on', introStartedAt: T0 - 48_000 });
    });
    const t = mount(<HomeScreen />);
    expect(labels(t)).toContain('무제한 체험 중, 4분 12초 남았어요');
    expect(texts(t)).toContain('4:12');

    act(() => {
      jest.advanceTimersByTime(2_000);
    });
    expect(texts(t)).toContain('4:10');

    // 다 지나면 원래 표시 (남은 무료 횟수)
    act(() => {
      jest.advanceTimersByTime(INTRO_FREE_MS);
    });
    expect(texts(t)).not.toContain('무제한 체험 중');
    expect(labels(t).some((l) => /무료 코칭 \d+회 남았어요/.test(l))).toBe(true);
  });

  it('체험이 없는 이용자는 처음부터 남은 무료 횟수', () => {
    const t = mount(<HomeScreen />);
    expect(texts(t)).not.toContain('무제한 체험 중');
    expect(labels(t).some((l) => /무료 코칭 \d+회 남았어요/.test(l))).toBe(true);
  });
});
