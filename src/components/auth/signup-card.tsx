import { Ionicons } from '@expo/vector-icons';
import * as AppleAuthentication from 'expo-apple-authentication';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { Radius, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';
import { appleSignInAvailable, AuthCancelled, signInWithApple, signInWithKakao, type LinkResult } from '@/lib/auth';
import { SIGNUP_BONUS } from '@/lib/billing/plans';
import { haptic } from '@/lib/haptics';

interface Props {
  /** 가입·로그인을 마쳤을 때 (웹 카카오는 화면을 떠났다가 /auth/callback 에서 마무리하므로 불리지 않는다) */
  onDone: (result: LinkResult) => void;
  title?: string;
  subtitle?: string;
}

const KAKAO_YELLOW = '#FEE500';

/** 카카오·Apple 로 가입하고 무료 코칭 보너스 받기 */
export function SignupCard({ onDone, title, subtitle }: Props) {
  const theme = useTheme();
  const scheme = useColorScheme();
  const [apple, setApple] = useState(false);
  const [busy, setBusy] = useState<'kakao' | 'apple' | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    appleSignInAvailable().then(setApple);
  }, []);

  const run = async (provider: 'kakao' | 'apple') => {
    if (busy) return;
    haptic.tap();
    setBusy(provider);
    setError(null);
    try {
      const result = provider === 'apple' ? await signInWithApple() : await signInWithKakao();
      if (result) onDone(result);
    } catch (e) {
      if (!(e instanceof AuthCancelled)) setError(e instanceof Error ? e.message : '가입을 마치지 못했어요. 잠시 후 다시 시도해주세요.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={[styles.card, { backgroundColor: theme.primarySoft }]}>
      <View style={styles.texts}>
        <AppText variant="title3" align="center">
          {title ?? `가입하고 무료 코칭 ${SIGNUP_BONUS}회 더 받기 🎁`}
        </AppText>
        <AppText variant="small" color="textSecondary" align="center">
          {subtitle ?? '카카오나 Apple 계정으로 바로 끝나요. 가입하면 매일 무료 코칭 1회도 충전돼요.'}
        </AppText>
      </View>

      {apple ? (
        <View pointerEvents={busy ? 'none' : 'auto'} style={{ opacity: busy && busy !== 'apple' ? 0.5 : 1 }}>
          <AppleAuthentication.AppleAuthenticationButton
            buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
            buttonStyle={scheme === 'dark' ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
            cornerRadius={Radius.md}
            style={styles.button}
            onPress={() => run('apple')}
          />
        </View>
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="카카오로 시작하기"
        disabled={busy != null}
        onPress={() => run('kakao')}
        style={({ pressed }) => [styles.button, styles.kakao, { opacity: pressed || (busy && busy !== 'kakao') ? 0.6 : 1 }]}>
        {busy === 'kakao' ? <ActivityIndicator color="#191919" /> : <Ionicons name="chatbubble" size={18} color="#191919" />}
        <AppText variant="bodyStrong" color="#191919">
          카카오로 시작하기
        </AppText>
      </Pressable>

      {error ? (
        <AppText variant="small" color="danger" align="center" accessibilityLiveRegion="polite">
          {error}
        </AppText>
      ) : null}
      <AppText variant="caption" color="textTertiary" align="center">
        가입하면 이용약관과 개인정보 처리방침에 동의하는 것으로 봐요. 마이 탭에서 언제든 탈퇴할 수 있어요.
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: Radius.lg, padding: Spacing.lg, gap: Spacing.md },
  texts: { gap: Spacing.xs, marginBottom: Spacing.xs },
  button: { height: 50, width: '100%' },
  kakao: { backgroundColor: KAKAO_YELLOW, borderRadius: Radius.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm },
});
