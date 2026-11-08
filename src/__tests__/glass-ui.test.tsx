/**
 * 1.2 개편 「떠 있는 유리」 공통 부품
 * - 탭 화면 바탕은 옅은 회색(canvas), 그 밖은 흰 바탕
 * - 큰 제목이 있는 화면은 제목이 사라질 만큼 내리면 유리 머리말이 나타나고, 맨 위로 오면 숨는다
 * - 묶음 카드(ListGroup)는 줄 사이에 가는 선을 넣고, 안의 줄은 카드 여백·앱 색 아이콘을 쓴다
 * - 회색 바탕 위 칩은 흰 바탕+테두리
 */
import { act } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { create, type ReactTestRenderer } from 'react-test-renderer';

import { Chip } from '@/components/ui/chip';
import { GlassHeader } from '@/components/ui/glass-header';
import { ListGroup } from '@/components/ui/list-group';
import { ListRow } from '@/components/ui/list-row';
import { Screen } from '@/components/ui/screen';
import { Colors } from '@/constants/theme';

jest.mock('expo-router', () => ({ useIsFocused: () => true }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: Object.assign(() => null, { glyphMap: {} }) }));
jest.mock('expo-linear-gradient', () => {
  const { View } = jest.requireActual('react-native');
  return { LinearGradient: View };
});
jest.mock('expo-status-bar', () => ({ StatusBar: function MockStatusBar() { return null; } }));
jest.mock('@/lib/haptics', () => ({ haptic: new Proxy({}, { get: () => () => {} }) }));

const light = Colors.light;
const metrics = { frame: { x: 0, y: 0, width: 393, height: 852 }, insets: { top: 59, left: 0, right: 0, bottom: 34 } };
function mount(element: React.ReactElement): ReactTestRenderer {
  let tree: ReactTestRenderer | null = null;
  act(() => {
    tree = create(<SafeAreaProvider initialMetrics={metrics}>{element}</SafeAreaProvider>);
  });
  return tree as unknown as ReactTestRenderer;
}
const flat = (node: { props: { style?: unknown } }) => StyleSheet.flatten(node.props.style as never) as Record<string, unknown>;
const rootBg = (t: ReactTestRenderer) => flat(t.root.findAllByType(View)[0]).backgroundColor;
const scrollTo = (t: ReactTestRenderer, y: number) =>
  act(() => {
    t.root.findByType(ScrollView).props.onScroll({ nativeEvent: { contentOffset: { x: 0, y } } });
  });

describe('바탕색', () => {
  it('탭 화면은 canvas, 그 밖은 흰 바탕', () => {
    expect(rootBg(mount(<Screen tab safeTop><Text>마이</Text></Screen>))).toBe(light.canvas);
    expect(rootBg(mount(<Screen safeTop><Text>결제</Text></Screen>))).toBe(light.background);
    expect(rootBg(mount(<Screen tab background="#123456"><Text>직접</Text></Screen>))).toBe('#123456');
  });
});

describe('스크롤 유리 머리말', () => {
  it('title 이 있으면 제목이 사라질 만큼(64) 내렸을 때 보이고, 맨 위로 오면 숨는다', () => {
    const t = mount(
      <Screen tab safeTop title="마이">
        <Text>마이</Text>
      </Screen>,
    );
    const header = () => t.root.findByType(GlassHeader);
    expect(header().props).toMatchObject({ title: '마이', top: 59, visible: false });
    scrollTo(t, 40);
    expect(header().props.visible).toBe(false);
    scrollTo(t, 90);
    expect(header().props.visible).toBe(true);
    scrollTo(t, 0);
    expect(header().props.visible).toBe(false);
  });

  it('title 이 없으면 머리말을 그리지 않는다 (예전 화면 그대로)', () => {
    const t = mount(
      <Screen safeTop>
        <Text>설정</Text>
      </Screen>,
    );
    expect(t.root.findAllByType(GlassHeader)).toHaveLength(0);
  });

  it('숨어 있을 때는 화면 읽기에서 빠진다', () => {
    const t = mount(<GlassHeader title="탐색" top={59} visible={false} />);
    const wrap = t.root.findAll((n) => n.props.importantForAccessibility != null)[0];
    expect(wrap.props.importantForAccessibility).toBe('no-hide-descendants');
    expect(wrap.props.accessibilityElementsHidden).toBe(true);
  });
});

describe('묶음 카드 (ListGroup)', () => {
  it('제목·줄·줄 사이 가는 선 — 줄 3개면 선 2개, 빈 자리(null)는 건너뛴다', () => {
    const t = mount(
      <ListGroup title="프라이버시" footer="이 기기에만 저장돼요">
        <ListRow icon="eye-off-outline" title="채팅 미리보기 숨기기" />
        {null}
        <ListRow icon="shield-outline" title="개인정보 설정" onPress={() => {}} />
        <ListRow icon="trash-outline" title="모든 데이터 삭제" destructive onPress={() => {}} />
      </ListGroup>,
    );
    const texts = t.root.findAllByType(Text).map((n) => n.props.children);
    expect(texts).toEqual(expect.arrayContaining(['프라이버시', '채팅 미리보기 숨기기', '개인정보 설정', '모든 데이터 삭제', '이 기기에만 저장돼요']));
    const separators = t.root.findAll((n) => typeof n.type === 'string' && flat(n).height === StyleSheet.hairlineWidth && flat(n).backgroundColor === light.separator);
    expect(separators).toHaveLength(2);
  });

  it('카드 안 줄은 아이콘을 앱 색 옅은 바탕에 — 밖의 줄은 예전처럼 회색', () => {
    const inside = mount(
      <ListGroup>
        <ListRow icon="sparkles-outline" title="AI 코치 연결" />
      </ListGroup>,
    );
    const outside = mount(<ListRow icon="sparkles-outline" title="AI 코치 연결" />);
    const iconBg = (t: ReactTestRenderer) => t.root.findAll((n) => typeof n.type === 'string' && flat(n).width === 36 && flat(n).height === 36).map((n) => flat(n).backgroundColor)[0];
    expect(iconBg(inside)).toBe(light.primarySoft);
    expect(iconBg(outside)).toBe(light.surface);
  });
});

describe('칩', () => {
  const chipStyle = (t: ReactTestRenderer) => {
    const node = t.root.find((n) => typeof n.props.style === 'function');
    return StyleSheet.flatten(node.props.style({ pressed: false })) as Record<string, unknown>;
  };
  it('회색 바탕(canvas) 위 고르지 않은 칩은 흰 바탕+가는 테두리, 기본은 연회색', () => {
    expect(chipStyle(mount(<Chip label="여자 속마음" on="canvas" onPress={() => {}} />))).toMatchObject({ backgroundColor: light.card, borderColor: light.separator });
    expect(chipStyle(mount(<Chip label="여자 속마음" onPress={() => {}} />))).toMatchObject({ backgroundColor: light.surface, borderColor: 'transparent' });
    expect(chipStyle(mount(<Chip label="여자 속마음" selected on="canvas" onPress={() => {}} />))).toMatchObject({ backgroundColor: light.primarySoft, borderColor: light.primary });
  });
});
