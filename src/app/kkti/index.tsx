import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react';
import { BackHandler, Platform, Pressable, ScrollView, StyleSheet, View, useWindowDimensions, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  Extrapolation,
  FadeInDown,
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

import { GradientButton } from '@/components/brand/brand';
import { AppText } from '@/components/ui/app-text';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Brand, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';
import { track } from '@/lib/analytics';
import { haptic } from '@/lib/haptics';
import { countKkti } from '@/lib/kkti-stat';
import { KKTI_AXES, KKTI_QUESTIONS, codeLetters, computeKkti, kktiFromCode, readableTextOn, toSaved, type KktiResult } from '@/lib/kkti';
import { useAppStore } from '@/store/app-store';

/**
 * KKTI 테스트 — 인트로 → 한 문제씩 카드 → 「결과 분석 중…」 → 결과 화면.
 * 고르면 톡 진동과 함께 카드가 옆으로 날아가고, 다음 카드가 들어온다.
 * 1.4 「깔끔하게」 개편: 흰 바탕. 입구는 큰 문장 두 줄 + 결과 예시 카드 한 장(「예시」 표시) + 버튼 하나 — 떠다니는 말풍선·유리 원·3D 하트·
 * 2×2 아이콘 타일·반짝 아이콘·바탕 그라데이션을 걷었다(공유 링크로 들어오는 첫 화면이라 「무엇·얼마나·무료」가 한눈에). 문항은 축마다 바뀌던 바탕색·이모지를 걷었다.
 * 마지막 문제를 고르면 결과를 내 프로필에 저장해 두고 결과 링크(/kkti/result?a=…)로 넘어간다.
 * 친구 결과를 보다가 들어왔으면(/kkti?w=친구답코드) 끝났을 때 그 친구와의 궁합까지 보여 준다.
 */

type Phase = 'intro' | 'quiz' | 'analyzing';

const TOTAL = KKTI_QUESTIONS.length;
/** 입구 예시 카드에 쓸 답 번호 */
const EXAMPLE_ANSWER = 1;
const AXIS_INDEX = KKTI_QUESTIONS.map((q) => KKTI_AXES.findIndex((a) => a.key === q.axis));
const LETTERS = ['A', 'B', 'C', 'D'];
const CHAT_TIMES = ['오후 10:42', '오후 11:07', '오전 1:13', '오후 9:58', '오후 7:21'];
/** 「결과 분석 중…」 연출 시간 */
const ANALYZE_MS = 2100;

/** 결과에 나오는 것 — 한 줄 글로(예전 2×2 아이콘 타일). 12문항의 답 조합 1,677만 개를 모두 계산해 보면 서로 다른 색이 5,610,943가지 나온다 */
const PERKS = '16가지 연애 유형 · 카톡 속 진짜 MBTI · 애니어그램 · 560만 가지 연애 컬러';
/** 입구의 결과 예시 — 실제 계산한 유형 카드(모든 문항에서 둘째 답 — 직진 불도저 · 살구 젤리) */
const EXAMPLE = computeKkti(KKTI_QUESTIONS.map(() => EXAMPLE_ANSWER));

export default function KktiTestScreen() {
  const router = useRouter();
  const theme = useTheme();
  const params = useLocalSearchParams<{ w?: string | string[] }>();
  const friendCode = Array.isArray(params.w) ? params.w[0] : params.w;
  // 링크를 보낸 친구의 결과 (코드가 잘못됐으면 혼자 하는 테스트로)
  const friend = useMemo(() => kktiFromCode(friendCode), [friendCode]);
  const [phase, setPhase] = useState<Phase>('intro');
  const [finalColor, setFinalColor] = useState<string>(Brand.violet);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    const list = timers.current;
    return () => list.forEach(clearTimeout);
  }, []);

  const start = () => {
    haptic.thud();
    track('kkti_start', { via: friend ? 'friend' : 'direct' });
    countKkti(friend ? 'start_friend' : 'start');
    setPhase('quiz');
  };

  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));

  const finish = (answers: number[]) => {
    const result = computeKkti(answers);
    // 내가 직접 끝낸 결과는 바로 프로필에 저장 (친구가 보낸 링크를 열었을 때는 저장하지 않는다)
    useAppStore.getState().setKkti(toSaved(result));
    track('kkti_complete', { code: result.code, via: friend ? 'friend' : 'direct' });
    countKkti(friend ? 'complete_friend' : 'complete');
    setFinalColor(result.color.hex);
    setPhase('analyzing');
    timers.current.push(
      setTimeout(() => {
        router.replace({ pathname: '/kkti/result', params: friend ? { a: result.encoded, w: friend.encoded } : { a: result.encoded } });
      }, ANALYZE_MS),
    );
  };

  return (
    <View style={[styles.flex, styles.clip, { backgroundColor: theme.background }]}>
      <Stack.Screen options={{ headerShown: false, title: 'KKTI · 카톡으로 보는 진짜 연애 MBTI' }} />
      {phase === 'intro' ? <Intro friend={friend} onStart={start} onClose={close} /> : null}
      {phase === 'quiz' ? <Quiz onExit={() => setPhase('intro')} onComplete={finish} /> : null}
      {phase === 'analyzing' ? <Analyzing color={finalColor} /> : null}
    </View>
  );
}

