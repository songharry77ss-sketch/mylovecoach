import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, ZoomIn, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';

import { BrandGradient, HeroCard, Icon3D } from '@/components/brand/brand';
import { AiReportLink } from '@/components/coach/ai-report-sheet';
import { PendingBubble } from '@/components/coach/pending-bubble';
import { useCelebrate } from '@/components/fx/celebration';
import { AnimatedNumber } from '@/components/ui/animated-number';
import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Screen } from '@/components/ui/screen';
import { useToast } from '@/components/ui/toast';
import { Brand, Radius, Spacing } from '@/constants/theme';
import { useMindReading, type MindOutcome } from '@/hooks/use-mind-reading';
import { onSalePrice, usePlanProducts } from '@/hooks/use-plan-products';
import { useResumeAfterPaywall } from '@/hooks/use-resume-after-paywall';
import { useTheme } from '@/hooks/use-theme';
import { isUnlimited, useQuota } from '@/lib/billing/gate';
import { haptic } from '@/lib/haptics';
import { themLabel } from '@/lib/mind-cards';
import type { Gender } from '@/lib/types';
import { useAppStore } from '@/store/app-store';

const PHRASES = ['그 사람 입장이 되어 보는 중…', '흔한 경우의 수를 따져 보는 중…', '속마음을 받아 적는 중… 💭', '가능성을 계산하는 중…', '거의 다 됐어요!'];

/** 결과가 나오면 두근, 실패하면 툭 */
const feel = (outcome: MindOutcome) => {
  if (outcome === 'failed') haptic.error();
  else if (outcome) haptic.heartbeat();
};

