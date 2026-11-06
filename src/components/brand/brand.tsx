/**
 * 센딧 공통 부품 — 앱 아이콘과 같은 하늘색 → 파랑 → 보라 그라데이션.
 * 화면마다 따로 만들지 말고 여기 것을 쓴다 (모양이 한 앱처럼 맞도록).
 */
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withSpring, withTiming } from 'react-native-reanimated';

import { APP_NAME, APP_SUBTITLE, RESEARCH_SHORT } from '@/constants/brand';
import { Brand, BrandShadow, Radius, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';
import { haptic as feedback } from '@/lib/haptics';

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
 * 그라데이션 주요 버튼. shine 을 켜면 몇 초마다 빛이 한 번 스쳐 지나간다(가장 중요한 버튼 하나에만).
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
  const scale = useSharedValue(1);
  const sweep = useSharedValue(-1);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!shine) return;
    sweep.value = withRepeat(withSequence(withDelay(1800, withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad) })), withTiming(-1, { duration: 0 })), -1);
  }, [shine, sweep]);
  const pressed = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const shineStyle = useAnimatedStyle(() => ({ transform: [{ translateX: sweep.value * (width || 300) }, { rotate: '18deg' }] }));
  const height = size === 'lg' ? 58 : 48;
  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: disabled || loading }}
      disabled={disabled || loading}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      onPressIn={() => {
        scale.value = withSpring(0.96, { damping: 18, stiffness: 380 });
      }}
      onPressOut={() => {
        scale.value = withSpring(1, { damping: 11, stiffness: 260 });
      }}
      onPress={() => {
        if (haptic) feedback.thud();
        onPress?.();
      }}
      style={[styles.gbOuter, BrandShadow, { height, opacity: disabled ? 0.5 : 1 }, pressed, style]}>
      <LinearGradient colors={Brand.button} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[StyleSheet.absoluteFill, styles.gbFill]} />
      {shine ? (
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.gbFill]}>
          <Animated.View style={[styles.shine, shineStyle]} />
        </View>
      ) : null}
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
 * 그라데이션 큰 카드 — 흰 글자. 뒤에 옅은 동그라미 두 개로 깊이를 준다.
 */
export function HeroCard({ children, style, decor = true, colors = Brand.gradient }: { children: ReactNode; style?: StyleProp<ViewStyle>; decor?: boolean; colors?: readonly [string, string, ...string[]] }) {
  return (
    <View style={[styles.heroOuter, BrandShadow, style]}>
      <BrandGradient colors={colors} style={styles.heroFill}>
        {decor ? (
          <>
            <View pointerEvents="none" style={[styles.orb, styles.orbA]} />
            <View pointerEvents="none" style={[styles.orb, styles.orbB]} />
          </>
        ) : null}
        {children}
      </BrandGradient>
    </View>
  );
}

/** 앱 로고(아이콘) + 「센딧」 글자 (+ 부제) */
export function SenditLogo({ size = 'md', subtitle = false, tone = 'ink' }: { size?: 'sm' | 'md' | 'lg'; subtitle?: boolean; tone?: 'ink' | 'white' }) {
  const theme = useTheme();
  const mark = { sm: 24, md: 32, lg: 56 }[size];
  const font = { sm: 17, md: 21, lg: 34 }[size];
  const color = tone === 'white' ? Brand.onBrand : theme.text;
  return (
    <View style={styles.logoRow} accessibilityRole="header" accessibilityLabel={subtitle ? `${APP_NAME}, ${APP_SUBTITLE}` : APP_NAME}>
      <Image source={require('../../../assets/images/sendit-mark.png')} style={{ width: mark, height: mark, borderRadius: mark * 0.24 }} contentFit="contain" />
      <View>
        <Text style={[styles.logoText, { fontSize: font, color }]}>{APP_NAME}</Text>
        {subtitle ? <Text style={[styles.logoSub, { color: tone === 'white' ? Brand.onBrandDim : theme.textSecondary }]}>{APP_SUBTITLE}</Text> : null}
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
      <Text style={[styles.badgeText, { color: glass ? Brand.onBrand : theme.primary }]}>{RESEARCH_SHORT}</Text>
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

/** 화면마다 하나씩 두는 3D 아이콘 (Codex 로 만든 그림 — assets/images/sendit/3d-*.png) */
const ICONS_3D = {
  send: require('../../../assets/images/sendit/3d-send.png'),
  heart: require('../../../assets/images/sendit/3d-heart.png'),
  memory: require('../../../assets/images/sendit/3d-memory.png'),
  ticket: require('../../../assets/images/sendit/3d-ticket.png'),
} as const;
export type Icon3DName = keyof typeof ICONS_3D;

/** 3D 아이콘. float 를 켜면 천천히 위아래로 떠 있다 */
export function Icon3D({ name, size = 72, float = false, style }: { name: Icon3DName; size?: number; float?: boolean; style?: StyleProp<ViewStyle> }) {
  const image = <Image source={ICONS_3D[name]} style={{ width: size, height: size }} contentFit="contain" accessibilityIgnoresInvertColors />;
  if (!float) return <View style={style}>{image}</View>;
  return (
    <Floating amplitude={Math.max(3, size * 0.06)} style={style}>
      {image}
    </Floating>
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
  gbOuter: { borderRadius: Radius.lg, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.lg, alignSelf: 'stretch' },
  gbFill: { borderRadius: Radius.lg, overflow: 'hidden' },
  gbRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  gbText: { color: Brand.onBrand, fontSize: 17, fontWeight: '800', letterSpacing: -0.3 },
  gbTextMd: { fontSize: 15 },
  shine: { position: 'absolute', top: -20, bottom: -20, width: 56, left: '45%', backgroundColor: 'rgba(255,255,255,0.28)' },
  heroOuter: { borderRadius: Radius.xl },
  heroFill: { borderRadius: Radius.xl, overflow: 'hidden', padding: Spacing.xl },
  orb: { position: 'absolute', borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.12)' },
  // 오른쪽 위 하늘색 빛 — 아이콘의 하늘색을 글자 없는 자리에서 낸다
  orbA: { width: 220, height: 220, top: -90, right: -60, backgroundColor: 'rgba(140,220,255,0.30)' },
  orbB: { width: 140, height: 140, bottom: -70, left: -40, backgroundColor: 'rgba(255,255,255,0.08)' },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  logoText: { fontWeight: '900', letterSpacing: -0.8 },
  logoSub: { fontSize: 12, fontWeight: '600', marginTop: -1 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 5, borderRadius: Radius.pill },
  badgeGlass: { backgroundColor: Brand.glass, borderWidth: 1, borderColor: Brand.glassBorder },
  badgeText: { fontSize: 12, fontWeight: '700', letterSpacing: -0.2 },
  bigNum: { fontSize: 40, lineHeight: 46, fontWeight: '900', letterSpacing: -1.2 },
  bigUnit: { fontSize: 18, fontWeight: '800' },
});
