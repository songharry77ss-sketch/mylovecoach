import { StyleSheet, View } from 'react-native';

import { ReplyCard } from '@/components/coach/reply-card';
import { TemperatureGauge } from '@/components/coach/temperature-gauge';
import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { CoachAnalysis, Tone } from '@/lib/types';

interface AnalysisCardProps {
  analysis: CoachAnalysis;
  selectedReplyIndex?: number;
  onSelectReply: (index: number) => void;
  onRegenerate?: (tone?: Tone) => void;
  regenerating?: boolean;
}

export function AnalysisCard({ analysis, selectedReplyIndex, onSelectReply, onRegenerate, regenerating }: AnalysisCardProps) {
  const theme = useTheme();
  return (
    <View style={styles.wrap}>
      <View style={[styles.bubble, { backgroundColor: theme.surface }]}>
        <AppText variant="body">{analysis.summary}</AppText>
      </View>

      {analysis.temperature !== 'unknown' || analysis.interestScore != null ? (
        <View style={[styles.section, { backgroundColor: theme.surface }]}>
          <TemperatureGauge temperature={analysis.temperature} score={analysis.interestScore} />
        </View>
      ) : null}

      {analysis.insights.length ? (
        <View style={[styles.section, { backgroundColor: theme.surface }]}>
          <AppText variant="smallStrong" color="textSecondary" style={styles.sectionTitle}>
            읽어낸 포인트
          </AppText>
          {analysis.insights.map((line, i) => (
            <View key={i} style={styles.bullet}>
              <AppText variant="small" color="primary">
                •
              </AppText>
              <AppText variant="small" style={styles.bulletText}>
                {line}
              </AppText>
            </View>
          ))}
        </View>
      ) : null}

      {analysis.replies.length ? (
        <View style={styles.replies}>
          <AppText variant="smallStrong" color="textSecondary" style={styles.sectionTitle}>
            추천 답장 · 탭하면 복사돼요
          </AppText>
          {analysis.replies.map((reply, i) => (
            <ReplyCard key={i} reply={reply} index={i} selected={selectedReplyIndex === i} onCopied={onSelectReply} />
          ))}
        </View>
      ) : null}

      {analysis.nextStep ? (
        <View style={[styles.section, { backgroundColor: theme.primarySoft }]}>
          <AppText variant="smallStrong" color="primary" style={styles.sectionTitle}>
            다음 스텝
          </AppText>
          <AppText variant="small">{analysis.nextStep}</AppText>
        </View>
      ) : null}

      {analysis.warnings.length ? (
        <View style={[styles.section, { backgroundColor: theme.accentSoft }]}>
          <AppText variant="smallStrong" color="accent" style={styles.sectionTitle}>
            주의할 점
          </AppText>
          {analysis.warnings.map((w, i) => (
            <AppText key={i} variant="small">
              · {w}
            </AppText>
          ))}
        </View>
      ) : null}

      {onRegenerate ? (
        <Button title="다른 답장 더 보기" variant="soft" size="sm" fullWidth={false} onPress={() => onRegenerate()} loading={regenerating} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.sm, alignSelf: 'stretch' },
  bubble: { borderRadius: Radius.lg, borderTopLeftRadius: Radius.sm, padding: Spacing.lg },
  section: { borderRadius: Radius.lg, padding: Spacing.lg, gap: Spacing.xs },
  sectionTitle: { marginBottom: Spacing.xs },
  bullet: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'flex-start' },
  bulletText: { flex: 1 },
  replies: { gap: Spacing.sm, marginTop: Spacing.xs },
});
