import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Fragment, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { FadeInDown, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';

import { BrandGradient, Icon3D } from '@/components/brand/brand';
import { AppText } from '@/components/ui/app-text';
import { Chip } from '@/components/ui/chip';
import { useCardStyle, useInsetFill } from '@/components/ui/list-group';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Screen } from '@/components/ui/screen';
import { SectionHeader } from '@/components/ui/section-header';
import { Brand, BrandShadow, Radius, Spacing, Typography, palette } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { track } from '@/lib/analytics';
import { haptic } from '@/lib/haptics';
import { MIND_CARDS, MIND_CATEGORIES, drawMindCard, renderSituation, themLabel, type MindCategory } from '@/lib/mind-cards';
import { TIPS, TIP_CATEGORIES } from '@/lib/tips';
import type { Gender } from '@/lib/types';
import { useAppStore } from '@/store/app-store';

/** 등장 순서 — 위에서부터 50ms 간격으로 살짝 올라온다 (스프링으로 부드럽게 멈춘다, 움직임 줄이기 설정이면 바로 보인다) */
const enter = (step: number) => FadeInDown.delay(step * 50).springify().damping(18);
/** 비밀 상담 카드 — 같은 그라데이션을 한 톤 깊게 (밤 같은 느낌) */
const SECRET_GRADIENT = [palette.sendBlue600, palette.sendViolet600, palette.sendBlue700] as const;
const PERSPECTIVES: { key: Gender; label: string }[] = [
  { key: 'male', label: '남자 속마음' },
  { key: 'female', label: '여자 속마음' },
  { key: 'other', label: '성별 무관' },
];
/**
 * 속마음 카드 주제마다 아이콘 하나 — 카드마다 붙어 있던 이모지(예: 썸 카드의 🚧)는 뜻이 어긋나는 게 있어 쓰지 않는다.
 * 주제가 늘면 여기에 더한다 (없으면 말풍선).
 */
const CATEGORY_ICON: Record<MindCategory, keyof typeof Ionicons.glyphMap> = {
  연락: 'chatbubble-ellipses',
  썸: 'sparkles',
  데이트: 'cafe',
  연애중: 'heart',
  '이별·재회': 'heart-half',
};
/** 팁 줄 사이 가는 선이 시작하는 곳 — 안쪽 여백 + 이모지 칸 + 간격 */
const TIP_INSET = Spacing.lg + 44 + Spacing.md;

/**
 * 탐색 탭 — 채팅 말고 해 볼 것들. 큰 제목 아래 그라데이션 타일 두 장(KKTI·비밀 상담)과 (켰으면) 연애 연습,
 * 그 아래는 무작위 상황 카드로 「이럴 때 그 사람은 무슨 생각일까?」를 물어보는 속마음 카드와 연애 팁.
 * 1.2 개편: 옅은 회색 바탕(canvas) 위 흰 카드 — 최근 속마음·연애 팁은 흰 카드 하나에 줄들(눌림 색만), 큰 제목이 사라지면 「탐색」 유리 머리말.
 */
