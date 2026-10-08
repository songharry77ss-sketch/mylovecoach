import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, FadeInUp, useAnimatedStyle, useSharedValue, withDelay, withSpring } from 'react-native-reanimated';

import { AiReportLink } from '@/components/coach/ai-report-sheet';
import { HeatGauge, heatMeta } from '@/components/coach/heat-gauge';
import { PendingBubble } from '@/components/coach/pending-bubble';
import { useCelebrate } from '@/components/fx/celebration';
import { AnimatedNumber } from '@/components/ui/animated-number';
import { AppText } from '@/components/ui/app-text';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Screen } from '@/components/ui/screen';
import { Radius, Spacing, palette } from '@/constants/theme';
import { kktiLabel } from '@/hooks/use-coach';
import { useAiAction } from '@/hooks/use-ai-action';
import { useTheme } from '@/hooks/use-theme';
import { isUnlimited, useQuota } from '@/lib/billing/gate';
import { requestAi } from '@/lib/coach-client';
import { crushToRequest, userToRequest } from '@/lib/coach-schema';
import { relativeTime } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { relationshipLabel } from '@/lib/labels';
import type { CrushReport, HeatPoint } from '@/lib/types';
import { buildReportSessions, useAppStore } from '@/store/app-store';

const REPORT_PHRASES = ['지금까지의 대화를 모으는 중…', '호감 신호를 고르는 중…', '그 사람의 연락 패턴을 보는 중…', '공략법을 정리하는 중…', '궁합 점수를 계산하는 중…', '거의 다 됐어요!'];

