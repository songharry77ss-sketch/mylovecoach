import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { Fragment, useCallback, useRef, useState } from 'react';
import { Dimensions, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';

import { BrandGradient } from '@/components/brand/brand';
import { ExploreRow, TIP_CARD_RADIUS, WorryTile, useDefaultPerspective } from '@/components/tips/tip-book';
import { AppText } from '@/components/ui/app-text';
import { Chip } from '@/components/ui/chip';
import { ListGroup, useCardStyle, useInsetFill } from '@/components/ui/list-group';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Screen } from '@/components/ui/screen';
import { SectionHeader } from '@/components/ui/section-header';
import { useTabBarSpace } from '@/components/ui/tab-bar-space';
import { Brand, BrandShadow, Radius, Spacing, Typography } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { track } from '@/lib/analytics';
import { haptic } from '@/lib/haptics';
import { drawMindCard, renderSituation, themLabel } from '@/lib/mind-cards';
import { WORRIES, type Worry } from '@/lib/tips';
import type { Gender } from '@/lib/types';
import { useAppStore } from '@/store/app-store';

/** 등장 순서 — 위에서부터 50ms 간격으로 살짝 올라온다 (스프링으로 부드럽게 멈춘다, 움직임 줄이기 설정이면 바로 보인다) */
const enter = (step: number) => FadeInDown.delay(step * 50).springify().damping(18);
const PERSPECTIVES: { key: Gender; label: string }[] = [
  { key: 'male', label: '남자 속마음' },
  { key: 'female', label: '여자 속마음' },
  { key: 'other', label: '성별 무관' },
];
/** 연애 연습 빨간 점 — 그 줄이 이만큼 화면에 보였으면 「봤다」로 친다 (탐색 탭을 떠날 때 지운다) */
const PRACTICE_DOT_VIEW_MS = 2000;
const PRACTICE_DOT_POLL_MS = 500;

/**
 * 탐색 탭 (11/12 회의 개편) — 맨 위가 「연애팁 백서」: 「어떤 고민이 있어요?」 고민 카드를 누르면 그 해답 화면(app/tips/[topic]).
 * 그 아래 「더 해 볼 것」(연애 연습 · KKTI · 비밀 상담 한 묶음), 마지막에 무작위 상황으로 그 사람 속마음을 물어보는 속마음 카드.
 * 연애 연습을 아직 안 봤으면(practiceDotSeen false) 그 줄에 빨간 점 + 「이런 기능도 있어요」.
 * 1.2 개편: 옅은 바탕(canvas) 위 흰 카드, 큰 제목이 사라지면 「탐색」 유리 머리말.
 */
