import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { BrandGradient, HeroCard, Icon3D } from '@/components/brand/brand';
import { RoomAvatar } from '@/components/crush/crush-list-item';
import { AnimatedNumber } from '@/components/ui/animated-number';
import { AppText } from '@/components/ui/app-text';
import { useCardStyle, useInsetFill } from '@/components/ui/list-group';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Screen } from '@/components/ui/screen';
import { SectionHeader } from '@/components/ui/section-header';
import { Brand, BrandShadow, Radius, Spacing, Typography } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { relativeTime } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { josa } from '@/lib/kkti';
import { relationshipLabel } from '@/lib/labels';
import { personasFor } from '@/lib/personas';
import { personaFromCrush } from '@/lib/practice';
import type { PracticePersona } from '@/lib/types';
import { sortCrushes, useAppStore } from '@/store/app-store';

/** 등장 순서 — 위에서부터 50ms 간격으로 살짝 올라온다 (스프링으로 부드럽게 멈춘다, 움직임 줄이기 설정이면 바로 보인다) */
const enter = (step: number) => FadeInDown.delay(step * 50).springify().damping(18);
/** 카드 모서리 — 지침 1.2: 카드 22 */
const CARD_RADIUS = Radius.lg + 2;
const LEVEL = ['', '쉬움', '보통', '어려움'] as const;
const STEPS = ['상대를 고르면 먼저 카톡이 와요', '답할 때마다 바로 피드백을 받아요', '호감 온도가 0°에서 오르내려요'];

/**
 * 연애 연습 탭 — AI 상대역과 카톡하듯 연습하고, 0°에서 시작하는 온도를 올려 본다.
 * 1.2 개편: 옅은 회색 바탕(canvas) 위 흰 카드, 큰 제목이 사라지면 「연애 연습」 유리 머리말.
 */
