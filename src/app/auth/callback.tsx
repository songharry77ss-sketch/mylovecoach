import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { useToast } from '@/components/ui/toast';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { authErrorMessage, linkMember } from '@/lib/auth';
import { SIGNUP_BONUS } from '@/lib/billing/plans';
import { haptic } from '@/lib/haptics';
import { supabase } from '@/lib/supabase';

/**
 * 카카오·Google 로그인에서 돌아오는 주소 (/auth/callback).
 * 웹은 Supabase 가 주소의 code 로 로그인을 마치면 여기서 회원 연결·보너스를 처리한다.
 * 앱은 보통 로그인 창이 이 주소를 직접 받는다(+native-intent 가 이 화면을 열지 않음).
 * 로그인 도중 앱이 꺼졌다가 이 주소로 다시 켜진 경우에만 열리며, 그때는 code 로 로그인을 여기서 마친다.
 */
export default function AuthCallback() {
  const theme = useTheme();
  const router = useRouter();
  const toast = useToast();
  const params = useLocalSearchParams<{ code?: string; error?: string }>();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!supabase) return router.replace('/');
      try {
        const query = Platform.OS === 'web' ? new URLSearchParams(window.location.search) : null;
        const failed = query ? query.get('error') : params.error;
        if (failed) {
          // 주소의 원문 설명은 화면이나 로그에 남기지 않는다.
          throw new Error(authErrorMessage(failed));
        }
        if (Platform.OS !== 'web') {
          if (!params.code) return router.replace('/');
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(params.code);
          if (exchangeError) throw new Error(authErrorMessage(null));
        }
        const { data } = await supabase.auth.getSession();
        if (!data.session) throw new Error(authErrorMessage(null));
        const result = await linkMember();
        if (!alive) return;
        haptic.celebrate();
        toast.show(result.bonus ? `가입 완료! 무료 코칭 ${SIGNUP_BONUS}회를 받았어요 🎁` : '로그인했어요.', 'success');
        router.replace('/(tabs)/my');
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : authErrorMessage(null));
      }
    })();
    return () => {
      alive = false;
    };
    // 콜백 주소의 값은 화면이 열릴 때 한 번만 읽는다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, toast]);

  return (
    <Screen safeTop safeBottom contentStyle={styles.content}>
      <View style={styles.center}>
        {error ? (
          <>
            <AppText variant="title3" align="center">
              가입을 마치지 못했어요
            </AppText>
            <AppText variant="small" color="textSecondary" align="center">
              {error}
            </AppText>
            <Button title="돌아가기" onPress={() => router.replace('/(tabs)/my')} />
          </>
        ) : (
          <>
            <ActivityIndicator color={theme.primary} />
            <AppText variant="small" color="textSecondary" align="center">
              가입을 마무리하는 중…
            </AppText>
          </>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.md, paddingHorizontal: Spacing.lg },
});
