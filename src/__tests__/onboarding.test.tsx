/**
 * 처음 실행 흐름 — 「센딧 사용법」 안내(표지 + 실제 화면 네 장) → 이용약관 동의 → 「나에 대해 알려주세요」(코치와의 짧은 대화, 질문마다 건너뛰기) → 첫 캡처 화면.
 * 업데이트한 기존 이용자에게 한 번 보여 주는 「센딧으로 새로워졌어요」 안내, 마이의 「사용법 다시 보기」, 링크로 들어온 경우도 본다.
 * 연애 연습 숨김(마이 → 추가 기능에서 켜기), 별점 요청 조건, 예전 이용자 저장값 읽기도 함께 본다.
 */
import { act } from 'react';
import { BackHandler, Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';

import AboutMe, { ABOUT_ME_STEPS, TYPING_MS } from '@/app/about-me';
import Index from '@/app/index';
import Start from '@/app/start';
import Welcome from '@/app/welcome';
import { GUIDE_STEPS } from '@/components/guide/guide-steps';
import { track } from '@/lib/analytics';
import { REVIEW_GAP_MS, REVIEW_MIN_WINS, shouldAskReview } from '@/lib/store-review';
import { GUIDE_BEFORE_SENDIT, GUIDE_VERSION, useAppStore } from '@/store/app-store';

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
let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => mockParams,
  useFocusEffect: () => {},
  useIsFocused: () => true,
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
// 첫 캡처 화면(링크로 바로 여는 곳)을 띄울 때만 쓰는 것들
jest.mock('@/components/fx/demo-reel', () => ({ DemoReel: () => null }));
jest.mock('@/components/ui/toast', () => ({ useToast: () => ({ show: jest.fn() }) }));
jest.mock('@/lib/images', () => ({ pickImage: jest.fn(async () => null), cleanupOrphanImages: jest.fn(), clearImageCaches: jest.fn(), deleteImageQuietly: jest.fn() }));

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
  mockParams = {};
  useAppStore.getState().resetAll();
  useAppStore.setState({ hydrated: true, pendingDeletion: null, user: null, crushes: {}, onboardingSeen: false, guideSeen: null, termsAgreedAt: null, practiceEnabled: false, reviewWins: 0, reviewAsks: [] });
});

const PROFILE = { name: '지은', gender: 'female' as const, style: [], defaultTone: 'natural' as const, createdAt: 1 };
/** 안내를 끝까지 넘긴다 (마지막 장 버튼은 누르지 않는다) */
function pageThrough(t: ReactTestRenderer, pages: number) {
  for (let i = 1; i < pages; i += 1) act(() => pressable(t, '다음').props.onPress());
}
afterEach(() => {
  act(() => tree?.unmount());
  tree = null;
});

