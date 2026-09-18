import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { MaxContentWidth, Spacing, palette } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { track } from '@/lib/analytics';
import { APP_CONFIG } from '@/lib/config';
import { pickImage } from '@/lib/images';
import { useAppStore } from '@/store/app-store';

/**
 * 첫 화면 — 가입도 설문도 없이 캡처 한 장으로 바로 코칭을 받는다.
 * 이름·MBTI 같은 정보는 결과를 본 뒤에 원하면 채운다.
 */
export default function Start() {
  const theme = useTheme();
  const router = useRouter();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const quickStart = useAppStore((s) => s.quickStart);
  const setAnalyticsConsent = useAppStore((s) => s.setAnalyticsConsent);
  const [consent, setConsent] = useState(true);
  const [busy, setBusy] = useState(false);

  const begin = (mode: 'image' | 'text') => {
    setAnalyticsConsent(consent);
    track('start', { mode, consent });
    return quickStart();
  };

  const withCapture = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const picked = await pickImage('screenshot');
      if (!picked) return;
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

  return (
    <View style={[styles.root, { backgroundColor: theme.background, paddingTop: insets.top }]}>
      <View style={styles.body}>
        <LinearGradient colors={[palette.sky100, palette.pink100]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
          <AppText style={styles.heroEmoji}>💌</AppText>
        </LinearGradient>

        <AppText variant="display" style={styles.title}>
          대화 캡처 한 장이면{'\n'}답장이 나와요
        </AppText>
        <AppText variant="body" color="textSecondary" style={styles.subtitle}>
          카톡·인스타 DM 화면을 캡처해서 올려주세요.{'\n'}가입 없이 바로 답장 3개와 호감 온도를 알려드려요.
        </AppText>

        <View style={styles.points}>
          {POINTS.map((p) => (
            <View key={p.text} style={styles.point}>
              <View style={[styles.pointIcon, { backgroundColor: theme.primarySoft }]}>
                <Ionicons name={p.icon} size={15} color={theme.primary} />
              </View>
              <AppText variant="small" color="textSecondary">
                {p.text}
              </AppText>
            </View>
          ))}
        </View>
      </View>

      <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.lg }]}>
        <Button
          title={busy ? '사진 여는 중…' : '대화 캡처 올리기'}
          onPress={withCapture}
          disabled={busy}
          icon={busy ? <ActivityIndicator size="small" color={theme.primaryText} /> : <Ionicons name="image" size={18} color={theme.primaryText} />}
        />
        <Button title="캡처 없이 상황만 적을래요" variant="ghost" onPress={withText} disabled={busy} />

        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: consent }}
          onPress={() => setConsent((v) => !v)}
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
    </View>
  );
}

const POINTS: { icon: keyof typeof Ionicons.glyphMap; text: string }[] = [
  { icon: 'chatbubble-ellipses', text: '상황에 맞는 답장 3개를 톤별로' },
  { icon: 'thermometer', text: '상대의 호감 온도를 0~100°로' },
  { icon: 'lock-closed', text: '회원가입 없음 · 캡처 이미지는 저장 안 해요' },
];

const styles = StyleSheet.create({
  root: { flex: 1 },
  body: { flex: 1, justifyContent: 'center', paddingHorizontal: Spacing.xl, gap: Spacing.md, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  hero: { width: 108, height: 108, borderRadius: 36, alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.lg },
  heroEmoji: { fontSize: 52, lineHeight: 62 },
  title: { letterSpacing: -0.8 },
  subtitle: { marginBottom: Spacing.md },
  points: { gap: Spacing.md },
  point: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  pointIcon: { width: 28, height: 28, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  footer: { paddingHorizontal: Spacing.xl, gap: Spacing.sm, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  consent: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, marginTop: Spacing.xs },
  checkbox: { width: 18, height: 18, borderRadius: 5, borderWidth: 2, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  consentText: { flex: 1 },
});
