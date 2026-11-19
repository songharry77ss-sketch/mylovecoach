import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, FadeInDown, ZoomIn, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';

import { AiReportLink } from '@/components/coach/ai-report-sheet';
import { PendingBubble } from '@/components/coach/pending-bubble';
import { useCelebrate } from '@/components/fx/celebration';
import { useCostNote } from '@/components/tips/tip-book';
import { AnimatedNumber } from '@/components/ui/animated-number';
import { AppText } from '@/components/ui/app-text';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Screen } from '@/components/ui/screen';
import { useToast } from '@/components/ui/toast';
import { Brand, Radius, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useMindReading, type MindOutcome } from '@/hooks/use-mind-reading';
import { onSalePrice, usePlanProducts } from '@/hooks/use-plan-products';
import { useResumeAfterPaywall } from '@/hooks/use-resume-after-paywall';
import { useTheme } from '@/hooks/use-theme';
import { haptic } from '@/lib/haptics';
import { themLabel } from '@/lib/mind-cards';
import type { Gender } from '@/lib/types';
import { useAppStore } from '@/store/app-store';

const PHRASES = ['그 사람 입장이 되어 보는 중…', '흔한 경우의 수를 따져 보는 중…', '속마음을 받아 적는 중…', '가능성을 계산하는 중…', '거의 다 됐어요!'];

/** 결과가 나오면 두근, 실패하면 툭 */
const feel = (outcome: MindOutcome) => {
  if (outcome === 'failed') haptic.error();
  else if (outcome) haptic.heartbeat();
};

/**
 * 속마음 풀이 결과 — 상황 카드나 직접 쓴 질문을 받아 「그 사람」의 속마음을 보여 준다.
 * 1.4 「깔끔하게」 개편: 채팅방과 같은 대화 모양 — 내 질문은 오른쪽 말풍선, 속마음 한마디는 왼쪽 회색 말풍선,
 * 그 아래 회색 결과 카드 한 장(바로 보낼 문장 + 검정 「복사」 → 가능성 세 가지 키-값 줄 → 이렇게 해 봐요 → 알약 버튼).
 * 예전의 큰 파란 카드·3D 하트·「1위」 배지·연파랑 상자·파란 작은 라벨 넷을 걷었다. 큰 숫자는 가장 큰 가능성 하나.
 */
