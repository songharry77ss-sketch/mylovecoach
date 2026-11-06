import { Redirect, useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Icon3D } from '@/components/brand/brand';
import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { Spacing } from '@/constants/theme';

export default function NotFound() {
  const router = useRouter();
  if (process.env.EXPO_PUBLIC_DEMO_MODE === '1') return <Redirect href="/" />;
  return (
    <Screen contentStyle={styles.content}>
      <View style={styles.center}>
        <Icon3D name="send" size={96} float />
        <AppText variant="title2" align="center">
          페이지를 찾을 수 없어요
        </AppText>
        <AppText variant="small" color="textSecondary" align="center">
          주소가 잘못됐거나 삭제된 채팅방이에요.
        </AppText>
        <Button title="홈으로 가기" variant="brand" onPress={() => router.replace('/(tabs)')} style={styles.home} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.lg },
  home: { marginTop: Spacing.lg },
});
