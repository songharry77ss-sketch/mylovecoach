/**
 * 마이 정리 (11/12 회의 4번 「내용이 너무 많다 → 큰 주제로 묶기」 · 3번 연애 연습 빨간 점).
 * - 첫 화면: 프로필 · 바로 쓰기(빠른 코칭 · 비밀 상담 · 연애 연습) · 큰 주제 줄(계정 · 앱 설정 · 개인정보 · 도움말·정보)만, 스위치 없음
 * - 연애 연습: 아직 안 봤으면 「새 기능」 빨간 점, 누르면 켜고(점도 사라짐) 연습 탭으로
 * - 예전 마이에 있던 설정·링크·버튼이 하위 화면 어딘가에 모두 있다
 */
import { act } from 'react';
import { Switch, Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';

import MyScreen from '@/app/(tabs)/my';
import AccountSettings from '@/app/settings/account';
import AppSettings from '@/app/settings/app';
import DataSettings from '@/app/settings/data';
import HelpSettings from '@/app/settings/help';
import { ListRow } from '@/components/ui/list-row';
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
jest.mock('expo-router', () => ({ useRouter: () => mockRouter, useLocalSearchParams: () => ({}), useFocusEffect: () => {}, useIsFocused: () => true, Stack: { Screen: () => null } }));
// Reanimated(네이티브 worklets)는 테스트 환경에서 띄울 수 없어서 바로 끝나는 흉내로 바꾼다 (consent-screens.test.tsx 와 같은 방식)
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
jest.mock('@/components/ui/toast', () => ({ useToast: () => ({ show: jest.fn() }) }));
jest.mock('@/lib/haptics', () => ({ haptic: new Proxy({}, { get: () => () => {} }), setHapticsEnabled: () => {} }));
jest.mock('@/lib/analytics', () => ({ track: jest.fn() }));
jest.mock('@/lib/images', () => ({ pickImage: jest.fn(async () => null), cleanupOrphanImages: jest.fn(), clearImageCaches: jest.fn(), deleteImageQuietly: jest.fn() }));
jest.mock('@/components/auth/apple-deletion-help', () => ({ useAccountDeletion: () => ({ busy: false, remove: jest.fn(), sheet: null }) }));
// 신고 서버가 있는 빌드 — 「AI 답변 신고하기」 줄이 보인다
jest.mock('@/components/coach/ai-report-sheet', () => ({ useAiReport: () => ({ available: true, open: jest.fn(), sheet: null }) }));
jest.mock('@/hooks/use-plan-products', () => ({ usePlanProducts: () => [], onSalePrice: () => undefined }));
// 스토어 결제가 되는 빌드 — 「이용권·계정」
jest.mock('@/lib/billing/iap', () => ({ billingSupported: true, openSubscriptionManagement: jest.fn(async () => {}), restorePremium: jest.fn() }));
jest.mock('@/lib/billing/team', () => ({ refreshTeam: jest.fn(async () => {}) }));
jest.mock('@/lib/auth', () => ({ providerLabel: (p: string) => (p === 'kakao' ? '카카오' : p), signOut: jest.fn() }));
jest.mock('@/lib/supabase', () => ({ authAvailable: true }));
jest.mock('@/lib/coach-client', () => ({ aiRouteOf: () => null }));
jest.mock('@/lib/app-update', () => ({ openStore: jest.fn() }));
jest.mock('@/lib/floating', () => ({ floatingSupported: false, isRunning: () => false, canDrawOverlays: () => false, start: jest.fn(), stop: jest.fn(), openOverlaySettings: jest.fn() }));

const METRICS = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } };
let tree: ReactTestRenderer | null = null;

function mount(element: React.ReactElement): ReactTestRenderer {
  act(() => tree?.unmount());
  act(() => {
    tree = create(<SafeAreaProvider initialMetrics={METRICS}>{element}</SafeAreaProvider>);
  });
  return tree as unknown as ReactTestRenderer;
}

