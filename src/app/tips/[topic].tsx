import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GradientButton } from '@/components/brand/brand';
import { WhoSheet, type WhoTarget } from '@/components/coach/who-sheet';
import { useCostNote, useDefaultPerspective, useFill } from '@/components/tips/tip-book';
import { AppText } from '@/components/ui/app-text';
import { EmptyState } from '@/components/ui/empty-state';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Screen } from '@/components/ui/screen';
import { SectionHeader } from '@/components/ui/section-header';
import { APP_NAME } from '@/constants/brand';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { track } from '@/lib/analytics';
import { haptic } from '@/lib/haptics';
import { L } from '@/lib/i18n';
import { fillThem, renderSituation, themLabel } from '@/lib/mind-cards';
import { mindsOf, tipsOf, worryById } from '@/lib/tips';
import { sortCrushes, useAppStore } from '@/store/app-store';

/** 등장 — 위에서부터 짧게 (1.4 개편: 튕김 없이) */
const enter = (step: number) => FadeInDown.delay(step * 40).duration(300);
/** 아래 고정 버튼 칸 높이 (버튼 54 + 위 여백) — 본문 끝이 버튼에 가리지 않게 이만큼 비운다 */
const CTA_SPACE = 54 + Spacing.lg;

/**
 * 연애팁 백서 — 고민 하나의 해답 (11/12 회의 8번 「"어떤 고민이 있어요?" → 그 해답은 여기에!」).
 * 한 줄 결론 → 해결 단계 → 같이 보면 좋은 팁(lib/tips 의 묶음표) → 이럴 때 그 사람 속마음(누르면 속마음 풀이 /mind)
 * → 아래 고정 「이 상황, 센딧에게 물어보기」: 홈의 「상황 적기」처럼 누구와의 대화인지 고른 뒤 그 채팅방에서 이 고민 글로 코칭을 바로 받는다(pendingText).
 * 1.4 「깔끔하게」 개편: 머리의 아이콘 타일·파란 라벨·연파랑 상자를 걷었다. 한 줄 결론은 상자 없이 큰 문장, 팁은 가는 선으로 나눈 줄
 * (굵은 제목 + 회색 본문). 색은 아래 버튼 하나. 횟수를 쓰는 곳(속마음 보기·물어보기)에는 누르기 전에 「1회」.
 */
