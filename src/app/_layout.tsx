import { DarkTheme, DefaultTheme, Stack, ThemeProvider, usePathname } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AiConsentHost } from '@/components/coach/ai-consent-sheet';
import { CelebrationProvider } from '@/components/fx/celebration';
import { ToastProvider } from '@/components/ui/toast';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { flushAnalytics, initAnalytics, launchAcquisition, resumeAnalytics, trackScreen, updateIdentity } from '@/lib/analytics';
import { endBilling, initBilling } from '@/lib/billing/iap';
import { refreshTeam } from '@/lib/billing/team';
import { haptic, setHapticsEnabled } from '@/lib/haptics';
import { cleanupOrphanImages } from '@/lib/images';
import { useAppStore } from '@/store/app-store';

SplashScreen.preventAutoHideAsync().catch(() => {});

/**
 * 이용 기록 동의를 받은 방식의 판. 동의 수정판은 store 에 analyticsConsentVersion(직접 체크 = 2)을 둔다.
 * 그 값이 없으면 예전 미리 체크된 동의라 null — 서버는 이 기록을 저장하지 않는다.
 */
const consentVersionOf = (s: object): number | null => {
  const v = (s as { analyticsConsentVersion?: unknown }).analyticsConsentVersion;
  return typeof v === 'number' ? v : null;
};

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
  const hapticsOn = useAppStore((s) => s.hapticsOn);
  const pathname = usePathname();

  // 마이 탭의 「진동 효과」 설정을 진동 모듈에 반영
  useEffect(() => {
    setHapticsEnabled(hapticsOn);
  }, [hapticsOn]);

  useEffect(() => {
    if (hydrated) {
      SplashScreen.hideAsync().catch(() => {});
      return;
    }
    // 저장소 접근이 막힌 환경(사생활 보호 모드 등)에서도 앱이 멈추지 않도록 안전장치
    const t = setTimeout(() => setHydrated(), 2500);
    return () => clearTimeout(t);
  }, [hydrated, setHydrated]);

  // 저장소를 다 읽은 뒤, 어떤 채팅방에도 연결되지 않은 캡처 파일을 지운다 (비밀 상담 흔적 포함)
  useEffect(() => {
    if (!hydrated) return;
    const t = setTimeout(() => {
      const s = useAppStore.getState();
      const keep = new Set<string>();
      Object.values(s.messages).forEach((list) => list.forEach((m) => m.imageUri && keep.add(m.imageUri)));
      Object.values(s.crushes).forEach((c) => c.photoUri && keep.add(c.photoUri));
      cleanupOrphanImages(keep);
    }, 3000);
    return () => clearTimeout(t);
  }, [hydrated]);

  // 이용 기록 수집 (동의한 경우에만 실제로 전송됨)
  useEffect(() => {
    if (!hydrated) return;
    // 처음 실행이면 어디서 들어왔는지 기기에 적어 둔다 (동의한 경우에만 이용 기록과 함께 전송)
    if (!useAppStore.getState().acquisition) useAppStore.getState().setAcquisition(launchAcquisition());
    const s = useAppStore.getState();
    initAnalytics({
      deviceId: s.deviceId,
      consent: s.analyticsConsent === true,
      user: s.user,
      premiumPlan: s.premium?.plan ?? null,
      crushCount: Object.keys(s.crushes).length,
      acquisition: s.acquisition,
      consentVersion: consentVersionOf(s),
    });
    const unsubscribe = useAppStore.subscribe((next) =>
      updateIdentity({
        consent: next.analyticsConsent === true,
        user: next.user,
        premiumPlan: next.premium?.plan ?? null,
        crushCount: Object.keys(next.crushes).length,
        acquisition: next.acquisition,
        consentVersion: consentVersionOf(next),
      }),
    );
    // 떠날 때 남은 기록을 보내고 세션을 끝낸다. 돌아오면 백그라운드에 있던 시간은 빼고 새로 센다
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') resumeAnalytics();
      else flushAnalytics(true);
    });
    return () => {
      flushAnalytics(true);
      unsubscribe();
      sub.remove();
    };
  }, [hydrated]);

  // 화면 전환마다 체류 시간 기록
  useEffect(() => {
    if (hydrated && pathname) trackScreen(pathname);
  }, [hydrated, pathname]);

  // 스토어 연결 → 구매 상태 확인. 스토어에 닿지 못하면(undefined) 저장된 상태를 그대로 둔다
  useEffect(() => {
    if (!hydrated) return;
    let alive = true;
    initBilling({
      onPremium: (premium) => useAppStore.getState().setPremium(premium),
      onConsumable: (plan, transactionId) => {
        if (useAppStore.getState().grantConsumable(plan, transactionId)) haptic.celebrate();
      },
    })
      .then((result) => {
        if (alive && result !== undefined) useAppStore.getState().setPremium(result);
      })
      .catch(() => {});
    return () => {
      alive = false;
      endBilling();
    };
  }, [hydrated]);

  // 관리자가 무제한을 허용한 팀원 기기인지 — 켤 때와 앱으로 돌아올 때 확인
  useEffect(() => {
    if (!hydrated) return;
    refreshTeam().catch(() => {});
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refreshTeam().catch(() => {});
    });
    return () => sub.remove();
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
            <CelebrationProvider>
            <Stack
              screenOptions={{
                headerShadowVisible: false,
                headerTitleStyle: { fontWeight: '700', fontSize: 17 },
                headerBackButtonDisplayMode: 'minimal',
                headerTintColor: colors.text,
                contentStyle: { backgroundColor: colors.background },
              }}>
              <Stack.Screen name="index" options={{ headerShown: false }} />
              <Stack.Screen name="start" options={{ headerShown: false, gestureEnabled: false }} />
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              <Stack.Screen name="crush/new" options={{ title: '새 채팅방', presentation: 'modal' }} />
              <Stack.Screen name="crush/[id]/index" options={{ title: '' }} />
              <Stack.Screen name="crush/[id]/edit" options={{ title: '상대 정보 수정', presentation: 'modal' }} />
              <Stack.Screen name="crush/[id]/report" options={{ title: '상대 분석 보고서' }} />
              <Stack.Screen name="practice/[id]" options={{ title: '' }} />
              <Stack.Screen name="practice/custom" options={{ title: '연습 상대 만들기', presentation: 'modal' }} />
              <Stack.Screen name="mind" options={{ title: '속마음 풀이' }} />
              <Stack.Screen name="quick" options={{ title: '빠른 코칭', presentation: 'modal' }} />
              <Stack.Screen name="kkti/index" options={{ headerShown: false }} />
              <Stack.Screen name="kkti/result" options={{ headerShown: false }} />
              <Stack.Screen name="settings/profile" options={{ title: '내 프로필' }} />
              <Stack.Screen name="settings/api-key" options={{ title: 'AI 코치 연결' }} />
              <Stack.Screen name="paywall" options={{ headerShown: false, presentation: 'modal' }} />
              <Stack.Screen name="+not-found" options={{ title: '페이지를 찾을 수 없어요' }} />
            </Stack>
            </CelebrationProvider>
            {/* AI 로 대화를 보내기 전 동의 시트 — 어느 화면(모달 포함)에서 AI 를 부르든 여기서 하나만 뜬다 */}
            <AiConsentHost />
            <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
          </ToastProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
