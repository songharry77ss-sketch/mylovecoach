import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Stack, useRouter } from 'expo-router';
import { useEffect, useRef, useState, type PropsWithChildren } from 'react';
import { BackHandler, Platform, Pressable, ScrollView, StyleSheet, View, useWindowDimensions, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  Extrapolation,
  cancelAnimation,
  interpolate,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { PressableScale } from '@/components/ui/pressable-scale';
import { MaxContentWidth, Radius, Shadow, Spacing, palette } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';
import { track } from '@/lib/analytics';
import { haptic } from '@/lib/haptics';
import { KKTI_AXES, KKTI_QUESTIONS, computeKkti, toSaved } from '@/lib/kkti';
import { useAppStore } from '@/store/app-store';

/**
 * KKTI 테스트 — 인트로 → 한 문제씩 카드 → 「결과 분석 중…」 → 결과 화면.
 * 고르면 톡 진동과 함께 카드가 옆으로 날아가고, 다음 카드가 튕기듯 들어온다.
 * 마지막 문제를 고르면 결과를 내 프로필에 저장해 두고 결과 링크(/kkti/result?a=…)로 넘어간다.
 */

type Phase = 'intro' | 'quiz' | 'analyzing';

const TOTAL = KKTI_QUESTIONS.length;
const AXIS_INDEX = KKTI_QUESTIONS.map((q) => KKTI_AXES.findIndex((a) => a.key === q.axis));
const LETTERS = ['A', 'B', 'C', 'D'];
const CHAT_TIMES = ['오후 10:42', '오후 11:07', '오전 1:13', '오후 9:58', '오후 7:21'];
/** 「결과 분석 중…」 연출 시간 */
const ANALYZE_MS = 2100;

/** 축(연락 시작·답장 속도·표현·진도)마다 배경을 살짝 바꿔, 문제가 넘어갈 때마다 분위기가 달라지게 */
const AXIS_TINT = {
  light: ['#EAF5FF', '#FFF6DA', '#FFEEF3', '#F0EBFF'],
  dark: ['#11202D', '#25200F', '#2A1520', '#1D1932'],
} as const;

const PERKS = [
  { emoji: '💘', title: '16가지 연애 유형', body: '선빠폭직? 후느담밀?' },
  { emoji: '🧬', title: '카톡 속 진짜 MBTI', body: '확신도 %까지' },
  { emoji: '🔢', title: '애니어그램 추정', body: '1~9번 중 나는?' },
  // 12문항의 답 조합 1,677만 개를 모두 계산해 보면 서로 다른 색이 5,610,943가지 나온다
  { emoji: '🎨', title: '나만의 연애 컬러', body: '560만 가지 색 중 하나' },
];

export default function KktiTestScreen() {
  const router = useRouter();
  const theme = useTheme();
  const [phase, setPhase] = useState<Phase>('intro');
  const [finalColor, setFinalColor] = useState<string>(palette.pink400);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    const list = timers.current;
    return () => list.forEach(clearTimeout);
  }, []);

  const start = () => {
    haptic.thud();
    track('kkti_start');
    setPhase('quiz');
  };

  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));

  const finish = (answers: number[]) => {
    const result = computeKkti(answers);
    // 내가 직접 끝낸 결과는 바로 프로필에 저장 (친구가 보낸 링크를 열었을 때는 저장하지 않는다)
    useAppStore.getState().setKkti(toSaved(result));
    track('kkti_complete', { code: result.code });
    setFinalColor(result.color.hex);
    setPhase('analyzing');
    timers.current.push(
      setTimeout(() => {
        router.replace({ pathname: '/kkti/result', params: { a: result.encoded } });
      }, ANALYZE_MS),
    );
  };

  return (
    <View style={[styles.flex, styles.clip, { backgroundColor: theme.background }]}>
      <Stack.Screen options={{ headerShown: false, title: 'KKTI · 카톡으로 보는 진짜 연애 MBTI' }} />
      {phase === 'intro' ? <Intro onStart={start} onClose={close} /> : null}
      {phase === 'quiz' ? <Quiz onExit={() => setPhase('intro')} onComplete={finish} /> : null}
      {phase === 'analyzing' ? <Analyzing color={finalColor} /> : null}
    </View>
  );
}

