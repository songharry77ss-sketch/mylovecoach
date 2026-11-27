import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Dimensions, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';

import { ExploreRow, WorryTile, useCostNote, useDefaultPerspective, useFill } from '@/components/tips/tip-book';
import { AppText } from '@/components/ui/app-text';
import { Chip } from '@/components/ui/chip';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Screen } from '@/components/ui/screen';
import { SectionHeader } from '@/components/ui/section-header';
import { useTabBarSpace } from '@/components/ui/tab-bar-space';
import { Brand, Spacing, Typography } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';
import { track } from '@/lib/analytics';
import { haptic } from '@/lib/haptics';
import { L, isKo } from '@/lib/i18n';
import { kktiCopy } from '@/lib/kkti-en';
import { drawMindCard, mindCategoryLabel, renderSituation, themLabel } from '@/lib/mind-cards';
import { WORRIES, type Worry } from '@/lib/tips';
import type { Gender } from '@/lib/types';
import { useAppStore } from '@/store/app-store';

/** 등장 — 위에서부터 짧게 (1.4 개편: 튕김 없이 300ms) */
const enter = (step: number) => FadeInDown.delay(step * 40).duration(300);
const PERSPECTIVES: { key: Gender; label: string }[] = L(
  [
    { key: 'male', label: '남자 속마음' },
    { key: 'female', label: '여자 속마음' },
    { key: 'other', label: '성별 무관' },
  ],
  [
    { key: 'male', label: 'His side' },
    { key: 'female', label: 'Her side' },
    { key: 'other', label: 'Any gender' },
  ],
);

/** 영어판 속마음 문장 — 영어는 he/she/they 에 따라 동사가 달라 「{them}는」 끼워 넣기 대신 통째로 고른다 */
const MIND_EN: Record<Gender, { side: string; question: string; reveal: string; ask: string; example: string }> = {
  male: { side: 'His side', question: "What's he really thinking here?", reveal: 'Read his mind', ask: "Ask what he's thinking", example: 'e.g. He watches my stories but never texts' },
  female: { side: 'Her side', question: "What's she really thinking here?", reveal: 'Read her mind', ask: "Ask what she's thinking", example: 'e.g. She watches my stories but never texts' },
  other: { side: 'Their side', question: 'What are they really thinking here?', reveal: 'Read their mind', ask: "Ask what they're thinking", example: 'e.g. They watch my stories but never text' },
};
/** 연애 연습 빨간 점 — 그 줄이 이만큼 화면에 보였으면 「봤다」로 친다 (탐색 탭을 떠날 때 지운다) */
const PRACTICE_DOT_VIEW_MS = 2000;
const PRACTICE_DOT_POLL_MS = 500;

/**
 * 탐색 탭 — 제목 「탐색」(탭 이름과 같게) → 「어떤 고민이 있어요?」 고민 버튼 8개(연애팁 백서, 누르면 그 해답 app/tips/[topic])
 * → 「더 해 볼 것」(연애 연습 · KKTI · 비밀 상담 줄) → 무작위 상황으로 그 사람 속마음을 물어보는 속마음 카드 → 직접 물어보기 → 최근에 본 속마음.
 * 연애 연습을 아직 안 봤으면(practiceDotSeen false) 그 줄에 빨간 점 + 「이런 기능도 있어요」.
 * 1.4 「깔끔하게」 개편: 흰 바탕 + 회색 면, 아이콘 타일·그림자·작은 색 라벨을 걷고 고민은 아이콘 없는 글자 버튼으로(첫 화면에 속마음 카드까지 닿게).
 * 색은 「속마음 보기」 버튼 하나. 무료 횟수를 쓰는 버튼 아래에는 남은 횟수 한 줄(useCostNote).
 */
