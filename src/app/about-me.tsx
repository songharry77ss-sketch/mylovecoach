import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { BackHandler, KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { Easing, FadeInUp, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { StageBackground } from '@/components/stage/stage';
import { Button } from '@/components/ui/button';
import { FocusStatusBar } from '@/components/ui/system-bars';
import { MaxContentWidth, Radius, Spacing, Stage } from '@/constants/theme';
import { useKeyboardVisible } from '@/hooks/use-keyboard';
import { track } from '@/lib/analytics';
import { haptic } from '@/lib/haptics';
import { josa } from '@/lib/kkti';
import { MBTI_LIST, MY_GOALS, VIBE_TAGS } from '@/lib/labels';
import type { Gender, UserProfile } from '@/lib/types';
import { useAppStore } from '@/store/app-store';

/** 묻는 순서 — 하나씩 묻고, 고르면 바로 다음으로 넘어간다 */
export const ABOUT_ME_STEPS = ['name', 'gender', 'age', 'mbti', 'vibes', 'goal'] as const;
type Step = (typeof ABOUT_ME_STEPS)[number];

interface Answers {
  name?: string;
  gender?: Gender;
  age?: number;
  mbti?: string;
  vibes?: string[];
  goal?: string;
}

interface Line {
  id: number;
  from: 'coach' | 'me';
  text: string;
  /** 건너뛴 답 — 흐리게 보인다 */
  skipped?: boolean;
}

/** 코치가 「입력 중…」을 보여 주는 시간 (너무 길면 답답하고, 없으면 기계 같다) */
export const TYPING_MS = 480;
/** 말풍선 사이 쉬는 시간 */
const GAP_MS = 160;
const MAX_VIBES = 3;

function introOf(knownName: string | undefined): string[] {
  return knownName
    ? [`다시 반가워요, ${knownName}님! 💘`, '답장을 더 「나답게」 만들려고 몇 가지만 더 물어볼게요. 모르는 건 건너뛰어도 돼요.']
    : ['안녕하세요! 오늘부터 함께할 연애 코치예요 💘', '답장을 「나답게」 만들려고 몇 가지만 물어볼게요. 30초면 끝나고, 모르는 건 건너뛰어도 돼요.'];
}

/** 이미 알고 있는 항목 — 홈·마이에서 다시 열면 묻지 않는다 */
function knownOf(step: Step, user: UserProfile | null): boolean {
  if (!user) return false;
  switch (step) {
    case 'name':
      return Boolean(user.name?.trim());
    case 'gender':
      return user.gender !== 'other';
    case 'age':
      return user.age != null;
    case 'mbti':
      return Boolean(user.mbti);
    case 'vibes':
      return Boolean(user.vibes?.length);
    case 'goal':
      return Boolean(user.goal);
  }
}

function questionOf(step: Step, a: Answers): string {
  switch (step) {
    case 'name':
      return '뭐라고 불러 드릴까요?';
    case 'gender':
      return a.name ? `반가워요, ${a.name}님! 😊\n성별을 알려 주실래요?` : '성별을 알려 주실래요?';
    case 'age':
      return '나이는요? 또래 말투에 맞춰 답장을 만드는 데 써요.';
    case 'mbti':
      return 'MBTI 알고 있어요? 몰라도 괜찮아요.';
    case 'vibes':
      return `상대에게 어떤 사람으로 보이고 싶어요?\n${MAX_VIBES}개까지 골라 주세요 ✨`;
    case 'goal':
      return '마지막이에요! 지금 연애 목표는요? 🎯';
  }
}

const filledCount = (a: Answers) => [a.name, a.gender, a.age, a.mbti, a.vibes?.length ? 'v' : '', a.goal].filter(Boolean).length;

function endingOf(a: Answers, fromHome: boolean, knownName: string | undefined): string[] {
  const name = a.name ?? knownName;
  const who = name ? `, ${name}님` : '';
  if (filledCount(a) === 0) return ['괜찮아요! 언제든 마이 → 내 프로필에서 알려 주세요.', ...(fromHome ? [] : ['그럼 바로 답장이 고민되는 대화를 보여 주세요 📸'])];
  return [`좋아요${who}! 알려 주신 대로 「나다운」 말투로 답장을 만들어 드릴게요 ✨`, fromHome ? '다음 답장부터 바로 반영돼요 💌' : '이제 답장이 고민되는 대화를 보여 주세요 📸'];
}

/**
 * 처음 실행 2단계 — 「나에 대해 알려주세요」를 코치와 나누는 첫 대화로 묻는다.
 * 한 번에 한 가지만 묻고, 고르면 바로 다음 질문으로 넘어간다. 질문마다 「건너뛰기」, 위에는 언제든 「나중에 할게요」.
 * 답한 만큼만 내 프로필(마이 → 내 프로필)에 저장하고 첫 캡처 화면으로 간다.
 * 앱 안(홈·마이의 「나에 대해 알려주세요」)에서 열면(?from=home|my) 이미 아는 항목은 묻지 않고, 끝나면 연 화면으로 돌아간다.
 * 안드로이드 뒤로 가기는 「나중에 할게요」와 같다 (이미 답한 건 저장).
 */
export default function AboutMe() {
  const router = useRouter();
  const from = useLocalSearchParams<{ from?: string }>().from;
  const fromHome = from === 'home' || from === 'my';
  const insets = useSafeAreaInsets();
  const keyboardVisible = useKeyboardVisible();
  const user = useAppStore((s) => s.user);
  const setUser = useAppStore((s) => s.setUser);
  // 물을 질문 — 처음 실행이면 전부, 앱 안에서 다시 열면 아직 모르는 것만 (처음 연 순간 기준으로 고정)
  const [steps] = useState<Step[]>(() => (fromHome ? ABOUT_ME_STEPS.filter((k) => !knownOf(k, useAppStore.getState().user)) : [...ABOUT_ME_STEPS]));
  const [knownName] = useState(() => (fromHome ? useAppStore.getState().user?.name?.trim() || undefined : undefined));

  const [lines, setLines] = useState<Line[]>([]);
  const [typing, setTyping] = useState(false);
  // 지금 묻는 질문 (steps.length 면 끝)
  const [step, setStep] = useState(0);
  // 질문 말풍선이 다 나온 뒤에 답하는 칸을 연다
  const [ready, setReady] = useState(false);
  const [answers, setAnswers] = useState<Answers>({});
  const [draft, setDraft] = useState('');
  const [vibes, setVibes] = useState<string[]>([]);
  const nextId = useRef(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const scroller = useRef<ScrollView>(null);
  // 「나중에 할게요」·「완료」·뒤로 가기를 빠르게 두 번 눌러도 한 번만 나간다
  const leaving = useRef(false);
  const done = step >= steps.length;
  const current: Step | undefined = steps[step];

  const push = (from: Line['from'], text: string, skipped?: boolean) => setLines((prev) => [...prev, { id: nextId.current++, from, text, skipped }]);

  /** 코치가 한 줄씩 「입력 중…」 뒤에 말한다. 다 말하면 답하는 칸을 연다 */
  const say = (texts: string[]) => {
    setReady(false);
    let at = 0;
    texts.forEach((text, i) => {
      timers.current.push(setTimeout(() => setTyping(true), at));
      at += TYPING_MS;
      timers.current.push(
        setTimeout(() => {
          setTyping(false);
          push('coach', text);
          if (i === texts.length - 1) setReady(true);
        }, at),
      );
      at += GAP_MS;
    });
  };

  useEffect(() => {
    track('onboarding', { step: 'profile', action: 'open' });
    say([...introOf(knownName), ...(steps.length ? [questionOf(steps[0], {})] : endingOf({}, fromHome, knownName))]);
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
    // 처음 한 번만
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** 답하기 (display 가 없으면 건너뛰기) — 내 말풍선을 남기고 다음 질문으로 */
  const answer = (display: string | null, patch: Partial<Answers> = {}) => {
    if (!current || !ready) return;
    haptic.select();
    const next = { ...answers, ...patch };
    setAnswers(next);
    push('me', display ?? '건너뛸게요', display == null);
    // 「잘 몰라요」처럼 값 없이 답한 것도 건너뛴 것으로 센다
    track('onboarding', { step: 'profile_q', q: current, action: Object.keys(patch).length ? 'answer' : 'skip' });
    setDraft('');
    const following = step + 1;
    setStep(following);
    say(following < steps.length ? [questionOf(steps[following], next)] : endingOf(next, fromHome, knownName));
  };

  /** 끝내기 — 답한 만큼만 저장하고 첫 캡처 화면으로 (중간에 「나중에 할게요」를 눌러도 이미 답한 건 남긴다) */
  const finish = (via: 'done' | 'later' | 'back') => {
    if (leaving.current) return;
    leaving.current = true;
    haptic.tap();
    timers.current.forEach(clearTimeout);
    const filled = filledCount(answers);
    if (filled > 0) {
      setUser({
        name: answers.name ?? user?.name ?? '',
        gender: answers.gender ?? user?.gender ?? 'other',
        age: answers.age ?? user?.age,
        mbti: answers.mbti ?? user?.mbti,
        style: user?.style ?? [],
        defaultTone: user?.defaultTone ?? 'natural',
        about: user?.about,
        vibes: answers.vibes ?? user?.vibes ?? [],
        goal: answers.goal ?? user?.goal,
        emoji: user?.emoji ?? 'on',
        createdAt: user?.createdAt ?? Date.now(),
      });
    }
    track('onboarding', { step: 'profile', action: filled ? 'save' : 'skip', filled, via, answered: Math.min(step, steps.length), ...(fromHome ? { from } : {}) });
    if (fromHome) router.back();
    else router.replace('/start');
  };

  // 안드로이드 뒤로 가기 = 「나중에 할게요」 (답한 건 남기고 나간다)
  const finishRef = useRef(finish);
  finishRef.current = finish;
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      finishRef.current('back');
      return true;
    });
    return () => sub.remove();
  }, []);

  const sendText = () => {
    const value = draft.trim();
    if (!value) return;
    if (current === 'name') answer(`${value}${josa(value, '이라고', '라고')} 불러 주세요`, { name: value.slice(0, 20) });
    else if (current === 'age') {
      const age = Number(value);
      if (Number.isFinite(age) && age > 0) answer(`${age}살이에요`, { age });
    }
  };

  const toggleVibe = (v: string) => {
    haptic.select();
    setVibes((prev) => (prev.includes(v) ? prev.filter((x) => x !== v) : prev.length >= MAX_VIBES ? [...prev.slice(1), v] : [...prev, v]));
  };

  return (
    <StageBackground>
      {/* 안드로이드도 화면 끝까지 그리는 방식이라 adjustResize 만으로는 입력칸이 올라오지 않는다 — 채팅방처럼 두 기기 모두 padding */}
      <KeyboardAvoidingView style={styles.flex} behavior="padding">
        <View style={[styles.head, { paddingTop: insets.top + Spacing.md }]}>
          <View style={styles.headRow}>
            <View style={styles.coachId}>
              <CoachAvatar />
              <View>
                <Text style={styles.coachName}>연애 코치</Text>
                <Text style={styles.coachSub}>{typing ? '입력 중…' : '보통 30초면 끝나요'}</Text>
              </View>
            </View>
            {!done ? (
              <Pressable accessibilityRole="button" accessibilityLabel="나에 대해 알려주기 나중에 하기" onPress={() => finish('later')} hitSlop={12} style={styles.skip}>
                <Text style={styles.skipText}>나중에 할게요</Text>
              </Pressable>
            ) : null}
          </View>
          <View style={styles.progress} accessibilityLabel={`질문 ${steps.length}개 중 ${Math.min(step, steps.length)}개 답함`}>
            {steps.map((s, i) => (
              <View key={s} style={[styles.seg, i < step ? styles.segOn : i === step ? styles.segNow : null]} />
            ))}
          </View>
        </View>

        <ScrollView
          ref={scroller}
          style={styles.flex}
          contentContainerStyle={styles.chat}
          onContentSizeChange={() => scroller.current?.scrollToEnd({ animated: true })}
          // 답하는 칸이 커지면(추구미·MBTI) 대화 칸이 줄어드니 마지막 질문이 가려지지 않게 다시 내린다
          onLayout={() => scroller.current?.scrollToEnd({ animated: false })}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          {lines.map((line, i) =>
            line.from === 'coach' ? (
              <Animated.View key={line.id} entering={FadeInUp.duration(260)} style={styles.coachRow}>
                {/* 이어지는 코치 말풍선은 얼굴을 한 번만 */}
                {lines[i - 1]?.from === 'coach' ? <View style={styles.avatarGap} /> : <CoachAvatar />}
                <View style={[styles.bubble, styles.coachBubble]}>
                  <Text style={styles.coachText}>{line.text}</Text>
                </View>
              </Animated.View>
            ) : (
              <Animated.View key={line.id} entering={FadeInUp.duration(220)} style={styles.meRow}>
                <View style={[styles.bubble, line.skipped ? styles.skippedBubble : styles.meBubble]}>
                  <Text style={line.skipped ? styles.skippedText : styles.meText}>{line.text}</Text>
                </View>
              </Animated.View>
            ),
          )}
          {typing ? (
            <View style={styles.coachRow}>
              {lines[lines.length - 1]?.from === 'coach' ? <View style={styles.avatarGap} /> : <CoachAvatar />}
              <View style={[styles.bubble, styles.coachBubble, styles.typingBubble]} accessibilityLabel="코치가 입력 중">
                {[0, 1, 2].map((d) => (
                  <TypingDot key={d} index={d} />
                ))}
              </View>
            </View>
          ) : null}
        </ScrollView>

        <View style={[styles.dock, { paddingBottom: (keyboardVisible ? 0 : insets.bottom) + Spacing.md }]}>
          {ready && current === 'name' ? (
            <Animated.View entering={FadeInUp.duration(220)} style={styles.dockInner}>
              <InputRow value={draft} onChange={setDraft} onSend={sendText} placeholder="이름이나 별명 (예: 지은)" label="부를 이름" maxLength={20} />
              <SkipChip onPress={() => answer(null)} />
            </Animated.View>
          ) : ready && current === 'gender' ? (
            <Animated.View entering={FadeInUp.duration(220)} style={[styles.dockInner, styles.wrap]}>
              <Choice label="여자예요" big onPress={() => answer('여자예요', { gender: 'female' })} />
              <Choice label="남자예요" big onPress={() => answer('남자예요', { gender: 'male' })} />
              <SkipChip onPress={() => answer(null)} />
            </Animated.View>
          ) : ready && current === 'age' ? (
            <Animated.View entering={FadeInUp.duration(220)} style={styles.dockInner}>
              <InputRow value={draft} onChange={(v) => setDraft(v.replace(/[^0-9]/g, '').replace(/^0+/, ''))} onSend={sendText} placeholder="예: 25" label="나이" maxLength={2} numeric />
              <SkipChip onPress={() => answer(null)} />
            </Animated.View>
          ) : ready && current === 'mbti' ? (
            <Animated.View entering={FadeInUp.duration(220)} style={styles.dockInner}>
              <View style={styles.mbtiGrid}>
                {MBTI_LIST.map((m) => (
                  <Choice key={m} label={m} grid onPress={() => answer(m, { mbti: m })} />
                ))}
              </View>
              <Choice label="잘 몰라요" onPress={() => answer('잘 몰라요')} wide />
            </Animated.View>
          ) : ready && current === 'vibes' ? (
            <Animated.View entering={FadeInUp.duration(220)} style={styles.dockInner}>
              {/* 글씨를 크게 쓰는 작은 화면에서도 「N개 골랐어요」가 밀려나지 않게 칩만 스크롤 */}
              <ScrollView style={styles.chipScroll} contentContainerStyle={styles.wrap} showsVerticalScrollIndicator={false}>
                {VIBE_TAGS.map((v) => (
                  <Choice key={v} label={v} selected={vibes.includes(v)} onPress={() => toggleVibe(v)} />
                ))}
              </ScrollView>
              <View style={styles.dockActions}>
                <SkipChip onPress={() => answer(null)} />
                <View style={styles.flex}>
                  <Button
                    title={vibes.length ? `${vibes.length}개 골랐어요` : `${MAX_VIBES}개까지 골라 주세요`}
                    variant="gold"
                    size="md"
                    disabled={!vibes.length}
                    onPress={() => answer(vibes.join(' · '), { vibes })}
                  />
                </View>
              </View>
            </Animated.View>
          ) : ready && current === 'goal' ? (
            <Animated.View entering={FadeInUp.duration(220)} style={[styles.dockInner, styles.wrap]}>
              {MY_GOALS.map((g) => (
                <Choice key={g} label={g} onPress={() => answer(g, { goal: g })} />
              ))}
              <SkipChip onPress={() => answer(null)} />
            </Animated.View>
          ) : ready && done ? (
            <Animated.View entering={FadeInUp.duration(260)} style={styles.dockInner}>
              <Button
                title={fromHome ? '완료' : '첫 캡처 올리러 가기'}
                variant="gold"
                onPress={() => finish('done')}
                icon={<Ionicons name={fromHome ? 'checkmark' : 'image'} size={18} color={Stage.onGold} />}
              />
              <Text style={styles.footnote}>알려 주신 내용은 마이 → 내 프로필에서 언제든 바꿀 수 있어요</Text>
            </Animated.View>
          ) : (
            <View style={styles.dockWaiting} />
          )}
        </View>
      </KeyboardAvoidingView>
      <FocusStatusBar style="light" />
    </StageBackground>
  );
}

function CoachAvatar() {
  return (
    <View style={styles.avatar}>
      <Ionicons name="heart" size={15} color={Stage.onGold} />
    </View>
  );
}

/** 「입력 중…」 점 세 개 — 차례로 밝아진다 */
function TypingDot({ index }: { index: number }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withRepeat(withTiming(1, { duration: 900, easing: Easing.linear }), -1);
  }, [t]);
  const style = useAnimatedStyle(() => {
    const p = (t.value + index / 3) % 1;
    return { opacity: p < 0.5 ? 0.3 + p * 1.4 : 1 - (p - 0.5) * 1.4 };
  });
  return <Animated.View style={[styles.dot, style]} />;
}

