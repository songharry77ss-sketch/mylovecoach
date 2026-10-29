import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { StartConsentSheet, type StartConsentAnswer } from '@/components/consent/start-consent-sheet';
import { GoldSticker, HeartMark, Highlight, StageBackground, StageCard, StagePill, type StagePhoto } from '@/components/stage/stage';
import { Button } from '@/components/ui/button';
import { MaxContentWidth, Radius, Spacing, Stage, palette } from '@/constants/theme';
import { track } from '@/lib/analytics';
import { haptic } from '@/lib/haptics';
import { useAppStore } from '@/store/app-store';

interface Slide {
  key: string;
  photo: StagePhoto;
  step: string;
  title: string;
  body: string;
}

/** 스토어 상세 페이지와 같은 문장 · 같은 인물 (AI 가상 인물) */
const SLIDES: Slide[] = [
  {
    key: 'capture',
    photo: 'cafeWoman',
    step: '1 · 캡처 올리기',
    title: '뭐라고 답장하지?\n*캡처 한 장*이면 끝',
    body: '카톡·인스타 DM 대화를 캡처해서 올리면 코치가 분위기와 호칭·말투를 읽어요.',
  },
  {
    key: 'replies',
    photo: 'sofaMan',
    step: '2 · 답장 고르기',
    title: '호칭·말투 그대로\n*답장 3가지* 추천',
    body: '옆으로 넘겨 보며 마음에 드는 답장을 고르고, 탭 한 번이면 복사돼요.',
  },
  {
    key: 'heat',
    photo: 'lamplightWoman',
    step: '3 · 마음 읽기',
    title: '그 사람 속마음과\n*호감 온도*까지',
    body: '대화를 올릴 때마다 0°에서 시작한 호감 온도가 오르내리고, 속마음 카드로 상대 마음도 짐작해 봐요.',
  },
];

/**
 * 처음 실행 소개 — 무엇을 해 주는 앱인지 세 장으로 보여 준다 (스토어 이미지와 같은 무대 화면).
 * 마지막 「시작하기」에서 이용약관 동의 창을 띄우고, 답하면 「나에 대해 알려주세요」로 간다. 「건너뛰기」는 바로 첫 캡처 화면으로.
 */
