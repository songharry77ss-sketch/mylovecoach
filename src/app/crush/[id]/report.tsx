import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, useAnimatedStyle, useSharedValue, withDelay, withSpring } from 'react-native-reanimated';

import { AiReportLink } from '@/components/coach/ai-report-sheet';
import { CountUp } from '@/components/coach/count-up';
import { heatMeta } from '@/components/coach/heat-gauge';
import { PendingBubble } from '@/components/coach/pending-bubble';
import { crushDisplayName, isUnnamedCrush } from '@/components/crush/crush-name';
import { useCelebrate } from '@/components/fx/celebration';
import { AppText } from '@/components/ui/app-text';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Screen } from '@/components/ui/screen';
import { APP_NAME } from '@/constants/brand';
import { Radius, Spacing } from '@/constants/theme';
import { kktiLabel } from '@/hooks/use-coach';
import { useAiAction } from '@/hooks/use-ai-action';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useResumeAfterPaywall } from '@/hooks/use-resume-after-paywall';
import { useTheme } from '@/hooks/use-theme';
import { isUnlimited, useQuota } from '@/lib/billing/gate';
import { quotaLabel } from '@/lib/billing/quota';
import { requestAi } from '@/lib/coach-client';
import { crushToRequest, userToRequest } from '@/lib/coach-schema';
import { relativeTime } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { L } from '@/lib/i18n';
import { relationshipLabel } from '@/lib/labels';
import type { CrushReport, HeatPoint } from '@/lib/types';
import { buildReportSessions, reportProfileKey, reportRefresh, useAppStore, type ReportRefresh } from '@/store/app-store';

const REPORT_PHRASES = L(
  ['지금까지의 대화를 모으는 중…', '호감 신호를 고르는 중…', '그 사람의 연락 패턴을 보는 중…', '공략법을 정리하는 중…', '궁합 점수를 계산하는 중…', '거의 다 됐어요!'],
  ['Gathering your chats so far…', 'Picking out interest signals…', 'Looking at how they text…', 'Building your game plan…', 'Scoring your compatibility…', 'Almost there!'],
);

/** 보고서에 담기는 것 — 만들기 전에 이름만 보여 준다 (내용을 지어내지 않는다) */
const REPORT_ITEMS = L(
  ['한 줄 요약 · 대화 궁합 점수', '잘 먹히는 공략법', '호감 신호 · 주의할 신호', '성향 · 연락 스타일 · 대화 소재', '목표까지 로드맵 · 속마음 (추측)'],
  ['One-line summary · compatibility score', 'What works on them', 'Green flags · red flags', 'Personality · texting style · topics', 'Roadmap to your goal · what they’re thinking (a guess)'],
);

/** 「다시 분석하기」 버튼 글 — 왜 다시 만들 수 있는지 알려 준다 (막혔거나 예전 보고서면 그냥 「다시 분석하기」) */
const refreshTitle = (refresh: ReportRefresh) =>
  refresh === 'sessions'
    ? L('새 대화까지 반영해 다시 분석', 'Update with new chats')
    : refresh === 'profile'
      ? L('바뀐 정보로 다시 분석', 'Update with new info')
      : L('다시 분석하기', 'Analyze again');