// ───────────────────────── 인트로 ─────────────────────────

function Intro({ friend, onStart, onClose }: { friend: KktiResult | null; onStart: () => void; onClose: () => void }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const saved = useAppStore((s) => s.kkti);
  const dark = useColorScheme() === 'dark';
  const fill = dark ? theme.surfaceElevated : theme.surface;
  const enter = (step: number) => FadeInDown.delay(step * 50).duration(300);

  return (
    <View style={[styles.flex, { backgroundColor: theme.background }]}>
      <View style={[styles.topBar, { paddingTop: insets.top + Spacing.sm }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="닫기" onPress={onClose} hitSlop={10} style={[styles.iconCircle, { backgroundColor: fill }]}>
          <Ionicons name="close" size={20} color={theme.text} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.introScroll} showsVerticalScrollIndicator={false}>
        <View style={styles.introInner}>
          {friend ? (
            <Animated.View entering={enter(0)} style={[styles.friendInvite, { backgroundColor: fill }]}>
              <View style={[styles.friendDot, { backgroundColor: friend.color.hex }]}>
                <AppText style={styles.friendEmoji}>{friend.type.emoji}</AppText>
              </View>
              <View style={styles.flexShrink}>
                <AppText variant="smallStrong">「{friend.type.name}」 친구가 기다리고 있어요</AppText>
                <AppText variant="caption" color="textSecondary">
                  테스트를 끝내면 둘의 카톡 궁합이 나와요
                </AppText>
              </View>
            </Animated.View>
          ) : null}

          {/* 큰 문장 두 줄 + 무엇·얼마나·무료 */}
          <Animated.View entering={enter(1)} style={styles.introHead}>
            <AppText variant="smallStrong" color="textSecondary">
              KKTI
            </AppText>
            <AppText style={[styles.introTitle, { color: theme.text }]} accessibilityRole="header">
              {'카톡으로 보는\n진짜 연애 MBTI'}
            </AppText>
            <AppText variant="body" color="textSecondary">
              1분이면 끝 · 12문항 · 무료
            </AppText>
          </Animated.View>

          {/* 결과 예시 — 실제 유형 카드 모양(공유 그림과 같은 색 카드) + 「예시」 */}
          <Animated.View entering={enter(2)}>
            <ExampleCard />
          </Animated.View>

          <Animated.View entering={enter(3)} style={styles.introNotes}>
            <AppText variant="small" color="textSecondary">
              선톡, 답장 속도, 이모지 습관만 봐도 다 보여요.
            </AppText>
            <AppText variant="small" color="textSecondary">
              {PERKS}
            </AppText>
            {saved ? (
              <View style={styles.lastResult}>
                <View style={[styles.lastDot, { backgroundColor: saved.color }]} />
                <AppText variant="small" color="textSecondary" style={styles.flexShrink}>
                  지난 결과 {saved.name} ({saved.code}) · 다시 해 볼까요?
                </AppText>
              </View>
            ) : null}
          </Animated.View>
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.lg }]}>
        <GradientButton title={friend ? '테스트하고 궁합 보기' : '테스트 시작하기'} haptic={false} onPress={onStart} />
        <AppText variant="caption" color="textSecondary" align="center">
          {friend ? '가입 없이 바로 · 1분이면 둘의 궁합이 나와요' : '가입 없이 바로 · 결과를 친구에게 보내면 둘의 궁합이 나와요'}
        </AppText>
      </View>
    </View>
  );
}

