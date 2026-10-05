import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  FadeInUp,
  FadeOut,
  SlideInRight,
  SlideOutLeft,
  ZoomIn,
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { AppText } from '@/components/ui/app-text';
import { Radius, Spacing, palette } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * 첫 화면의 「영상」 — 실제 앱 흐름을 짧은 루프 애니메이션으로 보여 준다.
 * 상대 카톡 → 코치 분석 → 호감 온도 0°→32° → 답장 버전 스와이프 → 복사 💖 → 처음부터.
 * 영상 파일 대신 코드로 그려서 가볍고, 다크 모드에서도 자연스럽다.
 */
const TIMELINE = [0, 900, 2100, 3700, 5200, 6600, 8400];
const LOOP_MS = 9400;

const REPLIES = [
  { text: '저는 아직 계획 없어요! 언니는요? 😊', rate: 81 },
  { text: '토요일에 그 카페 같이 갈래요? ☕️', rate: 88 },
];

export function DemoReel() {
  const theme = useTheme();
  const [phase, setPhase] = useState(0);
  const [loop, setLoop] = useState(0);

  useEffect(() => {
    const timers = TIMELINE.map((t, i) => setTimeout(() => setPhase(i), t));
    const restart = setTimeout(() => {
      setPhase(0);
      setLoop((v) => v + 1);
    }, LOOP_MS);
    return () => {
      timers.forEach(clearTimeout);
      clearTimeout(restart);
    };
  }, [loop]);

  const replyIndex = phase >= 4 ? 1 : 0;

  return (
    <View style={[styles.phone, { backgroundColor: theme.surfaceElevated, borderColor: theme.border }]} accessibilityLabel="앱 사용 예시 영상">
      <View style={styles.topBar}>
        <View style={[styles.avatar, { backgroundColor: palette.pink100 }]}>
          <AppText style={styles.avatarText}>민</AppText>
        </View>
        <AppText variant="smallStrong">민지 언니</AppText>
        <View style={[styles.live, { backgroundColor: palette.red500 }]}>
          <AppText variant="caption" color={palette.white} weight="800">
            ● 예시
          </AppText>
        </View>
      </View>

      <View key={loop} style={styles.stage}>
        {/* 상대 메시지 */}
        <Animated.View entering={FadeInUp.duration(320)} style={[styles.theirs, { backgroundColor: theme.surface }]}>
          <AppText variant="small">주말에 뭐해요? ㅎㅎ</AppText>
        </Animated.View>

        {/* 코치가 생각 중 */}
        {phase === 1 ? (
          <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(150)} style={[styles.thinking, { backgroundColor: theme.primarySoft }]}>
            <Dots color={theme.primary} />
            <AppText variant="caption" color="primary">
              호칭 「언니」·존댓말 확인 중…
            </AppText>
          </Animated.View>
        ) : null}

        {/* 온도 + 답장 카드 */}
        {phase >= 2 ? (
          <Animated.View entering={FadeInDown.springify().damping(15)} style={[styles.card, { backgroundColor: theme.background, borderColor: theme.border }]}>
            <Thermo />
            {phase >= 3 ? (
              <View style={styles.replyArea}>
                <Animated.View key={replyIndex} entering={SlideInRight.duration(320)} exiting={SlideOutLeft.duration(260)} style={[styles.reply, { backgroundColor: theme.bubbleUser }]}>
                  <AppText variant="small">{REPLIES[replyIndex].text}</AppText>
                  <AppText variant="caption" color="accent" weight="800">
                    성공 확률 {REPLIES[replyIndex].rate}%
                  </AppText>
                </Animated.View>
                <View style={styles.dots}>
                  {REPLIES.map((_, i) => (
                    <View key={i} style={[styles.dot, { width: i === replyIndex ? 16 : 6, backgroundColor: i === replyIndex ? theme.primary : theme.surfaceSelected }]} />
                  ))}
                  <AppText variant="caption" color="textTertiary">
                    {' '}
                    ← 넘겨서 다른 버전
                  </AppText>
                </View>
              </View>
            ) : null}
          </Animated.View>
        ) : null}

        {/* 복사 완료 + 하트 */}
        {phase >= 5 ? (
          <Animated.View entering={ZoomIn.springify().damping(12)} style={[styles.toast, { backgroundColor: palette.sky600 }]}>
            <AppText variant="caption" color={palette.white} weight="800">
              복사했어요 · 카톡에 붙여넣기만 하면 끝! 💖
            </AppText>
          </Animated.View>
        ) : null}
        {phase >= 5 ? <Hearts /> : null}
      </View>
    </View>
  );
}

