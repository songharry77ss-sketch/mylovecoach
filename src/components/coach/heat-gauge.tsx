import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Animated, {
  Easing,
  interpolateColor,
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { useCelebrate } from '@/components/fx/celebration';
import { AppText } from '@/components/ui/app-text';
import { Radius, Spacing, palette } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { haptic } from '@/lib/haptics';
import { HEAT_MAX, HEAT_MIN } from '@/store/app-store';

/** 누적 호감 온도 구간별 이름·색 */
export function heatMeta(value: number): { label: string; emoji: string; color: string } {
  if (value >= 90) return { label: '불타는 중', emoji: '🔥', color: palette.red500 };
  if (value >= 70) return { label: '뜨거움', emoji: '❤️‍🔥', color: palette.pink600 };
  if (value >= 50) return { label: '설렘', emoji: '💗', color: palette.pink500 };
  if (value >= 30) return { label: '따뜻함', emoji: '🌤️', color: palette.peach500 };
  if (value >= 10) return { label: '미지근', emoji: '☁️', color: palette.sky500 };
  if (value >= 0) return { label: '아직 덤덤', emoji: '🌱', color: palette.sky400 };
  return { label: '영하', emoji: '🧊', color: palette.sky600 };
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
  /** 이번 변화 폭 (배지로 표시) */
  delta?: number;
  /** 애니메이션을 한 번만 보여 주기 위한 키 (메시지 id 등). 없으면 애니메이션 없음 */
  revealKey?: string;
  compact?: boolean;
  /** 숫자 옆 작은 설명 (예: 이번 대화 분위기) */
  caption?: string;
}

export function HeatGauge({ value, from, delta, revealKey, compact, caption }: HeatGaugeProps) {
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
        celebrate({ kind: value >= 70 ? 'fire' : 'hearts', x: Number.isFinite(x) ? x + w * ratio(value) : undefined, y: Number.isFinite(y) ? y : undefined, count: crossed ? 22 : 14 });
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

  const fill = useAnimatedStyle(() => ({
    width: Math.max(8, ratio(v.value) * width),
    backgroundColor: interpolateColor(v.value, [-20, 0, 30, 60, 100], [palette.sky600, palette.sky400, palette.peach500, palette.pink400, palette.red500]),
  }));
  const badgeStyle = useAnimatedStyle(() => ({ opacity: badge.value, transform: [{ scale: 0.6 + badge.value * 0.4 }] }));
  const shakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shake.value }] }));

  const meta = heatMeta(shown);
  const zeroLeft = ratio(0) * width;
  const d = delta ?? (from != null ? value - from : undefined);

  return (
    <Animated.View style={[styles.wrap, shakeStyle]}>
      <View style={styles.row}>
        <View style={styles.labelBox}>
          <AppText variant={compact ? 'smallStrong' : 'title3'}>
            {meta.emoji} 호감 온도 · {meta.label}
          </AppText>
          {caption ? (
            <AppText variant="caption" color="textTertiary">
              {caption}
            </AppText>
          ) : null}
        </View>
        <View style={styles.numberRow}>
          {d != null && d !== 0 ? (
            <Animated.View style={[styles.badge, { backgroundColor: d > 0 ? theme.accentSoft : theme.primarySoft }, badgeStyle]}>
              <AppText variant="caption" weight="800" color={d > 0 ? theme.accent : theme.primary}>
                {d > 0 ? `▲ ${d}°` : `▼ ${Math.abs(d)}°`}
              </AppText>
            </Animated.View>
          ) : null}
          <AppText style={[compact ? styles.numberCompact : styles.number, { color: meta.color }]}>{shown}°</AppText>
        </View>
      </View>
      <View ref={anchor} onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)} style={[styles.track, { backgroundColor: theme.surfaceSelected }]}>
        {width > 0 ? <Animated.View style={[styles.fill, fill]} /> : null}
        {width > 0 ? <View style={[styles.zero, { left: zeroLeft, backgroundColor: theme.background }]} /> : null}
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
  wrap: { gap: Spacing.sm },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', gap: Spacing.sm },
  labelBox: { flexShrink: 1, gap: 2 },
  numberRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  number: { fontSize: 32, lineHeight: 38, fontWeight: '800', letterSpacing: -1 },
  numberCompact: { fontSize: 24, lineHeight: 30, fontWeight: '800', letterSpacing: -0.8 },
  badge: { paddingHorizontal: Spacing.sm, paddingVertical: 3, borderRadius: Radius.pill },
  track: { height: 12, borderRadius: Radius.pill, overflow: 'hidden', justifyContent: 'center' },
  fill: { height: '100%', borderRadius: Radius.pill },
  zero: { position: 'absolute', width: 2, top: 2, bottom: 2, opacity: 0.8 },
  scale: { flexDirection: 'row', justifyContent: 'space-between' },
});
