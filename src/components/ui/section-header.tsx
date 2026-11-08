import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { Spacing } from '@/constants/theme';

interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  /** 화면의 간격(gap)으로 띄우는 곳에서는 위아래 여백을 지워 쓴다 */
  style?: StyleProp<ViewStyle>;
}

/** 묶음 제목 — 굵은 제목 한 줄 + 옅은 설명 (1.2 개편: 탭 화면의 묶음 제목과 같은 굵기) */
export function SectionHeader({ title, subtitle, right, style }: SectionHeaderProps) {
  return (
    <View style={[styles.row, style]}>
      <View style={styles.texts}>
        <AppText variant="title3" weight="800" style={styles.title} accessibilityRole="header">
          {title}
        </AppText>
        {subtitle ? (
          <AppText variant="small" color="textSecondary">
            {subtitle}
          </AppText>
        ) : null}
      </View>
      {right}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.md, marginTop: Spacing.lg },
  texts: { gap: 2, flex: 1 },
  title: { letterSpacing: -0.4 },
});