export default function CrushReportScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const router = useRouter();
  const celebrate = useCelebrate();
  const crush = useAppStore((s) => (id ? s.crushes[id] : undefined));
  const messages = useAppStore((s) => (id ? s.messages[id] : undefined));
  const user = useAppStore((s) => s.user);
  const kkti = useAppStore((s) => s.kkti);
  const saveReport = useAppStore((s) => s.saveReport);
  const quota = useQuota();
  const { run, busy, error } = useAiAction();

  const analyzed = useMemo(() => (messages ?? []).filter((m) => m.analysis).length, [messages]);

  if (!crush || !user) {
    return (
      <Screen>
        <Stack.Screen options={{ title: '상대 분석 보고서' }} />
        <EmptyState emoji="🫥" title="채팅방을 찾을 수 없어요" actionTitle="홈으로" onAction={() => router.dismissTo?.('/(tabs)')} />
      </Screen>
    );
  }

  const heat = crush.heat ?? 0;
  const log = crush.heatLog ?? [];
  const peak = log.reduce((m, p) => Math.max(m, p.value), heat);
  const report = crush.report;
  const stale = report && analyzed > report.basedOn;
  const rel = relationshipLabel(crush.relationship);

  const generate = async () => {
    haptic.thud();
    const result = await run(
      'report',
      (o) =>
        requestAi(
          'report',
          {
            crush: crushToRequest(crush),
            user: userToRequest(user, kktiLabel(kkti)),
            sessions: buildReportSessions(messages ?? []),
            heatLog: log.slice(-40),
          },
          o,
        ),
      { reason: 'report' },
    );
    if (result) {
      saveReport(crush.id, result, analyzed);
      celebrate({ kind: 'sparkles', count: 20 });
    } else {
      haptic.error();
    }
  };

  return (
    <Screen contentStyle={styles.content}>
      <Stack.Screen options={{ title: '상대 분석 보고서' }} />

      {/* 상대 카드 + 지금 온도 */}
      <Animated.View entering={FadeInDown.duration(320)}>
        <LinearGradient colors={[palette.lavender100, palette.pink100]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
          <View style={styles.heroTop}>
            <Avatar name={crush.name} uri={crush.photoUri} size={56} seed={crush.id} />
            <View style={styles.heroTexts}>
              <AppText variant="title2" color={palette.gray900}>
                {crush.name}
              </AppText>
              <AppText variant="small" color={palette.gray700}>
                {rel.emoji} {rel.label}
                {crush.mbti ? ` · ${crush.mbti}` : ''}
                {crush.age ? ` · ${crush.age}세` : ''}
              </AppText>
              {crush.goal ? (
                <AppText variant="caption" color={palette.pink600} weight="700">
                  🎯 목표: {crush.goal}
                </AppText>
              ) : null}
            </View>
          </View>
          <View style={[styles.gaugeBox, { backgroundColor: 'rgba(255,255,255,0.75)' }]}>
            <HeatGauge value={heat} />
          </View>
          <View style={styles.stats}>
            <Stat label="분석" value={`${analyzed}회`} />
            <Stat label="최고 온도" value={`${peak}°`} />
            <Stat label="0°부터" value={`${heat >= 0 ? '+' : ''}${heat}°`} />
          </View>
        </LinearGradient>
      </Animated.View>

      {/* 온도 그래프 */}
      <View style={[styles.section, { backgroundColor: theme.surface }]}>
        <AppText variant="title3">🌡️ 호감 온도 기록</AppText>
        {log.length ? (
          <HeatChart log={log} />
        ) : (
          <AppText variant="small" color="textSecondary">
            아직 기록이 없어요. 대화 캡처를 올리면 0°에서부터 온도가 움직여요.
          </AppText>
        )}
      </View>

      {/* AI 보고서 */}
      {busy ? (
        <PendingBubble phrases={REPORT_PHRASES} />
      ) : report ? (
        <ReportBody report={report.data} partnerName={crush.name} />
      ) : (
        <Animated.View entering={FadeInUp.delay(150)} style={[styles.cta, { backgroundColor: theme.primarySoft }]}>
          <AppText style={styles.ctaEmoji}>📊</AppText>
          <AppText variant="title3" align="center">
            {crush.name}님을 AI가 분석해 드릴게요
          </AppText>
          <AppText variant="small" color="textSecondary" align="center">
            {analyzed
              ? `지금까지 ${analyzed}번의 코칭 기록으로 성향·호감 신호·공략법·궁합을 정리해요.`
              : '아직 코칭 기록이 없어 프로필만으로 분석해요. 대화를 몇 번 올린 뒤에 하면 훨씬 정확해요.'}
          </AppText>
          <Button title="분석 보고서 만들기" onPress={generate} icon={<Ionicons name="sparkles" size={18} color={theme.primaryText} />} />
          {quota.enforced && !isUnlimited(quota) ? (
            <AppText variant="caption" color="textTertiary" align="center">
              코칭 1회가 차감돼요
            </AppText>
          ) : null}
        </Animated.View>
      )}

      {error ? (
        <View style={[styles.error, { backgroundColor: theme.accentSoft }]}>
          <AppText variant="small" color="danger">
            {error}
          </AppText>
        </View>
      ) : null}

      {report && !busy ? (
        <View style={styles.footer}>
          <AppText variant="caption" color="textTertiary" align="center">
            {relativeTime(report.at)}에 {report.basedOn}번의 코칭 기록으로 만들었어요
          </AppText>
          <Button title={stale ? '새 대화까지 반영해 다시 분석' : '다시 분석하기'} variant={stale ? 'primary' : 'soft'} onPress={generate} />
        </View>
      ) : null}
      {report && !busy ? <AiReportLink mode="report" report={report.data} label="이 보고서 신고" /> : null}
    </Screen>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <AppText variant="title3" color={palette.gray900}>
        {value}
      </AppText>
      <AppText variant="caption" color={palette.gray700}>
        {label}
      </AppText>
    </View>
  );
}

/** 막대가 차례로 솟아오르는 온도 그래프 (최근 20번) */
function HeatChart({ log }: { log: HeatPoint[] }) {
  const theme = useTheme();
  const points = log.slice(-20);
  return (
    <View style={styles.chart}>
      <View style={[styles.zeroLine, { backgroundColor: theme.border, bottom: 22 + (20 / 120) * BAR_H }]} />
      {points.map((p, i) => (
        <Bar key={`${p.at}-${i}`} point={p} index={i} />
      ))}
    </View>
  );
}