const textOf = (node: ReactTestInstance): string => node.children.map((c) => (typeof c === 'string' ? c : textOf(c))).join('');
const texts = (t: ReactTestRenderer) => t.root.findAllByType(Text).map(textOf);
const rowTitles = (t: ReactTestRenderer) => t.root.findAllByType(ListRow).map((r) => r.props.title as string);
const switchLabels = (t: ReactTestRenderer) => t.root.findAllByType(Switch).map((s) => s.props.accessibilityLabel as string);
const row = (t: ReactTestRenderer, title: string) => {
  const found = t.root.findAllByType(ListRow).find((r) => r.props.title === title);
  if (!found) throw new Error(`「${title}」 줄이 없어요`);
  return found;
};
/** 바로 쓰기 칸 — 접근성 이름이 「연애 연습, …」처럼 시작한다 */
const quick = (t: ReactTestRenderer, label: string) => {
  const found = t.root.findAll((n) => typeof n.props.onPress === 'function' && typeof n.props.accessibilityLabel === 'string' && n.props.accessibilityLabel.startsWith(`${label},`));
  if (!found.length) throw new Error(`「${label}」 칸이 없어요`);
  return found[found.length - 1];
};
const tracked = track as jest.Mock;
const member = { userId: 'u_1', provider: 'kakao', nickname: '지훈', joinedAt: 1 };

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
  useAppStore.setState({ hydrated: true, pendingDeletion: null, deviceId: 'd_my_test', member: null, user: null, crushes: {}, practiceEnabled: false, practiceDotSeen: false, hapticsOn: true });
});

afterEach(() => {
  act(() => tree?.unmount());
  tree = null;
});

describe('마이 첫 화면 — 큰 주제로 묶기', () => {
  it('스위치 없이 바로 쓰기 셋과 큰 주제 줄 넷만 있고, 줄마다 하위 화면으로 간다', () => {
    const t = mount(<MyScreen />);
    expect(switchLabels(t)).toEqual([]);
    expect(rowTitles(t)).toEqual(['이용권·계정', '앱 설정', '개인정보', '도움말·정보']);
    const shown = texts(t);
    for (const label of ['빠른 코칭', '비밀 상담', '연애 연습']) expect(shown).toContain(label);

    const go: [string, string][] = [
      ['이용권·계정', '/settings/account'],
      ['앱 설정', '/settings/app'],
      ['개인정보', '/settings/data'],
      ['도움말·정보', '/settings/help'],
    ];
    for (const [title, path] of go) {
      act(() => row(t, title).props.onPress());
      expect(mockRouter.push).toHaveBeenLastCalledWith(path);
    }
  });

  it('줄 오른쪽에 지금 상태를 짧게 — 가입 · 진동', () => {
    const t = mount(<MyScreen />);
    expect(row(t, '이용권·계정').props.value).toBe('가입 전');
    expect(row(t, '앱 설정').props.value).toBe('진동 켬');
    act(() => {
      useAppStore.setState({ member, hapticsOn: false });
    });
    expect(row(t, '이용권·계정').props.value).toBe('카카오 계정');
    expect(row(t, '앱 설정').props.value).toBe('진동 끔');
  });

  it('바로 쓰기 — 빠른 코칭은 빠른 코칭 화면, 비밀 상담은 저장되지 않는 방을 열어 들어간다', () => {
    const t = mount(<MyScreen />);
    act(() => quick(t, '빠른 코칭').props.onPress());
    expect(mockRouter.push).toHaveBeenLastCalledWith('/quick');
    act(() => quick(t, '비밀 상담').props.onPress());
    const secret = Object.values(useAppStore.getState().crushes).find((c) => c.secret);
    expect(secret).toBeDefined();
    expect(mockRouter.push).toHaveBeenLastCalledWith({ pathname: '/crush/[id]', params: { id: secret!.id } });
  });
});

