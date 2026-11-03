import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { FadeInDown, FadeInUp, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { StartConsentSheet, type StartConsentAnswer } from '@/components/consent/start-consent-sheet';
import { DemoReel } from '@/components/fx/demo-reel';
import { HeartMark, Highlight, Polaroid, StageBackground, StagePill } from '@/components/stage/stage';
import { Button } from '@/components/ui/button';
import { PressableScale } from '@/components/ui/pressable-scale';
import { FocusStatusBar, StatusBarScrim, useScrolledPast } from '@/components/ui/system-bars';
import { useToast } from '@/components/ui/toast';
import { MaxContentWidth, Radius, Spacing, Stage, palette } from '@/constants/theme';
import { track } from '@/lib/analytics';
import { APP_CONFIG } from '@/lib/config';
import { haptic } from '@/lib/haptics';
import { pickImage } from '@/lib/images';
import { privacyUrl } from '@/lib/privacy-copy';
import { useAppStore } from '@/store/app-store';

type StartMode = 'image' | 'text' | 'browse';

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
 * 첫 캡처 화면 — 처음 실행 소개·「나에 대해」 다음에 오는 마지막 단계이자, 가입·설문 없이 바로 코칭을 받는 입구.
 * 할 일은 하나 — 캡처하는 법을 세 줄로 보여 주고 「대화 캡처 올리기」로 이끈다.
 * 캡처가 없으면 「상황만 적기」를 펼쳐 글로 물어도 된다 (검색 가이드의 ?q= 로 오면 펼친 채로 채워 둔다).
 * KKTI·비밀 상담 같은 부가 기능은 여기서 빼고 홈의 「탐색」 탭에 둔다. 아직 준비가 안 됐으면 위의 「둘러보기」로 홈부터 볼 수 있다.
 * 아직 이용약관에 답하지 않았으면(소개를 건너뛴 경우·웹 가이드로 바로 온 경우) 버튼을 누를 때 동의 창을 띄우고, 답하면 누른 버튼의 일을 이어서 한다.
 */
export default function Start() {
  const router = useRouter();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const { scrolled, onScroll } = useScrolledPast();
  const quickStart = useAppStore((s) => s.quickStart);
  const agreeToStart = useAppStore((s) => s.agreeToStart);
  const agreed = useAppStore((s) => s.termsAgreedAt != null);
  const userName = useAppStore((s) => s.user?.name?.trim());
  const [busy, setBusy] = useState(false);
  // 동의 창이 떠 있으면 그 창을 띄운 버튼 (답하면 그 일을 이어서 한다)
  const [asking, setAsking] = useState<StartMode | null>(null);
  // 캡처 없이 바로 적는 지금 상황 — 캡처를 고르기 번거로운 사람을 위한 두 번째 길 (접어 두고, 가이드에서 채워 온 글이 있으면 펼친다)
  const params = useLocalSearchParams<{ q?: string }>();
  const [situation, setSituation] = useState(() => prefillOf(params.q));
  const [fromExample, setFromExample] = useState(false);
  const [prefilled, setPrefilled] = useState(() => prefillOf(params.q).length > 0);
  const [writing, setWriting] = useState(() => prefillOf(params.q).length > 0);
  const typed = situation.trim();
  const scroller = useRef<ScrollView>(null);
  const askInput = useRef<TextInput>(null);
  // 펼친 「상황만 적기」 칸의 위치 — 키보드가 올라와도 입력칸이 보이게 이만큼 내린다
  const askY = useRef(0);

  // 캡처 버튼이 은은하게 빛나며 숨 쉰다
  const glow = useSharedValue(0);
  useEffect(() => {
    glow.value = withRepeat(withSequence(withTiming(1, { duration: 1100 }), withTiming(0, { duration: 1100 })), -1);
  }, [glow]);
  const glowStyle = useAnimatedStyle(() => ({ opacity: 0.2 + glow.value * 0.35, transform: [{ scale: 1 + glow.value * 0.04 }] }));

  const begin = (mode: StartMode) => {
    track('start', { mode, content: useAppStore.getState().contentConsent === true, ...(mode === 'text' ? { typed: typed.length > 0, example: fromExample, ...(prefilled ? { prefilled: true } : {}) } : {}) });
  };

  const withCapture = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const picked = await pickImage('screenshot');
      if (!picked) return;
      haptic.thud();
      begin('image');
      const crushId = quickStart();
      router.replace({ pathname: '/crush/[id]', params: { id: crushId, pendingImage: picked.uri, pendingWidth: String(picked.width) } });
    } catch (e) {
      toast.show(e instanceof Error ? e.message : '사진을 불러오지 못했어요.', 'error');
    } finally {
      setBusy(false);
    }
  };

  // 적은 상황은 채팅방에 들어가자마자 그 글로 코칭을 보낸다 (빈 채팅방에서 무엇을 쓸지 몰라 떠나지 않게)
  const withText = () => {
    if (!typed) return;
    begin('text');
    const crushId = quickStart();
    router.replace({ pathname: '/crush/[id]', params: { id: crushId, pendingText: typed } });
  };

  // 아직 캡처할 대화가 없으면 홈부터 둘러본다 — 다음에 열어도 이 화면으로 되돌아오지 않게 빈 프로필을 만들어 둔다.
  // 퍼널의 「첫 화면 통과」(start 이벤트)에 섞이지 않게 따로 남긴다
  const browse = () => {
    track('start_browse', { content: useAppStore.getState().contentConsent === true });
    const s = useAppStore.getState();
    if (!s.user) s.setUser({ name: '', gender: 'other', style: [], defaultTone: 'natural', emoji: 'on', createdAt: Date.now() });
    router.replace('/(tabs)');
  };

  const pickExample = (example: string) => {
    haptic.select();
    setSituation(example);
    setFromExample(true);
    setPrefilled(false);
  };

  const openWriting = () => {
    haptic.select();
    track('start_write_open');
    setWriting(true);
    // 칸이 그려진 뒤 위로 올리고 커서를 둔다 (바로 autoFocus 하면 키보드가 아래쪽 칸을 덮는다)
    setTimeout(() => askInput.current?.focus(), 120);
  };

  const revealAsk = () => {
    setTimeout(() => scroller.current?.scrollTo({ y: Math.max(0, askY.current - Spacing.md), animated: true }), Platform.OS === 'android' ? 250 : 80);
  };

  const run = (mode: StartMode) => {
    if (mode === 'image') withCapture();
    else if (mode === 'text') withText();
    else browse();
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
      <KeyboardAvoidingView style={styles.flex} behavior="padding">
      <ScrollView
        ref={scroller}
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + Spacing.md, paddingBottom: insets.bottom + Spacing.xl }]}
        onScroll={onScroll}
        scrollEventThrottle={32}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag">
        <Animated.View entering={FadeInDown.duration(380)} style={styles.brandRow}>
          <View style={styles.brand}>
            <Ionicons name="heart-outline" size={16} color={Stage.gold} />
            <Text style={styles.brandText}>나만의 연애코치</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="먼저 홈 둘러보기" onPress={() => go('browse')} hitSlop={12} style={styles.browse}>
            <Text style={styles.browseText}>둘러보기</Text>
          </Pressable>
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

        <Animated.View entering={FadeInUp.delay(260).duration(480)} style={styles.cta}>
          <View>
            <Animated.View pointerEvents="none" style={[styles.glow, glowStyle]} />
            <Button
              title={busy ? '사진 여는 중…' : '대화 캡처 올리기'}
              variant="gold"
              onPress={() => go('image')}
              disabled={busy}
              icon={busy ? <ActivityIndicator size="small" color={Stage.onGold} /> : <Ionicons name="image" size={18} color={Stage.onGold} />}
            />
          </View>
          <Text style={styles.ctaNote}>사진에서 캡처를 고르면 바로 분석을 시작해요</Text>
        </Animated.View>

        {writing ? (
          <Animated.View entering={FadeInDown.duration(260)} style={styles.ask} onLayout={(e) => (askY.current = e.nativeEvent.layout.y)}>
            <Text style={styles.askTitle}>✏️ 캡처 없이 상황만 적기</Text>
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
              ref={askInput}
              onFocus={revealAsk}
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
          </Animated.View>
        ) : (
          <PressableScale onPress={openWriting} style={styles.writeRow} accessibilityLabel="캡처 없이 상황만 적기">
            <Ionicons name="create-outline" size={18} color={Stage.goldSoft} />
            <View style={styles.flex}>
              <Text style={styles.writeTitle}>캡처가 없다면? 상황만 적어도 돼요</Text>
              <Text style={styles.writeBody}>「소개팅 다음 날 먼저 연락해도 될까?」처럼</Text>
            </View>
            <Ionicons name="chevron-down" size={18} color={Stage.textDim} />
          </PressableScale>
        )}

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
      </KeyboardAvoidingView>
      {/* 내려가면 하얀 예시 카드가 시계·배터리 뒤로 비치지 않게 짙은 띠를 깐다 */}
      <StatusBarScrim height={insets.top} color={Stage.bg[1]} visible={scrolled} />
      <FocusStatusBar style="light" />
      <StartConsentSheet visible={asking != null} onAgree={onAgree} onClose={() => setAsking(null)} />
    </StageBackground>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { flexGrow: 1, paddingHorizontal: Spacing.xl, gap: Spacing.lg, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  brandRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  brandText: { fontSize: 13, fontWeight: '800', color: Stage.text, letterSpacing: -0.2 },
  browse: { paddingHorizontal: Spacing.md, paddingVertical: 6, borderRadius: Radius.pill, backgroundColor: Stage.chip, borderWidth: 1, borderColor: Stage.chipBorder },
  browseText: { fontSize: 13, fontWeight: '700', color: Stage.text },
  hero: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md },
  heroTexts: { flex: 1, gap: Spacing.md },
  sub: { fontSize: 15, lineHeight: 22, fontWeight: '500', color: Stage.textDim },
  polaroids: { width: 104, paddingTop: Spacing.sm },
  heart: { position: 'absolute', right: -10, bottom: -24 },
  guide: { borderRadius: Radius.lg, backgroundColor: Stage.chip, borderWidth: 1, borderColor: Stage.chipBorder, padding: Spacing.lg, gap: Spacing.md },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  stepNum: { width: 28, height: 28, borderRadius: 14, backgroundColor: Stage.gold, alignItems: 'center', justifyContent: 'center' },
  stepNumText: { fontSize: 14, fontWeight: '900', color: Stage.onGold },
  stepTexts: { flex: 1, gap: 2 },
  stepTitle: { fontSize: 15, fontWeight: '800', color: Stage.text },
  stepBody: { fontSize: 13, lineHeight: 18, fontWeight: '500', color: Stage.textDim },
  cta: { gap: Spacing.sm },
  ctaNote: { fontSize: 12, fontWeight: '600', color: Stage.textFaint, textAlign: 'center' },
  glow: { position: 'absolute', left: 8, right: 8, top: 6, bottom: -6, borderRadius: Radius.md, backgroundColor: Stage.gold },
  writeRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, borderRadius: Radius.lg, borderWidth: 1, borderColor: Stage.chipBorder, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md },
  writeTitle: { fontSize: 14, fontWeight: '800', color: Stage.text },
  writeBody: { fontSize: 12, fontWeight: '500', color: Stage.textFaint, marginTop: 2 },
  ask: { borderRadius: Radius.lg, backgroundColor: Stage.chip, borderWidth: 1, borderColor: Stage.chipBorder, padding: Spacing.md, gap: Spacing.md },
  askTitle: { fontSize: 14, fontWeight: '800', color: Stage.text },
  askInput: { minHeight: 76, maxHeight: 180, textAlignVertical: 'top', padding: 0, fontSize: 16, lineHeight: 24, fontWeight: '500', color: Stage.text },
  examples: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs },
  example: { borderRadius: Radius.pill, borderWidth: 1, borderColor: Stage.chipBorder, paddingHorizontal: 10, paddingVertical: 6 },
  exampleText: { fontSize: 12, fontWeight: '600', color: Stage.textDim },
  reel: { width: '100%', gap: Spacing.xs, marginTop: Spacing.sm },
  reelLabel: { fontSize: 12, fontWeight: '700', color: Stage.textFaint, textAlign: 'center' },
  notice: { fontSize: 12, lineHeight: 17, fontWeight: '500', color: Stage.textFaint, textAlign: 'center', marginTop: Spacing.xs },
  link: { color: Stage.goldSoft, fontWeight: '700' },
});