describe('처음 열면', () => {
  it('처음이면 사용법 안내로, 이번 판 안내를 본 사람은 첫 캡처 화면으로, 시작한 사람은 홈으로', () => {
    mount(<Index />);
    expect(mockRedirect).toBe('/welcome');
    act(() => {
      useAppStore.setState({ onboardingSeen: true, guideSeen: GUIDE_VERSION });
    });
    expect(mockRedirect).toBe('/start');
    act(() => {
      useAppStore.setState({ user: { name: '', gender: 'other', style: [], defaultTone: 'natural', createdAt: 1 } });
    });
    expect(mockRedirect).toBe('/(tabs)');
  });

  it('센딧 전 판을 쓰던 이용자는 「새로워졌어요」 안내로 한 번 보낸다 (예전 판 안내를 본 사람도)', () => {
    useAppStore.setState({ onboardingSeen: true, user: PROFILE, guideSeen: GUIDE_BEFORE_SENDIT });
    mount(<Index />);
    expect(mockRedirect).toBe('/welcome?from=update');
    act(() => {
      useAppStore.setState({ guideSeen: 'old-version' });
    });
    expect(mockRedirect).toBe('/welcome?from=update');
    act(() => {
      useAppStore.setState({ guideSeen: GUIDE_VERSION });
    });
    expect(mockRedirect).toBe('/(tabs)');
  });

  it('센딧 판에서 링크(빠른 코칭·KKTI)로 먼저 시작한 새 이용자는 「새로워졌어요」가 아니라 처음 설치용 표지로 (다음 실행에 소개를 본 것으로 읽혀도)', () => {
    useAppStore.setState({ user: PROFILE });
    mount(<Index />);
    expect(mockRedirect).toBe('/welcome?from=intro');
    // 다음 실행 때 저장소가 프로필을 보고 onboardingSeen 을 켜도 마찬가지
    act(() => {
      useAppStore.setState({ onboardingSeen: true });
    });
    expect(mockRedirect).toBe('/welcome?from=intro');
  });

  it('저장값 읽기 — 센딧 전 판 저장값(guideSeen 칸 없음)은 before-sendit, 센딧 판 저장값의 null 은 그대로 null', () => {
    const merge = (saved: object) => useAppStore.persist.getOptions().merge!(saved, useAppStore.getState()) as ReturnType<typeof useAppStore.getState>;
    // 센딧 전 판: 프로필·채팅방·소개 기록 중 하나라도 있으면 기존 이용자
    expect(merge({ deviceId: 'd_old1', user: PROFILE, onboardingSeen: true }).guideSeen).toBe(GUIDE_BEFORE_SENDIT);
    expect(merge({ deviceId: 'd_old2', crushes: { c1: { id: 'c1' } } }).guideSeen).toBe(GUIDE_BEFORE_SENDIT);
    expect(merge({ deviceId: 'd_old3', onboardingSeen: true }).guideSeen).toBe(GUIDE_BEFORE_SENDIT);
    // 쓰던 흔적이 없으면 처음 설치와 같다
    expect(merge({ deviceId: 'd_old4' }).guideSeen).toBeNull();
    // 센딧 판에서 링크로 먼저 시작한 사람 — null 이 그대로 남아 처음 설치용 표지로 간다
    const linkFirst = merge({ deviceId: 'd_new1', user: PROFILE, onboardingSeen: false, guideSeen: null });
    expect(linkFirst.guideSeen).toBeNull();
    expect(linkFirst.onboardingSeen).toBe(true);
    expect(merge({ deviceId: 'd_new2', onboardingSeen: true, guideSeen: GUIDE_VERSION }).guideSeen).toBe(GUIDE_VERSION);
  });

  it('링크로 연 화면(검색 가이드의 /start?q= 등)은 안내로 막지 않고, 다음에 앱을 처음 화면으로 열 때 보여 준다', () => {
    useAppStore.setState({ onboardingSeen: true, user: PROFILE, guideSeen: GUIDE_BEFORE_SENDIT, termsAgreedAt: Date.now() });
    mockParams = { q: '썸남이 뭐해? 라고 보냈어' };
    const t = mount(<Start />);
    // 링크가 연 화면이 그대로 보이고, 안내로 돌리지 않는다
    expect(t.root.findByProps({ accessibilityLabel: '지금 상황 적기' }).props.value).toBe('썸남이 뭐해? 라고 보냈어');
    expect(mockRedirect).toBeNull();
    expect(mockRouter.replace).not.toHaveBeenCalled();
    expect(useAppStore.getState().guideSeen).toBe(GUIDE_BEFORE_SENDIT);
    act(() => tree?.unmount());
    // 다음 앱 시작 (처음 화면)
    mockParams = {};
    mount(<Index />);
    expect(mockRedirect).toBe('/welcome?from=update');
  });
});

