/**
 * 떠 있는 유리 탭 바 (2026-11-07 팀 제안 — iOS 26 「리퀴드 글래스」 결).
 * - 알약 모양 탭 묶음(홈·탐색·마이, 연애 연습은 켰을 때만) + 오른쪽 「새 채팅」 버튼(파란 구슬, +)
 *   홈 오른쪽 위에 있던 + 를 엄지가 닿는 자리로 옮겼다 — 어느 탭에서든 바로 새 채팅방을 연다.
 * - 고른 탭 밑에는 옅은 파란 캡슐. 다른 탭으로 가면 캡슐이 탭 바보다 크게 떠올라(유리 렌즈) 미끄러진 뒤 내려앉는다.
 * - 아이폰 iOS 26 이상은 시스템 유리(expo-glass-effect), 그 밖(안드로이드·예전 iOS·웹)은 반투명 흰 유리로 흉내 낸다.
 * - 화면은 탭 바 뒤로 이어진다 — 탭 화면은 useTabBarSpace() 만큼 아래 여백을 둔다 (Screen 의 tab).
 */
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, type Tabs } from 'expo-router';
import { useEffect, useRef, useState, type ComponentProps } from 'react';
import { Platform, Pressable, StyleSheet, Text, View, type LayoutChangeEvent, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  interpolateColor,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Brand } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';
import { track } from '@/lib/analytics';
import { haptic } from '@/lib/haptics';

import { glassColors, glassShadow, liquidGlass } from './glass-surface';
import { TAB_BAR_HEIGHT, tabBarBottom } from './tab-bar-space';

export { TAB_BAR_HEIGHT, tabBarBottom, useTabBarSpace } from './tab-bar-space';

/** 알약 안쪽 여백 (캡슐이 알약 가장자리에서 떨어진 거리) */
const PAD = 5;
/** 알약과 구슬 사이 */
const GAP = 12;
/** 화면 양옆 */
const SIDE = 16;

type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

const SPRING = { damping: 18, stiffness: 210, mass: 0.9 };

