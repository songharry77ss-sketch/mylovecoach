import { type PropsWithChildren } from 'react';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { Radius, Shadow, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

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
        onPress={onPress}
        style={({ pressed }) => [...base, pressed ? { opacity: 0.85, transform: [{ scale: 0.99 }] } : null]}>
        {children}
      </Pressable>
    );
  }
  return <View style={base}>{children}</View>;
}

const styles = StyleSheet.create({
  card: { borderRadius: Radius.lg },
});