function InputRow({ value, onChange, onSend, placeholder, label, maxLength, numeric }: { value: string; onChange: (v: string) => void; onSend: () => void; placeholder: string; label: string; maxLength: number; numeric?: boolean }) {
  const can = value.trim().length > 0;
  return (
    <View style={styles.inputRow}>
      <TextInput
        value={value}
        onChangeText={onChange}
        onSubmitEditing={onSend}
        placeholder={placeholder}
        placeholderTextColor={Stage.textFaint}
        keyboardType={numeric ? 'number-pad' : 'default'}
        returnKeyType="send"
        maxLength={maxLength}
        autoFocus
        accessibilityLabel={label}
        style={styles.input}
      />
      <Pressable accessibilityRole="button" accessibilityLabel="보내기" accessibilityState={{ disabled: !can }} onPress={onSend} disabled={!can} style={[styles.send, !can && styles.sendOff]}>
        <Ionicons name="arrow-up" size={20} color={can ? Stage.onGold : Stage.textFaint} />
      </Pressable>
    </View>
  );
}

function SkipChip({ onPress }: { onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="이 질문 건너뛰기" onPress={onPress} hitSlop={6} style={styles.skipChip}>
      <Text style={styles.skipChipText}>건너뛰기</Text>
    </Pressable>
  );
}