const CHART_H = 150;
/** 막대 영역 높이 (위 숫자·아래 날짜 자리를 뺀 값) */
const BAR_H = 104;

function Bar({ point, index }: { point: HeatPoint; index: number }) {
  const grow = useSharedValue(0);
  useEffect(() => {
    grow.value = withDelay(index * 45, withSpring(1, { damping: 12, stiffness: 140 }));
  }, [grow, index]);
  const height = Math.max(4, ((point.value + 20) / 120) * BAR_H);
  const style = useAnimatedStyle(() => ({ height: height * grow.value }));
  const d = new Date(point.at);
  return (
    <View style={styles.barSlot}>
      <AppText variant="caption" color={heatMeta(point.value).color} weight="700" style={styles.barValue}>
        {point.value}°
      </AppText>
      <Animated.View style={[styles.bar, { backgroundColor: heatMeta(point.value).color }, style]} />
      <AppText variant="caption" color="textTertiary" style={styles.barDate}>
        {d.getMonth() + 1}/{d.getDate()}
      </AppText>
    </View>
  );
}

function ReportBody({ report, partnerName }: { report: CrushReport; partnerName: string }) {
  const theme = useTheme();
  return (
    <View style={styles.report}>
      <Animated.View entering={FadeInDown.duration(300)} style={[styles.section, { backgroundColor: theme.surfaceElevated, borderColor: theme.border, borderWidth: 1 }]}>
        <AppText variant="caption" color="accent" weight="700">
          한 줄 요약
        </AppText>
        <AppText variant="title2">{report.headline}</AppText>
        <View style={styles.chips}>
          {report.keywords.map((k) => (
            <View key={k} style={[styles.chip, { backgroundColor: theme.accentSoft }]}>
              <AppText variant="caption" color="accent" weight="700">
                #{k}
              </AppText>
            </View>
          ))}
        </View>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(80).duration(300)} style={[styles.matchCard, { backgroundColor: theme.surface }]}>
        <View style={styles.matchScore}>
          <AnimatedNumber value={report.compatibility} suffix="점" variant="display" color="accent" />
          <AppText variant="caption" color="textTertiary">
            대화 궁합
          </AppText>
        </View>
        <AppText variant="small" color="textSecondary" style={styles.flex}>
          {report.compatibilityNote}
        </AppText>
      </Animated.View>

      <Section delay={140} title="🧩 성향" body={report.personality} />
      <Section delay={180} title="💬 연락 스타일" body={report.textingStyle} />
      <Section delay={220} title="💚 호감 신호" lines={report.greenFlags} />
      {report.redFlags.length ? <Section delay={260} title="🚩 주의할 신호" lines={report.redFlags} tone="accent" /> : null}

      {report.interests.length ? (
        <Animated.View entering={FadeInDown.delay(300).duration(300)} style={[styles.section, { backgroundColor: theme.surface }]}>
          <AppText variant="title3">🎯 대화 소재</AppText>
          <View style={styles.chips}>
            {report.interests.map((k) => (
              <View key={k} style={[styles.chip, { backgroundColor: theme.primarySoft }]}>
                <AppText variant="caption" color="primary" weight="700">
                  {k}
                </AppText>
              </View>
            ))}
          </View>
        </Animated.View>
      ) : null}

      <Section delay={340} title="🧠 잘 먹히는 공략법" lines={report.strategy} numbered />

      {report.roadmap.length ? (
        <Animated.View entering={FadeInDown.delay(380).duration(300)} style={[styles.section, { backgroundColor: theme.surface }]}>
          <AppText variant="title3">🗺️ 목표까지 로드맵</AppText>
          {report.roadmap.map((step, i) => (
            <View key={i} style={styles.step}>
              <View style={styles.stepRail}>
                <View style={[styles.stepDot, { backgroundColor: theme.primary }]}>
                  <AppText variant="caption" color={theme.primaryText} weight="800">
                    {i + 1}
                  </AppText>
                </View>
                {i < report.roadmap.length - 1 ? <View style={[styles.stepLine, { backgroundColor: theme.border }]} /> : null}
              </View>
              <View style={styles.stepTexts}>
                <AppText variant="smallStrong">{step.title}</AppText>
                <AppText variant="small" color="textSecondary">
                  {step.action}
                </AppText>
              </View>
            </View>
          ))}
        </Animated.View>
      ) : null}

      {report.innerThought ? (
        <Animated.View entering={FadeInDown.delay(420).duration(300)} style={[styles.section, { backgroundColor: theme.surface }]}>
          <AppText variant="title3">💭 {partnerName}님의 속마음 (추측)</AppText>
          <View style={[styles.thought, { backgroundColor: theme.background, borderColor: theme.border }]}>
            <AppText variant="body">{report.innerThought}</AppText>
          </View>
        </Animated.View>
      ) : null}
    </View>
  );
}

