import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, Share, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Animated, { Easing, FadeInDown, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';

import { CountUp } from '@/components/coach/count-up';
import { HeatGauge } from '@/components/coach/heat-gauge';
import { ReplyCards } from '@/components/coach/reply-cards';
import { isUnnamedCrush } from '@/components/crush/crush-name';
import { useCelebrate } from '@/components/fx/celebration';
import { AppText } from '@/components/ui/app-text';
import { PressableScale } from '@/components/ui/pressable-scale';
import { useToast } from '@/components/ui/toast';
import { Radius, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';
import { coachReportContent } from '@/lib/ai-report';
import { isUnlimited, useQuota } from '@/lib/billing/gate';
import { haptic } from '@/lib/haptics';
import { isKo, L } from '@/lib/i18n';
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
  /** 이 번호부터 답장을 가려 둔다 (웹 비회원·잠금 미리보기 — 가입·이용권이면 바로 보임) */
  lockedFrom?: number;
  /** 가린 답장을 여는 길 — signup: 가입하면(기본) · pass: 이용권이면 */
  lockMode?: 'signup' | 'pass';
  /** 가린 답장을 보려고 할 때 (가입 화면으로) */
  onUnlock?: (index: number) => void;
  /** 가장 최근 결과 — 3D 아이콘을 여기에만 둔다 (화면에 하나) */
  latest?: boolean;
}

// 존댓말·반말 칩은 한국어판에만 (영어에는 없는 구분)
const SPEECH_CHIP_KO = { polite: '존댓말 유지', casual: '반말 유지', mixed: '말투 섞임', unknown: null } as const;
/** 한 번 숫자 세기·축하를 보여 준 결과는 목록이 다시 그려져도 다시 하지 않는다 */
const revealedCards = new Set<string>();
/** 신고 내용 상한 (서버와 같은 4,000자) */
const REPORT_MAX = 4000;

/**
 * 코칭 결과 카드 — 1.4 「깔끔하게」 개편(11/12 회의 7·13번): 테두리 카드 → **회색 말풍선 하나**(피클 「대화 속 카드」 결).
 * 코치 한마디 → **답장 3가지(주인공, 흰 카드)** → 숫자(관심 있을 가능성·호감 온도)를 흰 카드 하나에 키-값 줄로 → 다음 단계 → 접은 설명.
 * 예전에는 큰 숫자 5개가 답장보다 위에 있어 카드가 약 1,200pt 였고 답장이 화면 밖에 있었다. 큰 숫자는 관심도 하나만.
 */
export function AnalysisCard({ analysis, heat, revealKey, partnerName, selectedReplyIndex, onSelectReply, onRegenerate, regenerating, onReport, lockedFrom, onUnlock, lockMode = 'signup', latest }: AnalysisCardProps) {
  const theme = useTheme();
  const dark = useColorScheme() === 'dark';
  const toast = useToast();
  const celebrate = useCelebrate();
  const quota = useQuota();
  // 「다른 답장 더 보기」가 무료 1회를 쓰는지 — 무제한이 아니고 횟수 제한이 있을 때만 「1회」를 적는다
  const regenCosts = quota.enforced && !isUnlimited(quota);
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
  const speechChip = isKo && analysis.speechLevel ? SPEECH_CHIP_KO[analysis.speechLevel] : null;
  // 알아챈 호칭·말투 — 색 칩 대신 회색 한 줄
  const detected = [analysis.callName ? L(`호칭 「${analysis.callName}」 그대로`, `Using “${analysis.callName}” like you do`) : null, speechChip].filter(Boolean).join(' · ');
  // 회색 말풍선 안의 흰 카드 (다크는 한 단계 밝은 면)
  const innerFill = dark ? theme.surfaceElevated : theme.card;
  const score = analysis.temperature === 'unknown' ? null : analysis.interestScore;
  const named = partnerName && !isUnnamedCrush(partnerName) ? partnerName : null;
  const why = replies.map((r, i) => (r.why?.trim() && !isLocked(i) ? { i, text: r.why.trim() } : null)).filter((x): x is { i: number; text: string } => Boolean(x));
  // 11/12 회의 13번 「답이 너무 김」 — 기본 화면은 요약·관심도·답장·다음 단계만, 주의할 점·포인트·이유는 접어 둔다
  const hasDetails = analysis.insights.length > 0 || why.length > 0 || analysis.warnings.length > 0;

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
    toast.show(L('복사했어요. 카톡에 붙여넣기만 하면 끝!', 'Copied! Just paste it in your chat.'), 'success');
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
      .map((r, i) => (i !== first && !isLocked(i) ? L(`답장 ${i + 1}: ${r.text}${r.expectedReaction ? ` (예상 반응: ${r.expectedReaction})` : ''}`, `Reply ${i + 1}: ${r.text}${r.expectedReaction ? ` (Likely reaction: ${r.expectedReaction})` : ''}`) : ''))
      .filter(Boolean);
    onReport?.([coachReportContent(analysis, first), ...others].join('\n').slice(0, REPORT_MAX));
  };

  const heatCaption = heat
    ? heat.delta > 0
      ? L('이번 대화로 따뜻해졌어요', 'This chat warmed things up')
      : heat.delta < 0
        ? L('이번 대화로 조금 식었어요', 'This chat cooled things a bit')
        : L('이번 대화로는 그대로예요', 'No change from this chat')
    : undefined;
  let step = 0;
  const enter = () => (reveal ? FadeInDown.delay(80 + step++ * 70).duration(320) : undefined);

  return (
    <View style={[styles.card, { backgroundColor: dark ? theme.surface : theme.bubbleCoach }]}>
      {/* 코치 한마디 + 알아챈 호칭·말투 (「언니면 언니」 그대로 쓴다는 걸 보여 준다) */}
      <Animated.View entering={enter()} style={styles.block}>
        {detected ? (
          <AppText variant="caption" color="textSecondary" weight="600">
            {detected}
          </AppText>
        ) : null}
        <AppText variant="body">{analysis.summary}</AppText>
      </Animated.View>

      {/* 답장 3가지 — 결과의 주인공이라 맨 위에 */}
      {replies.length ? (
        <Animated.View entering={enter()} style={styles.block}>
          <AppText variant="bodyStrong">{L('이렇게 답장해 봐요', 'Try replying like this')}</AppText>
          {lockedFrom != null && onUnlock && replies.length > lockedFrom ? (
            <AppText variant="caption" color="primary" weight="600">
              {lockMode === 'pass'
                ? L(
                    `오늘 무료를 다 써서 미리보기예요 · 답장 ${replies.length - lockedFrom}개는 이용권이면 바로 보여요`,
                    `Free preview · ${replies.length - lockedFrom} more ${replies.length - lockedFrom === 1 ? 'reply' : 'replies'} with a pass`,
                  )
                : L(`답장 ${replies.length - lockedFrom}개가 더 있어요 · 가입하면 바로 보여요`, `${replies.length - lockedFrom} more ${replies.length - lockedFrom === 1 ? 'reply' : 'replies'} · Sign up to see them`)}
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
            lockMode={lockMode}
            reveal={reveal}
          />
        </Animated.View>
      ) : null}

      {/* 숫자 — 흰 카드 하나에 키-값 줄: 관심 있을 가능성(가는 막대) · 호감 온도 */}
      {score != null || analysis.temperature !== 'unknown' || heat ? (
        <Animated.View entering={enter()} style={[styles.inner, { backgroundColor: innerFill }]}>
          {score != null ? (
            <View ref={anchor} style={styles.metric}>
              <View style={styles.rowBetween}>
                <View style={styles.flexShrink}>
                  <AppText variant="bodyStrong">{L('관심 있을 가능성', 'Chance they’re into you')}</AppText>
                  <AppText variant="caption" color="textSecondary">
                    {L('이번 대화 분위기', 'Chat vibe')} · {vibe.label}
                  </AppText>
                </View>
                <CountUp value={score} animate={reveal} delay={250} duration={1000} ticks suffix="%" style={[styles.bigNumber, { color: theme.primary }]} suffixStyle={[styles.bigUnit, { color: theme.primary }]} onDone={sparkle} />
              </View>
              <InterestBar value={score} animate={reveal} />
              <AppText variant="caption" color="textSecondary">
                {vibe.description}
              </AppText>
            </View>
          ) : analysis.temperature !== 'unknown' ? (
            // 관심도 점수가 없는 예전 결과 — 예전처럼 이번 대화의 호감 온도(분위기)는 보여 준다
            <View style={styles.rowBetween}>
              <View style={styles.flexShrink}>
                <AppText variant="bodyStrong">{L('이번 대화 호감 온도', 'Interest level in this chat')}</AppText>
                <AppText variant="caption" color="textSecondary">
                  {vibe.description}
                </AppText>
              </View>
              <AppText variant="bodyStrong" color="primary">
                {vibe.label}
              </AppText>
            </View>
          ) : null}
          {heat ? (
            <View style={score != null || analysis.temperature !== 'unknown' ? [styles.heatBox, { borderTopColor: theme.separator }] : null}>
              <HeatGauge value={heat.after} from={heat.before} delta={heat.delta} revealKey={revealKey} compact title={named ? L(`${named}님과의 호감 온도`, `Interest level with ${named}`) : L('호감 온도', 'Interest level')} caption={heatCaption} />
            </View>
          ) : null}
        </Animated.View>
      ) : null}

      {/* 다음 단계 */}
      {analysis.nextStep ? (
        <Animated.View entering={enter()} style={styles.nextRow}>
          <Ionicons name="arrow-forward-circle-outline" size={18} color={theme.textSecondary} style={styles.nextIcon} />
          <AppText variant="small" style={styles.flexShrink}>
            <AppText variant="smallStrong">{L('다음 단계 ', 'Next step ')}</AppText>
            {analysis.nextStep}
          </AppText>
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
              {open
                ? L('설명 접기', 'Hide details')
                : analysis.warnings.length
                  ? L('왜 이렇게 답할까? · 주의할 점', 'Why these replies? · Watch out')
                  : L('왜 이렇게 답할까? · 읽어낸 포인트', 'Why these replies? · What I noticed')}
            </AppText>
            <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={15} color={theme.textTertiary} />
          </Pressable>
          {open ? (
            <Animated.View entering={FadeInDown.duration(220)} style={styles.details}>
              {analysis.warnings.length ? <Detail title={L('주의할 점', 'Watch out')} lines={analysis.warnings} /> : null}
              {analysis.insights.length ? <Detail title={L('읽어낸 포인트', 'What I noticed')} lines={analysis.insights} /> : null}
              {why.length ? <Detail title={L('답장을 고른 이유', 'Why these replies')} lines={why.map((w) => L(`${w.i + 1}번 · ${w.text}`, `#${w.i + 1} · ${w.text}`))} /> : null}
            </Animated.View>
          ) : null}
        </View>
      ) : null}

      {/* 다른 답장 · 신고 */}
      {onRegenerate || onReport ? (
        <View style={styles.footer}>
          {onRegenerate ? (
            <PressableScale
              accessibilityLabel={L('다른 답장 더 보기', 'More replies')}
              accessibilityHint={regenCosts ? L('무료 코칭 1회를 써요', 'Uses 1 free coaching') : undefined}
              accessibilityState={{ disabled: regenerating }}
              feedback="tap"
              onPress={() => onRegenerate()}
              disabled={regenerating}
              style={[styles.again, { backgroundColor: innerFill, opacity: regenerating ? 0.6 : 1 }]}>
              <Ionicons name="refresh" size={15} color={theme.text} />
              <AppText variant="smallStrong">{regenerating ? L('새로 만드는 중…', 'Making new ones…') : L('다른 답장 더 보기', 'More replies')}</AppText>
              {/* 무료 1회를 쓰는 버튼은 누르기 전에 알린다 (「모르는 새 닳았다」 방지) */}
              {regenCosts && !regenerating ? (
                <AppText variant="caption" color="textTertiary">
                  {L('· 1회', '· 1 use')}
                </AppText>
              ) : null}
            </PressableScale>
          ) : (
            <View />
          )}
          {onReport ? (
            <Pressable accessibilityRole="button" accessibilityLabel={L('이 답변 신고하기', 'Report this AI answer')} onPress={reportAnswer} hitSlop={10} style={styles.report}>
              <Ionicons name="flag-outline" size={14} color={theme.textTertiary} />
              <AppText variant="caption" color="textTertiary">
                {L('신고', 'Report')}
              </AppText>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

/** 관심 있을 가능성 막대 — 가는 단색 막대(1.4 개편), 처음 도착한 결과면 0 에서 차오른다 */
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
    <View onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)} style={[styles.track, { backgroundColor: theme.surface }]}>
      {width > 0 ? (
        <Animated.View style={[styles.fill, { backgroundColor: theme.primary }, fill]} />
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
  // 회색 결과 말풍선 — 테두리·그림자 없이 면 하나(피클 결). 코치 쪽 첫 모서리만 작게
  card: { borderRadius: 24, borderTopLeftRadius: 6, padding: Spacing.md + 2, gap: Spacing.lg, alignSelf: 'stretch' },
  block: { gap: Spacing.sm },
  inner: { borderRadius: 20, padding: Spacing.md + 2, gap: Spacing.md },
  metric: { gap: Spacing.sm },
  flexShrink: { flexShrink: 1 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm },
  // 카드의 큰 숫자는 이것 하나 (예전 44pt → 28pt)
  bigNumber: { fontSize: 28, lineHeight: 34, fontWeight: '700', letterSpacing: -0.8 },
  bigUnit: { fontSize: 17, fontWeight: '700' },
  track: { height: 6, borderRadius: Radius.pill, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: Radius.pill },
  heatBox: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: Spacing.md },
  nextRow: { flexDirection: 'row', gap: 6, alignItems: 'flex-start', paddingHorizontal: 2 },
  nextIcon: { marginTop: 1 },
  moreRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, alignSelf: 'flex-start', minHeight: 24, paddingHorizontal: 2 },
  details: { gap: Spacing.md, paddingHorizontal: 2 },
  detail: { gap: 3 },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: -Spacing.xs },
  again: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: Spacing.lg, height: 40, borderRadius: Radius.pill },
  report: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingVertical: Spacing.sm, paddingHorizontal: Spacing.xs },
});
