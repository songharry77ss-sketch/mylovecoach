import { StyleSheet, View } from 'react-native';

import { BrandGradient } from '@/components/brand/brand';
import { useTheme } from '@/hooks/use-theme';

/** 지금 단계는 앱 그라데이션 막대, 나머지는 옅은 점 */
export function ProgressDots({ count, index }: { count: number; index: number }) {
  const theme = useTheme();
  return (
    <View style={styles.row}>
      {Array.from({ length: count }).map((_, i) =>
        i === index ? <BrandGradient key={i} style={[styles.dot, styles.active]} /> : <View key={i} style={[styles.dot, { backgroundColor: theme.border }]} />,
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  dot: { height: 8, width: 8, borderRadius: 4 },
  active: { width: 22, overflow: 'hidden' },
});
