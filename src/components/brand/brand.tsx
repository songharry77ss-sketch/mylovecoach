/**
 * 센딧 공통 부품. 1.4 개편부터 색 면·버튼은 센딧 파랑 단색(Brand.* 값이 단색) — 그라데이션·빛 스침·빛 그림자 없이.
 * 화면마다 따로 만들지 말고 여기 것을 쓴다 (모양이 한 앱처럼 맞도록).
 */
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withSpring, withTiming } from 'react-native-reanimated';

import { APP_NAME, APP_NAME_EN, APP_SUBTITLE, APP_SUBTITLE_EN, RESEARCH_SHORT, RESEARCH_SHORT_EN } from '@/constants/brand';
import { Brand, Radius, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';
import { haptic as feedback } from '@/lib/haptics';
import { L } from '@/lib/i18n';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** 주인공 그라데이션 면 (왼쪽 위 → 오른쪽 아래) */
export function BrandGradient({ children, style, colors = Brand.gradient }: { children?: ReactNode; style?: StyleProp<ViewStyle>; colors?: readonly [string, string, ...string[]] }) {
  return (
    <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={style}>
      {children}
    </LinearGradient>
  );
}

/** 화면 바탕의 옅은 빛 — 스플래시처럼 흰색에서 아래로 옅은 라벤더 */
export function WashBackground({ children, style }: { children?: ReactNode; style?: StyleProp<ViewStyle> }) {
  const scheme = useColorScheme();
  return (
    <LinearGradient colors={scheme === 'dark' ? Brand.washDark : Brand.wash} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={[styles.fill, style]}>
      {children}
    </LinearGradient>
  );
}

/**
 * 화면의 주요 버튼 — 센딧 파랑 단색 알약(이름은 예전 그대로).
 * shine(빛 스침)은 1.4 개편에서 걷었다(「AI 티」) — 받기는 하지만 아무것도 하지 않는다.
 */
export function GradientButton({
  title,
  onPress,
  icon,
  disabled,
  loading,
  shine = false,
  size = 'lg',
  style,
  accessibilityLabel,
  haptic = true,
}: {
  title: string;
  onPress?: () => void;
  icon?: ReactNode;
  disabled?: boolean;
  loading?: boolean;
  shine?: boolean;
  size?: 'lg' | 'md';
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  haptic?: boolean;
}) {
  void shine;
  const scale = useSharedValue(1);
  const pressed = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const height = size === 'lg' ? 54 : 46;
  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: disabled || loading }}
      disabled={disabled || loading}
      onPressIn={() => {
        scale.value = withSpring(0.97, { damping: 20, stiffness: 420 });
      }}
      onPressOut={() => {
        scale.value = withSpring(1, { damping: 18, stiffness: 320 });
      }}
      onPress={() => {
        if (haptic) feedback.thud();
        onPress?.();
      }}
      style={[styles.gbOuter, { height, backgroundColor: Brand.blue, opacity: disabled ? 0.4 : 1 }, pressed, style]}>
      {loading ? (
        <ActivityIndicator color={Brand.onBrand} />
      ) : (
        <View style={styles.gbRow}>
          {icon}
          <Text style={[styles.gbText, size === 'md' && styles.gbTextMd]} numberOfLines={1}>
            {title}
          </Text>
        </View>
      )}
    </AnimatedPressable>
  );
}

/**
 * 색 면 큰 카드(센딧 파랑 단색) — 흰 글자. 1.4 개편부터 장식 동그라미·빛 그림자 없이.
 * 화면의 큰 색 면은 「AI 티」라서 새 화면에서는 쓰지 말고 회색 면(theme.surface) 카드를 쓴다.
 */
export function HeroCard({
  children,
  style,
  contentStyle,
  colors = Brand.gradient,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** 그라데이션 안쪽(여백·간격) — 작은 카드는 padding 을 줄인다 */
  contentStyle?: StyleProp<ViewStyle>;
  /** 1.4 개편에서 장식을 걷어 쓰이지 않는다(예전 호출 호환) */
  decor?: boolean;
  colors?: readonly [string, string, ...string[]];
}) {
  return (
    <View style={[styles.heroOuter, style]}>
      <View style={[styles.heroFill, { backgroundColor: colors[0] }, contentStyle]}>
        {children}
      </View>
    </View>
  );
}

/** 영어판 이름·부제·연구진 배지 (서버도 쓰는 constants/brand 는 i18n 을 못 불러 여기서 고른다) */
const NAME = L(APP_NAME, APP_NAME_EN);
const SUBTITLE = L(APP_SUBTITLE, APP_SUBTITLE_EN);
const RESEARCH = L(RESEARCH_SHORT, RESEARCH_SHORT_EN);

/** 앱 로고(아이콘) + 「센딧」 글자 (+ 부제). 영어판은 「My Love Coach」 */
export function SenditLogo({ size = 'md', subtitle = false, tone = 'ink' }: { size?: 'sm' | 'md' | 'lg'; subtitle?: boolean; tone?: 'ink' | 'white' }) {
  const theme = useTheme();
  const mark = { sm: 24, md: 32, lg: 56 }[size];
  const font = { sm: 17, md: 21, lg: 34 }[size];
  const color = tone === 'white' ? Brand.onBrand : theme.text;
  return (
    <View style={styles.logoRow} accessibilityRole="header" accessibilityLabel={subtitle ? `${NAME}, ${SUBTITLE}` : NAME}>
      <Image source={require('../../../assets/images/sendit-mark.png')} style={{ width: mark, height: mark, borderRadius: mark * 0.24 }} contentFit="contain" />
      <View>
        <Text style={[styles.logoText, { fontSize: font, color }]}>{NAME}</Text>
        {subtitle ? <Text style={[styles.logoSub, { color: tone === 'white' ? Brand.onBrandDim : theme.textSecondary }]}>{SUBTITLE}</Text> : null}
      </View>
    </View>
  );
}