describe('연애 연습 빨간 점 (회의 3번)', () => {
  it('아직 안 봤으면 「새 기능」이 보이고, 누르면 켜서 연습 탭으로 간다 — 그 뒤엔 점이 사라진다', () => {
    const t = mount(<MyScreen />);
    expect(texts(t)).toContain('새 기능');
    act(() => quick(t, '연애 연습').props.onPress());
    const s = useAppStore.getState();
    expect(s.practiceEnabled).toBe(true);
    expect(s.practiceDotSeen).toBe(true);
    expect(tracked).toHaveBeenCalledWith('practice_toggle', { on: true });
    expect(mockRouter.push).toHaveBeenLastCalledWith('/(tabs)/practice');
    expect(texts(t)).not.toContain('새 기능');
  });

  it('이미 켠 사람은 점 없이, 누르면 켜기 기록 없이 연습 탭으로만 간다', () => {
    act(() => {
      useAppStore.setState({ practiceEnabled: true, practiceDotSeen: true });
    });
    const t = mount(<MyScreen />);
    expect(texts(t)).not.toContain('새 기능');
    act(() => quick(t, '연애 연습').props.onPress());
    expect(tracked).not.toHaveBeenCalled();
    expect(mockRouter.push).toHaveBeenLastCalledWith('/(tabs)/practice');
  });

  it('끄는 건 앱 설정의 스위치 — 켜고 끌 때 예전처럼 기록한다', () => {
    act(() => {
      useAppStore.setState({ practiceEnabled: true, practiceDotSeen: true });
    });
    const t = mount(<AppSettings />);
    const sw = t.root.findAllByType(Switch).find((s) => s.props.accessibilityLabel === '연애 연습 켜기')!;
    expect(sw.props.value).toBe(true);
    act(() => sw.props.onValueChange(false));
    expect(useAppStore.getState().practiceEnabled).toBe(false);
    expect(tracked).toHaveBeenCalledWith('practice_toggle', { on: false });
  });
});

describe('예전 마이의 기능은 하나도 빠지지 않았다 (자리만 옮김)', () => {
  it('설정 줄·스위치·링크가 하위 화면 어딘가에 모두 있다', () => {
    act(() => {
      useAppStore.setState({ member });
    });
    const seen = { rows: new Set<string>(), switches: new Set<string>(), texts: new Set<string>() };
    for (const screen of [<MyScreen key="my" />, <AccountSettings key="account" />, <AppSettings key="app" />, <DataSettings key="data" />, <HelpSettings key="help" />]) {
      const t = mount(screen);
      rowTitles(t).forEach((x) => seen.rows.add(x));
      switchLabels(t).forEach((x) => seen.switches.add(x));
      texts(t).forEach((x) => seen.texts.add(x));
    }
    // 예전 마이의 「이용권」·「계정」·「AI 코치」·「프라이버시」·「정보」 묶음의 줄 (이 빌드에서 보이는 것)
    for (const title of [
      '구독 관리 · 해지',
      '구매 복원',
      '카카오로 가입됨',
      '로그아웃',
      'AI 코치 연결',
      '내 프로필 · 추구미 · 목표',
      'AI 답변 신고하기',
      '개인정보 설정',
      '사용법 다시 보기',
      '개인정보 처리방침',
      '이용약관',
      '문의하기',
      '앱 버전',
      '내 기기 ID',
    ]) {
      expect(seen.rows).toContain(title);
    }
    // 예전 「기능」·「프라이버시」의 스위치
    for (const label of ['연애 연습 켜기', '진동 효과', '채팅 미리보기 숨기기', 'AI 분석 동의']) expect(seen.switches).toContain(label);
    // 바로 쓰기 칸과 맨 아래 작은 글자 버튼
    for (const label of ['빠른 코칭', '비밀 상담', '연애 연습', '회원 탈퇴', '모든 데이터 삭제']) expect(seen.texts).toContain(label);
  });

  it('비회원에게는 계정 화면에 가입 줄이 있다', () => {
    const t = mount(<AccountSettings />);
    act(() => row(t, rowTitles(t).find((x) => /가입하고 무료 코칭 \d+회 받기/.test(x))!).props.onPress());
    expect(mockRouter.push).toHaveBeenLastCalledWith('/signup');
  });
});
