import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GradientButton } from '@/components/brand/brand';
import { WhoSheet, type WhoTarget } from '@/components/coach/who-sheet';
import { WORRY_ICON, useDefaultPerspective } from '@/components/tips/tip-book';
import { AppText } from '@/components/ui/app-text';
import { EmptyState } from '@/components/ui/empty-state';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Screen } from '@/components/ui/screen';
import { SectionHeader } from '@/components/ui/section-header';
import { APP_NAME } from '@/constants/brand';
import { Brand, Radius, Spacing, Typography } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { track } from '@/lib/analytics';
import { haptic } from '@/lib/haptics';
import { renderSituation, themLabel } from '@/lib/mind-cards';
import { mindsOf, tipsOf, worryById } from '@/lib/tips';
import { sortCrushes, useAppStore } from '@/store/app-store';

/** 등장 순서 — 위에서부터 50ms 간격으로 살짝 올라온다 */
const enter = (step: number) => FadeInDown.delay(step * 50).springify().damping(18);
/** 아래 고정 버튼 칸 높이 (버튼 58 + 위 여백) — 본문 끝이 버튼에 가리지 않게 이만큼 비운다 */
const CTA_SPACE = 58 + Spacing.lg;
/** 속 카드(흰 바탕 위 연회색) 모서리 */
const INNER_RADIUS = Radius.lg - 2;

/**
 * 연애팁 백서 — 고민 하나의 해답 (11/12 회의 8번 「"어떤 고민이 있어요?" → 그 해답은 여기에!」).
 * 한 줄 결론 → 해결 단계 → 같이 보면 좋은 팁(lib/tips 의 묶음표) → 이럴 때 그 사람 속마음(누르면 속마음 풀이 /mind)
 * → 아래 고정 「이 상황, 센딧에게 물어보기」: 홈의 「상황 적기」처럼 누구와의 대화인지 고른 뒤 그 채팅방에서 이 고민 글로 코칭을 바로 받는다(pendingText).
 * 읽는 화면이라 흰 바탕(지침 1.2).
 */
