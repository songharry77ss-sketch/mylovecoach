import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, ZoomIn, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';

import { PendingBubble } from '@/components/coach/pending-bubble';
import { useCelebrate } from '@/components/fx/celebration';
import { AnimatedNumber } from '@/components/ui/animated-number';
import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Screen } from '@/components/ui/screen';
import { useToast } from '@/components/ui/toast';
import { Radius, Spacing } from '@/constants/theme';
import { useAiAction } from '@/hooks/use-ai-action';
import { onSalePrice, usePlanProducts } from '@/hooks/use-plan-products';
import { useTheme } from '@/hooks/use-theme';
import { requestAi } from '@/lib/coach-client';
import { haptic } from '@/lib/haptics';
import { themLabel } from '@/lib/mind-cards';
import type { Gender, MindReading } from '@/lib/types';
import { useAppStore } from '@/store/app-store';

const PHRASES = ['그 사람 입장이 되어 보는 중…', '흔한 경우의 수를 따져 보는 중…', '속마음을 받아 적는 중… 💭', '가능성을 계산하는 중…', '거의 다 됐어요!'];

/** 속마음 풀이 결과 — 상황 카드나 직접 쓴 질문을 받아 「그 사람」의 속마음을 보여 준다 */
export default function MindScreen() {
  const params = useLocalSearchParams<{ situation?: string; perspective?: string; history?: string }>();
  const theme = useTheme();
  const router = useRouter();
  const toast = useToast();
  const celebrate = useCelebrate();
  const user = useAppStore((s) => s.user);
  const history = useAppStore((s) => s.mindHistory);
  const { run, busy, error, blocked, openPaywall } = useAiAction();
  const hasDayPass = onSalePrice(usePlanProducts(), 'day') != null;
  const fromHistory = params.history != null ? history[Number(params.history)] : undefined;
  const perspective: Gender = fromHistory?.perspective ?? (params.perspective === 'female' || params.perspective === 'other' ? params.perspective : 'male');
  const situation = fromHistory?.situation ?? params.situation ?? '';
  const [reading, setReading] = useState<MindReading | null>(fromHistory?.reading ?? null);
  const started = useRef(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (started.current || reading || !situation) return;
    started.current = true;
    // 기다리는 사이 「모든 데이터 삭제」를 하면 늦게 온 결과를 기록에 다시 남기지 않는다
    const epoch = useAppStore.getState().resetEpoch;
    run(
      'mind',
      (o) => requestAi('mind', { situation, perspective, user: user ? { gender: user.gender, age: user.age, mbti: user.mbti } : undefined }, o),
      { reason: 'mind' },
    ).then((r) => {
      if (!r) {
        haptic.error();
        return;
      }
      setReading(r);
      if (useAppStore.getState().resetEpoch === epoch) useAppStore.getState().addMindAnswer({ situation, perspective, reading: r, at: Date.now() });
      haptic.heartbeat();
    });
  }, [reading, situation, perspective, run, user, attempt]);

  const copySample = async () => {
    if (!reading?.sampleReply) return;
    await Clipboard.setStringAsync(reading.sampleReply);
    celebrate({ kind: 'hearts', count: 12 });
    toast.show('복사했어요. 카톡에 붙여넣기만 하면 끝!', 'success');
  };

  const who = themLabel(perspective);

  return (
    <Screen contentStyle={styles.content}>
      <View style={[styles.situation, { backgroundColor: theme.surface }]}>
        <AppText variant="caption" color="accent" weight="700">
          🎲 상황
        </AppText>
        <AppText variant="bodyStrong">{situation || '물어볼 상황이 없어요.'}</AppText>
      </View>

      {busy ? <PendingBubble phrases={PHRASES} /> : null}

      {blocked && !reading ? (
        <View style={[styles.error, { backgroundColor: theme.primarySoft }]}>
          <AppText variant="smallStrong">오늘 쓸 수 있는 횟수를 다 썼어요</AppText>
          <AppText variant="small" color="textSecondary">
            {hasDayPass ? '하루 이용권이면 지금부터 24시간 동안 속마음을 마음껏 물어볼 수 있어요.' : '이용권이면 횟수 걱정 없이 속마음을 마음껏 물어볼 수 있어요.'}
          </AppText>
          <View style={styles.row}>
            <Button title="이용권 보기" size="sm" fullWidth={false} onPress={() => openPaywall('mind')} />
            <Button
              title="다시 시도"
              size="sm"
              variant="soft"
              fullWidth={false}
              onPress={() => {
                started.current = false;
                setAttempt((a) => a + 1);
              }}
            />
          </View>
        </View>
      ) : null}

      {error ? (
        <View style={[styles.error, { backgroundColor: theme.accentSoft }]}>
          <AppText variant="small" color="danger">
            {error}
          </AppText>
          <Button
            title="다시 시도"
            size="sm"
            variant="secondary"
            fullWidth={false}
            onPress={() => {
              started.current = false;
              setAttempt((a) => a + 1);
            }}
          />
        </View>
      ) : null}

      {reading ? (
        <>
          <Animated.View entering={ZoomIn.springify().damping(14)} style={[styles.voiceWrap]}>
            <AppText variant="caption" color="textTertiary">
              💭 {who}의 속마음
            </AppText>
            <View style={[styles.voice, { backgroundColor: theme.surfaceElevated, borderColor: theme.border }]}>
              <Typewriter text={reading.innerVoice} />
            </View>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(200).duration(300)} style={[styles.section, { backgroundColor: theme.surface }]}>
            <AppText variant="title3">{reading.headline}</AppText>
            {reading.possibilities.map((p, i) => (
              <Possibility key={p.label} label={p.label} percent={p.percent} reason={p.reason} index={i} />
            ))}
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(400).duration(300)} style={[styles.section, { backgroundColor: theme.primarySoft }]}>
            <AppText variant="smallStrong" color="primary">
              👉 이렇게 해보세요
            </AppText>
            <AppText variant="small">{reading.advice}</AppText>
          </Animated.View>

          {reading.sampleReply ? (
            <Animated.View entering={FadeInDown.delay(550).duration(300)}>
              <PressableScale feedback={false} onPress={copySample} style={[styles.sample, { backgroundColor: theme.bubbleUser }]}>
                <AppText variant="caption" color="textTertiary">
                  보낼 메시지 예시 · 탭하면 복사
                </AppText>
                <AppText variant="body">{reading.sampleReply}</AppText>
              </PressableScale>
            </Animated.View>
          ) : null}

          <Button title="다른 상황도 물어보기" variant="soft" onPress={() => router.back()} />
        </>
      ) : null}
    </Screen>
  );
}

