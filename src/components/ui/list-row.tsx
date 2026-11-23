import { Ionicons } from '@expo/vector-icons';
import { useContext } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { InListGroup, useInsetFill } from '@/components/ui/list-group';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { haptic } from '@/lib/haptics';

interface ListRowProps {
  /** 1.4 개편: 묶음(ListGroup) 안에서는 그리지 않는다 — 밖에서만 회색 선 아이콘 하나(예전 호출 호환으로 받는다) */
  icon?: keyof typeof Ionicons.glyphMap;
  iconColor?: string;
  title: string;
  subtitle?: string;
  value?: string;
  onPress?: () => void;
  destructive?: boolean;
  right?: React.ReactNode;
}

/**
 * 설정·목록 한 줄 — 1.4 「깔끔하게」 개편(11/12 회의 7번 「AI 티」): 줄마다 붙던 연파랑 아이콘 타일을 걷었다.
 * 묶음 카드(ListGroup) 안에서는 글자만(제목 · 설명 · 오른쪽 값 · ›), 묶음 밖에서는 타일 없는 회색 선 아이콘 하나.
 * 설명 줄은 읽어야 하는 글이라 textSecondary(5.9:1) — 옅은 회색은 대비가 모자랐다.
 */
export function ListRow({ icon, iconColor, title, subtitle, value, onPress, destructive, right }: ListRowProps) {
  const theme = useTheme();
  const grouped = useContext(InListGroup);
  // 다크 모드의 흰 카드는 surface 와 같은 색이라 눌림 색을 한 단계 밝게
  const insetFill = useInsetFill();
  const showIcon = Boolean(icon) && !grouped;
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
      style={({ pressed }) => [styles.row, grouped ? styles.rowGrouped : null, { backgroundColor: pressed ? (grouped ? insetFill : theme.surface) : 'transparent' }]}>
      {showIcon && icon ? <Ionicons name={icon} size={20} color={iconColor ?? (destructive ? theme.danger : theme.textSecondary)} /> : null}
      <View style={styles.texts}>
        <AppText variant="body" weight={grouped ? '600' : undefined} color={destructive ? 'danger' : 'text'}>
          {title}
        </AppText>
        {subtitle ? (
          <AppText variant="small" color="textSecondary" style={styles.subtitle}>
            {subtitle}
          </AppText>
        ) : null}
      </View>
      {value ? (
        <AppText variant="small" color="textSecondary" numberOfLines={1} style={styles.value}>
          {value}
        </AppText>
      ) : null}
      {right}
      {onPress && !right ? <Ionicons name="chevron-forward" size={16} color={theme.textTertiary} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.md, paddingHorizontal: Spacing.sm, borderRadius: Radius.md, minHeight: 48 },
  // 묶음 안 줄 — 카드 안쪽 여백 18, 높이 56 이상 (ListGroup 의 줄 사이 선도 같은 18 에서 시작한다)
  rowGrouped: { paddingHorizontal: Spacing.lg + 2, paddingVertical: 14, borderRadius: 0, minHeight: 56 },
  texts: { flex: 1, gap: 2 },
  subtitle: { fontSize: 13, lineHeight: 19 },
  value: { flexShrink: 1, maxWidth: '50%', textAlign: 'right' },
});