export default function PracticeTab() {
  const theme = useTheme();
  const router = useRouter();
  const cardBg = useCardStyle();
  const inset = useInsetFill();
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
    <Screen safeTop tab title="연애 연습" contentStyle={styles.content}>
      <Animated.View entering={enter(0)} style={styles.head}>
        <View style={styles.flex}>
          <AppText variant="small" color="textSecondary" weight="600">
            연애 연습
          </AppText>
          <Text style={[styles.title, { color: theme.text }]} accessibilityRole="header">
            {'실전 전에\n카톡으로 연습해요'}
          </Text>
        </View>
        <Icon3D name="heart" size={80} float style={styles.icon3d} />
      </Animated.View>

      {sessions.length ? (
        <Animated.View entering={enter(1)}>
          <SectionHeader title="이어서 하기" style={styles.sectionTitle} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hscroll} style={styles.hscrollWrap}>
            {sessions.map((s, i) => {
              const last = s.turns[s.turns.length - 1];
              const latest = i === 0;
              const inner = (
                <>
                  <View style={styles.sessionTop}>
                    <Text style={styles.sessionEmoji}>{s.persona.emoji}</Text>
                    <AnimatedNumber value={s.heat} suffix="°" ticks={false} duration={800} style={[styles.sessionHeat, { color: latest ? Brand.onBrand : theme.primary }]} />
                  </View>
                  <AppText variant="smallStrong" color={latest ? Brand.onBrand : 'text'} numberOfLines={1}>
                    {s.persona.name}
                    {s.ended ? ' · 끝' : ''}
                  </AppText>
                  <AppText variant="caption" color={latest ? Brand.onBrandDim : 'textSecondary'} numberOfLines={2} style={styles.sessionLast}>
                    {last?.text ?? ''}
                  </AppText>
                  <AppText variant="caption" color={latest ? Brand.onBrandFaint : 'textTertiary'}>
                    {relativeTime(s.updatedAt)}
                  </AppText>
                </>
              );
              return (
                <PressableScale
                  key={s.id}
                  pressedScale={0.97}
                  accessibilityLabel={`${s.persona.name}${josa(s.persona.name, '과', '와')}의 연습 이어서 하기, 호감 온도 ${s.heat}도`}
                  onPress={() => router.push({ pathname: '/practice/[id]', params: { id: s.id } })}
                  style={[styles.session, latest ? BrandShadow : cardBg]}>
                  {latest ? <BrandGradient style={styles.sessionFill}>{inner}</BrandGradient> : <View style={styles.sessionFill}>{inner}</View>}
                </PressableScale>
              );
            })}
          </ScrollView>
        </Animated.View>
      ) : (
        <Animated.View entering={enter(1)}>
          <HeroCard>
            <Text style={styles.heroTitle}>이렇게 연습해요</Text>
            <View style={styles.steps}>
              {STEPS.map((step, i) => (
                <View key={step} style={styles.step}>
                  <View style={styles.stepNum}>
                    <Text style={styles.stepNumText}>{i + 1}</Text>
                  </View>
                  <Text style={styles.stepText}>{step}</Text>
                </View>
              ))}
            </View>
          </HeroCard>
        </Animated.View>
      )}

      {crushes.length ? (
        <Animated.View entering={enter(2)}>
          <SectionHeader title="내 상대와 미리 연습" subtitle="실제로 보내기 전에 리허설해요" style={[styles.sectionHead, styles.sectionHeadAbove]} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hscroll} style={styles.hscrollWrap}>
            {crushes.map((c) => (
              <PressableScale key={c.id} pressedScale={0.97} accessibilityLabel={`${c.name}${josa(c.name, '과', '와')} 연습 시작`} onPress={() => start(personaFromCrush(c))} style={[styles.crushChip, cardBg]}>
                <RoomAvatar crush={c} size={40} />
                <View>
                  <AppText variant="smallStrong">{c.name}</AppText>
                  <AppText variant="caption" color="primary" weight="700">
                    {relationshipLabel(c.relationship).label} · 연습 시작
                  </AppText>
                </View>
              </PressableScale>
            ))}
          </ScrollView>
        </Animated.View>
      ) : null}

      <Animated.View entering={enter(3)}>
        <SectionHeader title="연습 상대 고르기" subtitle="어려울수록 쉽게 넘어오지 않아요" style={styles.sectionHead} />
      </Animated.View>
      <View style={styles.grid}>
        {personas.map((p, i) => (
          <Animated.View key={p.id} entering={FadeInDown.delay(200 + 50 * Math.min(i, 8)).duration(320)} style={styles.gridItem}>
            <PressableScale onPress={() => start(p)} accessibilityLabel={`${p.name}, ${p.age}, 난이도 ${LEVEL[p.difficulty] ?? ''}`} style={[styles.persona, cardBg]}>
              <View style={styles.personaTop}>
                <View style={[styles.personaEmojiWrap, { backgroundColor: inset }]}>
                  <Text style={styles.personaEmoji}>{p.emoji}</Text>
                </View>
                <View style={[styles.level, { backgroundColor: p.difficulty >= 3 ? theme.accentSoft : theme.primarySoft }]}>
                  <AppText variant="caption" weight="800" color={p.difficulty >= 3 ? 'accent' : 'primary'}>
                    {LEVEL[p.difficulty] ?? ''}
                  </AppText>
                </View>
              </View>
              <AppText variant="bodyStrong" weight="800" numberOfLines={1}>
                {p.name} · {p.age}
              </AppText>
              <AppText variant="caption" color="textSecondary" numberOfLines={1}>
                {p.mbti} · {p.job || relationshipLabel(p.relationship).label}
              </AppText>
              <AppText variant="caption" color="textSecondary" numberOfLines={3} style={styles.scenario}>
                {p.scenario}
              </AppText>
            </PressableScale>
          </Animated.View>
        ))}
        <View style={styles.gridItem}>
          <PressableScale onPress={() => router.push('/practice/custom')} accessibilityLabel="연습 상대 직접 만들기" style={[styles.persona, styles.custom, cardBg]}>
            <View style={[styles.customIcon, { backgroundColor: theme.primarySoft }]}>
              <Ionicons name="add" size={26} color={theme.primary} />
            </View>
            <AppText variant="bodyStrong" weight="800" align="center">
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
  content: { gap: Spacing.md },
  flex: { flex: 1 },
  head: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.sm, marginBottom: Spacing.xs },
  title: { ...Typography.hero, fontSize: 30, lineHeight: 39, marginTop: 4 },
  icon3d: { marginRight: -4 },
  sectionTitle: { marginTop: Spacing.xs, marginBottom: Spacing.md, paddingHorizontal: 2 },
  sectionHead: { marginTop: Spacing.md, marginBottom: Spacing.xs, paddingHorizontal: 2 },
  // 바로 아래가 가로 스크롤(위 여백을 그림자 자리로 비운 칸)일 때
  sectionHeadAbove: { marginBottom: Spacing.md },
  // 카드 그림자가 가로 스크롤 칸에 잘리지 않게 위아래를 조금 비우고, 그만큼 바깥 간격을 줄인다
  hscrollWrap: { marginHorizontal: -Spacing.lg, marginTop: -Spacing.lg, marginBottom: -Spacing.xl, flexGrow: 0 },
  hscroll: { gap: Spacing.sm + 2, paddingHorizontal: Spacing.lg, paddingTop: Spacing.lg, paddingBottom: Spacing.xxl },
  session: { width: 172, borderRadius: CARD_RADIUS },
  sessionFill: { flex: 1, borderRadius: CARD_RADIUS, padding: Spacing.md + 2, gap: 4, overflow: 'hidden' },
  sessionTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 },
  sessionEmoji: { fontSize: 28, lineHeight: 34 },
  sessionHeat: { fontSize: 24, lineHeight: 28, fontWeight: '900', letterSpacing: -0.8 },
  sessionLast: { minHeight: 32 },
  heroTitle: { color: Brand.onBrand, fontSize: 22, lineHeight: 28, fontWeight: '900', letterSpacing: -0.5 },
  steps: { gap: Spacing.md, marginTop: Spacing.lg },
  step: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  stepNum: { width: 28, height: 28, borderRadius: 14, backgroundColor: Brand.glass, borderWidth: 1, borderColor: Brand.glassBorder, alignItems: 'center', justifyContent: 'center' },
  stepNumText: { color: Brand.onBrand, fontSize: 13, lineHeight: 16, fontWeight: '900' },
  stepText: { flex: 1, color: Brand.onBrand, opacity: 0.94, fontSize: 15, lineHeight: 21, fontWeight: '700' },
  crushChip: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, borderRadius: CARD_RADIUS, paddingVertical: Spacing.sm + 2, paddingLeft: Spacing.md, paddingRight: Spacing.lg },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -Spacing.xs - 1 },
  gridItem: { width: '50%', padding: Spacing.xs + 1 },
  persona: { borderRadius: CARD_RADIUS, padding: Spacing.md + 2, gap: 3, minHeight: 188 },
  personaTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: Spacing.xs },
  personaEmojiWrap: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  personaEmoji: { fontSize: 28, lineHeight: 34 },
  level: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radius.pill },
  scenario: { marginTop: 2 },
  custom: { alignItems: 'center', justifyContent: 'center', gap: Spacing.xs },
  customIcon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.xs },
});
