/**
 * 동의·개인정보 화면 — 첫 화면 동의 창(「모두 동의하고 시작」·필수/선택 항목·미리 체크 없음),
 * 마이(이용 기록 스위치 없음 · 개인정보 설정으로 가는 줄 · 맨 아래 「모든 데이터 삭제」·「회원 탈퇴」),
 * 마이 → 개인정보 설정(코칭 내용 저장 켜고 끄기 · 끄면 코칭 내용 삭제 요청 · 처리 정지 메일), 홈의 바뀐 개인정보 안내 카드.
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
jest.mock('expo-router', () => ({ useRouter: () => mockRouter, useFocusEffect: () => {} }));
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
jest.mock('@/lib/images', () => ({ pickImage: jest.fn(async () => null), cleanupOrphanImages: jest.fn(), clearImageCaches: jest.fn() }));
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
  useAppStore.getState().resetAll();
  useAppStore.setState({ hydrated: true, pendingDeletion: null, deviceId: 'd_screen_test', member: null, user: null, crushes: {}, privacyNoticeSeen: 0, legacyServerRecords: false });
});

afterEach(() => {
  act(() => tree?.unmount());
  tree = null;
});

describe('첫 화면 동의 창', () => {
  it('처음 시작 버튼을 누르면 필수·선택 항목이 체크되지 않은 채로 뜬다', () => {
    const t = mount(<Start />);
    expect(texts(t).join('\n')).not.toContain('시작하기 전에 확인해 주세요');
    act(() => pressable(t, '캡처 없이 상황만 적을래요').props.onPress());
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
    expect(tracked).toHaveBeenCalledWith('start_consent_open', { mode: 'text' });
  });

  it('「모두 동의하고 시작」은 선택 항목(코칭 내용 저장)까지 모두 동의하고, 누른 버튼의 일을 이어서 한다', () => {
    const t = mount(<Start />);
    act(() => pressable(t, '캡처 없이 상황만 적을래요').props.onPress());
    act(() => pressable(t, '모두 동의하고 시작').props.onPress());
    const s = useAppStore.getState();
    expect(s.termsAgreedAt).not.toBeNull();
    expect(s.contentConsent).toBe(true);
    expect(s.privacyNoticeSeen).toBe(PRIVACY_NOTICE_VERSION);
    expect(tracked).toHaveBeenCalledWith('start_consent', { all: true, content: true, mode: 'text' });
    expect(mockRouter.replace).toHaveBeenCalledWith(expect.objectContaining({ pathname: '/crush/[id]' }));
    expect(texts(t).join('\n')).not.toContain('시작하기 전에 확인해 주세요');
  });

  it('필수 항목만 체크하고 「선택한 항목으로 시작」하면 코칭 내용 저장은 동의 안 함으로 남는다', () => {
    const t = mount(<Start />);
    act(() => pressable(t, '캡처 없이 상황만 적을래요').props.onPress());
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
    act(() => pressable(t, '캡처 없이 상황만 적을래요').props.onPress());
    const close = t.root.findAll((n) => n.props.accessibilityLabel === '닫기' && typeof n.props.onPress === 'function');
    act(() => close[close.length - 1].props.onPress());
    expect(texts(t).join('\n')).not.toContain('시작하기 전에 확인해 주세요');
    expect(useAppStore.getState().termsAgreedAt).toBeNull();
    expect(mockRouter.replace).not.toHaveBeenCalled();

    act(() => {
      useAppStore.setState({ termsAgreedAt: Date.now() });
    });
    act(() => pressable(t, '캡처 없이 상황만 적을래요').props.onPress());
    expect(texts(t).join('\n')).not.toContain('시작하기 전에 확인해 주세요');
    expect(mockRouter.replace).toHaveBeenCalledWith(expect.objectContaining({ pathname: '/crush/[id]' }));
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
