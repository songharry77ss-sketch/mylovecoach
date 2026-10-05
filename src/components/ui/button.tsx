import { type ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { AppText } from '@/components/ui/app-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { haptic as feedback } from '@/lib/haptics';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export type ButtonVariant = 'primary' | 'secondary' | 'soft' | 'ghost' | 'danger' | 'accent';
export type ButtonSize = 'lg' | 'md' | 'sm';

interface ButtonProps {
  title: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  icon?: ReactNode;
  style?: ViewStyle;
  haptic?: boolean;
  fullWidth?: boolean;
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'lg',
  disabled,
  loading,
  icon,
  style,
  haptic = true,
  fullWidth = true,
}: ButtonProps) {
  const theme = useTheme();
  const scale = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const colors = {
    primary: { bg: theme.primary, text: theme.primaryText },
    accent: { bg: theme.accent, text: theme.primaryText },
    secondary: { bg: theme.surfaceSelected, text: theme.text },
    soft: { bg: theme.primarySoft, text: theme.primary },
    ghost: { bg: 'transparent', text: theme.textSecondary },
    danger: { bg: theme.accentSoft, text: theme.danger },
  }[variant];

  const height = { lg: 56, md: 48, sm: 38 }[size];
  const textVariant = { lg: 'bodyStrong', md: 'bodyStrong', sm: 'smallStrong' } as const;

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || loading }}
      disabled={disabled || loading}
      onPressIn={() => {
        scale.value = withSpring(0.95, { damping: 18, stiffness: 380 });
      }}
      onPressOut={() => {
        scale.value = withSpring(1, { damping: 11, stiffness: 260 });
      }}
      onPress={() => {
        if (haptic) (size === 'lg' ? feedback.thud : feedback.tap)();
        onPress?.();
      }}
      style={[
        styles.base,
        { height, backgroundColor: colors.bg, opacity: disabled ? 0.45 : 1, alignSelf: fullWidth ? 'stretch' : 'flex-start' },
        size === 'sm' ? styles.sm : null,
        animated,
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={colors.text} />
      ) : (
        <View style={styles.row}>
          {icon}
          <AppText variant={textVariant[size]} color={colors.text}>
            {title}
          </AppText>
        </View>
      )}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
  },
  sm: { paddingHorizontal: Spacing.md, borderRadius: Radius.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
});
