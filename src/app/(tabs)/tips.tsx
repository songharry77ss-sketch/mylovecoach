import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { FadeInDown, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';

import { HeartMark, Highlight, Polaroid } from '@/components/stage/stage';
import { AppText } from '@/components/ui/app-text';
import { Chip } from '@/components/ui/chip';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Screen } from '@/components/ui/screen';
import { SectionHeader } from '@/components/ui/section-header';
import { Radius, Spacing, Stage, Typography, palette } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { haptic } from '@/lib/haptics';
import { MIND_CARDS, MIND_CATEGORIES, drawMindCard, renderSituation, themLabel, type MindCategory } from '@/lib/mind-cards';
import { TIPS, TIP_CATEGORIES } from '@/lib/tips';
import type { Gender } from '@/lib/types';
import { useAppStore } from '@/store/app-store';
import { track } from '@/lib/analytics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * 탐색 탭 — 채팅 말고 해 볼 것들. 맨 위 무대 머리말에 KKTI·비밀 상담·(켰으면) 연애 연습을 모아 두고,
 * 그 아래는 무작위 상황 카드로 「이럴 때 그 사람은 무슨 생각일까?」를 물어보는 속마음 카드와 연애 팁.
 */
export default function MindTab() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const practiceEnabled = useAppStore((s) => s.practiceEnabled);
  const createSecretChat = useAppStore((s) => s.createSecretChat);
  const openFeature = (key: 'kkti' | 'secret' | 'practice') => {
    haptic.thud();
    track('explore_open', { feature: key });
    if (key === 'kkti') router.push('/kkti');
    else if (key === 'practice') router.push('/(tabs)/practice');
    else router.push({ pathname: '/crush/[id]', params: { id: createSecretChat() } });
  };
  const user = useAppStore((s) => s.user);
  const kkti = useAppStore((s) => s.kkti);
  const history = useAppStore((s) => s.mindHistory);
  const firstCrushGender = useAppStore((s) => Object.values(s.crushes).find((c) => !c.secret && c.gender !== 'other')?.gender);
  // 내가 여자면 남자 속마음, 남자면 여자 속마음부터
  const defaultPerspective: Gender = user?.gender === 'female' ? 'male' : user?.gender === 'male' ? 'female' : (firstCrushGender ?? 'male');
  const [perspective, setPerspective] = useState<Gender>(defaultPerspective);
  const [card, setCard] = useState(() => drawMindCard());
  const [seen, setSeen] = useState<string[]>([]);
  const [own, setOwn] = useState('');
  const [category, setCategory] = useState<(typeof TIP_CATEGORIES)[number]>('전체');
  const [open, setOpen] = useState<string | null>(null);
  const flip = useSharedValue(0);
  const flipStyle = useAnimatedStyle(() => ({ transform: [{ perspective: 800 }, { rotateY: `${flip.value}deg` }, { scale: 1 - Math.abs(flip.value) / 900 }] }));

  const situation = renderSituation(card, perspective);
  const tips = category === '전체' ? TIPS : TIPS.filter((t) => t.category === category);
  const counts = useMemo(() => Object.fromEntries(MIND_CATEGORIES.map((c) => [c, MIND_CARDS.filter((m) => m.category === c).length])), []);

  const shuffle = (only?: MindCategory) => {
    haptic.select();
    flip.value = withSequence(withTiming(90, { duration: 140 }), withTiming(-90, { duration: 0 }), withSpring(0, { damping: 12, stiffness: 160 }));
    setTimeout(() => {
      const exclude = [...seen, card.id];
      const pool = only ? MIND_CARDS.filter((m) => m.category === only && !exclude.includes(m.id)) : null;
      const next = pool?.length ? pool[Math.floor(Math.random() * pool.length)] : drawMindCard(exclude);
      setSeen(exclude.slice(-30));
      setCard(next);
      haptic.snap();
    }, 140);
  };

  const ask = (text: string) => {
    if (!text.trim()) return;
    haptic.thud();
    router.push({ pathname: '/mind', params: { situation: text.trim(), perspective } });
  };

  return (
    <Screen contentStyle={styles.content}>
      <LinearGradient colors={Stage.bg} start={{ x: 0, y: 0 }} end={{ x: 0.4, y: 1 }} style={[styles.stage, { paddingTop: insets.top + Spacing.lg }]}>
        <View style={styles.stageHead}>
          <View style={styles.flex}>
            <Highlight variant="display" text={'연애가 더\n*재밌어지는* 것들'} />
            <Text style={styles.stageSub}>속마음 카드 · KKTI 테스트 · 비밀 상담</Text>
          </View>
          <View pointerEvents="none">
            <Polaroid photo="riversideCouple" width={88} rotate={6} />
            <HeartMark size={28} rotate={-12} style={styles.stageHeart} />
          </View>
        </View>
        <View style={styles.features}>
          <PressableScale onPress={() => openFeature('kkti')} style={[styles.feature, styles.featureKkti]}>
            <Text style={styles.featureEmoji}>🧪</Text>
            <Text style={styles.featureTitle}>KKTI 테스트</Text>
            <Text style={styles.featureBody}>카톡 습관 속 나의 연애 유형 · 1분</Text>
          </PressableScale>
          <PressableScale onPress={() => openFeature('secret')} style={[styles.feature, styles.featureGlass]}>
            <Text style={styles.featureEmoji}>🕶️</Text>
            <Text style={styles.featureTitle}>비밀 상담</Text>
            <Text style={styles.featureBody}>기록이 남지 않아요</Text>
          </PressableScale>
          {practiceEnabled ? (
            <PressableScale onPress={() => openFeature('practice')} style={[styles.feature, styles.featureGold]}>
              <Text style={styles.featureEmoji}>🎮</Text>
              <Text style={[styles.featureTitle, { color: Stage.onGold }]}>연애 연습</Text>
              <Text style={[styles.featureBody, { color: Stage.onGold }]}>AI 상대와 카톡 리허설</Text>
            </PressableScale>
          ) : null}
        </View>
      </LinearGradient>

      <View style={styles.header}>
        <AppText variant="title1">🔮 속마음 카드</AppText>
        <AppText variant="body" color="textSecondary">
          이럴 때 {themLabel(perspective)}는 무슨 생각을 할까?
        </AppText>
      </View>

      <View style={styles.perspective}>
        {(['male', 'female', 'other'] as Gender[]).map((g) => (
          <Chip key={g} label={g === 'male' ? '🙋‍♂️ 남자 속마음' : g === 'female' ? '🙋‍♀️ 여자 속마음' : '🙂 성별 무관'} selected={perspective === g} onPress={() => setPerspective(g)} tone="accent" />
        ))}
      </View>

      {/* 무작위 상황 카드 */}
      <Animated.View style={flipStyle}>
        <LinearGradient colors={[palette.lavender100, palette.pink100]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.card}>
          <View style={styles.cardTop}>
            <View style={[styles.catChip, { backgroundColor: 'rgba(255,255,255,0.7)' }]}>
              <AppText variant="caption" color={palette.gray700} weight="700">
                🎲 오늘의 속마음 질문 · {card.category}
              </AppText>
            </View>
            <AppText style={styles.cardEmoji}>{card.emoji}</AppText>
          </View>
          <AppText variant="title2" color={palette.gray900} style={styles.situation}>
            {situation}
          </AppText>
          <AppText variant="small" color={palette.gray700}>
            이 상황에서 {themLabel(perspective)}는 진짜 무슨 생각일까요?
          </AppText>
          <View style={styles.cardActions}>
            <PressableScale feedback={false} onPress={() => shuffle()} style={[styles.shuffle, { backgroundColor: 'rgba(255,255,255,0.8)' }]}>
              <AppText variant="smallStrong" color={palette.gray800}>
                🎲 다른 상황
              </AppText>
            </PressableScale>
            <PressableScale feedback={false} onPress={() => ask(situation)} style={[styles.reveal, { backgroundColor: palette.gray900 }]}>
              <AppText variant="smallStrong" color={palette.white}>
                속마음 보기 →
              </AppText>
            </PressableScale>
          </View>
        </LinearGradient>
      </Animated.View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cats} style={styles.catsWrap}>
        {MIND_CATEGORIES.map((c) => (
          <Chip key={c} label={`${c} ${counts[c]}`} onPress={() => shuffle(c)} size="sm" />
        ))}
      </ScrollView>

      {/* 직접 물어보기 */}
      <View style={[styles.own, { backgroundColor: theme.surface }]}>
        <AppText variant="smallStrong">✍️ 내 상황 직접 물어보기</AppText>
        <TextInput
          value={own}
          onChangeText={setOwn}
          placeholder={`예: ${themLabel(perspective)}가 내 스토리는 다 보는데 카톡은 안 해요`}
          placeholderTextColor={theme.textTertiary}
          multiline
          maxLength={400}
          style={[styles.ownInput, Typography.body, { color: theme.text, backgroundColor: theme.background }]}
        />
        <PressableScale feedback={false} onPress={() => ask(own)} disabled={!own.trim()} style={[styles.ownBtn, { backgroundColor: own.trim() ? theme.primary : theme.surfaceSelected }]}>
          <AppText variant="smallStrong" color={own.trim() ? theme.primaryText : theme.textTertiary}>
            {themLabel(perspective)} 속마음 물어보기
          </AppText>
        </PressableScale>
      </View>

      {/* KKTI 테스트 */}
      <PressableScale onPress={() => router.push('/kkti')}>
        <LinearGradient colors={[kkti?.color ?? palette.sky400, palette.lavender400]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.kkti}>
          <AppText style={styles.kktiEmoji}>{kkti?.emoji ?? '🧪'}</AppText>
          <View style={styles.flex}>
            <AppText variant="title3" color={palette.white}>
              {kkti ? `내 KKTI · ${kkti.code} ${kkti.name}` : 'KKTI 테스트'}
            </AppText>
            <AppText variant="small" color={palette.white}>
              {kkti ? `연애 컬러 ${kkti.colorName} · 다시 해보기` : '카톡으로 보는 진짜 연애 MBTI · 나만의 연애 컬러 찾기'}
            </AppText>
          </View>
          <Ionicons name="chevron-forward" size={20} color={palette.white} />
        </LinearGradient>
      </PressableScale>

      {history.length ? (
        <>
          <SectionHeader title="최근에 본 속마음" />
          <View style={styles.list}>
            {history.slice(0, 4).map((h, i) => (
              <PressableScale
                key={h.at}
                onPress={() => router.push({ pathname: '/mind', params: { history: String(i) } })}
                style={[styles.historyRow, { backgroundColor: theme.surface }]}>
                <AppText variant="caption" color="accent" weight="700">
                  {themLabel(h.perspective)} 속마음
                </AppText>
                <AppText variant="small" numberOfLines={1}>
                  {h.situation}
                </AppText>
                <AppText variant="caption" color="textSecondary" numberOfLines={1}>
                  💭 {h.reading.innerVoice}
                </AppText>
              </PressableScale>
            ))}
          </View>
        </>
      ) : null}

      <SectionHeader title="연애 팁" subtitle="코치가 자주 하는 조언을 모았어요" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cats} style={styles.catsWrap}>
        {TIP_CATEGORIES.map((c) => (
          <Chip key={c} label={c} selected={category === c} onPress={() => setCategory(c)} />
        ))}
      </ScrollView>
      <View style={styles.list}>
        {tips.map((tip, i) => {
          const expanded = open === tip.id;
          return (
            <Animated.View key={tip.id} entering={FadeInDown.delay(30 * i).duration(220)}>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded }}
                onPress={() => {
                  haptic.select();
                  setOpen(expanded ? null : tip.id);
                }}
                style={[styles.tip, { backgroundColor: theme.surface }]}>
                <View style={styles.tipHead}>
                  <AppText style={styles.tipEmoji}>{tip.emoji}</AppText>
                  <View style={styles.flex}>
                    <AppText variant="caption" color="primary">
                      {tip.category}
                    </AppText>
                    <AppText variant="bodyStrong">{tip.title}</AppText>
                  </View>
                </View>
                {expanded ? (
                  <AppText variant="small" color="textSecondary" style={styles.tipBody}>
                    {tip.body}
                  </AppText>
                ) : null}
              </Pressable>
            </Animated.View>
          );
        })}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: Spacing.md },
  flex: { flex: 1 },
  stage: { marginHorizontal: -Spacing.lg, paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xl, borderBottomLeftRadius: Radius.xl, borderBottomRightRadius: Radius.xl, gap: Spacing.lg },
  stageHead: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md },
  stageSub: { fontSize: 14, fontWeight: '600', color: Stage.textDim, marginTop: Spacing.sm },
  stageHeart: { position: 'absolute', left: -16, bottom: -18 },
  features: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  feature: { flexGrow: 1, flexBasis: '45%', borderRadius: Radius.lg, padding: Spacing.lg, gap: 2, minHeight: 112 },
  featureKkti: { backgroundColor: '#E86B5F' },
  featureGlass: { backgroundColor: Stage.chip, borderWidth: 1, borderColor: Stage.chipBorder },
  featureGold: { backgroundColor: Stage.gold },
  featureEmoji: { fontSize: 26, lineHeight: 32, marginBottom: 4 },
  featureTitle: { fontSize: 16, fontWeight: '900', color: Stage.text, letterSpacing: -0.3 },
  featureBody: { fontSize: 12, lineHeight: 16, fontWeight: '600', color: Stage.textDim },
  header: { gap: 4, marginTop: Spacing.sm },
  perspective: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs },
  card: { borderRadius: Radius.xl, padding: Spacing.xl, gap: Spacing.md, minHeight: 230 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  catChip: { paddingHorizontal: Spacing.sm + 2, paddingVertical: 4, borderRadius: Radius.pill },
  cardEmoji: { fontSize: 34, lineHeight: 42 },
  situation: { letterSpacing: -0.4 },
  cardActions: { flexDirection: 'row', gap: Spacing.sm, marginTop: 'auto' },
  shuffle: { flex: 1, height: 46, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  reveal: { flex: 1.3, height: 46, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  catsWrap: { marginHorizontal: -Spacing.lg, flexGrow: 0 },
  cats: { gap: Spacing.sm, paddingHorizontal: Spacing.lg },
  own: { borderRadius: Radius.lg, padding: Spacing.lg, gap: Spacing.sm },
  ownInput: { borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, minHeight: 72, textAlignVertical: 'top' },
  ownBtn: { height: 46, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  kkti: { borderRadius: Radius.lg, padding: Spacing.lg, flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  kktiEmoji: { fontSize: 32, lineHeight: 40 },
  list: { gap: Spacing.sm },
  historyRow: { borderRadius: Radius.md, padding: Spacing.md, gap: 2 },
  tip: { borderRadius: Radius.lg, padding: Spacing.lg, gap: Spacing.md },
  tipHead: { flexDirection: 'row', gap: Spacing.md, alignItems: 'center' },
  tipEmoji: { fontSize: 28, lineHeight: 34 },
  tipBody: { paddingLeft: 44 },
});