/** 속마음 한마디가 한 글자씩 타닥타닥 써진다 */
function Typewriter({ text }: { text: string }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    setN(0);
    const t = setInterval(() => {
      setN((v) => {
        if (v >= text.length) {
          clearInterval(t);
          return v;
        }
        if (v % 3 === 0) haptic.tick();
        return v + 1;
      });
    }, 45);
    return () => clearInterval(t);
  }, [text]);
  return (
    <AppText variant="title3">
      {text.slice(0, n)}
      {n < text.length ? '▍' : ''}
    </AppText>
  );
}

function Possibility({ label, percent, reason, index }: { label: string; percent: number; reason: string; index: number }) {
  const theme = useTheme();
  const w = useSharedValue(0);
  useEffect(() => {
    w.value = withDelay(300 + index * 180, withTiming(percent, { duration: 900 }));
  }, [percent, index, w]);
  const bar = useAnimatedStyle(() => ({ width: `${w.value}%` }));
  const top = index === 0;
  return (
    <View style={styles.possibility}>
      <View style={styles.possHead}>
        <AppText variant="smallStrong" style={styles.flex}>
          {top ? '🥇 ' : ''}
          {label}
        </AppText>
        <AnimatedNumber value={percent} suffix="%" delay={300 + index * 180} duration={900} variant="smallStrong" color={top ? 'accent' : 'textSecondary'} ticks={top} />
      </View>
      <View style={[styles.track, { backgroundColor: theme.surfaceSelected }]}>
        <Animated.View style={[styles.fill, { backgroundColor: top ? theme.accent : theme.primary }, bar]} />
      </View>
      <AppText variant="caption" color="textSecondary">
        {reason}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { gap: Spacing.lg, paddingTop: Spacing.md },
  flex: { flex: 1 },
  situation: { borderRadius: Radius.lg, padding: Spacing.lg, gap: 4 },
  error: { borderRadius: Radius.md, padding: Spacing.md, gap: Spacing.sm },
  row: { flexDirection: 'row', gap: Spacing.sm },
  voiceWrap: { gap: Spacing.xs },
  voice: { borderRadius: Radius.xl, borderTopLeftRadius: 6, borderWidth: 1, padding: Spacing.lg },
  section: { borderRadius: Radius.lg, padding: Spacing.lg, gap: Spacing.md },
  possibility: { gap: 4 },
  possHead: { flexDirection: 'row', alignItems: 'center' },
  track: { height: 8, borderRadius: 4, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 4 },
  sample: { borderRadius: Radius.lg, borderTopRightRadius: 6, padding: Spacing.lg, gap: 4, alignSelf: 'flex-end', maxWidth: '92%' },
});
