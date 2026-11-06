import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, FadeIn, FadeOut, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from 'react-native-reanimated';

import { AppText } from '@/components/ui/app-text';
import { Brand, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { haptic } from '@/lib/haptics';

export const COACH_PHRASES = ['대화 분위기를 읽는 중이에요…', '호칭이랑 말투를 확인하고 있어요…', '상대의 속마음을 추리하는 중…', '호감 온도를 재는 중…', '딱 맞는 답장을 고르는 중…', '거의 다 됐어요!'];

/** 코치가 생각하는 동안 — 통통 튀는 점, 바뀌는 문구, 차오르는 그라데이션 막대, 단계마다 톡 진동 */
export function PendingBubble({ phrases = COACH_PHRASES }: { phrases?: string[] }) {
  const theme = useTheme();
  const [i, setI] = useState(0);
  const progress = useSharedValue(0);
  const sweep = useSharedValue(0);

  useEffect(() => {
    // 실제 응답은 보통 8~15초. 끝까지 차지 않고 90% 근처에서 기다린다
    progress.value = withTiming(0.9, { duration: 14000, easing: Easing.out(Easing.quad) });
    sweep.value = withRepeat(withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.quad) }), -1);
    const t = setInterval(() => {
      setI((v) => {
        const next = Math.min(v + 1, phrases.length - 1);
        if (next !== v) haptic.tick();
        return next;
      });
    }, 2300);
    return () => clearInterval(t);
  }, [phrases.length, progress, sweep]);

  const bar = useAnimatedStyle(() => ({ width: `${progress.value * 100}%` }));
  const shine = useAnimatedStyle(() => ({ left: `${-30 + sweep.value * 130}%` }));

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={phrases[i]}
      style={[styles.bubble, { backgroundColor: theme.bubbleCoach, borderColor: theme.border }]}>
      <View style={styles.row}>
        <View style={styles.dots}>
          {Brand.gradient.map((color, d) => (
            <Dot key={d} delay={d * 140} color={color} />
          ))}
        </View>
        <Animated.View key={i} entering={FadeIn.duration(220)} exiting={FadeOut.duration(120)} style={styles.phrase}>
          <AppText variant="bodyStrong">{phrases[i]}</AppText>
        </Animated.View>
      </View>
      <View style={[styles.track, { backgroundColor: theme.surfaceSelected }]}>
        <Animated.View style={[styles.fill, bar]}>
          <LinearGradient colors={Brand.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
          <Animated.View style={[styles.shine, shine]} />
        </Animated.View>
      </View>
      <AppText variant="caption" color="textTertiary">
        {i + 1}/{phrases.length} 단계 · 보통 10초 안팎 걸려요
      </AppText>
    </View>
  );
}

function Dot({ delay, color }: { delay: number; color: string }) {
  const y = useSharedValue(0);
  useEffect(() => {
    y.value = withDelay(delay, withRepeat(withSequence(withTiming(-5, { duration: 260 }), withTiming(0, { duration: 260 })), -1));
  }, [delay, y]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  return <Animated.View style={[styles.dot, { backgroundColor: color }, style]} />;
}

const styles = StyleSheet.create({
  bubble: { borderRadius: Radius.xl, borderTopLeftRadius: 6, borderWidth: 1, padding: Spacing.lg, gap: Spacing.md, alignSelf: 'stretch' },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  dots: { flexDirection: 'row', gap: 4, paddingTop: 4 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  phrase: { flex: 1 },
  track: { height: 8, borderRadius: Radius.pill, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: Radius.pill, overflow: 'hidden' },
  shine: { position: 'absolute', top: 0, bottom: 0, width: '30%', backgroundColor: Brand.glass },
});
