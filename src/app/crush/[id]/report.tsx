import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Animated, { Easing, FadeInDown, FadeInUp, useAnimatedStyle, useSharedValue, withDelay, withSpring, withTiming } from 'react-native-reanimated';

import { BigNumber, BrandPill, HeroCard, Icon3D } from '@/components/brand/brand';
import { AiReportLink } from '@/components/coach/ai-report-sheet';
import { CountUp } from '@/components/coach/count-up';
import { heatMeta } from '@/components/coach/heat-gauge';
import { PendingBubble } from '@/components/coach/pending-bubble';
import { useCelebrate } from '@/components/fx/celebration';
import { AppText } from '@/components/ui/app-text';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Screen } from '@/components/ui/screen';
import { APP_NAME } from '@/constants/brand';
import { Brand, Radius, Spacing } from '@/constants/theme';
import { kktiLabel } from '@/hooks/use-coach';
import { useAiAction } from '@/hooks/use-ai-action';
import { useResumeAfterPaywall } from '@/hooks/use-resume-after-paywall';
import { useTheme } from '@/hooks/use-theme';
import { isUnlimited, useQuota } from '@/lib/billing/gate';
import { requestAi } from '@/lib/coach-client';
import { crushToRequest, userToRequest } from '@/lib/coach-schema';
import { relativeTime } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { relationshipLabel } from '@/lib/labels';
import type { CrushReport, HeatPoint } from '@/lib/types';
import { buildReportSessions, reportProfileKey, reportRefresh, useAppStore, type ReportRefresh } from '@/store/app-store';

const REPORT_PHRASES = ['지금까지의 대화를 모으는 중…', '호감 신호를 고르는 중…', '그 사람의 연락 패턴을 보는 중…', '공략법을 정리하는 중…', '궁합 점수를 계산하는 중…', '거의 다 됐어요!'];

