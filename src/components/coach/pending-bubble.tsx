import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const PHRASES = ['대화 분위기를 읽는 중이에요…', '상대의 말투를 분석하고 있어요…', '딱 맞는 답장을 고르는 중…', '거의 다 됐어요!'];

export function PendingBubble() {
  const theme = useTheme();
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((v) => Math.min(v + 1, PHRASES.length - 1)), 2600);
    return () => clearInterval(t);
  }, []);
  return (
    <View style={[styles.bubble, { backgroundColor: theme.surface }]}>
      <ActivityIndicator color={theme.primary} />
      <AppText variant="small" color="textSecondary">
        {PHRASES[i]}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  bubble: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, borderRadius: Radius.lg, borderTopLeftRadius: Radius.sm, padding: Spacing.lg, alignSelf: 'flex-start' },
});