describe('사용법 안내 — 처음 설치', () => {
  it('첫 장에 로고·부제·연구진 문구, 이어서 실제 화면 네 장. 「건너뛰기」는 첫 캡처 화면으로 가고 이번 판 안내를 본 것으로 적는다', () => {
    const t = mount(<Welcome />);
    const shown = texts(t);
    expect(shown).toContain('센딧');
    expect(shown).toContain('나만의 연애 코치');
    expect(shown).toContain('고려대학교 심리학 연구진이 개발한 연애 특화 AI 코치');
    for (const step of GUIDE_STEPS) expect(shown).toContain(step.title);
    expect(t.root.findByProps({ accessibilityLabel: `${GUIDE_STEPS.length + 1}장 중 1번째` })).toBeDefined();
    act(() => byLabel(t, '소개 건너뛰기').props.onPress());
    expect(useAppStore.getState().onboardingSeen).toBe(true);
    expect(useAppStore.getState().guideSeen).toBe(GUIDE_VERSION);
    expect(mockRouter.replace).toHaveBeenCalledWith('/start');
    expect(track).toHaveBeenCalledWith('onboarding', { step: 'slides', action: 'open', mode: 'fresh' });
    expect(track).toHaveBeenCalledWith('onboarding', expect.objectContaining({ step: 'slides', action: 'skip', mode: 'fresh' }));
  });

  it('마지막 장의 「시작하기」는 이용약관 동의 창을 띄우고, 동의하면 「나에 대해」로 간다', () => {
    const t = mount(<Welcome />);
    pageThrough(t, GUIDE_STEPS.length + 1);
    act(() => pressable(t, '시작하기').props.onPress());
    expect(texts(t)).toContain('시작하기 전에 확인해 주세요');
    expect(mockRouter.replace).not.toHaveBeenCalled();
    // 동의 창을 닫기만 하면 아직 안내를 끝낸 게 아니다
    expect(useAppStore.getState().guideSeen).toBeNull();
    act(() => pressable(t, '모두 동의하고 시작').props.onPress());
    expect(useAppStore.getState().termsAgreedAt).not.toBeNull();
    expect(useAppStore.getState().onboardingSeen).toBe(true);
    expect(useAppStore.getState().guideSeen).toBe(GUIDE_VERSION);
    expect(mockRouter.replace).toHaveBeenCalledWith('/about-me');
    expect(track).toHaveBeenCalledWith('onboarding', { step: 'slides', action: 'start', mode: 'fresh' });
    expect(track).toHaveBeenCalledWith('start_consent', { all: true, content: true, mode: 'onboarding' });
  });

  it('이미 동의한 기기는 동의 창 없이 「나에 대해」로 간다', () => {
    useAppStore.setState({ termsAgreedAt: Date.now() });
    const t = mount(<Welcome />);
    pageThrough(t, GUIDE_STEPS.length + 1);
    act(() => pressable(t, '시작하기').props.onPress());
    expect(texts(t)).not.toContain('시작하기 전에 확인해 주세요');
    expect(mockRouter.replace).toHaveBeenCalledWith('/about-me');
  });
});

