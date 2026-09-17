import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { useToast } from '@/components/ui/toast';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { toneLabel } from '@/lib/labels';
import type { CoachReply } from '@/lib/types';

interface ReplyCardProps {
  reply: CoachReply;
  index: number;
  selected?: boolean;
  onCopied?: (index: number) => void;
}

export function ReplyCard({ reply, index, selected, onCopied }: ReplyCardProps) {
  const theme = useTheme();
  const toast = useToast();
  const tone = toneLabel(reply.tone);

  const copy = async () => {
    await Clipboard.setStringAsync(reply.text);
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    toast.show('답장을 복사했어요. 붙여넣기만 하면 끝!', 'success');
    onCopied?.(index);
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`추천 답장 ${index + 1} 복사`}
      onPress={copy}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: theme.surfaceElevated, borderColor: selected ? theme.primary : theme.border, opacity: pressed ? 0.85 : 1 },
      ]}>
      <View style={styles.head}>
        <View style={[styles.badge, { backgroundColor: theme.primarySoft }]}>
          <AppText variant="caption" color="primary">
            {tone.emoji} {tone.label}
          </AppText>
        </View>
        <View style={styles.copy}>
          {selected ? (
            <AppText variant="caption" color="primary">
              보냈어요 ✓
            </AppText>
          ) : null}
          <Ionicons name={selected ? 'checkmark-circle' : 'copy-outline'} size={18} color={selected ? theme.primary : theme.textTertiary} />
        </View>
      </View>
      <AppText variant="body" style={styles.text}>
        {reply.text}
      </AppText>
      <AppText variant="caption" color="textSecondary">
        💡 {reply.why}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: Radius.lg, padding: Spacing.lg, borderWidth: 1.5, gap: Spacing.sm },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  badge: { paddingHorizontal: Spacing.sm + 2, paddingVertical: 3, borderRadius: Radius.pill },
  copy: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  text: { fontSize: 17, lineHeight: 26 },
});