/** 결과 예시 카드 — 결과 화면 맨 위 유형 카드를 작게(유형색 면 + 네 글자 + 이름 + 한 줄). 색은 공유 그림의 내용이라 남긴다 */
function ExampleCard() {
  const { type, color } = EXAMPLE;
  const ink = readableTextOn(color.hex);
  const inkSoft = ink === '#FFFFFF' ? 'rgba(255,255,255,0.86)' : 'rgba(20,21,24,0.74)';
  const glass = ink === '#FFFFFF' ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.5)';
  return (
    <View
      style={[styles.example, { backgroundColor: color.hex }]}
      accessible
      accessibilityLabel={`결과 예시: ${type.name}, ${EXAMPLE.code}. ${type.oneLiner}`}>
      <View style={styles.exampleTop}>
        <View style={[styles.examplePill, { backgroundColor: glass }]}>
          <AppText variant="caption" weight="700" color={ink}>
            예시
          </AppText>
        </View>
        <AppText variant="caption" weight="600" color={inkSoft}>
          KKTI 연애 유형
        </AppText>
      </View>
      <View style={styles.exampleLetters}>
        {codeLetters(EXAMPLE.code).map((letter, i) => (
          <View key={i} style={[styles.exampleLetter, { backgroundColor: glass }]}>
            <AppText style={[styles.exampleLetterText, { color: ink }]}>{letter}</AppText>
          </View>
        ))}
      </View>
      <AppText variant="title2" color={ink}>
        {type.name}
      </AppText>
      <AppText variant="small" color={inkSoft} numberOfLines={2}>
        {type.oneLiner}
      </AppText>
    </View>
  );
}

// ───────────────────────── 문제 카드 ─────────────────────────

