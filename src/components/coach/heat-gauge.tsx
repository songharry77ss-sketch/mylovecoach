import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Animated, { Easing, runOnJS, useAnimatedReaction, useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring, withTiming } from 'react-native-reanimated';

import { useCelebrate } from '@/components/fx/celebration';
import { AppText } from '@/components/ui/app-text';
import { Brand, Radius, Spacing, palette } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { haptic } from '@/lib/haptics';
import { HEAT_MAX, HEAT_MIN } from '@/store/app-store';

/**
 * 누적 호감 온도 구간별 이름·색 — 센딧 그라데이션처럼 낮으면 하늘색, 오를수록 파랑 → 보라.
 * 홈 목록·연습·채팅방이 같이 쓴다
 */
export function heatMeta(value: number): { label: string; emoji: string; color: string } {
  if (value >= 90) return { label: '불타는 중', emoji: '🔥', color: palette.sendViolet600 };
  if (value >= 70) return { label: '뜨거움', emoji: '❤️‍🔥', color: palette.sendViolet500 };
  if (value >= 50) return { label: '설렘', emoji: '💜', color: palette.sendBlue600 };
  if (value >= 30) return { label: '따뜻함', emoji: '🌤️', color: palette.sendBlue500 };
  if (value >= 10) return { label: '미지근', emoji: '☁️', color: palette.sky600 };
  if (value >= 0) return { label: '아직 덤덤', emoji: '🌱', color: palette.sky500 };
  return { label: '영하', emoji: '🧊', color: palette.gray500 };
}

const RANGE = HEAT_MAX - HEAT_MIN;
const ratio = (v: number) => {
  'worklet';
  return Math.max(0, Math.min(1, (v - HEAT_MIN) / RANGE));
};

/** 이 구간을 넘어 오르면 축하가 터진다 */
const MILESTONES = [30, 50, 70, 90];

/** 한 번 애니메이션을 보여 준 결과는 목록이 다시 그려져도 다시 재생하지 않는다 */
const revealed = new Set<string>();

interface HeatGaugeProps {
  /** 지금 온도 */
  value: number;
  /** 바뀌기 전 온도 (있으면 여기서부터 차오른다) */
  from?: number;
  /** 이번 변화 폭 (칩으로 표시) */
  delta?: number;
  /** 애니메이션을 한 번만 보여 주기 위한 키 (메시지 id 등). 없으면 애니메이션 없음 */
  revealKey?: string;
  compact?: boolean;
  /** 숫자 아래 작은 설명 (예: 이번 대화 분위기) */
  caption?: string;
  /** 제목 (기본: 호감 온도) — 예: 「민지님과의 호감 온도」 */
  title?: string;
}

/**
 * 누적 호감 온도 — 큰 숫자가 세어 올라가고, 그라데이션 막대가 차오르고, 변화 폭 칩(+10°)이 튀어나온다.
 * 큰 구간을 넘거나 크게 오르면 축하가 터지고, 내려가면 살짝 흔들린다
 */
