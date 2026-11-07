/**
 * 화면 위아래 시스템 영역 — 갤럭시(버튼 3개·제스처)·아이폰에서 탭 바와 화면이 잘리거나 겹치지 않는다.
 * - 탭 바는 떠 있는 유리 알약 + 「새 채팅」 구슬 (2026-11-07). 기기 아래 영역(홈 막대·버튼 3개·제스처) 위로 띄우고, 탭 화면은 그만큼 아래를 비운다
 * - 아이폰 모달(아래에서 올라오는 카드)은 위를 상태 표시줄만큼 또 띄우지 않는다
 * - 짙은 화면은 보이는 동안에만 상태 표시줄 글자를 흰색으로 바꾼다
 * - 입력 화면은 안드로이드에서도 키보드만큼 올린다
 */
import { act } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { create, type ReactTestRenderer } from 'react-test-renderer';
import { StatusBar } from 'expo-status-bar';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import TabsLayout from '@/app/(tabs)/_layout';
import { GlassTabBar } from '@/components/ui/glass-tab-bar';
import { TAB_BAR_HEIGHT, tabBarBottom } from '@/components/ui/tab-bar-space';
import { Screen } from '@/components/ui/screen';
import { FocusStatusBar, SystemBarsReady } from '@/components/ui/system-bars';

let mockFocused = true;
let mockTabOptions: { tabBarStyle?: object; tabBarAllowFontScaling?: boolean } = {};
let mockTabBar: unknown = null;
const mockPush = jest.fn();
jest.mock('expo-router', () => {
  const Tabs = (props: { screenOptions: typeof mockTabOptions; tabBar?: unknown }) => {
    mockTabOptions = props.screenOptions;
    mockTabBar = props.tabBar;
    return null;
  };
  Tabs.Screen = function MockTabScreen() { return null; };
  return { Tabs, useIsFocused: () => mockFocused, useRouter: () => ({ push: mockPush }) };
});
jest.mock('@/lib/analytics', () => ({ track: jest.fn() }));
// 탭 바 렌즈·구슬 움직임(Reanimated·worklets)은 바로 끝나는 흉내로
jest.mock('react-native-worklets', () => jest.requireActual('react-native-worklets/src/mock'));
jest.mock('react-native-reanimated', () => ({ ...jest.requireActual('react-native-reanimated/mock'), useReducedMotion: () => false }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: Object.assign(() => null, { glyphMap: {} }) }));
jest.mock('expo-linear-gradient', () => {
  const { View } = jest.requireActual('react-native');
  return { LinearGradient: View };
});
jest.mock('expo-status-bar', () => ({ StatusBar: function MockStatusBar() { return null; } }));
jest.mock('@/store/app-store', () => ({ useAppStore: (pick: (s: { practiceEnabled: boolean }) => unknown) => pick({ practiceEnabled: false }) }));
jest.mock('@/lib/haptics', () => ({ haptic: new Proxy({}, { get: () => () => {} }) }));

const metrics = (top: number, bottom: number) => ({ frame: { x: 0, y: 0, width: 384, height: 832 }, insets: { top, left: 0, right: 0, bottom } });
function mount(element: React.ReactElement, top: number, bottom: number): ReactTestRenderer {
  let tree: ReactTestRenderer | null = null;
  act(() => {
    tree = create(<SafeAreaProvider initialMetrics={metrics(top, bottom)}>{element}</SafeAreaProvider>);
  });
  return tree as unknown as ReactTestRenderer;
}
// 탭 바에 넘어오는 내비게이션 상태 — 홈·연애 연습(꺼짐)·탐색·마이
const routes = [
  { key: 'index-k', name: 'index' },
  { key: 'practice-k', name: 'practice' },
  { key: 'tips-k', name: 'tips' },
  { key: 'my-k', name: 'my' },
];
const descriptors = Object.fromEntries(
  routes.map((r) => [
    r.key,
    { options: { title: ({ index: '홈', practice: '연애 연습', tips: '탐색', my: '마이' } as Record<string, string>)[r.name], tabBarItemStyle: r.name === 'practice' ? { display: 'none' } : undefined, tabBarIcon: () => null } },
  ]),
);
const fakeNav = () => ({ emit: jest.fn(() => ({ defaultPrevented: false })), navigate: jest.fn() });
function mountBar(index: number, bottom: number, nav = fakeNav()) {
  const props = { state: { index, routes, key: 'tabs', routeNames: routes.map((r) => r.name), type: 'tab', stale: false, history: [] }, descriptors, navigation: nav, insets: { top: 0, left: 0, right: 0, bottom } };
  const t = mount(<GlassTabBar {...(props as unknown as Parameters<typeof GlassTabBar>[0])} />, 40, bottom);
  return { t, nav };
}
// 누를 수 있는 컴포넌트(호스트 View 가 아닌 것) 하나씩만
const pressables = (t: ReactTestRenderer, pick: (props: Record<string, unknown>) => boolean) => t.root.findAll((n) => typeof n.type !== 'string' && typeof n.props.onPress === 'function' && pick(n.props));
const tabs = (t: ReactTestRenderer) => pressables(t, (p) => p.accessibilityRole === 'tab');

