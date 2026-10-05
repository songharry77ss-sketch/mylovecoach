import { StyleSheet, View } from 'react-native';

import { heatMeta } from '@/components/coach/heat-gauge';
import { AppText } from '@/components/ui/app-text';
import { Avatar } from '@/components/ui/avatar';
import { Card } from '@/components/ui/card';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { relativeTime } from '@/lib/format';
import { relationshipLabel } from '@/lib/labels';
import type { Crush } from '@/lib/types';
import { HEAT_MAX, HEAT_MIN } from '@/store/app-store';

interface CrushListItemProps {
  crush: Crush;
  lastPreview?: string;
  /** 대화 미리보기 숨기기 (마이 탭 설정) */
  hidePreview?: boolean;
  onPress: () => void;
}

export function CrushListItem({ crush, lastPreview, hidePreview, onPress }: CrushListItemProps) {
  const theme = useTheme();
  const heat = crush.heat ?? 0;
  const meta = heatMeta(heat);
  const rel = relationshipLabel(crush.relationship);
  const last = crush.heatLog?.[crush.heatLog.length - 1];
  const fill = Math.max(4, ((heat - HEAT_MIN) / (HEAT_MAX - HEAT_MIN)) * 100);
  const preview = hidePreview ? '🔒 미리보기 숨김' : (lastPreview ?? `${rel.emoji} ${rel.label}${crush.mbti ? ` · ${crush.mbti}` : ''} · 캡처를 올려 코칭을 시작해보세요`);
  return (
    <Card onPress={onPress} tone="default" elevated style={styles.card}>
      <Avatar name={crush.name} uri={crush.photoUri} size={52} seed={crush.id} />
      <View style={styles.texts}>
        <View style={styles.row}>
          <AppText variant="bodyStrong" numberOfLines={1} style={styles.name}>
            {crush.name}
          </AppText>
          <AppText variant="caption" color="textTertiary">
            {crush.lastMessageAt ? relativeTime(crush.lastMessageAt) : '새 채팅방'}
          </AppText>
        </View>
        <AppText variant="small" color="textSecondary" numberOfLines={1}>
          {preview}
        </AppText>
        <View style={styles.heatRow}>
          <AppText variant="caption" color={meta.color} weight="800">
            {meta.emoji} {heat}°
          </AppText>
          <View style={[styles.track, { backgroundColor: theme.surfaceSelected }]}>
            <View style={[styles.fill, { width: `${fill}%`, backgroundColor: meta.color }]} />
          </View>
          {last && last.delta !== 0 ? (
            <AppText variant="caption" weight="700" color={last.delta > 0 ? theme.accent : theme.primary}>
              {last.delta > 0 ? `▲${last.delta}` : `▼${Math.abs(last.delta)}`}
            </AppText>
          ) : (
            <AppText variant="caption" color="textTertiary">
              {meta.label}
            </AppText>
          )}
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', gap: Spacing.md, alignItems: 'center', padding: Spacing.lg },
  texts: { flex: 1, gap: 4 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm },
  name: { flex: 1 },
  heatRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  track: { flex: 1, height: 6, borderRadius: Radius.pill, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: Radius.pill },
});
