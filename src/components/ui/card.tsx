import { type PropsWithChildren } from 'react';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { Radius, Shadow, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { haptic } from '@/lib/haptics';

interface CardProps extends PropsWithChildren {
  style?: ViewStyle;
  onPress?: () => void;
  tone?: 'default' | 'surface' | 'primary' | 'accent';
  padding?: number;
  elevated?: boolean;
}

export function Card({ children, style, onPress, tone = 'surface', padding = Spacing.lg, elevated = false }: CardProps) {
  const theme = useTheme();
  const bg = {
    default: theme.surfaceElevated,
    surface: theme.surface,
    primary: theme.primarySoft,
    accent: theme.accentSoft,
  }[tone];
  const base: ViewStyle[] = [styles.card, { backgroundColor: bg, padding }, elevated ? (Shadow as ViewStyle) : {}, style ?? {}];
  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        onPress={() => {
          haptic.soft();
          onPress();
        }}
        style={({ pressed }) => [...base, pressed ? { opacity: 0.88, transform: [{ scale: 0.98 }] } : null]}>
        {children}
      </Pressable>
    );
  }
  return <View style={base}>{children}</View>;
}

const styles = StyleSheet.create({
  card: { borderRadius: Radius.lg },
});
