import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { RoomAvatar } from '@/components/crush/crush-list-item';
import { isUnnamedCrush } from '@/components/crush/crush-name';
import { useCostNote, useFill } from '@/components/tips/tip-book';
import { AnimatedNumber } from '@/components/ui/animated-number';
import { AppText } from '@/components/ui/app-text';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Screen } from '@/components/ui/screen';
import { SectionHeader } from '@/components/ui/section-header';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { relativeTime } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { L } from '@/lib/i18n';
import { josa } from '@/lib/kkti';
import { relationshipLabel } from '@/lib/labels';
import { personasFor } from '@/lib/personas';
import { PRACTICE_MAX_TURNS, personaFromCrush } from '@/lib/practice';
import type { PracticePersona } from '@/lib/types';
import { sortCrushes, useAppStore } from '@/store/app-store';

/** 등장 — 위에서부터 짧게 (1.4 개편: 튕김 없이) */
const enter = (step: number) => FadeInDown.delay(step * 40).duration(300);
const LEVEL: readonly string[] = L(['', '쉬움', '보통', '어려움'], ['', 'Easy', 'Medium', 'Hard']);
/** 줄 왼쪽 얼굴 크기 — 줄 사이 선이 이름 글자 아래에서 시작하도록 */
const AVATAR = 44;
/** 「이어서 하기」는 처음에 이만큼만, 나머지는 「더 보기」 */
const SESSIONS_SHOWN = 3;

/**
 * 연애 연습 탭 — AI 상대역과 카톡하듯 연습하고, 0°에서 시작하는 온도를 올려 본다.
 * 1.4 「깔끔하게」 개편: 흰 바탕 + 줄 목록(홈 「최근 상담」과 같은 결). 떠다니는 3D 하트·사용법 파란 카드·2열 타일·이모지 얼굴을 걷었다.
 * 제목 아래 한 줄로 사용법, 그 아래 한 번에 쓰는 횟수(연습 한 번 = 코칭 1회). 상대 얼굴은 앱 공통 얼굴 원(이름 첫 글자).
 * 내 채팅방이 있으면 「내 상대와 미리 연습」을 맨 위로 — 실제 그 사람으로 리허설하는 것이 이 탭에서 가장 설득력 있다.
 */
