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
import { flushAnalytics, initAnalytics, launchAcquisition, pauseAnalytics, resumeAnalytics, setConsent, trackScreen, updateIdentity } from '@/lib/analytics';
import { endBilling, initBilling } from '@/lib/billing/iap';
import { refreshTeam } from '@/lib/billing/team';
import { linkMember } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { haptic, setHapticsEnabled } from '@/lib/haptics';
import { cleanupOrphanImages, clearImageCaches } from '@/lib/images';
import { processPendingDeletion } from '@/lib/server-deletion';
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
      clearImageCaches();
    }, 3000);
    return () => clearTimeout(t);
  }, [hydrated]);

  // 이용 기록 수집 (동의한 경우에만 실제로 전송됨)
  useEffect(() => {
    if (!hydrated) return;
    // 처음 실행이면 어디서 들어왔는지 기기에 적어 둔다 (동의한 경우에만 이용 기록과 함께 전송)
    if (!useAppStore.getState().acquisition) useAppStore.getState().setAcquisition(launchAcquisition());
    const s = useAppStore.getState();
    // 저장소를 실제로 다 읽기 전(2.5초 안전장치로 먼저 시작)에는 기기 ID·동의가 임시 값이라 보내지 않는다 —
    // 임시 ID 로 쌓인 기록은 철회·삭제로 지울 수 없기 때문. 다 읽으면 아래 onFinishHydration 이 이어서 켠다
    const loaded = () => useAppStore.persist.hasHydrated();
    initAnalytics({
      deviceId: s.deviceId,
      consent: s.analyticsConsent === true && loaded(),
      user: s.user,
      premiumPlan: s.premium?.plan ?? null,
      crushCount: Object.keys(s.crushes).length,
      acquisition: s.acquisition,
      consentVersion: consentVersionOf(s),
      deletionPending: s.pendingDeletion != null,
    });
    // 서버에 남은 기록 삭제 요청이 있으면(지난번에 못 보냈거나 방금 생김) 보낸다
    processPendingDeletion().catch(() => {});
    const unsubscribe = useAppStore.subscribe((next, prev) => {
      setConsent(next.analyticsConsent === true && loaded());
      updateIdentity({
        deviceId: next.deviceId,
        user: next.user,
        premiumPlan: next.premium?.plan ?? null,
        crushCount: Object.keys(next.crushes).length,
        acquisition: next.acquisition,
        consentVersion: consentVersionOf(next),
        deletionPending: next.pendingDeletion != null,
      });
      // 나이를 만 14세 미만으로 바꾸면 동의 상태와 상관없이 서버에 남은 기록도 지운다 (법정대리인 동의를 받지 않으므로).
      // 저장소를 읽어 들이는 순간(빈 상태 → 저장된 프로필)은 바꾼 것이 아니므로 건너뛴다
      const under = (u: typeof next.user) => u?.age != null && u.age < 14;
      if (loaded() && under(next.user) && !under(prev.user)) next.requestServerDeletion();
      if (next.pendingDeletion && next.pendingDeletion !== prev.pendingDeletion) processPendingDeletion().catch(() => {});
    });
    // 저장소를 늦게 다 읽었으면 그때 실제 기기 ID·동의로 이어서 켠다
    const unsubLoaded = useAppStore.persist.onFinishHydration((st) => {
      updateIdentity({ deviceId: st.deviceId, user: st.user, acquisition: st.acquisition, consentVersion: consentVersionOf(st), deletionPending: st.pendingDeletion != null });
      setConsent(st.analyticsConsent === true);
      processPendingDeletion().catch(() => {});
    });
    // 떠날 때 남은 기록과 세션 끝을 보낸다. 30분 안에 돌아오면 같은 세션을 이어 쓰고, 떠나 있던 시간은 세지 않는다
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        resumeAnalytics();
        processPendingDeletion().catch(() => {});
      } else pauseAnalytics(state);
    });
    return () => {
      flushAnalytics(true);
      unsubscribe();
      unsubLoaded();
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

  // 로그인은 돼 있는데 회원 연결을 못 마친 경우(웹에서 돌아오다 끊김 등) 조용히 다시 잇는다.
  // 반대로 로그인 세션이 끝났으면(만료·다른 곳에서 로그아웃) 기기의 회원 표시도 지운다 — 네트워크 오류일 때는 그대로 둔다
  useEffect(() => {
    if (!hydrated || !supabase) return;
    const client = supabase;
    client.auth
      .getSession()
      .then(({ data, error }) => {
        const { member, setMember } = useAppStore.getState();
        if (data.session && !member) return linkMember();
        if (!data.session && !error && member) setMember(null);
      })
      .catch(() => {});
    const { data: listener } = client.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') useAppStore.getState().setMember(null);
    });
    return () => listener.subscription.unsubscribe();
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
              <Stack.Screen name="signup" options={{ headerShown: false, presentation: 'modal' }} />
              <Stack.Screen name="auth/callback" options={{ headerShown: false }} />
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