/** 「다시 분석하기」 버튼 글 — 왜 다시 만들 수 있는지 알려 준다 (막혔거나 예전 보고서면 그냥 「다시 분석하기」) */
const refreshTitle = (refresh: ReportRefresh) => (refresh === 'sessions' ? '새 대화까지 반영해 다시 분석' : refresh === 'profile' ? '바뀐 정보로 다시 분석' : '다시 분석하기');

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
  const { run, busy, error, blockCount } = useAiAction();
  // 횟수가 없어 막혔다면 결제·가입하고 돌아왔을 때 다시 누르지 않아도 한 번 만들어 준다 (막힐 때마다 새로 기억)
  const resume = useResumeAfterPaywall('report');
  const generateRef = useRef<(() => void) | null>(null);
  // 방금 만든 보고서만 궁합 점수를 세어 올린다
  const [fresh, setFresh] = useState(false);
  useEffect(() => {
    if (blockCount > 0) resume.remember(() => generateRef.current?.());
  }, [blockCount, resume]);

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
  const lastDelta = log[log.length - 1]?.delta;
  const report = crush.report;
  const memoryCount = crush.memory?.facts.length ?? 0;
  const profile = { crush: crushToRequest(crush), user: userToRequest(user, kktiLabel(kkti)) };
  const profileKey = reportProfileKey(profile);
  // 지난 보고서 뒤로 새 코칭 기록도, 바뀐 프로필(관계 단계·목표·MBTI·메모·내 정보 등)도 없으면 다시 분석해도 같은 입력이라 막는다 (첫 보고서는 언제나 만들 수 있다)
  const refresh = reportRefresh(report, messages ?? [], profileKey);
  const rel = relationshipLabel(crush.relationship);

  const generate = async () => {
    if (!refresh) return;
    haptic.thud();
    const result = await run(
      'report',
      (o) =>
        requestAi(
          'report',
          {
            // 상대 정보에 「센딧이 기억하는 이야기」도 실려 간다 (crushToRequest)
            ...profile,
            sessions: buildReportSessions(messages ?? []),
            heatLog: log.slice(-40),
          },
          o,
        ),
      { reason: 'report' },
    );
    if (result) {
      saveReport(crush.id, result, analyzed, profileKey);
      setFresh(true);
      celebrate({ kind: 'sparkles', count: 20 });
    } else {
      haptic.error();
    }
  };
  generateRef.current = () => void generate();

  return (
    <Screen contentStyle={styles.content}>
      <Stack.Screen options={{ title: '상대 분석 보고서' }} />

      {/* 상대 + 지금 호감 온도 — 화면의 그라데이션 큰 면은 이것 하나 */}
      <Animated.View entering={FadeInDown.duration(340)}>
        <HeroCard>
          <View style={styles.heroTop}>
            <View style={styles.avatarRing}>
              <Avatar name={crush.name} uri={crush.photoUri} size={52} seed={crush.id} />
            </View>
            <View style={styles.heroTexts}>
              <AppText variant="title2" color={Brand.onBrand} numberOfLines={1}>
                {crush.name}
              </AppText>
              <AppText variant="small" color={Brand.onBrandDim} numberOfLines={1}>
                {rel.label}
                {crush.mbti ? ` · ${crush.mbti}` : ''}
                {crush.age ? ` · ${crush.age}세` : ''}
              </AppText>
            </View>
          </View>
          {crush.goal ? <BrandPill tone="glass" icon="flag" label={`목표 · ${crush.goal}`} style={styles.goal} /> : null}
          <View style={styles.heatRow}>
            <View>
              <AppText variant="smallStrong" color={Brand.onBrandDim}>
                지금 호감 온도
              </AppText>
              <BigNumber value={`${heat}°`} tone="white" style={styles.heroNumber} />
            </View>
            <View style={styles.heatSide}>
              {lastDelta ? (
                <View style={styles.glassChip}>
                  <AppText variant="smallStrong" color={Brand.onBrand}>
                    {lastDelta > 0 ? `+${lastDelta}°` : `−${Math.abs(lastDelta)}°`}
                  </AppText>
                </View>
              ) : null}
              <AppText variant="caption" color={Brand.onBrandDim}>
                {heatMeta(heat).label}
              </AppText>
            </View>
          </View>
          <HeroBar value={heat} />
          <View style={styles.stats}>
            <Stat label="분석" value={`${analyzed}회`} />
            <Stat label="최고 온도" value={`${peak}°`} />
            <Stat label="0°부터" value={`${heat >= 0 ? '+' : ''}${heat}°`} />
          </View>
        </HeroCard>
      </Animated.View>

      {/* 온도 그래프 */}
      <Animated.View entering={FadeInDown.delay(70).duration(320)} style={[styles.section, { backgroundColor: theme.surface }]}>
        <SectionTitle icon="pulse" title="호감 온도 기록" />
        {log.length ? (
          <HeatChart log={log} />
        ) : (
          <AppText variant="small" color="textSecondary">
            아직 기록이 없어요. 대화 캡처를 올리면 0°에서부터 온도가 움직여요.
          </AppText>
        )}
      </Animated.View>

      {/* AI 보고서 */}
      {busy ? (
        <PendingBubble phrases={REPORT_PHRASES} />
      ) : report ? (
        <ReportBody report={report.data} partnerName={crush.name} countUp={fresh} />
      ) : (
        <Animated.View entering={FadeInUp.delay(150)} style={[styles.cta, { backgroundColor: theme.bubbleCoach, borderColor: theme.border }]}>
          <Icon3D name="heart" size={76} float style={styles.ctaIcon} />
          <AppText variant="title2" align="center">
            {crush.name}님을 AI가 분석해 드릴게요
          </AppText>
          <AppText variant="small" color="textSecondary" align="center">
            {analyzed
              ? `지금까지 ${analyzed}번의 코칭 기록으로 성향·호감 신호·공략법·궁합을 정리해요.`
              : '아직 코칭 기록이 없어 프로필만으로 분석해요. 대화를 몇 번 올린 뒤에 하면 훨씬 정확해요.'}
          </AppText>
          {memoryCount ? (
            <View style={[styles.memoryNote, { backgroundColor: theme.primarySoft }]}>
              <Icon3D name="memory" size={22} />
              <AppText variant="caption" color="primary" weight="700">
                {APP_NAME}이 기억하는 이야기 {memoryCount}개도 같이 반영해요
              </AppText>
            </View>
          ) : null}
          <Button title="분석 보고서 만들기" variant="brand" onPress={generate} icon={<Ionicons name="sparkles" size={18} color={Brand.onBrand} />} />
          {quota.enforced && !isUnlimited(quota) ? (
            <AppText variant="caption" color="textTertiary" align="center">
              코칭 1회가 차감돼요
            </AppText>
          ) : null}
        </Animated.View>
      )}

      {error ? (
        <View style={[styles.error, { backgroundColor: theme.surface }]}>
          <Ionicons name="alert-circle" size={18} color={theme.danger} />
          <AppText variant="small" color="danger" style={styles.flex}>
            {error}
          </AppText>
        </View>
      ) : null}

      {report && !busy ? (
        <View style={styles.footer}>
          <AppText variant="caption" color="textTertiary" align="center">
            {relativeTime(report.at)}에 {report.basedOn}번의 코칭 기록으로 만들었어요
          </AppText>
          <Button title={refreshTitle(refresh)} variant={refresh === 'sessions' || refresh === 'profile' ? 'brand' : 'soft'} onPress={generate} disabled={!refresh} />
          {!refresh ? (
            <AppText variant="caption" color="textTertiary" align="center">
              새 대화를 코칭받거나 상대·내 정보를 바꾸면 다시 분석할 수 있어요
            </AppText>
          ) : null}
        </View>
      ) : null}
      {report && !busy ? <AiReportLink mode="report" report={report.data} label="이 보고서 신고" /> : null}
    </Screen>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <AppText variant="title3" color={Brand.onBrand}>
        {value}
      </AppText>
      <AppText variant="caption" color={Brand.onBrandDim}>
        {label}
      </AppText>
    </View>
  );
}