export default function MindTab() {
  const theme = useTheme();
  const router = useRouter();
  const cardBg = useCardStyle();
  const inset = useInsetFill();
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
  const them = themLabel(perspective);
  const shown = history.slice(0, 4);

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
    <Screen safeTop tab keyboard title="탐색" contentStyle={styles.content}>
      {/* 큰 제목 + 3D 하트 하나 */}
      <Animated.View entering={enter(0)} style={styles.head}>
        <View style={styles.flex}>
          <AppText variant="small" color="textSecondary" weight="600">
            탐색
          </AppText>
          <Text style={[styles.title, { color: theme.text }]} accessibilityRole="header">
            {'연애가 더\n재밌어지는 것들'}
          </Text>
        </View>
        <Icon3D name="heart" size={84} float style={styles.icon3d} />
      </Animated.View>

      {/* KKTI · 비밀 상담 — 그라데이션 타일 두 장 */}
      <Animated.View entering={enter(1)} style={styles.features}>
        {/* 이미 해 봤으면 내 결과를 보여 준다 */}
        <FeatureCard
          onPress={() => openFeature('kkti')}
          accessibilityLabel={kkti ? `내 KKTI ${kkti.code} ${kkti.name}, 다시 해 보기` : 'KKTI 테스트, 카톡 습관 속 나의 연애 유형'}
          colors={Brand.gradient}
          badge={kkti ? '내 결과' : '1분 테스트'}
          icon={kkti?.emoji ? <Text style={styles.featureEmoji}>{kkti.emoji}</Text> : <Ionicons name="flask" size={22} color={Brand.onBrand} />}
          title={kkti ? `KKTI · ${kkti.code}` : 'KKTI 테스트'}
          body={kkti ? `${kkti.name}\n다시 해 보기` : '카톡 습관 속\n나의 연애 유형'}
        />
        <FeatureCard
          onPress={() => openFeature('secret')}
          accessibilityLabel="비밀 상담, 기록이 남지 않아요"
          colors={SECRET_GRADIENT}
          badge="기기에 안 남아요"
          icon={<Ionicons name="glasses" size={22} color={Brand.onBrand} />}
          title="비밀 상담"
          body={'나가면 대화·캡처가\n바로 지워져요'}
        />
      </Animated.View>

      {practiceEnabled ? (
        <Animated.View entering={enter(2)}>
          <PressableScale onPress={() => openFeature('practice')} pressedScale={0.98} accessibilityLabel="연애 연습, AI 상대와 카톡 리허설" style={[styles.practice, cardBg]}>
            <View style={[styles.practiceIcon, { backgroundColor: theme.primarySoft }]}>
              <Ionicons name="game-controller" size={22} color={theme.primary} />
            </View>
            <View style={styles.flex}>
              <AppText variant="bodyStrong" weight="700">
                연애 연습
              </AppText>
              <AppText variant="caption" color="textSecondary">
                AI 상대와 카톡으로 미리 연습해요
              </AppText>
            </View>
            <Ionicons name="chevron-forward" size={18} color={theme.textTertiary} />
          </PressableScale>
        </Animated.View>
      ) : null}

      {/* 속마음 카드 */}
      <Animated.View entering={enter(3)} style={styles.sectionGap}>
        <SectionHeader title="속마음 카드" subtitle={`이럴 때 ${them}는 무슨 생각을 할까?`} style={styles.sectionHeader} />
        <View style={styles.perspective}>
          {PERSPECTIVES.map((p) => (
            <Chip key={p.key} label={p.label} selected={perspective === p.key} onPress={() => setPerspective(p.key)} on="canvas" />
          ))}
        </View>
      </Animated.View>

      {/* 무작위 상황 카드 — 흰 큰 카드, 주제 아이콘 하나, 뒤집히며 바뀐다 */}
      <Animated.View entering={enter(4)} style={[styles.card, cardBg, flipStyle]}>
        <View style={styles.cardTop}>
          <View style={[styles.catChip, { backgroundColor: theme.primarySoft }]}>
            <Ionicons name="shuffle" size={13} color={theme.primary} />
            <AppText variant="caption" color="primary" weight="800">
              오늘의 속마음 질문 · {card.category}
            </AppText>
          </View>
          <View style={[styles.catIcon, { backgroundColor: theme.accentSoft }]} accessibilityElementsHidden importantForAccessibility="no">
            <Ionicons name={CATEGORY_ICON[card.category] ?? 'chatbubble-ellipses'} size={22} color={theme.accent} />
          </View>
        </View>
        <AppText variant="title2" weight="800" style={styles.situation} lineBreakStrategyIOS="hangul-word">
          {situation}
        </AppText>
        <AppText variant="small" color="textSecondary">
          이 상황에서 {them}는 진짜 무슨 생각일까요?
        </AppText>
        <View style={styles.cardActions}>
          <PressableScale feedback={false} onPress={() => shuffle()} accessibilityLabel="다른 상황 뽑기" style={[styles.shuffle, { backgroundColor: inset }]}>
            <Ionicons name="refresh" size={16} color={theme.text} />
            <AppText variant="smallStrong">다른 상황</AppText>
          </PressableScale>
          <PressableScale feedback={false} onPress={() => ask(situation)} accessibilityLabel={`${them} 속마음 보기`} style={[styles.reveal, BrandShadow]}>
            <BrandGradient colors={Brand.button} style={styles.revealFill}>
              <Text style={styles.revealText}>속마음 보기</Text>
              <Ionicons name="arrow-forward" size={16} color={Brand.onBrand} />
            </BrandGradient>
          </PressableScale>
        </View>
      </Animated.View>

      {/* 주제를 골라 뽑기 */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cats} style={styles.catsWrap}>
        {MIND_CATEGORIES.map((c) => (
          <Chip key={c} label={`${c} ${counts[c]}`} onPress={() => shuffle(c)} size="sm" on="canvas" />
        ))}
      </ScrollView>

      {/* 직접 물어보기 */}
      <View style={[styles.own, cardBg]}>
        <AppText variant="bodyStrong" weight="800">
          내 상황 직접 물어보기
        </AppText>
        <TextInput
          value={own}
          onChangeText={setOwn}
          accessibilityLabel="내 상황 적기"
          placeholder={`예: ${them}가 내 스토리는 다 보는데 카톡은 안 해요`}
          placeholderTextColor={theme.textTertiary}
          multiline
          maxLength={400}
          style={[styles.ownInput, Typography.body, { color: theme.text, backgroundColor: inset }]}
        />
        <PressableScale
          feedback={false}
          onPress={() => ask(own)}
          disabled={!own.trim()}
          accessibilityState={{ disabled: !own.trim() }}
          style={[styles.ownBtn, { backgroundColor: own.trim() ? theme.primary : theme.surfaceSelected }]}>
          <AppText variant="smallStrong" color={own.trim() ? theme.primaryText : theme.textTertiary}>
            {them} 속마음 물어보기
          </AppText>
        </PressableScale>
      </View>

      {shown.length ? (
        <>
          <SectionHeader title="최근에 본 속마음" style={styles.sectionHeader} />
          {/* 흰 카드 하나에 줄들 — 그림자는 바깥 칸, 눌림 색을 자르는 건 안쪽 칸 */}
          <View style={[styles.group, cardBg]}>
            <View style={styles.groupClip}>
              {shown.map((h, i) => (
                <Fragment key={h.at}>
                  {i > 0 ? <View style={[styles.separator, styles.historySeparator, { backgroundColor: theme.separator }]} /> : null}
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => {
                      haptic.soft();
                      router.push({ pathname: '/mind', params: { history: String(i) } });
                    }}
                    style={({ pressed }) => [styles.historyRow, { backgroundColor: pressed ? inset : 'transparent' }]}>
                    <AppText variant="caption" color="accent" weight="800">
                      {themLabel(h.perspective)} 속마음
                    </AppText>
                    <AppText variant="smallStrong" numberOfLines={1}>
                      {h.situation}
                    </AppText>
                    <AppText variant="caption" color="textSecondary" numberOfLines={1}>
                      {h.reading.innerVoice}
                    </AppText>
                  </Pressable>
                </Fragment>
              ))}
            </View>
          </View>
        </>
      ) : null}

      <SectionHeader title="연애 팁" subtitle="코치가 자주 하는 조언을 모았어요" style={styles.sectionHeader} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cats} style={styles.catsWrap}>
        {TIP_CATEGORIES.map((c) => (
          <Chip key={c} label={c} selected={category === c} onPress={() => setCategory(c)} on="canvas" />
        ))}
      </ScrollView>
      {/* 팁도 흰 카드 하나에 펼치는 줄들 */}
      <View style={[styles.group, cardBg]}>
        <View style={styles.groupClip}>
          {tips.map((tip, i) => {
            const expanded = open === tip.id;
            return (
              <Animated.View key={tip.id} entering={FadeInDown.delay(30 * Math.min(i, 10)).duration(220)}>
                {i > 0 ? <View style={[styles.separator, { backgroundColor: theme.separator }]} /> : null}
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ expanded }}
                  onPress={() => {
                    haptic.select();
                    setOpen(expanded ? null : tip.id);
                  }}
                  style={({ pressed }) => [styles.tip, { backgroundColor: pressed ? inset : 'transparent' }]}>
                  <View style={styles.tipHead}>
                    <View style={[styles.tipEmojiWrap, { backgroundColor: inset }]}>
                      <AppText style={styles.tipEmoji}>{tip.emoji}</AppText>
                    </View>
                    <View style={styles.flex}>
                      <AppText variant="caption" color="primary" weight="700">
                        {tip.category}
                      </AppText>
                      <AppText variant="bodyStrong">{tip.title}</AppText>
                    </View>
                    <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={theme.textTertiary} />
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
      </View>
    </Screen>
  );
}