function Quiz({ onComplete, onExit }: { onComplete: (answers: number[]) => void; onExit: () => void }) {
  const theme = useTheme();
  const dark = useColorScheme() === 'dark';
  const fill = dark ? theme.surfaceElevated : theme.surface;
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

  const later = (ms: number, fn: () => void) => {
    timers.current.push(setTimeout(fn, ms));
  };

  useEffect(() => {
    const list = timers.current;
    return () => list.forEach(clearTimeout);
  }, []);

  // 새 문제가 그려지면 카드가 미끄러져 들어온다
  useEffect(() => {
    x.value = withSequence(withTiming(direction.current * fly * 0.55, { duration: 0 }), withSpring(0, { damping: 18, stiffness: 200, mass: 0.9 }));
    progress.value = withTiming(index / TOTAL, { duration: 300 });
    busy.current = false;
    const landed = setTimeout(() => haptic.soft(), 150);
    return () => clearTimeout(landed);
  }, [index, fly, x, progress]);

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
    progress.value = withTiming((index + 1) / TOTAL, { duration: 300 });
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
      if (upcoming === TOTAL / 2) showCheer('벌써 절반!');
      else if (upcoming === TOTAL - 1) showCheer('마지막 문제예요');
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
    <View style={[styles.flex, styles.clip, { backgroundColor: theme.background }]}>
      <View style={[styles.quizHeader, { paddingTop: insets.top + Spacing.sm }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={index === 0 ? '처음 화면으로' : '이전 문제'}
          onPress={back}
          hitSlop={10}
          style={[styles.iconCircle, { backgroundColor: fill }]}>
          <Ionicons name="chevron-back" size={20} color={theme.text} />
        </Pressable>
        {/* 진행 막대 — 가는 단색(진행 중 표시는 센딧 파랑) */}
        <View style={[styles.track, { backgroundColor: fill }]}>
          <Animated.View style={[styles.fill, { backgroundColor: theme.primary }, barStyle]} />
        </View>
        <AppText variant="smallStrong" color="textSecondary" style={styles.counter}>
          {index + 1}/{TOTAL}
        </AppText>
      </View>

      <ScrollView contentContainerStyle={[styles.quizScroll, { paddingBottom: insets.bottom + Spacing.xl }]} showsVerticalScrollIndicator={false}>
        <View style={styles.cheerRow}>
          {cheer ? (
            <PopIn key={cheer.id} from={0.85}>
              <View style={[styles.cheer, { backgroundColor: theme.text }]}>
                <AppText variant="smallStrong" color={theme.background}>
                  {cheer.text}
                </AppText>
              </View>
            </PopIn>
          ) : null}
        </View>

        <Animated.View style={[styles.card, cardStyle]}>
          <AppText variant="caption" color="textSecondary" weight="600">
            Q{index + 1} · {axis.label}
          </AppText>

          {question.bubble ? <ChatBubble text={question.bubble} time={CHAT_TIMES[index % CHAT_TIMES.length]} /> : null}

          <AppText variant="title2">{question.prompt}</AppText>

          <View style={styles.options}>
            {question.options.map((o, i) => (
              <OptionButton key={`${question.id}-${i}`} letter={LETTERS[i] ?? String(i + 1)} label={o.label} selected={answers[index] === i} onPress={() => choose(i)} />
            ))}
          </View>
        </Animated.View>
      </ScrollView>
    </View>
  );
}

/** 카톡처럼 생긴 상대 말풍선 */
function ChatBubble({ text, time }: { text: string; time: string }) {
  const theme = useTheme();
  const fill = useColorScheme() === 'dark' ? theme.surfaceElevated : theme.surface;
  return (
    <View style={styles.chatRow}>
      <View style={[styles.chatAvatar, { backgroundColor: theme.primarySoft }]}>
        <AppText style={[styles.chatAvatarText, { color: theme.primary }]}>그</AppText>
      </View>
      <View style={styles.chatBody}>
        <AppText variant="caption" color="textSecondary">
          그 사람
        </AppText>
        <View style={styles.chatLine}>
          <View style={[styles.chatBubble, { backgroundColor: fill }]}>
            <AppText variant="body">{text}</AppText>
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
  const fill = useColorScheme() === 'dark' ? theme.surfaceElevated : theme.surface;
  return (
    <PressableScale
      feedback={false}
      pressedScale={0.98}
      onPress={onPress}
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      style={[styles.option, { backgroundColor: fill, borderColor: selected ? theme.text : 'transparent' }]}>
      <View style={[styles.optionKey, { backgroundColor: selected ? theme.text : theme.background }]}>
        <AppText variant="caption" weight="700" color={selected ? theme.background : theme.textSecondary}>
          {letter}
        </AppText>
      </View>
      <AppText variant="body" weight={selected ? '600' : undefined} style={styles.optionLabel}>
        {label}
      </AppText>
      {selected ? <Ionicons name="checkmark" size={20} color={theme.text} /> : null}
    </PressableScale>
  );
}

// ───────────────────────── 결과 분석 중 ─────────────────────────

const STEPS = ['선톡 습관 살펴보는 중…', '답장 속도 재는 중…', '이모지 개수 세는 중…', '밀당 지수 계산 중…', '나만의 연애 컬러 조색 중…'];

/** 두근두근 — 심장이 뛰고, 회색에서 내 연애 컬러로 물든다 */
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

  // 회색(무채색)에서 시작해 내 연애 컬러로 물든다 — 여러 색을 섞던 연출은 걷었다
  const stops = [theme.textTertiary, color];
  const blobStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(mix.value, [0, 1], stops),
    transform: [{ scale: beat.value }],
  }));
  const ringStyle = useAnimatedStyle(() => ({
    opacity: 0.45 * (1 - ring.value),
    borderColor: interpolateColor(mix.value, [0, 1], stops),
    transform: [{ scale: 1 + ring.value * 0.7 }],
  }));

  return (
    <View style={[styles.analyzing, { backgroundColor: theme.background, paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={styles.blobBox}>
        <Animated.View style={[styles.ring, ringStyle]} />
        <Animated.View style={[styles.blob, blobStyle]}>
          <Ionicons name="heart" size={58} color={Brand.onBrand} />
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

  introScroll: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: Spacing.lg, paddingTop: Spacing.sm, paddingBottom: Spacing.lg },
  introInner: { width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center', gap: Spacing.xl },
  introHead: { gap: Spacing.xs },
  introTitle: { fontSize: 28, lineHeight: 36, fontWeight: '700', letterSpacing: -0.7 },
  introNotes: { gap: Spacing.xs },
  example: { borderRadius: 24, padding: Spacing.lg + 2, gap: Spacing.sm },
  exampleTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.xs },
  examplePill: { paddingHorizontal: Spacing.sm + 2, paddingVertical: 3, borderRadius: Radius.pill },
  exampleLetters: { flexDirection: 'row', gap: 6 },
  exampleLetter: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  exampleLetterText: { fontSize: 22, lineHeight: 28, fontWeight: '700' },
  lastResult: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.xs },
  lastDot: { width: 12, height: 12, borderRadius: 6 },
  friendInvite: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, borderRadius: 20, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 2 },
  friendDot: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  friendEmoji: { fontSize: 24, lineHeight: 30 },
  footer: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.sm, gap: Spacing.sm, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },

  quizHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingHorizontal: Spacing.lg, paddingBottom: Spacing.sm, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  track: { flex: 1, height: 6, borderRadius: 3, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 3 },
  counter: { minWidth: 40, textAlign: 'right' },
  quizScroll: { flexGrow: 1, paddingHorizontal: Spacing.lg, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  cheerRow: { height: 44, alignItems: 'center', justifyContent: 'center' },
  cheer: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.xs + 2, borderRadius: Radius.pill, overflow: 'hidden' },
  card: { paddingVertical: Spacing.sm, gap: Spacing.lg },
  options: { gap: Spacing.sm },
  option: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, borderRadius: 18, borderWidth: 1.5, paddingHorizontal: Spacing.md, paddingVertical: Spacing.md + 2, minHeight: 56 },
  optionKey: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  optionLabel: { flex: 1 },

  chatRow: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'flex-start' },
  chatAvatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  chatAvatarText: { fontSize: 15, lineHeight: 20, fontWeight: '700' },
  chatBody: { flex: 1, gap: 4 },
  chatLine: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, flexWrap: 'wrap' },
  chatBubble: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 1, borderRadius: 18, borderTopLeftRadius: 6, maxWidth: '82%' },
  chatTime: { fontSize: 12, lineHeight: 16 },

  analyzing: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.md, paddingHorizontal: Spacing.xl },
  blobBox: { width: 200, height: 200, alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.md },
  ring: { position: 'absolute', width: 132, height: 132, borderRadius: 66, borderWidth: 6 },
  blob: { width: 132, height: 132, borderRadius: 66, alignItems: 'center', justifyContent: 'center' },
});
