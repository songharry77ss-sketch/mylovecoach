import { Ionicons } from '@expo/vector-icons';
import { Platform, Pressable, StyleSheet, View, type GestureResponderEvent, type TextStyle } from 'react-native';
import Animated, { FadeInDown, ZoomIn } from 'react-native-reanimated';

import { CountUp } from '@/components/coach/count-up';
import { isUnnamedCrush } from '@/components/crush/crush-name';
import { AppText } from '@/components/ui/app-text';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Brand, Radius, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';
import { L } from '@/lib/i18n';
import { toneLabel } from '@/lib/labels';
import type { CoachReply } from '@/lib/types';

interface ReplyCardsProps {
  replies: CoachReply[];
  /** 상대 이름 (예상 반응 앞) */
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
 * 답장 3가지 — 1.4 「깔끔하게」 개편: 회색 결과 말풍선 안의 **흰 카드 3장**(피클 「말풍선 속 흰 카드」 결).
 * 카드마다 번호·말투·성공 확률(작게) → 답장 문장(주인공) → 예상 반응 한 줄 + 검정 「복사」 알약.
 * 추천은 색 배지 대신 맨 위 자리와 「추천」 글자 한 마디로. 큰 숫자·그라데이션 배지는 걷었다.
 */
export function ReplyCards({ replies, partnerName, copiedIndex, selectedIndex, onCopy, onShare, lockedFrom, onUnlock, reveal }: ReplyCardsProps) {
  return (
    <View style={styles.list}>
      {replies.map((reply, i) => (
        <Animated.View key={i} entering={reveal ? FadeInDown.delay(200 + i * 80).duration(320) : undefined}>
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
const veil = (text: string) => text.replace(/\S/g, L('가', 'a')).slice(0, 120);
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
  const dark = useColorScheme() === 'dark';
  const tone = toneLabel(reply.tone);
  const rate = reply.successRate;
  const named = partnerName?.trim() && !isUnnamedCrush(partnerName) ? partnerName.trim() : null;
  // 답장 글을 읽을 때 몇 번째·말투·성공 확률을 같이 읽어 준다 (복사는 바로 옆 「복사」 버튼으로)
  const label = L(
    `답장 ${index + 1}, ${tone.label}${rate != null ? `, 성공 확률 ${rate}%` : ''}: ${reply.text}`,
    `Reply ${index + 1}, ${tone.label}${rate != null ? `, ${rate}% success chance` : ''}: ${reply.text}`,
  );
  // 회색 결과 말풍선 안의 흰 카드 (다크는 한 단계 밝은 면)
  const fill = dark ? theme.surfaceElevated : theme.card;
  return (
    // 카드 어디를 눌러도 복사 — 화면 읽기에서는 카드를 한 덩어리로 묶지 않는다(accessible={false}).
    // 묶으면 iOS VoiceOver 가 안쪽 「공유」·「복사」 버튼을 따로 고르지 못한다. 글·확률·버튼이 하나씩 읽힌다
    <Pressable
      accessible={false}
      testID={`reply-card-${index}`}
      onPress={(e) => (locked ? onUnlock() : onCopy(e))}
      style={[styles.card, { backgroundColor: fill, borderColor: copied || chosen ? theme.primary : 'transparent' }]}>
      <View style={styles.head}>
        <View style={styles.toneRow}>
          <View style={[styles.num, { backgroundColor: best ? theme.primary : theme.surface }]}>
            <AppText style={[styles.numText, { color: best ? Brand.onBrand : theme.textSecondary }]}>{index + 1}</AppText>
          </View>
          <AppText variant="smallStrong" numberOfLines={1}>
            {tone.label}
          </AppText>
          {best ? (
            <AppText variant="caption" color="primary" weight="600">
              {L('추천', 'Top pick')}
            </AppText>
          ) : null}
        </View>
        {rate != null ? (
          <View style={styles.rate}>
            <AppText variant="caption" color="textSecondary">
              {L('성공 확률', 'Success')}
            </AppText>
            <CountUp
              value={rate}
              animate={reveal}
              delay={360 + index * 100}
              style={[styles.rateNumber, { color: best ? theme.primary : theme.text }]}
              suffixStyle={[styles.rateNumber, { color: best ? theme.primary : theme.text }]}
              suffix="%"
            />
          </View>
        ) : null}
      </View>

      {locked ? (
        <AppText accessibilityLabel={L(`답장 ${index + 1}: 가입하면 볼 수 있어요`, `Reply ${index + 1}: sign up to see it`)} style={[styles.replyText, styles.veiled, veilShadow(theme.text)]}>
          {veil(reply.text)}
        </AppText>
      ) : (
        <AppText accessibilityLabel={label} style={[styles.replyText, { color: theme.text }]}>
          {reply.text}
        </AppText>
      )}

      <View style={styles.foot}>
        {reply.expectedReaction ? (
          <View style={styles.reaction}>
            {locked ? (
              <AppText variant="caption" color="textSecondary" accessibilityLabel={L('가려진 예상 반응', 'Hidden likely reaction')} style={[styles.veiled, veilShadow(theme.text)]} numberOfLines={2}>
                {veil(reply.expectedReaction)}
              </AppText>
            ) : (
              <AppText variant="caption" color="textSecondary" numberOfLines={2}>
                <AppText variant="caption" color="textSecondary" weight="600">
                  {L(`${named ?? '상대'} 예상 반응 `, named ? `${named}’s likely reaction: ` : 'Likely reaction: ')}
                </AppText>
                {reply.expectedReaction}
              </AppText>
            )}
          </View>
        ) : (
          <View style={styles.flex} />
        )}

        {locked ? (
          <PressableScale accessibilityLabel={L(`버전 ${index + 1} 가입하고 보기`, `Sign up to see reply ${index + 1}`)} feedback="tap" onPress={onUnlock} style={[styles.copyPill, { backgroundColor: theme.primary }]}>
            <Ionicons name="lock-open" size={14} color={Brand.onBrand} />
            <AppText variant="smallStrong" color={Brand.onBrand}>
              {L('가입하고 보기', 'Sign up to see')}
            </AppText>
          </PressableScale>
        ) : (
          <View style={styles.actions}>
            <PressableScale accessibilityLabel={L(`답장 ${index + 1} 공유하기`, `Share reply ${index + 1}`)} feedback="tap" onPress={onShare} hitSlop={6} style={styles.round}>
              <Ionicons name="share-outline" size={18} color={theme.textSecondary} />
            </PressableScale>
            {/* 카드마다 색이 찬 버튼은 「복사」 하나 — 검정 알약, 복사하면 센딧 파랑 */}
            <PressableScale
              accessibilityLabel={copied ? L(`답장 ${index + 1} 복사했어요`, `Reply ${index + 1} copied`) : L(`답장 ${index + 1} 복사하기`, `Copy reply ${index + 1}`)}
              feedback={false}
              hitSlop={6}
              onPress={(e) => onCopy(e)}
              style={[styles.copyPill, { backgroundColor: copied ? theme.primary : theme.text }]}>
              {copied ? (
                <Animated.View entering={ZoomIn.duration(180)}>
                  <Ionicons name="checkmark" size={15} color={Brand.onBrand} />
                </Animated.View>
              ) : null}
              <AppText variant="smallStrong" color={copied ? Brand.onBrand : theme.background}>
                {copied ? L('복사했어요', 'Copied') : L('복사', 'Copy')}
              </AppText>
            </PressableScale>
          </View>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  list: { gap: Spacing.sm },
  flex: { flex: 1 },
  card: { borderRadius: 20, borderWidth: 1.5, paddingHorizontal: Spacing.md + 2, paddingTop: Spacing.md, paddingBottom: Spacing.md, gap: Spacing.sm },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm },
  toneRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  num: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  numText: { fontSize: 12, lineHeight: 16, fontWeight: '700' },
  rate: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  rateNumber: { fontSize: 15, lineHeight: 20, fontWeight: '700', letterSpacing: -0.3 },
  replyText: { fontSize: 16, lineHeight: 24, fontWeight: '500', letterSpacing: -0.2 },
  foot: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  reaction: { flex: 1 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  round: { width: 36, height: 40, alignItems: 'center', justifyContent: 'center' },
  copyPill: { height: 36, minWidth: 60, paddingHorizontal: 14, borderRadius: Radius.pill, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
  // 글자 색을 투명하게 하고 그림자만 퍼뜨려 흐린 글씨처럼 보이게 (그림자는 veilShadow)
  veiled: { color: 'transparent' },
});
