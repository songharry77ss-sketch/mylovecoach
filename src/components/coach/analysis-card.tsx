import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { Platform, Pressable, ScrollView, Share, StyleSheet, View } from 'react-native';

import { TemperatureGauge } from '@/components/coach/temperature-gauge';
import { AppText } from '@/components/ui/app-text';
import { useToast } from '@/components/ui/toast';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { toneLabel } from '@/lib/labels';
import type { CoachAnalysis, Tone } from '@/lib/types';

interface AnalysisCardProps {
  analysis: CoachAnalysis;
  selectedReplyIndex?: number;
  onSelectReply: (index: number) => void;
  onRegenerate?: (tone?: Tone) => void;
  regenerating?: boolean;
}

/**
 * 결과 카드 — 보낼 답장 하나를 크게 보여주고 복사 버튼을 가장 눈에 띄게 둔다.
 * 다른 톤은 칩으로 바꿔 보고, 이유·다음 스텝·주의점은 접어둔다.
 */
export function AnalysisCard({ analysis, selectedReplyIndex, onSelectReply, onRegenerate, regenerating }: AnalysisCardProps) {
  const theme = useTheme();
  const toast = useToast();
  // 예전에 골라 둔 답장이 있으면 그것부터 보여 준다
  const [shown, setShown] = useState(selectedReplyIndex ?? 0);
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const replies = analysis.replies;
  const reply = replies[Math.min(shown, replies.length - 1)];
  const hasDetails = Boolean(reply?.why || analysis.insights.length || analysis.nextStep || analysis.warnings.length);

  const copy = async () => {
    if (!reply) return;
    await Clipboard.setStringAsync(reply.text);
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setCopied(true);
    onSelectReply(shown);
    toast.show('복사했어요. 카톡에 붙여넣기만 하면 끝!', 'success');
  };

  // 복사 대신 카톡 등으로 바로 보내고 싶을 때 (웹에서는 공유 기능이 없으면 복사로 대체)
  const shareReply = async () => {
    if (!reply) return;
    onSelectReply(shown);
    if (Platform.OS === 'web') {
      const webShare = (globalThis as { navigator?: { share?: (d: { text: string }) => Promise<void> } }).navigator?.share;
      if (!webShare) return copy();
      await webShare.call(globalThis.navigator, { text: reply.text }).catch(() => {});
      return;
    }
    await Share.share({ message: reply.text }).catch(() => {});
  };

  if (!reply) {
    return (
      <View style={[styles.card, { backgroundColor: theme.surface }]}>
        <AppText variant="body">{analysis.summary}</AppText>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <View style={[styles.card, { backgroundColor: theme.surfaceElevated, borderColor: theme.border }]}>
        {/* 한 줄 요약: 호감 온도 */}
        {analysis.temperature !== 'unknown' || analysis.interestScore != null ? (
          <TemperatureGauge temperature={analysis.temperature} score={analysis.interestScore} compact />
        ) : null}

        {/* 보낼 답장 */}
        <Pressable accessibilityRole="button" accessibilityLabel="답장 복사" onPress={copy} style={({ pressed }) => [styles.replyBox, { opacity: pressed ? 0.7 : 1 }]}>
          <AppText style={styles.replyText}>{reply.text}</AppText>
        </Pressable>

        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            onPress={copy}
            style={({ pressed }) => [styles.copyBtn, { backgroundColor: copied ? theme.primarySoft : theme.primary, opacity: pressed ? 0.9 : 1 }]}>
            <Ionicons name={copied ? 'checkmark' : 'copy-outline'} size={17} color={copied ? theme.primary : theme.primaryText} />
            <AppText variant="bodyStrong" color={copied ? 'primary' : theme.primaryText}>
              {copied ? '복사했어요' : '이 답장 복사하기'}
            </AppText>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="답장 공유하기"
            onPress={shareReply}
            style={({ pressed }) => [styles.shareBtn, { backgroundColor: theme.surface, opacity: pressed ? 0.7 : 1 }]}>
            <Ionicons name="share-outline" size={19} color={theme.textSecondary} />
          </Pressable>
        </View>

        {/* 다른 톤으로 바꿔 보기 */}
        {replies.length > 1 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tones}>
            {replies.map((r, i) => {
              const t = toneLabel(r.tone);
              const on = i === shown;
              return (
                <Pressable
                  key={i}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  onPress={() => {
                    setShown(i);
                    setCopied(false);
                  }}
                  style={[styles.toneChip, { backgroundColor: on ? theme.primarySoft : theme.surface, borderColor: on ? theme.primary : 'transparent' }]}>
                  <AppText variant="caption" color={on ? 'primary' : 'textSecondary'}>
                    {t.emoji} {t.label}
                  </AppText>
                </Pressable>
              );
            })}
          </ScrollView>
        ) : null}
      </View>

      {/* 자세한 설명은 접어둔다 */}
      {hasDetails ? (
        <Pressable accessibilityRole="button" onPress={() => setOpen((v) => !v)} style={styles.moreRow} hitSlop={6}>
          <AppText variant="caption" color="textSecondary">
            {open ? '설명 접기' : '왜 이렇게 답할까? · 다음 스텝 보기'}
          </AppText>
          <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={13} color={theme.textTertiary} />
        </Pressable>
      ) : null}

      {open ? (
        <View style={styles.details}>
          {analysis.summary ? (
            <Detail title="지금 분위기" body={analysis.summary} />
          ) : null}
          {reply.why ? <Detail title="이 답장을 고른 이유" body={reply.why} /> : null}
          {analysis.insights.length ? <Detail title="읽어낸 포인트" lines={analysis.insights} /> : null}
          {analysis.nextStep ? <Detail title="다음 스텝" body={analysis.nextStep} tone="primary" /> : null}
          {analysis.warnings.length ? <Detail title="주의할 점" lines={analysis.warnings} tone="accent" /> : null}
        </View>
      ) : null}

      {onRegenerate ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => onRegenerate()}
          disabled={regenerating}
          style={({ pressed }) => [styles.again, { backgroundColor: theme.surface, opacity: pressed || regenerating ? 0.7 : 1 }]}>
          <Ionicons name="refresh" size={14} color={theme.textSecondary} />
          <AppText variant="caption" color="textSecondary">
            {regenerating ? '새로 만드는 중…' : '다른 답장 더 보기'}
          </AppText>
        </Pressable>
      ) : null}
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
  replyBox: { paddingVertical: Spacing.xs },
  replyText: { fontSize: 18, lineHeight: 28, fontWeight: '500', letterSpacing: -0.2 },
  actions: { flexDirection: 'row', gap: Spacing.sm },
  copyBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, height: 48, borderRadius: Radius.md },
  shareBtn: { width: 48, height: 48, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  tones: { gap: Spacing.xs },
  toneChip: { paddingHorizontal: Spacing.md, paddingVertical: 6, borderRadius: Radius.pill, borderWidth: 1 },
  moreRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, paddingHorizontal: Spacing.xs },
  details: { gap: Spacing.md, paddingHorizontal: Spacing.xs, paddingBottom: Spacing.xs },
  detail: { gap: 2 },
  detailTitle: { fontWeight: '700' },
  again: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, alignSelf: 'flex-start', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: Radius.pill },
});
