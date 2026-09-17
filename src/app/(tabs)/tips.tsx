import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { Chip } from '@/components/ui/chip';
import { Screen } from '@/components/ui/screen';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { TIPS, TIP_CATEGORIES } from '@/lib/tips';

export default function TipsScreen() {
  const theme = useTheme();
  const [category, setCategory] = useState<(typeof TIP_CATEGORIES)[number]>('전체');
  const [open, setOpen] = useState<string | null>(null);
  const list = category === '전체' ? TIPS : TIPS.filter((t) => t.category === category);

  return (
    <Screen safeTop>
      <AppText variant="display" style={styles.title}>
        연애 팁
      </AppText>
      <AppText variant="body" color="textSecondary" style={styles.subtitle}>
        코치가 자주 하는 조언을 모았어요.
      </AppText>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} style={styles.chipRow}>
        {TIP_CATEGORIES.map((c) => (
          <Chip key={c} label={c} selected={category === c} onPress={() => setCategory(c)} />
        ))}
      </ScrollView>
      <View style={styles.list}>
        {list.map((tip) => {
          const expanded = open === tip.id;
          return (
            <Pressable
              key={tip.id}
              accessibilityRole="button"
              accessibilityState={{ expanded }}
              onPress={() => setOpen(expanded ? null : tip.id)}
              style={[styles.card, { backgroundColor: theme.surface }]}>
              <View style={styles.cardHead}>
                <AppText style={styles.emoji}>{tip.emoji}</AppText>
                <View style={styles.cardTexts}>
                  <AppText variant="caption" color="primary">
                    {tip.category}
                  </AppText>
                  <AppText variant="bodyStrong">{tip.title}</AppText>
                </View>
              </View>
              {expanded ? (
                <AppText variant="small" color="textSecondary" style={styles.body}>
                  {tip.body}
                </AppText>
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { marginTop: Spacing.sm },
  subtitle: { marginTop: 4, marginBottom: Spacing.lg },
  chipRow: { marginHorizontal: -Spacing.lg, flexGrow: 0 },
  chips: { gap: Spacing.sm, paddingHorizontal: Spacing.lg, paddingBottom: Spacing.lg },
  list: { gap: Spacing.md },
  card: { borderRadius: Radius.lg, padding: Spacing.lg, gap: Spacing.md },
  cardHead: { flexDirection: 'row', gap: Spacing.md, alignItems: 'center' },
  emoji: { fontSize: 28, lineHeight: 34 },
  cardTexts: { flex: 1, gap: 2 },
  body: { paddingLeft: 44 },
});
