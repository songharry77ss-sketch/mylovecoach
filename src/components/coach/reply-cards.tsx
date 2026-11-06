import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Platform, Pressable, StyleSheet, View, type GestureResponderEvent, type TextStyle } from 'react-native';
import Animated, { FadeInDown, ZoomIn } from 'react-native-reanimated';

import { CountUp } from '@/components/coach/count-up';
import { AppText } from '@/components/ui/app-text';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Brand, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { toneLabel } from '@/lib/labels';
import type { CoachReply } from '@/lib/types';

interface ReplyCardsProps {
  replies: CoachReply[];
  /** 상대 이름 (예상 반응 옆 동그라미) */
  partnerName?: string;
  /** 방금 복사한 답장 */
  copiedIndex?: number | null;
  /** 예전에 골라(복사해) 둔 답장 — 테두리로 표시 */
  selectedIndex?: number;
  /** 복사 (누른 위치를 같이 넘겨 거기서 축하를 터뜨린다) */
  onCopy: (index: number, at?: { x: number; y: number }) => void;
  onShare: (index: number) => void;
  /** 이 번호부터는 가려서 보여 준다 (웹 비회원 — 가입하면 바로 보임). 없으면 모두 보임 */
  lockedFrom?: number;
  onUnlock?: (index: number) => void;
  /** 처음 도착한 결과면 카드가 차례로 올라오고 성공 확률이 세어 올라간다 */
  reveal?: boolean;
}

/**
 * 답장 3가지를 한눈에 비교하는 카드 목록 (럽코 시안 「이렇게 답장해 봐요」).
 * 카드마다 말투·성공 확률 큰 숫자·답장·상대의 예상 반응·복사 버튼. 첫 카드가 추천이다
 */
export function ReplyCards({ replies, partnerName, copiedIndex, selectedIndex, onCopy, onShare, lockedFrom, onUnlock, reveal }: ReplyCardsProps) {
  return (
    <View style={styles.list}>
      {replies.map((reply, i) => (
        <Animated.View key={i} entering={reveal ? FadeInDown.delay(260 + i * 90).springify().damping(16) : undefined}>
          <ReplyCard
            reply={reply}
            index={i}
            best={i === 0}
            copied={copiedIndex === i}
            chosen={copiedIndex == null && selectedIndex === i}
            partnerName={partnerName}
            locked={lockedFrom != null && i >= lockedFrom && Boolean(onUnlock)}
            reveal={reveal}
            onCopy={(e) => onCopy(i, e ? { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY } : undefined)}
            onShare={() => onShare(i)}
            onUnlock={() => onUnlock?.(i)}
          />
        </Animated.View>
      ))}
    </View>
  );
}

/** 가린 답장 자리 — 실제 글 대신 같은 길이의 글자 모양을 흐리게 그린다 (글이 화면 코드에 남지 않게) */
const veil = (text: string) => text.replace(/\S/g, '가').slice(0, 120);
/** 흐린 글씨 그림자 — 웹은 CSS text-shadow 한 줄로, 앱은 textShadow* 로 (웹은 textShadow* 를 무시한다) */
const veilShadow = (color: string) =>
  Platform.OS === 'web'
    ? ({ textShadow: `0 0 10px ${color}` } as unknown as TextStyle)
    : ({ textShadowColor: color, textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 9 } satisfies TextStyle);

interface ReplyCardProps {
  reply: CoachReply;
  index: number;
  best: boolean;
  copied: boolean;
  chosen: boolean;
  partnerName?: string;
  locked: boolean;
  reveal?: boolean;
  onCopy: (e?: GestureResponderEvent) => void;
  onShare: () => void;
  onUnlock: () => void;
}