describe('사용법 안내 — 업데이트한 기존 이용자', () => {
  it('「센딧으로 새로워졌어요」 첫 장 + 같은 사용법, 「다 봤어요」는 동의 창·나에 대해 없이 홈으로', () => {
    useAppStore.setState({ onboardingSeen: true, user: PROFILE, termsAgreedAt: Date.now() });
    mockParams = { from: 'update' };
    const t = mount(<Welcome />);
    const shown = texts(t);
    expect(shown).toContain('나만의 연애 코치가\n센딧으로 새로워졌어요');
    expect(shown).toContain('채팅방과 기록은 그대로예요');
    for (const step of GUIDE_STEPS) expect(shown).toContain(step.title);
    pageThrough(t, GUIDE_STEPS.length + 1);
    act(() => pressable(t, '다 봤어요').props.onPress());
    expect(texts(t)).not.toContain('시작하기 전에 확인해 주세요');
    expect(mockRouter.replace).toHaveBeenCalledWith('/(tabs)');
    expect(mockRouter.replace).not.toHaveBeenCalledWith('/about-me');
    expect(useAppStore.getState().guideSeen).toBe(GUIDE_VERSION);
    expect(track).toHaveBeenCalledWith('onboarding', { step: 'slides', action: 'open', mode: 'update' });
    expect(track).toHaveBeenCalledWith('onboarding', { step: 'slides', action: 'done', mode: 'update' });
  });

  it('「닫기」도 본 것으로 적고 원래 가던 곳으로 — 아직 시작 전이던 사람은 첫 캡처 화면으로', () => {
    useAppStore.setState({ onboardingSeen: true });
    mockParams = { from: 'update' };
    const t = mount(<Welcome />);
    act(() => byLabel(t, '사용법 닫기').props.onPress());
    expect(useAppStore.getState().guideSeen).toBe(GUIDE_VERSION);
    expect(useAppStore.getState().termsAgreedAt).toBeNull();
    expect(mockRouter.replace).toHaveBeenCalledWith('/start');
    expect(track).toHaveBeenCalledWith('onboarding', expect.objectContaining({ step: 'slides', action: 'skip', mode: 'update' }));
  });

  it('안드로이드 뒤로 가기는 앞 장으로, 첫 장에서는 닫기와 같다', () => {
    const handlers: (() => boolean)[] = [];
    const spy = jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_e, h) => {
      handlers.push(h as () => boolean);
      return { remove: () => {} };
    });
    useAppStore.setState({ onboardingSeen: true, user: PROFILE });
    mockParams = { from: 'update' };
    const t = mount(<Welcome />);
    act(() => pressable(t, '다음').props.onPress());
    expect(t.root.findByProps({ accessibilityLabel: `${GUIDE_STEPS.length + 1}장 중 2번째` })).toBeDefined();
    let handled = false;
    act(() => {
      handled = handlers[handlers.length - 1]();
    });
    expect(handled).toBe(true);
    expect(t.root.findByProps({ accessibilityLabel: `${GUIDE_STEPS.length + 1}장 중 1번째` })).toBeDefined();
    expect(mockRouter.replace).not.toHaveBeenCalled();
    act(() => {
      handlers[handlers.length - 1]();
    });
    expect(mockRouter.replace).toHaveBeenCalledWith('/(tabs)');
    expect(useAppStore.getState().guideSeen).toBe(GUIDE_VERSION);
    spy.mockRestore();
  });
});

describe('사용법 안내 — 센딧 판에서 링크로 먼저 시작한 이용자', () => {
  it('처음 설치와 같은 표지(로고·부제·연구진)로 사용법을 보여 주고, 「다 봤어요」는 동의 창·나에 대해 없이 원래 가던 곳으로', () => {
    useAppStore.setState({ user: PROFILE });
    mockParams = { from: 'intro' };
    const t = mount(<Welcome />);
    const shown = texts(t);
    expect(shown).toContain('고려대학교 심리학 연구진이 개발한 연애 특화 AI 코치');
    expect(shown).toContain('센딧이 같이 골라 줄게요');
    expect(shown).not.toContain('새로워졌어요');
    pageThrough(t, GUIDE_STEPS.length + 1);
    act(() => pressable(t, '다 봤어요').props.onPress());
    expect(texts(t)).not.toContain('시작하기 전에 확인해 주세요');
    expect(mockRouter.replace).toHaveBeenCalledWith('/(tabs)');
    expect(mockRouter.replace).not.toHaveBeenCalledWith('/about-me');
    expect(useAppStore.getState().termsAgreedAt).toBeNull();
    expect(useAppStore.getState().guideSeen).toBe(GUIDE_VERSION);
    expect(useAppStore.getState().onboardingSeen).toBe(true);
    expect(track).toHaveBeenCalledWith('onboarding', { step: 'slides', action: 'done', mode: 'intro' });
  });
});

describe('사용법 안내 — 마이 → 「사용법 다시 보기」', () => {
  it('표지 없이 사용법만 보여 주고, 닫거나 다 보면 마이로 돌아간다 (동의 창·나에 대해 없이)', () => {
    useAppStore.setState({ onboardingSeen: true, user: PROFILE });
    mockParams = { from: 'my' };
    const t = mount(<Welcome />);
    expect(texts(t)).not.toContain('센딧으로 새로워졌어요');
    expect(texts(t)).toContain(GUIDE_STEPS[0].title);
    pageThrough(t, GUIDE_STEPS.length);
    act(() => pressable(t, '다 봤어요').props.onPress());
    expect(texts(t)).not.toContain('시작하기 전에 확인해 주세요');
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
    expect(useAppStore.getState().guideSeen).toBe(GUIDE_VERSION);
    act(() => byLabel(t, '사용법 닫기').props.onPress());
    expect(mockRouter.back).toHaveBeenCalledTimes(2);
    expect(mockRouter.replace).not.toHaveBeenCalled();
    expect(track).toHaveBeenCalledWith('onboarding', { step: 'slides', action: 'open', mode: 'replay', replay: true });
  });
});

