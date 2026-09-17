import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { Spacing } from '@/constants/theme';

interface EmptyStateProps {
  emoji: string;
  title: string;
  description?: string;
  actionTitle?: string;
  onAction?: () => void;
}

export function EmptyState({ emoji, title, description, actionTitle, onAction }: EmptyStateProps) {
  return (
    <View style={styles.wrap}>
      <AppText style={styles.emoji}>{emoji}</AppText>
      <AppText variant="title2" align="center">
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
  emoji: { fontSize: 56, lineHeight: 68, marginBottom: Spacing.sm },
  desc: { maxWidth: 300 },
  btn: { marginTop: Spacing.lg, paddingHorizontal: Spacing.xl },
});