export default function Welcome() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: windowWidth, height } = useWindowDimensions();
  const width = Math.min(windowWidth, MaxContentWidth);
  const scroller = useRef<ScrollView>(null);
  const [page, setPage] = useState(0);
  const [asking, setAsking] = useState(false);
  const agreed = useAppStore((s) => s.termsAgreedAt != null);
  const agreeToStart = useAppStore((s) => s.agreeToStart);
  const setOnboardingSeen = useAppStore((s) => s.setOnboardingSeen);
  const last = page === SLIDES.length - 1;
  const compact = height < 720;

  useEffect(() => {
    track('onboarding', { step: 'slides', action: 'open' });
  }, []);

  const goTo = (next: number) => {
    scroller.current?.scrollTo({ x: next * width, animated: true });
    setPage(next);
  };

  const onScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = Math.round(e.nativeEvent.contentOffset.x / width);
    if (next !== page) {
      haptic.select();
      setPage(next);
    }
  };

  const toProfile = () => {
    setOnboardingSeen();
    router.replace('/about-me');
  };

  const skip = () => {
    haptic.tap();
    track('onboarding', { step: 'slides', action: 'skip', page });
    setOnboardingSeen();
    router.replace('/start');
  };

  const next = () => {
    if (!last) {
      track('onboarding', { step: 'slides', action: 'next', page });
      goTo(page + 1);
      return;
    }
    track('onboarding', { step: 'slides', action: 'start' });
    if (agreed) toProfile();
    else setAsking(true);
  };

  const onAgree = ({ content, all }: StartConsentAnswer) => {
    haptic.select();
    agreeToStart(content);
    track('start_consent', { all, content, mode: 'onboarding' });
    setAsking(false);
    toProfile();
  };

  return (
    <View style={styles.root}>
      <ScrollView
        ref={scroller}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScrollEnd}
        style={[styles.pager, { width }]}
        accessibilityLabel="앱 사용법 소개">
        {SLIDES.map((slide, i) => (
          <View key={slide.key} style={{ width, height }}>
            <StageBackground photo={slide.photo} photoHeight={compact ? '62%' : '68%'}>
              {/* 사진 위 제목이 잘 읽히게 위쪽을 어둡게 */}
              <LinearGradient pointerEvents="none" colors={['rgba(18,10,12,0.82)', 'rgba(18,10,12,0.35)', 'rgba(18,10,12,0)']} locations={[0, 0.55, 1]} style={styles.topShade} />
              <View style={[styles.slide, { paddingTop: insets.top + 64, paddingBottom: insets.bottom + 140 }]}>
                <View style={styles.texts}>
                  <StagePill label={slide.step} icon="heart" />
                  <Highlight text={slide.title} variant={compact ? 'display' : 'hero'} />
                  <Text style={styles.body}>{slide.body}</Text>
                </View>
                <View style={styles.flex} />
                {page === i ? (
                  <Animated.View entering={FadeInUp.delay(120).duration(420)}>
                    <SlideCard kind={slide.key} />
                  </Animated.View>
                ) : (
                  <SlideCard kind={slide.key} />
                )}
              </View>
            </StageBackground>
          </View>
        ))}
      </ScrollView>

      <View style={[styles.topBar, { paddingTop: insets.top + Spacing.sm }]}>
        <View style={styles.brand}>
          <Ionicons name="heart-outline" size={16} color={Stage.gold} />
          <Text style={styles.brandText}>나만의 연애코치</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="소개 건너뛰기" onPress={skip} hitSlop={12} style={styles.skip}>
          <Text style={styles.skipText}>건너뛰기</Text>
        </Pressable>
      </View>

      <View style={[styles.bottom, { paddingBottom: insets.bottom + Spacing.lg }]}>
        <View style={styles.dots} accessibilityLabel={`${SLIDES.length}장 중 ${page + 1}번째`}>
          {SLIDES.map((s, i) => (
            <View key={s.key} style={[styles.dot, i === page ? styles.dotOn : null]} />
          ))}
        </View>
        <Button
          title={last ? '시작하기' : '다음'}
          variant="gold"
          onPress={next}
          icon={last ? <Ionicons name="sparkles" size={18} color={Stage.onGold} /> : undefined}
        />
      </View>

      <StartConsentSheet visible={asking} onAgree={onAgree} onClose={() => setAsking(false)} />
    </View>
  );
}

