import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ToastProvider } from '@/components/ui/toast';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { endBilling, initBilling } from '@/lib/billing/iap';
import { useAppStore } from '@/store/app-store';

SplashScreen.preventAutoHideAsync().catch(() => {});

// 데모 웹 빌드가 임의의 경로(예: 호스팅 페이지 하위 경로)에서 열려도 라우터가 '/'에서 시작하도록 합니다.
if (Platform.OS === 'web' && process.env.EXPO_PUBLIC_DEMO_MODE === '1' && typeof window !== 'undefined') {
  try {
    window.history.replaceState(null, '', '/');
  } catch {
    // sandboxed iframe 등에서는 무시
  }
}

export const unstable_settings = { anchor: '(tabs)' };

export default function RootLayout() {
  const scheme = useColorScheme();
  const hydrated = useAppStore((s) => s.hydrated);
  const colors = Colors[scheme];

  const setHydrated = useAppStore((s) => s.setHydrated);

  useEffect(() => {
    if (hydrated) {
      SplashScreen.hideAsync().catch(() => {});
      return;
    }
    // 저장소 접근이 막힌 환경(사생활 보호 모드 등)에서도 앱이 멈추지 않도록 안전장치
    const t = setTimeout(() => setHydrated(), 2500);
    return () => clearTimeout(t);
  }, [hydrated, setHydrated]);

  // 스토어 연결 → 구매 상태 확인. 스토어에 닿지 못하면(undefined) 저장된 상태를 그대로 둔다
  useEffect(() => {
    if (!hydrated) return;
    let alive = true;
    initBilling({ onPremium: (premium) => useAppStore.getState().setPremium(premium) })
      .then((result) => {
        if (alive && result !== undefined) useAppStore.getState().setPremium(result);
      })
      .catch(() => {});
    return () => {
      alive = false;
      endBilling();
    };
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
              <Stack.Screen name="paywall" options={{ headerShown: false, presentation: 'modal' }} />
              <Stack.Screen name="+not-found" options={{ title: '페이지를 찾을 수 없어요' }} />
            </Stack>
            <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
          </ToastProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
