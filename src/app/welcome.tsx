import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { BackHandler, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions, type LayoutChangeEvent, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BrandGradient, BrandPill, GradientButton, Icon3D, SenditLogo, WashBackground } from '@/components/brand/brand';
import { StartConsentSheet, type StartConsentAnswer } from '@/components/consent/start-consent-sheet';
import { GuidePhone } from '@/components/guide/guide-phone';
import { GUIDE_STEPS, type GuideStep } from '@/components/guide/guide-steps';
import { APP_NAME, RESEARCH_LINE } from '@/constants/brand';
import { Brand, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { track } from '@/lib/analytics';
import { haptic } from '@/lib/haptics';
import { homeRoute } from '@/lib/intro-paths';
import { GUIDE_VERSION, useAppStore } from '@/store/app-store';

/**
 * 어떤 경우로 열었는지 — 처음 설치 · 센딧 전 판을 쓰던 이용자(?from=update) · 센딧 판에서 링크로 먼저 시작한 이용자(?from=intro)
 * · 마이의 「사용법 다시 보기」(?from=my)
 */
export type GuideMode = 'fresh' | 'update' | 'intro' | 'replay';

type Page = { kind: 'cover' } | { kind: 'step'; step: GuideStep };

const COVER = {
  fresh: {
    pill: null,
    title: `뭐라고 보낼지,\n${APP_NAME}이 같이 골라 줄게요`,
    body: '대화 캡처 한 장이면 답장 3가지와 호감 온도가 바로 나와요. 쓰는 법을 30초만 볼까요?',
  },
  update: {
    pill: '새 이름 · 새 모습',
    title: `나만의 연애 코치가\n${APP_NAME}으로 새로워졌어요`,
    body: '채팅방과 기록은 그대로예요. 새로워진 사용법을 30초만 보고 갈까요?',
  },
} as const;

/**
 * 「센딧 사용법」 안내 — 실제 앱 화면을 휴대폰 틀에 담아 한 장씩 보여 주고, 누르는 곳을 반짝이는 원으로 짚는다
 * (그림·자르기·강조 위치는 components/guide/guide-steps).
 * - 처음 설치: 첫 장에 로고·부제·연구진 문구 → 사용법 → 「시작하기」로 이용약관 동의 → 「나에 대해」 → 첫 캡처. 「건너뛰기」는 첫 캡처 화면으로.
 * - 센딧 전 판을 쓰던 이용자(?from=update, app/index 가 한 번 보냄): 「센딧으로 새로워졌어요」 → 같은 사용법 → 「다 봤어요」로 원래 가던 곳(홈).
 *   동의 창·나에 대해로 보내지 않는다.
 * - 센딧 판에서 링크(빠른 코칭·KKTI 등)로 먼저 시작한 이용자(?from=intro): 처음 설치와 같은 표지 + 사용법, 끝나면 동의 창·나에 대해 없이 원래 가던 곳.
 * - 마이 → 「사용법 다시 보기」(?from=my): 사용법만 보여 주고 「닫기」·「다 봤어요」로 마이에 돌아간다.
 * 어느 경우든 끝나면(건너뛰기·닫기 포함) 이번 판의 안내를 본 것으로 적는다 (guideSeen).
 */
export default function Welcome() {
  const router = useRouter();
  const theme = useTheme();
  const from = useLocalSearchParams<{ from?: string }>().from;
  const mode: GuideMode = from === 'my' ? 'replay' : from === 'update' ? 'update' : from === 'intro' ? 'intro' : 'fresh';
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const width = Math.min(windowWidth, MaxContentWidth);
  const scroller = useRef<ScrollView>(null);
  const [page, setPage] = useState(0);
  const [asking, setAsking] = useState(false);
  const agreed = useAppStore((s) => s.termsAgreedAt != null);
  const agreeToStart = useAppStore((s) => s.agreeToStart);
  const setOnboardingSeen = useAppStore((s) => s.setOnboardingSeen);
  const setGuideSeen = useAppStore((s) => s.setGuideSeen);
  // 다시 보기는 표지 없이 사용법부터
  const [pages] = useState<Page[]>(() => [...(mode === 'replay' ? [] : [{ kind: 'cover' as const }]), ...GUIDE_STEPS.map((step) => ({ kind: 'step' as const, step }))]);
  const last = page === pages.length - 1;
  // 분석 이벤트에 경우를 함께 남긴다 (다시 보기는 예전처럼 replay 도)
  const tag = { mode, ...(mode === 'replay' ? { replay: true } : {}) };

  useEffect(() => {
    track('onboarding', { step: 'slides', action: 'open', ...tag });
    // 처음 한 번만
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  /** 이미 시작한 이용자·다시 보기는 원래 가던 곳으로 */
  const leave = () => {
    setGuideSeen(GUIDE_VERSION);
    if (mode === 'replay') {
      router.back();
      return;
    }
    setOnboardingSeen();
    const s = useAppStore.getState();
    router.replace(homeRoute(Boolean(s.user) || Object.keys(s.crushes).length > 0));
  };

  const toProfile = () => {
    setOnboardingSeen();
    setGuideSeen(GUIDE_VERSION);
    router.replace('/about-me');
  };

  const skip = () => {
    haptic.tap();
    track('onboarding', { step: 'slides', action: 'skip', page, ...tag });
    if (mode !== 'fresh') {
      leave();
      return;
    }
    setOnboardingSeen();
    setGuideSeen(GUIDE_VERSION);
    router.replace('/start');
  };

  const next = () => {
    if (!last) {
      track('onboarding', { step: 'slides', action: 'next', page, ...tag });
      goTo(page + 1);
      return;
    }
    track('onboarding', { step: 'slides', action: mode === 'fresh' ? 'start' : 'done', ...tag });
    if (mode !== 'fresh') leave();
    else if (agreed) toProfile();
    else setAsking(true);
  };

  const onAgree = ({ content, all }: StartConsentAnswer) => {
    haptic.select();
    agreeToStart(content);
    track('start_consent', { all, content, mode: 'onboarding' });
    setAsking(false);
    toProfile();
  };

  // 안드로이드 뒤로 가기 — 앞 장으로. 첫 장에서는 기존 이용자·다시 보기면 닫기와 같고, 처음 설치면 기본 동작(앱 닫기)
  const backRef = useRef<() => boolean>(() => false);
  backRef.current = () => {
    if (asking) return false;
    if (page > 0) {
      goTo(page - 1);
      return true;
    }
    if (mode === 'fresh') return false;
    skip();
    return true;
  };
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => backRef.current());
    return () => sub.remove();
  }, []);

  const onCover = pages[page]?.kind === 'cover';
  const closeLabel = mode === 'fresh' ? '건너뛰기' : '닫기';

  return (
    <WashBackground style={styles.root}>
      <View style={[styles.topBar, { paddingTop: insets.top + Spacing.sm, width }]}>
        <View style={styles.topLogo}>{onCover ? null : <SenditLogo size="sm" />}</View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={mode === 'fresh' ? '소개 건너뛰기' : '사용법 닫기'}
          onPress={skip}
          hitSlop={12}
          style={({ pressed }) => [styles.skip, { backgroundColor: theme.surface }, pressed && styles.pressed]}>
          <Text style={[styles.skipText, { color: theme.textSecondary }]}>{closeLabel}</Text>
        </Pressable>
      </View>

      <ScrollView
        ref={scroller}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScrollEnd}
        style={[styles.pager, { width }]}
        accessibilityLabel={`${APP_NAME} 사용법`}>
        {pages.map((p, i) =>
          p.kind === 'cover' ? (
            <CoverPage key="cover" width={width} mode={mode === 'update' ? 'update' : 'fresh'} />
          ) : (
            <StepPage key={p.step.key} width={width} step={p.step} active={page === i} />
          ),
        )}
      </ScrollView>

      <View style={[styles.bottom, { paddingBottom: insets.bottom + Spacing.lg, width }]}>
        <View style={styles.dots} accessibilityLabel={`${pages.length}장 중 ${page + 1}번째`}>
          {pages.map((p, i) => (
            <View key={p.kind === 'cover' ? 'cover' : p.step.key} style={[styles.dot, { backgroundColor: i === page ? theme.primary : theme.border }, i === page && styles.dotOn]} />
          ))}
        </View>
        <GradientButton
          title={last ? (mode === 'fresh' ? '시작하기' : '다 봤어요') : '다음'}
          onPress={next}
          shine={last}
          icon={last ? <Ionicons name={mode === 'fresh' ? 'sparkles' : 'checkmark'} size={18} color={Brand.onBrand} /> : undefined}
        />
      </View>

      <StartConsentSheet visible={asking} onAgree={onAgree} onClose={() => setAsking(false)} />
    </WashBackground>
  );
}

