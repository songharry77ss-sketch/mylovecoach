/**
 * 동의·개인정보 화면 — 첫 화면 동의 창(「모두 동의하고 시작」·필수/선택 항목·미리 체크 없음),
 * 마이(이용 기록 스위치 없음 · 개인정보 설정으로 가는 줄 · 맨 아래 「모든 데이터 삭제」·「회원 탈퇴」),
 * 마이 → 개인정보 설정(코칭 내용 저장 켜고 끄기 · 끄면 코칭 내용 삭제 요청 · 처리 정지 메일), 홈의 바뀐 개인정보 안내 카드,
 * 홈에서 대화 시작하기(캡처·상황 적기 → 「누구와의 대화예요?」).
 */
import { act } from 'react';
import { Alert, Linking, Switch, Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';

import HomeScreen from '@/app/(tabs)/index';
import MyScreen from '@/app/(tabs)/my';
import PrivacySettings from '@/app/settings/privacy';
import Start from '@/app/start';
import { ListRow } from '@/components/ui/list-row';
import { track } from '@/lib/analytics';
import { deleteImageQuietly, pickImage } from '@/lib/images';
import { BASIC_LOG_NOTICE } from '@/lib/privacy-copy';
import { PRIVACY_NOTICE_VERSION, useAppStore } from '@/store/app-store';

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
  APP_CONFIG: {
    apiUrl: 'https://api.example',
    apiSameOrigin: false,
    apiToken: '',
    supportEmail: 'contact@craving.win',
    privacyUrl: 'https://site.example/privacy.html',
    termsUrl: 'https://site.example/terms.html',
  },
}));
const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true };
let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({ useRouter: () => mockRouter, useLocalSearchParams: () => mockParams, useFocusEffect: () => {}, useIsFocused: () => true }));
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
// 아이콘 글꼴은 비동기로 불러와 시험이 끝난 뒤 화면을 고치므로(act 경고) 빈 아이콘으로 바꾼다
jest.mock('@expo/vector-icons', () => ({ Ionicons: Object.assign(() => null, { glyphMap: {} }) }));
jest.mock('expo-linear-gradient', () => {
  const { View } = jest.requireActual('react-native');
  return { LinearGradient: View };
});
// 버튼의 눌림 애니메이션은 여기서 볼 것이 아니라 글자 버튼으로 대신한다 (누를 수 없으면 onPress 를 주지 않는다)
jest.mock('@/components/ui/button', () => {
  const { createElement } = jest.requireActual('react');
  const { Text: RNText } = jest.requireActual('react-native');
  return {
    Button: ({ title, onPress, disabled }: { title: string; onPress?: () => void; disabled?: boolean }) =>
      createElement(RNText, { accessibilityRole: 'button', accessibilityState: { disabled: Boolean(disabled) }, onPress: disabled ? undefined : onPress }, title),
  };
});
jest.mock('@/components/fx/demo-reel', () => ({ DemoReel: () => null }));
jest.mock('@/components/ui/toast', () => ({ useToast: () => ({ show: jest.fn() }) }));
jest.mock('@/lib/haptics', () => ({ haptic: new Proxy({}, { get: () => () => {} }), setHapticsEnabled: () => {} }));
jest.mock('@/lib/analytics', () => ({ track: jest.fn() }));
jest.mock('@/lib/images', () => ({ pickImage: jest.fn(async () => null), cleanupOrphanImages: jest.fn(), clearImageCaches: jest.fn(), deleteImageQuietly: jest.fn() }));
jest.mock('@/components/auth/apple-deletion-help', () => ({ useAccountDeletion: () => ({ busy: false, remove: jest.fn(), sheet: null }) }));
jest.mock('@/components/coach/ai-report-sheet', () => ({ useAiReport: () => ({ available: false, open: jest.fn(), sheet: null }) }));
jest.mock('@/hooks/use-plan-products', () => ({ usePlanProducts: () => [], onSalePrice: () => undefined }));
jest.mock('@/lib/billing/iap', () => ({ billingSupported: false, openSubscriptionManagement: jest.fn(), restorePremium: jest.fn() }));
jest.mock('@/lib/billing/team', () => ({ refreshTeam: jest.fn(async () => {}) }));
jest.mock('@/lib/auth', () => ({ providerLabel: (p: string) => p, signOut: jest.fn() }));
jest.mock('@/lib/supabase', () => ({ authAvailable: true }));
jest.mock('@/lib/coach-client', () => ({ aiRouteOf: () => null }));
jest.mock('@/lib/app-update', () => ({ openStore: jest.fn() }));
jest.mock('@/lib/floating', () => ({ floatingSupported: false, isRunning: () => false, canDrawOverlays: () => false, start: jest.fn(), stop: jest.fn(), openOverlaySettings: jest.fn() }));

