import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { APP_NAME, APP_NAME_EN } from '@/constants/brand';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { L } from '@/lib/i18n';

/** 채팅방에서 코치(센딧)의 말 위에 붙는 작은 이름표 — 앱 아이콘 + 「센딧」. 비밀 상담은 어두운 아이콘 */
export function CoachLabel({ secret, note }: { secret?: boolean; note?: string }) {
  const theme = useTheme();
  return (
    <View style={styles.row}>
      {secret ? (
        <View style={[styles.mark, styles.secret, { backgroundColor: theme.text }]}>
          <Ionicons name="eye-off" size={12} color={theme.background} />
        </View>
      ) : (
        <Image source={require('../../../assets/images/sendit-mark.png')} style={styles.mark} contentFit="contain" accessibilityIgnoresInvertColors />
      )}
      <AppText variant="smallStrong">{secret ? L('비밀 상담', 'Private chat') : L(APP_NAME, APP_NAME_EN)}</AppText>
      {note ? (
        <AppText variant="caption" color="textTertiary">
          {note}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs + 2 },
  mark: { width: 22, height: 22, borderRadius: 6 },
  secret: { alignItems: 'center', justifyContent: 'center' },
});
