import { Ionicons } from '@expo/vector-icons';
import * as AppleAuthentication from 'expo-apple-authentication';
import { useFonts } from 'expo-font';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Platform, Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { Radius, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';
import { appleSignInAvailable, AuthCancelled, signInWithApple, signInWithGoogle, signInWithKakao, type LinkResult } from '@/lib/auth';
import { SIGNUP_BONUS } from '@/lib/billing/plans';
import { haptic } from '@/lib/haptics';

interface Props {
  /** 가입·로그인을 마쳤을 때 (웹 OAuth는 /auth/callback 에서 마무리하므로 불리지 않는다) */
  onDone: (result: LinkResult) => void;
  title?: string;
  subtitle?: string;
}

const KAKAO_YELLOW = '#FEE500';
const GOOGLE_FONT = { GoogleSansMedium: require('../../../assets/auth/GoogleSans-Medium.ttf') };
type SignInProvider = 'kakao' | 'google' | 'apple';

/** 카카오·Google·Apple로 가입하고 무료 코칭 보너스 받기 */
export function SignupCard({ onDone, title, subtitle }: Props) {
  const theme = useTheme();
  const scheme = useColorScheme();
  const [apple, setApple] = useState(false);
  const [busy, setBusy] = useState<SignInProvider | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [googleFontLoaded] = useFonts(GOOGLE_FONT);

  useEffect(() => {
    appleSignInAvailable().then(setApple);
  }, []);

  const run = async (provider: SignInProvider) => {
    if (busy) return;
    haptic.tap();
    setBusy(provider);
    setError(null);
    try {
      const signIn = { apple: signInWithApple, google: signInWithGoogle, kakao: signInWithKakao }[provider];
      const result = await signIn();
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
          {subtitle ?? '사용 중인 계정으로 간편하게 가입하세요. 매일 무료 코칭 1회도 충전돼요.'}
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
        accessibilityLabel="Google로 계속하기"
        disabled={busy != null}
        onPress={() => run('google')}
        style={({ pressed }) => [styles.button, styles.google, { opacity: pressed || (busy && busy !== 'google') ? 0.6 : 1 }]}>
        <Image source={require('../../../assets/auth/google-g.png')} style={styles.googleLogo} resizeMode="contain" accessibilityIgnoresInvertColors />
        <AppText color="#1F1F1F" style={[styles.googleText, googleFontLoaded ? { fontFamily: 'GoogleSansMedium' } : null]}>
          Google로 계속하기
        </AppText>
        {busy === 'google' ? <ActivityIndicator color="#1F1F1F" style={styles.googleBusy} /> : null}
      </Pressable>

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
  // Google 공식 버튼 규격: 흰 배경·표준 다색 로고·전용 글꼴, 다른 로그인과 같은 크기.
  google: { backgroundColor: '#FFFFFF', borderColor: '#747775', borderWidth: 1, borderRadius: Radius.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Platform.OS === 'ios' ? 12 : 10, paddingHorizontal: Platform.OS === 'ios' ? 16 : 12 },
  googleLogo: { width: 20, height: 20 },
  googleText: { fontSize: 14, lineHeight: 20, fontWeight: '500' },
  googleBusy: { position: 'absolute', right: 12 },
  kakao: { backgroundColor: KAKAO_YELLOW, borderRadius: Radius.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm },
});
