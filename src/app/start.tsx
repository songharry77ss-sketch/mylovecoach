import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, FadeInUp, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DemoReel } from '@/components/fx/demo-reel';
import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { PressableScale } from '@/components/ui/pressable-scale';
import { useToast } from '@/components/ui/toast';
import { MaxContentWidth, Radius, Spacing, palette } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';
import { track } from '@/lib/analytics';
import { APP_CONFIG } from '@/lib/config';
import { haptic } from '@/lib/haptics';
import { pickImage } from '@/lib/images';
import { useAppStore } from '@/store/app-store';

/**
 * 첫 화면 — 짧은 시연 영상(루프 애니메이션)으로 무엇을 해 주는 앱인지 바로 보여 주고,
 * 가입도 설문도 없이 캡처 한 장으로 바로 코칭을 받는다. 이름·MBTI 같은 정보는 결과를 본 뒤에 원하면 채운다.
 */
export default function Start() {
  const theme = useTheme();
  const scheme = useColorScheme();
  const router = useRouter();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const quickStart = useAppStore((s) => s.quickStart);
  const createSecretChat = useAppStore((s) => s.createSecretChat);
  const setAnalyticsConsent = useAppStore((s) => s.setAnalyticsConsent);
  const [consent, setConsent] = useState(true);
  const [busy, setBusy] = useState(false);

  // 메인 버튼이 은은하게 빛나며 숨 쉰다
  const glow = useSharedValue(0);
  useEffect(() => {
    glow.value = withRepeat(withSequence(withTiming(1, { duration: 1100 }), withTiming(0, { duration: 1100 })), -1);
  }, [glow]);
  const glowStyle = useAnimatedStyle(() => ({ opacity: 0.25 + glow.value * 0.35, transform: [{ scale: 1 + glow.value * 0.04 }] }));

  const begin = (mode: 'image' | 'text' | 'secret') => {
    setAnalyticsConsent(consent);
    track('start', { mode, consent });
    return mode === 'secret' ? createSecretChat() : quickStart();
  };

  const withCapture = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const picked = await pickImage('screenshot');
      if (!picked) return;
      haptic.thud();
      const crushId = begin('image');
      router.replace({ pathname: '/crush/[id]', params: { id: crushId, pendingImage: picked.uri, pendingWidth: String(picked.width) } });
    } catch (e) {
      toast.show(e instanceof Error ? e.message : '사진을 불러오지 못했어요.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const withText = () => {
    const crushId = begin('text');
    router.replace({ pathname: '/crush/[id]', params: { id: crushId } });
  };

  const secret = () => {
    const crushId = begin('secret');
    // 비밀 상담을 나오면 홈으로 가도록 탭 화면을 먼저 깔아 둔다
    router.replace('/(tabs)');
    router.push({ pathname: '/crush/[id]', params: { id: crushId } });
  };

  const bg: [string, string, string] = scheme === 'dark' ? [theme.background, '#141B2A', '#20182A'] : [palette.sky50, palette.lavender100, palette.pink50];

  return (
    <LinearGradient colors={bg} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.root}>
      <ScrollView contentContainerStyle={[styles.scroll, { paddingTop: insets.top + Spacing.md, paddingBottom: insets.bottom + Spacing.lg }]} showsVerticalScrollIndicator={false}>
        <Animated.View entering={FadeInDown.duration(400)} style={styles.brand}>
          <AppText variant="smallStrong" color="primary">
            ✨ 나만의 연애코치
          </AppText>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(120).duration(500)} style={styles.reel}>
          <DemoReel />
        </Animated.View>

        <Animated.View entering={FadeInUp.delay(250).duration(500)} style={styles.texts}>
          <AppText variant="display" style={styles.title}>
            대화 캡처 한 장이면{'\n'}답장이 나와요
          </AppText>
          <AppText variant="body" color="textSecondary">
            호칭·존댓말까지 그대로 살린 답장 여러 버전을 넘겨 보고, 0°에서 시작하는 호감 온도가 오르는 걸 확인하세요.
          </AppText>
        </Animated.View>

        <View style={styles.footer}>
          <View>
            <Animated.View pointerEvents="none" style={[styles.glow, { backgroundColor: theme.primary }, glowStyle]} />
            <Button
              title={busy ? '사진 여는 중…' : '대화 캡처 올리기'}
              onPress={withCapture}
              disabled={busy}
              icon={busy ? <ActivityIndicator size="small" color={theme.primaryText} /> : <Ionicons name="image" size={18} color={theme.primaryText} />}
            />
          </View>
          <Button title="캡처 없이 상황만 적을래요" variant="ghost" onPress={withText} disabled={busy} />

          <View style={styles.extras}>
            <PressableScale onPress={() => router.push('/kkti')} style={[styles.extra, { backgroundColor: theme.surface }]}>
              <AppText variant="smallStrong">🧪 1분 KKTI 테스트</AppText>
              <AppText variant="caption" color="textSecondary">
                카톡 속 진짜 연애 MBTI
              </AppText>
            </PressableScale>
            <PressableScale onPress={secret} style={[styles.extra, { backgroundColor: theme.surface }]}>
              <AppText variant="smallStrong">🕶️ 비밀 상담</AppText>
              <AppText variant="caption" color="textSecondary">
                기록이 남지 않아요
              </AppText>
            </PressableScale>
          </View>

          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: consent }}
            onPress={() => {
              haptic.select();
              setConsent((v) => !v);
            }}
            style={styles.consent}
            hitSlop={6}>
            <View style={[styles.checkbox, { borderColor: consent ? theme.primary : theme.textTertiary, backgroundColor: consent ? theme.primary : 'transparent' }]}>
              {consent ? <Ionicons name="checkmark" size={12} color={theme.primaryText} /> : null}
            </View>
            <AppText variant="caption" color="textSecondary" style={styles.consentText}>
              (선택) 서비스 개선을 위한 이용 기록 수집에 동의해요. 올린 캡처 이미지는 저장하지 않고, 마이 탭에서 언제든 끌 수 있어요.
            </AppText>
          </Pressable>

          <AppText variant="caption" color="textTertiary" align="center">
            시작하면{' '}
            <AppText variant="caption" color="primary" onPress={() => Linking.openURL(APP_CONFIG.termsUrl)}>
              이용약관
            </AppText>
            {' · '}
            <AppText variant="caption" color="primary" onPress={() => Linking.openURL(APP_CONFIG.privacyUrl)}>
              개인정보 처리방침
            </AppText>
            에 동의하게 돼요
          </AppText>
        </View>
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { flexGrow: 1, paddingHorizontal: Spacing.xl, gap: Spacing.lg, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  brand: { alignItems: 'center' },
  reel: { width: '100%' },
  texts: { gap: Spacing.sm },
  title: { letterSpacing: -0.8 },
  footer: { gap: Spacing.sm, marginTop: 'auto' },
  glow: { position: 'absolute', left: 8, right: 8, top: 6, bottom: -6, borderRadius: Radius.md },
  extras: { flexDirection: 'row', gap: Spacing.sm },
  extra: { flex: 1, borderRadius: Radius.md, paddingVertical: Spacing.md, paddingHorizontal: Spacing.md, gap: 2 },
  consent: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, marginTop: Spacing.xs },
  checkbox: { width: 18, height: 18, borderRadius: 5, borderWidth: 2, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  consentText: { flex: 1 },
});
