import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeInUp, ZoomIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GradientButton } from '@/components/brand/brand';
import { useAiReport } from '@/components/coach/ai-report-sheet';
import { COMPOSER_FADE, ComposerBackdrop, PILL_HEIGHT, PillInput, SendOrb } from '@/components/coach/composer';
import { HeatGauge } from '@/components/coach/heat-gauge';
import { RoomAvatar } from '@/components/crush/crush-list-item';
import { useCelebrate } from '@/components/fx/celebration';
import { useCostNote } from '@/components/tips/tip-book';
import { AnimatedNumber } from '@/components/ui/animated-number';
import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { GlassSurface } from '@/components/ui/glass-surface';
import { IconButton } from '@/components/ui/icon-button';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { kktiLabel } from '@/hooks/use-coach';
import { useAiAction } from '@/hooks/use-ai-action';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useKeyboardVisible } from '@/hooks/use-keyboard';
import { useResumeAfterPaywall } from '@/hooks/use-resume-after-paywall';
import { useTheme } from '@/hooks/use-theme';
import { practiceFeedbackReportContent, practiceReportContent } from '@/lib/ai-report';
import { beginAiRequest } from '@/lib/ai-request-lifetime';
import { currentQuota } from '@/lib/billing/gate';
import { paywallTarget } from '@/lib/billing/paywall-route';
import { PRACTICE_PROMPT_TURNS } from '@/lib/ai-tasks';
import { aiRouteOf, requestAi } from '@/lib/coach-client';
import { userToRequest } from '@/lib/coach-schema';
import { haptic } from '@/lib/haptics';
import { relationshipLabel } from '@/lib/labels';
import { PRACTICE_MAX_TURNS, bestLine, latestPartnerText, myTurnCount, practiceVerdict } from '@/lib/practice';
import type { PracticeTurn } from '@/lib/types';
import { useAppStore } from '@/store/app-store';

const LEVEL = ['', '쉬움', '보통', '어려움'] as const;