export default function PracticeTab() {
  const theme = useTheme();
  const router = useRouter();
  const fill = useFill();
  const user = useAppStore((s) => s.user);
  const practice = useAppStore((s) => s.practice);
  const crushMap = useAppStore((s) => s.crushes);
  const startPractice = useAppStore((s) => s.startPractice);
  const seePracticeDot = useAppStore((s) => s.seePracticeDot);
  const cost = useCostNote(L('연습 한 번에', 'per practice'));
  const [moreSessions, setMoreSessions] = useState(false);
  // 연애 연습을 열었으면 「이런 기능도 있어요」 빨간 점(탐색 탭·탭 바)은 그만 띄운다 (11/12 회의 3번)
  useFocusEffect(
    useCallback(() => {
      if (!useAppStore.getState().practiceDotSeen) seePracticeDot();
    }, [seePracticeDot]),
  );
  const personas = useMemo(() => personasFor(user?.gender ?? 'other'), [user?.gender]);
  const sessions = useMemo(() => Object.values(practice).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 6), [practice]);
  const crushes = useMemo(() => sortCrushes(crushMap).filter((c) => !c.secret && !isUnnamedCrush(c.name)), [crushMap]);
  const shownSessions = moreSessions ? sessions : sessions.slice(0, SESSIONS_SHOWN);

  const start = (persona: PracticePersona) => {
    haptic.thud();
    const id = startPractice(persona);
    router.push({ pathname: '/practice/[id]', params: { id } });
  };

  return (
    <Screen safeTop tab title={L('연애 연습', 'Practice chat')} background={theme.background} contentStyle={styles.content}>
      <Animated.View entering={enter(0)} style={styles.head}>
        <Text style={[styles.title, { color: theme.text }]} accessibilityRole="header">
          {L('연애 연습', 'Practice chat')}
        </Text>
        <AppText variant="small" color="textSecondary">
          {L(
            '상대를 고르면 먼저 카톡이 와요. 답할 때마다 피드백과 호감 온도가 바뀌어요.',
            "Pick someone and they'll text you first. Every reply gets feedback and moves their interest level.",
          )}
        </AppText>
        {/* 무료 횟수를 쓰는 기능 — 누르기 전에 한 번에 얼마나 쓰는지(0회면 다 썼다고 먼저 알린다) */}
        {cost.note ? (
          <AppText variant="caption" color="textSecondary" weight="600" style={styles.cost}>
            {cost.out
              ? cost.note
              : L(`연습 한 번에 코칭 1회 · ${PRACTICE_MAX_TURNS}마디까지 · ${cost.left}`, `Each practice uses 1 · Up to ${PRACTICE_MAX_TURNS} messages · ${cost.left}`)}
          </AppText>
        ) : null}
      </Animated.View>

      {crushes.length ? (
        <Animated.View entering={enter(1)} style={styles.section}>
          <SectionHeader title={L('내 상대와 미리 연습', 'Practice with your crush')} style={styles.sectionHeader} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hscroll} style={styles.hscrollWrap}>
            {crushes.map((c) => (
              <PressableScale key={c.id} pressedScale={0.97} accessibilityLabel={L(`${c.name}${josa(c.name, '과', '와')} 연습 시작`, `Start practice with ${c.name}`)} onPress={() => start(personaFromCrush(c))} style={[styles.crushChip, { backgroundColor: fill }]}>
                <RoomAvatar crush={c} size={36} />
                <View>
                  <AppText variant="smallStrong">{c.name}</AppText>
                  <AppText variant="caption" color="textSecondary">
                    {relationshipLabel(c.relationship).label} · {L('연습 시작', 'Start practice')}
                  </AppText>
                </View>
              </PressableScale>
            ))}
          </ScrollView>
        </Animated.View>
      ) : null}

      {sessions.length ? (
        <Animated.View entering={enter(2)} style={styles.section}>
          <SectionHeader title={L('이어서 하기', 'Continue')} style={styles.sectionHeader} />
          <View style={styles.list}>
            {shownSessions.map((s, i) => {
              const last = s.turns[s.turns.length - 1];
              return (
                <Pressable
                  key={s.id}
                  accessibilityRole="button"
                  accessibilityLabel={L(
                    `${s.persona.name}${josa(s.persona.name, '과', '와')}의 연습 이어서 하기, 호감 온도 ${s.heat}도`,
                    `Continue practice with ${s.persona.name}, interest level ${s.heat}°`,
                  )}
                  onPress={() => {
                    haptic.soft();
                    router.push({ pathname: '/practice/[id]', params: { id: s.id } });
                  }}
                  style={({ pressed }) => [styles.row, { backgroundColor: pressed ? fill : 'transparent' }]}>
                  <RoomAvatar crush={{ id: s.persona.id, name: s.persona.name }} size={AVATAR} />
                  <View style={styles.rowTexts}>
                    <View style={styles.nameRow}>
                      <AppText variant="bodyStrong" numberOfLines={1} style={styles.shrink}>
                        {s.persona.name}
                        {s.ended ? L(' · 끝', ' · Ended') : ''}
                      </AppText>
                      <AppText variant="caption" color="textTertiary">
                        {relativeTime(s.updatedAt)}
                      </AppText>
                    </View>
                    <AppText variant="small" color="textSecondary" numberOfLines={1}>
                      {last?.text ?? ''}
                    </AppText>
                  </View>
                  <AnimatedNumber value={s.heat} suffix="°" ticks={false} duration={800} style={[styles.heat, { color: theme.primary }]} />
                  {i < shownSessions.length - 1 ? <View pointerEvents="none" style={[styles.divider, { backgroundColor: theme.separator }]} /> : null}
                </Pressable>
              );
            })}
          </View>
          {sessions.length > SESSIONS_SHOWN ? (
            <Pressable accessibilityRole="button" accessibilityState={{ expanded: moreSessions }} onPress={() => setMoreSessions((v) => !v)} hitSlop={6} style={styles.more}>
              <AppText variant="smallStrong" color="textSecondary">
                {moreSessions ? L('접기', 'Show less') : L(`지난 연습 ${sessions.length - SESSIONS_SHOWN}개 더 보기`, `Show ${sessions.length - SESSIONS_SHOWN} more`)}
              </AppText>
              <Ionicons name={moreSessions ? 'chevron-up' : 'chevron-down'} size={15} color={theme.textTertiary} />
            </Pressable>
          ) : null}
        </Animated.View>
      ) : null}

      {/* 연습 상대 — 홈 「최근 상담」과 같은 줄 목록(얼굴 원 + 이름·나이 + MBTI·직업·난이도 + 상황 한 줄) */}
      <Animated.View entering={enter(3)} style={styles.section}>
        <SectionHeader title={L('연습 상대 고르기', 'Pick a practice match')} style={styles.sectionHeader} />
        <View style={styles.list}>
          {personas.map((p) => (
            <Pressable
              key={p.id}
              accessibilityRole="button"
              accessibilityLabel={L(`${p.name}, ${p.age}, 난이도 ${LEVEL[p.difficulty] ?? ''}`, `${p.name}, ${p.age}, difficulty ${LEVEL[p.difficulty] ?? ''}`)}
              onPress={() => start(p)}
              style={({ pressed }) => [styles.row, styles.personaRow, { backgroundColor: pressed ? fill : 'transparent' }]}>
              <RoomAvatar crush={{ id: p.id, name: p.name }} size={AVATAR} />
              <View style={styles.rowTexts}>
                <AppText variant="bodyStrong" numberOfLines={1}>
                  {p.name} · {p.age}
                </AppText>
                <AppText variant="small" color="textSecondary" numberOfLines={1}>
                  {p.mbti} · {p.job || relationshipLabel(p.relationship).label} · {LEVEL[p.difficulty] ?? ''}
                </AppText>
                <AppText variant="small" color="textSecondary" numberOfLines={1} style={styles.scenario}>
                  {p.scenario}
                </AppText>
              </View>
              <View pointerEvents="none" style={[styles.divider, { backgroundColor: theme.separator }]} />
            </Pressable>
          ))}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={L('연습 상대 직접 만들기', 'Create your own practice match')}
            onPress={() => {
              haptic.select();
              router.push('/practice/custom');
            }}
            style={({ pressed }) => [styles.row, { backgroundColor: pressed ? fill : 'transparent' }]}>
            <View style={[styles.addCircle, { backgroundColor: fill }]}>
              <Ionicons name="add" size={22} color={theme.text} />
            </View>
            <View style={styles.rowTexts}>
              <AppText variant="bodyStrong">{L('직접 만들기', 'Create your own')}</AppText>
              <AppText variant="small" color="textSecondary" numberOfLines={1}>
                {L('나이·MBTI·상황을 골라 나만의 연습 상대를 만들어요', 'Pick an age, MBTI and scenario to build your own match')}
              </AppText>
            </View>
            <Ionicons name="chevron-forward" size={18} color={theme.textTertiary} />
          </Pressable>
        </View>
      </Animated.View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: Spacing.xl },
  head: { gap: 4, marginTop: Spacing.sm, paddingHorizontal: 2 },
  // 홈·탐색 제목과 같은 크기(24pt · 700)
  title: { fontSize: 24, lineHeight: 32, fontWeight: '700', letterSpacing: -0.6, marginTop: 6, marginBottom: 2 },
  cost: { marginTop: 2 },
  section: { gap: Spacing.sm },
  sectionHeader: { marginTop: 0, marginBottom: 0, paddingHorizontal: 2 },
  hscrollWrap: { marginHorizontal: -Spacing.lg, flexGrow: 0 },
  hscroll: { gap: Spacing.sm, paddingHorizontal: Spacing.lg },
  crushChip: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm + 2, borderRadius: 20, paddingVertical: Spacing.sm + 2, paddingLeft: Spacing.sm + 2, paddingRight: Spacing.lg },
  // 줄 목록은 화면 끝까지(눌림 색이 가장자리까지)
  list: { marginHorizontal: -Spacing.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.md, paddingHorizontal: Spacing.lg, minHeight: 72 },
  personaRow: { alignItems: 'flex-start' },
  rowTexts: { flex: 1, gap: 2 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  shrink: { flexShrink: 1 },
  scenario: { marginTop: 1 },
  heat: { fontSize: 22, lineHeight: 28, fontWeight: '700', letterSpacing: -0.6, minWidth: 48, textAlign: 'right' },
  addCircle: { width: AVATAR, height: AVATAR, borderRadius: AVATAR / 2, alignItems: 'center', justifyContent: 'center' },
  // 줄 사이 가는 선 — 이름 글자 아래에서 시작한다 (안쪽 여백 + 얼굴 + 간격)
  divider: { position: 'absolute', bottom: 0, right: Spacing.lg, left: Spacing.lg + AVATAR + Spacing.md, height: StyleSheet.hairlineWidth },
  more: { flexDirection: 'row', alignItems: 'center', alignSelf: 'center', gap: 4, minHeight: 44, paddingHorizontal: Spacing.md },
});