/** 속마음 풀이 결과 — 상황 카드나 직접 쓴 질문을 받아 「그 사람」의 속마음을 보여 준다 */
export default function MindScreen() {
  const params = useLocalSearchParams<{ situation?: string; perspective?: string; history?: string }>();
  const theme = useTheme();
  const router = useRouter();
  const toast = useToast();
  const celebrate = useCelebrate();
  const history = useAppStore((s) => s.mindHistory);
  const quota = useQuota();
  const hasDayPass = onSalePrice(usePlanProducts(), 'day') != null;
  // 기록에서 연 풀이는 처음 연 그 기록을 계속 보여 준다 (다시 풀면 기록 순서가 바뀌어도 화면이 다른 기록으로 넘어가지 않게)
  const [fromHistory] = useState(() => (params.history != null ? history[Number(params.history)] : undefined));
  const perspective: Gender = fromHistory?.perspective ?? (params.perspective === 'female' || params.perspective === 'other' ? params.perspective : 'male');
  const situation = fromHistory?.situation ?? params.situation ?? '';
  const { reading, reused, ask, retry, busy, error, blocked, blockCount, openPaywall } = useMindReading(situation, perspective, fromHistory?.reading);
  const started = useRef(false);

  // 횟수가 없어 막혔다면, 결제·가입하고 돌아왔을 때 다시 누르지 않아도 한 번 풀어 준다
  // (예전에는 결제하고 와도 「다 썼어요」 카드가 그대로 남아 결제가 안 된 줄 알 수 있었다)
  const retryRef = useRef(retry);
  useEffect(() => {
    retryRef.current = retry;
  }, [retry]);
  const resume = useResumeAfterPaywall('mind');
  // 막힐 때마다(다시 눌러 또 막혀도) 새로 기억한다
  useEffect(() => {
    if (blockCount > 0 && !reading) resume.remember(() => void retryRef.current().then(feel));
  }, [blockCount, reading, resume]);

  // 처음 열면 한 번 풀어 준다 — 같은 카드·같은 대상·같은 내 프로필로 풀어 둔 결과가 있으면 AI 를 부르지 않고 그 결과를 보여 준다
  useEffect(() => {
    if (started.current || reading || !situation) return;
    started.current = true;
    ask(false).then(feel);
  }, [ask, reading, situation]);

  const copySample = async () => {
    if (!reading?.sampleReply) return;
    await Clipboard.setStringAsync(reading.sampleReply);
    celebrate({ kind: 'hearts', count: 12 });
    toast.show('복사했어요. 카톡에 붙여넣기만 하면 끝!', 'success');
  };

  const who = themLabel(perspective);

  return (
    <Screen contentStyle={styles.content}>
      <Animated.View entering={FadeInDown.duration(320)} style={[styles.situation, { backgroundColor: theme.surface }]}>
        <View style={styles.labelRow}>
          <Ionicons name="chatbubble-ellipses" size={14} color={theme.primary} />
          <AppText variant="caption" color="primary" weight="700">
            물어본 상황
          </AppText>
        </View>
        <AppText variant="title3">{situation || '물어볼 상황이 없어요.'}</AppText>
      </Animated.View>

      {busy ? <PendingBubble phrases={PHRASES} /> : null}

      {blocked && !reading ? (
        <View style={[styles.error, { backgroundColor: theme.primarySoft }]}>
          <View style={styles.labelRow}>
            <Icon3D name="ticket" size={36} />
            <AppText variant="bodyStrong">무료 횟수를 다 썼어요</AppText>
          </View>
          <AppText variant="small" color="textSecondary">
            {hasDayPass ? '하루 이용권이면 지금부터 24시간 동안 속마음을 마음껏 물어볼 수 있어요.' : '이용권이면 횟수 걱정 없이 속마음을 마음껏 물어볼 수 있어요.'}
          </AppText>
          <View style={styles.row}>
            <Button title="이용권 보기" size="sm" variant="brand" fullWidth={false} onPress={() => openPaywall('mind')} />
            <Button title="다시 시도" size="sm" variant="soft" fullWidth={false} onPress={() => retry().then(feel)} />
          </View>
        </View>
      ) : null}

      {error ? (
        <View style={[styles.error, { backgroundColor: theme.accentSoft }]}>
          <AppText variant="small" color="danger">
            {error}
          </AppText>
          <Button title="다시 시도" size="sm" variant="secondary" fullWidth={false} onPress={() => retry().then(feel)} />
        </View>
      ) : null}

      {reading && !busy ? (
        <>
          {reused ? (
            <AppText variant="caption" color="textTertiary" align="center">
              전에 풀어 본 상황이라 저장된 풀이를 보여 드려요
            </AppText>
          ) : null}
          {/* 이 화면의 주인공 — 그 사람의 속마음 한마디가 그라데이션 카드 위에 타닥타닥 써진다 */}
          <Animated.View entering={ZoomIn.springify().damping(14)}>
            <HeroCard>
              <View style={styles.voiceHead}>
                <View style={styles.voiceLabel}>
                  <AppText variant="caption" weight="700" color={Brand.onBrandDim}>
                    {who}의 속마음
                  </AppText>
                  <AppText variant="small" color={Brand.onBrandDim}>
                    이런 생각일 가능성이 커요
                  </AppText>
                </View>
                <Icon3D name="heart" size={60} float />
              </View>
              <View style={styles.voice}>
                <Typewriter text={reading.innerVoice} color={Brand.onBrand} />
              </View>
            </HeroCard>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(200).duration(300)} style={[styles.section, { backgroundColor: theme.surface }]}>
            <AppText variant="title3">{reading.headline}</AppText>
            {reading.possibilities.map((p, i) => (
              <Possibility key={p.label} label={p.label} percent={p.percent} reason={p.reason} index={i} />
            ))}
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(400).duration(300)} style={[styles.section, { backgroundColor: theme.primarySoft }]}>
            <View style={styles.labelRow}>
              <Ionicons name="bulb" size={16} color={theme.primary} />
              <AppText variant="smallStrong" color="primary">
                이렇게 해 보세요
              </AppText>
            </View>
            <AppText variant="body">{reading.advice}</AppText>
          </Animated.View>

          {reading.sampleReply ? (
            <Animated.View entering={FadeInDown.delay(550).duration(300)} style={styles.sampleWrap}>
              <AppText variant="caption" color="textTertiary" style={styles.sampleCaption}>
                이렇게 보내 보세요 · 누르면 복사돼요
              </AppText>
              <PressableScale feedback={false} onPress={copySample} accessibilityLabel={`보낼 메시지 예시 복사: ${reading.sampleReply}`} style={[styles.sample, { backgroundColor: theme.bubbleUser }]}>
                <AppText variant="body">{reading.sampleReply}</AppText>
                <View style={[styles.copyChip, { backgroundColor: theme.surfaceElevated }]}>
                  <Ionicons name="copy-outline" size={13} color={theme.primary} />
                  <AppText variant="caption" weight="700" color="primary">
                    복사
                  </AppText>
                </View>
              </PressableScale>
            </Animated.View>
          ) : null}
          <AiReportLink mode="mind" situation={situation} reading={reading} label="이 풀이 신고" />

          <View style={styles.actions}>
            <Button title="다른 상황도 물어보기" variant="soft" onPress={() => router.back()} />
            {/* 저장된 풀이 대신 AI 에게 새로 묻는다 */}
            <Button title="다시 풀이" variant="ghost" onPress={() => ask(true).then(feel)} />
            {quota.enforced && !isUnlimited(quota) ? (
              <AppText variant="caption" color="textTertiary" align="center">
                다시 풀면 1회가 차감돼요
              </AppText>
            ) : null}
          </View>
        </>
      ) : null}
    </Screen>
  );
}

