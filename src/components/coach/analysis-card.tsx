import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import { Platform, Pressable, Share, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, ZoomIn } from 'react-native-reanimated';

import { useAiReport } from '@/components/coach/ai-report-sheet';
import { HeatGauge } from '@/components/coach/heat-gauge';
import { ReplyCarousel } from '@/components/coach/reply-carousel';
import { TemperatureGauge } from '@/components/coach/temperature-gauge';
import { useCelebrate } from '@/components/fx/celebration';
import { AppText } from '@/components/ui/app-text';
import { PressableScale } from '@/components/ui/pressable-scale';
import { useToast } from '@/components/ui/toast';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { coachReportContent } from '@/lib/ai-report';
import { haptic } from '@/lib/haptics';
import { TEMPERATURES } from '@/lib/labels';
import type { ChatMessage, CoachAnalysis, Tone } from '@/lib/types';

interface AnalysisCardProps {
  analysis: CoachAnalysis;
  /** 이 분석으로 바뀐 누적 온도 */
  heat?: ChatMessage['heat'];
  /** 처음 도착했을 때 한 번만 애니메이션을 보여 주기 위한 키 */
  revealKey?: string;
  /** 상대 이름 (예상 반응 표시용) */
  partnerName?: string;
  selectedReplyIndex?: number;
  onSelectReply: (index: number) => void;
  onRegenerate?: (tone?: Tone) => void;
  regenerating?: boolean;
  /** 비밀 상담의 결과 — 신고하면 이 답변은 저장된다고 먼저 알린다 */
  secret?: boolean;
}

const SPEECH_CHIP = { polite: '🙇 존댓말 유지', casual: '👋 반말 유지', mixed: '🔀 말투 섞임', unknown: null } as const;

/**
 * 결과 카드 — 누적 호감 온도가 차오르고, 답장 여러 버전을 스와이프로 넘겨 본다.
 * 카드를 누르거나 아래 버튼으로 복사하면 하트가 터진다. 이유·다음 스텝은 접어 둔다.
 */
