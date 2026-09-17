import { StyleSheet, View } from 'react-native';

import { temperatureColor } from '@/components/coach/temperature-gauge';
import { AppText } from '@/components/ui/app-text';
import { Avatar } from '@/components/ui/avatar';
import { Card } from '@/components/ui/card';
import { Radius, Spacing } from '@/constants/theme';
import { relativeTime } from '@/lib/format';
import { TEMPERATURES, relationshipLabel } from '@/lib/labels';
import type { Crush } from '@/lib/types';

interface CrushListItemProps {
  crush: Crush;
  lastPreview?: string;
  onPress: () => void;
}

export function CrushListItem({ crush, lastPreview, onPress }: CrushListItemProps) {
  const temp = crush.lastTemperature ?? 'unknown';
  const meta = TEMPERATURES[temp];
  const rel = relationshipLabel(crush.relationship);
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
          {lastPreview ?? `${rel.emoji} ${rel.label}${crush.mbti ? ` · ${crush.mbti}` : ''} · 캡처를 올려 코칭을 시작해보세요`}
        </AppText>
        <View style={styles.row}>
          <View style={[styles.pill, { backgroundColor: `${temperatureColor(temp)}22` }]}>
            <AppText variant="caption" color={temperatureColor(temp)}>
              {meta.emoji} {crush.lastInterestScore != null ? `${crush.lastInterestScore}° ${meta.label}` : meta.label}
            </AppText>
          </View>
          {crush.mbti ? (
            <AppText variant="caption" color="textTertiary">
              {crush.mbti}
            </AppText>
          ) : null}
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
  pill: { paddingHorizontal: Spacing.sm, paddingVertical: 2, borderRadius: Radius.pill },
});
