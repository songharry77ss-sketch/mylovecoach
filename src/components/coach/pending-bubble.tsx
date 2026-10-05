import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, FadeIn, FadeOut, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from 'react-native-reanimated';

import { AppText } from '@/components/ui/app-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { haptic } from '@/lib/haptics';

const PHRASES = ['대화 분위기를 읽는 중이에요…', '호칭이랑 말투를 확인하고 있어요…', '상대의 속마음을 추리하는 중…', '호감 온도를 재는 중… 🌡️', '딱 맞는 답장을 고르는 중…', '거의 다 됐어요!'];

/** 코치가 생각하는 동안 — 통통 튀는 점, 바뀌는 문구, 차오르는 막대, 단계마다 톡 진동 */
export function PendingBubble({ phrases = PHRASES }: { phrases?: string[] }) {
  const theme = useTheme();
  const [i, setI] = useState(0);
  const progress = useSharedValue(0);

  useEffect(() => {
    // 실제 응답은 보통 8~15초. 끝까지 차지 않고 90% 근처에서 기다린다
    progress.value = withTiming(0.9, { duration: 14000, easing: Easing.out(Easing.quad) });
    const t = setInterval(() => {
      setI((v) => {
        const next = Math.min(v + 1, phrases.length - 1);
        if (next !== v) haptic.tick();
        return next;
      });
    }, 2300);
    return () => clearInterval(t);
  }, [phrases.length, progress]);

  const bar = useAnimatedStyle(() => ({ width: `${progress.value * 100}%` }));

  return (
    <View style={[styles.bubble, { backgroundColor: theme.surface }]}>
      <View style={styles.row}>
        <View style={styles.dots}>
          {[0, 1, 2].map((d) => (
            <Dot key={d} delay={d * 140} color={theme.primary} />
          ))}
        </View>
        <Animated.View key={i} entering={FadeIn.duration(220)} exiting={FadeOut.duration(120)} style={styles.phrase}>
          <AppText variant="small" color="textSecondary">
            {phrases[i]}
          </AppText>
        </Animated.View>
      </View>
      <View style={[styles.track, { backgroundColor: theme.surfaceSelected }]}>
        <Animated.View style={[styles.fill, { backgroundColor: theme.accent }, bar]} />
      </View>
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
  bubble: { borderRadius: Radius.lg, borderTopLeftRadius: Radius.sm, padding: Spacing.lg, gap: Spacing.md, alignSelf: 'stretch', maxWidth: 360 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  dots: { flexDirection: 'row', gap: 4, paddingTop: 4 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  phrase: { flex: 1 },
  track: { height: 4, borderRadius: 2, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 2 },
});