// ───────────────────────── 인트로 ─────────────────────────

function Intro({ onStart, onClose }: { onStart: () => void; onClose: () => void }) {
  const theme = useTheme();
  const scheme = useColorScheme();
  const insets = useSafeAreaInsets();
  const saved = useAppStore((s) => s.kkti);
  const gradient = scheme === 'dark' ? (['#3A2033', '#231D40', '#0F1419'] as const) : ([palette.pink100, palette.lavender100, palette.sky100] as const);

  return (
    <LinearGradient colors={gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.flex}>
      <View style={[styles.topBar, { paddingTop: insets.top + Spacing.sm }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="닫기"
          onPress={onClose}
          hitSlop={10}
          style={[styles.iconCircle, { backgroundColor: theme.surfaceElevated }]}>
          <Ionicons name="close" size={20} color={theme.text} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.introScroll} showsVerticalScrollIndicator={false}>
        <View style={styles.introInner}>
          <IntroHero />

          <PopIn delay={120}>
            <View style={[styles.badge, { backgroundColor: theme.surfaceElevated }]}>
              <AppText variant="caption" weight="800" color="accent">
                ⏱ 1분이면 끝 · 12문항 · 무료
              </AppText>
            </View>
          </PopIn>
          <PopIn delay={200}>
            <AppText style={[styles.kkti, { color: theme.text }]}>KKTI</AppText>
          </PopIn>
          <PopIn delay={260}>
            <AppText variant="title1" align="center">
              카톡으로 보는{'\n'}진짜 연애 MBTI
            </AppText>
          </PopIn>
          <AppText variant="body" color="textSecondary" align="center" style={styles.introDesc}>
            선톡, 답장 속도, 이모지 습관만 봐도 다 보여요.{'\n'}16가지 연애 유형부터 나만의 연애 컬러까지!
          </AppText>

          <View style={styles.perks}>
            {PERKS.map((p, i) => (
              <PopIn key={p.title} delay={340 + i * 70} style={styles.perkWrap}>
                <View style={[styles.perk, { backgroundColor: theme.surfaceElevated }]}>
                  <AppText style={styles.perkEmoji}>{p.emoji}</AppText>
                  <AppText variant="smallStrong" numberOfLines={1}>
                    {p.title}
                  </AppText>
                  <AppText variant="caption" color="textTertiary" numberOfLines={1}>
                    {p.body}
                  </AppText>
                </View>
              </PopIn>
            ))}
          </View>

          {saved ? (
            <View style={[styles.lastResult, { backgroundColor: theme.surfaceElevated }]}>
              <View style={[styles.lastDot, { backgroundColor: saved.color }]} />
              <AppText variant="small" color="textSecondary" style={styles.flexShrink}>
                지난 결과 {saved.emoji} {saved.name} ({saved.code}) · 다시 해 볼까요?
              </AppText>
            </View>
          ) : null}
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.lg }]}>
        <Button title="테스트 시작하기" variant="accent" haptic={false} onPress={onStart} icon={<Ionicons name="sparkles" size={18} color={palette.white} />} />
        <AppText variant="caption" color="textTertiary" align="center">
          가입 없이 바로 · 결과는 링크로 친구에게 공유할 수 있어요
        </AppText>
      </View>
    </LinearGradient>
  );
}

/** 말풍선들이 둥실둥실 떠다니는 인트로 그림 */
function IntroHero() {
  return (
    <View style={styles.hero}>
      <FloatingBubble text="뭐해?" delay={0} style={styles.bubbleA} />
      <FloatingBubble text="ㅋㅋㅋㅋㅋㅋ" delay={350} style={styles.bubbleB} />
      <FloatingBubble text="자니…?" delay={700} style={styles.bubbleC} />
      <FloatingBubble text="💕" delay={1050} style={styles.bubbleD} />
      <PopIn delay={0} from={0.3}>
        <LinearGradient colors={[palette.pink400, palette.lavender400]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.heroCircle}>
          <AppText style={styles.heroEmoji}>💬</AppText>
        </LinearGradient>
      </PopIn>
    </View>
  );
}