export default function MindScreen() {
  const params = useLocalSearchParams<{ situation?: string; perspective?: string; history?: string }>();
  const theme = useTheme();
  const dark = useColorScheme() === 'dark';
  const router = useRouter();
  const toast = useToast();
  const celebrate = useCelebrate();
  const history = useAppStore((s) => s.mindHistory);
  const hasDayPass = onSalePrice(usePlanProducts(), 'day') != null;
  // 「다시 풀이」가 무료 1회를 쓰는지 — 남았으면 버튼에 「· 1회」, 0회면 「무료 횟수를 다 썼어요」(예전엔 0회에도 「1회가 차감돼요」였다)
  const again = useCostNote('다시 풀면');
  // 기록에서 연 풀이는 처음 연 그 기록을 계속 보여 준다 (다시 풀면 기록 순서가 바뀌어도 화면이 다른 기록으로 넘어가지 않게)
  const [fromHistory] = useState(() => (params.history != null ? history[Number(params.history)] : undefined));
  const perspective: Gender = fromHistory?.perspective ?? (params.perspective === 'female' || params.perspective === 'other' ? params.perspective : 'male');
  const situation = fromHistory?.situation ?? params.situation ?? '';
  const { reading, reused, ask, retry, busy, error, blocked, blockCount, openPaywall } = useMindReading(situation, perspective, fromHistory?.reading);
  const started = useRef(false);
  // 복사한 문장 — 다시 풀어 문장이 바뀌면 「복사했어요」가 저절로 꺼진다
  const [copiedText, setCopiedText] = useState<string | null>(null);
  const copied = copiedText != null && copiedText === reading?.sampleReply;

  // 회색 면(말풍선·결과 카드)과 그 안의 흰 카드 — 다크는 한 단계씩 밝게
  const bubble = dark ? theme.surface : theme.bubbleCoach;
  const inner = dark ? theme.surfaceElevated : theme.card;

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
    haptic.success();
    setCopiedText(reading.sampleReply);
    celebrate({ kind: 'sparkles', count: 12, haptic: false });
    toast.show('복사했어요. 카톡에 붙여넣기만 하면 끝!', 'success');
  };

  const who = themLabel(perspective);

  return (
    <Screen contentStyle={styles.content}>
      {/* 내 질문 — 채팅방의 내 말풍선과 같은 모양 */}
      <Animated.View entering={FadeInDown.duration(300)} style={[styles.mine, { backgroundColor: theme.bubbleUser }]} accessibilityLabel={`물어본 상황: ${situation || '없음'}`}>
        <AppText variant="body">{situation || '물어볼 상황이 없어요.'}</AppText>
      </Animated.View>

      {busy ? <PendingBubble phrases={PHRASES} /> : null}

      {/* 무료 횟수를 다 썼을 때 — 무엇을 받게 되는지 항목만 보여 주고(가짜 결과를 깔지 않는다) 이용권으로 */}
      {blocked && !reading ? (
        <Animated.View entering={FadeInDown.duration(300)} style={[styles.card, { backgroundColor: bubble }]}>
          <View style={styles.block}>
            <AppText variant="bodyStrong">무료 횟수를 다 썼어요</AppText>
            <AppText variant="small" color="textSecondary">
              {hasDayPass ? '하루 이용권이면 지금부터 24시간 동안 속마음을 마음껏 물어볼 수 있어요.' : '이용권이면 횟수 걱정 없이 속마음을 마음껏 물어볼 수 있어요.'}
            </AppText>
          </View>
          <View style={[styles.inner, { backgroundColor: inner }]}>
            <AppText variant="caption" color="textSecondary" weight="600">
              풀이에 나오는 것
            </AppText>
            {['그 사람의 속마음 한마디', '가능성 세 가지와 그 숫자', '바로 보낼 수 있는 문장'].map((line) => (
              <View key={line} style={styles.checkRow}>
                <Ionicons name="checkmark" size={16} color={theme.textSecondary} />
                <AppText variant="small">{line}</AppText>
              </View>
            ))}
          </View>
          <AppText variant="caption" color="textSecondary">
            최근에 본 속마음은 횟수 없이 계속 볼 수 있어요
          </AppText>
          <View style={styles.pills}>
            <Pill title="이용권 보기" tone="blue" onPress={() => openPaywall('mind')} />
            <Pill title="다시 시도" tone="white" fill={inner} onPress={() => retry().then(feel)} />
          </View>
        </Animated.View>
      ) : null}

      {error ? (
        <View style={[styles.card, { backgroundColor: bubble }]}>
          <AppText variant="small" color="danger">
            {error}
          </AppText>
          <View style={styles.pills}>
            <Pill title="다시 시도" tone="white" fill={inner} onPress={() => retry().then(feel)} />
          </View>
        </View>
      ) : null}

      {reading && !busy ? (
        <>
          {reused ? (
            <AppText variant="caption" color="textSecondary" align="center">
              전에 풀어 본 상황이라 저장된 풀이를 보여 드려요
            </AppText>
          ) : null}

          {/* 그 사람의 속마음 한마디 — 왼쪽 회색 말풍선 */}
          <Animated.View entering={ZoomIn.duration(280)} style={[styles.voice, { backgroundColor: bubble }]}>
            <AppText variant="caption" color="textSecondary" weight="600">
              {who}의 속마음
            </AppText>
            <AppText variant="title3" weight="700" style={styles.voiceText}>
              {reading.innerVoice}
            </AppText>
          </Animated.View>

          {/* 결과 카드 한 장 — 보낼 문장(가장 쓸모 있는 것)을 맨 위로 */}
          <Animated.View entering={FadeInDown.delay(160).duration(320)} style={[styles.card, { backgroundColor: bubble }]}>
            {reading.sampleReply ? (
              <View style={styles.block}>
                <AppText variant="bodyStrong">이렇게 보내 봐요</AppText>
                <PressableScale
                  feedback={false}
                  pressedScale={0.98}
                  onPress={copySample}
                  accessibilityLabel={copied ? '보낼 메시지 복사했어요' : `보낼 메시지 예시 복사: ${reading.sampleReply}`}
                  style={[styles.inner, { backgroundColor: inner, borderColor: copied ? theme.primary : 'transparent' }]}>
                  <AppText style={[styles.sampleText, { color: theme.text }]}>{reading.sampleReply}</AppText>
                  {/* 카드마다 색이 찬 버튼은 「복사」 하나 — 검정 알약, 복사하면 센딧 파랑(채팅방 답장 카드와 같다) */}
                  <View style={[styles.copyPill, { backgroundColor: copied ? theme.primary : theme.text }]}>
                    {copied ? <Ionicons name="checkmark" size={15} color={Brand.onBrand} /> : null}
                    <AppText variant="smallStrong" color={copied ? Brand.onBrand : theme.background}>
                      {copied ? '복사했어요' : '복사'}
                    </AppText>
                  </View>
                </PressableScale>
              </View>
            ) : null}

            {/* 가능성 세 가지 — 흰 카드 하나에 키-값 줄. 큰 숫자는 첫째 하나 */}
            <View style={[styles.inner, { backgroundColor: inner }]}>
              <AppText variant="bodyStrong">{reading.headline}</AppText>
              {reading.possibilities.map((p, i) => (
                <Possibility key={p.label} label={p.label} percent={p.percent} reason={p.reason} index={i} divider={i > 0} />
              ))}
            </View>

            <View style={styles.block}>
              <AppText variant="smallStrong">이렇게 해 봐요</AppText>
              <AppText variant="small" color="textSecondary" style={styles.advice}>
                {reading.advice}
              </AppText>
            </View>

            <View style={styles.footer}>
              <View style={styles.pills}>
                <Pill title="다른 상황 물어보기" tone="white" fill={inner} onPress={() => router.back()} />
                {/* 저장된 풀이 대신 AI 에게 새로 묻는다 — 무료 1회를 쓰면 누르기 전에 「· 1회」 */}
                <Pill title={`다시 풀이${again.suffix}`} a11y="다시 풀이" hint={again.suffix ? '무료 코칭 1회를 써요' : undefined} tone="white" fill={inner} onPress={() => ask(true).then(feel)} />
              </View>
            </View>
            {again.out && again.note ? (
              <AppText variant="caption" color="textSecondary">
                {again.note}
              </AppText>
            ) : null}
          </Animated.View>

          <View style={styles.report}>
            <AiReportLink mode="mind" situation={situation} reading={reading} label="이 풀이 신고" />
          </View>
        </>
      ) : null}
    </Screen>
  );
}