export function GlassTabBar({ state, descriptors, navigation }: TabBarProps) {
  const theme = useTheme();
  const dark = useColorScheme() === 'dark';
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const reduced = useReducedMotion();
  const glass = liquidGlass();

  // href: null 로 숨긴 탭(연애 연습을 꺼 둔 경우)은 expo-router 가 display: 'none' 으로 넘긴다
  const routes = state.routes.filter((r) => (StyleSheet.flatten(descriptors[r.key]?.options.tabBarItemStyle) as ViewStyle | undefined)?.display !== 'none');
  const focusedKey = state.routes[state.index]?.key;
  const focused = routes.findIndex((r) => r.key === focusedKey);

  const [width, setWidth] = useState(0);
  const tabW = routes.length ? (width - PAD * 2) / routes.length : 0;
  const x = useSharedValue(0);
  const lift = useSharedValue(0);
  const placed = useRef(false);

  useEffect(() => {
    if (!tabW || focused < 0) return;
    const to = PAD + focused * tabW;
    // 처음 자리 잡을 때는 움직이지 않는다
    if (!placed.current) {
      placed.current = true;
      x.value = to;
      return;
    }
    if (reduced) {
      x.value = withTiming(to, { duration: 160 });
      return;
    }
    x.value = withSpring(to, SPRING);
    // 렌즈처럼 떠올랐다가 → 새 자리에 내려앉는다
    lift.value = withSequence(withTiming(1, { duration: 150, easing: Easing.out(Easing.quad) }), withDelay(130, withSpring(0, { damping: 13, stiffness: 170 })));
  }, [focused, tabW, reduced, x, lift]);

  const g = glassColors(dark);
  const c = dark
    ? { pill: g.fill, edge: g.edge, tint: 'rgba(122,150,255,0.20)', lens: 'rgba(64,72,100,0.96)', rim: 'rgba(255,255,255,0.28)', inactive: theme.textSecondary }
    : { pill: g.fill, edge: g.edge, tint: 'rgba(61,99,245,0.11)', lens: 'rgba(255,255,255,0.97)', rim: 'rgba(255,255,255,1)', inactive: theme.textSecondary };

  const lensStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }, { scaleX: 1 + 0.16 * lift.value }, { scaleY: 1 + 0.36 * lift.value }],
    backgroundColor: interpolateColor(lift.value, [0, 1], [c.tint, c.lens]),
    borderColor: interpolateColor(lift.value, [0, 1], ['rgba(255,255,255,0)', c.rim]),
    shadowOpacity: 0.18 * lift.value,
  }));

  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);
  const bottom = tabBarBottom(insets.bottom);
  const radius = TAB_BAR_HEIGHT / 2;
  const lensH = TAB_BAR_HEIGHT - PAD * 2;

  const newChat = () => {
    haptic.thud();
    track('tab_new_chat', { from: focusedKey ? (state.routes[state.index]?.name ?? '') : '' });
    router.push('/crush/new');
  };

  return (
    <View pointerEvents="box-none" style={[styles.root, { paddingBottom: bottom }]}>
      {/* 시스템 유리가 없을 때만 — 탭 바 뒤로 지나가는 글자가 비치지 않게 바닥을 화면 바탕색으로 흐린다 (탭 화면 바탕은 canvas) */}
      {!glass ? (
        <LinearGradient
          pointerEvents="none"
          colors={[`${theme.canvas}00`, `${theme.canvas}E6`, theme.canvas]}
          locations={[0, 0.45, 1]}
          style={[styles.fade, { height: bottom + TAB_BAR_HEIGHT + 28 }]}
        />
      ) : null}
      <View pointerEvents="box-none" style={styles.row}>
        <View
          accessibilityRole="tablist"
          onLayout={onLayout}
          // 안드로이드는 배경색이 있어야 그림자(elevation)를 그린다
          style={[styles.pill, { height: TAB_BAR_HEIGHT, borderRadius: radius }, Platform.OS === 'android' && !glass ? { backgroundColor: c.pill } : null, glassShadow(dark)]}>
          {glass ? (
            <glass.GlassView glassEffectStyle="regular" isInteractive style={[StyleSheet.absoluteFill, { borderRadius: radius }]} />
          ) : (
            <View style={[StyleSheet.absoluteFill, { borderRadius: radius, backgroundColor: c.pill, borderWidth: StyleSheet.hairlineWidth, borderColor: c.edge, overflow: 'hidden' }]}>
              {!dark ? <LinearGradient colors={['rgba(255,255,255,0.95)', 'rgba(255,255,255,0)']} style={styles.sheen} /> : null}
            </View>
          )}
          {tabW > 0 && focused >= 0 ? (
            <Animated.View
              pointerEvents="none"
              style={[styles.lens, { top: PAD, width: tabW, height: lensH, borderRadius: lensH / 2 }, lensStyle]}
            />
          ) : null}
          <View style={styles.tabs}>
            {routes.map((route, i) => {
              const options = descriptors[route.key]?.options ?? {};
              const isFocused = i === focused;
              const color = isFocused ? theme.primary : c.inactive;
              const label = typeof options.title === 'string' ? options.title : route.name;
              const onPress = () => {
                const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
                if (!isFocused && !event.defaultPrevented) navigation.navigate(route.name, route.params);
                // 이미 있는 탭을 다시 눌러도 캡슐이 살짝 튀어 누른 느낌을 준다
                if (isFocused && !reduced) lift.value = withSequence(withTiming(0.55, { duration: 110 }), withSpring(0, { damping: 12, stiffness: 200 }));
              };
              const onLongPress = () => navigation.emit({ type: 'tabLongPress', target: route.key });
              return (
                <Pressable
                  key={route.key}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: isFocused }}
                  accessibilityLabel={options.tabBarAccessibilityLabel ?? label}
                  testID={options.tabBarButtonTestID ?? `tab-${route.name}`}
                  onPress={onPress}
                  onLongPress={onLongPress}
                  style={styles.tab}>
                  <TabContent focused={isFocused} lift={lift}>
                    {options.tabBarIcon?.({ focused: isFocused, color, size: 23 }) ?? null}
                    <Text allowFontScaling={false} numberOfLines={1} style={[styles.label, { color }]}>
                      {label}
                    </Text>
                  </TabContent>
                </Pressable>
              );
            })}
          </View>
        </View>
        <NewChatButton onPress={newChat} reduced={reduced} />
      </View>
    </View>
  );
}