function Section({ title, body, lines, tone, numbered, delay = 0 }: { title: string; body?: string; lines?: string[]; tone?: 'accent'; numbered?: boolean; delay?: number }) {
  const theme = useTheme();
  return (
    <Animated.View entering={FadeInDown.delay(delay).duration(300)} style={[styles.section, { backgroundColor: theme.surface }]}>
      <AppText variant="title3">{title}</AppText>
      {body ? (
        <AppText variant="small" color="textSecondary">
          {body}
        </AppText>
      ) : null}
      {lines?.map((line, i) => (
        <AppText key={i} variant="small" color={tone === 'accent' ? 'accent' : 'textSecondary'}>
          {numbered ? `${i + 1}. ` : '· '}
          {line}
        </AppText>
      ))}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  content: { gap: Spacing.lg, paddingTop: Spacing.md },
  flex: { flex: 1 },
  hero: { borderRadius: Radius.xl, padding: Spacing.lg, gap: Spacing.lg },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  heroTexts: { flex: 1, gap: 2 },
  gaugeBox: { borderRadius: Radius.lg, padding: Spacing.md },
  stats: { flexDirection: 'row', justifyContent: 'space-around' },
  stat: { alignItems: 'center', gap: 2 },
  section: { borderRadius: Radius.lg, padding: Spacing.lg, gap: Spacing.sm },
  chart: { height: CHART_H, flexDirection: 'row', alignItems: 'flex-end', gap: 6, paddingTop: Spacing.sm },
  zeroLine: { position: 'absolute', left: 0, right: 0, height: 1 },
  barSlot: { flex: 1, maxWidth: 34, height: CHART_H, justifyContent: 'flex-end', alignItems: 'center' },
  barValue: { fontSize: 10, lineHeight: 14, marginBottom: 2 },
  bar: { width: '100%', borderRadius: 6, minHeight: 4 },
  barDate: { fontSize: 10, lineHeight: 14, marginTop: 4, height: 18 },
  cta: { borderRadius: Radius.xl, padding: Spacing.xl, gap: Spacing.md, alignItems: 'stretch' },
  ctaEmoji: { fontSize: 40, lineHeight: 48, textAlign: 'center' },
  error: { borderRadius: Radius.md, padding: Spacing.md },
  footer: { gap: Spacing.sm, marginTop: Spacing.sm },
  report: { gap: Spacing.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs },
  chip: { paddingHorizontal: Spacing.sm + 2, paddingVertical: 4, borderRadius: Radius.pill },
  matchCard: { borderRadius: Radius.lg, padding: Spacing.lg, flexDirection: 'row', alignItems: 'center', gap: Spacing.lg },
  matchScore: { alignItems: 'center' },
  step: { flexDirection: 'row', gap: Spacing.md },
  stepRail: { alignItems: 'center', width: 24 },
  stepDot: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  stepLine: { width: 2, flex: 1, minHeight: 16, marginVertical: 2 },
  stepTexts: { flex: 1, gap: 2, paddingBottom: Spacing.md },
  thought: { borderRadius: Radius.lg, borderTopLeftRadius: 4, borderWidth: 1, padding: Spacing.md },
});