function FloatingBubble({ text, delay, style }: { text: string; delay: number; style: StyleProp<ViewStyle> }) {
  const theme = useTheme();
  const y = useSharedValue(0);
  useEffect(() => {
    y.value = withDelay(
      delay,
      withRepeat(
        withSequence(withTiming(-7, { duration: 1150, easing: Easing.inOut(Easing.sin) }), withTiming(7, { duration: 1150, easing: Easing.inOut(Easing.sin) })),
        -1,
        false,
      ),
    );
    return () => cancelAnimation(y);
  }, [delay, y]);
  const animated = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  return (
    <Animated.View style={[styles.floatBubble, { backgroundColor: theme.surfaceElevated }, style, animated]}>
      <AppText variant="smallStrong">{text}</AppText>
    </Animated.View>
  );
}

// ───────────────────────── 문제 카드 ─────────────────────────

function Quiz({ onComplete, onExit }: { onComplete: (answers: number[]) => void; onExit: () => void }) {
  const theme = useTheme();
  const scheme = useColorScheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  // 카드가 날아가는 거리
  const fly = Math.min(width, MaxContentWidth) * 1.1;

  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<number[]>([]);
  const [cheer, setCheer] = useState<{ id: number; text: string } | null>(null);
  // 카드가 넘어가는 동안 다른 선택을 막는다
  const busy = useRef(true);
  // 1 = 다음 문제(오른쪽에서 들어옴), -1 = 이전 문제(왼쪽에서 들어옴)
  const direction = useRef<1 | -1>(1);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const x = useSharedValue(fly * 0.55);
  const progress = useSharedValue(0);
  const tint = useSharedValue(AXIS_INDEX[0]);

  const later = (ms: number, fn: () => void) => {
    timers.current.push(setTimeout(fn, ms));
  };

  useEffect(() => {
    const list = timers.current;
    return () => list.forEach(clearTimeout);
  }, []);

  // 새 문제가 그려지면 카드가 튕기듯 들어온다
  useEffect(() => {
    x.value = withSequence(withTiming(direction.current * fly * 0.55, { duration: 0 }), withSpring(0, { damping: 13, stiffness: 180, mass: 0.9 }));
    progress.value = withSpring(index / TOTAL, { damping: 15, stiffness: 140 });
    tint.value = withTiming(AXIS_INDEX[index], { duration: 500 });
    busy.current = false;
    const landed = setTimeout(() => haptic.soft(), 150);
    return () => clearTimeout(landed);
  }, [index, fly, x, progress, tint]);

  const showCheer = (text: string) => {
    setCheer({ id: Date.now(), text });
    haptic.success();
    later(1600, () => setCheer(null));
  };

  const choose = (option: number) => {
    if (busy.current) return;
    busy.current = true;
    haptic.select();
    const next = [...answers];
    next[index] = option;
    setAnswers(next);
    progress.value = withSpring((index + 1) / TOTAL, { damping: 12, stiffness: 160 });
    // 고른 답이 잠깐 반짝 → 카드가 왼쪽으로 날아간다
    later(150, () => {
      x.value = withTiming(-fly, { duration: 230, easing: Easing.in(Easing.cubic) });
    });
    later(390, () => {
      if (index + 1 >= TOTAL) {
        onComplete(next);
        return;
      }
      const upcoming = index + 1;
      if (upcoming === TOTAL / 2) showCheer('벌써 절반! 🔥');
      else if (upcoming === TOTAL - 1) showCheer('마지막 문제 💘');
      direction.current = 1;
      setIndex(upcoming);
    });
  };

  const back = () => {
    if (busy.current) return;
    haptic.tap();
    if (index === 0) {
      onExit();
      return;
    }
    busy.current = true;
    x.value = withTiming(fly, { duration: 200, easing: Easing.in(Easing.cubic) });
    later(210, () => {
      direction.current = -1;
      setIndex(index - 1);
    });
  };

  // 안드로이드 뒤로 가기 버튼 → 이전 문제 (매 렌더마다 최신 back 으로 다시 건다)
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      back();
      return true;
    });
    return () => sub.remove();
  });

  const tints = AXIS_TINT[scheme];
  const bgStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(tint.value, [0, 1, 2, 3], [tints[0], tints[1], tints[2], tints[3]]),
  }));
  const barStyle = useAnimatedStyle(() => ({ width: `${Math.max(0, Math.min(1, progress.value)) * 100}%` }));
  const cardStyle = useAnimatedStyle(() => ({
    opacity: interpolate(Math.abs(x.value), [0, fly * 0.7], [1, 0], Extrapolation.CLAMP),
    transform: [
      { translateX: x.value },
      { rotate: `${interpolate(x.value, [-fly, 0, fly], [-14, 0, 14], Extrapolation.CLAMP)}deg` },
      { scale: interpolate(Math.abs(x.value), [0, fly], [1, 0.9], Extrapolation.CLAMP) },
    ],
  }));

  const question = KKTI_QUESTIONS[index];
  const axis = KKTI_AXES[AXIS_INDEX[index]];

  return (
    <Animated.View style={[styles.flex, styles.clip, bgStyle]}>
      <View style={[styles.quizHeader, { paddingTop: insets.top + Spacing.sm }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={index === 0 ? '처음 화면으로' : '이전 문제'}
          onPress={back}
          hitSlop={10}
          style={[styles.iconCircle, { backgroundColor: theme.surfaceElevated }]}>
          <Ionicons name="chevron-back" size={20} color={theme.text} />
        </Pressable>
        <View style={[styles.track, { backgroundColor: theme.surfaceElevated }]}>
          <Animated.View style={[styles.fill, barStyle]}>
            <LinearGradient colors={[palette.pink400, palette.lavender400, palette.sky400]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
          </Animated.View>
        </View>
        <AppText variant="smallStrong" color="textSecondary" style={styles.counter}>
          {index + 1}/{TOTAL}
        </AppText>
      </View>

      <ScrollView contentContainerStyle={[styles.quizScroll, { paddingBottom: insets.bottom + Spacing.xl }]} showsVerticalScrollIndicator={false}>
        <View style={styles.cheerRow}>
          {cheer ? (
            <PopIn key={cheer.id} from={0.5}>
              <View style={[styles.cheer, { backgroundColor: theme.accent }]}>
                <AppText variant="smallStrong" color={palette.white}>
                  {cheer.text}
                </AppText>
              </View>
            </PopIn>
          ) : null}
        </View>

        <Animated.View style={[styles.card, { backgroundColor: theme.surfaceElevated }, Shadow as ViewStyle, cardStyle]}>
          <View style={styles.cardHead}>
            <View style={[styles.qPill, { backgroundColor: theme.accentSoft }]}>
              <AppText variant="caption" color="accent" weight="800">
                Q{index + 1}
              </AppText>
            </View>
            <AppText variant="caption" color="textTertiary">
              {axis.emoji} {axis.label}
            </AppText>
          </View>

          {question.bubble ? <ChatBubble text={question.bubble} time={CHAT_TIMES[index % CHAT_TIMES.length]} /> : <AppText style={styles.qEmoji}>{question.emoji}</AppText>}

          <AppText variant="title2">{question.prompt}</AppText>

          <View style={styles.options}>
            {question.options.map((o, i) => (
              <OptionButton key={`${question.id}-${i}`} letter={LETTERS[i] ?? String(i + 1)} label={o.label} selected={answers[index] === i} onPress={() => choose(i)} />
            ))}
          </View>
        </Animated.View>
      </ScrollView>
    </Animated.View>
  );
}

/** 카톡처럼 생긴 상대 말풍선 */
function ChatBubble({ text, time }: { text: string; time: string }) {
  const theme = useTheme();
  return (
    <View style={styles.chatRow}>
      <View style={[styles.chatAvatar, { backgroundColor: theme.primarySoft }]}>
        <AppText style={styles.chatAvatarEmoji}>🙂</AppText>
      </View>
      <View style={styles.chatBody}>
        <AppText variant="caption" color="textSecondary">
          그 사람
        </AppText>
        <View style={styles.chatLine}>
          <View style={[styles.chatBubble, { backgroundColor: theme.surfaceSelected }]}>
            <AppText variant="bodyStrong">{text}</AppText>
          </View>
          <AppText variant="caption" color="textTertiary" style={styles.chatTime}>
            {time}
          </AppText>
        </View>
      </View>
    </View>
  );
}

function OptionButton({ letter, label, selected, onPress }: { letter: string; label: string; selected: boolean; onPress: () => void }) {
  const theme = useTheme();
  return (
    <PressableScale
      feedback={false}
      pressedScale={0.97}
      onPress={onPress}
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      style={[styles.option, { backgroundColor: selected ? theme.accentSoft : theme.surface, borderColor: selected ? theme.accent : theme.border }]}>
      <View style={[styles.optionKey, { backgroundColor: selected ? theme.accent : theme.surfaceSelected }]}>
        <AppText variant="caption" weight="800" color={selected ? palette.white : 'textSecondary'}>
          {letter}
        </AppText>
      </View>
      <AppText variant="body" style={styles.optionLabel}>
        {label}
      </AppText>
      {selected ? <Ionicons name="checkmark-circle" size={20} color={theme.accent} /> : null}
    </PressableScale>
  );
}

// ───────────────────────── 결과 분석 중 ─────────────────────────

const STEPS = ['선톡 습관 살펴보는 중…', '답장 속도 재는 중…', '이모지 개수 세는 중…', '밀당 지수 계산 중…', '나만의 연애 컬러 조색 중…'];

/** 두근두근 — 심장이 뛰고, 여러 색이 섞이다가 내 연애 컬러로 멈춘다 */
function Analyzing({ color }: { color: string }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const beat = useSharedValue(1);
  const ring = useSharedValue(0);
  const mix = useSharedValue(0);
  const [step, setStep] = useState(0);

  useEffect(() => {
    beat.value = withRepeat(
      withSequence(withTiming(1.2, { duration: 130 }), withTiming(1, { duration: 150 }), withTiming(1.1, { duration: 120 }), withTiming(1, { duration: 400 })),
      -1,
      false,
    );
    ring.value = withRepeat(withTiming(1, { duration: 800, easing: Easing.out(Easing.quad) }), -1, false);
    mix.value = withTiming(1, { duration: ANALYZE_MS - 250, easing: Easing.inOut(Easing.quad) });
    haptic.heartbeat();
    const beatTimer = setInterval(() => haptic.heartbeat(), 800);
    const stepTimer = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), Math.floor((ANALYZE_MS - 250) / STEPS.length));
    return () => {
      clearInterval(beatTimer);
      clearInterval(stepTimer);
      cancelAnimation(beat);
      cancelAnimation(ring);
      cancelAnimation(mix);
    };
  }, [beat, ring, mix]);

  const stops = [palette.pink400, palette.lavender400, palette.sky400, palette.mint500, palette.yellow500, color];
  const blobStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(mix.value, [0, 0.2, 0.4, 0.6, 0.8, 1], stops),
    transform: [{ scale: beat.value }],
  }));
  const ringStyle = useAnimatedStyle(() => ({
    opacity: 0.55 * (1 - ring.value),
    borderColor: interpolateColor(mix.value, [0, 0.2, 0.4, 0.6, 0.8, 1], stops),
    transform: [{ scale: 1 + ring.value * 0.9 }],
  }));

  return (
    <View style={[styles.analyzing, { backgroundColor: theme.background, paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={styles.blobBox}>
        <Animated.View style={[styles.ring, ringStyle]} />
        <Animated.View style={[styles.blob, blobStyle]}>
          <AppText style={styles.blobEmoji}>💗</AppText>
        </Animated.View>
      </View>
      <AppText variant="title1" align="center">
        결과 분석 중…
      </AppText>
      <PopIn key={step} from={0.85}>
        <AppText variant="body" color="textSecondary" align="center">
          {STEPS[step]}
        </AppText>
      </PopIn>
    </View>
  );
}

// ───────────────────────── 공통 ─────────────────────────

/** 작게 시작해 통통 튀며 나타난다 */
function PopIn({ delay = 0, from = 0.6, style, children }: PropsWithChildren<{ delay?: number; from?: number; style?: StyleProp<ViewStyle> }>) {
  const v = useSharedValue(0);
  useEffect(() => {
    v.value = withDelay(delay, withSpring(1, { damping: 11, stiffness: 170, mass: 0.8 }));
  }, [delay, v]);
  const animated = useAnimatedStyle(() => ({
    opacity: Math.min(1, Math.max(0, v.value * 1.6)),
    transform: [{ scale: from + (1 - from) * v.value }],
  }));
  return <Animated.View style={[style, animated]}>{children}</Animated.View>;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  flexShrink: { flexShrink: 1 },
  clip: { overflow: 'hidden' },
  topBar: { paddingHorizontal: Spacing.lg, flexDirection: 'row', width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  iconCircle: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },

  introScroll: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.lg },
  introInner: { width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center', alignItems: 'center', gap: Spacing.md },
  hero: { width: 280, height: 170, alignItems: 'center', justifyContent: 'center' },
  heroCircle: { width: 108, height: 108, borderRadius: 54, alignItems: 'center', justifyContent: 'center' },
  heroEmoji: { fontSize: 54, lineHeight: 66 },
  floatBubble: { position: 'absolute', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: Radius.lg },
  bubbleA: { left: 0, top: 18, borderBottomLeftRadius: 4 },
  bubbleB: { right: 0, top: 6, borderBottomRightRadius: 4 },
  bubbleC: { left: 14, bottom: 6, borderTopLeftRadius: 4 },
  bubbleD: { right: 22, bottom: 16, borderTopRightRadius: 4 },
  badge: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs + 2, borderRadius: Radius.pill },
  kkti: { fontSize: 64, lineHeight: 72, fontWeight: '900', letterSpacing: -1.5 },
  introDesc: { marginTop: -Spacing.xs },
  perks: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, width: '100%', marginTop: Spacing.sm },
  perkWrap: { flexBasis: '47%', flexGrow: 1 },
  perk: { borderRadius: Radius.lg, padding: Spacing.md, gap: 2 },
  perkEmoji: { fontSize: 22, lineHeight: 28 },
  lastResult: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: Radius.pill, maxWidth: '100%' },
  lastDot: { width: 14, height: 14, borderRadius: 7 },
  footer: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.sm, gap: Spacing.sm, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },

  quizHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingHorizontal: Spacing.lg, paddingBottom: Spacing.sm, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  track: { flex: 1, height: 10, borderRadius: 5, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 5, overflow: 'hidden' },
  counter: { minWidth: 40, textAlign: 'right' },
  quizScroll: { flexGrow: 1, paddingHorizontal: Spacing.lg, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  cheerRow: { height: 44, alignItems: 'center', justifyContent: 'center' },
  cheer: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.xs + 2, borderRadius: Radius.pill },
  card: { borderRadius: Radius.xl, padding: Spacing.xl, gap: Spacing.lg },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  qPill: { paddingHorizontal: Spacing.sm + 2, paddingVertical: 3, borderRadius: Radius.pill },
  qEmoji: { fontSize: 44, lineHeight: 54 },
  options: { gap: Spacing.sm },
  option: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, borderRadius: Radius.lg, borderWidth: 1.5, paddingHorizontal: Spacing.md, paddingVertical: Spacing.md + 2 },
  optionKey: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  optionLabel: { flex: 1 },

  chatRow: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'flex-start' },
  chatAvatar: { width: 36, height: 36, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  chatAvatarEmoji: { fontSize: 20, lineHeight: 26 },
  chatBody: { flex: 1, gap: 4 },
  chatLine: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, flexWrap: 'wrap' },
  chatBubble: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 1, borderRadius: 16, borderTopLeftRadius: 4, maxWidth: '82%' },
  chatTime: { fontSize: 10, lineHeight: 14 },

  analyzing: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.md, paddingHorizontal: Spacing.xl },
  blobBox: { width: 200, height: 200, alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.md },
  ring: { position: 'absolute', width: 132, height: 132, borderRadius: 66, borderWidth: 6 },
  blob: { width: 132, height: 132, borderRadius: 66, alignItems: 'center', justifyContent: 'center' },
  blobEmoji: { fontSize: 56, lineHeight: 68 },
});