describe('떠 있는 유리 탭 바', () => {
  afterEach(() => {
    Platform.OS = 'ios';
    mockPush.mockClear();
  });

  it('탭 레이아웃은 유리 탭 바를 쓰고, 이름 글자는 확대로 칸 밖에 밀리지 않는다', () => {
    mount(<TabsLayout />, 40, 34);
    expect(typeof mockTabBar).toBe('function');
    expect(mockTabOptions.tabBarAllowFontScaling).toBe(false);
  });

  it.each([
    ['아이폰 홈 막대', 'ios', 34],
    ['갤럭시 버튼 3개', 'android', 48],
    ['갤럭시 제스처', 'android', 24],
    ['홈 버튼 아이폰', 'ios', 0],
  ])('%s — 탭 바가 기기 아래 영역(버튼·홈 막대)과 겹치지 않게 떠 있다', (_name, os, bottom) => {
    const at = tabBarBottom(bottom, os);
    if (os === 'android') expect(at).toBeGreaterThanOrEqual(bottom);
    // 아이폰은 iOS 26 탭 바처럼 홈 막대 영역에 조금 걸치되, 막대(바닥에서 약 13pt)보다는 위
    if (os === 'ios') expect(at).toBeGreaterThanOrEqual(12);
    Platform.OS = os as 'ios' | 'android';
    const { t } = mountBar(0, bottom);
    const root = t.root.findAll((n) => n.type === View && StyleSheet.flatten(n.props.style)?.position === 'absolute' && StyleSheet.flatten(n.props.style)?.bottom === 0)[0];
    expect(StyleSheet.flatten(root.props.style).paddingBottom).toBe(at);
  });

  it('숨긴 탭(연애 연습 꺼짐)은 빼고 홈·탐색·마이만, 지금 탭은 선택됨으로 읽힌다', () => {
    const { t } = mountBar(2, 34);
    expect(tabs(t).map((n) => n.props.accessibilityLabel)).toEqual(['홈', '탐색', '마이']);
    expect(tabs(t).map((n) => n.props.accessibilityState.selected)).toEqual([false, true, false]);
  });

  it('다른 탭을 누르면 tabPress 를 알리고 그 탭으로 간다 · 지금 탭을 다시 누르면 이동하지 않는다', () => {
    const { t, nav } = mountBar(0, 34);
    act(() => tabs(t)[2].props.onPress());
    expect(nav.emit).toHaveBeenCalledWith({ type: 'tabPress', target: 'my-k', canPreventDefault: true });
    expect(nav.navigate).toHaveBeenCalledWith('my', undefined);
    nav.navigate.mockClear();
    act(() => tabs(t)[0].props.onPress());
    expect(nav.navigate).not.toHaveBeenCalled();
  });

  it('오른쪽 「새 채팅」 구슬 버튼은 어느 탭에서든 새 채팅방을 연다', () => {
    const { t } = mountBar(2, 48);
    const [fab] = pressables(t, (p) => p.accessibilityLabel === '새 채팅 시작');
    act(() => fab.props.onPress());
    expect(mockPush).toHaveBeenCalledWith('/crush/new');
  });
});

