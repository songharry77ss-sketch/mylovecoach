import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { Radius, Spacing, palette } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { TEMPERATURES } from '@/lib/labels';
import type { Temperature } from '@/lib/types';

export function temperatureColor(t: Temperature): string {
  return {
    hot: palette.pink500,
    warm: palette.peach500,
    neutral: palette.sky500,
    cold: palette.sky600,
    unknown: palette.gray400,
  }[t];
}

interface TemperatureGaugeProps {
  temperature: Temperature;
  score: number | null;
  compact?: boolean;
}

export function TemperatureGauge({ temperature, score, compact }: TemperatureGaugeProps) {
  const theme = useTheme();
  const meta = TEMPERATURES[temperature];
  const color = temperatureColor(temperature);
  const width = score == null ? 0 : Math.max(4, Math.min(100, score));
  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <AppText variant={compact ? 'smallStrong' : 'title3'}>
          {meta.emoji} 호감 온도 · {meta.label}
        </AppText>
        <AppText variant={compact ? 'smallStrong' : 'title3'} color={color}>
          {score == null ? '—' : `${score}°`}
        </AppText>
      </View>
      <View style={[styles.track, { backgroundColor: theme.surfaceSelected }]}>
        <View style={[styles.fill, { width: `${width}%`, backgroundColor: color }]} />
      </View>
      {!compact ? (
        <AppText variant="caption" color="textSecondary">
          {meta.description}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.sm },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  track: { height: 10, borderRadius: Radius.pill, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: Radius.pill },
});