/** 동의 철회·화면 종료 때 말풍선 대기도 바로 끝낸다. */
function waitForReply(ms: number, signal: AbortSignal): Promise<boolean> {
  if (signal.aborted) return Promise.resolve(false);
  return new Promise((resolve) => {
    const finish = (ready: boolean) => {
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
      resolve(ready);
    };
    const abort = () => finish(false);
    const timer = setTimeout(() => finish(true), ms);
    signal.addEventListener('abort', abort, { once: true });
  });
}

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
  const dark = useColorScheme() === 'dark';
  // 첫 답장을 받을 때 쓰는 무료 1회 — 남았으면 「1회를 써요」, 0회면 「다 썼어요」(예전엔 0회에도 「1회가 차감돼요」였다)
  const cost = useCostNote('첫 답장을 받을 때');
  const { run, busy, error, setError, cancel } = useAiAction();
  // 횟수가 없어 막힌 첫 답장을 결제·가입 뒤 한 번 이어서 보낸다 (입력한 글은 입력창에 그대로 남아 있음)
  const resume = useResumeAfterPaywall('practice');
  const sendRef = useRef<(() => void) | null>(null);
  const report = useAiReport();
  const [text, setText] = useState('');
  const [typing, setTyping] = useState(false);
  const [heatFrom, setHeatFrom] = useState<{ from: number; key: string } | null>(null);
  const listRef = useRef<FlatList<PracticeTurn>>(null);
  const rootRef = useRef<View>(null);
  const replyRef = useRef<ReturnType<typeof beginAiRequest> | null>(null);
  const [headerOffset, setHeaderOffset] = useState(0);

  useEffect(() => () => {
    const reply = replyRef.current;
    replyRef.current = null;
    reply?.controller.abort();
    cancel();
  }, [id, cancel]);

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
  const canSend = !busy && !typing && !finished && text.trim().length > 0;

  const send = async () => {
    if (!canSend || replyRef.current) return;
    const message = text.trim();
    const store = useAppStore.getState();
    // 연습 한 번에 1회만 차감 — 첫 답장을 받을 때
    const chargeable = !session.charged;
    // 이 순간의 횟수로 본다 — 결제 뒤 이어 보낼 때 예전 화면 값으로 다시 막히지 않게
    if (chargeable && currentQuota().remaining <= 0) {
      haptic.warning();
      resume.remember(() => sendRef.current?.());
      router.push(paywallTarget('practice'));
      return;
    }
    resume.forget();
    haptic.thud();
    setText('');
    setError(null);
    const mine = store.addPracticeTurn(session.id, { role: 'me', text: message });
    if (!mine) return;
    // 통신뿐 아니라 응답 뒤 말풍선·온도 반영까지 같은 동의와 화면 수명으로 보호한다.
    const reply = beginAiRequest();
    replyRef.current = reply;
    reply.controller.signal.addEventListener('abort', cancel, { once: true });
    const active = () => {
      const current = useAppStore.getState().practice[session.id];
      return reply.active() && current !== undefined && !current.ended;
    };
    try {
      // 프롬프트에 쓰는 최근 말풍선만 보낸다 (예전 서버는 40개를 넘으면 거절했다)
      const turns = [...session.turns, mine].slice(-PRACTICE_PROMPT_TURNS).map((t) => ({ role: t.role, text: t.text }));
      const result = await run(
        'practice',
        (o) => {
          reply.confirmConsent(aiRouteOf(o.directApiKey)?.provider);
          // 「입력 중…」은 AI 분석 동의를 받은 뒤(실제로 보낼 때) 띄운다 — 동의 시트 뒤에서 상대가 답장하는 것처럼 보이지 않게
          setTyping(true);
          return requestAi(
            'practice',
            {
              persona: { name: p.name, gender: p.gender, age: p.age, mbti: p.mbti, job: p.job || '직장인', style: p.style, relationship: p.relationship, scenario: p.scenario, speech: p.speech, difficulty: p.difficulty },
              user: userToRequest(user, kktiLabel(kkti)),
              heat: session.heat,
              turns,
            },
            o,
          );
        },
        { reason: 'practice', chargeable },
      );
      if (!active()) return;
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
      // run이 성공할 때 이미 차감됐다. 답장 연출을 취소해도 같은 연습에서 다시 차감하지 않는다.
      useAppStore.setState((s) => {
        const current = s.practice[session.id];
        if (!current || current.charged) return {};
        return { practice: { ...s.practice, [session.id]: { ...current, charged: true } } };
      });
      useAppStore.getState().updatePracticeTurn(session.id, mine.id, { feedback: result.feedback, better: result.better || undefined, delta: result.heatDelta });
      // 상대가 말풍선을 하나씩 보내는 것처럼
      for (let i = 0; i < result.replies.length; i++) {
        const ready = await waitForReply(i === 0 ? 350 : 700 + Math.min(900, result.replies[i].length * 25), reply.controller.signal);
        if (!ready || !active()) return;
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
        if (await waitForReply(900, reply.controller.signal) && reply.active() && useAppStore.getState().practice[session.id]) {
          celebrate({ kind: after.heat >= 30 ? 'confetti' : 'sparkles', count: 26 });
        }
      }
    } finally {
      reply.finish();
      reply.controller.signal.removeEventListener('abort', cancel);
      if (replyRef.current === reply) {
        replyRef.current = null;
        setTyping(false);
      }
    }
  };
  sendRef.current = () => void send();

  const end = () => {
    replyRef.current?.controller.abort();
    haptic.heavy();
    useAppStore.getState().endPractice(session.id);
    celebrate({ kind: session.heat >= 30 ? 'confetti' : 'sparkles', count: 24 });
  };

  const restart = () => {
    const nextId = useAppStore.getState().startPractice(p);
    router.replace({ pathname: '/practice/[id]', params: { id: nextId } });
  };

  // 화면 위 깃발 — 상대역이 가장 최근에 한 말을 신고 (다른 말은 말풍선을 길게 누름). 아직 없으면 기능을 고르는 일반 신고
  const reportLatest = () => {
    const latest = latestPartnerText(session.turns);
    report.open(latest ? { mode: 'practice', content: practiceReportContent(p.name, latest) } : { mode: 'practice' });
  };

  // 회색 면(상대 말풍선·상황·결과)과 그 안 흰 면 — 다크는 한 단계씩 밝게
  const fill = dark ? theme.surfaceElevated : theme.surface;
  const inner = dark ? theme.border : theme.card;
  const verdict = practiceVerdict(session.heat);
  const best = bestLine(session);
  const rel = relationshipLabel(p.relationship);

  const renderTurn = ({ item }: { item: PracticeTurn }) =>
    item.role === 'them' ? (
      <Animated.View entering={FadeInUp.duration(240)} style={styles.themRow}>
        <RoomAvatar crush={{ id: p.id, name: p.name }} size={32} />
        {/* AI 상대역의 말 — 길게 누르면 이 말을 신고 (화면 위 깃발은 가장 최근 말) */}
        <Pressable
          onLongPress={report.available ? () => report.open({ mode: 'practice', content: practiceReportContent(p.name, item.text) }) : undefined}
          accessibilityHint={report.available ? '길게 누르면 이 말을 신고할 수 있어요' : undefined}
          style={[styles.themBubble, { backgroundColor: fill }]}>
          <AppText variant="body">{item.text}</AppText>
        </Pressable>
      </Animated.View>
    ) : (
      <Animated.View entering={FadeInUp.duration(200)} style={styles.meWrap}>
        <View style={[styles.meBubble, { backgroundColor: theme.bubbleUser }]}>
          <AppText variant="body">{item.text}</AppText>
        </View>
        {item.feedback ? (
          <Animated.View entering={FadeInDown.delay(150)} style={styles.feedbackWrap}>
            {/* 코치 피드백도 AI 가 만든 글 — 깃발이나 길게 누르기로 바로 신고 */}
            <Pressable
              onLongPress={report.available ? () => report.open({ mode: 'practice', content: practiceFeedbackReportContent(item) }) : undefined}
              accessibilityHint={report.available ? '길게 누르면 이 피드백을 신고할 수 있어요' : undefined}
              style={[styles.feedback, { backgroundColor: fill }]}>
              {/* 코치 피드백 — 회색 한 가지 + 온도 변화 숫자(예전엔 오르면 보라·내리면 파랑이라 앱 색이 「아쉬움」을 뜻했다) */}
              <AppText variant="caption" weight="700" style={styles.delta}>
                {(item.delta ?? 0) >= 0 ? `+${item.delta ?? 0}°` : `−${Math.abs(item.delta ?? 0)}°`}
              </AppText>
              <AppText variant="caption" color="textSecondary" style={styles.flex}>
                {item.feedback}
                {item.better ? `\n이렇게 보내면 더 좋아요 · ${item.better}` : ''}
              </AppText>
              {report.available ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="이 피드백 신고하기"
                  hitSlop={10}
                  onPress={() => report.open({ mode: 'practice', content: practiceFeedbackReportContent(item) })}>
                  <Ionicons name="flag-outline" size={13} color={theme.textTertiary} />
                </Pressable>
              ) : null}
            </Pressable>
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
              <RoomAvatar crush={{ id: p.id, name: p.name }} size={32} />
              <View>
                <AppText variant="bodyStrong">{p.name}</AppText>
                {/* 상대 기분은 AI 가 답할 때 정한 것만 내용으로 보여 준다(처음 값은 예전 얼굴 이모지라 숨긴다) */}
                <AppText variant="caption" color="textSecondary">
                  {finished ? '연습 끝' : '연습 중'} · {rel.label} · {LEVEL[p.difficulty] ?? ''}
                  {session.mood && session.mood !== p.emoji ? ` · ${session.mood}` : ''}
                </AppText>
              </View>
            </View>
          ),
          // 깃발은 다른 화면과 같이 「신고」. 연습 끝내기는 헷갈리지 않게 글자 버튼으로
          headerRight: () => (
            <View style={styles.headerActions}>
              {report.available ? <IconButton name="flag-outline" accessibilityLabel="AI 답변 신고" onPress={reportLatest} /> : null}
              {finished ? null : (
                <Pressable accessibilityRole="button" accessibilityLabel="연습 끝내기" onPress={end} hitSlop={8} style={({ pressed }) => [styles.endBtn, { opacity: pressed ? 0.6 : 1 }]}>
                  <AppText variant="smallStrong" color="textSecondary">
                    끝내기
                  </AppText>
                </Pressable>
              )}
            </View>
          ),
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
          // 연습이 끝나면 입력창이 사라지므로 맨 아래 결과 카드가 홈 막대·탐색 버튼에 가리지 않게 아래 여백을 둔다
          contentContainerStyle={[styles.list, finished ? { paddingBottom: insets.bottom + Spacing.xl } : null]}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            <View style={[styles.scenario, { backgroundColor: fill }]}>
              <AppText variant="caption" color="textSecondary" weight="600">
                오늘의 상황
              </AppText>
              <AppText variant="body">{p.scenario}</AppText>
              {/* 힌트 — 연파랑 상자 대신 흰 면 한 줄 */}
              <View style={[styles.hint, { backgroundColor: inner }]}>
                <AppText variant="small" color="textSecondary" style={styles.flex}>
                  <AppText variant="smallStrong">힌트 </AppText>
                  {p.hint}
                </AppText>
              </View>
              {report.available ? (
                <AppText variant="caption" color="textSecondary">
                  AI가 연기하는 상대예요. 불쾌한 말은 위 깃발(가장 최근 말)이나 말풍선 길게 누르기로, 코치 피드백은 옆 깃발로 신고할 수 있어요
                </AppText>
              ) : null}
            </View>
          }
          ListFooterComponent={
            typing ? (
              <Animated.View entering={FadeIn} style={styles.themRow}>
                <RoomAvatar crush={{ id: p.id, name: p.name }} size={32} />
                <View style={[styles.themBubble, { backgroundColor: fill }]}>
                  <AppText variant="body" color="textTertiary">
                    입력 중…
                  </AppText>
                </View>
              </Animated.View>
            ) : finished ? (
              <Animated.View entering={ZoomIn.duration(300)} style={[styles.result, { backgroundColor: fill }]}>
                {/* 연습 결과 — 회색 카드 한 장(예전 파란 카드·3D 하트·64pt 숫자를 걷었다). 큰 숫자는 최종 온도 하나 */}
                <View style={styles.resultHead}>
                  <View style={styles.flex}>
                    <AppText variant="caption" color="textSecondary" weight="600">
                      {p.name}님과의 연습 결과
                    </AppText>
                    <AppText variant="title2">{verdict.title}</AppText>
                  </View>
                  <AnimatedNumber value={session.heat} suffix="°" ticks={false} color="primary" style={styles.resultHeat} accessibilityLabel={`최종 호감 온도 ${session.heat}도`} />
                </View>
                <AppText variant="small" color="textSecondary">
                  {verdict.body}
                </AppText>
                {best ? (
                  <View style={[styles.best, { backgroundColor: inner }]}>
                    <AppText variant="caption" color="textSecondary" weight="600">
                      오늘의 한 마디 · +{best.delta}°
                    </AppText>
                    <AppText variant="bodyStrong">{best.text}</AppText>
                  </View>
                ) : null}
                <View style={styles.resultActions}>
                  {/* 같은 상대와 다시 = 새 연습이라 첫 답장 때 다시 1회를 쓴다 — 누르기 전에 알린다 */}
                  <GradientButton title={`같은 상대와 다시${cost.suffix}`} accessibilityLabel="같은 상대와 다시" onPress={restart} />
                  <Button title="다른 상대 고르기" variant="ghost" onPress={() => router.replace('/(tabs)/practice')} />
                </View>
              </Animated.View>
            ) : null
          }
        />

        {error ? (
          <View style={[styles.error, { backgroundColor: fill }]}>
            <AppText variant="caption" color="danger">
              {error}
            </AppText>
          </View>
        ) : null}

        {/* 채팅방과 같은 떠 있는 유리 입력창 — [글 입력 | 보내기 구슬] */}
        {!finished ? (
          <View style={[styles.composer, { paddingBottom: (keyboardVisible ? 0 : insets.bottom) + Spacing.sm }]}>
            <ComposerBackdrop />
            {!session.charged && cost.note ? (
              <AppText variant="caption" color="textSecondary" align="center">
                {cost.out ? '무료 횟수를 다 썼어요 · 이용권이 있으면 바로 시작돼요' : `첫 답장을 받으면 코칭 1회를 써요 · ${PRACTICE_MAX_TURNS}마디까지 · ${cost.left}`}
              </AppText>
            ) : null}
            <GlassSurface radius={PILL_HEIGHT / 2} style={styles.pill}>
              <PillInput value={text} onChangeText={setText} placeholder={`${p.name}에게 답장하기`} maxLength={300} editable={!busy} style={styles.input} />
              <SendOrb active={canSend} onPress={send} accessibilityLabel="보내기" />
            </GlassSurface>
          </View>
        ) : null}
      </KeyboardAvoidingView>
      {report.sheet}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  headerTitle: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  headerActions: { flexDirection: 'row', alignItems: 'center' },
  endBtn: { height: 40, paddingHorizontal: Spacing.sm, justifyContent: 'center' },
  gauge: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  // 아래 여백은 입력창 위 흐림보다 넉넉히 — 마지막 말풍선이 흐림에 덮인 채로 멈추지 않게
  list: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.lg, paddingBottom: COMPOSER_FADE + Spacing.sm, gap: Spacing.md, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  scenario: { borderRadius: 20, padding: Spacing.lg, gap: Spacing.sm, marginBottom: Spacing.sm },
  hint: { flexDirection: 'row', gap: Spacing.sm, borderRadius: 14, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 2 },
  themRow: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'flex-end', maxWidth: '85%' },
  // 말풍선 22, 이어지는 쪽 모서리만 6 (지침 1.4)
  themBubble: { borderRadius: 22, borderBottomLeftRadius: 6, paddingHorizontal: Spacing.md + 2, paddingVertical: Spacing.sm + 2, flexShrink: 1 },
  meWrap: { alignItems: 'flex-end', gap: Spacing.xs },
  meBubble: { borderRadius: 22, borderBottomRightRadius: 6, paddingHorizontal: Spacing.md + 2, paddingVertical: Spacing.sm + 2, maxWidth: '85%' },
  feedbackWrap: { maxWidth: '92%' },
  feedback: { flexDirection: 'row', gap: Spacing.sm, borderRadius: 14, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm },
  delta: { minWidth: 30 },
  result: { marginTop: Spacing.lg, borderRadius: 24, padding: Spacing.lg + 2, gap: Spacing.md },
  resultHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  // 카드의 큰 숫자는 최종 온도 하나
  resultHeat: { fontSize: 32, lineHeight: 38, fontWeight: '700', letterSpacing: -1 },
  best: { borderRadius: 20, padding: Spacing.md + 2, gap: 4 },
  resultActions: { gap: Spacing.xs, marginTop: Spacing.sm },
  error: { marginHorizontal: Spacing.lg, borderRadius: Radius.md, padding: Spacing.sm },
  composer: { paddingTop: Spacing.xs, paddingHorizontal: Spacing.md, gap: Spacing.sm },
  pill: { flexDirection: 'row', alignItems: 'flex-end', minHeight: PILL_HEIGHT, padding: 6, paddingLeft: Spacing.md, gap: Spacing.xs },
  input: { maxHeight: 120 },
});