const METRICS = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } };
let tree: ReactTestRenderer | null = null;

function mount(element: React.ReactElement): ReactTestRenderer {
  act(() => {
    tree = create(<SafeAreaProvider initialMetrics={METRICS}>{element}</SafeAreaProvider>);
  });
  return tree as unknown as ReactTestRenderer;
}

const textOf = (node: ReactTestInstance): string => node.children.map((c) => (typeof c === 'string' ? c : textOf(c))).join('');
/** 화면에 보이는 글자 (순서대로) */
const texts = (t: ReactTestRenderer) => t.root.findAllByType(Text).map(textOf);
/** 누를 수 있는 것 중 글자가 들어간 것 (가장 안쪽) */
function pressable(t: ReactTestRenderer, label: string): ReactTestInstance {
  const found = t.root.findAll((n) => typeof n.props.onPress === 'function' && textOf(n).includes(label));
  if (!found.length) throw new Error(`「${label}」 버튼이 없어요`);
  return found[found.length - 1];
}
const checkboxes = (t: ReactTestRenderer) => t.root.findAll((n) => n.props.accessibilityRole === 'checkbox' && typeof n.props.onPress === 'function');
const tracked = track as jest.Mock;

// 저장소를 다 읽은 뒤에 시작한다 (늦게 끝난 읽기가 테스트에서 바꾼 값을 덮지 않게).
// 스토어의 setState 는 저장 약속(Promise)을 돌려주므로 act 안에서는 늘 중괄호로 감싼다 — 그대로 돌려주면 기다리지 않은 비동기 act 가 된다
beforeAll(async () => {
  for (let i = 0; i < 50 && !useAppStore.persist.hasHydrated(); i += 1) {
    await act(async () => {
      await new Promise<void>((resolve) => setImmediate(resolve));
    });
  }
});

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = {};
  useAppStore.getState().resetAll();
  useAppStore.setState({ hydrated: true, pendingDeletion: null, deviceId: 'd_screen_test', member: null, user: null, crushes: {}, privacyNoticeSeen: 0, legacyServerRecords: false });
});

afterEach(() => {
  act(() => tree?.unmount());
  tree = null;
});