describe('나에 대해 알려주세요 — 코치와의 짧은 대화', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());
  /** 코치가 「입력 중…」 뒤에 말하는 시간을 흘려보낸다 */
  const talk = () => act(() => jest.advanceTimersByTime(TYPING_MS * 6));
  const input = (t: ReactTestRenderer, label: string) => t.root.findByProps({ accessibilityLabel: label });

  it('코치가 인사한 뒤 이름부터 묻고, 바로 「나중에 할게요」를 누르면 아무것도 저장하지 않고 첫 캡처 화면으로', () => {
    const t = mount(<AboutMe />);
    // 말풍선이 나오기 전에는 답하는 칸이 없다
    expect(t.root.findAll((n) => n.props.accessibilityLabel === '부를 이름')).toHaveLength(0);
    talk();
    const shown = texts(t);
    expect(shown).toContain('오늘부터 함께할 연애 코치, 센딧이에요');
    expect(shown).toContain('뭐라고 불러 드릴까요?');
    act(() => byLabel(t, '나에 대해 알려주기 나중에 하기').props.onPress());
    expect(useAppStore.getState().user).toBeNull();
    expect(mockRouter.replace).toHaveBeenCalledWith('/start');
    expect(track).toHaveBeenCalledWith('onboarding', expect.objectContaining({ step: 'profile', action: 'skip', filled: 0, via: 'later' }));
  });

  it('한 번에 하나씩 묻고 답하면 바로 다음으로 — 건너뛴 질문은 비워 두고, 답한 만큼 저장한다 (추구미는 3개까지)', () => {
    const t = mount(<AboutMe />);
    talk();
    act(() => input(t, '부를 이름').props.onChangeText('  지은 '));
    act(() => byLabel(t, '보내기').props.onPress());
    talk();
    expect(texts(t)).toContain('지은이라고 불러 주세요');
    expect(texts(t)).toContain('반가워요, 지은님!');

    act(() => pressable(t, '여자예요').props.onPress());
    talk();
    act(() => input(t, '나이').props.onChangeText('2a5'));
    expect(input(t, '나이').props.value).toBe('25');
    act(() => byLabel(t, '보내기').props.onPress());
    talk();
    expect(texts(t)).toContain('25살이에요');

    // MBTI 는 「잘 몰라요」
    expect(texts(t)).toContain('MBTI 알고 있어요?');
    act(() => pressable(t, '잘 몰라요').props.onPress());
    talk();
    expect(t.root.findAll((n) => typeof n.props.onPress === 'function' && textOf(n) === 'ENFP')).toHaveLength(0);
    expect(texts(t)).toContain('잘 몰라요');

    for (const v of ['다정한', '유쾌한', '솔직한', '센스 있는']) act(() => pressable(t, v).props.onPress());
    act(() => pressable(t, '3개 골랐어요').props.onPress());
    talk();
    act(() => pressable(t, '썸 끝내고 확실하게').props.onPress());
    talk();
    expect(texts(t)).toContain('좋아요, 지은님!');
    expect(mockRouter.replace).not.toHaveBeenCalled();

    act(() => pressable(t, '첫 캡처 올리러 가기').props.onPress());
    const user = useAppStore.getState().user;
    expect(user).toEqual(expect.objectContaining({ name: '지은', gender: 'female', age: 25, goal: '썸 끝내고 확실하게' }));
    expect(user?.mbti).toBeUndefined();
    expect(user?.vibes).toEqual(['유쾌한', '솔직한', '센스 있는']);
    expect(mockRouter.replace).toHaveBeenCalledWith('/start');
    expect(track).toHaveBeenCalledWith('onboarding', { step: 'profile_q', q: 'mbti', action: 'skip' });
    expect(track).toHaveBeenCalledWith('onboarding', expect.objectContaining({ step: 'profile', action: 'save', filled: 5, via: 'done', answered: ABOUT_ME_STEPS.length }));
  });

  it('말풍선이 다 나오기 전에 누른 답은 받지 않는다 (두 번 눌러 질문을 건너뛰지 않게)', () => {
    const t = mount(<AboutMe />);
    talk();
    act(() => pressable(t, '건너뛰기').props.onPress());
    // 다음 질문(성별)이 아직 나오는 중
    expect(t.root.findAll((n) => typeof n.props.onPress === 'function' && textOf(n) === '여자예요')).toHaveLength(0);
    talk();
    expect(t.root.findAll((n) => typeof n.props.onPress === 'function' && textOf(n) === '여자예요').length).toBeGreaterThan(0);
  });

  it('홈·마이에서 다시 열면 이미 아는 건 묻지 않고 이름으로 반긴다', () => {
    act(() => {
      useAppStore.setState({ user: { name: '지은', gender: 'female', age: 25, style: [], defaultTone: 'natural', createdAt: 1 } });
    });
    mockParams = { from: 'my' };
    const t = mount(<AboutMe />);
    talk();
    const shown = texts(t);
    expect(shown).toContain('다시 반가워요, 지은님!');
    expect(shown).not.toContain('뭐라고 불러 드릴까요?');
    // 이름·성별·나이는 알고 있으니 MBTI 부터
    expect(shown).toContain('MBTI 알고 있어요?');
    expect(t.root.findByProps({ accessibilityLabel: `질문 3개 중 0개 답함` })).toBeDefined();
    act(() => pressable(t, 'ENFP').props.onPress());
    talk();
    act(() => byLabel(t, '나에 대해 알려주기 나중에 하기').props.onPress());
    expect(useAppStore.getState().user).toEqual(expect.objectContaining({ name: '지은', gender: 'female', age: 25, mbti: 'ENFP' }));
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
  });

  it('안드로이드 뒤로 가기는 「나중에 할게요」와 같고, 여러 번 눌러도 한 번만 나간다', () => {
    const handlers: (() => boolean)[] = [];
    const spy = jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_e, h) => {
      handlers.push(h as () => boolean);
      return { remove: () => {} };
    });
    mockParams = { from: 'home' };
    const t = mount(<AboutMe />);
    talk();
    act(() => input(t, '부를 이름').props.onChangeText('현섭'));
    act(() => byLabel(t, '보내기').props.onPress());
    talk();
    expect(texts(t)).toContain('현섭이라고 불러 주세요');
    let handled = false;
    act(() => {
      handled = handlers[handlers.length - 1]();
      handlers[handlers.length - 1]();
    });
    act(() => byLabel(t, '나에 대해 알려주기 나중에 하기').props.onPress());
    expect(handled).toBe(true);
    expect(useAppStore.getState().user).toEqual(expect.objectContaining({ name: '현섭' }));
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith('onboarding', expect.objectContaining({ step: 'profile', action: 'save', via: 'back', from: 'home' }));
    spy.mockRestore();
  });

  it('중간에 「나중에 할게요」를 눌러도 이미 답한 건 남기고, 홈에서 열었으면 홈으로 돌아간다', () => {
    mockParams = { from: 'home' };
    const t = mount(<AboutMe />);
    talk();
    act(() => input(t, '부를 이름').props.onChangeText('민지'));
    act(() => byLabel(t, '보내기').props.onPress());
    talk();
    expect(texts(t)).toContain('민지라고 불러 주세요');
    act(() => byLabel(t, '나에 대해 알려주기 나중에 하기').props.onPress());
    expect(useAppStore.getState().user).toEqual(expect.objectContaining({ name: '민지', gender: 'other' }));
    expect(mockRouter.back).toHaveBeenCalled();
    expect(mockRouter.replace).not.toHaveBeenCalled();
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