/** 그라데이션 위의 얇은 흰 막대 — 지금 온도가 -20°~100° 중 어디쯤인지 */
function HeroBar({ value }: { value: number }) {
  const [width, setWidth] = useState(0);
  const p = useSharedValue(0);
  const ratio = Math.max(0, Math.min(1, (value + 20) / 120));
  useEffect(() => {
    p.value = withDelay(250, withTiming(ratio, { duration: 1000, easing: Easing.out(Easing.cubic) }));
  }, [p, ratio]);
  const fill = useAnimatedStyle(() => ({ width: Math.max(8, p.value * width) }));
  return (
    <View onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)} style={styles.heroTrack}>
      {width > 0 ? <Animated.View style={[styles.heroFill, fill]} /> : null}
    </View>
  );
}

/** 막대가 차례로 솟아오르는 온도 그래프 (최근 20번) */
function HeatChart({ log }: { log: HeatPoint[] }) {
  const theme = useTheme();
  const points = log.slice(-20);
  // 눈금은 기록에 맞춘다 (아래는 0° 또는 가장 낮은 영하, 위는 가장 높은 온도보다 조금 위) — 낮은 온도도 막대가 잘 보이게
  const lo = Math.min(0, ...points.map((p) => p.value));
  const hi = Math.max(40, ...points.map((p) => p.value + 10));
  const scale = (v: number) => ((v - lo) / (hi - lo)) * BAR_H;
  return (
    <View style={styles.chart}>
      <View style={[styles.zeroLine, { backgroundColor: theme.border, bottom: 22 + scale(0) }]} />
      {points.map((p, i) => (
        <Bar key={`${p.at}-${i}`} point={p} index={i} last={i === points.length - 1} height={Math.max(4, scale(p.value))} />
      ))}
    </View>
  );
}

const CHART_H = 150;
/** 막대 영역 높이 (위 숫자·아래 날짜 자리를 뺀 값) */
const BAR_H = 104;

function Bar({ point, index, last, height }: { point: HeatPoint; index: number; last: boolean; height: number }) {
  const theme = useTheme();
  const grow = useSharedValue(0);
  useEffect(() => {
    grow.value = withDelay(index * 45, withSpring(1, { damping: 12, stiffness: 140 }));
  }, [grow, index]);
  const style = useAnimatedStyle(() => ({ height: height * grow.value }));
  const d = new Date(point.at);
  return (
    <View style={styles.barSlot}>
      <AppText variant="caption" color={last ? theme.primary : theme.textSecondary} weight="700" style={styles.barValue}>
        {point.value}°
      </AppText>
      <Animated.View style={[styles.bar, style, last ? null : { opacity: 0.55 }]}>
        <LinearGradient colors={[Brand.violet, Brand.blue, Brand.sky]} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={StyleSheet.absoluteFill} />
      </Animated.View>
      <AppText variant="caption" color="textTertiary" style={styles.barDate}>
        {d.getMonth() + 1}/{d.getDate()}
      </AppText>
    </View>
  );
}

/** 대화 궁합 막대 */
function MatchBar({ value, animate }: { value: number; animate: boolean }) {
  const theme = useTheme();
  const [width, setWidth] = useState(0);
  const p = useSharedValue(animate ? 0 : value / 100);
  useEffect(() => {
    if (animate) p.value = withDelay(200, withTiming(value / 100, { duration: 1100, easing: Easing.out(Easing.cubic) }));
    else p.value = value / 100;
  }, [animate, value, p]);
  const fill = useAnimatedStyle(() => ({ width: Math.max(10, p.value * width) }));
  return (
    <View onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)} style={[styles.matchTrack, { backgroundColor: theme.surfaceSelected }]}>
      {width > 0 ? (
        <Animated.View style={[styles.matchFill, fill]}>
          <LinearGradient colors={Brand.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
        </Animated.View>
      ) : null}
    </View>
  );
}