describe('첫 화면 — 캡처 없이 상황만 적기', () => {
  const askButton = (t: ReactTestRenderer) =>
    t.root.findAll((n) => n.props.accessibilityRole === 'button' && n.props.accessibilityState && textOf(n) === '답장·조언 받기')[0];

  it('글로 적는 칸은 접혀 있다가 펼치면 나오고, 예시를 누르면 채워져 「답장·조언 받기」로 그 글을 가지고 채팅방에 들어가 바로 보낸다', () => {
    useAppStore.setState({ termsAgreedAt: Date.now() });
    const t = mount(<Start />);
    // 캡처 버튼에 집중하도록 처음엔 접혀 있다
    expect(t.root.findAll((n) => n.props.accessibilityLabel === '지금 상황 적기')).toHaveLength(0);
    act(() => pressable(t, '상황만 적어도 돼요').props.onPress());
    expect(tracked).toHaveBeenCalledWith('start_write_open');
    // 비어 있으면 누를 수 없다
    expect(askButton(t).props.accessibilityState.disabled).toBe(true);
    act(() => pressable(t, '소개팅 다음 날, 먼저 연락해도 될까?').props.onPress());
    expect(t.root.findByProps({ accessibilityLabel: '지금 상황 적기' }).props.value).toBe('소개팅 다음 날, 먼저 연락해도 될까?');
    expect(askButton(t).props.accessibilityState.disabled).toBe(false);
    act(() => askButton(t).props.onPress());
    expect(mockRouter.replace).toHaveBeenCalledWith({ pathname: '/crush/[id]', params: expect.objectContaining({ pendingText: '소개팅 다음 날, 먼저 연락해도 될까?' }) });
    expect(tracked).toHaveBeenCalledWith('start', expect.objectContaining({ mode: 'text', typed: true, example: true }));
  });

  it('직접 적은 글은 앞뒤 공백을 빼고 보내며, 동의 창을 거쳐도 그 글을 잃지 않는다', () => {
    const t = mount(<Start />);
    act(() => pressable(t, '상황만 적어도 돼요').props.onPress());
    act(() => t.root.findByProps({ accessibilityLabel: '지금 상황 적기' }).props.onChangeText('  썸남이 3시간째 답이 없어  '));
    act(() => askButton(t).props.onPress());
    // 처음이면 동의 창부터
    expect(texts(t).join('\n')).toContain('시작하기 전에 확인해 주세요');
    act(() => pressable(t, '모두 동의하고 시작').props.onPress());
    expect(mockRouter.replace).toHaveBeenCalledWith({ pathname: '/crush/[id]', params: expect.objectContaining({ pendingText: '썸남이 3시간째 답이 없어' }) });
    expect(tracked).toHaveBeenCalledWith('start', expect.objectContaining({ mode: 'text', typed: true, example: false }));
  });

  it('검색 가이드에서 ?q= 로 들어오면 그 상황이 채워져 있고, 고치지 않고 보내면 prefilled 로 남는다', () => {
    useAppStore.setState({ termsAgreedAt: Date.now() });
    mockParams = { q: '  읽씹 하루째인데 다시 선톡해도 될까? 뭐라고 보내지?  ' };
    const t = mount(<Start />);
    // 가이드에서 채워 온 글이 있으면 펼친 채로 시작한다
    expect(t.root.findByProps({ accessibilityLabel: '지금 상황 적기' }).props.value).toBe('읽씹 하루째인데 다시 선톡해도 될까? 뭐라고 보내지?');
    act(() => askButton(t).props.onPress());
    expect(mockRouter.replace).toHaveBeenCalledWith({ pathname: '/crush/[id]', params: expect.objectContaining({ pendingText: '읽씹 하루째인데 다시 선톡해도 될까? 뭐라고 보내지?' }) });
    expect(tracked).toHaveBeenCalledWith('start', expect.objectContaining({ mode: 'text', typed: true, prefilled: true }));
  });

  it('?q= 가 너무 길면 200자에서 자르고, 직접 고치면 prefilled 를 떼어 낸다', () => {
    useAppStore.setState({ termsAgreedAt: Date.now() });
    mockParams = { q: '가'.repeat(500) };
    const t = mount(<Start />);
    expect(t.root.findByProps({ accessibilityLabel: '지금 상황 적기' }).props.value).toHaveLength(200);
    act(() => t.root.findByProps({ accessibilityLabel: '지금 상황 적기' }).props.onChangeText('내가 다시 적은 상황'));
    act(() => askButton(t).props.onPress());
    expect(tracked).toHaveBeenCalledWith('start', expect.not.objectContaining({ prefilled: true }));
  });
});

