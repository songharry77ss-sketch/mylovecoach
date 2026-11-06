import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, Share, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Animated, { Easing, FadeInDown, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';

import { CountUp } from '@/components/coach/count-up';
import { HeatGauge } from '@/components/coach/heat-gauge';
import { ReplyCards } from '@/components/coach/reply-cards';
import { Icon3D } from '@/components/brand/brand';
import { useCelebrate } from '@/components/fx/celebration';
import { AppText } from '@/components/ui/app-text';
import { PressableScale } from '@/components/ui/pressable-scale';
import { useToast } from '@/components/ui/toast';
import { Brand, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { coachReportContent } from '@/lib/ai-report';
import { haptic } from '@/lib/haptics';
import { TEMPERATURES } from '@/lib/labels';
import { noteWinAndMaybeAskReview } from '@/lib/store-review';
import type { ChatMessage, CoachAnalysis, Tone } from '@/lib/types';

interface AnalysisCardProps {
  analysis: CoachAnalysis;
  /** 이 분석으로 바뀐 누적 온도 */
  heat?: ChatMessage['heat'];
  /** 처음 도착했을 때 한 번만 숫자 세기·축하를 보여 주기 위한 키 */
  revealKey?: string;
  /** 상대 이름 (호감 온도 제목·예상 반응 표시용) */
  partnerName?: string;
  selectedReplyIndex?: number;
  onSelectReply: (index: number) => void;
  onRegenerate?: (tone?: Tone) => void;
  regenerating?: boolean;
  /**
   * 이 답변 신고 (신고할 내용을 넘긴다). 없으면 신고 버튼을 숨긴다.
   * 시트는 화면이 하나만 둔다 — 카드마다 두면 목록이 카드를 내렸다 다시 그릴 때 열린 시트·적던 메모가 사라질 수 있다
   */
  onReport?: (content: string) => void;
  /** 이 번호부터 답장을 가려 둔다 (웹 비회원 — 가입하면 바로 보임) */
  lockedFrom?: number;
  /** 가린 답장을 보려고 할 때 (가입 화면으로) */
  onUnlock?: (index: number) => void;
  /** 가장 최근 결과 — 3D 아이콘을 여기에만 둔다 (화면에 하나) */
  latest?: boolean;
}

const SPEECH_CHIP = { polite: '존댓말 유지', casual: '반말 유지', mixed: '말투 섞임', unknown: null } as const;
/** 한 번 숫자 세기·축하를 보여 준 결과는 목록이 다시 그려져도 다시 하지 않는다 */
const revealedCards = new Set<string>();
/** 신고 내용 상한 (서버와 같은 4,000자) */
const REPORT_MAX = 4000;

/**
 * 코칭 결과 카드 (럽코 시안 결과 화면을 채팅 안에) — 코치 한마디 → 관심 있을 가능성 큰 숫자·막대 →
 * 답장 3가지(성공 확률·복사) → 호감 온도와 변화 → 다음 단계. 처음 도착하면 숫자가 세어 올라가고 가볍게 축하한다
 */
export function AnalysisCard({ analysis, heat, revealKey, partnerName, selectedReplyIndex, onSelectReply, onRegenerate, regenerating, onReport, lockedFrom, onUnlock, latest }: AnalysisCardProps) {
  const theme = useTheme();
  const toast = useToast();
  const celebrate = useCelebrate();
  const [copied, setCopied] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  // 처음 그릴 때 한 번만 정한다 (목록이 다시 그려도 숫자를 다시 세지 않게)
  const [reveal] = useState(() => Boolean(revealKey && !revealedCards.has(revealKey)));
  const anchor = useRef<View>(null);

  useEffect(() => {
    if (reveal && revealKey) revealedCards.add(revealKey);
  }, [reveal, revealKey]);

  const replies = analysis.replies;
  const isLocked = (i: number) => lockedFrom != null && i >= lockedFrom && Boolean(onUnlock);
  const vibe = TEMPERATURES[analysis.temperature];
  const speechChip = analysis.speechLevel ? SPEECH_CHIP[analysis.speechLevel] : null;
  const score = analysis.temperature === 'unknown' ? null : analysis.interestScore;
  const named = partnerName && partnerName !== '상대' ? partnerName : null;
  const why = replies.map((r, i) => (r.why?.trim() && !isLocked(i) ? { i, text: r.why.trim() } : null)).filter((x): x is { i: number; text: string } => Boolean(x));
  const hasDetails = analysis.insights.length > 0 || why.length > 0;

  // 숫자가 다 세어지면 관심도 숫자 자리에서 반짝 (좋은 신호일 때만 — 식은 결과에 축하는 어색하다)
  const sparkle = () => {
    if (score == null || score < 40) return;
    anchor.current?.measureInWindow?.((x, y, w) => {
      celebrate({ kind: 'sparkles', x: Number.isFinite(x) ? x + w - 30 : undefined, y: Number.isFinite(y) ? y + 20 : undefined, count: 12 });
    });
  };

  const copy = async (index: number, at?: { x: number; y: number }) => {
    const target = replies[index];
    if (!target) return;
    if (isLocked(index)) return onUnlock?.(index);
    await Clipboard.setStringAsync(target.text);
    haptic.success();
    setCopied(index);
    onSelectReply(index);
    celebrate({ kind: 'sparkles', x: at?.x, y: at?.y, count: 14, haptic: false });
    toast.show('복사했어요. 카톡에 붙여넣기만 하면 끝!', 'success');
    // 가장 만족한 순간 — 여러 번 쌓이면 가끔 스토어 별점을 부탁한다
    noteWinAndMaybeAskReview('reply_copy');
  };

  // 복사 대신 카톡 등으로 바로 보내고 싶을 때 (웹에서는 공유 기능이 없으면 복사로 대체)
  const shareReply = async (index: number) => {
    const reply = replies[index];
    if (!reply) return;
    onSelectReply(index);
    if (Platform.OS === 'web') {
      const webShare = (globalThis as { navigator?: { share?: (d: { text: string }) => Promise<void> } }).navigator?.share;
      if (!webShare) return copy(index);
      await webShare.call(globalThis.navigator, { text: reply.text }).catch(() => {});
      return;
    }
    await Share.share({ message: reply.text }).catch(() => {});
  };

  // 불쾌하거나 부적절한 답변 신고 — 카드에 보이는 AI 글(요약, 보이는 답장과 예상 반응·이유, 포인트·다음 단계·주의할 점)을 보낸다 (구글 플레이 생성형 AI 정책)
  const reportAnswer = () => {
    const first = selectedReplyIndex != null && !isLocked(selectedReplyIndex) ? selectedReplyIndex : 0;
    const others = replies
      .map((r, i) => (i !== first && !isLocked(i) ? `답장 ${i + 1}: ${r.text}${r.expectedReaction ? ` (예상 반응: ${r.expectedReaction})` : ''}` : ''))
      .filter(Boolean);
    onReport?.([coachReportContent(analysis, first), ...others].join('\n').slice(0, REPORT_MAX));
  };

  const heatCaption = heat ? (heat.delta > 0 ? '이번 대화로 따뜻해졌어요' : heat.delta < 0 ? '이번 대화로 조금 식었어요' : '이번 대화로는 그대로예요') : undefined;
  let step = 0;
  const enter = () => (reveal ? FadeInDown.delay(80 + step++ * 70).duration(320) : undefined);

  return (
    <View style={[styles.card, { backgroundColor: theme.bubbleCoach, borderColor: theme.border }]}>
      {/* 코치 한마디 + 알아챈 호칭·말투 (「언니면 언니」 그대로 쓴다는 걸 보여 준다) */}
      <Animated.View entering={enter()} style={styles.block}>
        {analysis.callName || speechChip ? (
          <View style={styles.detected}>
            {analysis.callName ? (
              <View style={[styles.chip, { backgroundColor: theme.accentSoft }]}>
                <AppText variant="caption" color="accent" weight="700">
                  호칭 「{analysis.callName}」 그대로
                </AppText>
              </View>
            ) : null}
            {speechChip ? (
              <View style={[styles.chip, { backgroundColor: theme.primarySoft }]}>
                <AppText variant="caption" color="primary" weight="700">
                  {speechChip}
                </AppText>
              </View>
            ) : null}
          </View>
        ) : null}
        <AppText variant="body">{analysis.summary}</AppText>
      </Animated.View>

      {/* 관심 있을 가능성 — 큰 숫자 + 그라데이션 막대 */}
      {score != null ? (
        <Animated.View entering={enter()} style={styles.block}>
          <View ref={anchor} style={styles.rowBetween}>
            <View style={styles.flexShrink}>
              <AppText variant="title3">관심 있을 가능성</AppText>
              <AppText variant="caption" color="textSecondary">
                이번 대화 분위기 · {vibe.label}
              </AppText>
            </View>
            <CountUp value={score} animate={reveal} delay={250} duration={1100} ticks suffix="%" style={[styles.bigNumber, { color: theme.primary }]} suffixStyle={[styles.bigUnit, { color: theme.primary }]} onDone={sparkle} />
          </View>
          <InterestBar value={score} animate={reveal} />
          <AppText variant="caption" color="textSecondary">
            {vibe.description}
          </AppText>
        </Animated.View>
      ) : analysis.temperature !== 'unknown' ? (
        // 관심도 점수가 없는 예전 결과 — 예전처럼 이번 대화의 호감 온도(분위기)는 보여 준다
        <Animated.View entering={enter()} style={styles.block}>
          <View style={styles.rowBetween}>
            <View style={styles.flexShrink}>
              <AppText variant="title3">이번 대화 호감 온도</AppText>
              <AppText variant="caption" color="textSecondary">
                {vibe.description}
              </AppText>
            </View>
            <View style={[styles.vibePill, { backgroundColor: theme.primarySoft }]}>
              <AppText variant="title3" color="primary">
                {vibe.label}
              </AppText>
            </View>
          </View>
        </Animated.View>
      ) : null}

      {/* 답장 3가지 */}
      {replies.length ? (
        <Animated.View entering={enter()} style={styles.block}>
          <View style={styles.rowBetween}>
            <AppText variant="title3">이렇게 답장해 봐요</AppText>
            {latest ? <Icon3D name="heart" size={38} float /> : null}
          </View>
          {lockedFrom != null && onUnlock && replies.length > lockedFrom ? (
            <AppText variant="caption" color="primary" weight="700">
              답장 {replies.length - lockedFrom}개가 더 있어요 · 가입하면 바로 보여요
            </AppText>
          ) : null}
          <ReplyCards
            replies={replies}
            partnerName={partnerName}
            copiedIndex={copied}
            selectedIndex={selectedReplyIndex}
            onCopy={copy}
            onShare={shareReply}
            lockedFrom={onUnlock ? lockedFrom : undefined}
            onUnlock={onUnlock}
            reveal={reveal}
          />
        </Animated.View>
      ) : null}

      {/* 누적 호감 온도와 이번 변화 */}
      {heat ? (
        <Animated.View entering={enter()} style={[styles.heatBox, { borderTopColor: theme.border }]}>
          <HeatGauge value={heat.after} from={heat.before} delta={heat.delta} revealKey={revealKey} compact title={named ? `${named}님과의 호감 온도` : '호감 온도'} caption={heatCaption} />
        </Animated.View>
      ) : null}

      {/* 다음 단계 · 주의할 점 */}
      {analysis.nextStep || analysis.warnings.length ? (
        <Animated.View entering={enter()} style={[styles.next, { backgroundColor: theme.surface }]}>
          {analysis.nextStep ? (
            <View style={styles.nextRow}>
              <Ionicons name="arrow-forward-circle" size={20} color={theme.primary} style={styles.nextIcon} />
              <View style={styles.flexShrink}>
                <AppText variant="smallStrong" color="primary">
                  다음 단계
                </AppText>
                <AppText variant="small">{analysis.nextStep}</AppText>
              </View>
            </View>
          ) : null}
          {analysis.warnings.map((w, i) => (
            <View key={i} style={styles.nextRow}>
              <Ionicons name="alert-circle-outline" size={18} color={theme.textSecondary} style={styles.nextIcon} />
              <AppText variant="small" color="textSecondary" style={styles.flexShrink}>
                {w}
              </AppText>
            </View>
          ))}
        </Animated.View>
      ) : null}

      {/* 왜 이렇게 답할까 — 접어 둔다 */}
      {hasDetails ? (
        <View style={styles.block}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: open }}
            onPress={() => {
              haptic.select();
              setOpen((v) => !v);
            }}
            hitSlop={8}
            style={styles.moreRow}>
            <AppText variant="smallStrong" color="textSecondary">
              {open ? '설명 접기' : '왜 이렇게 답할까? · 읽어낸 포인트'}
            </AppText>
            <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={15} color={theme.textTertiary} />
          </Pressable>
          {open ? (
            <Animated.View entering={FadeInDown.duration(220)} style={styles.details}>
              {analysis.insights.length ? <Detail title="읽어낸 포인트" lines={analysis.insights} /> : null}
              {why.length ? <Detail title="답장을 고른 이유" lines={why.map((w) => `${w.i + 1}번 · ${w.text}`)} /> : null}
            </Animated.View>
          ) : null}
        </View>
      ) : null}

      {/* 다른 답장 · 신고 */}
      {onRegenerate || onReport ? (
        <View style={styles.footer}>
          {onRegenerate ? (
            <PressableScale
              accessibilityLabel="다른 답장 더 보기"
              accessibilityState={{ disabled: regenerating }}
              feedback="tap"
              onPress={() => onRegenerate()}
              disabled={regenerating}
              style={[styles.again, { backgroundColor: theme.surface, opacity: regenerating ? 0.6 : 1 }]}>
              <Ionicons name="refresh" size={16} color={theme.text} />
              <AppText variant="smallStrong">{regenerating ? '새로 만드는 중…' : '다른 답장 더 보기'}</AppText>
            </PressableScale>
          ) : (
            <View />
          )}
          {onReport ? (
            <Pressable accessibilityRole="button" accessibilityLabel="이 답변 신고하기" onPress={reportAnswer} hitSlop={10} style={styles.report}>
              <Ionicons name="flag-outline" size={14} color={theme.textTertiary} />
              <AppText variant="caption" color="textTertiary">
                신고
              </AppText>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

/** 관심 있을 가능성 막대 — 처음 도착한 결과면 0 에서 차오른다 */
function InterestBar({ value, animate }: { value: number; animate: boolean }) {
  const theme = useTheme();
  const [width, setWidth] = useState(0);
  const p = useSharedValue(animate ? 0 : value / 100);
  useEffect(() => {
    if (animate) p.value = withDelay(250, withTiming(value / 100, { duration: 1100, easing: Easing.out(Easing.cubic) }));
    else p.value = value / 100;
  }, [animate, value, p]);
  const fill = useAnimatedStyle(() => ({ width: Math.max(10, p.value * width) }));
  return (
    <View onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)} style={[styles.track, { backgroundColor: theme.surfaceSelected }]}>
      {width > 0 ? (
        <Animated.View style={[styles.fill, fill]}>
          <LinearGradient colors={Brand.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
        </Animated.View>
      ) : null}
    </View>
  );
}

function Detail({ title, lines }: { title: string; lines: string[] }) {
  return (
    <View style={styles.detail}>
      <AppText variant="caption" color="textTertiary" weight="700">
        {title}
      </AppText>
      {lines.map((line, i) => (
        <AppText key={i} variant="small" color="textSecondary">
          · {line}
        </AppText>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: Radius.xl, borderTopLeftRadius: 6, borderWidth: 1, padding: Spacing.lg, gap: Spacing.xl, alignSelf: 'stretch' },
  block: { gap: Spacing.sm + 2 },
  flexShrink: { flexShrink: 1 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm },
  detected: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs },
  chip: { paddingHorizontal: Spacing.sm + 2, paddingVertical: 4, borderRadius: Radius.pill },
  bigNumber: { fontSize: 44, lineHeight: 50, fontWeight: '900', letterSpacing: -1.6 },
  bigUnit: { fontSize: 22, fontWeight: '800' },
  vibePill: { paddingHorizontal: Spacing.md + 2, paddingVertical: Spacing.sm, borderRadius: Radius.pill },
  track: { height: 10, borderRadius: Radius.pill, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: Radius.pill, overflow: 'hidden' },
  heatBox: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: Spacing.lg },
  next: { borderRadius: Radius.lg, padding: Spacing.md + 2, gap: Spacing.md },
  nextRow: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'flex-start' },
  nextIcon: { marginTop: 1 },
  moreRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, alignSelf: 'flex-start', minHeight: 24 },
  details: { gap: Spacing.md },
  detail: { gap: 3 },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: -Spacing.xs },
  again: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: Spacing.lg, height: 44, borderRadius: Radius.pill },
  report: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingVertical: Spacing.sm, paddingHorizontal: Spacing.xs },
});
