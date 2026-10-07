import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { haptic } from '@/lib/haptics';

interface ListRowProps {
  icon?: keyof typeof Ionicons.glyphMap;
  iconColor?: string;
  title: string;
  subtitle?: string;
  value?: string;
  onPress?: () => void;
  destructive?: boolean;
  right?: React.ReactNode;
}

export function ListRow({ icon, iconColor, title, subtitle, value, onPress, destructive, right }: ListRowProps) {
  const theme = useTheme();
  return (
    <Pressable
      // 누를 수 없는 줄에 스위치 같은 컨트롤이 있으면 줄을 하나로 묶지 않는다 (묶으면 VoiceOver 가 안의 스위치에 닿지 못한다)
      accessible={Boolean(onPress) || !right}
      accessibilityRole={onPress ? 'button' : undefined}
      onPress={
        onPress
          ? () => {
              haptic.select();
              onPress();
            }
          : undefined
      }
      disabled={!onPress}
      style={({ pressed }) => [styles.row, { backgroundColor: pressed ? theme.surface : 'transparent' }]}>
      {icon ? (
        <View style={[styles.iconWrap, { backgroundColor: theme.surface }]}>
          <Ionicons name={icon} size={18} color={iconColor ?? (destructive ? theme.danger : theme.textSecondary)} />
        </View>
      ) : null}
      <View style={styles.texts}>
        <AppText variant="body" color={destructive ? 'danger' : 'text'}>
          {title}
        </AppText>
        {subtitle ? (
          <AppText variant="caption" color="textTertiary">
            {subtitle}
          </AppText>
        ) : null}
      </View>
      {value ? (
        <AppText variant="small" color="textSecondary">
          {value}
        </AppText>
      ) : null}
      {right}
      {onPress && !right ? <Ionicons name="chevron-forward" size={18} color={theme.textTertiary} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.md, paddingHorizontal: Spacing.sm, borderRadius: Radius.md },
  iconWrap: { width: 36, height: 36, borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center' },
  texts: { flex: 1, gap: 2 },
});
