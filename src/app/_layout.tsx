import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ToastProvider } from '@/components/ui/toast';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAppStore } from '@/store/app-store';

SplashScreen.preventAutoHideAsync().catch(() => {});

export const unstable_settings = { anchor: '(tabs)' };

export default function RootLayout() {
  const scheme = useColorScheme();
  const hydrated = useAppStore((s) => s.hydrated);
  const colors = Colors[scheme];

  useEffect(() => {
    if (hydrated) SplashScreen.hideAsync().catch(() => {});
  }, [hydrated]);

  const navTheme = {
    ...(scheme === 'dark' ? DarkTheme : DefaultTheme),
    colors: {
      ...(scheme === 'dark' ? DarkTheme : DefaultTheme).colors,
      primary: colors.primary,
      background: colors.background,
      card: colors.background,
      text: colors.text,
      border: colors.border,
    },
  };

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider value={navTheme}>
          <ToastProvider>
            <Stack
              screenOptions={{
                headerShadowVisible: false,
                headerTitleStyle: { fontWeight: '700', fontSize: 17 },
                headerBackButtonDisplayMode: 'minimal',
                headerTintColor: colors.text,
                contentStyle: { backgroundColor: colors.background },
              }}>
              <Stack.Screen name="index" options={{ headerShown: false }} />
              <Stack.Screen name="onboarding" options={{ headerShown: false, gestureEnabled: false }} />
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              <Stack.Screen name="crush/new" options={{ title: '새 채팅방', presentation: 'modal' }} />
              <Stack.Screen name="crush/[id]/index" options={{ title: '' }} />
              <Stack.Screen name="crush/[id]/edit" options={{ title: '상대 정보 수정', presentation: 'modal' }} />
              <Stack.Screen name="settings/profile" options={{ title: '내 프로필' }} />
              <Stack.Screen name="settings/api-key" options={{ title: 'AI 코치 연결' }} />
              <Stack.Screen name="+not-found" options={{ title: '페이지를 찾을 수 없어요' }} />
            </Stack>
            <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
          </ToastProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
