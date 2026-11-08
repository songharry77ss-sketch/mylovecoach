import { Pressable, StyleSheet, type ViewStyle } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { Radius, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';
import { haptic } from '@/lib/haptics';

interface ChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  emoji?: string;
  style?: ViewStyle;
  size?: 'md' | 'sm';
  tone?: 'primary' | 'accent';
  /** 칩이 놓인 바탕 — 회색 canvas 위에 바로 놓이면 'canvas'(고르지 않은 칩을 흰 바탕+가는 테두리로) */
  on?: 'background' | 'canvas';
}

export function Chip({ label, selected, onPress, emoji, style, size = 'md', tone = 'primary', on = 'background' }: ChipProps) {
  const theme = useTheme();
  // 다크는 흰 카드(card)와 연회색(surface)이 같은 색이라 카드 안 칩이 묻힌다 — 한 단계 밝은 면으로
  const idleFill = useColorScheme() === 'dark' ? theme.surfaceElevated : theme.surface;
  const selectedBg = tone === 'primary' ? theme.primarySoft : theme.accentSoft;
  const selectedText = tone === 'primary' ? theme.primary : theme.accent;
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityState={{ selected }}
      onPress={
        onPress
          ? () => {
              haptic.select();
              onPress();
            }
          : undefined
      }
      disabled={!onPress}
      // 작은 칩(높이 28)도 누르는 곳은 44 가 되게
      hitSlop={size === 'sm' ? { top: 8, bottom: 8, left: 2, right: 2 } : undefined}
      style={({ pressed }) => [
        styles.chip,
        size === 'sm' ? styles.sm : null,
        {
          backgroundColor: selected ? selectedBg : on === 'canvas' ? theme.card : idleFill,
          borderColor: selected ? selectedText : on === 'canvas' ? theme.separator : 'transparent',
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