/** 알약 버튼 — 파랑(주요) · 흰색(회색 카드 안 보조). 높이 44 */
function Pill({ title, onPress, tone, fill, a11y, hint }: { title: string; onPress: () => void; tone: 'blue' | 'white'; fill?: string; a11y?: string; hint?: string }) {
  const theme = useTheme();
  const blue = tone === 'blue';
  return (
    <PressableScale
      feedback="tap"
      pressedScale={0.97}
      onPress={onPress}
      accessibilityLabel={a11y ?? title}
      accessibilityHint={hint}
      style={[styles.pill, { backgroundColor: blue ? Brand.blue : (fill ?? theme.card) }]}>
      <AppText variant="smallStrong" color={blue ? Brand.onBrand : theme.text}>
        {title}
      </AppText>
    </PressableScale>
  );
}

/** 가능성 한 줄 — 이름 · 숫자(첫째만 크게 파랑) · 가는 막대 · 이유 */
function Possibility({ label, percent, reason, index, divider }: { label: string; percent: number; reason: string; index: number; divider: boolean }) {
  const theme = useTheme();
  const w = useSharedValue(0);
  useEffect(() => {
    w.value = withDelay(300 + index * 160, withTiming(percent, { duration: 900, easing: Easing.out(Easing.cubic) }));
  }, [percent, index, w]);
  const bar = useAnimatedStyle(() => ({ width: `${w.value}%` }));
  const top = index === 0;
  return (
    <View style={[styles.possibility, divider && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.separator, paddingTop: Spacing.md }]}>
      <View style={styles.possHead}>
        <AppText variant={top ? 'bodyStrong' : 'smallStrong'} style={styles.flex}>
          {label}
        </AppText>
        <AnimatedNumber
          value={percent}
          suffix="%"
          delay={300 + index * 160}
          duration={900}
          ticks={top}
          variant="smallStrong"
          color={top ? 'primary' : 'textSecondary'}
          style={top ? styles.topNumber : null}
        />
      </View>
      <View style={[styles.track, { backgroundColor: theme.surface }]}>
        <Animated.View style={[styles.fill, { backgroundColor: top ? theme.primary : theme.textTertiary }, bar]} />
      </View>
      <AppText variant="caption" color="textSecondary">
        {reason}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { gap: Spacing.md, paddingTop: Spacing.md },
  flex: { flex: 1 },
  // 내 말풍선 — 오른쪽, 이어지는 쪽 모서리만 작게
  mine: { alignSelf: 'flex-end', maxWidth: '85%', borderRadius: 22, borderBottomRightRadius: 6, paddingHorizontal: Spacing.lg - 2, paddingVertical: Spacing.sm + 3 },
  voice: { alignSelf: 'flex-start', maxWidth: '92%', borderRadius: 22, borderTopLeftRadius: 6, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, gap: 4 },
  voiceText: { fontSize: 18, lineHeight: 26, letterSpacing: -0.3 },
  // 회색 결과 카드 — 테두리·그림자 없이 면 하나(채팅방 결과 카드와 같은 결)
  card: { borderRadius: 24, borderTopLeftRadius: 6, padding: Spacing.md + 2, gap: Spacing.lg },
  block: { gap: Spacing.sm, paddingHorizontal: 2 },
  inner: { borderRadius: 20, padding: Spacing.md + 2, gap: Spacing.md, borderWidth: 1.5, borderColor: 'transparent' },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sampleText: { fontSize: 16, lineHeight: 24, fontWeight: '500', letterSpacing: -0.2 },
  copyPill: { alignSelf: 'flex-end', height: 36, minWidth: 60, paddingHorizontal: 14, borderRadius: Radius.pill, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
  possibility: { gap: 6 },
  possHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  // 카드의 큰 숫자는 이것 하나
  topNumber: { fontSize: 24, lineHeight: 30, fontWeight: '700', letterSpacing: -0.6 },
  track: { height: 6, borderRadius: Radius.pill, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: Radius.pill },
  advice: { lineHeight: 21 },
  footer: { marginTop: -Spacing.xs },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  pill: { height: 44, paddingHorizontal: Spacing.lg, borderRadius: Radius.pill, alignItems: 'center', justifyContent: 'center' },
  report: { alignItems: 'flex-end' },
});