function Thermo() {
  const theme = useTheme();
  const v = useSharedValue(0);
  const [n, setN] = useState(0);
  useEffect(() => {
    v.value = withDelay(250, withTiming(32, { duration: 1300, easing: Easing.out(Easing.cubic) }));
  }, [v]);
  useAnimatedReaction(
    () => Math.round(v.value),
    (now, prev) => {
      if (now !== prev) runOnJS(setN)(now);
    },
  );
  const fill = useAnimatedStyle(() => ({ width: `${((v.value + 20) / 120) * 100}%` }));
  return (
    <View style={styles.thermo}>
      <View style={styles.thermoRow}>
        <AppText variant="caption" weight="700">
          🌤️ 호감 온도
        </AppText>
        <AppText variant="smallStrong" color={palette.peach500}>
          {n}° {n >= 32 ? '▲32°' : ''}
        </AppText>
      </View>
      <View style={[styles.track, { backgroundColor: theme.surfaceSelected }]}>
        <Animated.View style={[styles.fill, fill]} />
      </View>
    </View>
  );
}

function Dots({ color }: { color: string }) {
  return (
    <View style={styles.thinkDots}>
      {[0, 1, 2].map((i) => (
        <Bounce key={i} delay={i * 130} color={color} />
      ))}
    </View>
  );
}

function Bounce({ delay, color }: { delay: number; color: string }) {
  const y = useSharedValue(0);
  useEffect(() => {
    y.value = withDelay(delay, withRepeat(withSequence(withTiming(-4, { duration: 240 }), withTiming(0, { duration: 240 })), -1));
  }, [delay, y]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  return <Animated.View style={[styles.thinkDot, { backgroundColor: color }, style]} />;
}

const HEARTS = [
  { x: 40, d: 0, e: '💗' },
  { x: 110, d: 120, e: '💖' },
  { x: 180, d: 60, e: '✨' },
  { x: 230, d: 200, e: '💕' },
  { x: 75, d: 260, e: '💘' },
];

function Hearts() {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {HEARTS.map((h, i) => (
        <Heart key={i} {...h} />
      ))}
    </View>
  );
}

function Heart({ x, d, e }: { x: number; d: number; e: string }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withDelay(d, withTiming(1, { duration: 1400, easing: Easing.out(Easing.quad) }));
  }, [d, t]);
  const style = useAnimatedStyle(() => ({ opacity: 1 - t.value, transform: [{ translateY: -90 * t.value }, { scale: 0.6 + t.value * 0.6 }] }));
  return <Animated.Text style={[styles.heart, { left: x }, style]}>{e}</Animated.Text>;
}

const styles = StyleSheet.create({
  phone: { borderRadius: 28, borderWidth: 1, padding: Spacing.md, gap: Spacing.sm, width: '100%', maxWidth: 340, alignSelf: 'center', overflow: 'hidden' },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  avatar: { width: 26, height: 26, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 12, lineHeight: 16, fontWeight: '700', color: palette.pink600 },
  live: { marginLeft: 'auto', paddingHorizontal: Spacing.sm, paddingVertical: 2, borderRadius: Radius.pill },
  stage: { height: 236, gap: Spacing.sm },
  theirs: { alignSelf: 'flex-start', borderRadius: Radius.md, borderTopLeftRadius: 4, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm },
  thinking: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, borderRadius: Radius.pill, paddingHorizontal: Spacing.md, paddingVertical: 6 },
  thinkDots: { flexDirection: 'row', gap: 3 },
  thinkDot: { width: 5, height: 5, borderRadius: 3 },
  card: { borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.md, gap: Spacing.sm },
  thermo: { gap: 6 },
  thermoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  track: { height: 8, borderRadius: 4, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 4, backgroundColor: palette.peach500 },
  replyArea: { gap: 6, overflow: 'hidden' },
  reply: { alignSelf: 'flex-end', borderRadius: Radius.md, borderTopRightRadius: 4, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, gap: 2, maxWidth: '94%' },
  dots: { flexDirection: 'row', alignItems: 'center', gap: 4, justifyContent: 'center' },
  dot: { height: 6, borderRadius: 3 },
  toast: { alignSelf: 'center', borderRadius: Radius.pill, paddingHorizontal: Spacing.md, paddingVertical: 6, position: 'absolute', bottom: 4 },
  heart: { position: 'absolute', bottom: 30, fontSize: 22, lineHeight: 28 },
});