/** 고른 탭의 아이콘·이름 — 캡슐이 떠오를 때 같이 커진다(렌즈로 확대된 느낌) */
function TabContent({ focused, lift, children }: { focused: boolean; lift: SharedValue<number>; children: React.ReactNode }) {
  const style = useAnimatedStyle(() => ({ transform: [{ scale: focused ? 1 + 0.14 * lift.value : 1 }] }), [focused]);
  return <Animated.View style={[styles.tabInner, style]}>{children}</Animated.View>;
}

/** 새 채팅 — 파란 유리 구슬. 누르면 눌렸다 튕기고 + 가 한 바퀴(90°) 돈다 */
function NewChatButton({ onPress, reduced }: { onPress: () => void; reduced: boolean }) {
  const press = useSharedValue(0);
  const spin = useSharedValue(0);
  const ball = useAnimatedStyle(() => ({ transform: [{ scale: 1 - 0.08 * press.value }] }));
  const icon = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value * 90}deg` }] }));
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="새 채팅 시작"
      accessibilityHint="새 채팅방을 만들어요"
      testID="tab-new-chat"
      hitSlop={6}
      onPressIn={() => {
        press.value = withTiming(1, { duration: 90 });
      }}
      onPressOut={() => {
        press.value = reduced ? withTiming(0, { duration: 120 }) : withSpring(0, { damping: 9, stiffness: 260 });
      }}
      onPress={() => {
        // + 는 90° 돌아도 같은 모양이라, 다 돈 뒤 0 으로 되돌려도 티가 나지 않는다
        if (!reduced) spin.value = withSequence(withTiming(1, { duration: 260, easing: Easing.out(Easing.back(1.6)) }), withTiming(0, { duration: 0 }));
        onPress();
      }}>
      <Animated.View style={[styles.ballWrap, ball]}>
        <LinearGradient colors={Brand.orb} start={{ x: 0.2, y: 0 }} end={{ x: 0.85, y: 1 }} style={styles.ball}>
          {/* 위쪽이 은은하게 밝은 구슬 광택 (둥글게 잘린 안쪽에 위→아래로) */}
          <LinearGradient pointerEvents="none" colors={['rgba(255,255,255,0.42)', 'rgba(255,255,255,0.08)', 'rgba(255,255,255,0)']} locations={[0, 0.45, 1]} style={styles.gloss} />
          <Animated.View style={icon}>
            <Ionicons name="add" size={32} color={Brand.onBrand} allowFontScaling={false} />
          </Animated.View>
        </LinearGradient>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: SIDE },
  fade: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: GAP, width: '100%', maxWidth: 560, alignSelf: 'center' },
  pill: { flex: 1 },
  sheen: { position: 'absolute', left: 0, right: 0, top: 0, height: '55%' },
  lens: {
    position: 'absolute',
    left: 0,
    borderWidth: 1,
    shadowColor: '#1B2559',
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
  },
  tabs: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, flexDirection: 'row', paddingHorizontal: PAD },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  tabInner: { alignItems: 'center', justifyContent: 'center', gap: 2 },
  label: { fontSize: 11, lineHeight: 14, fontWeight: '700', letterSpacing: -0.2 },
  // 그림자는 감싸는 칸에 — 구슬(그라데이션)은 둥글게 자르느라 overflow 가 숨김이라 아이폰 그림자가 잘린다
  ballWrap: {
    width: TAB_BAR_HEIGHT,
    height: TAB_BAR_HEIGHT,
    borderRadius: TAB_BAR_HEIGHT / 2,
    ...Platform.select({
      ios: { shadowColor: Brand.shadow, shadowOpacity: 0.45, shadowRadius: 14, shadowOffset: { width: 0, height: 8 } },
      android: { elevation: 10, shadowColor: Brand.shadow, backgroundColor: Brand.blue },
      default: { boxShadow: '0 10px 26px rgba(61,79,232,0.45)' } as ViewStyle,
    }),
  },
  ball: {
    width: TAB_BAR_HEIGHT,
    height: TAB_BAR_HEIGHT,
    borderRadius: TAB_BAR_HEIGHT / 2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  gloss: { position: 'absolute', top: 0, left: 0, right: 0, height: '58%' },
});
