import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

interface EmptyStateProps {
  emoji: string;
  title: string;
  description?: string;
  actionTitle?: string;
  onAction?: () => void;
}

/** 빈 화면 안내 — 옅은 앱 색 동그라미 안 표정 하나 + 굵은 제목 + 짧은 설명 + (있으면) 버튼 하나 */
export function EmptyState({ emoji, title, description, actionTitle, onAction }: EmptyStateProps) {
  const theme = useTheme();
  return (
    <View style={styles.wrap}>
      <View style={[styles.badge, { backgroundColor: theme.primarySoft }]}>
        <AppText style={styles.emoji} accessibilityElementsHidden importantForAccessibility="no">
          {emoji}
        </AppText>
      </View>
      <AppText variant="title2" weight="800" align="center" style={styles.title}>
        {title}
      </AppText>
      {description ? (
        <AppText variant="small" color="textSecondary" align="center" style={styles.desc}>
          {description}
        </AppText>
      ) : null}
      {actionTitle && onAction ? <Button title={actionTitle} onPress={onAction} fullWidth={false} size="md" style={styles.btn} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', paddingVertical: Spacing.xxxl, paddingHorizontal: Spacing.xl, gap: Spacing.sm },
  badge: { width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.md },
  emoji: { fontSize: 42, lineHeight: 52 },
  title: { letterSpacing: -0.4 },
  desc: { maxWidth: 300 },
  btn: { marginTop: Spacing.lg, paddingHorizontal: Spacing.xl },
});
