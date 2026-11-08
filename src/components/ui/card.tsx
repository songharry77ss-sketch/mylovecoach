import { type PropsWithChildren } from 'react';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { useCardStyle } from '@/components/ui/list-group';
import { Radius, Shadow, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { haptic } from '@/lib/haptics';

interface CardProps extends PropsWithChildren {
  style?: ViewStyle;
  onPress?: () => void;
  /** card: canvas 위 흰 카드 (탭·설정 화면) · surface: 흰 화면 위 연회색 카드 */
  tone?: 'default' | 'surface' | 'card' | 'primary' | 'accent';
  padding?: number;
  elevated?: boolean;
}

export function Card({ children, style, onPress, tone = 'surface', padding = Spacing.lg, elevated = false }: CardProps) {
  const theme = useTheme();
  // canvas 위 흰 카드 — 그림자·테두리는 ListGroup 과 같은 공통 훅으로 맞춘다
  const card = useCardStyle();
  const bg: ViewStyle =
    tone === 'card'
      ? card
      : {
          backgroundColor: {
            default: theme.surfaceElevated,
            surface: theme.surface,
            primary: theme.primarySoft,
            accent: theme.accentSoft,
          }[tone],
        };
  const base: ViewStyle[] = [styles.card, bg, { padding }, elevated && tone !== 'card' ? (Shadow as ViewStyle) : {}, style ?? {}];
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
  // 지침 1.2: 카드 모서리 22
  card: { borderRadius: Radius.lg + 2 },
});
