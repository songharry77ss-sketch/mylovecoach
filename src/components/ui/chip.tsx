import { Pressable, StyleSheet, type ViewStyle } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

interface ChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  emoji?: string;
  style?: ViewStyle;
  size?: 'md' | 'sm';
  tone?: 'primary' | 'accent';
}

export function Chip({ label, selected, onPress, emoji, style, size = 'md', tone = 'primary' }: ChipProps) {
  const theme = useTheme();
  const selectedBg = tone === 'primary' ? theme.primarySoft : theme.accentSoft;
  const selectedText = tone === 'primary' ? theme.primary : theme.accent;
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityState={{ selected }}
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [
        styles.chip,
        size === 'sm' ? styles.sm : null,
        {
          backgroundColor: selected ? selectedBg : theme.surface,
          borderColor: selected ? selectedText : 'transparent',
          opacity: pressed ? 0.7 : 1,
        },
        style,
      ]}>
      <AppText variant={size === 'sm' ? 'caption' : 'smallStrong'} color={selected ? selectedText : 'textSecondary'}>
        {emoji ? `${emoji} ${label}` : label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 1,
    borderRadius: Radius.pill,
    borderWidth: 1,
  },
  sm: { paddingHorizontal: Spacing.sm + 2, paddingVertical: Spacing.xs + 1 },
});
