/**
 * 떠 있는 유리 탭 바 (2026-11-07 팀 제안 — iOS 26 「리퀴드 글래스」 결).
 * - 알약 모양 탭 묶음(홈·탐색·마이, 연애 연습은 켰을 때만) + 오른쪽 「새 채팅」 버튼(파란 구슬, +)
 *   홈 오른쪽 위에 있던 + 를 엄지가 닿는 자리로 옮겼다 — 어느 탭에서든 바로 새 채팅방을 연다.
 * - 고른 탭 밑에는 옅은 파란 캡슐. 다른 탭으로 가면 캡슐이 살짝 떠올라(유리 렌즈) 미끄러진 뒤 내려앉는다.
 *   11/12 회의 2번 「처음 누를 때 너무 울렁인다」로 은은하게 줄였다 — 아래 LIFT·SPRING·easeOut 주석 참고.
 * - 연애 연습을 아직 못 본 이용자에게는 「탐색」 아이콘 오른쪽 위에 작은 빨간 점(11/12 회의 3번, 탐색 화면이 seePracticeDot 으로 끈다).
 * - 아이폰 iOS 26 이상은 시스템 유리(expo-glass-effect), 그 밖(안드로이드·예전 iOS·웹)은 반투명 흰 유리로 흉내 낸다.
 * - 화면은 탭 바 뒤로 이어진다 — 탭 화면은 useTabBarSpace() 만큼 아래 여백을 둔다 (Screen 의 tab).
 */
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, type Tabs } from 'expo-router';
import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, Text, View, type LayoutChangeEvent, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
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
import { useAppStore } from '@/store/app-store';

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

/**
 * 캡슐이 떠오를 때 커지는 정도 — 가로·세로·고른 탭 글자 (예전 0.16·0.36·0.14 는 렌즈가 알약 밖으로 튀어나와 울렁였다).
 * lift 가 0~1 밖으로 나가도 모양은 이 사이에서만 움직이게 interpolate 를 CLAMP 로 쓴다.
 */
const LIFT = { x: 0.04, y: 0.08, content: 0.03 };
/**
 * 캡슐이 미끄러지는 스프링 — 감쇠비 약 0.8 이라 거의 넘치지 않고 멈춘다.
 * Reanimated 4 는 mass 를 안 주면 4 라서(예전 내려앉기 damping 13·stiffness 170 은 감쇠비 0.25 → 세로 1.36배↔0.84배로 출렁였다) 늘 같이 적는다.
 */
const SPRING = { damping: 24, stiffness: 230, mass: 1 };

/**
 * 0~1 밖을 자르는 ease-out·ease-in-out. 처음 여는 탭은 화면을 새로 그리느라 첫 프레임 시각이 애니메이션 시작보다 앞서
 * 진행값이 음수가 되는데, Easing.out(quad) 는 그 값을 그대로 늘려 렌즈가 0.3배로 찌그러졌다가 튀었다(「처음 누를 때만 심한」 이유).
 */
const easeOut = (t: number) => {
  'worklet';
  const p = Math.min(1, Math.max(0, t));
  return 1 - (1 - p) * (1 - p);
};
const easeInOut = (t: number) => {
  'worklet';
  const p = Math.min(1, Math.max(0, t));
  return p < 0.5 ? 2 * p * p : 1 - 2 * (1 - p) * (1 - p);
};