describe('첫 화면 동의 창', () => {
  it('처음 시작 버튼을 누르면 필수·선택 항목이 체크되지 않은 채로 뜬다', () => {
    const t = mount(<Start />);
    expect(texts(t).join('\n')).not.toContain('시작하기 전에 확인해 주세요');
    act(() => pressable(t, '둘러보기').props.onPress());
    const shown = texts(t).join('\n');
    expect(shown).toContain('시작하기 전에 확인해 주세요');
    expect(shown).toContain('(필수) 이용약관 동의');
    expect(shown).toContain('(필수) 개인정보 처리방침 확인');
    expect(shown).toContain(BASIC_LOG_NOTICE);
    expect(shown).toContain('(선택) 코칭 내용 저장 — 더 나은 코칭을 위해 질문·답변을 서버에 보관해요');
    expect(shown).toContain('모두 동의하고 시작');
    const boxes = checkboxes(t);
    expect(boxes).toHaveLength(3);
    expect(boxes.every((b) => b.props.accessibilityState.checked === false)).toBe(true);
    // 필수 항목을 체크하기 전에는 「선택한 항목으로 시작」을 누를 수 없다
    expect(t.root.findAll((n) => n.props.accessibilityRole === 'button' && textOf(n) === '선택한 항목으로 시작' && typeof n.props.onPress === 'function')).toHaveLength(0);
    expect(useAppStore.getState().termsAgreedAt).toBeNull();
    expect(mockRouter.replace).not.toHaveBeenCalled();
    expect(tracked).toHaveBeenCalledWith('start_consent_open', { mode: 'browse' });
  });

  it('「모두 동의하고 시작」은 선택 항목(코칭 내용 저장)까지 모두 동의하고, 누른 버튼의 일을 이어서 한다', () => {
    const t = mount(<Start />);
    act(() => pressable(t, '둘러보기').props.onPress());
    act(() => pressable(t, '모두 동의하고 시작').props.onPress());
    const s = useAppStore.getState();
    expect(s.termsAgreedAt).not.toBeNull();
    expect(s.contentConsent).toBe(true);
    expect(s.privacyNoticeSeen).toBe(PRIVACY_NOTICE_VERSION);
    expect(tracked).toHaveBeenCalledWith('start_consent', { all: true, content: true, mode: 'browse' });
    // 둘러보기는 홈으로 — 다음에 열어도 이 화면으로 돌아오지 않게 빈 프로필을 만든다
    expect(mockRouter.replace).toHaveBeenCalledWith('/(tabs)');
    expect(s.user).toEqual(expect.objectContaining({ name: '', gender: 'other' }));
    // 퍼널의 「첫 화면 통과」(start)와 따로 남긴다
    expect(tracked).toHaveBeenCalledWith('start_browse', { content: true });
    expect(tracked).not.toHaveBeenCalledWith('start', expect.anything());
    expect(texts(t).join('\n')).not.toContain('시작하기 전에 확인해 주세요');
  });

  it('필수 항목만 체크하고 「선택한 항목으로 시작」하면 코칭 내용 저장은 동의 안 함으로 남는다', () => {
    const t = mount(<Start />);
    act(() => pressable(t, '둘러보기').props.onPress());
    const [terms, privacy] = checkboxes(t);
    act(() => terms.props.onPress());
    act(() => privacy.props.onPress());
    expect(checkboxes(t).map((b) => b.props.accessibilityState.checked)).toEqual([true, true, false]);
    act(() => pressable(t, '선택한 항목으로 시작').props.onPress());
    const s = useAppStore.getState();
    expect(s.termsAgreedAt).not.toBeNull();
    expect(s.contentConsent).toBe(false);
    expect(mockRouter.replace).toHaveBeenCalled();
  });

  it('닫으면 동의하지 않은 채 첫 화면에 남고, 이미 답한 기기는 다시 묻지 않고 바로 시작한다', () => {
    const t = mount(<Start />);
    act(() => pressable(t, '둘러보기').props.onPress());
    const close = t.root.findAll((n) => n.props.accessibilityLabel === '닫기' && typeof n.props.onPress === 'function');
    act(() => close[close.length - 1].props.onPress());
    expect(texts(t).join('\n')).not.toContain('시작하기 전에 확인해 주세요');
    expect(useAppStore.getState().termsAgreedAt).toBeNull();
    expect(mockRouter.replace).not.toHaveBeenCalled();

    act(() => {
      useAppStore.setState({ termsAgreedAt: Date.now() });
    });
    act(() => pressable(t, '둘러보기').props.onPress());
    expect(texts(t).join('\n')).not.toContain('시작하기 전에 확인해 주세요');
    expect(mockRouter.replace).toHaveBeenCalledWith('/(tabs)');
  });

  it('첫 화면 아래에 서비스 이용 기록 자동 수집 안내와 처리방침 링크가 있다 (옛 「이용 기록 수집」 체크박스는 없다)', () => {
    const t = mount(<Start />);
    const shown = texts(t).join('\n');
    expect(shown).toContain('화면·버튼 이용 기록이 서비스 제공·개선을 위해 자동으로 수집돼요');
    expect(shown).not.toContain('(선택) 서비스 개선을 위해 이용 기록');
    expect(checkboxes(t)).toHaveLength(0);
  });
});