/** 카드 안 공간을 재어 휴대폰·장식 크기를 맞춘다 */
function useArea() {
  const [area, setArea] = useState<{ width: number; height: number } | null>(null);
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setArea((prev) => (prev && Math.abs(prev.width - width) < 1 && Math.abs(prev.height - height) < 1 ? prev : { width, height }));
  };
  return { area, onLayout };
}

/** 첫 장 — 로고·부제·연구진 문구 (업데이트한 이용자에게는 「새로워졌어요」) */
function CoverPage({ width, mode }: { width: number; mode: 'fresh' | 'update' }) {
  const theme = useTheme();
  const copy = COVER[mode];
  const { area, onLayout } = useArea();
  const icon = area ? Math.round(Math.max(88, Math.min(150, area.height * 0.34))) : 120;
  return (
    <View style={[styles.page, { width }]}>
      <Animated.View entering={FadeInDown.duration(420)} style={styles.texts}>
        {copy.pill ? <BrandPill label={copy.pill} icon="sparkles" /> : null}
        <Text style={[styles.title, { color: theme.text }]} accessibilityRole="header">
          {copy.title}
        </Text>
        <Text style={[styles.body, { color: theme.textSecondary }]}>{copy.body}</Text>
      </Animated.View>
      <Animated.View entering={FadeInUp.delay(120).duration(520)} style={styles.cardWrap}>
        <BrandGradient style={styles.card}>
          <View pointerEvents="none" style={[styles.orb, styles.orbA]} />
          <View pointerEvents="none" style={[styles.orb, styles.orbB]} />
          <View style={styles.coverInner} onLayout={onLayout}>
            <Icon3D name="send" size={icon} float />
            <SenditLogo size="lg" subtitle tone="white" />
            <BrandPill label={RESEARCH_LINE} icon="school" tone="glass" style={styles.center} />
          </View>
        </BrandGradient>
      </Animated.View>
    </View>
  );
}