export function HeatGauge({ value, from, delta, revealKey, compact, caption, title = '호감 온도' }: HeatGaugeProps) {
  const theme = useTheme();
  const celebrate = useCelebrate();
  const shouldAnimate = Boolean(revealKey && !revealed.has(revealKey) && from != null && from !== value);
  const start = shouldAnimate ? (from as number) : value;
  const v = useSharedValue(start);
  const [shown, setShown] = useState(Math.round(start));
  const [width, setWidth] = useState(0);
  const badge = useSharedValue(shouldAnimate ? 0 : 1);
  const shake = useSharedValue(0);
  const anchor = useRef<View>(null);

  const finish = () => {
    if (!revealKey) return;
    revealed.add(revealKey);
    const d = value - start;
    if (d < 0) {
      haptic.drop();
      shake.value = withSequence(withTiming(-6, { duration: 50 }), withTiming(6, { duration: 60 }), withTiming(-4, { duration: 60 }), withTiming(0, { duration: 50 }));
      return;
    }
    const crossed = MILESTONES.some((m) => start < m && value >= m);
    if (crossed || d >= 10) {
      anchor.current?.measureInWindow?.((x, y, w) => {
        celebrate({ kind: 'sparkles', x: Number.isFinite(x) ? x + w * ratio(value) : undefined, y: Number.isFinite(y) ? y : undefined, count: crossed ? 22 : 14 });
      });
    } else {
      haptic.heartbeat();
    }
  };

  useEffect(() => {
    if (!shouldAnimate) {
      v.value = value;
      setShown(Math.round(value));
      return;
    }
    const duration = Math.min(1600, 500 + Math.abs(value - start) * 35);
    v.value = withDelay(
      350,
      withTiming(value, { duration, easing: Easing.out(Easing.cubic) }, (done) => {
        if (done) runOnJS(finish)();
      }),
    );
    badge.value = withDelay(350 + duration, withSpring(1, { damping: 9, stiffness: 220 }));
    // finish 는 매 렌더마다 새로 만들어지지만 이 효과는 처음 한 번만 돌아야 한다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, shouldAnimate]);

  // 숫자가 바뀔 때마다 화면 숫자와 눈금 진동
  useAnimatedReaction(
    () => Math.round(v.value),
    (now, prev) => {
      if (prev == null || now === prev) return;
      runOnJS(setShown)(now);
      if (shouldAnimate && now % 3 === 0) runOnJS(haptic.tick)();
    },
  );

  const fill = useAnimatedStyle(() => ({ width: Math.max(10, ratio(v.value) * width) }));
  const badgeStyle = useAnimatedStyle(() => ({ opacity: badge.value, transform: [{ scale: 0.6 + badge.value * 0.4 }] }));
  const shakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shake.value }] }));

  const meta = heatMeta(shown);
  const zeroLeft = ratio(0) * width;
  const d = delta ?? (from != null ? value - from : undefined);
  const up = d != null && d > 0;

  return (
    <Animated.View style={[styles.wrap, shakeStyle]} accessible accessibilityLabel={`${title} ${value}도, ${heatMeta(value).label}${d ? `, ${d > 0 ? '올라감' : '내려감'} ${Math.abs(d)}도` : ''}`}>
      <View style={styles.row}>
        <View style={styles.labelBox}>
          <AppText variant={compact ? 'bodyStrong' : 'title3'} numberOfLines={1}>
            {title}
          </AppText>
          <AppText variant="caption" color="textSecondary" numberOfLines={1}>
            {caption ? `${meta.label} · ${caption}` : meta.label}
          </AppText>
        </View>
        <View style={styles.numberRow}>
          {d != null && d !== 0 ? (
            <Animated.View style={[styles.badge, { backgroundColor: up ? theme.primarySoft : theme.surface }, badgeStyle]}>
              <AppText variant="smallStrong" color={up ? theme.primary : theme.textSecondary}>
                {up ? `+${d}°` : `−${Math.abs(d)}°`}
              </AppText>
            </Animated.View>
          ) : null}
          <AppText style={[compact ? styles.numberCompact : styles.number, { color: meta.color }]}>{shown}°</AppText>
        </View>
      </View>
      <View ref={anchor} onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)} style={[styles.track, compact && styles.trackCompact, { backgroundColor: theme.surfaceSelected }]}>
        {width > 0 ? (
          <Animated.View style={[styles.fill, fill]}>
            <LinearGradient colors={Brand.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
          </Animated.View>
        ) : null}
        {/* 0° 눈금 — 영하일 때만 (그라데이션 위의 흰 줄이 흠처럼 보여서) */}
        {width > 0 && shown < 0 ? <View style={[styles.zero, { left: zeroLeft, backgroundColor: theme.background }]} /> : null}
      </View>
      {!compact ? (
        <View style={styles.scale}>
          <AppText variant="caption" color="textTertiary">
            -20°
          </AppText>
          <AppText variant="caption" color="textTertiary">
            0°에서 시작
          </AppText>
          <AppText variant="caption" color="textTertiary">
            100°
          </AppText>
        </View>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.sm + 2 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: Spacing.sm },
  labelBox: { flexShrink: 1, gap: 2 },
  numberRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  number: { fontSize: 44, lineHeight: 50, fontWeight: '900', letterSpacing: -1.6 },
  numberCompact: { fontSize: 34, lineHeight: 40, fontWeight: '900', letterSpacing: -1.2 },
  badge: { paddingHorizontal: Spacing.md, paddingVertical: 5, borderRadius: Radius.pill },
  track: { height: 12, borderRadius: Radius.pill, overflow: 'hidden', justifyContent: 'center' },
  trackCompact: { height: 8 },
  fill: { height: '100%', borderRadius: Radius.pill, overflow: 'hidden' },
  zero: { position: 'absolute', width: 2, top: 2, bottom: 2, opacity: 0.8 },
  scale: { flexDirection: 'row', justifyContent: 'space-between' },
});