/** 그라데이션 기능 타일 — 흰 글자, 위에 작은 유리 칩, 누르면 말랑하게 튄다 */
function FeatureCard({
  onPress,
  accessibilityLabel,
  colors,
  badge,
  icon,
  title,
  body,
}: {
  onPress: () => void;
  accessibilityLabel: string;
  colors: readonly [string, string, ...string[]];
  badge: string;
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <PressableScale feedback={false} onPress={onPress} accessibilityLabel={accessibilityLabel} style={[styles.feature, BrandShadow]}>
      <BrandGradient colors={colors} style={styles.featureFill}>
        <View pointerEvents="none" style={styles.featureOrb} />
        <View style={styles.featureTop}>
          <View style={styles.featureIcon}>{icon}</View>
          <View style={styles.featureBadge}>
            <Text style={styles.featureBadgeText}>{badge}</Text>
          </View>
        </View>
        <View style={styles.featureTexts}>
          <Text style={styles.featureTitle} numberOfLines={1}>
            {title}
          </Text>
          <Text style={styles.featureBody} numberOfLines={2}>
            {body}
          </Text>
        </View>
      </BrandGradient>
    </PressableScale>
  );
}

/** 카드 모서리 — 지침 1.2: 카드·타일 22, 큰 카드 28 */
const CARD_RADIUS = Radius.lg + 2;