describe('화면 여백 (Screen)', () => {
  afterEach(() => {
    Platform.OS = 'ios';
    mockFocused = true;
  });
  const padTop = (t: ReactTestRenderer) => (StyleSheet.flatten(t.root.findByType(ScrollView).props.contentContainerStyle) as { paddingTop: number }).paddingTop;
  const padBottom = (t: ReactTestRenderer) => (StyleSheet.flatten(t.root.findByType(ScrollView).props.contentContainerStyle) as { paddingBottom: number }).paddingBottom;

  it('아이폰 모달은 상태 표시줄 높이를 또 띄우지 않고, 카드 바깥(검은 배경) 상태 표시줄은 흰 글자', () => {
    Platform.OS = 'ios';
    const t = mount(<Screen sheet safeTop><Text>결제</Text></Screen>, 59, 34);
    expect(padTop(t)).toBeLessThan(59);
    expect(t.root.findAllByType(StatusBar).map((n) => n.props.style)).toEqual(['light']);
  });

  it('안드로이드에서는 같은 모달도 화면 전체로 뜨므로 상태 표시줄만큼 띄운다', () => {
    Platform.OS = 'android';
    const t = mount(<Screen sheet safeTop><Text>결제</Text></Screen>, 40, 48);
    expect(padTop(t)).toBeGreaterThanOrEqual(40);
    expect(t.root.findAllByType(StatusBar)).toHaveLength(0);
  });

  it('탭 화면은 떠 있는 탭 바(+ 기기 아래 영역)만큼 비워 마지막 내용이 가리지 않고, 일반 화면은 아래 영역만큼 띄운다', () => {
    Platform.OS = 'android';
    expect(padBottom(mount(<Screen tab><Text>마이</Text></Screen>, 40, 48))).toBeGreaterThanOrEqual(tabBarBottom(48, 'android') + TAB_BAR_HEIGHT);
    Platform.OS = 'ios';
    expect(padBottom(mount(<Screen tab><Text>마이</Text></Screen>, 59, 34))).toBeGreaterThanOrEqual(tabBarBottom(34, 'ios') + TAB_BAR_HEIGHT);
    expect(padBottom(mount(<Screen><Text>설정</Text></Screen>, 40, 48))).toBeGreaterThanOrEqual(48);
  });

  it('짙은 무대 화면은 보이는 동안에만 흰 글자를 띄운다 (다른 탭으로 가면 기본색으로 돌아간다)', () => {
    expect(mount(<FocusStatusBar style="light" />, 40, 48).root.findAllByType(StatusBar)).toHaveLength(1);
    mockFocused = false;
    expect(mount(<FocusStatusBar style="light" />, 40, 48).root.findAllByType(StatusBar)).toHaveLength(0);
  });

  it('앱을 켤 때 로고 인트로(밝은 바탕)가 덮고 있는 동안은 흰 글자를 띄우지 않는다', () => {
    const during = mount(<SystemBarsReady.Provider value={false}><FocusStatusBar style="light" /></SystemBarsReady.Provider>, 40, 48);
    expect(during.root.findAllByType(StatusBar)).toHaveLength(0);
    const after = mount(<SystemBarsReady.Provider value={true}><FocusStatusBar style="light" /></SystemBarsReady.Provider>, 40, 48);
    expect(after.root.findAllByType(StatusBar)).toHaveLength(1);
  });

  it('루트의 기본 상태 표시줄은 화면(Stack)보다 먼저 그린다 — 나중에 쌓인 것이 이기므로 화면의 흰 글자가 덮이지 않게', () => {
    const src = readFileSync(join(__dirname, '..', 'app', '_layout.tsx'), 'utf8');
    const rootBar = src.indexOf('<StatusBar ');
    expect(rootBar).toBeGreaterThan(0);
    expect(rootBar).toBeLessThan(src.indexOf('<Stack'));
    expect(src.indexOf('<StatusBar ', rootBar + 1)).toBe(-1);
    expect(src).toMatch(/<SystemBarsReady\.Provider value=\{introDone\}>/);
  });

  it('입력 화면은 안드로이드에서도 키보드만큼 올린다 (화면을 끝까지 쓰는 방식이라 창이 저절로 줄지 않는다)', () => {
    Platform.OS = 'android';
    const t = mount(<Screen keyboard><Text>상대 정보</Text></Screen>, 40, 48);
    expect(t.root.findByType(KeyboardAvoidingView).props.behavior).toBe('padding');
  });
});
