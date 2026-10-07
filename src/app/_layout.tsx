import { DarkTheme, DefaultTheme, Stack, ThemeProvider, usePathname } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { AppState, Platform, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AiConsentHost } from '@/components/coach/ai-consent-sheet';
import { CelebrationProvider } from '@/components/fx/celebration';
import { IntroSplash } from '@/components/fx/intro-splash';
import { ToastProvider } from '@/components/ui/toast';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { flushAnalytics, initAnalytics, launchAcquisition, pauseAnalytics, resumeAnalytics, setConsent, trackScreen, updateIdentity } from '@/lib/analytics';
import { endBilling, initBilling } from '@/lib/billing/iap';
import { refreshTeam } from '@/lib/billing/team';
import { FREE_UNLIMITED } from '@/lib/billing/plans';
import { refreshTestInstall } from '@/lib/billing/test-install';
import { haptic, setHapticsEnabled } from '@/lib/haptics';
import { isDemoMode } from '@/lib/demo';
import { cleanupOrphanImages, clearImageCaches } from '@/lib/images';
import { processPendingDeletion } from '@/lib/server-deletion';
import { useAppStore } from '@/store/app-store';

SplashScreen.preventAutoHideAsync().catch(() => {});
// 인트로 첫 화면이 네이티브 스플래시와 같은 그림이라 서서히 사라질 필요가 없다 —
// 안드로이드 기본값(0.4초 페이드)이면 스플래시가 사라지는 동안 인트로 로고가 움직여 두 겹으로 보인다
SplashScreen.setOptions({ duration: 0, fade: false });

/** 켤 때 로고 인트로 — 홈페이지에 넣은 데모(자동 재생)에서는 바로 시작한다 */
const SHOW_INTRO = !isDemoMode;
/** 빠른 코칭(플로팅 버블·아이폰 뒷면 두 번 톡 → mylovecoach://quick)으로 열면 인트로 없이 바로 */
const isQuickLaunch = (path: string | null | undefined) => Boolean(path?.startsWith('/quick'));
/** 인트로가 끝나지 않는 일이 생겨도 이 시간이 지나면 화면을 연다 */
const INTRO_SAFETY_MS = 7000;

const hideNativeSplash = () => {
  SplashScreen.hideAsync().catch(() => {});
};

/** 인트로에서 로고가 두근할 때 — 저장소를 읽었고 진동을 켜 둔 경우에만 (웹은 화면을 누르기 전 진동이 막혀 있어 부르지 않는다) */
const introBeat = () => {
  if (Platform.OS === 'web') return;
  const s = useAppStore.getState();
  if (s.hydrated && s.hapticsOn) haptic.heartbeat();
};

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
  const [introDone, setIntroDone] = useState(() => !SHOW_INTRO || isQuickLaunch(pathname));

  // 마이 탭의 「진동 효과」 설정을 진동 모듈에 반영
  useEffect(() => {
    setHapticsEnabled(hapticsOn);
  }, [hapticsOn]);

  // 무제한 테스트 빌드면 테스트 경로(iOS 는 TestFlight) 설치인지 확인한 뒤에만 무제한을 켠다 — 확인 전·실패는 유료 동작.
  // 처음 켤 때 오프라인 등으로 확인을 못 했으면 앱으로 돌아올 때마다 다시 확인한다
  useEffect(() => {
    if (!FREE_UNLIMITED) return;
    refreshTestInstall().catch(() => {});
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refreshTestInstall().catch(() => {});
    });
    return () => sub.remove();
  }, []);

  // 첫 경로가 늦게 정해져 빠른 코칭으로 열린 걸 나중에 알았으면, 저장소를 다 읽은 뒤 인트로를 바로 걷는다 (스플래시는 아래 hydrated 효과가 내림)
  useEffect(() => {
    if (!introDone && hydrated && isQuickLaunch(pathname)) setIntroDone(true);
  }, [introDone, hydrated, pathname]);

  useEffect(() => {
    if (hydrated) {
      // 인트로는 첫 화면(네이티브 스플래시와 같은 로고)을 그리자마자 스스로 내린다 — 여기서는 인트로가 없거나 혹시 안 내려졌을 때만 (이미 내렸으면 아무 일도 없음)
      const t = setTimeout(hideNativeSplash, introDone ? 0 : 1500);
      return () => clearTimeout(t);
    }
    // 저장소 접근이 막힌 환경(사생활 보호 모드 등)에서도 앱이 멈추지 않도록 안전장치
    const t = setTimeout(() => setHydrated(), 2500);
    return () => clearTimeout(t);
  }, [hydrated, setHydrated, introDone]);

  // 인트로가 어떤 이유로 끝나지 않아도 화면이 막히지 않게
  useEffect(() => {
    if (introDone) return;
    const t = setTimeout(() => {
      hideNativeSplash();
      setIntroDone(true);
    }, INTRO_SAFETY_MS);
    return () => clearTimeout(t);
  }, [introDone]);

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
    initAnalytics({
      deviceId: s.deviceId,
      consent: s.analyticsConsent === true,
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
      setConsent(next.analyticsConsent === true);
      updateIdentity({
        user: next.user,
        premiumPlan: next.premium?.plan ?? null,
        crushCount: Object.keys(next.crushes).length,
        acquisition: next.acquisition,
        consentVersion: consentVersionOf(next),
        deletionPending: next.pendingDeletion != null,
      });
      // 동의한 채로 나이를 만 14세 미만으로 바꾸면 서버에 쌓인 기록도 지운다 (법정대리인 동의를 받지 않으므로)
      const under = (u: typeof next.user) => u?.age != null && u.age < 14;
      if (next.analyticsConsent === true && under(next.user) && !under(prev.user)) next.requestServerDeletion();
      if (next.pendingDeletion && next.pendingDeletion !== prev.pendingDeletion) processPendingDeletion().catch(() => {});
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
            {/* 인트로가 덮여 있는 동안 화면 낭독기가 가려진 화면을 읽지 않게 (iOS 는 인트로의 accessibilityViewIsModal 이 맡는다) */}
            <View style={styles.fill} importantForAccessibility={introDone ? 'auto' : 'no-hide-descendants'} accessibilityElementsHidden={!introDone}>
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
            </View>
            {/* AI 로 대화를 보내기 전 동의 시트 — 어느 화면(모달 포함)에서 AI 를 부르든 여기서 하나만 뜬다 */}
            <AiConsentHost />
            <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
          </ToastProvider>
          {/* 켤 때 로고 인트로 — 모든 화면 위에 덮였다가 저장소를 읽고 나면 사라진다 */}
          {introDone ? null : <IntroSplash ready={hydrated} onShown={hideNativeSplash} onBeat={introBeat} onDone={() => setIntroDone(true)} />}
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
