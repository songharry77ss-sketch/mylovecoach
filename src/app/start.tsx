import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import Animated, { FadeInDown, FadeInUp, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { StartConsentSheet, type StartConsentAnswer } from '@/components/consent/start-consent-sheet';
import { DemoReel } from '@/components/fx/demo-reel';
import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { PressableScale } from '@/components/ui/pressable-scale';
import { useToast } from '@/components/ui/toast';
import { MaxContentWidth, Radius, Spacing, Typography, palette } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';
import { track } from '@/lib/analytics';
import { APP_CONFIG } from '@/lib/config';
import { haptic } from '@/lib/haptics';
import { pickImage } from '@/lib/images';
import { privacyUrl } from '@/lib/privacy-copy';
import { useAppStore } from '@/store/app-store';

type StartMode = 'image' | 'text' | 'secret';

/** 눌러서 바로 채우는 상황 예시 — 무엇을 적을지 막막하지 않게 */
const EXAMPLES = ['썸남이 「뭐해?」라고 보냈어. 뭐라고 답하지?', '소개팅 다음 날, 먼저 연락해도 될까?', '읽씹 3시간째… 한 번 더 보내도 돼?'];

/**
 * 첫 화면 — 짧은 시연 영상(루프 애니메이션)으로 무엇을 해 주는 앱인지 바로 보여 주고,
 * 가입도 설문도 없이 캡처 한 장으로 바로 코칭을 받는다. 이름·MBTI 같은 정보는 결과를 본 뒤에 원하면 채운다.
 * 처음 시작 버튼을 누르면 동의 창(필수: 이용약관·개인정보 처리방침 확인, 선택: 코칭 내용 저장)을 띄우고, 답하면 누른 버튼의 일을 이어서 한다.
 */
export default function Start() {
  const theme = useTheme();
  const scheme = useColorScheme();
  const router = useRouter();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const quickStart = useAppStore((s) => s.quickStart);
  const createSecretChat = useAppStore((s) => s.createSecretChat);
  const agreeToStart = useAppStore((s) => s.agreeToStart);
  const agreed = useAppStore((s) => s.termsAgreedAt != null);
  const [busy, setBusy] = useState(false);
  // 동의 창이 떠 있으면 그 창을 띄운 버튼 (답하면 그 일을 이어서 한다)
  const [asking, setAsking] = useState<StartMode | null>(null);
  // 캡처 없이 바로 적는 지금 상황 — 첫 코칭까지 가장 짧은 길 (캡처는 고르기 번거로워 여기서 많이 떠났다)
  const [situation, setSituation] = useState('');
  const [fromExample, setFromExample] = useState(false);
  const typed = situation.trim();

  // 메인 버튼이 은은하게 빛나며 숨 쉰다
  const glow = useSharedValue(0);
  useEffect(() => {
    glow.value = withRepeat(withSequence(withTiming(1, { duration: 1100 }), withTiming(0, { duration: 1100 })), -1);
  }, [glow]);
  const glowStyle = useAnimatedStyle(() => ({ opacity: 0.25 + glow.value * 0.35, transform: [{ scale: 1 + glow.value * 0.04 }] }));

  const begin = (mode: StartMode) => {
    track('start', { mode, content: useAppStore.getState().contentConsent === true, ...(mode === 'text' ? { typed: typed.length > 0, example: fromExample } : {}) });
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

  // 적은 상황이 있으면 채팅방에 들어가자마자 그 글로 코칭을 보낸다 (빈 채팅방에서 무엇을 쓸지 몰라 떠나지 않게)
  const withText = () => {
    const crushId = begin('text');
    router.replace({ pathname: '/crush/[id]', params: { id: crushId, ...(typed ? { pendingText: typed } : {}) } });
  };

  const pickExample = (example: string) => {
    haptic.select();
    setSituation(example);
    setFromExample(true);
  };

  const secret = () => {
    const crushId = begin('secret');
    // 비밀 상담을 나오면 홈으로 가도록 탭 화면을 먼저 깔아 둔다
    router.replace('/(tabs)');
    router.push({ pathname: '/crush/[id]', params: { id: crushId } });
  };

  const run = (mode: StartMode) => {
    if (mode === 'image') withCapture();
    else if (mode === 'text') withText();
    else secret();
  };

  // 아직 동의 창에 답하지 않았으면 먼저 띄운다
  const go = (mode: StartMode) => {
    if (busy) return;
    if (!agreed) {
      track('start_consent_open', { mode });
      setAsking(mode);
      return;
    }
    run(mode);
  };

  const onAgree = ({ content, all }: StartConsentAnswer) => {
    const mode = asking;
    haptic.select();
    agreeToStart(content);
    track('start_consent', { all, content, mode });
    setAsking(null);
    // 같은 누름 안에서 이어서 연다 — 웹은 사용자가 누른 직후에만 사진 선택 창을 열 수 있다
    if (mode) run(mode);
  };

  const bg: [string, string, string] = scheme === 'dark' ? [theme.background, '#141B2A', '#20182A'] : [palette.sky50, palette.lavender100, palette.pink50];

  return (
    <LinearGradient colors={bg} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.root}>
      <ScrollView contentContainerStyle={[styles.scroll, { paddingTop: insets.top + Spacing.md, paddingBottom: insets.bottom + Spacing.lg }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag">
        <Animated.View entering={FadeInDown.duration(400)} style={styles.brand}>
          <AppText variant="smallStrong" color="primary">
            ✨ 나만의 연애코치
          </AppText>
        </Animated.View>

        <Animated.View entering={FadeInUp.delay(120).duration(500)} style={styles.texts}>
          <AppText variant="display" style={styles.title}>
            지금 상황만 적어도{'\n'}답장이 나와요
          </AppText>
          <AppText variant="body" color="textSecondary">
            있는 그대로 적으면 바로 보낼 답장과 조언을 드려요. 대화 캡처를 올리면 호칭·존댓말까지 살려 줘요.
          </AppText>
        </Animated.View>

        <Animated.View entering={FadeInUp.delay(200).duration(500)} style={[styles.ask, { backgroundColor: theme.surfaceElevated, borderColor: theme.border }]}>
          <TextInput
            value={situation}
            onChangeText={(value) => {
              setSituation(value);
              setFromExample(false);
            }}
            placeholder={'예) 소개팅 다음 날인데 먼저 연락해도 될까?\n상대가 한 말을 그대로 적어도 좋아요'}
            placeholderTextColor={theme.textTertiary}
            accessibilityLabel="지금 상황 적기"
            multiline
            maxLength={800}
            style={[styles.askInput, Typography.body, { color: theme.text }]}
          />
          <View style={styles.examples}>
            {EXAMPLES.map((example) => (
              <Chip key={example} label={example} size="sm" onPress={() => pickExample(example)} />
            ))}
          </View>
        </Animated.View>

        <View style={styles.footer}>
          <View>
            {typed ? <Animated.View pointerEvents="none" style={[styles.glow, { backgroundColor: theme.primary }, glowStyle]} /> : null}
            <Button
              title="답장·조언 받기"
              onPress={() => go('text')}
              disabled={busy || !typed}
              icon={<Ionicons name="sparkles" size={18} color={theme.primaryText} />}
            />
          </View>
          <Button
            title={busy ? '사진 여는 중…' : '대화 캡처로 받기'}
            variant="secondary"
            onPress={() => go('image')}
            disabled={busy}
            icon={busy ? <ActivityIndicator size="small" color={theme.primary} /> : <Ionicons name="image" size={18} color={theme.primary} />}
          />
          <Button title="빈 채팅방에서 시작하기" variant="ghost" size="md" onPress={() => go('text')} disabled={busy || Boolean(typed)} />

          <View style={styles.extras}>
            <PressableScale onPress={() => router.push('/kkti')} style={[styles.extra, { backgroundColor: theme.surface }]}>
              <AppText variant="smallStrong">🧪 1분 KKTI 테스트</AppText>
              <AppText variant="caption" color="textSecondary">
                카톡 속 진짜 연애 MBTI
              </AppText>
            </PressableScale>
            <PressableScale onPress={() => go('secret')} style={[styles.extra, { backgroundColor: theme.surface }]}>
              <AppText variant="smallStrong">🕶️ 비밀 상담</AppText>
              <AppText variant="caption" color="textSecondary">
                기록이 남지 않아요
              </AppText>
            </PressableScale>
          </View>

          <Animated.View entering={FadeInDown.delay(300).duration(500)} style={styles.reel}>
            <AppText variant="caption" color="textTertiary" align="center">
              이렇게 나와요
            </AppText>
            <DemoReel />
          </Animated.View>

          <AppText variant="caption" color="textTertiary" align="center" style={styles.notice}>
            앱을 쓰는 동안 화면·버튼 이용 기록이 서비스 제공·개선을 위해 자동으로 수집돼요 (만 14세 미만 제외).{' '}
            <AppText variant="caption" color="primary" accessibilityRole="link" onPress={() => Linking.openURL(privacyUrl('analytics'))}>
              개인정보 처리방침
            </AppText>
            {' · '}
            <AppText variant="caption" color="primary" accessibilityRole="link" onPress={() => Linking.openURL(APP_CONFIG.termsUrl)}>
              이용약관
            </AppText>
          </AppText>
        </View>
      </ScrollView>
      <StartConsentSheet visible={asking != null} onAgree={onAgree} onClose={() => setAsking(null)} />
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { flexGrow: 1, paddingHorizontal: Spacing.xl, gap: Spacing.lg, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  brand: { alignItems: 'center' },
  reel: { width: '100%', gap: Spacing.xs, marginTop: Spacing.md },
  ask: { borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.md, gap: Spacing.sm },
  askInput: { minHeight: 76, maxHeight: 180, textAlignVertical: 'top', padding: 0 },
  examples: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs },
  texts: { gap: Spacing.sm },
  title: { letterSpacing: -0.8 },
  footer: { gap: Spacing.sm, marginTop: 'auto' },
  glow: { position: 'absolute', left: 8, right: 8, top: 6, bottom: -6, borderRadius: Radius.md },
  extras: { flexDirection: 'row', gap: Spacing.sm },
  extra: { flex: 1, borderRadius: Radius.md, paddingVertical: Spacing.md, paddingHorizontal: Spacing.md, gap: 2 },
  notice: { marginTop: Spacing.xs },
});