export default function WorryScreen() {
  const { topic } = useLocalSearchParams<{ topic?: string }>();
  const worry = worryById(topic);
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const fill = useFill();
  const perspective = useDefaultPerspective();
  const crushMap = useAppStore((s) => s.crushes);
  const rooms = useMemo(() => sortCrushes(crushMap).filter((c) => !c.secret), [crushMap]);
  const [whoOpen, setWhoOpen] = useState(false);
  const tips = useMemo(() => (worry ? tipsOf(worry) : []), [worry]);
  const minds = useMemo(() => (worry ? mindsOf(worry) : []), [worry]);
  const mindCost = useCostNote(L('볼 때', 'to view'));
  const askCost = useCostNote(L('물어볼 때', 'to ask'));

  if (!worry) {
    return (
      <Screen>
        <EmptyState
          emoji="🤔"
          title={L('찾는 고민이 없어요', "Couldn't find that one")}
          description={L('탐색에서 다른 고민을 골라 봐요.', 'Pick another topic from Explore.')}
          actionTitle={L('돌아가기', 'Go back')}
          onAction={() => router.back()}
        />
      </Screen>
    );
  }

  const them = themLabel(perspective);
  // 영어판에는 앱 이름(센딧)을 쓰지 않는다
  const askTitle = L(`이 상황, ${APP_NAME}에게 물어보기`, 'Ask your coach about this');
  // 영어판은 대명사(his·her·their)를 성별에 맞게
  const readMind = L('속마음 보기', fillThem('Read {their} mind', perspective));

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
            ? s.addCrush({ name: L('상대', 'Them'), gender: 'female', relationship: 'talking', style: [], notes: '' }).id
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
          {/* 화면의 작은 라벨은 이것 하나(회색) — 연애팁 백서 · 찾는 말 */}
          <AppText variant="smallStrong" color="textSecondary">
            {L('연애팁 백서', 'Dating playbook')} · {worry.keywords}
          </AppText>
          <Text style={[styles.title, { color: theme.text }]} accessibilityRole="header">
            {worry.title}
          </Text>
        </Animated.View>

        {/* 한 줄 결론 — 상자 없이 큰 문장 */}
        <Animated.View entering={enter(1)}>
          <AppText style={[styles.answer, { color: theme.text }]}>{worry.answer}</AppText>
        </Animated.View>

        {/* 해결 단계 — 회색 번호 동그라미를 가는 선으로 잇는다 */}
        <Animated.View entering={enter(2)}>
          <SectionHeader title={L('이렇게 해 봐요', 'Try this')} style={styles.sectionHeader} />
          <View accessibilityRole="list">
            {worry.steps.map((step, i) => {
              const last = i === worry.steps.length - 1;
              return (
                <View key={step.title} style={styles.step} accessible accessibilityLabel={L(`${i + 1}단계, ${step.title}. ${step.body}`, `Step ${i + 1}, ${step.title}. ${step.body}`)}>
                  <View style={styles.stepRail}>
                    <View style={[styles.stepNum, { backgroundColor: fill }]}>
                      <AppText style={[styles.stepNumText, { color: theme.text }]}>{i + 1}</AppText>
                    </View>
                    {!last ? <View style={[styles.stepLine, { backgroundColor: theme.separator }]} /> : null}
                  </View>
                  <View style={[styles.stepTexts, !last && styles.stepTextsGap]}>
                    <AppText variant="bodyStrong">{step.title}</AppText>
                    <AppText variant="small" color="textSecondary" style={styles.body}>
                      {step.body}
                    </AppText>
                  </View>
                </View>
              );
            })}
          </View>
        </Animated.View>

        {/* 같이 보면 좋은 팁 — 상자 대신 가는 선으로 나눈 줄 */}
        {tips.length ? (
          <Animated.View entering={enter(3)}>
            <SectionHeader title={L('같이 보면 좋은 팁', 'Related tips')} style={styles.sectionHeader} />
            {tips.map((tip, i) => (
              <View key={tip.id} style={[styles.tip, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.separator }]}>
                <AppText variant="bodyStrong">{tip.title}</AppText>
                <AppText variant="small" color="textSecondary" style={styles.body}>
                  {tip.body}
                </AppText>
              </View>
            ))}
          </Animated.View>
        ) : null}

        {/* 이럴 때 그 사람 속마음 — 누르면 속마음 풀이(무료 1회) */}
        {minds.length ? (
          <Animated.View entering={enter(4)}>
            <SectionHeader
              title={L(`이럴 때 ${them} 속마음은?`, fillThem("What's going through {their} head?", perspective))}
              subtitle={mindCost.note ?? undefined}
              style={styles.sectionHeader}
            />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.mindsWrap} contentContainerStyle={styles.minds}>
              {minds.map((m) => {
                const situation = renderSituation(m, perspective);
                return (
                  <PressableScale
                    key={m.id}
                    pressedScale={0.97}
                    feedback={false}
                    onPress={() => openMind(situation)}
                    accessibilityLabel={L(`${situation} ${them} 속마음 보기`, `${situation} ${readMind}`)}
                    accessibilityHint={mindCost.suffix ? L('무료 코칭 1회를 써요', 'Uses 1 free coaching') : undefined}
                    style={[styles.mind, minds.length === 1 && styles.mindWide, { backgroundColor: fill }]}>
                    <AppText variant="smallStrong" numberOfLines={4}>
                      {situation}
                    </AppText>
                    <View style={styles.mindGo}>
                      <AppText variant="small" color="primary" weight="600">
                        {readMind}
                        {mindCost.suffix}
                      </AppText>
                      <Ionicons name="chevron-forward" size={14} color={theme.primary} />
                    </View>
                  </PressableScale>
                );
              })}
            </ScrollView>
          </Animated.View>
        ) : null}
      </Screen>

      {/* 아래 고정 — 이 화면의 주요 행동 하나(센딧 파랑 단색). 무료 1회를 쓰면 버튼에 「· 1회」, 다 썼으면 위에 한 줄 */}
      <View pointerEvents="box-none" style={styles.ctaWrap}>
        <LinearGradient pointerEvents="none" colors={[`${theme.background}00`, theme.background]} style={styles.ctaFade} />
        <View style={[styles.cta, { backgroundColor: theme.background, paddingBottom: insets.bottom + Spacing.md }]}>
          {askCost.out && askCost.note ? (
            <AppText variant="caption" color="textSecondary" align="center">
              {askCost.note}
            </AppText>
          ) : null}
          <GradientButton title={`${askTitle}${askCost.suffix}`} accessibilityLabel={askTitle} onPress={askSendit} />
        </View>
      </View>

      <WhoSheet
        visible={whoOpen}
        crushes={rooms}
        subtitle={L('고르면 이 고민으로 바로 물어봐요', "Pick a chat and we'll ask about this right away")}
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
  content: { gap: Spacing.lg },
  head: { gap: 4, marginTop: Spacing.sm },
  title: { fontSize: 26, lineHeight: 34, fontWeight: '700', letterSpacing: -0.6 },
  // 한 줄 결론 — 이 화면에서 가장 먼저 읽히는 문장(20pt · 600)
  answer: { fontSize: 20, lineHeight: 30, fontWeight: '600', letterSpacing: -0.4 },
  sectionHeader: { marginTop: Spacing.lg, marginBottom: Spacing.md, paddingHorizontal: 2 },
  step: { flexDirection: 'row', gap: Spacing.md },
  stepRail: { width: 26, alignItems: 'center' },
  stepNum: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  stepNumText: { fontSize: 13, lineHeight: 16, fontWeight: '700' },
  stepLine: { flex: 1, width: 1, marginVertical: 4 },
  stepTexts: { flex: 1, gap: 3, paddingTop: 1 },
  stepTextsGap: { paddingBottom: Spacing.lg + 2 },
  body: { lineHeight: 21 },
  tip: { paddingVertical: Spacing.md + 2, gap: 4 },
  mindsWrap: { marginHorizontal: -Spacing.lg, flexGrow: 0 },
  minds: { gap: Spacing.sm, paddingHorizontal: Spacing.lg },
  mind: { width: 216, minHeight: 120, borderRadius: 20, padding: Spacing.lg, gap: Spacing.md, justifyContent: 'space-between' },
  mindWide: { width: 300 },
  mindGo: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  ctaWrap: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  ctaFade: { height: 24 },
  cta: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.xs, gap: Spacing.sm },
});