function ReportBody({ report, partnerName, countUp }: { report: CrushReport; partnerName: string; countUp: boolean }) {
  const theme = useTheme();
  return (
    <View style={styles.report}>
      <Animated.View entering={FadeInDown.duration(300)} style={[styles.section, styles.headline, { backgroundColor: theme.bubbleCoach, borderColor: theme.border }]}>
        <AppText variant="smallStrong" color="primary">
          한 줄 요약
        </AppText>
        <AppText variant="title2">{report.headline}</AppText>
        <View style={styles.chips}>
          {report.keywords.map((k) => (
            <View key={k} style={[styles.chip, { backgroundColor: theme.primarySoft }]}>
              <AppText variant="caption" color="primary" weight="700">
                #{k}
              </AppText>
            </View>
          ))}
        </View>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(80).duration(300)} style={[styles.section, { backgroundColor: theme.surface }]}>
        <View style={styles.matchHead}>
          <AppText variant="title3">대화 궁합</AppText>
          <CountUp value={report.compatibility} animate={countUp} ticks suffix="점" style={[styles.matchNumber, { color: theme.primary }]} suffixStyle={[styles.matchUnit, { color: theme.primary }]} />
        </View>
        <MatchBar value={report.compatibility} animate={countUp} />
        <AppText variant="small" color="textSecondary">
          {report.compatibilityNote}
        </AppText>
      </Animated.View>

      <Section delay={140} icon="person" title="성향" body={report.personality} />
      <Section delay={180} icon="chatbubbles" title="연락 스타일" body={report.textingStyle} />
      <Section delay={220} icon="heart" title="호감 신호" lines={report.greenFlags} />
      {report.redFlags.length ? <Section delay={260} icon="alert-circle" title="주의할 신호" lines={report.redFlags} /> : null}

      {report.interests.length ? (
        <Animated.View entering={FadeInDown.delay(300).duration(300)} style={[styles.section, { backgroundColor: theme.surface }]}>
          <SectionTitle icon="pricetags" title="대화 소재" />
          <View style={styles.chips}>
            {report.interests.map((k) => (
              <View key={k} style={[styles.chip, { backgroundColor: theme.bubbleCoach }]}>
                <AppText variant="caption" weight="700">
                  {k}
                </AppText>
              </View>
            ))}
          </View>
        </Animated.View>
      ) : null}

      <Section delay={340} icon="bulb" title="잘 먹히는 공략법" lines={report.strategy} numbered />

      {report.roadmap.length ? (
        <Animated.View entering={FadeInDown.delay(380).duration(300)} style={[styles.section, { backgroundColor: theme.surface }]}>
          <SectionTitle icon="map" title="목표까지 로드맵" />
          {report.roadmap.map((step, i) => (
            <View key={i} style={styles.step}>
              <View style={styles.stepRail}>
                <LinearGradient colors={Brand.button} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.stepDot}>
                  <AppText variant="caption" color={Brand.onBrand} weight="800">
                    {i + 1}
                  </AppText>
                </LinearGradient>
                {i < report.roadmap.length - 1 ? <View style={[styles.stepLine, { backgroundColor: theme.border }]} /> : null}
              </View>
              <View style={styles.stepTexts}>
                <AppText variant="bodyStrong">{step.title}</AppText>
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
          <SectionTitle icon="chatbubble-ellipses" title={`${partnerName}님의 속마음 (추측)`} />
          <View style={[styles.thought, { backgroundColor: theme.bubbleCoach }]}>
            <AppText variant="body">{report.innerThought}</AppText>
          </View>
        </Animated.View>
      ) : null}
    </View>
  );
}

function SectionTitle({ icon, title }: { icon: keyof typeof Ionicons.glyphMap; title: string }) {
  const theme = useTheme();
  return (
    <View style={styles.sectionTitle}>
      <View style={[styles.sectionIcon, { backgroundColor: theme.primarySoft }]}>
        <Ionicons name={icon} size={15} color={theme.primary} />
      </View>
      <AppText variant="title3" style={styles.flex}>
        {title}
      </AppText>
    </View>
  );
}

function Section({ icon, title, body, lines, numbered, delay = 0 }: { icon: keyof typeof Ionicons.glyphMap; title: string; body?: string; lines?: string[]; numbered?: boolean; delay?: number }) {
  const theme = useTheme();
  return (
    <Animated.View entering={FadeInDown.delay(delay).duration(300)} style={[styles.section, { backgroundColor: theme.surface }]}>
      <SectionTitle icon={icon} title={title} />
      {body ? (
        <AppText variant="small" color="textSecondary">
          {body}
        </AppText>
      ) : null}
      {lines?.map((line, i) => (
        <View key={i} style={styles.line}>
          <AppText variant="small" color="primary" weight="800" style={styles.lineMark}>
            {numbered ? `${i + 1}` : '·'}
          </AppText>
          <AppText variant="small" color="textSecondary" style={styles.flex}>
            {line}
          </AppText>
        </View>
      ))}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  content: { gap: Spacing.lg, paddingTop: Spacing.md },
  flex: { flex: 1 },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  avatarRing: { padding: 3, borderRadius: 24, backgroundColor: Brand.glass, borderWidth: 1, borderColor: Brand.glassBorder },
  heroTexts: { flex: 1, gap: 2 },
  goal: { marginTop: Spacing.md },
  heatRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: Spacing.lg },
  heroNumber: { fontSize: 56, lineHeight: 62 },
  heatSide: { alignItems: 'flex-end', gap: 6, paddingBottom: 8 },
  glassChip: { paddingHorizontal: Spacing.md, paddingVertical: 5, borderRadius: Radius.pill, backgroundColor: Brand.glass, borderWidth: 1, borderColor: Brand.glassBorder },
  heroTrack: { height: 8, borderRadius: Radius.pill, backgroundColor: Brand.glass, overflow: 'hidden', marginTop: Spacing.sm },
  heroFill: { height: '100%', borderRadius: Radius.pill, backgroundColor: Brand.onBrand },
  stats: { flexDirection: 'row', justifyContent: 'space-around', marginTop: Spacing.lg },
  stat: { alignItems: 'center', gap: 2 },
  section: { borderRadius: Radius.xl, padding: Spacing.lg, gap: Spacing.sm + 2 },
  sectionTitle: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  sectionIcon: { width: 28, height: 28, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  headline: { borderWidth: 1 },
  chart: { height: CHART_H, flexDirection: 'row', alignItems: 'flex-end', gap: 6, paddingTop: Spacing.sm },
  zeroLine: { position: 'absolute', left: 0, right: 0, height: 1 },
  barSlot: { flex: 1, maxWidth: 34, height: CHART_H, justifyContent: 'flex-end', alignItems: 'center' },
  barValue: { fontSize: 12, lineHeight: 16, marginBottom: 2 },
  bar: { width: '100%', borderRadius: 8, minHeight: 4, overflow: 'hidden' },
  barDate: { fontSize: 12, lineHeight: 16, marginTop: 4, height: 18 },
  cta: { borderRadius: Radius.xl, borderWidth: 1, padding: Spacing.xl, gap: Spacing.md, alignItems: 'stretch' },
  ctaIcon: { alignSelf: 'center' },
  memoryNote: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, alignSelf: 'center', paddingHorizontal: Spacing.md, paddingVertical: 6, borderRadius: Radius.pill },
  error: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'flex-start', borderRadius: Radius.md, padding: Spacing.md },
  footer: { gap: Spacing.sm, marginTop: Spacing.sm },
  report: { gap: Spacing.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs + 2 },
  chip: { paddingHorizontal: Spacing.sm + 2, paddingVertical: 5, borderRadius: Radius.pill },
  matchHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  matchNumber: { fontSize: 40, lineHeight: 46, fontWeight: '900', letterSpacing: -1.4 },
  matchUnit: { fontSize: 18, fontWeight: '800' },
  matchTrack: { height: 10, borderRadius: Radius.pill, overflow: 'hidden' },
  matchFill: { height: '100%', borderRadius: Radius.pill, overflow: 'hidden' },
  line: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'flex-start' },
  lineMark: { width: 12, textAlign: 'center' },
  step: { flexDirection: 'row', gap: Spacing.md },
  stepRail: { alignItems: 'center', width: 26 },
  stepDot: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  stepLine: { width: 2, flex: 1, minHeight: 16, marginVertical: 2 },
  stepTexts: { flex: 1, gap: 2, paddingBottom: Spacing.md },
  thought: { borderRadius: Radius.lg, borderBottomLeftRadius: 4, padding: Spacing.md },
});
