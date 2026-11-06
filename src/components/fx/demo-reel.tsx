import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
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
import { APP_NAME } from '@/constants/brand';
import { Brand, BrandShadow, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * 첫 화면·빈 홈의 「영상」 — 실제 앱 흐름을 짧은 루프 애니메이션으로 보여 준다.
 * 상대 카톡 → 센딧이 읽는 중 → 호감 온도 0°→32° → 답장 버전 넘기기 → 복사 → 처음부터.
 * 영상 파일 대신 코드로 그려서 가볍고, 다크 모드에서도 자연스럽다. 색은 앱 아이콘 그라데이션(하늘색 → 파랑 → 보라).
 */
const TIMELINE = [0, 900, 2100, 3700, 5200, 6600, 8400];
const LOOP_MS = 9400;
const DEMO_HEAT = 32;

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
      <View style={[styles.topBar, { borderBottomColor: theme.border }]}>
        <View style={[styles.avatar, { backgroundColor: theme.accentSoft }]}>
          <Text style={[styles.avatarText, { color: theme.accent }]}>민</Text>
        </View>
        <AppText variant="smallStrong">민지 언니</AppText>
        <View style={[styles.sample, { backgroundColor: theme.primarySoft }]}>
          <AppText variant="caption" color="primary" weight="800">
            예시
          </AppText>
        </View>
      </View>

      <View key={loop} style={styles.stage}>
        {/* 상대 메시지 */}
        <Animated.View entering={FadeInUp.duration(320)} style={[styles.theirs, { backgroundColor: theme.surface }]}>
          <AppText variant="small">주말에 뭐해요? ㅎㅎ</AppText>
        </Animated.View>

        {/* 센딧이 읽는 중 */}
        {phase === 1 ? (
          <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(150)} style={[styles.thinking, { backgroundColor: theme.primarySoft }]}>
            <Dots color={theme.primary} />
            <AppText variant="caption" color="primary" weight="700">
              {APP_NAME}이 호칭 「언니」·존댓말 확인 중
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
                  <AppText variant="caption" color="primary" weight="800">
                    성공 확률 {REPLIES[replyIndex].rate}%
                  </AppText>
                </Animated.View>
                <View style={styles.dots}>
                  {REPLIES.map((_, i) => (
                    <View key={i} style={[styles.dot, { width: i === replyIndex ? 16 : 6, backgroundColor: i === replyIndex ? theme.primary : theme.surfaceSelected }]} />
                  ))}
                  <AppText variant="caption" color="textTertiary">
                    {' '}
                    넘겨서 다른 버전 보기
                  </AppText>
                </View>
              </View>
            ) : null}
          </Animated.View>
        ) : null}

        {/* 복사 완료 + 하트 */}
        {phase >= 5 ? (
          <Animated.View entering={ZoomIn.springify().damping(12)} style={[styles.toast, BrandShadow]}>
            <LinearGradient colors={Brand.button} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.toastFill}>
              <Ionicons name="checkmark-circle" size={15} color={Brand.onBrand} />
              <Text style={styles.toastText}>복사했어요 · 카톡에 붙여넣기만 하면 끝</Text>
            </LinearGradient>
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
    v.value = withDelay(250, withTiming(DEMO_HEAT, { duration: 1300, easing: Easing.out(Easing.cubic) }));
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
        <AppText variant="caption" color="textSecondary" weight="700">
          호감 온도
        </AppText>
        <View style={styles.thermoValue}>
          {n >= DEMO_HEAT ? (
            <View style={[styles.rise, { backgroundColor: theme.accentSoft }]}>
              <AppText variant="caption" color="accent" weight="800">
                ▲ 올랐어요
              </AppText>
            </View>
          ) : null}
          <Text style={[styles.thermoNum, { color: theme.primary }]}>{n}°</Text>
        </View>
      </View>
      <View style={[styles.track, { backgroundColor: theme.surfaceSelected }]}>
        <Animated.View style={[styles.fillWrap, fill]}>
          <LinearGradient colors={Brand.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
        </Animated.View>
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

/** 복사하면 떠오르는 하트 — 이모지 대신 앱 아이콘 색(하늘색·파랑·보라) 하트 */
const HEARTS = [
  { x: 40, d: 0, c: Brand.sky, s: 18 },
  { x: 110, d: 120, c: Brand.blue, s: 22 },
  { x: 180, d: 60, c: Brand.violet, s: 16 },
  { x: 236, d: 200, c: Brand.blue, s: 20 },
  { x: 76, d: 260, c: Brand.violet, s: 14 },
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

function Heart({ x, d, c, s }: { x: number; d: number; c: string; s: number }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withDelay(d, withTiming(1, { duration: 1400, easing: Easing.out(Easing.quad) }));
  }, [d, t]);
  const style = useAnimatedStyle(() => ({ opacity: 1 - t.value, transform: [{ translateY: -90 * t.value }, { scale: 0.6 + t.value * 0.6 }] }));
  return (
    <Animated.View style={[styles.heart, { left: x }, style]}>
      <Ionicons name="heart" size={s} color={c} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  phone: { borderRadius: Radius.xl, borderWidth: 1, padding: Spacing.md, gap: Spacing.sm, width: '100%', maxWidth: 340, alignSelf: 'center', overflow: 'hidden' },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingBottom: Spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth },
  avatar: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 12, lineHeight: 16, fontWeight: '800' },
  sample: { marginLeft: 'auto', paddingHorizontal: Spacing.sm + 2, paddingVertical: 3, borderRadius: Radius.pill },
  stage: { height: 236, gap: Spacing.sm },
  theirs: { alignSelf: 'flex-start', borderRadius: Radius.md, borderTopLeftRadius: 4, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm },
  thinking: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, borderRadius: Radius.pill, paddingHorizontal: Spacing.md, paddingVertical: 6 },
  thinkDots: { flexDirection: 'row', gap: 3 },
  thinkDot: { width: 5, height: 5, borderRadius: 3 },
  card: { borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.md, gap: Spacing.sm },
  thermo: { gap: 6 },
  thermoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  thermoValue: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rise: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: Radius.pill },
  thermoNum: { fontSize: 22, lineHeight: 26, fontWeight: '900', letterSpacing: -0.8 },
  track: { height: 8, borderRadius: 4, overflow: 'hidden' },
  fillWrap: { height: '100%', borderRadius: 4, overflow: 'hidden' },
  replyArea: { gap: 6, overflow: 'hidden' },
  reply: { alignSelf: 'flex-end', borderRadius: Radius.md, borderTopRightRadius: 4, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, gap: 2, maxWidth: '94%' },
  dots: { flexDirection: 'row', alignItems: 'center', gap: 4, justifyContent: 'center' },
  dot: { height: 6, borderRadius: 3 },
  toast: { alignSelf: 'center', borderRadius: Radius.pill, position: 'absolute', bottom: 4 },
  toastFill: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: Radius.pill, paddingHorizontal: Spacing.md, paddingVertical: 7 },
  toastText: { color: Brand.onBrand, fontSize: 12, lineHeight: 16, fontWeight: '800' },
  heart: { position: 'absolute', bottom: 30 },
});