export default function MindTab() {
  const theme = useTheme();
  const router = useRouter();
  const cardBg = useCardStyle();
  const inset = useInsetFill();
  const tabSpace = useTabBarSpace();
  const createSecretChat = useAppStore((s) => s.createSecretChat);
  const practiceDotSeen = useAppStore((s) => s.practiceDotSeen);
  const seePracticeDot = useAppStore((s) => s.seePracticeDot);
  const kkti = useAppStore((s) => s.kkti);
  const history = useAppStore((s) => s.mindHistory);
  const defaultPerspective = useDefaultPerspective();
  const [perspective, setPerspective] = useState<Gender>(defaultPerspective);
  const [card, setCard] = useState(() => drawMindCard());
  const [seen, setSeen] = useState<string[]>([]);
  const [own, setOwn] = useState('');
  const [ownOpen, setOwnOpen] = useState(false);
  const flip = useSharedValue(0);
  const flipStyle = useAnimatedStyle(() => ({ transform: [{ perspective: 800 }, { rotateY: `${flip.value}deg` }, { scale: 1 - Math.abs(flip.value) / 900 }] }));

  const situation = renderSituation(card, perspective);
  const them = themLabel(perspective);
  const shown = history.slice(0, 3);

  // 연애 연습 빨간 점: 누르면 바로, 아니면 그 줄이 화면에 2초 넘게 보인 뒤 탐색 탭을 떠날 때 지운다
  // (탭을 열자마자 지우면 못 보고 지나가고, 보는 동안 지우면 점이 눈앞에서 사라져 어색하다)
  const practiceRow = useRef<View>(null);
  useFocusEffect(
    useCallback(() => {
      if (useAppStore.getState().practiceDotSeen) return;
      let visibleMs = 0;
      let viewed = false;
      const timer = setInterval(() => {
        practiceRow.current?.measureInWindow?.((_x, y, _w, h) => {
          const mid = y + h / 2;
          if (h > 0 && mid > 0 && mid < Dimensions.get('window').height - tabSpace) visibleMs += PRACTICE_DOT_POLL_MS;
          if (visibleMs >= PRACTICE_DOT_VIEW_MS) {
            viewed = true;
            clearInterval(timer);
          }
        });
      }, PRACTICE_DOT_POLL_MS);
      return () => {
        clearInterval(timer);
        if (viewed) seePracticeDot();
      };
    }, [tabSpace, seePracticeDot]),
  );

  const openFeature = (key: 'kkti' | 'secret' | 'practice') => {
    haptic.thud();
    track('explore_open', { feature: key });
    if (key === 'kkti') router.push('/kkti');
    else if (key === 'practice') {
      seePracticeDot();
      // 아직 안 켠 사람은 마이 「바로 쓰기」처럼 켜고 연다 — 숨긴 탭이 탭 바 선택 표시 없이 열리지 않게
      if (!useAppStore.getState().practiceEnabled) {
        useAppStore.getState().setPracticeEnabled(true);
        track('practice_toggle', { on: true, from: 'tips' });
      }
      router.push('/(tabs)/practice');
    } else router.push({ pathname: '/crush/[id]', params: { id: createSecretChat() } });
  };

  const openWorry = (worry: Worry) => {
    track('explore_open', { feature: 'worry', worry: worry.id });
    router.push({ pathname: '/tips/[topic]', params: { topic: worry.id } });
  };

  const shuffle = () => {
    haptic.select();
    flip.value = withSequence(withTiming(90, { duration: 140 }), withTiming(-90, { duration: 0 }), withSpring(0, { damping: 12, stiffness: 160 }));
    setTimeout(() => {
      const exclude = [...seen, card.id];
      setSeen(exclude.slice(-30));
      setCard(drawMindCard(exclude));
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
      {/* 연애팁 백서 — 이 탭의 주인공 */}
      <Animated.View entering={enter(0)} style={styles.head}>
        <AppText variant="smallStrong" color="primary" weight="800">
          연애팁 백서
        </AppText>
        <Text style={[styles.title, { color: theme.text }]} accessibilityRole="header">
          어떤 고민이 있어요?
        </Text>
      </Animated.View>
      <Animated.View entering={enter(1)} style={styles.grid}>
        {WORRIES.map((w) => (
          <View key={w.id} style={styles.gridItem}>
            <WorryTile worry={w} onPress={() => openWorry(w)} />
          </View>
        ))}
      </Animated.View>

      {/* 더 해 볼 것 — 흰 카드 하나에 줄 셋. 연애 연습은 기본으로 숨긴 탭이라 여기서 늘 보이게 둔다 */}
      <Animated.View entering={enter(2)}>
        <SectionHeader title="더 해 볼 것" style={styles.sectionHeader} />
        <ListGroup>
          <ExploreRow
            rowRef={practiceRow}
            icon="game-controller"
            title="연애 연습"
            dot={!practiceDotSeen}
            note={practiceDotSeen ? undefined : '이런 기능도 있어요'}
            subtitle={practiceDotSeen ? 'AI 상대와 카톡으로 미리 연습해요' : '카톡 리허설'}
            accessibilityLabel={practiceDotSeen ? '연애 연습, AI 상대와 카톡 리허설' : '연애 연습, 새 기능, AI 상대와 카톡 리허설'}
            onPress={() => openFeature('practice')}
          />
          <ExploreRow
            icon="flask"
            iconNode={kkti?.emoji ? <Text style={styles.rowEmoji}>{kkti.emoji}</Text> : undefined}
            title={kkti ? `내 KKTI · ${kkti.code}` : 'KKTI 테스트'}
            subtitle={kkti ? `${kkti.name} · 다시 해 보기` : '카톡 습관 속 나의 연애 유형'}
            accessibilityLabel={kkti ? `내 KKTI ${kkti.code} ${kkti.name}, 다시 해 보기` : 'KKTI 테스트, 카톡 습관 속 나의 연애 유형'}
            onPress={() => openFeature('kkti')}
          />
          <ExploreRow icon="glasses" title="비밀 상담" subtitle="나가면 대화·캡처가 바로 지워져요" accessibilityLabel="비밀 상담, 기록이 남지 않아요" onPress={() => openFeature('secret')} />
        </ListGroup>
      </Animated.View>

      {/* 속마음 카드 — 무작위 상황, 뒤집히며 바뀐다 */}
      <Animated.View entering={enter(3)} style={styles.sectionGap}>
        <SectionHeader title="속마음 카드" style={styles.sectionHeader} />
        <View style={styles.perspective}>
          {PERSPECTIVES.map((p) => (
            <Chip key={p.key} label={p.label} selected={perspective === p.key} onPress={() => setPerspective(p.key)} on="canvas" />
          ))}
        </View>
      </Animated.View>

      <Animated.View entering={enter(4)} style={[styles.card, cardBg, flipStyle]}>
        <AppText variant="caption" color="primary" weight="800">
          오늘의 속마음 질문 · {card.category}
        </AppText>
        <AppText variant="title2" weight="800" style={styles.situation} lineBreakStrategyIOS="hangul-word">
          {situation}
        </AppText>
        <AppText variant="small" color="textSecondary">
          이 상황에서 {them}는 진짜 무슨 생각일까요?
        </AppText>
        <View style={styles.cardActions}>
          <PressableScale feedback={false} onPress={shuffle} accessibilityLabel="다른 상황 뽑기" style={[styles.shuffle, { backgroundColor: inset }]}>
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

      {/* 직접 물어보기 — 평소엔 한 줄로 접어 두고, 누르면 펼친다 */}
      <View style={[styles.own, cardBg]}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: ownOpen }}
          onPress={() => {
            haptic.select();
            setOwnOpen((v) => !v);
          }}
          style={styles.ownHead}>
          <AppText variant="bodyStrong" weight="700" style={styles.flex}>
            내 상황 직접 물어보기
          </AppText>
          <Ionicons name={ownOpen ? 'chevron-up' : 'chevron-down'} size={18} color={theme.textTertiary} />
        </Pressable>
        {ownOpen ? (
          <Animated.View entering={FadeIn.duration(180)} style={styles.ownBody}>
            <TextInput
              value={own}
              onChangeText={setOwn}
              accessibilityLabel="내 상황 적기"
              placeholder={`예: ${them}가 내 스토리는 다 보는데 카톡은 안 해요`}
              placeholderTextColor={theme.textTertiary}
              multiline
              maxLength={400}
              autoFocus
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
          </Animated.View>
        ) : null}
      </View>

      {shown.length ? (
        <View style={styles.historyWrap}>
          <AppText variant="smallStrong" color="textSecondary" accessibilityRole="header" style={styles.historyTitle}>
            최근에 본 속마음
          </AppText>
          {/* 흰 카드 하나에 줄들 — 그림자는 바깥 칸, 눌림 색을 자르는 건 안쪽 칸 */}
          <View style={[styles.group, cardBg]}>
            <View style={styles.groupClip}>
              {shown.map((h, i) => (
                <Fragment key={h.at}>
                  {i > 0 ? <View style={[styles.separator, { backgroundColor: theme.separator }]} /> : null}
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
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: Spacing.md },
  flex: { flex: 1 },
  head: { gap: 2, marginTop: Spacing.sm, marginBottom: Spacing.xs, paddingHorizontal: 2 },
  title: { ...Typography.hero, fontSize: 28, lineHeight: 36 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -Spacing.xs - 1 },
  gridItem: { width: '50%', padding: Spacing.xs + 1 },
  rowEmoji: { fontSize: 20, lineHeight: 26 },
  sectionGap: { gap: Spacing.md },
  sectionHeader: { marginTop: Spacing.lg, marginBottom: Spacing.sm, paddingHorizontal: 2 },
  perspective: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs + 2 },
  card: { borderRadius: Radius.xl, padding: Spacing.xl - 2, gap: Spacing.md, minHeight: 220 },
  situation: { letterSpacing: -0.4 },
  cardActions: { flexDirection: 'row', gap: Spacing.sm, marginTop: 'auto' },
  shuffle: { flex: 1, height: 50, borderRadius: Radius.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  reveal: { flex: 1.3, height: 50, borderRadius: Radius.md },
  revealFill: { flex: 1, borderRadius: Radius.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, overflow: 'hidden' },
  revealText: { color: Brand.onBrand, fontSize: 15, lineHeight: 20, fontWeight: '800' },
  own: { borderRadius: TIP_CARD_RADIUS },
  ownHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.lg + 2, minHeight: 56 },
  ownBody: { gap: Spacing.md, paddingHorizontal: Spacing.lg + 2, paddingBottom: Spacing.lg + 2 },
  ownInput: { borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 2, minHeight: 80, textAlignVertical: 'top' },
  ownBtn: { height: 50, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  historyWrap: { gap: Spacing.sm, marginTop: Spacing.sm },
  historyTitle: { paddingHorizontal: Spacing.xs },
  group: { borderRadius: TIP_CARD_RADIUS },
  groupClip: { borderRadius: TIP_CARD_RADIUS, overflow: 'hidden' },
  separator: { height: StyleSheet.hairlineWidth, marginLeft: Spacing.lg, marginRight: Spacing.lg },
  historyRow: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md + 2, gap: 2 },
});
