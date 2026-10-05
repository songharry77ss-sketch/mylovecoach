import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, type ViewStyle } from 'react-native';

import { Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { haptic as feedback } from '@/lib/haptics';

interface IconButtonProps {
  name: keyof typeof Ionicons.glyphMap;
  onPress?: () => void;
  size?: number;
  color?: string;
  background?: string;
  style?: ViewStyle;
  accessibilityLabel: string;
  disabled?: boolean;
  /** 누를 때 가벼운 진동 (기본 true) */
  haptic?: boolean;
}

export function IconButton({ name, onPress, size = 22, color, background, style, accessibilityLabel, disabled, haptic = true }: IconButtonProps) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={() => {
        if (haptic) feedback.tap();
        onPress?.();
      }}
      disabled={disabled}
      hitSlop={8}
      style={({ pressed }) => [
        styles.btn,
        { backgroundColor: background ?? 'transparent', opacity: pressed ? 0.6 : disabled ? 0.4 : 1 },
        style,
      ]}>
      <Ionicons name={name} size={size} color={color ?? theme.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: { width: 40, height: 40, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
});