export default function WorryScreen() {
  const { topic } = useLocalSearchParams<{ topic?: string }>();
  const worry = worryById(topic);
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const perspective = useDefaultPerspective();
  const crushMap = useAppStore((s) => s.crushes);
  const rooms = useMemo(() => sortCrushes(crushMap).filter((c) => !c.secret), [crushMap]);
  const [whoOpen, setWhoOpen] = useState(false);
  const tips = useMemo(() => (worry ? tipsOf(worry) : []), [worry]);
  const minds = useMemo(() => (worry ? mindsOf(worry) : []), [worry]);

  if (!worry) {
    return (
      <Screen>
        <EmptyState emoji="🤔" title="찾는 고민이 없어요" description="탐색에서 다른 고민을 골라 봐요." actionTitle="돌아가기" onAction={() => router.back()} />
      </Screen>
    );
  }

  const them = themLabel(perspective);

  /** 고른 채팅방으로 — 홈의 openRoom 과 같은 규칙(새로운 사람은 늘 새 방, 방이 하나도 없으면 quickStart) */
  const openRoom = (target: WhoTarget) => {
    const s = useAppStore.getState();
    const hasRoom = Object.values(s.crushes).some((c) => !c.secret);
    const id =
      target.kind === 'crush'
        ? target.id
        : target.kind === 'secret'
          ? s.createSecretChat()
          : hasRoom
            ? s.addCrush({ name: '상대', gender: 'female', relationship: 'talking', style: [], notes: '' }).id
            : s.quickStart();
    track('tipbook_ask', { worry: worry.id, target: target.kind, rooms: rooms.length });
    router.push({ pathname: '/crush/[id]', params: { id, pendingText: worry.ask } });
  };

  const askSendit = () => {
    if (rooms.length) setWhoOpen(true);
    else openRoom({ kind: 'new' });
  };

  const openMind = (situation: string) => {
    haptic.thud();
    track('tipbook_mind', { worry: worry.id });
    router.push({ pathname: '/mind', params: { situation, perspective } });
  };

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      <Screen safeBottom={false} contentStyle={{ ...styles.content, paddingBottom: CTA_SPACE + insets.bottom + Spacing.xl }}>
        <Animated.View entering={enter(0)} style={styles.head}>
          <View style={[styles.headIcon, { backgroundColor: theme.primarySoft }]}>
            <Ionicons name={WORRY_ICON[worry.id]} size={22} color={theme.primary} />
          </View>
          <AppText variant="smallStrong" color="primary" weight="800">
            연애팁 백서 · {worry.keywords}
          </AppText>
          <Text style={[styles.title, { color: theme.text }]} accessibilityRole="header">
            {worry.title}
          </Text>
        </Animated.View>

        {/* 한 줄 결론 */}
        <Animated.View entering={enter(1)} style={[styles.answer, { backgroundColor: theme.primarySoft }]}>
          <View style={styles.answerLabel}>
            <Ionicons name="bulb" size={15} color={theme.primary} />
            <AppText variant="caption" color="primary" weight="800">
              한 줄 정리
            </AppText>
          </View>
          <AppText variant="title3" weight="700" style={styles.answerText} lineBreakStrategyIOS="hangul-word">
            {worry.answer}
          </AppText>
        </Animated.View>

        {/* 해결 단계 — 번호 동그라미를 가는 선으로 잇는다 */}
        <Animated.View entering={enter(2)}>
          <SectionHeader title="이렇게 해 봐요" style={styles.sectionHeader} />
          <View accessibilityRole="list">
            {worry.steps.map((step, i) => {
              const last = i === worry.steps.length - 1;
              return (
                <View key={step.title} style={styles.step} accessible accessibilityLabel={`${i + 1}단계, ${step.title}. ${step.body}`}>
                  <View style={styles.stepRail}>
                    <View style={[styles.stepNum, { backgroundColor: theme.primary }]}>
                      <Text style={styles.stepNumText}>{i + 1}</Text>
                    </View>
                    {!last ? <View style={[styles.stepLine, { backgroundColor: theme.separator }]} /> : null}
                  </View>
                  <View style={[styles.stepTexts, !last && styles.stepTextsGap]}>
                    <AppText variant="bodyStrong" weight="700">
                      {step.title}
                    </AppText>
                    <AppText variant="small" color="textSecondary" style={styles.stepBody}>
                      {step.body}
                    </AppText>
                  </View>
                </View>
              );
            })}
          </View>
        </Animated.View>

        {/* 같이 보면 좋은 팁 — 기존 팁을 묶음표대로 */}
        {tips.length ? (
          <Animated.View entering={enter(3)} style={styles.stack}>
            <SectionHeader title="같이 보면 좋은 팁" style={styles.sectionHeader} />
            {tips.map((tip) => (
              <View key={tip.id} style={[styles.tip, { backgroundColor: theme.surface }]}>
                <AppText variant="bodyStrong" weight="700">
                  {tip.title}
                </AppText>
                <AppText variant="small" color="textSecondary" style={styles.tipBody}>
                  {tip.body}
                </AppText>
              </View>
            ))}
          </Animated.View>
        ) : null}

        {/* 이럴 때 그 사람 속마음 — 누르면 속마음 풀이 */}
        {minds.length ? (
          <Animated.View entering={enter(4)}>
            <SectionHeader title={`이럴 때 ${them} 속마음은?`} style={styles.sectionHeader} />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.mindsWrap} contentContainerStyle={styles.minds}>
              {minds.map((m) => {
                const situation = renderSituation(m, perspective);
                return (
                  <PressableScale
                    key={m.id}
                    pressedScale={0.97}
                    feedback={false}
                    onPress={() => openMind(situation)}
                    accessibilityLabel={`${situation} ${them} 속마음 보기`}
                    style={[styles.mind, minds.length === 1 && styles.mindWide, { backgroundColor: theme.surface }]}>
                    <AppText variant="smallStrong" numberOfLines={4} lineBreakStrategyIOS="hangul-word">
                      {situation}
                    </AppText>
                    <View style={styles.mindGo}>
                      <AppText variant="caption" color="primary" weight="800">
                        속마음 보기
                      </AppText>
                      <Ionicons name="arrow-forward" size={13} color={theme.primary} />
                    </View>
                  </PressableScale>
                );
              })}
            </ScrollView>
          </Animated.View>
        ) : null}
      </Screen>

      {/* 아래 고정 — 이 화면의 주요 행동 하나 */}
      <View pointerEvents="box-none" style={styles.ctaWrap}>
        <LinearGradient pointerEvents="none" colors={[`${theme.background}00`, theme.background]} style={styles.ctaFade} />
        <View style={[styles.cta, { backgroundColor: theme.background, paddingBottom: insets.bottom + Spacing.md }]}>
          <GradientButton title={`이 상황, ${APP_NAME}에게 물어보기`} onPress={askSendit} icon={<Ionicons name="chatbubble-ellipses" size={18} color={Brand.onBrand} />} />
        </View>
      </View>

      <WhoSheet
        visible={whoOpen}
        crushes={rooms}
        subtitle="고르면 이 고민으로 바로 물어봐요"
        onPick={(target) => {
          haptic.select();
          setWhoOpen(false);
          openRoom(target);
        }}
        onClose={() => setWhoOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { gap: Spacing.md },
  head: { gap: 6, marginTop: Spacing.sm },
  headIcon: { width: 44, height: 44, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.sm },
  title: { ...Typography.hero, fontSize: 28, lineHeight: 36 },
  answer: { borderRadius: Radius.lg + 2, padding: Spacing.lg + 2, gap: Spacing.sm, marginTop: Spacing.sm },
  answerLabel: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  answerText: { fontSize: 18, lineHeight: 27, letterSpacing: -0.3 },
  sectionHeader: { marginTop: Spacing.xl, marginBottom: Spacing.md, paddingHorizontal: 2 },
  step: { flexDirection: 'row', gap: Spacing.md },
  stepRail: { width: 26, alignItems: 'center' },
  stepNum: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  stepNumText: { color: Brand.onBrand, fontSize: 13, lineHeight: 16, fontWeight: '900' },
  stepLine: { flex: 1, width: 2, borderRadius: 1, marginVertical: 4 },
  stepTexts: { flex: 1, gap: 3, paddingTop: 1 },
  stepTextsGap: { paddingBottom: Spacing.lg + 2 },
  stepBody: { lineHeight: 21 },
  stack: { gap: Spacing.sm + 2 },
  tip: { borderRadius: INNER_RADIUS, padding: Spacing.lg, gap: 6 },
  tipBody: { lineHeight: 21 },
  mindsWrap: { marginHorizontal: -Spacing.lg, flexGrow: 0 },
  minds: { gap: Spacing.sm + 2, paddingHorizontal: Spacing.lg },
  mind: { width: 216, minHeight: 116, borderRadius: INNER_RADIUS, padding: Spacing.lg, gap: Spacing.md, justifyContent: 'space-between' },
  mindWide: { width: 300 },
  mindGo: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  ctaWrap: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  ctaFade: { height: 24 },
  cta: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.xs },
});