describe('마이', () => {
  const member = { userId: 'u_1', provider: 'kakao', nickname: '지훈', joinedAt: 1 };

  it('이용 기록 스위치는 없고, 개인정보 설정으로 가는 줄이 있다', () => {
    const t = mount(<MyScreen />);
    const shown = texts(t).join('\n');
    expect(shown).not.toContain('이용 기록 수집 (선택)');
    expect(t.root.findAllByType(Switch).map((s) => s.props.accessibilityLabel)).not.toContain('이용 기록 수집 (선택)');
    const row = t.root.findAllByType(ListRow).find((r) => r.props.title === '개인정보 설정');
    expect(row).toBeDefined();
    act(() => row!.props.onPress());
    expect(mockRouter.push).toHaveBeenCalledWith('/settings/privacy');
  });

  it('「모든 데이터 삭제」와 「회원 탈퇴」는 맨 아래 작은 글자 버튼으로 남아 있고, 누르면 확인을 묻는다', () => {
    act(() => {
      useAppStore.setState({ member });
    });
    const t = mount(<MyScreen />);
    const shown = texts(t);
    const reset = shown.lastIndexOf('모든 데이터 삭제');
    const withdraw = shown.lastIndexOf('회원 탈퇴');
    expect(reset).toBeGreaterThan(-1);
    expect(withdraw).toBeGreaterThan(-1);
    // 목록의 빨간 줄이 아니라 화면 맨 아래 (「내 기기 ID」 뒤)
    expect(reset).toBeGreaterThan(shown.indexOf('내 기기 ID'));
    expect(withdraw).toBeGreaterThan(shown.indexOf('내 기기 ID'));
    expect(t.root.findAllByType(ListRow).map((r) => r.props.title)).not.toContain('모든 데이터 삭제');

    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    act(() => pressable(t, '모든 데이터 삭제').props.onPress());
    expect(alert).toHaveBeenCalledWith('모든 데이터 삭제', expect.stringContaining('코칭 내용'), expect.any(Array));
    act(() => pressable(t, '회원 탈퇴').props.onPress());
    expect(alert).toHaveBeenCalledWith('회원 탈퇴', expect.any(String), expect.any(Array));
    alert.mockRestore();
  });

  it('비회원에게도 「모든 데이터 삭제」는 보이고, 회원 탈퇴는 회원에게만 보인다', () => {
    const t = mount(<MyScreen />);
    const shown = texts(t);
    expect(shown).toContain('모든 데이터 삭제');
    expect(shown).not.toContain('회원 탈퇴');
  });
});

describe('마이 → 개인정보 설정', () => {
  it('기본 이용 기록은 안내만 하고(스위치 없음), 코칭 내용 저장은 선택 스위치 하나로 켜고 끈다', () => {
    const t = mount(<PrivacySettings />);
    expect(texts(t).join('\n')).toContain(BASIC_LOG_NOTICE);
    const switches = t.root.findAllByType(Switch);
    expect(switches.map((s) => s.props.accessibilityLabel)).toEqual(['코칭 내용 저장 (선택)']);
    expect(switches[0].props.value).toBe(false);

    act(() => switches[0].props.onValueChange(true));
    expect(useAppStore.getState().contentConsent).toBe(true);
    expect(useAppStore.getState().pendingDeletion).toBeNull();
    expect(tracked).toHaveBeenCalledWith('content_consent', { agreed: true, from: 'settings' });
  });

  it('켜 둔 코칭 내용 저장을 끄면 서버에 저장된 이 기기의 코칭 내용 삭제를 요청한다', () => {
    act(() => {
      useAppStore.getState().setContentConsent(true);
    });
    const t = mount(<PrivacySettings />);
    const toggle = t.root.findAllByType(Switch)[0];
    expect(toggle.props.value).toBe(true);
    act(() => toggle.props.onValueChange(false));
    const s = useAppStore.getState();
    expect(s.contentConsent).toBe(false);
    expect(s.pendingDeletion).toMatchObject({ deviceId: 'd_screen_test', sent: 0, scope: 'content' });
  });

  it('처리 정지·삭제 요청은 기기 ID 를 적은 메일을 연다', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    const t = mount(<PrivacySettings />);
    const row = t.root.findAllByType(ListRow).find((r) => r.props.title === '처리 정지·삭제 요청');
    await act(async () => row!.props.onPress());
    const url = String(open.mock.calls[0][0]);
    expect(url.startsWith('mailto:contact@craving.win?')).toBe(true);
    expect(decodeURIComponent(url)).toContain('기기 ID: d_screen_test');
    open.mockRestore();
  });

  it('예전 미리 체크 동의로 보낸 기록이 남은 기기는 여기서 서버 기록 전체 삭제를 요청할 수 있다', () => {
    act(() => {
      useAppStore.setState({ legacyServerRecords: true });
    });
    const alert = jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => buttons?.find((b) => b.style === 'destructive')?.onPress?.());
    const t = mount(<PrivacySettings />);
    const row = t.root.findAllByType(ListRow).find((r) => r.props.title === '예전에 보낸 이용 기록 지우기');
    act(() => row!.props.onPress());
    expect(useAppStore.getState().pendingDeletion).toMatchObject({ deviceId: 'd_screen_test', sent: 0 });
    expect(useAppStore.getState().pendingDeletion?.scope).toBeUndefined();
    expect(useAppStore.getState().legacyServerRecords).toBe(false);
    alert.mockRestore();
  });
});