/** 캡슐을 to 로 — 살짝 떠올라 미끄러진 뒤 내려앉는다 (내려올 때도 timing 이라 튕기지 않는다) */
function glide(x: SharedValue<number>, lift: SharedValue<number>, to: number, reduced: boolean) {
  if (reduced) {
    x.value = withTiming(to, { duration: 160 });
    return;
  }
  x.value = withSpring(to, SPRING);
  lift.value = withSequence(withTiming(1, { duration: 120, easing: easeOut }), withDelay(60, withTiming(0, { duration: 260, easing: easeInOut })));
}

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

  // 연애 연습을 아직 못 봤으면 「탐색」에 빨간 점 (연습을 켜거나 탐색 화면을 열면 꺼진다)
  const practiceDot = useAppStore((s) => !s.practiceDotSeen);

  const [width, setWidth] = useState(0);
  const tabW = routes.length ? (width - PAD * 2) / routes.length : 0;
  const x = useSharedValue(0);
  const lift = useSharedValue(0);
  // 지금 캡슐이 있는 탭과 그때 탭 폭 — 폭만 바뀐 경우(연애 연습을 켜 탭이 늘어남·화면 회전)와 탭이 바뀐 경우를 나눈다
  const shown = useRef<{ index: number; tabW: number } | null>(null);
  // 누른 순간 이미 움직이기 시작한 탭 — 화면이 바뀐 뒤 또 움직이지 않게
  const pressedTo = useRef(-1);

  useEffect(() => {
    if (!tabW || focused < 0) return;
    const prev = shown.current;
    shown.current = { index: focused, tabW };
    const by = pressedTo.current;
    pressedTo.current = -1;
    // 처음 자리 잡을 때·폭만 바뀔 때는 움직이지 않고 그 자리에 둔다
    if (!prev || prev.tabW !== tabW) {
      x.value = PAD + focused * tabW;
      return;
    }
    // 누르지 않고 탭이 바뀐 경우(다른 화면에서 홈으로 보내기 등)만 여기서 움직인다
    if (prev.index !== focused && by !== focused) glide(x, lift, PAD + focused * tabW, reduced);
  }, [focused, tabW, reduced, x, lift]);

  const g = glassColors(dark);
  const c = dark
    ? { pill: g.fill, edge: g.edge, tint: 'rgba(255,255,255,0.10)', lens: 'rgba(64,72,100,0.96)', rim: 'rgba(255,255,255,0.28)', inactive: theme.textSecondary }
    : { pill: g.fill, edge: g.edge, tint: 'rgba(20,21,24,0.06)', lens: 'rgba(255,255,255,0.97)', rim: 'rgba(255,255,255,1)', inactive: theme.textSecondary };

  const lensStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: x.value },
      { scaleX: interpolate(lift.value, [0, 1], [1, 1 + LIFT.x], Extrapolation.CLAMP) },
      { scaleY: interpolate(lift.value, [0, 1], [1, 1 + LIFT.y], Extrapolation.CLAMP) },
    ],
    backgroundColor: interpolateColor(lift.value, [0, 1], [c.tint, c.lens]),
    borderColor: interpolateColor(lift.value, [0, 1], ['rgba(255,255,255,0)', c.rim]),
    shadowOpacity: interpolate(lift.value, [0, 1], [0, 0.12], Extrapolation.CLAMP),
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
              // 1.4 개편: 고른 탭은 파랑 대신 검정 — 색은 화면 안의 주요 버튼에만 남긴다
              const color = isFocused ? theme.text : c.inactive;
              const label = typeof options.title === 'string' ? options.title : route.name;
              const dot = route.name === 'tips' && practiceDot;
              const onPress = () => {
                const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
                if (!isFocused && !event.defaultPrevented) {
                  // 화면을 바꾸기 전에 캡슐부터 움직인다 — 처음 여는 탭은 화면을 그리느라 캡슐이 150ms 늦게 한꺼번에 튀었다
                  if (tabW > 0) {
                    pressedTo.current = i;
                    glide(x, lift, PAD + i * tabW, reduced);
                  }
                  navigation.navigate(route.name, route.params);
                }
                // 이미 있는 탭을 다시 눌러도 캡슐이 살짝 떠올라 누른 느낌을 준다 (튕기지 않고)
                if (isFocused && !reduced) lift.value = withSequence(withTiming(0.5, { duration: 90, easing: easeOut }), withTiming(0, { duration: 220, easing: easeInOut }));
              };
              const onLongPress = () => navigation.emit({ type: 'tabLongPress', target: route.key });
              return (
                <Pressable
                  key={route.key}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: isFocused }}
                  accessibilityLabel={options.tabBarAccessibilityLabel ?? (dot ? `${label}, 새 기능 있음` : label)}
                  testID={options.tabBarButtonTestID ?? `tab-${route.name}`}
                  onPress={onPress}
                  onLongPress={onLongPress}
                  style={styles.tab}>
                  <TabContent focused={isFocused} lift={lift}>
                    <View>
                      {options.tabBarIcon?.({ focused: isFocused, color, size: 23 }) ?? null}
                      {dot ? <View testID="tab-new-dot" style={[styles.dot, { backgroundColor: theme.danger, borderColor: c.pill }]} /> : null}
                    </View>
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
function TabContent({ focused, lift, children }: { focused: boolean; lift: SharedValue<number>; children: ReactNode }) {
  const style = useAnimatedStyle(() => ({ transform: [{ scale: focused ? interpolate(lift.value, [0, 1], [1, 1 + LIFT.content], Extrapolation.CLAMP) : 1 }] }), [focused]);
  return <Animated.View style={[styles.tabInner, style]}>{children}</Animated.View>;
}

/** 새 채팅 — 센딧 파랑 단색 원(1.4 개편: 광택·파란 빛 그림자를 걷었다). 누르면 눌렸다 튕기고 + 가 90° 돈다 */
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
        // mass 를 안 주면 Reanimated 4 는 4 라서 오래 출렁인다 — 한 번 튕기고 멈추게
        press.value = reduced ? withTiming(0, { duration: 120 }) : withSpring(0, { damping: 14, stiffness: 260, mass: 1 });
      }}
      onPress={() => {
        // + 는 90° 돌아도 같은 모양이라, 다 돈 뒤 0 으로 되돌려도 티가 나지 않는다
        if (!reduced) spin.value = withSequence(withTiming(1, { duration: 260, easing: Easing.out(Easing.back(1.6)) }), withTiming(0, { duration: 0 }));
        onPress();
      }}>
      <Animated.View style={[styles.ballWrap, ball]}>
        <LinearGradient colors={Brand.orb} start={{ x: 0.2, y: 0 }} end={{ x: 0.85, y: 1 }} style={styles.ball}>
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
  label: { fontSize: 12, lineHeight: 15, fontWeight: '600', letterSpacing: -0.2 },
  // 「탐색」 새 기능 빨간 점 — 아이콘 오른쪽 위, 알약 색 테두리로 아이콘과 떨어져 보이게
  dot: { position: 'absolute', top: -1, right: -3, width: 9, height: 9, borderRadius: 4.5, borderWidth: 1.5 },
  // 그림자는 감싸는 칸에 — 구슬(그라데이션)은 둥글게 자르느라 overflow 가 숨김이라 아이폰 그림자가 잘린다
  ballWrap: {
    width: TAB_BAR_HEIGHT,
    height: TAB_BAR_HEIGHT,
    borderRadius: TAB_BAR_HEIGHT / 2,
    ...Platform.select({
      ios: { shadowColor: '#000000', shadowOpacity: 0.14, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } },
      android: { elevation: 5, shadowColor: '#000000', backgroundColor: Brand.blue },
      default: { boxShadow: '0 4px 14px rgba(0,0,0,0.14)' } as ViewStyle,
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
});