/** 사용법 한 장 — 제목·설명 + 그라데이션 카드 안의 실제 화면 */
function StepPage({ width, step, active }: { width: number; step: GuideStep; active: boolean }) {
  const theme = useTheme();
  const { area, onLayout } = useArea();
  return (
    <View style={[styles.page, { width }]}>
      <View style={styles.texts}>
        <BrandPill label={step.pill} />
        <Text style={[styles.title, { color: theme.text }]} accessibilityRole="header">
          {step.title}
        </Text>
        <Text style={[styles.body, { color: theme.textSecondary }]}>{step.body}</Text>
      </View>
      <View style={styles.cardWrap}>
        <BrandGradient style={styles.card}>
          <View pointerEvents="none" style={[styles.orb, styles.orbA]} />
          <View pointerEvents="none" style={[styles.orb, styles.orbB]} />
          {/* 휴대폰은 카드 위쪽에 붙고, 화면이 길면 카드 아래로 잘려 이어진다 */}
          <View style={styles.phoneArea} onLayout={onLayout} accessibilityLabel={`${step.title} — 실제 앱 화면`} accessible>
            {area ? <GuidePhone shot={step.shot} area={{ width: area.width, height: area.height - Spacing.xl }} active={active} /> : null}
          </View>
        </BrandGradient>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: 'center' },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Spacing.xl, paddingBottom: Spacing.xs },
  topLogo: { height: 32, justifyContent: 'center' },
  skip: { paddingHorizontal: Spacing.md, paddingVertical: 7, borderRadius: Radius.pill },
  skipText: { fontSize: 13, fontWeight: '700' },
  pressed: { opacity: 0.7 },
  pager: { flex: 1 },
  page: { flex: 1, paddingTop: Spacing.md },
  texts: { paddingHorizontal: Spacing.xl, gap: Spacing.sm },
  title: { fontSize: 27, lineHeight: 36, fontWeight: '800', letterSpacing: -0.8, marginTop: 2 },
  body: { fontSize: 15, lineHeight: 22, fontWeight: '500', letterSpacing: -0.2 },
  cardWrap: { flex: 1, marginTop: Spacing.lg, marginHorizontal: Spacing.lg },
  card: { flex: 1, borderRadius: Radius.xl, overflow: 'hidden' },
  orb: { position: 'absolute', borderRadius: 999, backgroundColor: Brand.glass },
  orbA: { width: 260, height: 260, top: -110, right: -90, opacity: 0.7 },
  orbB: { width: 180, height: 180, bottom: -70, left: -60, opacity: 0.5 },
  coverInner: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.lg, padding: Spacing.xl },
  center: { alignSelf: 'center' },
  phoneArea: { flex: 1, alignItems: 'center', paddingTop: Spacing.xl },
  bottom: { paddingHorizontal: Spacing.xl, paddingTop: Spacing.lg, gap: Spacing.lg },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  dotOn: { width: 22 },
});