describe('홈의 바뀐 개인정보 안내 (기존 이용자)', () => {
  it('아직 못 본 기존 이용자에게 한 번 보이고, 닫으면 다시 보이지 않는다', () => {
    const t = mount(<HomeScreen />);
    expect(texts(t)).toContain('개인정보 처리방침이 바뀌었어요');
    const close = t.root.findAll((n) => n.props.accessibilityLabel === '개인정보 안내 닫기' && typeof n.props.onPress === 'function');
    act(() => close[0].props.onPress());
    expect(useAppStore.getState().privacyNoticeSeen).toBe(PRIVACY_NOTICE_VERSION);
    expect(texts(t)).not.toContain('개인정보 처리방침이 바뀌었어요');
  });

  it('「자세히 보기」는 개인정보 설정을 열고, 첫 화면에서 동의한 새 이용자에게는 보이지 않는다', () => {
    const t = mount(<HomeScreen />);
    act(() => pressable(t, '자세히 보기').props.onPress());
    expect(mockRouter.push).toHaveBeenCalledWith('/settings/privacy');
    expect(useAppStore.getState().privacyNoticeSeen).toBe(PRIVACY_NOTICE_VERSION);
    act(() => tree?.unmount());

    act(() => {
      useAppStore.setState({ privacyNoticeSeen: 0 });
    });
    act(() => {
      useAppStore.getState().agreeToStart(false);
    });
    const fresh = mount(<HomeScreen />);
    expect(texts(fresh)).not.toContain('개인정보 처리방침이 바뀌었어요');
  });
});

