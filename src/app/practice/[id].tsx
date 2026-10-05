import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, StyleSheet, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeInUp, ZoomIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HeatGauge } from '@/components/coach/heat-gauge';
import { useCelebrate } from '@/components/fx/celebration';
import { AnimatedNumber } from '@/components/ui/animated-number';
import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { IconButton } from '@/components/ui/icon-button';
import { PressableScale } from '@/components/ui/pressable-scale';
import { MaxContentWidth, Radius, Spacing, Typography } from '@/constants/theme';
import { kktiLabel } from '@/hooks/use-coach';
import { useAiAction } from '@/hooks/use-ai-action';
import { useKeyboardVisible } from '@/hooks/use-keyboard';
import { useTheme } from '@/hooks/use-theme';
import { isUnlimited, useQuota } from '@/lib/billing/gate';
import { requestAi } from '@/lib/coach-client';
import { userToRequest } from '@/lib/coach-schema';
import { haptic } from '@/lib/haptics';
import { relationshipLabel } from '@/lib/labels';
import { PRACTICE_MAX_TURNS, bestLine, myTurnCount, practiceVerdict } from '@/lib/practice';
import type { PracticeTurn } from '@/lib/types';
import { useAppStore } from '@/store/app-store';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function PracticeSessionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const celebrate = useCelebrate();
  const keyboardVisible = useKeyboardVisible();
  const session = useAppStore((s) => (id ? s.practice[id] : undefined));
  const user = useAppStore((s) => s.user);
  const kkti = useAppStore((s) => s.kkti);
  const quota = useQuota();
  const { run, busy, error, setError } = useAiAction();
  const [text, setText] = useState('');
  const [typing, setTyping] = useState(false);
  const [heatFrom, setHeatFrom] = useState<{ from: number; key: string } | null>(null);
  const listRef = useRef<FlatList<PracticeTurn>>(null);
  const rootRef = useRef<View>(null);
  const [headerOffset, setHeaderOffset] = useState(0);

  const measure = useCallback(() => {
    rootRef.current?.measureInWindow?.((_x, y) => {
      if (typeof y === 'number' && Number.isFinite(y)) setHeaderOffset(y);
    });
  }, []);
  useEffect(() => {
    const t = setTimeout(measure, 250);
    return () => clearTimeout(t);
  }, [measure, keyboardVisible]);

  const turnsLength = session?.turns.length ?? 0;
  useEffect(() => {
    const t = setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
    return () => clearTimeout(t);
  }, [turnsLength, typing, session?.ended, keyboardVisible]);

  if (!session || !user) {
    return (
      <View style={[styles.root, { backgroundColor: theme.background }]}>
        <Stack.Screen options={{ title: '' }} />
        <EmptyState emoji="🫥" title="연습을 찾을 수 없어요" actionTitle="연습 탭으로" onAction={() => router.replace('/(tabs)/practice')} />
      </View>
    );
  }

  const p = session.persona;
  const used = myTurnCount(session);
  const left = PRACTICE_MAX_TURNS - used;
  const finished = session.ended || left <= 0;
  const canSend = !busy && !finished && text.trim().length > 0;

  const send = async () => {
    if (!canSend) return;
    const message = text.trim();
    const store = useAppStore.getState();
    // 연습 한 번에 1회만 차감 — 첫 답장을 받을 때
    const chargeable = !session.charged;
    if (chargeable && quota.remaining <= 0) {
      haptic.warning();
      router.push({ pathname: '/paywall', params: { reason: 'practice' } });
      return;
    }
    haptic.thud();
    setText('');
    setError(null);
    const mine = store.addPracticeTurn(session.id, { role: 'me', text: message });
    if (!mine) return;
    setTyping(true);
    const turns = [...session.turns, mine].map((t) => ({ role: t.role, text: t.text }));
    const result = await run(
      'practice',
      (o) =>
        requestAi(
          'practice',
          {
            persona: { name: p.name, gender: p.gender, age: p.age, mbti: p.mbti, job: p.job || '직장인', style: p.style, relationship: p.relationship, scenario: p.scenario, speech: p.speech, difficulty: p.difficulty },
            user: userToRequest(user, kktiLabel(kkti)),
            heat: session.heat,
            turns,
          },
          o,
        ),
      { reason: 'practice', chargeable },
    );
    if (!result) {
      setTyping(false);
      haptic.error();
      // 실패한 내 메시지는 지우고 입력창에 되돌려 다시 보낼 수 있게
      useAppStore.setState((s) => {
        const cur = s.practice[session.id];
        if (!cur) return {};
        return { practice: { ...s.practice, [session.id]: { ...cur, turns: cur.turns.filter((t) => t.id !== mine.id) } } };
      });
      setText(message);
      return;
    }
    const before = useAppStore.getState().practice[session.id]?.heat ?? session.heat;
    useAppStore.getState().updatePracticeTurn(session.id, mine.id, { feedback: result.feedback, better: result.better || undefined, delta: result.heatDelta });
    // 상대가 말풍선을 하나씩 보내는 것처럼
    for (let i = 0; i < result.replies.length; i++) {
      await sleep(i === 0 ? 350 : 700 + Math.min(900, result.replies[i].length * 25));
      useAppStore.getState().addPracticeTurn(session.id, { role: 'them', text: result.replies[i] });
      haptic.soft();
    }
    setTyping(false);
    setHeatFrom({ from: before, key: mine.id });
    useAppStore.getState().applyPracticeResult(session.id, result.heatDelta, result.mood, result.ended);
    if (result.heatDelta >= 8) celebrate({ kind: 'hearts', count: 16 });
    else if (result.heatDelta < 0) haptic.drop();
    else haptic.heartbeat();
    const after = useAppStore.getState().practice[session.id];
    if (after && (after.ended || myTurnCount(after) >= PRACTICE_MAX_TURNS)) {
      setTimeout(() => celebrate({ kind: after.heat >= 30 ? 'confetti' : 'sparkles', count: 26 }), 900);
    }
  };

  const end = () => {
    haptic.heavy();
    useAppStore.getState().endPractice(session.id);
    celebrate({ kind: session.heat >= 30 ? 'confetti' : 'sparkles', count: 24 });
  };

  const restart = () => {
    const nextId = useAppStore.getState().startPractice(p);
    router.replace({ pathname: '/practice/[id]', params: { id: nextId } });
  };

  const verdict = practiceVerdict(session.heat);
  const best = bestLine(session);
  const rel = relationshipLabel(p.relationship);

  const renderTurn = ({ item }: { item: PracticeTurn }) =>
    item.role === 'them' ? (
      <Animated.View entering={FadeInUp.springify().damping(15)} style={styles.themRow}>
        <View style={[styles.avatar, { backgroundColor: p.color }]}>
          <AppText style={styles.avatarEmoji}>{p.emoji}</AppText>
        </View>
        <View style={[styles.themBubble, { backgroundColor: theme.surface }]}>
          <AppText variant="body">{item.text}</AppText>
        </View>
      </Animated.View>
    ) : (
      <Animated.View entering={FadeInUp.duration(200)} style={styles.meWrap}>
        <View style={[styles.meBubble, { backgroundColor: theme.bubbleUser }]}>
          <AppText variant="body">{item.text}</AppText>
        </View>
        {item.feedback ? (
          <Animated.View entering={FadeInDown.delay(150)} style={[styles.feedback, { backgroundColor: (item.delta ?? 0) >= 0 ? theme.accentSoft : theme.primarySoft }]}>
            <AppText variant="caption" weight="800" color={(item.delta ?? 0) >= 0 ? 'accent' : 'primary'}>
              {(item.delta ?? 0) >= 0 ? `👍 +${item.delta ?? 0}°` : `💡 ${item.delta}°`}
            </AppText>
            <AppText variant="caption" color="textSecondary" style={styles.flex}>
              {item.feedback}
              {item.better ? `\n✏️ 이렇게 보내면 더 좋아요: ${item.better}` : ''}
            </AppText>
          </Animated.View>
        ) : null}
      </Animated.View>
    );

  return (
    <View ref={rootRef} onLayout={measure} style={[styles.root, { backgroundColor: theme.background }]}>
      <Stack.Screen
        options={{
          headerTitle: () => (
            <View style={styles.headerTitle}>
              <View style={[styles.avatar, { backgroundColor: p.color }]}>
                <AppText style={styles.avatarEmoji}>{session.mood || p.emoji}</AppText>
              </View>
              <View>
                <AppText variant="bodyStrong">{p.name}</AppText>
                <AppText variant="caption" color="textTertiary">
                  연습 중 · {rel.label} · {'★'.repeat(p.difficulty)}
                </AppText>
              </View>
            </View>
          ),
          headerRight: () => (finished ? null : <IconButton name="flag-outline" accessibilityLabel="연습 끝내기" onPress={end} />),
        }}
      />

      <View style={[styles.gauge, { borderBottomColor: theme.border }]}>
        <HeatGauge value={session.heat} from={heatFrom?.from} revealKey={heatFrom?.key} compact caption={finished ? '연습 끝' : `남은 메시지 ${left}개`} />
      </View>

      <KeyboardAvoidingView style={styles.flex} behavior="padding" keyboardVerticalOffset={headerOffset}>
        <FlatList
          ref={listRef}
          data={session.turns}
          keyExtractor={(t) => t.id}
          renderItem={renderTurn}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            <View style={[styles.scenario, { backgroundColor: theme.surface }]}>
              <AppText variant="smallStrong">🎬 상황</AppText>
              <AppText variant="small" color="textSecondary">
                {p.scenario}
              </AppText>
              <AppText variant="caption" color="primary">
                💡 {p.hint}
              </AppText>
            </View>
          }
          ListFooterComponent={
            typing ? (
              <Animated.View entering={FadeIn} style={styles.themRow}>
                <View style={[styles.avatar, { backgroundColor: p.color }]}>
                  <AppText style={styles.avatarEmoji}>{p.emoji}</AppText>
                </View>
                <View style={[styles.themBubble, { backgroundColor: theme.surface }]}>
                  <AppText variant="body" color="textTertiary">
                    입력 중…
                  </AppText>
                </View>
              </Animated.View>
            ) : finished ? (
              <Animated.View entering={ZoomIn.springify().damping(14)} style={[styles.result, { backgroundColor: theme.surfaceElevated, borderColor: theme.border }]}>
                <AppText style={styles.resultEmoji}>{verdict.emoji}</AppText>
                <AppText variant="title2" align="center">
                  {verdict.title}
                </AppText>
                <AnimatedNumber value={session.heat} suffix="°" variant="display" color="accent" align="center" />
                <AppText variant="small" color="textSecondary" align="center">
                  {verdict.body}
                </AppText>
                {best ? (
                  <View style={[styles.best, { backgroundColor: theme.accentSoft }]}>
                    <AppText variant="caption" color="accent" weight="800">
                      🏆 오늘의 한 마디 (+{best.delta}°)
                    </AppText>
                    <AppText variant="small">{best.text}</AppText>
                  </View>
                ) : null}
                <View style={styles.resultActions}>
                  <Button title="같은 상대와 다시" onPress={restart} />
                  <Button title="다른 상대 고르기" variant="soft" onPress={() => router.replace('/(tabs)/practice')} />
                </View>
              </Animated.View>
            ) : null
          }
        />

        {error ? (
          <View style={[styles.error, { backgroundColor: theme.accentSoft }]}>
            <AppText variant="caption" color="danger">
              {error}
            </AppText>
          </View>
        ) : null}

        {!finished ? (
          <View style={[styles.composer, { borderTopColor: theme.border, paddingBottom: (keyboardVisible ? 0 : insets.bottom) + Spacing.sm, backgroundColor: theme.background }]}>
            {!session.charged && quota.enforced && !isUnlimited(quota) ? (
              <AppText variant="caption" color="textTertiary" align="center">
                첫 답장을 받으면 코칭 1회가 차감돼요 · 한 번의 연습에서 {PRACTICE_MAX_TURNS}마디까지
              </AppText>
            ) : null}
            <View style={styles.inputRow}>
              <View style={[styles.inputBox, { backgroundColor: theme.surface }]}>
                <TextInput
                  value={text}
                  onChangeText={setText}
                  placeholder={`${p.name}에게 답장하기`}
                  placeholderTextColor={theme.textTertiary}
                  multiline
                  maxLength={300}
                  editable={!busy}
                  style={[styles.input, Typography.body, { color: theme.text }]}
                />
              </View>
              <PressableScale
                accessibilityLabel="보내기"
                feedback={false}
                onPress={send}
                disabled={!canSend}
                style={[styles.sendBtn, { backgroundColor: canSend ? theme.primary : theme.surfaceSelected }]}>
                <Ionicons name="arrow-up" size={22} color={theme.primaryText} />
              </PressableScale>
            </View>
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  headerTitle: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  gauge: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  list: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.lg, gap: Spacing.md, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  scenario: { borderRadius: Radius.lg, padding: Spacing.md, gap: 4, marginBottom: Spacing.sm },
  themRow: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'flex-end', maxWidth: '85%' },
  avatar: { width: 32, height: 32, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  avatarEmoji: { fontSize: 17, lineHeight: 21 },
  themBubble: { borderRadius: Radius.lg, borderBottomLeftRadius: 4, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 2, flexShrink: 1 },
  meWrap: { alignItems: 'flex-end', gap: Spacing.xs },
  meBubble: { borderRadius: Radius.lg, borderBottomRightRadius: 4, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 2, maxWidth: '85%' },
  feedback: { flexDirection: 'row', gap: Spacing.sm, borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, maxWidth: '92%' },
  result: { borderRadius: Radius.xl, borderWidth: 1, padding: Spacing.xl, gap: Spacing.sm, alignItems: 'stretch', marginTop: Spacing.lg },
  resultEmoji: { fontSize: 48, lineHeight: 58, textAlign: 'center' },
  best: { borderRadius: Radius.md, padding: Spacing.md, gap: 4 },
  resultActions: { gap: Spacing.sm, marginTop: Spacing.sm },
  error: { marginHorizontal: Spacing.lg, borderRadius: Radius.md, padding: Spacing.sm },
  composer: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: Spacing.sm, paddingHorizontal: Spacing.md, gap: Spacing.xs },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.sm },
  inputBox: { flex: 1, borderRadius: Radius.lg, paddingHorizontal: Spacing.lg, minHeight: 44, maxHeight: 120, justifyContent: 'center' },
  input: { paddingVertical: Spacing.sm + 2 },
  sendBtn: { width: 44, height: 44, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
});