/**
 * 상대 분석 보고서 — 이용권 혜택 가운데 하나라 「읽을거리」로 보이게(1.4 「깔끔하게」 개편, 점검 5.7).
 * 그라데이션 머리 카드·세 색 막대·아이콘 타일 카드 11장을 걷고, 흰 바탕 위 제목 + 본문 + 가는 선(제안형)으로 읽는다.
 * 순서: 이름·지금 온도 한 줄 → 온도 기록 → 한 줄 요약·궁합 → 공략법 → 신호 → 성향·연락 스타일 → 로드맵 → 속마음.
 * 같은 숫자를 세 번 보이던 통계(33° · 최고 33° · +33°)는 기록이 4번 이상일 때만 한 줄로.
 */
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
        <Stack.Screen options={{ title: L('상대 분석 보고서', 'Crush report') }} />
        <EmptyState emoji="🫥" title={L('채팅방을 찾을 수 없어요', 'Chat not found')} actionTitle={L('홈으로', 'Go home')} onAction={() => router.dismissTo?.('/(tabs)')} />
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
  const who = [rel.label, crush.mbti, crush.age ? L(`${crush.age}세`, `${crush.age}`) : null, crush.goal ? L(`목표 ${crush.goal}`, `Goal: ${crush.goal}`) : null].filter(Boolean).join(' · ');
  const heatNote = [
    heatMeta(heat).label,
    lastDelta ? L(`지난번보다 ${lastDelta > 0 ? '+' : '−'}${Math.abs(lastDelta)}°`, `${lastDelta > 0 ? '+' : '−'}${Math.abs(lastDelta)}° since last time`) : null,
  ]
    .filter(Boolean)
    .join(' · ');
  /** 화면에 보일 이름 (영어판은 이름 없는 상대를 「Your crush」로) · 영어 문장 속 이름 (없으면 null) */
  const name = crushDisplayName(crush.name);
  const nameEn = isUnnamedCrush(crush.name) ? null : crush.name;

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
      celebrate({ kind: 'sparkles', count: 14 });
    } else {
      haptic.error();
    }
  };
  generateRef.current = () => void generate();

  return (
    <Screen contentStyle={styles.content}>
      <Stack.Screen options={{ title: L('상대 분석 보고서', 'Crush report') }} />

      {/* 상대 한 줄 + 지금 호감 온도 한 줄 — 화면의 큰 숫자는 온도 하나 */}
      <Animated.View entering={FadeInDown.duration(300)} style={styles.head}>
        <View style={styles.who}>
          <Avatar name={name} uri={crush.photoUri} size={48} seed={crush.id} />
          <View style={styles.flex}>
            <AppText variant="title2" numberOfLines={1}>
              {name}
            </AppText>
            <AppText variant="small" color="textSecondary" numberOfLines={1}>
              {who}
            </AppText>
          </View>
        </View>
        <View style={styles.heatRow} accessible accessibilityLabel={L(`지금 호감 온도 ${heat}도, ${heatNote}`, `Current interest level ${heat} degrees, ${heatNote}`)}>
          <View style={styles.flex}>
            <AppText variant="bodyStrong">{L('지금 호감 온도', 'Current interest level')}</AppText>
            <AppText variant="small" color="textSecondary">
              {heatNote}
            </AppText>
          </View>
          <Text style={[styles.heatNumber, { color: theme.primary }]}>{heat}°</Text>
        </View>
        {log.length > 3 ? (
          <AppText variant="small" color="textSecondary">
            {L(`분석 ${analyzed}회 · 최고 ${peak}°`, `${analyzed} ${analyzed === 1 ? 'analysis' : 'analyses'} · Peak ${peak}°`)}
          </AppText>
        ) : null}
      </Animated.View>

      <Block title={L('호감 온도 기록', 'Interest history')} delay={60}>
        {log.length ? (
          <HeatChart log={log} />
        ) : (
          <AppText variant="small" color="textSecondary">
            {L('아직 기록이 없어요. 대화 캡처를 올리면 0°에서부터 온도가 움직여요.', 'No history yet. Upload a chat screenshot and it’ll start moving from 0°.')}
          </AppText>
        )}
      </Block>

      {/* AI 보고서 */}
      {busy ? (
        <PendingBubble phrases={REPORT_PHRASES} />
      ) : report ? (
        <ReportBody report={report.data} partnerName={crush.name} countUp={fresh} />
      ) : (
        <Block title={L(`${crush.name}님 분석 보고서`, nameEn ? `${nameEn}’s crush report` : 'Crush report')} delay={120}>
          <AppText variant="small" color="textSecondary">
            {analyzed
              ? L(`지금까지 ${analyzed}번의 코칭 기록으로 정리해요.`, `Built from your ${analyzed} coaching ${analyzed === 1 ? 'session' : 'sessions'} so far.`)
              : L(
                  '아직 코칭 기록이 없어 프로필만으로 분석해요. 대화를 몇 번 올린 뒤에 하면 훨씬 정확해요.',
                  'No coaching history yet, so this uses their profile only. It’s way more accurate after a few chats.',
                )}
          </AppText>
          {/* 받게 될 항목 이름만 — 예시 내용을 지어내지 않는다 */}
          <View style={styles.items}>
            {REPORT_ITEMS.map((item) => (
              <View key={item} style={styles.item}>
                <Ionicons name="checkmark" size={16} color={theme.textSecondary} />
                <AppText variant="body" style={styles.flex}>
                  {item}
                </AppText>
              </View>
            ))}
          </View>
          {memoryCount ? (
            <AppText variant="small" color="textSecondary">
              {L(`${APP_NAME}이 기억하는 이야기 ${memoryCount}개도 같이 반영해요.`, `Also uses ${memoryCount} ${memoryCount === 1 ? 'thing' : 'things'} your coach remembers.`)}
            </AppText>
          ) : null}
          <Button title={L('분석 보고서 만들기', 'Create crush report')} variant="brand" onPress={generate} style={styles.cta} />
          {/* 누르기 전에 남은 횟수와 차감을 한 줄로 — 다 썼으면 「1회 차감」 대신 미리 알린다 (점검 6장 1·2) */}
          {quota.enforced && !isUnlimited(quota) ? (
            <AppText variant="caption" color="textSecondary" align="center">
              {quota.kind === 'exhausted'
                ? L('무료 코칭을 다 썼어요 · 이용권이 있으면 바로 만들 수 있어요', 'Out of free sessions · Get a pass to create it now')
                : L(`${quotaLabel(quota).split(' · ')[0]} · 코칭 1회가 차감돼요`, `${quotaLabel(quota).split(' · ')[0]} · Uses 1 coaching`)}
            </AppText>
          ) : null}
        </Block>
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
        <View style={[styles.footer, { borderTopColor: theme.separator }]}>
          <AppText variant="caption" color="textSecondary" align="center">
            {L(
              `${relativeTime(report.at)}에 ${report.basedOn}번의 코칭 기록으로 만들었어요`,
              `Made ${relativeTime(report.at)} from ${report.basedOn} coaching ${report.basedOn === 1 ? 'session' : 'sessions'}`,
            )}
          </AppText>
          <Button title={refreshTitle(refresh)} variant={refresh === 'sessions' || refresh === 'profile' ? 'brand' : 'soft'} onPress={generate} disabled={!refresh} />
          {!refresh ? (
            <AppText variant="caption" color="textSecondary" align="center">
              {L('새 대화를 코칭받거나 상대·내 정보를 바꾸면 다시 분석할 수 있어요', 'Get coaching on a new chat or update your info to analyze again')}
            </AppText>
          ) : null}
        </View>
      ) : null}
      {report && !busy ? <AiReportLink mode="report" report={report.data} label={L('이 보고서 신고', 'Report this AI report')} /> : null}
    </Screen>
  );
}

