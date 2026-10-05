import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View, type GestureResponderEvent, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { interpolate, runOnJS, useAnimatedStyle, useSharedValue, withSpring, type SharedValue } from 'react-native-reanimated';

import { AppText } from '@/components/ui/app-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { haptic } from '@/lib/haptics';
import { toneLabel } from '@/lib/labels';
import type { CoachReply } from '@/lib/types';

/** 다음 카드가 옆에 살짝 보이는 폭 — 옆으로 넘길 수 있다는 걸 알려 준다 */
const PEEK = 34;
const GAP = 10;
const SPRING = { damping: 18, stiffness: 190, mass: 0.9 };

interface ReplyCarouselProps {
  replies: CoachReply[];
  index: number;
  onIndexChange: (index: number) => void;
  /** 카드를 눌러 복사 (누른 위치를 같이 넘겨 하트를 거기서 터뜨린다) */
  onCopy: (index: number, at?: { x: number; y: number }) => void;
  copiedIndex?: number | null;
  /** 상대 이름 (예상 반응 말풍선에 표시) */
  partnerName?: string;
}

/**
 * 답장 여러 버전을 카드로 넘겨 보는 스와이프 캐러셀.
 * 넘길 때마다 「톡」 진동, 카드마다 성공 확률과 예상 반응을 보여 준다.
 */
export function ReplyCarousel({ replies, index, onIndexChange, onCopy, copiedIndex, partnerName }: ReplyCarouselProps) {
  const [width, setWidth] = useState(0);
  const cardWidth = replies.length > 1 ? Math.max(200, width - PEEK) : width;
  const step = cardWidth + GAP;
  const x = useSharedValue(0);
  const startX = useSharedValue(0);
  const last = replies.length - 1;
  // 끌어서 넘긴 직후의 손 뗌이 「눌러서 복사」로 처리되지 않게 (웹은 드래그 뒤에도 click 이 온다)
  const dragging = useRef(false);
  const setDragging = (on: boolean) => {
    if (on) dragging.current = true;
    else setTimeout(() => (dragging.current = false), 120);
  };

  // 밖에서 index 가 바뀌면(번호 점 누름 등) 그 카드로 이동
  useEffect(() => {
    if (step > 0) x.value = withSpring(-index * step, SPRING);
  }, [index, step, x]);

  const settle = (next: number) => {
    if (next !== index) {
      haptic.snap();
      onIndexChange(next);
    }
  };

  const pan = Gesture.Pan()
    .enabled(replies.length > 1)
    .activeOffsetX([-12, 12])
    .failOffsetY([-14, 14])
    .onBegin(() => {
      startX.value = x.value;
    })
    .onStart(() => {
      runOnJS(setDragging)(true);
    })
    .onUpdate((e) => {
      let next = startX.value + e.translationX;
      // 처음·마지막 카드 밖으로는 고무줄처럼 덜 끌린다
      const min = -last * step;
      if (next > 0) next = next * 0.35;
      if (next < min) next = min + (next - min) * 0.35;
      x.value = next;
    })
    .onEnd((e) => {
      const raw = -x.value / Math.max(1, step);
      let target = Math.round(raw);
      if (Math.abs(e.velocityX) > 450) target = e.velocityX < 0 ? Math.ceil(raw - 0.1) : Math.floor(raw + 0.1);
      target = Math.max(0, Math.min(last, target));
      x.value = withSpring(-target * step, { ...SPRING, velocity: e.velocityX });
      runOnJS(settle)(target);
      runOnJS(setDragging)(false);
    });

  return (
    <View onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)} style={styles.wrap}>
      {width > 0 ? (
        <GestureDetector gesture={pan}>
          <Animated.View style={styles.viewport}>
            <View style={[styles.track, { width: replies.length * step }]}>
              {replies.map((reply, i) => (
                <ReplyCard
                  key={i}
                  reply={reply}
                  i={i}
                  total={replies.length}
                  width={cardWidth}
                  step={step}
                  x={x}
                  copied={copiedIndex === i}
                  partnerName={partnerName}
                  onPress={(e) => {
                    if (dragging.current) return;
                    if (i !== index) {
                      // 옆 카드를 누르면 그 카드로 넘어간다
                      haptic.select();
                      onIndexChange(i);
                      return;
                    }
                    onCopy(i, { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY });
                  }}
                />
              ))}
            </View>
          </Animated.View>
        </GestureDetector>
      ) : null}
      {replies.length > 1 ? <Dots count={replies.length} x={x} step={step} onPick={(i) => onIndexChange(i)} /> : null}
    </View>
  );
}

interface ReplyCardProps {
  reply: CoachReply;
  i: number;
  total: number;
  width: number;
  step: number;
  x: SharedValue<number>;
  copied: boolean;
  partnerName?: string;
  onPress: (e: GestureResponderEvent) => void;
}

