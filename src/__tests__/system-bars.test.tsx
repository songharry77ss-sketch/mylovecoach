/**
 * 화면 위아래 시스템 영역 — 갤럭시(버튼 3개·제스처)·아이폰에서 탭 바와 화면이 잘리거나 겹치지 않는다.
 * - 탭 바는 기기 아래 영역만큼 키운다 (높이를 숫자로 고정하면 갤럭시에서 아이콘·이름이 버튼 뒤로 잘렸다)
 * - 아이폰 모달(아래에서 올라오는 카드)은 위를 상태 표시줄만큼 또 띄우지 않는다
 * - 짙은 화면은 보이는 동안에만 상태 표시줄 글자를 흰색으로 바꾼다
 * - 입력 화면은 안드로이드에서도 키보드만큼 올린다
 */
import { act } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { create, type ReactTestRenderer } from 'react-test-renderer';
import { StatusBar } from 'expo-status-bar';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import TabsLayout from '@/app/(tabs)/_layout';
import { Screen } from '@/components/ui/screen';
import { FocusStatusBar, SystemBarsReady } from '@/components/ui/system-bars';

let mockFocused = true;
let mockTabOptions: { tabBarStyle?: object; tabBarAllowFontScaling?: boolean } = {};
jest.mock('expo-router', () => {
  const Tabs = (props: { screenOptions: typeof mockTabOptions }) => {
    mockTabOptions = props.screenOptions;
    return null;
  };
  Tabs.Screen = function MockTabScreen() { return null; };
  return { Tabs, useIsFocused: () => mockFocused };
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
const tabBar = () => StyleSheet.flatten(mockTabOptions.tabBarStyle) as { height: number; paddingTop: number; paddingBottom: number };

describe('탭 바', () => {
  it.each([
    ['갤럭시 버튼 3개', 48],
    ['갤럭시 제스처', 24],
    ['아이폰 홈 막대', 34],
  ])('%s — 아래 영역(%i)만큼 키워서 탭 칸(아이콘·이름)은 늘 같은 높이로 남는다', (_name, bottom) => {
    mount(<TabsLayout />, 40, bottom);
    const s = tabBar();
    expect(s.paddingBottom).toBe(bottom);
    expect(s.height - s.paddingTop - s.paddingBottom).toBeGreaterThanOrEqual(52);
  });

  it('아래 영역이 없는 기기(홈 버튼 아이폰)는 바닥에 조금만 띄우고, 이름 글자는 확대로 칸 밖에 밀리지 않는다', () => {
    mount(<TabsLayout />, 20, 0);
    const s = tabBar();
    expect(s.paddingBottom).toBeGreaterThan(0);
    expect(s.height - s.paddingTop - s.paddingBottom).toBeGreaterThanOrEqual(52);
    expect(mockTabOptions.tabBarAllowFontScaling).toBe(false);
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

  it('탭 화면은 아래 영역을 탭 바가 맡으니 또 더하지 않고, 일반 화면은 아래 영역만큼 띄운다', () => {
    expect(padBottom(mount(<Screen tab><Text>마이</Text></Screen>, 40, 48))).toBeLessThan(48);
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
