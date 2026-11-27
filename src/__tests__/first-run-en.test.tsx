/**
 * 영어판 처음 실행 화면 — 사용법 안내(표지·네 장)·이용약관 동의 창·「나에 대해」·첫 캡처 화면에 한글이 하나도 보이지 않는지,
 * 영어판 이름(My Love Coach)과 연구진 문구가 보이고 「Sendit」·「센딧」이 안 보이는지 본다.
 * 언어는 앱을 켤 때 한 번 정해지므로 영어로 띄울 때만 돈다: `APP_LANG=en npx jest first-run-en` (보통 실행에서는 건너뛴다)
 */
import { act } from 'react';
import { Text, TextInput } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';

import AboutMe, { ABOUT_ME_STEPS, TYPING_MS } from '@/app/about-me';
import Start from '@/app/start';
import Welcome from '@/app/welcome';
import { StartConsentSheet } from '@/components/consent/start-consent-sheet';
import { APP_NAME_EN, RESEARCH_LINE_EN } from '@/constants/brand';
import { isEn } from '@/lib/i18n';
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
  APP_CONFIG: { apiUrl: 'https://api.example', apiSameOrigin: false, apiToken: '', supportEmail: 'contact@craving.win', privacyUrl: 'https://site.example/en/privacy.html', termsUrl: 'https://site.example/en/terms.html' },
}));
let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true }),
  useLocalSearchParams: () => mockParams,
  useFocusEffect: () => {},
  useIsFocused: () => true,
  Redirect: () => null,
}));
jest.mock('react-native-reanimated', () => {
  const RN = jest.requireActual('react-native');
  const { useRef } = jest.requireActual('react');
  const entering: Record<string, () => unknown> = {};
  for (const name of ['delay', 'duration', 'springify', 'damping']) entering[name] = () => entering;
  const target = (value: unknown) => value;
  const last = (...values: unknown[]) => values[values.length - 1];
  const same = (t: number) => t;
  return {
    __esModule: true,
    default: { View: RN.View, Text: RN.Text, createAnimatedComponent: target },
    Easing: { linear: same, out: () => same, in: () => same, inOut: () => same, quad: same, sin: same, cubic: same },
    FadeIn: entering,
    FadeOut: entering,
    FadeInDown: entering,
    FadeInUp: entering,
    ZoomIn: entering,
    useSharedValue: (value: unknown) => useRef({ value }).current,
    useAnimatedStyle: (style: () => object) => style(),
    withDelay: last,
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
// 다른 영역의 부품(데모 영상·알림)은 이 테스트에서 보지 않는다
jest.mock('@/components/fx/demo-reel', () => ({ DemoReel: () => null }));
jest.mock('@/components/ui/toast', () => ({ useToast: () => ({ show: jest.fn() }) }));
jest.mock('@/lib/images', () => ({ pickImage: jest.fn(async () => null), cleanupOrphanImages: jest.fn(), clearImageCaches: jest.fn(), deleteImageQuietly: jest.fn() }));
jest.mock('react-native-screens', () => {
  const { View } = jest.requireActual('react-native');
  return { FullWindowOverlay: View };
});

const HANGUL = /[가-힣ㄱ-ㆎ]/;
const METRICS = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } };
let tree: ReactTestRenderer | null = null;
function mount(element: React.ReactElement): ReactTestRenderer {
  act(() => {
    tree = create(<SafeAreaProvider initialMetrics={METRICS}>{element}</SafeAreaProvider>);
  });
  return tree as unknown as ReactTestRenderer;
}
const textOf = (node: ReactTestInstance): string => node.children.map((c) => (typeof c === 'string' ? c : textOf(c))).join('');
/** 화면에 보이거나 읽히는 글 전부 — 글자·접근성 이름·입력칸 안내 */
function shown(t: ReactTestRenderer): string[] {
  const out = t.root.findAllByType(Text).map(textOf);
  t.root.findAll((n) => typeof n.props.accessibilityLabel === 'string').forEach((n) => out.push(n.props.accessibilityLabel));
  t.root.findAllByType(TextInput).forEach((n) => typeof n.props.placeholder === 'string' && out.push(n.props.placeholder));
  return out.filter(Boolean);
}
const korean = (t: ReactTestRenderer) => shown(t).filter((s) => HANGUL.test(s) || /sendit/i.test(s));
function pressable(t: ReactTestRenderer, label: string): ReactTestInstance {
  const found = t.root.findAll((n) => typeof n.props.onPress === 'function' && (textOf(n).includes(label) || n.props.accessibilityLabel === label));
  if (!found.length) throw new Error(`「${label}」 버튼이 없어요`);
  return found[found.length - 1];
}

const run = isEn ? describe : describe.skip;

beforeEach(() => {
  mockParams = {};
  useAppStore.setState({ hydrated: true, user: null, crushes: {}, onboardingSeen: false, guideSeen: null, termsAgreedAt: null, practiceEnabled: false, practiceDotSeen: false });
});
afterEach(() => {
  act(() => tree?.unmount());
  tree = null;
  jest.useRealTimers();
});

run('영어판 처음 실행 화면', () => {
  it('사용법 안내 — 처음 설치·업데이트·다시 보기 모두 한글 없이, 이름은 My Love Coach', () => {
    for (const from of [undefined, 'update', 'my']) {
      mockParams = from ? { from } : {};
      const t = mount(<Welcome />);
      expect(korean(t)).toEqual([]);
      if (from !== 'my') expect(shown(t).join('\n')).toContain(APP_NAME_EN);
      if (from === undefined) expect(shown(t).join('\n')).toContain(RESEARCH_LINE_EN);
      act(() => tree?.unmount());
      tree = null;
    }
  });

  it('이용약관 동의 창 — 필수·선택 표시와 고지 글까지 영어', () => {
    const t = mount(<StartConsentSheet visible onAgree={() => {}} onClose={() => {}} />);
    expect(korean(t)).toEqual([]);
    const all = shown(t).join('\n');
    expect(all).toContain('Required');
    expect(all).toContain('Optional');
    expect(all).toContain('under 14');
  });

  it('첫 캡처 화면 — 글로 적기를 펼쳐도 한글 없이', () => {
    useAppStore.setState({ user: { name: 'Emma', gender: 'female', style: [], defaultTone: 'natural', createdAt: 1 } });
    const t = mount(<Start />);
    expect(korean(t)).toEqual([]);
    act(() => pressable(t, 'No screenshot? Describe it instead').props.onPress());
    expect(korean(t)).toEqual([]);
    expect(shown(t).join('\n')).toContain('Hi Emma!');
  });

  it('나에 대해 — 질문을 끝까지 건너뛰어도 코치 말·버튼이 모두 영어', () => {
    jest.useFakeTimers();
    const t = mount(<AboutMe />);
    const settle = () =>
      act(() => {
        jest.advanceTimersByTime(TYPING_MS * 6);
      });
    settle();
    for (const step of ABOUT_ME_STEPS) {
      expect(korean(t)).toEqual([]);
      // MBTI 는 건너뛰기 대신 「Not sure」
      act(() => pressable(t, step === 'mbti' ? 'Not sure' : 'Skip this question').props.onPress());
      settle();
    }
    expect(korean(t)).toEqual([]);
    expect(shown(t).join('\n')).toContain('Upload my first screenshot');
  });
});