/** 속마음 한마디가 한 글자씩 타닥타닥 써진다 */
function Typewriter({ text, color }: { text: string; color?: string }) {
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
    <AppText variant="title2" color={color}>
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
        <View style={[styles.flex, styles.labelRow]}>
          {top ? (
            <View style={[styles.topBadge, { backgroundColor: theme.primary }]}>
              <AppText variant="caption" weight="800" color={Brand.onBrand}>
                1위
              </AppText>
            </View>
          ) : null}
          <AppText variant={top ? 'bodyStrong' : 'smallStrong'} style={styles.flex}>
            {label}
          </AppText>
        </View>
        <AnimatedNumber value={percent} suffix="%" delay={300 + index * 180} duration={900} variant={top ? 'title2' : 'smallStrong'} color={top ? 'primary' : 'textSecondary'} ticks={top} />
      </View>
      <View style={[styles.track, top ? styles.trackTop : null, { backgroundColor: theme.surfaceSelected }]}>
        <Animated.View style={[styles.fill, bar]}>
          {top ? <BrandGradient style={StyleSheet.absoluteFill} /> : <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.primary, opacity: 0.45 }]} />}
        </Animated.View>
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
  situation: { borderRadius: Radius.lg, padding: Spacing.lg, gap: Spacing.xs + 2 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  error: { borderRadius: Radius.lg, padding: Spacing.lg, gap: Spacing.sm },
  row: { flexDirection: 'row', gap: Spacing.sm },
  actions: { gap: Spacing.xs },
  voiceHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.md },
  voiceLabel: { flexShrink: 1, gap: 2 },
  voice: { marginTop: Spacing.md, minHeight: 56 },
  section: { borderRadius: Radius.lg, padding: Spacing.lg, gap: Spacing.md },
  possibility: { gap: 6 },
  possHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  topBadge: { paddingHorizontal: Spacing.sm, paddingVertical: 2, borderRadius: Radius.pill },
  track: { height: 8, borderRadius: 4, overflow: 'hidden' },
  trackTop: { height: 12, borderRadius: 6 },
  fill: { height: '100%', borderRadius: 6, overflow: 'hidden' },
  sampleWrap: { alignItems: 'flex-end', gap: Spacing.xs },
  sampleCaption: { marginRight: Spacing.xs },
  sample: { borderRadius: Radius.lg, borderTopRightRadius: 6, padding: Spacing.lg, gap: Spacing.sm, maxWidth: '92%' },
  copyChip: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-end', paddingHorizontal: Spacing.sm + 2, paddingVertical: 4, borderRadius: Radius.pill },
});