/** 읽을거리 한 묶음 — 위 가는 선 + 제목 + 본문 (카드·아이콘 타일 없이) */
function Block({ title, delay = 0, children }: { title: string; delay?: number; children: ReactNode }) {
  const theme = useTheme();
  return (
    <Animated.View entering={FadeInDown.delay(delay).duration(300)} style={[styles.block, { borderTopColor: theme.separator }]}>
      <AppText variant="title3" weight="700" accessibilityRole="header">
        {title}
      </AppText>
      {children}
    </Animated.View>
  );
}

/** 묶음 안 작은 제목 + 내용 (성향 · 연락 스타일처럼 한 묶음에 둘 이상일 때) */
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={styles.field}>
      <AppText variant="smallStrong" color="textSecondary">
        {label}
      </AppText>
      {children}
    </View>
  );
}

/** 점·번호 목록 — 본문 크기, 진한 글자 */
function Lines({ lines, numbered }: { lines: string[]; numbered?: boolean }) {
  return (
    <View style={styles.lines}>
      {lines.map((line, i) => (
        <View key={i} style={styles.line}>
          <AppText variant="body" color="textSecondary" weight="600" style={styles.lineMark}>
            {numbered ? `${i + 1}` : '·'}
          </AppText>
          <AppText variant="body" style={styles.flex}>
            {line}
          </AppText>
        </View>
      ))}
    </View>
  );
}

