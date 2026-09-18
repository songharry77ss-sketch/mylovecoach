import { Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';

import { useTheme } from '@/hooks/use-theme';
import { useAppStore } from '@/store/app-store';

export default function Index() {
  const theme = useTheme();
  const hydrated = useAppStore((s) => s.hydrated);
  const started = useAppStore((s) => Boolean(s.user) || Object.keys(s.crushes).length > 0);
  if (!hydrated) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.background }}>
        <ActivityIndicator color={theme.primary} />
      </View>
    );
  }
  return <Redirect href={started ? '/(tabs)' : '/start'} />;
}