function ReplyCard({ reply, i, total, width, step, x, copied, partnerName, onPress }: ReplyCardProps) {
  const theme = useTheme();
  const t = toneLabel(reply.tone);
  const rate = reply.successRate;
  const animated = useAnimatedStyle(() => {
    const pos = (x.value + i * step) / Math.max(1, step);
    const d = Math.min(1, Math.abs(pos));
    return {
      transform: [{ translateX: x.value }, { scale: interpolate(d, [0, 1], [1, 0.92]) }, { rotateZ: `${interpolate(pos, [-1, 0, 1], [-1.5, 0, 1.5])}deg` }],
      opacity: interpolate(d, [0, 1], [1, 0.5]),
    };
  });
  return (
    <Animated.View style={[{ width, marginRight: GAP }, animated]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`답장 ${i + 1}: ${reply.text}. 눌러서 복사`}
        onPress={onPress}
        style={[styles.card, { backgroundColor: theme.surface, borderColor: copied ? theme.primary : theme.border }]}>
        <View style={styles.cardHead}>
          <View style={[styles.versionChip, { backgroundColor: theme.background }]}>
            <AppText variant="caption" color="textSecondary" weight="700">
              {t.emoji} 버전 {i + 1}/{total}
            </AppText>
          </View>
          {rate != null ? (
            <View style={styles.rate}>
              <AppText variant="caption" color="textTertiary">
                성공 확률
              </AppText>
              <AppText variant="smallStrong" color={rate >= 75 ? theme.accent : rate >= 55 ? theme.primary : theme.textSecondary}>
                {rate}%
              </AppText>
            </View>
          ) : null}
        </View>
        {rate != null ? (
          <View style={[styles.rateTrack, { backgroundColor: theme.surfaceSelected }]}>
            <View style={[styles.rateFill, { width: `${Math.max(4, Math.min(100, rate))}%`, backgroundColor: rate >= 75 ? theme.accent : theme.primary }]} />
          </View>
        ) : null}

        {/* 내가 보낼 말풍선 */}
        <View style={[styles.mine, { backgroundColor: theme.bubbleUser }]}>
          <AppText style={styles.replyText}>{reply.text}</AppText>
        </View>

        {/* 상대의 예상 반응 — 성공한 장면을 미리 보여 준다 */}
        {reply.expectedReaction ? (
          <View style={styles.theirsRow}>
            <View style={[styles.theirsAvatar, { backgroundColor: theme.accentSoft }]}>
              <AppText style={styles.theirsAvatarText}>{(partnerName?.trim() || '상').slice(0, 1)}</AppText>
            </View>
            <View style={styles.theirsTexts}>
              <AppText variant="caption" color="textTertiary">
                예상 반응
              </AppText>
              <View style={[styles.theirs, { backgroundColor: theme.background, borderColor: theme.border }]}>
                <AppText variant="small">{reply.expectedReaction}</AppText>
              </View>
            </View>
          </View>
        ) : null}

        <AppText variant="caption" color={copied ? 'primary' : 'textTertiary'} align="right">
          {copied ? '✓ 복사됨' : '탭하면 복사'}
        </AppText>
      </Pressable>
    </Animated.View>
  );
}

function Dots({ count, x, step, onPick }: { count: number; x: SharedValue<number>; step: number; onPick: (i: number) => void }) {
  const theme = useTheme();
  return (
    <View style={styles.dots}>
      {Array.from({ length: count }, (_, i) => (
        <Dot key={i} i={i} x={x} step={step} color={theme.primary} onPress={() => onPick(i)} />
      ))}
      <AppText variant="caption" color="textTertiary" style={styles.swipeHint}>
        ← 넘겨서 다른 버전 →
      </AppText>
    </View>
  );
}

function Dot({ i, x, step, color, onPress }: { i: number; x: SharedValue<number>; step: number; color: string; onPress: () => void }) {
  const style = useAnimatedStyle(() => {
    const d = Math.min(1, Math.abs(-x.value / Math.max(1, step) - i));
    return { width: interpolate(d, [0, 1], [20, 7]), opacity: interpolate(d, [0, 1], [1, 0.5]) };
  });
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`버전 ${i + 1}`} onPress={onPress} hitSlop={8}>
      <Animated.View style={[styles.dot, { backgroundColor: color }, style]} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.sm },
  viewport: { overflow: 'hidden', marginHorizontal: -2, paddingHorizontal: 2, paddingVertical: 4 },
  track: { flexDirection: 'row', alignItems: 'stretch' },
  card: { flex: 1, borderRadius: Radius.lg, borderWidth: 1.5, padding: Spacing.md, gap: Spacing.sm },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  versionChip: { paddingHorizontal: Spacing.sm, paddingVertical: 3, borderRadius: Radius.pill },
  rate: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  rateTrack: { height: 4, borderRadius: 2, overflow: 'hidden' },
  rateFill: { height: '100%', borderRadius: 2 },
  mine: { alignSelf: 'flex-end', maxWidth: '96%', borderRadius: Radius.lg, borderTopRightRadius: Radius.sm, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 2, marginTop: 2 },
  replyText: { fontSize: 17, lineHeight: 26, fontWeight: '500', letterSpacing: -0.2 },
  theirsRow: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'flex-start' },
  theirsAvatar: { width: 26, height: 26, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginTop: 14 },
  theirsAvatarText: { fontSize: 12, lineHeight: 16, fontWeight: '700' },
  theirsTexts: { flex: 1, gap: 2 },
  theirs: { alignSelf: 'flex-start', borderWidth: 1, borderRadius: Radius.md, borderTopLeftRadius: 4, paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs + 2 },
  dots: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  dot: { height: 7, borderRadius: 4, overflow: 'hidden' },
  swipeHint: { marginLeft: Spacing.sm },
});