/** 막대가 차례로 솟아오르는 온도 그래프 (최근 20번) — 회색 막대, 마지막(지금)만 파랑 */
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

const CHART_H = 140;
/** 막대 영역 높이 (위 숫자·아래 날짜 자리를 뺀 값) */
const BAR_H = 96;

function Bar({ point, index, last, height }: { point: HeatPoint; index: number; last: boolean; height: number }) {
  const theme = useTheme();
  const dark = useColorScheme() === 'dark';
  const grow = useSharedValue(0);
  useEffect(() => {
    grow.value = withDelay(index * 45, withSpring(1, { damping: 14, stiffness: 140 }));
  }, [grow, index]);
  const style = useAnimatedStyle(() => ({ height: height * grow.value }));
  const d = new Date(point.at);
  return (
    <View style={styles.barSlot}>
      <AppText variant="caption" color={last ? 'primary' : 'textSecondary'} weight="600" style={styles.barValue}>
        {point.value}°
      </AppText>
      {/* 지난 막대는 회색 — 다크는 옅은 회색 글자색을 흐리게 깔아 검정 바탕에서도 보이게 */}
      <Animated.View style={[styles.bar, style, { backgroundColor: last ? theme.primary : dark ? theme.textTertiary : theme.border }, !last && dark ? styles.barDim : null]} />
      <AppText variant="caption" color="textSecondary" style={styles.barDate}>
        {d.getMonth() + 1}/{d.getDate()}
      </AppText>
    </View>
  );
}