const styles = StyleSheet.create({
  content: { gap: Spacing.md },
  flex: { flex: 1 },
  head: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.sm, marginBottom: Spacing.xs },
  title: { ...Typography.hero, fontSize: 30, lineHeight: 39, marginTop: 4 },
  icon3d: { marginRight: -4 },
  features: { flexDirection: 'row', gap: Spacing.md },
  feature: { flex: 1, borderRadius: CARD_RADIUS },
  featureFill: { borderRadius: CARD_RADIUS, padding: Spacing.lg, minHeight: 164, overflow: 'hidden', justifyContent: 'space-between' },
  featureOrb: { position: 'absolute', width: 150, height: 150, borderRadius: 75, top: -60, right: -50, backgroundColor: Brand.glass },
  featureTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: Spacing.xs },
  featureIcon: { width: 42, height: 42, borderRadius: 21, backgroundColor: Brand.glass, borderWidth: 1, borderColor: Brand.glassBorder, alignItems: 'center', justifyContent: 'center' },
  featureEmoji: { fontSize: 22, lineHeight: 28 },
  featureBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radius.pill, backgroundColor: Brand.glass },
  featureBadgeText: { color: Brand.onBrand, fontSize: 12, lineHeight: 16, fontWeight: '800' },
  featureTexts: { gap: 3, marginTop: Spacing.lg },
  featureTitle: { color: Brand.onBrand, fontSize: 18, lineHeight: 24, fontWeight: '900', letterSpacing: -0.4 },
  featureBody: { color: Brand.onBrand, opacity: 0.92, fontSize: 13, lineHeight: 18, fontWeight: '700' },
  practice: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, borderRadius: CARD_RADIUS, padding: Spacing.lg },
  practiceIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  sectionGap: { gap: Spacing.md },
  sectionHeader: { marginTop: Spacing.lg, marginBottom: 0, paddingHorizontal: 2 },
  perspective: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs + 2 },
  card: { borderRadius: Radius.xl, padding: Spacing.xl - 2, gap: Spacing.md, minHeight: 230 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: Spacing.sm },
  catChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: Spacing.sm + 2, paddingVertical: 5, borderRadius: Radius.pill, flexShrink: 1 },
  catIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  situation: { letterSpacing: -0.4 },
  cardActions: { flexDirection: 'row', gap: Spacing.sm, marginTop: 'auto' },
  shuffle: { flex: 1, height: 50, borderRadius: Radius.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  reveal: { flex: 1.3, height: 50, borderRadius: Radius.md },
  revealFill: { flex: 1, borderRadius: Radius.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, overflow: 'hidden' },
  revealText: { color: Brand.onBrand, fontSize: 15, lineHeight: 20, fontWeight: '800' },
  catsWrap: { marginHorizontal: -Spacing.lg, flexGrow: 0 },
  cats: { gap: Spacing.sm, paddingHorizontal: Spacing.lg },
  own: { borderRadius: CARD_RADIUS, padding: Spacing.lg + 2, gap: Spacing.md, marginTop: Spacing.sm },
  ownInput: { borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 2, minHeight: 80, textAlignVertical: 'top' },
  ownBtn: { height: 50, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  group: { borderRadius: CARD_RADIUS },
  groupClip: { borderRadius: CARD_RADIUS, overflow: 'hidden' },
  separator: { height: StyleSheet.hairlineWidth, marginLeft: TIP_INSET, marginRight: Spacing.lg },
  historySeparator: { marginLeft: Spacing.lg },
  historyRow: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md + 2, gap: 2 },
  tip: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md + 2, gap: Spacing.md },
  tipHead: { flexDirection: 'row', gap: Spacing.md, alignItems: 'center' },
  tipEmojiWrap: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  tipEmoji: { fontSize: 24, lineHeight: 30 },
  tipBody: { paddingLeft: 44 + Spacing.md },
});