function ReplyCard({ reply, index, best, copied, chosen, partnerName, locked, reveal, onCopy, onShare, onUnlock }: ReplyCardProps) {
  const theme = useTheme();
  const tone = toneLabel(reply.tone);
  const rate = reply.successRate;
  const initial = (partnerName?.trim() && partnerName !== '상대' ? partnerName.trim() : '상').slice(0, 1);
  const label = locked ? `답장 ${index + 1}: 가입하면 볼 수 있어요` : `답장 ${index + 1}, ${tone.label}${rate != null ? `, 성공 확률 ${rate}%` : ''}: ${reply.text}. 눌러서 복사`;
  return (
    // 카드 어디를 눌러도 복사 — 안에 복사·공유 버튼이 있어 카드 자체는 버튼으로 알리지 않는다(웹에서 버튼 안의 버튼이 되지 않게)
    <Pressable
      accessibilityLabel={label}
      onPress={(e) => (locked ? onUnlock() : onCopy(e))}
      style={[
        styles.card,
        { backgroundColor: best ? theme.primarySoft : theme.surface, borderColor: copied || chosen ? theme.primary : 'transparent' },
      ]}>
      <View style={styles.head}>
        <View style={styles.toneRow}>
          <AppText variant="bodyStrong" color={best ? 'primary' : 'text'}>
            {tone.label}
          </AppText>
          {best ? (
            <LinearGradient colors={Brand.button} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.bestPill}>
              <AppText style={styles.bestText}>추천</AppText>
            </LinearGradient>
          ) : null}
        </View>
        {rate != null ? (
          <View style={styles.rate}>
            <AppText variant="caption" color="textSecondary">
              성공 확률
            </AppText>
            <CountUp value={rate} animate={reveal} delay={420 + index * 120} style={[styles.rateNumber, { color: best ? theme.primary : theme.text }]} suffixStyle={[styles.rateUnit, { color: best ? theme.primary : theme.text }]} suffix="%" />
          </View>
        ) : null}
      </View>

      {locked ? (
        <AppText style={[styles.replyText, styles.veiled, veilShadow(theme.text)]}>{veil(reply.text)}</AppText>
      ) : (
        <AppText style={[styles.replyText, { color: theme.text }]}>{reply.text}</AppText>
      )}

      <View style={styles.foot}>
        {reply.expectedReaction ? (
          <View style={styles.reaction}>
            <View style={[styles.reactionAvatar, { backgroundColor: theme.accentSoft }]}>
              <AppText style={[styles.reactionInitial, { color: theme.accent }]}>{initial}</AppText>
            </View>
            <View style={styles.reactionTexts}>
              <AppText variant="caption" color="textTertiary">
                예상 반응
              </AppText>
              <View style={[styles.reactionBubble, { backgroundColor: theme.bubbleCoach }]}>
                {locked ? (
                  <AppText variant="small" style={[styles.veiled, veilShadow(theme.text)]} numberOfLines={2}>
                    {veil(reply.expectedReaction)}
                  </AppText>
                ) : (
                  <AppText variant="small" numberOfLines={3}>
                    {reply.expectedReaction}
                  </AppText>
                )}
              </View>
            </View>
          </View>
        ) : (
          <View style={styles.flex} />
        )}

        {locked ? (
          <PressableScale accessibilityLabel={`버전 ${index + 1} 가입하고 보기`} feedback="tap" onPress={onUnlock} style={styles.pillShadow}>
            <LinearGradient colors={Brand.button} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.copyPill}>
              <Ionicons name="lock-open" size={14} color={Brand.onBrand} />
              <AppText variant="smallStrong" color={Brand.onBrand}>
                가입하고 보기
              </AppText>
            </LinearGradient>
          </PressableScale>
        ) : (
          <View style={styles.actions}>
            <PressableScale accessibilityLabel={`답장 ${index + 1} 공유하기`} feedback="tap" onPress={onShare} hitSlop={6} style={styles.round}>
              <Ionicons name="share-outline" size={19} color={theme.textSecondary} />
            </PressableScale>
            <PressableScale accessibilityLabel={copied ? `답장 ${index + 1} 복사했어요` : `답장 ${index + 1} 복사하기`} feedback={false} onPress={(e) => onCopy(e)}>
              {copied ? (
                <LinearGradient colors={Brand.button} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.copyPill}>
                  <Animated.View entering={ZoomIn.springify().damping(10)}>
                    <Ionicons name="checkmark-circle" size={16} color={Brand.onBrand} />
                  </Animated.View>
                  <AppText variant="smallStrong" color={Brand.onBrand}>
                    복사했어요
                  </AppText>
                </LinearGradient>
              ) : (
                <View style={[styles.copyPill, { backgroundColor: theme.bubbleCoach }]}>
                  <Ionicons name="copy-outline" size={15} color={best ? theme.primary : theme.text} />
                  <AppText variant="smallStrong" color={best ? 'primary' : 'text'}>
                    복사
                  </AppText>
                </View>
              )}
            </PressableScale>
          </View>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  list: { gap: Spacing.sm + 2 },
  flex: { flex: 1 },
  card: { borderRadius: Radius.lg + 2, borderWidth: 1.5, paddingHorizontal: Spacing.md + 2, paddingTop: Spacing.md + 2, paddingBottom: Spacing.md, gap: Spacing.sm },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm },
  toneRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs + 2, flexShrink: 1 },
  bestPill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: Radius.pill },
  bestText: { color: Brand.onBrand, fontSize: 12, lineHeight: 16, fontWeight: '800' },
  rate: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  rateNumber: { fontSize: 30, lineHeight: 34, fontWeight: '900', letterSpacing: -1 },
  rateUnit: { fontSize: 16, fontWeight: '800' },
  replyText: { fontSize: 16, lineHeight: 24, fontWeight: '500', letterSpacing: -0.2 },
  foot: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.sm, marginTop: 2 },
  reaction: { flex: 1, flexDirection: 'row', alignItems: 'flex-end', gap: 6 },
  reactionAvatar: { width: 24, height: 24, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  reactionInitial: { fontSize: 12, lineHeight: 16, fontWeight: '800' },
  reactionTexts: { flex: 1, gap: 2 },
  reactionBubble: { alignSelf: 'flex-start', borderRadius: Radius.md, borderBottomLeftRadius: 4, paddingHorizontal: Spacing.sm + 2, paddingVertical: 6 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  round: { width: 34, height: 44, alignItems: 'center', justifyContent: 'center' },
  copyPill: { height: 44, minWidth: 68, paddingHorizontal: 14, borderRadius: 22, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 },
  pillShadow: { borderRadius: 22 },
  // 글자 색을 투명하게 하고 그림자만 퍼뜨려 흐린 글씨처럼 보이게 (그림자는 veilShadow)
  veiled: { color: 'transparent' },
});