function ReportBody({ report, partnerName, countUp }: { report: CrushReport; partnerName: string; countUp: boolean }) {
  const theme = useTheme();
  const dark = useColorScheme() === 'dark';
  return (
    <View style={styles.report}>
      {/* 한 줄 요약 + 궁합 — 이 화면에서 가장 값진 문장을 맨 위로 */}
      <Block title={L('한 줄 요약', 'In one line')}>
        <AppText style={styles.headline}>{report.headline}</AppText>
        {report.keywords.length ? (
          <AppText variant="small" color="textSecondary">
            {report.keywords.join(' · ')}
          </AppText>
        ) : null}
        <View style={[styles.kv, { borderTopColor: theme.separator }]}>
          <AppText variant="bodyStrong" style={styles.flex}>
            {L('대화 궁합', 'Compatibility')}
          </AppText>
          <CountUp value={report.compatibility} animate={countUp} ticks suffix={L('점', '%')} style={[styles.kvValue, { color: theme.text }]} suffixStyle={[styles.kvUnit, { color: theme.text }]} />
        </View>
        <AppText variant="small" color="textSecondary">
          {report.compatibilityNote}
        </AppText>
      </Block>

      <Block title={L('잘 먹히는 공략법', 'What works on them')} delay={60}>
        <Lines lines={report.strategy} numbered />
      </Block>

      <Block title={L('신호', 'Signals')} delay={100}>
        <Field label={L('호감 신호', 'Green flags')}>
          <Lines lines={report.greenFlags} />
        </Field>
        {report.redFlags.length ? (
          <Field label={L('주의할 신호', 'Red flags')}>
            <Lines lines={report.redFlags} />
          </Field>
        ) : null}
      </Block>

      <Block title={L('성향 · 연락 스타일', 'Personality · texting style')} delay={140}>
        <Field label={L('성향', 'Personality')}>
          <AppText variant="body">{report.personality}</AppText>
        </Field>
        <Field label={L('연락 스타일', 'Texting style')}>
          <AppText variant="body">{report.textingStyle}</AppText>
        </Field>
        {report.interests.length ? (
          <Field label={L('대화 소재', 'Things to talk about')}>
            <AppText variant="body">{report.interests.join(' · ')}</AppText>
          </Field>
        ) : null}
      </Block>

      {report.roadmap.length ? (
        <Block title={L('목표까지 로드맵', 'Roadmap to your goal')} delay={180}>
          <View>
            {report.roadmap.map((step, i) => (
              <View key={i} style={styles.step}>
                <View style={styles.stepRail}>
                  <View style={[styles.stepDot, { backgroundColor: dark ? theme.surfaceElevated : theme.surface }]}>
                    <AppText variant="caption" weight="700">
                      {i + 1}
                    </AppText>
                  </View>
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
          </View>
        </Block>
      ) : null}

      {report.innerThought ? (
        <Block
          title={L(`${partnerName}님의 속마음 (추측)`, isUnnamedCrush(partnerName) ? 'What they’re really thinking (a guess)' : `What ${partnerName}’s really thinking (a guess)`)}
          delay={220}>
          <View style={[styles.thought, { backgroundColor: dark ? theme.surfaceElevated : theme.surface }]}>
            <AppText variant="body">{report.innerThought}</AppText>
          </View>
        </Block>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { gap: Spacing.xl, paddingTop: Spacing.md },
  flex: { flex: 1 },
  head: { gap: Spacing.lg },
  who: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  heatRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  // 화면의 큰 숫자는 이것 하나 (28pt 안팎 — 1.4 지침)
  heatNumber: { fontSize: 32, lineHeight: 38, fontWeight: '700', letterSpacing: -0.8 },
  block: { gap: Spacing.md, paddingTop: Spacing.xl, borderTopWidth: StyleSheet.hairlineWidth },
  field: { gap: 6 },
  lines: { gap: Spacing.sm },
  line: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'flex-start' },
  lineMark: { width: 14, textAlign: 'center' },
  headline: { fontSize: 20, lineHeight: 28, fontWeight: '700', letterSpacing: -0.4 },
  kv: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingTop: Spacing.md, marginTop: Spacing.xs, borderTopWidth: StyleSheet.hairlineWidth },
  kvValue: { fontSize: 20, lineHeight: 26, fontWeight: '700', letterSpacing: -0.4 },
  kvUnit: { fontSize: 15, fontWeight: '600' },
  items: { gap: Spacing.sm },
  item: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  cta: { marginTop: Spacing.xs },
  chart: { height: CHART_H, flexDirection: 'row', alignItems: 'flex-end', gap: 6, paddingTop: Spacing.sm },
  zeroLine: { position: 'absolute', left: 0, right: 0, height: 1 },
  barSlot: { flex: 1, maxWidth: 34, height: CHART_H, justifyContent: 'flex-end', alignItems: 'center' },
  barValue: { fontSize: 12, lineHeight: 16, marginBottom: 2 },
  bar: { width: '100%', borderRadius: 6, minHeight: 4 },
  barDim: { opacity: 0.35 },
  barDate: { fontSize: 12, lineHeight: 16, marginTop: 4, height: 18 },
  error: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'flex-start', borderRadius: Radius.md, padding: Spacing.md },
  footer: { gap: Spacing.sm, paddingTop: Spacing.xl, borderTopWidth: StyleSheet.hairlineWidth },
  report: { gap: Spacing.xl },
  step: { flexDirection: 'row', gap: Spacing.md },
  stepRail: { alignItems: 'center', width: 26 },
  stepDot: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  stepLine: { width: 2, flex: 1, minHeight: 16, marginVertical: 2 },
  stepTexts: { flex: 1, gap: 2, paddingBottom: Spacing.md },
  thought: { borderRadius: 22, borderTopLeftRadius: 6, padding: Spacing.md + 2 },
});