/** 「고려대 심리학 연구진이 만든 연애 특화 AI」 작은 배지 */
export function ResearchBadge({ tone = 'soft', style }: { tone?: 'soft' | 'glass'; style?: StyleProp<ViewStyle> }) {
  const theme = useTheme();
  const glass = tone === 'glass';
  return (
    <View style={[styles.badge, glass ? styles.badgeGlass : { backgroundColor: theme.primarySoft }, style]}>
      <Ionicons name="school" size={13} color={glass ? Brand.onBrand : theme.primary} />
      <Text style={[styles.badgeText, { color: glass ? Brand.onBrand : theme.primary }]}>{RESEARCH}</Text>
    </View>
  );
}

/** 작은 알약 칩 (그라데이션 위에서는 glass, 흰 바탕에서는 soft) */
export function BrandPill({ label, icon, tone = 'soft', style }: { label: string; icon?: keyof typeof Ionicons.glyphMap; tone?: 'soft' | 'glass'; style?: StyleProp<ViewStyle> }) {
  const theme = useTheme();
  const glass = tone === 'glass';
  return (
    <View style={[styles.badge, glass ? styles.badgeGlass : { backgroundColor: theme.primarySoft }, style]}>
      {icon ? <Ionicons name={icon} size={13} color={glass ? Brand.onBrand : theme.primary} /> : null}
      <Text style={[styles.badgeText, { color: glass ? Brand.onBrand : theme.primary }]}>{label}</Text>
    </View>
  );
}

/** 3D 아이콘 (Codex 로 만든 그림 — assets/images/sendit/3d-*.png). 1.4 개편: 화면마다 두지 않는다 — 빈 화면·결제 완료처럼 꼭 필요한 곳에만 */
const ICONS_3D = {
  send: require('../../../assets/images/sendit/3d-send.png'),
  heart: require('../../../assets/images/sendit/3d-heart.png'),
  memory: require('../../../assets/images/sendit/3d-memory.png'),
  ticket: require('../../../assets/images/sendit/3d-ticket.png'),
} as const;
export type Icon3DName = keyof typeof ICONS_3D;

/** 3D 아이콘. float(위아래로 떠다니기)는 1.4 개편에서 걷었다 — 받기만 하고 늘 가만히 있다 */
export function Icon3D({ name, size = 72, float = false, style }: { name: Icon3DName; size?: number; float?: boolean; style?: StyleProp<ViewStyle> }) {
  void float;
  return (
    <View style={style}>
      <Image source={ICONS_3D[name]} style={{ width: size, height: size }} contentFit="contain" accessibilityIgnoresInvertColors />
    </View>
  );
}

/** 큰 숫자 강조 — 파랑(흰 바탕) 또는 흰색(그라데이션 위) */
export function BigNumber({ value, unit, tone = 'brand', style }: { value: string; unit?: string; tone?: 'brand' | 'white'; style?: StyleProp<TextStyle> }) {
  const theme = useTheme();
  const color = tone === 'white' ? Brand.onBrand : theme.primary;
  return (
    <Text style={[styles.bigNum, { color }, style]}>
      {value}
      {unit ? <Text style={[styles.bigUnit, { color }]}>{unit}</Text> : null}
    </Text>
  );
}

/** 위아래로 천천히 떠 있는 장식 (3D 아이콘 등) */
export function Floating({ children, amplitude = 6, duration = 2200, style }: { children: ReactNode; amplitude?: number; duration?: number; style?: StyleProp<ViewStyle> }) {
  const y = useSharedValue(0);
  useEffect(() => {
    y.value = withRepeat(withSequence(withTiming(-amplitude, { duration, easing: Easing.inOut(Easing.sin) }), withTiming(0, { duration, easing: Easing.inOut(Easing.sin) })), -1);
  }, [amplitude, duration, y]);
  const animated = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  return <Animated.View style={[animated, style]}>{children}</Animated.View>;
}

/** 남은 시간을 1초마다 다시 계산한다. 끝났으면 0 */
export function useRemaining(until: number | null | undefined): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!until) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [until]);
  return until ? Math.max(0, until - now) : 0;
}

/** 01:23:45 (한 시간 미만이면 23:45) */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  gbOuter: { borderRadius: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.lg, alignSelf: 'stretch', overflow: 'hidden' },
  gbRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  gbText: { color: Brand.onBrand, fontSize: 17, fontWeight: '600', letterSpacing: -0.3 },
  gbTextMd: { fontSize: 15 },
  heroOuter: { borderRadius: Radius.xl },
  heroFill: { borderRadius: Radius.xl, overflow: 'hidden', padding: Spacing.xl },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  logoText: { fontWeight: '700', letterSpacing: -0.8 },
  logoSub: { fontSize: 12, fontWeight: '600', marginTop: -1 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 5, borderRadius: Radius.pill },
  badgeGlass: { backgroundColor: Brand.glass, borderWidth: 1, borderColor: Brand.glassBorder },
  badgeText: { fontSize: 12, fontWeight: '700', letterSpacing: -0.2 },
  bigNum: { fontSize: 40, lineHeight: 46, fontWeight: '700', letterSpacing: -1.2 },
  bigUnit: { fontSize: 18, fontWeight: '700' },
});