/** 각 장 아래쪽의 실제 앱 화면 조각 */
function SlideCard({ kind }: { kind: string }) {
  if (kind === 'capture') {
    return (
      <View>
        <StageCard style={styles.chatCard}>
          <View style={styles.chatRow}>
            <View style={[styles.bubble, styles.bubbleThem]}>
              <Text style={styles.bubbleText}>이번 주말에 뭐 해요? 😊</Text>
            </View>
          </View>
          <View style={[styles.chatRow, styles.chatRowMe]}>
            <View style={[styles.bubble, styles.bubbleMe]}>
              <Text style={styles.bubbleText}>아직 계획 없어요 ㅎㅎ</Text>
            </View>
          </View>
          <View style={styles.captureBar}>
            <Ionicons name="image" size={16} color={palette.rose600} />
            <Text style={styles.captureText}>캡처 올리기 → 코치가 분석 중…</Text>
          </View>
        </StageCard>
        <HeartMark size={40} rotate={14} style={styles.heartRight} />
      </View>
    );
  }
  if (kind === 'replies') {
    return (
      <View>
        <StageCard>
          <View style={styles.replyHead}>
            <StagePill label="실제 답장 예시" style={styles.pillOnWhite} />
            <Text style={styles.replyOdds}>성공 확률 95%</Text>
          </View>
          <Text style={styles.replyMeta}>😊 버전 1/3</Text>
          <Text style={styles.replyText}>좋아요 언니! 그럼 토요일 오후에 만나요 ㅎㅎ 맛있는 거 먹을 생각에 벌써 신나네요 😊</Text>
        </StageCard>
        <GoldSticker text="+10°" rotate={-8} style={styles.stickerRight} />
      </View>
    );
  }
  return (
    <View>
      <StageCard>
        <View style={styles.replyHead}>
          <Text style={styles.heatTitle}>🌡️ 호감 온도 · 미지근</Text>
          <Text style={styles.heatValue}>25°</Text>
        </View>
        <View style={styles.heatTrack}>
          <LinearGradient colors={[palette.gold400, palette.rose400]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[styles.heatFill, { width: '25%' }]} />
        </View>
        <View style={styles.heatScale}>
          <Text style={styles.heatScaleText}>0°에서 시작</Text>
          <Text style={styles.heatScaleText}>100°</Text>
        </View>
        <View style={styles.mindRow}>
          {['🔮 속마음 카드', '🧪 KKTI 테스트', '🕶️ 비밀 상담'].map((t) => (
            <View key={t} style={styles.mindChip}>
              <Text style={styles.mindChipText}>{t}</Text>
            </View>
          ))}
        </View>
      </StageCard>
      <Animated.View entering={FadeInDown.delay(300)} style={styles.heartLeft}>
        <HeartMark size={34} rotate={-16} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Stage.bg[2], alignItems: 'center' },
  pager: { flex: 1 },
  flex: { flex: 1 },
  topShade: { position: 'absolute', top: 0, left: 0, right: 0, height: '48%' },
  slide: { flex: 1, paddingHorizontal: Spacing.xl },
  texts: { gap: Spacing.md },
  body: { fontSize: 15, lineHeight: 22, fontWeight: '500', color: Stage.textDim, maxWidth: 340 },
  topBar: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Spacing.xl, maxWidth: MaxContentWidth, alignSelf: 'center', width: '100%' },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  brandText: { fontSize: 13, fontWeight: '800', color: Stage.text, letterSpacing: -0.2 },
  skip: { paddingHorizontal: Spacing.md, paddingVertical: 6, borderRadius: Radius.pill, backgroundColor: Stage.chip, borderWidth: 1, borderColor: Stage.chipBorder },
  skipText: { fontSize: 13, fontWeight: '700', color: Stage.text },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: Spacing.xl, gap: Spacing.lg, maxWidth: MaxContentWidth, alignSelf: 'center', width: '100%' },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.3)' },
  dotOn: { width: 22, backgroundColor: Stage.gold },
  chatCard: { gap: Spacing.sm },
  chatRow: { flexDirection: 'row' },
  chatRowMe: { justifyContent: 'flex-end' },
  bubble: { borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8, maxWidth: '80%' },
  bubbleThem: { backgroundColor: '#F2ECEA', borderTopLeftRadius: 4 },
  bubbleMe: { backgroundColor: '#FEE500', borderTopRightRadius: 4 },
  bubbleText: { fontSize: 14, lineHeight: 20, color: Stage.cardText, fontWeight: '500' },
  captureBar: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2, paddingTop: Spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#E9DFDC' },
  captureText: { fontSize: 13, fontWeight: '700', color: palette.rose600 },
  heartRight: { position: 'absolute', right: -6, top: -30 },
  heartLeft: { position: 'absolute', left: -10, top: -34 },
  stickerRight: { position: 'absolute', right: -4, top: -26 },
  replyHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  pillOnWhite: { backgroundColor: palette.rose50 },
  replyOdds: { fontSize: 13, fontWeight: '800', color: palette.rose600 },
  replyMeta: { fontSize: 12, fontWeight: '700', color: '#8A7A7C' },
  replyText: { fontSize: 16, lineHeight: 24, fontWeight: '600', color: Stage.cardText, backgroundColor: '#EAF3FF', borderRadius: 14, padding: 12 },
  heatTitle: { fontSize: 15, fontWeight: '800', color: Stage.cardText },
  heatValue: { fontSize: 26, fontWeight: '900', color: palette.rose600, letterSpacing: -0.6 },
  heatTrack: { height: 10, borderRadius: 5, backgroundColor: '#F2ECEA', overflow: 'hidden' },
  heatFill: { height: '100%', borderRadius: 5 },
  heatScale: { flexDirection: 'row', justifyContent: 'space-between' },
  heatScaleText: { fontSize: 11, fontWeight: '600', color: '#8A7A7C' },
  mindRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  mindChip: { backgroundColor: palette.rose50, borderRadius: Radius.pill, paddingHorizontal: 10, paddingVertical: 5 },
  mindChipText: { fontSize: 12, fontWeight: '700', color: Stage.cardText },
});