export function AnalysisCard({ analysis, heat, revealKey, partnerName, selectedReplyIndex, onSelectReply, onRegenerate, regenerating, secret }: AnalysisCardProps) {
  const theme = useTheme();
  const toast = useToast();
  const celebrate = useCelebrate();
  const report = useAiReport();
  // 예전에 골라 둔 답장이 있으면 그것부터 보여 준다
  const [shown, setShown] = useState(selectedReplyIndex ?? 0);
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<number | null>(null);

  const replies = analysis.replies;
  const current = Math.min(shown, Math.max(0, replies.length - 1));
  const reply = replies[current];
  const hasDetails = Boolean(reply?.why || analysis.insights.length || analysis.nextStep || analysis.warnings.length);
  const speechChip = analysis.speechLevel ? SPEECH_CHIP[analysis.speechLevel] : null;
  const vibe = TEMPERATURES[analysis.temperature];

  const copy = async (index = current, at?: { x: number; y: number }) => {
    const target = replies[index];
    if (!target) return;
    await Clipboard.setStringAsync(target.text);
    setCopied(index);
    onSelectReply(index);
    celebrate({ kind: 'hearts', x: at?.x, y: at?.y, count: 12 });
    toast.show('복사했어요. 카톡에 붙여넣기만 하면 끝!', 'success');
  };

  // 복사 대신 카톡 등으로 바로 보내고 싶을 때 (웹에서는 공유 기능이 없으면 복사로 대체)
  const shareReply = async () => {
    if (!reply) return;
    haptic.tap();
    onSelectReply(current);
    if (Platform.OS === 'web') {
      const webShare = (globalThis as { navigator?: { share?: (d: { text: string }) => Promise<void> } }).navigator?.share;
      if (!webShare) return copy();
      await webShare.call(globalThis.navigator, { text: reply.text }).catch(() => {});
      return;
    }
    await Share.share({ message: reply.text }).catch(() => {});
  };

  // 불쾌하거나 부적절한 답변 신고 — 요약과 지금 보고 있는 답장을 보낸다 (구글 플레이 생성형 AI 정책)
  const reportAnswer = () => report.open({ mode: 'coach', content: coachReportContent(analysis, current), secret });

  if (!reply) {
    return (
      <View style={styles.wrap}>
        <View style={[styles.card, { backgroundColor: theme.surfaceElevated, borderColor: theme.border }]}>
          {heat ? <HeatGauge value={heat.after} from={heat.before} delta={heat.delta} revealKey={revealKey} compact caption={`이번 대화 ${vibe.emoji} ${vibe.label}`} /> : null}
          <AppText variant="body">{analysis.summary}</AppText>
          {analysis.nextStep ? (
            <AppText variant="small" color="primary">
              👉 {analysis.nextStep}
            </AppText>
          ) : null}
          {report.available ? (
            <Pressable accessibilityRole="button" onPress={reportAnswer} hitSlop={6} style={styles.reportRow}>
              <Ionicons name="flag-outline" size={13} color={theme.textTertiary} />
              <AppText variant="caption" color="textTertiary">
                이 답변 신고하기
              </AppText>
            </Pressable>
          ) : null}
        </View>
        {report.sheet}
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <View style={[styles.card, { backgroundColor: theme.surfaceElevated, borderColor: theme.border }]}>
        {/* 누적 호감 온도 (예전 결과는 그때의 호감 점수) */}
        {heat ? (
          <HeatGauge value={heat.after} from={heat.before} delta={heat.delta} revealKey={revealKey} compact caption={`이번 대화 ${vibe.emoji} ${vibe.label}`} />
        ) : analysis.temperature !== 'unknown' || analysis.interestScore != null ? (
          <TemperatureGauge temperature={analysis.temperature} score={analysis.interestScore} compact />
        ) : null}

        {/* 코치가 알아챈 호칭·말투 — 「언니면 언니」 그대로 쓴다는 걸 보여 준다 */}
        {analysis.callName || speechChip ? (
          <Animated.View entering={FadeInDown.delay(200).duration(260)} style={styles.detected}>
            {analysis.callName ? (
              <View style={[styles.detectChip, { backgroundColor: theme.accentSoft }]}>
                <AppText variant="caption" color="accent" weight="700">
                  🗣️ 호칭 「{analysis.callName}」 그대로
                </AppText>
              </View>
            ) : null}
            {speechChip ? (
              <View style={[styles.detectChip, { backgroundColor: theme.primarySoft }]}>
                <AppText variant="caption" color="primary" weight="700">
                  {speechChip}
                </AppText>
              </View>
            ) : null}
          </Animated.View>
        ) : null}

        {/* 답장 버전들 — 옆으로 넘겨 본다 */}
        <ReplyCarousel
          replies={replies}
          index={current}
          onIndexChange={(i) => {
            setShown(i);
          }}
          onCopy={(i, at) => copy(i, at)}
          copiedIndex={copied}
          partnerName={partnerName}
        />

        <View style={styles.actions}>
          <PressableScale
            accessibilityLabel="이 답장 복사하기"
            feedback={false}
            onPress={() => copy()}
            style={[styles.copyBtn, { backgroundColor: copied === current ? theme.primarySoft : theme.primary }]}>
            {copied === current ? (
              <Animated.View entering={ZoomIn.springify()}>
                <Ionicons name="checkmark-circle" size={18} color={theme.primary} />
              </Animated.View>
            ) : (
              <Ionicons name="copy-outline" size={17} color={theme.primaryText} />
            )}
            <AppText variant="bodyStrong" color={copied === current ? 'primary' : theme.primaryText}>
              {copied === current ? '복사했어요' : replies.length > 1 ? `버전 ${current + 1} 복사하기` : '이 답장 복사하기'}
            </AppText>
          </PressableScale>
          <PressableScale accessibilityLabel="답장 공유하기" feedback={false} onPress={shareReply} style={[styles.shareBtn, { backgroundColor: theme.surface }]}>
            <Ionicons name="share-outline" size={19} color={theme.textSecondary} />
          </PressableScale>
          {report.available ? (
            <PressableScale accessibilityLabel="이 답변 신고하기" feedback={false} onPress={reportAnswer} style={[styles.shareBtn, { backgroundColor: theme.surface }]}>
              <Ionicons name="flag-outline" size={18} color={theme.textTertiary} />
            </PressableScale>
          ) : null}
        </View>
      </View>

      {/* 자세한 설명은 접어둔다 */}
      {hasDetails ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            haptic.select();
            setOpen((v) => !v);
          }}
          style={styles.moreRow}
          hitSlop={6}>
          <AppText variant="caption" color="textSecondary">
            {open ? '설명 접기' : '왜 이렇게 답할까? · 다음 스텝 보기'}
          </AppText>
          <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={13} color={theme.textTertiary} />
        </Pressable>
      ) : null}

      {open ? (
        <Animated.View entering={FadeInDown.duration(220)} style={styles.details}>
          {analysis.summary ? <Detail title="지금 분위기" body={analysis.summary} /> : null}
          {reply.why ? <Detail title="이 답장을 고른 이유" body={reply.why} /> : null}
          {analysis.insights.length ? <Detail title="읽어낸 포인트" lines={analysis.insights} /> : null}
          {analysis.nextStep ? <Detail title="다음 스텝" body={analysis.nextStep} tone="primary" /> : null}
          {analysis.warnings.length ? <Detail title="주의할 점" lines={analysis.warnings} tone="accent" /> : null}
        </Animated.View>
      ) : null}

      {onRegenerate ? (
        <PressableScale
          accessibilityLabel="다른 답장 더 보기"
          feedback="tap"
          onPress={() => onRegenerate()}
          disabled={regenerating}
          style={[styles.again, { backgroundColor: theme.surface, opacity: regenerating ? 0.7 : 1 }]}>
          <Ionicons name="refresh" size={14} color={theme.textSecondary} />
          <AppText variant="caption" color="textSecondary">
            {regenerating ? '새로 만드는 중…' : '다른 버전 더 보기'}
          </AppText>
        </PressableScale>
      ) : null}
      {report.sheet}
    </View>
  );
}