describe('홈 — 채팅 먼저 (캡처 올리기 · 상황만 적기)', () => {
  const byLabel = (t: ReactTestRenderer, label: string) => {
    const found = t.root.findAll((n) => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function');
    if (!found.length) throw new Error(`「${label}」 이 없어요`);
    return found[found.length - 1];
  };
  const addRoom = (name: string) => {
    let id = '';
    act(() => {
      id = useAppStore.getState().addCrush({ name, gender: 'male', relationship: 'talking', style: [], notes: '' }).id;
    });
    return id;
  };

  it('부가 기능 바로가기(탐색·KKTI)는 홈에 없고, 대화를 시작하는 두 길(캡처 올리기 · 캡처 없이 적기)만 있다', () => {
    const t = mount(<HomeScreen />);
    const shown = texts(t).join('\n');
    expect(shown).toContain('캡처 올리기');
    expect(shown).toContain('캡처 없이도 괜찮아요');
    expect(byLabel(t, '대화 캡처 올리기')).toBeDefined();
    expect(byLabel(t, '캡처 없이 상황만 적기')).toBeDefined();
    expect(shown).not.toContain('KKTI');
    expect(shown).not.toContain('속마음 카드');
  });

  it('캡처 카드 아래에 남은 무료 횟수가 있고, 채팅방이 생기면 「최근 상담」에 이름·호감 온도 줄이 생겨 누르면 그 방으로 간다', () => {
    const t = mount(<HomeScreen />);
    expect(t.root.findAll((n) => typeof n.props.accessibilityLabel === 'string' && /무료 코칭 \d+회 남았어요/.test(n.props.accessibilityLabel)).length).toBeGreaterThan(0);
    expect(texts(t).join('\n')).toContain('이렇게 나와요');
    act(() => tree?.unmount());

    const minsu = addRoom('민수');
    act(() => {
      useAppStore.setState((s) => ({ crushes: { ...s.crushes, [minsu]: { ...s.crushes[minsu], heat: 32 } } }));
    });
    const withRoom = mount(<HomeScreen />);
    const shown = texts(withRoom).join('\n');
    expect(shown).toContain('최근 상담');
    expect(shown).toContain('민수');
    expect(shown).not.toContain('이렇게 나와요');
    act(() => byLabel(withRoom, '민수, 호감 온도 32도, 새 채팅방').props.onPress());
    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/crush/[id]', params: { id: minsu } });
  });

  it('채팅방이 없으면 「상황만 적기」는 묻지 않고 첫 채팅방을 열어 입력창을 띄운다', () => {
    const t = mount(<HomeScreen />);
    act(() => byLabel(t, '캡처 없이 상황만 적기').props.onPress());
    expect(texts(t).join('\n')).not.toContain('누구와의 대화예요?');
    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/crush/[id]', params: { id: expect.any(String), compose: '1' } });
    expect(Object.values(useAppStore.getState().crushes)).toHaveLength(1);
  });

  it('채팅방이 있으면 캡처를 고른 뒤 「누구와의 대화예요?」에서 고른 방으로 가서 바로 분석한다', async () => {
    const minsu = addRoom('민수');
    jest.mocked(pickImage).mockResolvedValueOnce({ uri: 'file:///cap.png', width: 1080, height: 2340 });
    const t = mount(<HomeScreen />);
    await act(async () => {
      await byLabel(t, '대화 캡처 올리기').props.onPress();
    });
    expect(texts(t).join('\n')).toContain('누구와의 대화예요?');
    expect(mockRouter.push).not.toHaveBeenCalled();
    act(() => byLabel(t, '민수와의 대화').props.onPress());
    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/crush/[id]', params: { id: minsu, pendingImage: 'file:///cap.png', pendingWidth: '1080' } });
    expect(tracked).toHaveBeenCalledWith('home_start', { mode: 'image', target: 'crush', rooms: 1 });
  });

  it('「새로운 사람」은 이미 방이 있어도 늘 새 채팅방을 만들어 그 방에서 분석한다 (기존 방에 섞이지 않게)', async () => {
    const minsu = addRoom('민수');
    jest.mocked(pickImage).mockResolvedValueOnce({ uri: 'file:///other.png', width: 900, height: 1900 });
    const t = mount(<HomeScreen />);
    await act(async () => {
      await byLabel(t, '대화 캡처 올리기').props.onPress();
    });
    act(() => pressable(t, '새로운 사람').props.onPress());
    const rooms = Object.values(useAppStore.getState().crushes).filter((c) => !c.secret);
    expect(rooms).toHaveLength(2);
    const fresh = rooms.find((c) => c.id !== minsu)!;
    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/crush/[id]', params: { id: fresh.id, pendingImage: 'file:///other.png', pendingWidth: '900' } });
  });

  it('캡처를 고른 뒤 시트를 그냥 닫으면 고른 캡처 사본을 바로 지운다', async () => {
    addRoom('민수');
    jest.mocked(pickImage).mockResolvedValueOnce({ uri: 'file:///drop.png', width: 900, height: 1900 });
    const t = mount(<HomeScreen />);
    await act(async () => {
      await byLabel(t, '대화 캡처 올리기').props.onPress();
    });
    const backdrop = t.root.findAll((n) => n.props.accessibilityLabel === '닫기' && typeof n.props.onPress === 'function');
    act(() => backdrop[backdrop.length - 1].props.onPress());
    expect(deleteImageQuietly).toHaveBeenCalledWith('file:///drop.png');
    expect(mockRouter.push).not.toHaveBeenCalled();
  });

  it('「누구와의 대화예요?」에서 비밀 상담을 고르면 저장되지 않는 방을 열고, 닫으면 아무 데도 가지 않는다', () => {
    addRoom('민수');
    const t = mount(<HomeScreen />);
    act(() => byLabel(t, '캡처 없이 상황만 적기').props.onPress());
    const backdrop = t.root.findAll((n) => n.props.accessibilityLabel === '닫기' && typeof n.props.onPress === 'function');
    act(() => backdrop[backdrop.length - 1].props.onPress());
    expect(texts(t).join('\n')).not.toContain('누구와의 대화예요?');
    expect(mockRouter.push).not.toHaveBeenCalled();

    act(() => byLabel(t, '캡처 없이 상황만 적기').props.onPress());
    act(() => pressable(t, '비밀 상담').props.onPress());
    const secret = Object.values(useAppStore.getState().crushes).find((c) => c.secret);
    expect(secret).toBeDefined();
    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/crush/[id]', params: { id: secret!.id, compose: '1' } });
  });

  it('「나에 대해 알려주세요」 카드는 코치와의 짧은 대화를 홈에서 연다', () => {
    const t = mount(<HomeScreen />);
    act(() => pressable(t, '나에 대해 알려주세요').props.onPress());
    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/about-me', params: { from: 'home' } });
  });
});
