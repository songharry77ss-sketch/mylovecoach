import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { FadeInDown, FadeInUp, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { StartConsentSheet, type StartConsentAnswer } from '@/components/consent/start-consent-sheet';
import { DemoReel } from '@/components/fx/demo-reel';
import { HeartMark, Highlight, Polaroid, StageBackground, StagePill } from '@/components/stage/stage';
import { Button } from '@/components/ui/button';
import { PressableScale } from '@/components/ui/pressable-scale';
import { useToast } from '@/components/ui/toast';
import { MaxContentWidth, Radius, Spacing, Stage, palette } from '@/constants/theme';
import { track } from '@/lib/analytics';
import { APP_CONFIG } from '@/lib/config';
import { haptic } from '@/lib/haptics';
import { pickImage } from '@/lib/images';
import { privacyUrl } from '@/lib/privacy-copy';
import { useAppStore } from '@/store/app-store';

type StartMode = 'image' | 'text' | 'secret';

/** 검색 가이드(/guide/…)의 「답장 받기」로 들어오면 그 상황을 입력칸에 채워 둔다 (?q=). 너무 길면 자른다 */
const prefillOf = (q: string | string[] | undefined) => (Array.isArray(q) ? q[0] : q)?.trim().slice(0, 200) ?? '';

/** 눌러서 바로 채우는 상황 예시 — 무엇을 적을지 막막하지 않게 */
const EXAMPLES = ['썸남이 「뭐해?」라고 보냈어. 뭐라고 답하지?', '소개팅 다음 날, 먼저 연락해도 될까?', '읽씹 3시간째… 한 번 더 보내도 돼?'];

/** 기기마다 캡처하는 법 (아이폰 앱에는 다른 회사 기기 이름을 적지 않는다 — App Store 심사 2.3.10) */
const CAPTURE_HOW =
  Platform.OS === 'ios'
    ? '측면 버튼과 음량 높이기 버튼을 동시에 눌러요'
    : Platform.OS === 'android'
      ? '전원 버튼과 음량 낮추기 버튼을 동시에 눌러요'
      : '휴대폰에서 대화방을 캡처해 두세요';

const STEPS = [
  { icon: 'chatbubbles' as const, title: '카톡·DM 대화방 열기', body: '답장이 고민되는 대화가 보이게' },
  { icon: 'phone-portrait' as const, title: '화면 캡처하기', body: CAPTURE_HOW },
  { icon: 'cloud-upload' as const, title: '아래 버튼으로 올리기', body: '답장 3가지와 호감 온도가 바로 나와요' },
];

/**
 * 첫 캡처 화면 — 처음 실행 소개·「나에 대해」 다음에 오는 3단계이자, 가입·설문 없이 바로 코칭을 받는 입구.
 * 캡처하는 법을 세 줄로 보여 주고 「대화 캡처 올리기」로 이끈다. 캡처가 없으면 지금 상황만 적어도 된다 (검색 가이드의 ?q= 도 여기로).
 * 아직 이용약관에 답하지 않았으면(소개를 건너뛴 경우·웹 가이드로 바로 온 경우) 시작 버튼을 누를 때 동의 창을 띄우고, 답하면 누른 버튼의 일을 이어서 한다.
 */
export default function Start() {
  const router = useRouter();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const quickStart = useAppStore((s) => s.quickStart);
  const createSecretChat = useAppStore((s) => s.createSecretChat);
  const agreeToStart = useAppStore((s) => s.agreeToStart);
  const agreed = useAppStore((s) => s.termsAgreedAt != null);
  const userName = useAppStore((s) => s.user?.name?.trim());
  const [busy, setBusy] = useState(false);
  // 동의 창이 떠 있으면 그 창을 띄운 버튼 (답하면 그 일을 이어서 한다)
  const [asking, setAsking] = useState<StartMode | null>(null);
  // 캡처 없이 바로 적는 지금 상황 — 캡처를 고르기 번거로운 사람을 위한 두 번째 길
  const params = useLocalSearchParams<{ q?: string }>();
  const [situation, setSituation] = useState(() => prefillOf(params.q));
  const [fromExample, setFromExample] = useState(false);
  const [prefilled, setPrefilled] = useState(() => prefillOf(params.q).length > 0);
  const typed = situation.trim();

  // 캡처 버튼이 은은하게 빛나며 숨 쉰다
  const glow = useSharedValue(0);
  useEffect(() => {
    glow.value = withRepeat(withSequence(withTiming(1, { duration: 1100 }), withTiming(0, { duration: 1100 })), -1);
  }, [glow]);
  const glowStyle = useAnimatedStyle(() => ({ opacity: 0.2 + glow.value * 0.35, transform: [{ scale: 1 + glow.value * 0.04 }] }));

  const begin = (mode: StartMode) => {
    track('start', { mode, content: useAppStore.getState().contentConsent === true, ...(mode === 'text' ? { typed: typed.length > 0, example: fromExample, ...(prefilled ? { prefilled: true } : {}) } : {}) });
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
    setPrefilled(false);
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

  return (
    <StageBackground>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + Spacing.md, paddingBottom: insets.bottom + Spacing.xl }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag">
        <Animated.View entering={FadeInDown.duration(380)} style={styles.brandRow}>
          <View style={styles.brand}>
            <Ionicons name="heart-outline" size={16} color={Stage.gold} />
            <Text style={styles.brandText}>나만의 연애코치</Text>
          </View>
          <Text style={styles.step}>3 / 3</Text>
        </Animated.View>

        <Animated.View entering={FadeInUp.delay(100).duration(480)} style={styles.hero}>
          <View style={styles.heroTexts}>
            <Highlight text={userName ? `${userName}님,\n*첫 캡처*를\n올려 볼까요?` : '*첫 캡처*를\n올려 볼까요?'} />
            <Text style={styles.sub}>답장이 고민되는 대화를 캡처해서 올리면, 호칭·말투를 살린 답장 3가지와 호감 온도가 바로 나와요.</Text>
          </View>
          <View style={styles.polaroids} pointerEvents="none">
            <Polaroid photo="sunsetWoman" width={104} rotate={7} />
            <HeartMark size={30} rotate={-14} style={styles.heart} />
          </View>
        </Animated.View>

        <Animated.View entering={FadeInUp.delay(180).duration(480)} style={styles.guide}>
          <StagePill label="캡처하는 법" icon="camera" />
          {STEPS.map((s, i) => (
            <View key={s.title} style={styles.stepRow}>
              <View style={styles.stepNum}>
                <Text style={styles.stepNumText}>{i + 1}</Text>
              </View>
              <View style={styles.stepTexts}>
                <Text style={styles.stepTitle}>{s.title}</Text>
                <Text style={styles.stepBody}>{s.body}</Text>
              </View>
              <Ionicons name={s.icon} size={20} color={Stage.gold} />
            </View>
          ))}
        </Animated.View>

        <View>
          <Animated.View pointerEvents="none" style={[styles.glow, glowStyle]} />
          <Button
            title={busy ? '사진 여는 중…' : '대화 캡처로 받기'}
            variant="gold"
            onPress={() => go('image')}
            disabled={busy}
            icon={busy ? <ActivityIndicator size="small" color={Stage.onGold} /> : <Ionicons name="image" size={18} color={Stage.onGold} />}
          />
        </View>

        <View style={styles.orRow}>
          <View style={styles.orLine} />
          <Text style={styles.orText}>캡처가 없다면 상황만 적어도 돼요</Text>
          <View style={styles.orLine} />
        </View>

        <View style={styles.ask}>
          <TextInput
            value={situation}
            onChangeText={(value) => {
              setSituation(value);
              setFromExample(false);
              setPrefilled(false);
            }}
            placeholder={'예) 소개팅 다음 날인데 먼저 연락해도 될까?\n상대가 한 말을 그대로 적어도 좋아요'}
            placeholderTextColor={Stage.textFaint}
            accessibilityLabel="지금 상황 적기"
            multiline
            maxLength={800}
            style={styles.askInput}
          />
          <View style={styles.examples}>
            {EXAMPLES.map((example) => (
              <Pressable key={example} accessibilityRole="button" onPress={() => pickExample(example)} style={styles.example}>
                <Text style={styles.exampleText}>{example}</Text>
              </Pressable>
            ))}
          </View>
          <Button
            title="답장·조언 받기"
            variant={typed ? 'primary' : 'stage'}
            onPress={() => go('text')}
            disabled={busy || !typed}
            icon={<Ionicons name="sparkles" size={18} color={palette.white} />}
          />
        </View>

        <Button title="빈 채팅방에서 시작하기" variant="stageGhost" size="md" onPress={() => go('text')} disabled={busy || Boolean(typed)} style={styles.ghost} />

        <View style={styles.extras}>
          <PressableScale onPress={() => router.push('/kkti')} style={styles.extra}>
            <Text style={styles.extraTitle}>🧪 1분 KKTI 테스트</Text>
            <Text style={styles.extraBody}>카톡 속 진짜 연애 MBTI</Text>
          </PressableScale>
          <PressableScale onPress={() => go('secret')} style={styles.extra}>
            <Text style={styles.extraTitle}>🕶️ 비밀 상담</Text>
            <Text style={styles.extraBody}>기록이 남지 않아요</Text>
          </PressableScale>
        </View>

        <Animated.View entering={FadeInDown.delay(300).duration(500)} style={styles.reel}>
          <Text style={styles.reelLabel}>이렇게 나와요</Text>
          <DemoReel />
        </Animated.View>

        <Text style={styles.notice}>
          앱을 쓰는 동안 화면·버튼 이용 기록이 서비스 제공·개선을 위해 자동으로 수집돼요 (만 14세 미만 제외).{' '}
          <Text style={styles.link} accessibilityRole="link" onPress={() => Linking.openURL(privacyUrl('analytics'))}>
            개인정보 처리방침
          </Text>
          {' · '}
          <Text style={styles.link} accessibilityRole="link" onPress={() => Linking.openURL(APP_CONFIG.termsUrl)}>
            이용약관
          </Text>
        </Text>
      </ScrollView>
      <StartConsentSheet visible={asking != null} onAgree={onAgree} onClose={() => setAsking(null)} />
    </StageBackground>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1, paddingHorizontal: Spacing.xl, gap: Spacing.lg, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  brandRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  brandText: { fontSize: 13, fontWeight: '800', color: Stage.text, letterSpacing: -0.2 },
  step: { fontSize: 13, fontWeight: '800', color: Stage.gold, letterSpacing: 1 },
  hero: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md },
  heroTexts: { flex: 1, gap: Spacing.md },
  sub: { fontSize: 15, lineHeight: 22, fontWeight: '500', color: Stage.textDim },
  polaroids: { width: 104, paddingTop: Spacing.sm },
  heart: { position: 'absolute', left: -18, bottom: -26 },
  guide: { borderRadius: Radius.lg, backgroundColor: Stage.chip, borderWidth: 1, borderColor: Stage.chipBorder, padding: Spacing.lg, gap: Spacing.md },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  stepNum: { width: 28, height: 28, borderRadius: 14, backgroundColor: Stage.gold, alignItems: 'center', justifyContent: 'center' },
  stepNumText: { fontSize: 14, fontWeight: '900', color: Stage.onGold },
  stepTexts: { flex: 1, gap: 2 },
  stepTitle: { fontSize: 15, fontWeight: '800', color: Stage.text },
  stepBody: { fontSize: 13, lineHeight: 18, fontWeight: '500', color: Stage.textDim },
  glow: { position: 'absolute', left: 8, right: 8, top: 6, bottom: -6, borderRadius: Radius.md, backgroundColor: Stage.gold },
  orRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.xs },
  orLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: Stage.chipBorder },
  orText: { fontSize: 12, fontWeight: '700', color: Stage.textFaint },
  ask: { borderRadius: Radius.lg, backgroundColor: Stage.chip, borderWidth: 1, borderColor: Stage.chipBorder, padding: Spacing.md, gap: Spacing.md },
  askInput: { minHeight: 76, maxHeight: 180, textAlignVertical: 'top', padding: 0, fontSize: 16, lineHeight: 24, fontWeight: '500', color: Stage.text },
  examples: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs },
  example: { borderRadius: Radius.pill, borderWidth: 1, borderColor: Stage.chipBorder, paddingHorizontal: 10, paddingVertical: 6 },
  exampleText: { fontSize: 12, fontWeight: '600', color: Stage.textDim },
  ghost: { marginTop: -Spacing.sm },
  extras: { flexDirection: 'row', gap: Spacing.sm },
  extra: { flex: 1, borderRadius: Radius.md, paddingVertical: Spacing.md, paddingHorizontal: Spacing.md, gap: 2, backgroundColor: Stage.chip, borderWidth: 1, borderColor: Stage.chipBorder },
  extraTitle: { fontSize: 14, fontWeight: '800', color: Stage.text },
  extraBody: { fontSize: 12, fontWeight: '500', color: Stage.textDim },
  reel: { width: '100%', gap: Spacing.xs, marginTop: Spacing.sm },
  reelLabel: { fontSize: 12, fontWeight: '700', color: Stage.textFaint, textAlign: 'center' },
  notice: { fontSize: 12, lineHeight: 17, fontWeight: '500', color: Stage.textFaint, textAlign: 'center', marginTop: Spacing.xs },
  link: { color: Stage.goldSoft, fontWeight: '700' },
});
