import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { heatMeta } from '@/components/coach/heat-gauge';
import { AppText } from '@/components/ui/app-text';
import { Avatar } from '@/components/ui/avatar';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Screen } from '@/components/ui/screen';
import { SectionHeader } from '@/components/ui/section-header';
import { Radius, Spacing, palette } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { relativeTime } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { relationshipLabel } from '@/lib/labels';
import { personasFor } from '@/lib/personas';
import { personaFromCrush } from '@/lib/practice';
import type { PracticePersona } from '@/lib/types';
import { sortCrushes, useAppStore } from '@/store/app-store';

/** 연애 연습 탭 — AI 상대역과 카톡하듯 연습하고, 0°에서 시작하는 온도를 올려 본다 */
export default function PracticeTab() {
  const theme = useTheme();
  const router = useRouter();
  const user = useAppStore((s) => s.user);
  const practice = useAppStore((s) => s.practice);
  const crushMap = useAppStore((s) => s.crushes);
  const startPractice = useAppStore((s) => s.startPractice);
  const personas = useMemo(() => personasFor(user?.gender ?? 'other'), [user?.gender]);
  const sessions = useMemo(() => Object.values(practice).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 6), [practice]);
  const crushes = useMemo(() => sortCrushes(crushMap).filter((c) => !c.secret && c.name !== '상대'), [crushMap]);

  const start = (persona: PracticePersona) => {
    haptic.thud();
    const id = startPractice(persona);
    router.push({ pathname: '/practice/[id]', params: { id } });
  };

  return (
    <Screen safeTop contentStyle={styles.content}>
      <View style={styles.header}>
        <AppText variant="display">연애 연습</AppText>
        <AppText variant="body" color="textSecondary">
          실전 전에 AI 상대와 카톡으로 연습해요. 0°에서 시작해 온도를 올려 보세요!
        </AppText>
      </View>

      {sessions.length ? (
        <>
          <SectionHeader title="이어서 하기" />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hscroll} style={styles.hscrollWrap}>
            {sessions.map((s) => {
              const meta = heatMeta(s.heat);
              const last = s.turns[s.turns.length - 1];
              return (
                <PressableScale key={s.id} onPress={() => router.push({ pathname: '/practice/[id]', params: { id: s.id } })} style={[styles.session, { backgroundColor: theme.surface }]}>
                  <View style={styles.sessionTop}>
                    <AppText style={styles.sessionEmoji}>{s.persona.emoji}</AppText>
                    <View style={[styles.heatPill, { backgroundColor: `${meta.color}22` }]}>
                      <AppText variant="caption" color={meta.color} weight="800">
                        {meta.emoji} {s.heat}°
                      </AppText>
                    </View>
                  </View>
                  <AppText variant="smallStrong" numberOfLines={1}>
                    {s.persona.name} {s.ended ? '· 끝' : ''}
                  </AppText>
                  <AppText variant="caption" color="textSecondary" numberOfLines={2}>
                    {last?.text ?? ''}
                  </AppText>
                  <AppText variant="caption" color="textTertiary">
                    {relativeTime(s.updatedAt)}
                  </AppText>
                </PressableScale>
              );
            })}
          </ScrollView>
        </>
      ) : (
        <Animated.View entering={FadeInDown.duration(300)}>
          <LinearGradient colors={[palette.lavender100, palette.sky100]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.intro}>
            <AppText style={styles.introEmoji}>🎮</AppText>
            <View style={styles.introTexts}>
              <AppText variant="title3" color={palette.gray900}>
                이렇게 연습해요
              </AppText>
              <AppText variant="small" color={palette.gray700}>
                상대를 고르면 그 사람이 먼저 카톡을 보내요. 내가 답할 때마다 코치가 바로 피드백하고, 호감 온도가 오르내려요.
              </AppText>
            </View>
          </LinearGradient>
        </Animated.View>
      )}

      {crushes.length ? (
        <>
          <SectionHeader title="내 상대와 미리 연습" subtitle="실제로 보내기 전에 리허설해요" />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hscroll} style={styles.hscrollWrap}>
            {crushes.map((c) => (
              <PressableScale key={c.id} onPress={() => start(personaFromCrush(c))} style={[styles.crushChip, { backgroundColor: theme.surface }]}>
                <Avatar name={c.name} uri={c.photoUri} size={40} seed={c.id} />
                <View>
                  <AppText variant="smallStrong">{c.name}</AppText>
                  <AppText variant="caption" color="textTertiary">
                    {relationshipLabel(c.relationship).label} · 연습 시작
                  </AppText>
                </View>
              </PressableScale>
            ))}
          </ScrollView>
        </>
      ) : null}

      <SectionHeader title="연습 상대 고르기" subtitle="난이도 ★ 가 많을수록 쉽게 넘어오지 않아요" />
      <View style={styles.grid}>
        {personas.map((p, i) => (
          <Animated.View key={p.id} entering={FadeInDown.delay(60 * i).duration(260)} style={styles.gridItem}>
            <PressableScale onPress={() => start(p)} style={[styles.persona, { backgroundColor: p.color }]}>
              <View style={styles.personaTop}>
                <AppText style={styles.personaEmoji}>{p.emoji}</AppText>
                <AppText variant="caption" color={palette.gray700}>
                  {'★'.repeat(p.difficulty)}
                  {'☆'.repeat(3 - p.difficulty)}
                </AppText>
              </View>
              <AppText variant="bodyStrong" color={palette.gray900}>
                {p.name} · {p.age}
              </AppText>
              <AppText variant="caption" color={palette.gray700}>
                {p.mbti} · {p.job || relationshipLabel(p.relationship).label}
              </AppText>
              <AppText variant="caption" color={palette.gray700} numberOfLines={3} style={styles.scenario}>
                {p.scenario}
              </AppText>
            </PressableScale>
          </Animated.View>
        ))}
        <View style={styles.gridItem}>
          <PressableScale onPress={() => router.push('/practice/custom')} style={[styles.persona, styles.custom, { borderColor: theme.border }]}>
            <Ionicons name="add-circle-outline" size={30} color={theme.primary} />
            <AppText variant="bodyStrong" align="center">
              직접 만들기
            </AppText>
            <AppText variant="caption" color="textSecondary" align="center">
              나이·MBTI·상황을 골라 나만의 연습 상대를 만들어요
            </AppText>
          </PressableScale>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: Spacing.sm },
  header: { gap: 4, marginTop: Spacing.sm, marginBottom: Spacing.sm },
  hscrollWrap: { marginHorizontal: -Spacing.lg, flexGrow: 0 },
  hscroll: { gap: Spacing.sm, paddingHorizontal: Spacing.lg },
  session: { width: 168, borderRadius: Radius.lg, padding: Spacing.md, gap: 4 },
  sessionTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sessionEmoji: { fontSize: 26, lineHeight: 32 },
  heatPill: { paddingHorizontal: Spacing.sm, paddingVertical: 2, borderRadius: Radius.pill },
  intro: { borderRadius: Radius.lg, padding: Spacing.lg, flexDirection: 'row', gap: Spacing.md, alignItems: 'center' },
  introEmoji: { fontSize: 36, lineHeight: 44 },
  introTexts: { flex: 1, gap: 4 },
  crushChip: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, borderRadius: Radius.lg, paddingVertical: Spacing.sm, paddingHorizontal: Spacing.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -Spacing.xs },
  gridItem: { width: '50%', padding: Spacing.xs },
  persona: { borderRadius: Radius.lg, padding: Spacing.md, gap: 3, minHeight: 176 },
  personaTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  personaEmoji: { fontSize: 34, lineHeight: 42 },
  scenario: { marginTop: 2 },
  custom: { borderWidth: 1.5, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', gap: Spacing.xs },
});