export default function MindTab() {
  const theme = useTheme();
  const router = useRouter();
  const dark = useColorScheme() === 'dark';
  const fill = useFill();
  // 회색 카드 안 흰 면(다크는 한 단계 더 밝게)
  const innerFill = dark ? theme.border : theme.card;
  const tabSpace = useTabBarSpace();
  const createSecretChat = useAppStore((s) => s.createSecretChat);
  const practiceDotSeen = useAppStore((s) => s.practiceDotSeen);
  const seePracticeDot = useAppStore((s) => s.seePracticeDot);
  const kkti = useAppStore((s) => s.kkti);
  // 저장된 KKTI 결과를 지금 언어의 이름·코드로 (한국어판은 저장값 그대로)
  const kktiView = kkti ? kktiCopy.saved(kkti) : null;
  const history = useAppStore((s) => s.mindHistory);
  const defaultPerspective = useDefaultPerspective();
  const cost = useCostNote(L('볼 때', 'when viewing'));
  const [perspective, setPerspective] = useState<Gender>(defaultPerspective);
  const [card, setCard] = useState(() => drawMindCard());
  const [seen, setSeen] = useState<string[]>([]);
  const [own, setOwn] = useState('');
  const [ownOpen, setOwnOpen] = useState(false);
  const flip = useSharedValue(0);
  const flipStyle = useAnimatedStyle(() => ({ transform: [{ perspective: 800 }, { rotateY: `${flip.value}deg` }, { scale: 1 - Math.abs(flip.value) / 900 }] }));

  const situation = renderSituation(card, perspective);
  const them = themLabel(perspective);
  const mindEn = MIND_EN[perspective] ?? MIND_EN.other;
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
    flip.value = withSequence(withTiming(90, { duration: 140 }), withTiming(-90, { duration: 0 }), withSpring(0, { damping: 16, stiffness: 180 }));
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

  const ownReady = own.trim().length > 0;

  return (
    <Screen safeTop tab keyboard title={L('탐색', 'Explore')} background={theme.background} contentStyle={styles.content}>
      <Animated.View entering={enter(0)} style={styles.head}>
        <Text style={[styles.title, { color: theme.text }]} accessibilityRole="header">
          {L('탐색', 'Explore')}
        </Text>
      </Animated.View>

      {/* 연애팁 백서 — 이 탭의 주인공. 고민 8개를 아이콘 없는 2열 글자 버튼으로(예전 타일 438pt → 약 230pt) */}
      <Animated.View entering={enter(1)} style={styles.section}>
        <SectionHeader title={L('어떤 고민이 있어요?', "What's on your mind?")} style={styles.sectionHeader} />
        <View style={styles.grid}>
          {WORRIES.map((w) => (
            <View key={w.id} style={styles.gridItem}>
              <WorryTile worry={w} onPress={() => openWorry(w)} />
            </View>
          ))}
        </View>
      </Animated.View>

      {/* 더 해 볼 것 — 흰 바탕 위 줄 셋(카드·아이콘 없이). 연애 연습은 기본으로 숨긴 탭이라 여기서 늘 보이게 둔다 */}
      <Animated.View entering={enter(2)} style={styles.section}>
        <SectionHeader title={L('더 해 볼 것', 'More to try')} style={styles.sectionHeader} />
        <View style={styles.list}>
          <ExploreRow
            rowRef={practiceRow}
            title={L('연애 연습', 'Practice chat')}
            dot={!practiceDotSeen}
            note={practiceDotSeen ? undefined : L('이런 기능도 있어요', 'Try this')}
            subtitle={practiceDotSeen ? L('AI 상대와 카톡으로 미리 연습해요', 'Practice texting with an AI match') : L('카톡 리허설', 'Texting rehearsal')}
            accessibilityLabel={
              practiceDotSeen
                ? L('연애 연습, AI 상대와 카톡 리허설', 'Practice chat, rehearse texting with an AI match')
                : L('연애 연습, 새 기능, AI 상대와 카톡 리허설', 'Practice chat, new, rehearse texting with an AI match')
            }
            onPress={() => openFeature('practice')}
            divider
          />
          <ExploreRow
            title={kkti ? L(`내 KKTI · ${kktiView?.code}`, `My Texting Type · ${kktiView?.code}`) : L('KKTI 테스트', 'Texting Type Test')}
            subtitle={kkti ? L(`${kktiView?.name} · 다시 해 보기`, `${kktiView?.name} · Retake`) : L('카톡 습관 속 나의 연애 유형', 'Your dating type, based on how you text')}
            accessibilityLabel={
              kkti
                ? L(`내 KKTI ${kktiView?.code} ${kktiView?.name}, 다시 해 보기`, `My Texting Type ${kktiView?.code} ${kktiView?.name}, retake`)
                : L('KKTI 테스트, 카톡 습관 속 나의 연애 유형', 'Texting Type Test, your dating type based on how you text')
            }
            onPress={() => openFeature('kkti')}
            divider
          />
          <ExploreRow
            title={L('비밀 상담', 'Private chat')}
            subtitle={L('나가면 대화·캡처가 바로 지워져요', 'Chats and screenshots are deleted when you leave')}
            accessibilityLabel={L('비밀 상담, 기록이 남지 않아요', 'Private chat, nothing is saved')}
            onPress={() => openFeature('secret')}
          />
        </View>
      </Animated.View>

      {/* 속마음 카드 — 무작위 상황(열 때마다 새로 뽑는다), 뒤집히며 바뀐다 */}
      <Animated.View entering={enter(3)} style={styles.section}>
        <SectionHeader title={L('속마음 카드', 'Mind cards')} style={styles.sectionHeader} />
        <View style={styles.perspective}>
          {PERSPECTIVES.map((p) => (
            <Chip key={p.key} label={p.label} selected={perspective === p.key} onPress={() => setPerspective(p.key)} />
          ))}
        </View>
      </Animated.View>

      <Animated.View entering={enter(4)} style={[styles.card, { backgroundColor: fill }, flipStyle]}>
        <AppText variant="caption" color="textSecondary" weight="600">
          {mindCategoryLabel(card.category)}
        </AppText>
        <AppText variant="title3" weight="700" style={styles.situation}>
          {situation}
        </AppText>
        <AppText variant="small" color="textSecondary">
          {isKo ? `이 상황에서 ${them}는 진짜 무슨 생각일까요?` : mindEn.question}
        </AppText>
        <View style={styles.cardActions}>
          <PressableScale feedback={false} onPress={shuffle} accessibilityLabel={L('다른 상황 뽑기', 'Draw another situation')} style={[styles.shuffle, { backgroundColor: innerFill }]}>
            <Ionicons name="refresh" size={16} color={theme.text} />
            <AppText variant="smallStrong">{L('다른 상황', 'Shuffle')}</AppText>
          </PressableScale>
          <PressableScale
            feedback={false}
            onPress={() => ask(situation)}
            accessibilityLabel={isKo ? `${them} 속마음 보기` : mindEn.reveal}
            accessibilityHint={cost.suffix ? L('무료 코칭 1회를 써요', 'Uses 1 free session') : undefined}
            style={styles.reveal}>
            <Text style={styles.revealText}>{L('속마음 보기', 'Read their mind')}</Text>
            {cost.suffix ? <Text style={styles.revealCost}>{L('· 1회', '· 1 use')}</Text> : null}
          </PressableScale>
        </View>
        {cost.note ? (
          <AppText variant="caption" color="textSecondary" style={styles.costNote}>
            {cost.note}
          </AppText>
        ) : null}
      </Animated.View>

      {/* 직접 물어보기 — 평소엔 한 줄로 접어 두고, 누르면 펼친다 */}
      <View style={[styles.own, { backgroundColor: fill }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: ownOpen }}
          onPress={() => {
            haptic.select();
            setOwnOpen((v) => !v);
          }}
          style={styles.ownHead}>
          <AppText variant="bodyStrong" style={styles.flex}>
            {L('내 상황 직접 물어보기', 'Ask about your own situation')}
          </AppText>
          <Ionicons name={ownOpen ? 'chevron-up' : 'chevron-down'} size={18} color={theme.textTertiary} />
        </Pressable>
        {ownOpen ? (
          <Animated.View entering={FadeIn.duration(180)} style={styles.ownBody}>
            <TextInput
              value={own}
              onChangeText={setOwn}
              accessibilityLabel={L('내 상황 적기', 'Describe your situation')}
              placeholder={isKo ? `예: ${them}가 스토리는 보는데 카톡은 안 해요` : mindEn.example}
              placeholderTextColor={theme.textTertiary}
              multiline
              maxLength={400}
              autoFocus
              style={[styles.ownInput, Typography.body, { color: theme.text, backgroundColor: innerFill }]}
            />
            {/* 글을 쓰면 검정 알약(이 화면의 색은 「속마음 보기」 하나) */}
            <PressableScale
              feedback={false}
              onPress={() => ask(own)}
              disabled={!ownReady}
              accessibilityState={{ disabled: !ownReady }}
              accessibilityHint={cost.suffix ? L('무료 코칭 1회를 써요', 'Uses 1 free session') : undefined}
              style={[styles.ownBtn, { backgroundColor: ownReady ? theme.text : innerFill }]}>
              <AppText variant="smallStrong" color={ownReady ? theme.background : theme.textTertiary}>
                {isKo ? `${them} 속마음 물어보기` : mindEn.ask}
                {cost.suffix}
              </AppText>
            </PressableScale>
          </Animated.View>
        ) : null}
      </View>

      {shown.length ? (
        <View style={styles.section}>
          <SectionHeader
            title={L('최근에 본 속마음', 'Recently read')}
            subtitle={L('다시 볼 때는 횟수를 쓰지 않아요', 'Viewing again is free')} style={styles.sectionHeader} />
          {/* 흰 바탕 위 줄 목록 — 카드 없이 */}
          <View style={styles.list}>
            {shown.map((h, i) => (
              <Pressable
                key={h.at}
                accessibilityRole="button"
                onPress={() => {
                  haptic.soft();
                  router.push({ pathname: '/mind', params: { history: String(i) } });
                }}
                style={({ pressed }) => [styles.historyRow, { backgroundColor: pressed ? fill : 'transparent' }]}>
                <AppText variant="caption" color="textSecondary" weight="600">
                  {isKo ? `${themLabel(h.perspective)} 속마음` : (MIND_EN[h.perspective] ?? MIND_EN.other).side}
                </AppText>
                <AppText variant="bodyStrong" numberOfLines={1}>
                  {h.situation}
                </AppText>
                <AppText variant="small" color="textSecondary" numberOfLines={1}>
                  {h.reading.innerVoice}
                </AppText>
                {i < shown.length - 1 ? <View pointerEvents="none" style={[styles.divider, { backgroundColor: theme.separator }]} /> : null}
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: Spacing.xl },
  flex: { flex: 1 },
  head: { marginTop: Spacing.sm, paddingHorizontal: 2, minHeight: 44, justifyContent: 'center' },
  // 홈 제목과 같은 크기(24pt · 700)
  title: { fontSize: 24, lineHeight: 32, fontWeight: '700', letterSpacing: -0.6 },
  section: { gap: Spacing.sm + 2 },
  sectionHeader: { marginTop: 0, marginBottom: 0, paddingHorizontal: 2 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 },
  gridItem: { width: '50%', padding: 4 },
  // 줄 목록은 화면 끝까지(눌림 색이 가장자리까지) — 줄 안쪽 여백이 글자 자리를 맞춘다
  list: { marginHorizontal: -Spacing.lg },
  perspective: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs + 2 },
  card: { borderRadius: 24, padding: Spacing.lg + 4, gap: Spacing.sm, marginTop: -Spacing.md },
  situation: { fontSize: 18, lineHeight: 26, letterSpacing: -0.4 },
  cardActions: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.sm },
  shuffle: { flex: 1, height: 50, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  // 이 화면에서 색이 있는 단 하나의 버튼 — 센딧 파랑 단색
  reveal: { flex: 1.3, height: 50, borderRadius: 16, backgroundColor: Brand.blue, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
  revealText: { color: Brand.onBrand, fontSize: 15, lineHeight: 20, fontWeight: '600', letterSpacing: -0.2 },
  revealCost: { color: Brand.onBrand, fontSize: 13, lineHeight: 20, fontWeight: '500' },
  costNote: { textAlign: 'center', marginTop: 2 },
  own: { borderRadius: 20, marginTop: -Spacing.sm },
  ownHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.lg + 2, minHeight: 56 },
  ownBody: { gap: Spacing.md, paddingHorizontal: Spacing.lg + 2, paddingBottom: Spacing.lg + 2 },
  ownInput: { borderRadius: 14, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 2, minHeight: 80, textAlignVertical: 'top' },
  ownBtn: { height: 50, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  historyRow: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, gap: 2 },
  divider: { position: 'absolute', bottom: 0, left: Spacing.lg, right: Spacing.lg, height: StyleSheet.hairlineWidth },
});