/** 무대 화면용 답 칩 — 누르면 바로 답이 된다 (추구미만 골드로 켜지고 끔) */
function Choice({ label, selected, onPress, big, grid, wide }: { label: string; selected?: boolean; onPress: () => void; big?: boolean; grid?: boolean; wide?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={selected != null ? { selected } : undefined}
      onPress={onPress}
      style={({ pressed }) => [styles.choice, big && styles.choiceBig, grid && styles.choiceGrid, wide && styles.choiceWide, selected && styles.choiceOn, pressed && styles.pressed]}>
      <Text style={[styles.choiceText, big && styles.choiceTextBig, selected && styles.choiceTextOn]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  head: { paddingHorizontal: Spacing.xl, gap: Spacing.md, paddingBottom: Spacing.sm, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  headRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  coachId: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  coachName: { fontSize: 15, fontWeight: '800', color: Stage.text },
  coachSub: { fontSize: 12, fontWeight: '600', color: Stage.textFaint },
  skip: { paddingHorizontal: Spacing.md, paddingVertical: 6, borderRadius: Radius.pill, backgroundColor: Stage.chip, borderWidth: 1, borderColor: Stage.chipBorder },
  skipText: { fontSize: 13, fontWeight: '700', color: Stage.text },
  progress: { flexDirection: 'row', gap: 4 },
  seg: { flex: 1, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.14)' },
  segOn: { backgroundColor: Stage.gold },
  segNow: { backgroundColor: 'rgba(255,214,102,0.45)' },
  chat: { paddingHorizontal: Spacing.xl, paddingVertical: Spacing.lg, gap: Spacing.sm, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  coachRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  meRow: { flexDirection: 'row', justifyContent: 'flex-end', marginVertical: Spacing.xs },
  avatar: { width: 30, height: 30, borderRadius: 15, backgroundColor: Stage.gold, alignItems: 'center', justifyContent: 'center' },
  avatarGap: { width: 30 },
  bubble: { maxWidth: '82%', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10 },
  coachBubble: { backgroundColor: Stage.card, borderBottomLeftRadius: 6 },
  coachText: { fontSize: 15, lineHeight: 22, fontWeight: '600', color: Stage.cardText },
  meBubble: { backgroundColor: Stage.gold, borderBottomRightRadius: 6 },
  meText: { fontSize: 15, lineHeight: 22, fontWeight: '700', color: Stage.onGold },
  skippedBubble: { backgroundColor: Stage.chip, borderWidth: 1, borderColor: Stage.chipBorder, borderBottomRightRadius: 6 },
  skippedText: { fontSize: 14, lineHeight: 20, fontWeight: '600', color: Stage.textDim },
  typingBubble: { flexDirection: 'row', gap: 5, paddingVertical: 15 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#B9A9AB' },
  dock: { paddingHorizontal: Spacing.xl, paddingTop: Spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Stage.chipBorder, backgroundColor: 'rgba(18,10,12,0.55)' },
  dockInner: { gap: Spacing.md, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  dockWaiting: { height: 52 },
  dockActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  chipScroll: { maxHeight: 220, flexGrow: 0 },
  mbtiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  input: {
    flex: 1,
    height: 50,
    borderRadius: Radius.pill,
    backgroundColor: Stage.chip,
    borderWidth: 1,
    borderColor: Stage.chipBorder,
    paddingHorizontal: Spacing.lg,
    fontSize: 16,
    fontWeight: '600',
    color: Stage.text,
  },
  send: { width: 50, height: 50, borderRadius: 25, backgroundColor: Stage.gold, alignItems: 'center', justifyContent: 'center' },
  sendOff: { backgroundColor: Stage.chip },
  skipChip: { alignSelf: 'flex-start', paddingHorizontal: 14, paddingVertical: 9, borderRadius: Radius.pill, borderWidth: 1, borderStyle: 'dashed', borderColor: Stage.chipBorder },
  skipChipText: { fontSize: 14, fontWeight: '700', color: Stage.textDim },
  choice: { borderRadius: Radius.pill, borderWidth: 1, borderColor: Stage.chipBorder, backgroundColor: Stage.chip, paddingHorizontal: 14, paddingVertical: 9 },
  choiceBig: { paddingHorizontal: 22, paddingVertical: 12 },
  choiceGrid: { flexBasis: '22%', flexGrow: 1, alignItems: 'center', paddingHorizontal: 0 },
  choiceWide: { alignItems: 'center' },
  choiceOn: { backgroundColor: Stage.gold, borderColor: Stage.gold },
  pressed: { opacity: 0.7 },
  choiceText: { fontSize: 14, fontWeight: '700', color: Stage.text },
  choiceTextBig: { fontSize: 16 },
  choiceTextOn: { color: Stage.onGold },
  footnote: { fontSize: 12, fontWeight: '500', color: Stage.textFaint, textAlign: 'center' },
});
