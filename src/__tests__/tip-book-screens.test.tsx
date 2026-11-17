/**
 * 탐색 탭(연애팁 백서·더 해 볼 것)과 고민 해답 화면 — 11/12 회의 8번(백서)·3번(연애 연습 빨간 점).
 * 고민 카드 → 해답 화면, 해답 화면의 「이 상황, 센딧에게 물어보기」(누구와의 대화예요? → 그 채팅방에 고민 글 보내기),
 * 연애 연습 줄의 빨간 점(누르거나 연습 탭을 열면 지움, 탐색 탭을 잠깐 열었다 닫는 것만으로는 안 지움).
 */
import { act } from 'react';
import { Modal, Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';

import PracticeTab from '@/app/(tabs)/practice';
import ExploreTab from '@/app/(tabs)/tips';
import WorryScreen from '@/app/tips/[topic]';
import { track } from '@/lib/analytics';
import { WORRIES } from '@/lib/tips';
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
const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true };
let mockParams: Record<string, string> = {};
// 화면에 들어올 때(포커스) 한 번, 떠날 때(정리) 한 번 — 마운트·언마운트로 흉내 낸다
jest.mock('expo-router', () => {
  const { useEffect } = jest.requireActual('react');
  return {
    useRouter: () => mockRouter,
    useLocalSearchParams: () => mockParams,
    useFocusEffect: (effect: () => void | (() => void)) => useEffect(effect, [effect]),
    useIsFocused: () => true,
    Stack: { Screen: () => null },
  };
});
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
jest.mock('@expo/vector-icons', () => ({ Ionicons: Object.assign(() => null, { glyphMap: {} }) }));
jest.mock('expo-linear-gradient', () => {
  const { View } = jest.requireActual('react-native');
  return { LinearGradient: View };
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
const texts = (t: ReactTestRenderer) => t.root.findAllByType(Text).map(textOf);
/** 접근성 이름으로 찾은 누를 수 있는 것 */
const byLabel = (t: ReactTestRenderer, label: string) => t.root.find((n) => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function');
/** 글자로 찾은 누를 수 있는 것 (그 글자를 품은 가장 가까운 누름 칸) */
function pressableWithText(t: ReactTestRenderer, label: string): ReactTestInstance {
  const text = t.root.findAllByType(Text).find((n) => textOf(n) === label);
  if (!text) throw new Error(`글자 없음: ${label}`);
  let node: ReactTestInstance | null = text;
  while (node && typeof node.props.onPress !== 'function') node = node.parent;
  if (!node) throw new Error(`누를 곳 없음: ${label}`);
  return node;
}

const USER = { name: '민준', gender: 'male' as const, style: [], defaultTone: 'natural' as const, createdAt: 1 };
const ROOM = { id: 'c_suyeon', name: '수연', gender: 'female' as const, relationship: 'talking' as const, style: [], notes: '', createdAt: 1, updatedAt: 2, lastMessageAt: 2, heat: 21 };

beforeEach(() => {
  mockRouter.push.mockClear();
  (track as jest.Mock).mockClear();
  mockParams = {};
  useAppStore.setState({ hydrated: true, user: USER, crushes: {}, messages: {}, mindHistory: [], kkti: null, practiceEnabled: false, practiceDotSeen: false });
});
afterEach(() => {
  act(() => tree?.unmount());
  tree = null;
});

describe('탐색 탭 — 연애팁 백서', () => {
  it('맨 위가 「어떤 고민이 있어요?」이고 고민 카드가 모두 보인다 (예전 「연애 팁」 목록·주제 칩은 없다)', () => {
    const t = mount(<ExploreTab />);
    const all = texts(t);
    expect(all).toContain('연애팁 백서');
    expect(all).toContain('어떤 고민이 있어요?');
    for (const w of WORRIES) expect(all).toContain(w.title);
    expect(all).not.toContain('연애 팁');
    expect(all.indexOf('어떤 고민이 있어요?')).toBeLessThan(all.indexOf('더 해 볼 것'));
    expect(all.indexOf('더 해 볼 것')).toBeLessThan(all.indexOf('속마음 카드'));
  });

  it('고민 카드를 누르면 그 고민의 해답 화면으로 간다', () => {
    const t = mount(<ExploreTab />);
    act(() => byLabel(t, '답장이 늦어요, 읽씹, 단답').props.onPress());
    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/tips/[topic]', params: { topic: 'late-reply' } });
    expect(track).toHaveBeenCalledWith('explore_open', { feature: 'worry', worry: 'late-reply' });
  });

  it('연애 연습을 아직 안 봤으면(연습을 안 켜도) 빨간 점 줄이 보이고, 누르면 점을 지우고 연습 탭을 연다', () => {
    const t = mount(<ExploreTab />);
    expect(texts(t).some((s) => s.includes('이런 기능도 있어요'))).toBe(true);
    act(() => byLabel(t, '연애 연습, 새 기능, AI 상대와 카톡 리허설').props.onPress());
    expect(useAppStore.getState().practiceDotSeen).toBe(true);
    expect(mockRouter.push).toHaveBeenCalledWith('/(tabs)/practice');
    expect(texts(t).some((s) => s.includes('이런 기능도 있어요'))).toBe(false);
  });

  it('탐색 탭을 잠깐 열었다 떠나는 것만으로는 빨간 점을 지우지 않는다 (그 줄을 2초 넘게 봐야 지운다)', () => {
    const t = mount(<ExploreTab />);
    act(() => t.unmount());
    tree = null;
    expect(useAppStore.getState().practiceDotSeen).toBe(false);
  });

  it('이미 봤으면 빨간 점 없이 평소 설명을 보여 준다', () => {
    useAppStore.setState({ practiceDotSeen: true });
    const t = mount(<ExploreTab />);
    expect(texts(t).some((s) => s.includes('이런 기능도 있어요'))).toBe(false);
    expect(byLabel(t, '연애 연습, AI 상대와 카톡 리허설')).toBeTruthy();
  });

  it('KKTI · 비밀 상담 바로가기는 그대로 간다', () => {
    const t = mount(<ExploreTab />);
    act(() => byLabel(t, 'KKTI 테스트, 카톡 습관 속 나의 연애 유형').props.onPress());
    expect(mockRouter.push).toHaveBeenCalledWith('/kkti');
    act(() => byLabel(t, '비밀 상담, 기록이 남지 않아요').props.onPress());
    expect(mockRouter.push).toHaveBeenLastCalledWith({ pathname: '/crush/[id]', params: { id: expect.any(String) } });
  });
});

describe('연애 연습 탭', () => {
  it('열면 빨간 점을 지운다', () => {
    mount(<PracticeTab />);
    expect(useAppStore.getState().practiceDotSeen).toBe(true);
  });
});

describe('고민 해답 화면', () => {
  const worry = WORRIES[0];

  it('한 줄 결론 → 해결 단계 → 묶은 팁 → 속마음 상황 순서로 보여 준다', () => {
    mockParams = { topic: worry.id };
    const t = mount(<WorryScreen />);
    const all = texts(t);
    expect(all).toContain(worry.title);
    expect(all).toContain(worry.answer);
    for (const s of worry.steps) expect(all).toContain(s.title);
    expect(all.indexOf(worry.answer)).toBeLessThan(all.indexOf(worry.steps[0].title));
    expect(all).toContain('같이 보면 좋은 팁');
    // 내가 남자면 여자 속마음
    expect(all).toContain('이럴 때 여자 속마음은?');
  });

  it('속마음 상황을 누르면 그 상황으로 속마음 풀이를 연다', () => {
    mockParams = { topic: worry.id };
    const t = mount(<WorryScreen />);
    act(() => pressableWithText(t, '여자가 "뭐해?"라고만 보내고 2시간째 답이 없어요.').props.onPress());
    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/mind', params: { situation: '여자가 "뭐해?"라고만 보내고 2시간째 답이 없어요.', perspective: 'female' } });
  });

  it('채팅방이 있으면 「누구와의 대화예요?」를 띄우고, 고른 방에 고민 글을 바로 보낸다', () => {
    useAppStore.setState({ crushes: { [ROOM.id]: ROOM }, messages: { [ROOM.id]: [] } });
    mockParams = { topic: worry.id };
    const t = mount(<WorryScreen />);
    expect(t.root.findByType(Modal).props.visible).toBe(false);
    act(() => byLabel(t, '이 상황, 센딧에게 물어보기').props.onPress());
    expect(t.root.findByType(Modal).props.visible).toBe(true);
    act(() => byLabel(t, '수연과의 대화').props.onPress());
    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/crush/[id]', params: { id: ROOM.id, pendingText: worry.ask } });
    expect(track).toHaveBeenCalledWith('tipbook_ask', { worry: worry.id, target: 'crush', rooms: 1 });
  });

  it('채팅방이 없으면 첫 채팅방을 만들어 바로 보낸다', () => {
    mockParams = { topic: 'ex' };
    const t = mount(<WorryScreen />);
    act(() => byLabel(t, '이 상황, 센딧에게 물어보기').props.onPress());
    const rooms = Object.values(useAppStore.getState().crushes);
    expect(rooms).toHaveLength(1);
    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/crush/[id]', params: { id: rooms[0].id, pendingText: WORRIES.find((w) => w.id === 'ex')!.ask } });
  });

  it('없는 고민 주소면 안내와 돌아가기 버튼', () => {
    mockParams = { topic: 'nothing' };
    const t = mount(<WorryScreen />);
    expect(texts(t)).toContain('찾는 고민이 없어요');
  });
});