function Detail({ title, body, lines, tone }: { title: string; body?: string; lines?: string[]; tone?: 'primary' | 'accent' }) {
  const theme = useTheme();
  const color = tone === 'primary' ? theme.primary : tone === 'accent' ? theme.accent : theme.textSecondary;
  return (
    <View style={styles.detail}>
      <AppText variant="caption" color={color} style={styles.detailTitle}>
        {title}
      </AppText>
      {body ? (
        <AppText variant="small" color="textSecondary">
          {body}
        </AppText>
      ) : null}
      {lines?.map((line, i) => (
        <AppText key={i} variant="small" color="textSecondary">
          · {line}
        </AppText>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.sm, alignSelf: 'stretch' },
  card: { borderRadius: Radius.lg, borderTopLeftRadius: Radius.sm, borderWidth: 1, padding: Spacing.lg, gap: Spacing.md },
  detected: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs },
  detectChip: { paddingHorizontal: Spacing.sm + 2, paddingVertical: 4, borderRadius: Radius.pill },
  actions: { flexDirection: 'row', gap: Spacing.sm },
  copyBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, height: 50, borderRadius: Radius.md },
  shareBtn: { width: 50, height: 50, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  moreRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, paddingHorizontal: Spacing.xs },
  details: { gap: Spacing.md, paddingHorizontal: Spacing.xs, paddingBottom: Spacing.xs },
  detail: { gap: 2 },
  detailTitle: { fontWeight: '700' },
  again: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, alignSelf: 'flex-start', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: Radius.pill },
  reportRow: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start' },
});
