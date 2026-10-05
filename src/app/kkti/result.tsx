import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { LinearGradient } from 'expo-linear-gradient';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, type PropsWithChildren } from 'react';
import { Linking, Platform, Pressable, ScrollView, Share, StyleSheet, View, useWindowDimensions, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { Easing, Extrapolation, interpolate, useAnimatedStyle, useSharedValue, withDelay, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useCelebrate } from '@/components/fx/celebration';
import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { PressableScale } from '@/components/ui/pressable-scale';
import { useToast } from '@/components/ui/toast';
import { MaxContentWidth, Radius, Spacing, palette } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';
import { track } from '@/lib/analytics';
import { haptic } from '@/lib/haptics';
import {
  KKTI_TYPES,
  codeLetters,
  hexToRgba,
  josa,
  kktiFromCode,
  legibleOn,
  matchReason,
  mixHex,
  readableTextOn,
  shareText,
  toSaved,
  type KktiAxisResult,
  type KktiResult,
} from '@/lib/kkti';
import { toneLabel } from '@/lib/labels';
import { useAppStore } from '@/store/app-store';

/**
 * KKTI 결과 — /kkti/result?a=답코드
 * 연애 컬러가 원형으로 퍼지며 화면을 물들이고, 유형 코드 글자가 하나씩 튀어나온 뒤 꽃가루가 터진다.
 * 친구가 보낸 링크로 들어온 사람에게는 「나도 테스트하기」를 먼저 보여 준다.
 */

/** 공개 연출 시간표 (ms) */
const T = {
  heroFlood: 120,
  label: 320,
  emoji: 420,
  letter: 720,
  letterGap: 170,
  name: 720 + 4 * 170 + 60,
  rest: 1650,
};

const X_INTENT = 'https://x.com/intent/post?text=';
const THREADS_INTENT = 'https://www.threads.net/intent/post?text=';

export default function KktiResultScreen() {
  const params = useLocalSearchParams<{ a?: string | string[] }>();
  const code = Array.isArray(params.a) ? params.a[0] : params.a;
  const result = useMemo(() => kktiFromCode(code), [code]);

  return (
    <>
      <Stack.Screen options={{ headerShown: false, title: result ? `${result.type.emoji} ${result.type.name} · KKTI` : 'KKTI 결과' }} />
      {result ? <ResultView key={result.encoded} result={result} /> : <InvalidLink />}
    </>
  );
}

// ───────────────────────── 잘못된 링크 ─────────────────────────

function InvalidLink() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.invalid, { backgroundColor: theme.background, paddingTop: insets.top, paddingBottom: insets.bottom + Spacing.lg }]}>
      <View style={styles.invalidInner}>
        <AppText style={styles.invalidEmoji}>🤔</AppText>
        <AppText variant="title1" align="center">
          결과 링크가 조금 이상해요
        </AppText>
        <AppText variant="body" color="textSecondary" align="center">
          링크가 잘렸거나 바뀐 것 같아요.{'\n'}12문항, 1분이면 다시 할 수 있어요!
        </AppText>
        <View style={styles.invalidActions}>
          <Button title="KKTI 테스트 하러 가기" variant="accent" onPress={() => router.replace('/kkti')} />
          <Button title="홈으로" variant="ghost" onPress={() => router.replace('/')} />
        </View>
      </View>
    </View>
  );
}

// ───────────────────────── 결과 ─────────────────────────

function ResultView({ result }: { result: KktiResult }) {
  const theme = useTheme();
  const scheme = useColorScheme();
  const router = useRouter();
  const toast = useToast();
  const celebrate = useCelebrate();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();

  const hydrated = useAppStore((s) => s.hydrated);
  const saved = useAppStore((s) => s.kkti);
  const isSaved = saved?.code === result.code;
  // 내가 끝낸 테스트면 끝나는 순간 저장돼 있다 → 색까지 같으면 「내 결과」, 아니면 친구가 보낸 링크로 본다
  const mine = hydrated && isSaved && saved?.color === result.color.hex;

  const { type, color, mbti, enneagram } = result;
  const ink = readableTextOn(color.hex);
  const inkIsLight = ink === '#FFFFFF';
  const inkSoft = inkIsLight ? 'rgba(255,255,255,0.86)' : 'rgba(25,31,40,0.74)';
  const glass = inkIsLight ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.5)';
  const pageTint = mixHex(theme.background, color.hex, scheme === 'dark' ? 0.2 : 0.14);
  const accentText = legibleOn(color.hex, theme.surfaceElevated);
  const barFill = legibleOn(color.hex, theme.surfaceSelected, 1.8);
  const tone = toneLabel(type.recommendedTone);
  const letters = codeLetters(result.code);
  const best = KKTI_TYPES[type.bestMatch];
  const worst = KKTI_TYPES[type.worstMatch];
  const text = shareText(result, result.url);

  // 화면을 물들이는 원 — 히어로 이모지 근처에서 시작해 화면 전체를 덮는다
  const originY = insets.top + 168;
  const floodSize = Math.hypot(width, height) * 2.2;
  const flood = useSharedValue(0);
  const heroFlood = useSharedValue(0);
  const emojiRef = useRef<View>(null);
  const fallbackOrigin = useRef({ x: width / 2, y: originY });

  useEffect(() => {
    fallbackOrigin.current = { x: width / 2, y: originY };
  }, [width, originY]);

  // 공개 연출: 색이 퍼지고 → 글자가 하나씩 톡톡 → 꽃가루 + 하트
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    const at = (ms: number, fn: () => void) => {
      timers.push(setTimeout(fn, ms));
    };
    flood.value = withTiming(1, { duration: 1300, easing: Easing.out(Easing.cubic) });
    heroFlood.value = withDelay(T.heroFlood, withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad) }));
    haptic.rise();
    for (let i = 0; i < 4; i++) at(T.letter + i * T.letterGap, () => (i === 3 ? haptic.thud() : haptic.select()));
    at(T.name, () => {
      const burst = (x: number, y: number) => {
        celebrate({ kind: 'confetti', count: 34, x, y });
        at(280, () => celebrate({ kind: 'hearts', count: 12, x, y, haptic: false }));
      };
      const node = emojiRef.current;
      const fallback = fallbackOrigin.current;
      if (node && typeof node.measureInWindow === 'function') {
        node.measureInWindow((x, y, w, h) => (w > 0 && h > 0 ? burst(x + w / 2, y + h / 2) : burst(fallback.x, fallback.y)));
      } else {
        burst(fallback.x, fallback.y);
      }
    });
    return () => timers.forEach(clearTimeout);
  }, [celebrate, flood, heroFlood]);

  const floodStyle = useAnimatedStyle(() => ({ transform: [{ scale: flood.value }] }));
  const heroFloodStyle = useAnimatedStyle(() => ({ transform: [{ scale: heroFlood.value }] }));
  const sheenStyle = useAnimatedStyle(() => ({ opacity: interpolate(heroFlood.value, [0.55, 1], [0, 1], Extrapolation.CLAMP) }));

  const leave = () => (router.canGoBack() ? router.back() : router.replace('/'));

  const retake = () => {
    haptic.tap();
    track('kkti_cta', { to: 'retake', mine });
    router.replace('/kkti');
  };

  const goCoach = () => {
    haptic.thud();
    track('kkti_cta', { to: 'coach', code: result.code });
    router.replace(useAppStore.getState().user ? '/(tabs)' : '/start');
  };

  const save = () => {
    useAppStore.getState().setKkti(toSaved(result));
    haptic.success();
    celebrate({ kind: 'sparkles', count: 12, haptic: false });
    toast.show('내 프로필에 저장했어요', 'success');
  };

  const copy = async (value: string, message: string, channel: string) => {
    track('kkti_share', { channel });
    try {
      await Clipboard.setStringAsync(value);
      haptic.success();
      celebrate({ kind: 'sparkles', count: 10, haptic: false });
      toast.show(message, 'success');
    } catch {
      toast.show('복사하지 못했어요. 주소창의 링크를 직접 복사해 주세요.', 'error');
    }
  };

  const copyLink = () => copy(result.url, '링크 복사 완료! 틱톡·인스타 프로필이나 스토리 링크에 붙여 넣어 보세요', 'copy');

  const openIntent = async (channel: 'x' | 'threads') => {
    haptic.tap();
    track('kkti_share', { channel });
    const url = (channel === 'x' ? X_INTENT : THREADS_INTENT) + encodeURIComponent(text);
    try {
      await Linking.openURL(url);
    } catch {
      copy(text, '앱을 열지 못해서 공유 문구를 복사해 뒀어요', `${channel}_fallback`);
    }
  };

  // 시스템 공유 (카톡 등). 웹은 navigator.share 가 있으면 쓰고, 없으면 문구를 복사한다
  const shareSystem = async () => {
    haptic.tap();
    if (Platform.OS === 'web') {
      if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
        track('kkti_share', { channel: 'web_share' });
        await navigator.share({ title: 'KKTI · 카톡으로 보는 진짜 연애 MBTI', text }).catch(() => {});
        return;
      }
      copy(text, '공유 문구를 복사했어요. 원하는 곳에 붙여 넣어 보세요', 'web_copy');
      return;
    }
    track('kkti_share', { channel: 'system' });
    await Share.share({ message: text }).catch(() => {});
  };

  const nameSize = type.name.length > 8 ? styles.heroNameLong : null;

  return (
    <View style={[styles.flex, styles.clip, { backgroundColor: theme.background }]}>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.flood,
          { width: floodSize, height: floodSize, borderRadius: floodSize / 2, left: width / 2 - floodSize / 2, top: originY - floodSize / 2, backgroundColor: pageTint },
          floodStyle,
        ]}
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + Spacing.sm, paddingBottom: insets.bottom + Spacing.xxl }]}>
        <View style={styles.topBar}>
          <Pressable accessibilityRole="button" accessibilityLabel="닫기" onPress={leave} hitSlop={10} style={[styles.iconCircle, { backgroundColor: theme.surfaceElevated }]}>
            <Ionicons name="close" size={20} color={theme.text} />
          </Pressable>
          <Pressable accessibilityRole="button" onPress={retake} hitSlop={6} style={[styles.pill, { backgroundColor: theme.surfaceElevated }]}>
            <Ionicons name="refresh" size={15} color={theme.textSecondary} />
            <AppText variant="smallStrong" color="textSecondary">
              다시 하기
            </AppText>
          </Pressable>
        </View>

        {/* 히어로 — 연애 컬러가 가운데서 퍼져 카드를 물들인다 */}
        <View style={[styles.hero, { backgroundColor: theme.surfaceElevated }]}>
          <Animated.View pointerEvents="none" style={[styles.heroFlood, { backgroundColor: color.hex }, heroFloodStyle]} />
          <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, sheenStyle]}>
            <LinearGradient colors={[hexToRgba('#FFFFFF', 0.32), hexToRgba('#FFFFFF', 0), hexToRgba('#000000', 0.1)]} start={{ x: 0, y: 0 }} end={{ x: 0.9, y: 1 }} style={StyleSheet.absoluteFill} />
          </Animated.View>

          <PopIn delay={T.label}>
            <AppText variant="smallStrong" color={inkSoft}>
              {mine ? '나의 KKTI 연애 유형' : 'KKTI 연애 유형'}
            </AppText>
          </PopIn>
          <PopIn delay={T.emoji} from={0.2}>
            <View ref={emojiRef} collapsable={false} style={[styles.emojiCircle, { backgroundColor: glass }]}>
              <AppText style={styles.heroEmoji}>{type.emoji}</AppText>
            </View>
          </PopIn>
          <View style={styles.letters}>
            {letters.map((letter, i) => (
              <PopIn key={i} delay={T.letter + i * T.letterGap} from={0.1} style={[styles.letterTile, { backgroundColor: glass }]}>
                <AppText style={[styles.letter, { color: ink }]}>{letter}</AppText>
                <AppText style={styles.letterLabel} color={inkSoft} numberOfLines={1}>
                  {result.axes[i].pole.label}
                </AppText>
              </PopIn>
            ))}
          </View>
          <PopIn delay={T.name}>
            <AppText variant="display" align="center" color={ink} style={nameSize}>
              {type.name}
            </AppText>
          </PopIn>
          <FadeUp delay={T.name + 80}>
            <AppText variant="body" align="center" color={inkSoft}>
              {type.oneLiner}
            </AppText>
          </FadeUp>
          <FadeUp delay={T.name + 160} style={styles.heroChips}>
            {[`🎨 ${color.name}`, `🧬 ${mbti.type}`, `🔢 ${enneagram.title}`].map((chip) => (
              <View key={chip} style={[styles.heroChip, { backgroundColor: glass }]}>
                <AppText variant="caption" weight="700" color={ink}>
                  {chip}
                </AppText>
              </View>
            ))}
          </FadeUp>
          <FadeUp delay={T.name + 240}>
            <AppText variant="caption" align="center" color={inkSoft}>
              KKTI · 카톡으로 보는 진짜 연애 MBTI
            </AppText>
          </FadeUp>
        </View>

        {/* 친구가 보낸 링크로 들어왔을 때 */}
        {hydrated && !mine ? (
          <FadeUp delay={T.rest} style={[styles.friend, { backgroundColor: theme.surfaceElevated, borderColor: theme.accent }]}>
            <AppText variant="bodyStrong">👀 친구가 보낸 결과인가요?</AppText>
            <AppText variant="small" color="textSecondary">
              나는 무슨 유형일까? 12문항, 1분이면 알 수 있어요.
            </AppText>
            <Button title="나도 테스트하기" variant="accent" size="md" haptic={false} onPress={retake} />
          </FadeUp>
        ) : null}

        {/* 공유 */}
        <Section emoji="📣" title="결과 공유하기" delay={T.rest + 60}>
          <AppText variant="small" color="textSecondary">
            친구 유형도 궁금하지 않아요? 결과 링크를 보내고 궁합을 비교해 봐요.
          </AppText>
          <View style={styles.shareRow}>
            <ShareTile icon="logo-x" label="X" sub="포스트" bg={inkBg(scheme)} fg={inkFg(scheme)} onPress={() => openIntent('x')} />
            <ShareTile icon="logo-threads" label="스레드" sub="포스트" bg={inkBg(scheme)} fg={inkFg(scheme)} onPress={() => openIntent('threads')} />
            <ShareTile icon="link" label="링크 복사" sub="틱톡·인스타" bg={theme.accentSoft} fg={theme.accent} onPress={copyLink} />
            <ShareTile icon="share-social" label="더보기" sub="카톡 등" bg={theme.primarySoft} fg={theme.primary} onPress={shareSystem} />
          </View>
        </Section>

        {/* 유형 설명 */}
        <Section emoji={type.emoji} title={`${type.name}${josa(type.name, '은', '는')} 이런 사람`} delay={T.rest + 120}>
          <AppText variant="body">{type.description}</AppText>
          <View style={styles.list}>
            <AppText variant="smallStrong" color="success">
              💪 강점
            </AppText>
            {type.strengths.map((s) => (
              <Bullet key={s} icon="checkmark-circle" color={theme.success} text={s} />
            ))}
          </View>
          <View style={styles.list}>
            <AppText variant="smallStrong" color="warning">
              ⚠️ 이건 조심
            </AppText>
            {type.watchOut.map((s) => (
              <Bullet key={s} icon="alert-circle" color={theme.warning} text={s} />
            ))}
          </View>
        </Section>

        {/* 축 4개 */}
        <Section emoji="📊" title="나의 카톡 습관" delay={T.rest + 180}>
          {result.axes.map((axis, i) => (
            <AxisBar key={axis.key} axis={axis} fill={barFill} delay={T.rest + 300 + i * 120} />
          ))}
        </Section>

        {/* 카톡 속 진짜 MBTI */}
        <Section emoji="🧬" title="카톡 속 진짜 MBTI" delay={T.rest + 240}>
          <View style={styles.mbtiRow}>
            {mbti.letters.map((l) => (
              <View key={l.letter} style={[styles.mbtiCell, { backgroundColor: theme.surface }]}>
                <AppText style={[styles.mbtiLetter, { color: accentText }]}>{l.letter}</AppText>
                <AppText variant="caption" color="textSecondary">
                  {l.from} · {l.confidence}%
                </AppText>
              </View>
            ))}
          </View>
          <AppText variant="small" color="textSecondary">
            카톡 습관만으로 본 MBTI예요 (평균 확신도 {mbti.confidence}%). 평소 MBTI랑 다르다면… 카톡 속 내가 진짜일지도? 😉
          </AppText>
        </Section>

        {/* 애니어그램 추정 */}
        <Section emoji="🔢" title="애니어그램 추정" delay={T.rest + 300}>
          <View style={styles.enneaRow}>
            <View style={[styles.enneaBadge, { backgroundColor: hexToRgba(barFill, 0.16) }]}>
              <AppText style={[styles.enneaNumber, { color: accentText }]}>{enneagram.number}</AppText>
            </View>
            <View style={styles.flexShrink}>
              <AppText variant="title3">{enneagram.title}</AppText>
              <AppText variant="small" color="textSecondary">
                {enneagram.reason}
              </AppText>
            </View>
          </View>
          <AppText variant="caption" color="textTertiary">
            ⓘ {enneagram.note}
          </AppText>
        </Section>

        {/* 연애 컬러 */}
        <Section emoji="🎨" title="나만의 연애 컬러" delay={T.rest + 360}>
          <PressableScale
            feedback={false}
            onPress={() => copy(color.hex, `색상 코드 ${color.hex} 복사했어요`, 'hex')}
            accessibilityLabel={`색상 코드 ${color.hex} 복사`}
            style={[styles.swatch, { backgroundColor: color.hex }]}>
            <AppText variant="title2" color={ink}>
              {color.name}
            </AppText>
            <View style={styles.swatchFoot}>
              <AppText variant="smallStrong" color={inkSoft}>
                {color.hex}
              </AppText>
              <View style={[styles.copyChip, { backgroundColor: glass }]}>
                <Ionicons name="copy-outline" size={12} color={ink} />
                <AppText variant="caption" weight="700" color={ink}>
                  복사
                </AppText>
              </View>
            </View>
          </PressableScale>
          <AppText variant="body">{color.description}</AppText>
          <View style={styles.metaRow}>
            {[
              { label: '색상', value: `${color.hsl.h}°` },
              { label: '채도', value: `${color.hsl.s}%` },
              { label: '명도', value: `${color.hsl.l}%` },
            ].map((m) => (
              <View key={m.label} style={[styles.meta, { backgroundColor: theme.surface }]}>
                <AppText variant="caption" color="textTertiary">
                  {m.label}
                </AppText>
                <AppText variant="smallStrong">{m.value}</AppText>
              </View>
            ))}
          </View>
          <AppText variant="caption" color="textTertiary">
            답 조합마다 색이 미묘하게 달라요. 560만 가지가 넘는 색 중 나만의 색이에요.
          </AppText>
        </Section>

        {/* 궁합 */}
        <Section emoji="💘" title="연애 궁합" delay={T.rest + 420}>
          {best ? <MatchRow label="찰떡궁합" good emoji={best.emoji} name={best.name} code={best.code} reason={matchReason(result.code, best.code)} /> : null}
          {worst ? <MatchRow label="상극 주의" good={false} emoji={worst.emoji} name={worst.name} code={worst.code} reason={matchReason(result.code, worst.code)} /> : null}
        </Section>

        {/* 코치 한마디 → 앱 코칭으로 */}
        <Section emoji="💬" title="코치 한마디" delay={T.rest + 480}>
          <View style={[styles.quote, { borderLeftColor: barFill }]}>
            <AppText variant="body">{type.coachTip}</AppText>
          </View>
          <AppText variant="small" color="textSecondary">
            추천 답장 톤 {tone.emoji} {tone.label} · {tone.description}
          </AppText>
          <Button title="이 유형에 맞춘 답장 코칭 받기" haptic={false} onPress={goCoach} icon={<Ionicons name="chatbubble-ellipses" size={18} color={palette.white} />} />
          <AppText variant="caption" color="textTertiary" align="center">
            대화 캡처 한 장이면 답장 3개와 호감 온도를 바로 알려 드려요
          </AppText>
        </Section>

        <View style={styles.actions}>
          {isSaved ? (
            <View style={styles.savedRow}>
              <Ionicons name="checkmark-circle" size={18} color={theme.success} />
              <AppText variant="smallStrong" color="success">
                내 프로필에 저장됨
              </AppText>
            </View>
          ) : (
            <Button title="내 프로필에 저장" variant="secondary" haptic={false} onPress={save} icon={<Ionicons name="bookmark-outline" size={18} color={theme.text} />} />
          )}
          <Button title={mine ? '다시 하기' : '나도 테스트하기'} variant={mine ? 'ghost' : 'accent'} haptic={false} onPress={retake} />
        </View>
      </ScrollView>
    </View>
  );
}

const inkBg = (scheme: 'light' | 'dark') => (scheme === 'dark' ? palette.white : palette.black);
const inkFg = (scheme: 'light' | 'dark') => (scheme === 'dark' ? palette.black : palette.white);

// ───────────────────────── 조각들 ─────────────────────────

function Section({ emoji, title, delay, children }: PropsWithChildren<{ emoji: string; title: string; delay: number }>) {
  const theme = useTheme();
  return (
    <FadeUp delay={delay} style={[styles.section, { backgroundColor: theme.surfaceElevated, borderColor: theme.border }]}>
      <AppText variant="title3">
        {emoji} {title}
      </AppText>
      {children}
    </FadeUp>
  );
}

function Bullet({ icon, color, text }: { icon: keyof typeof Ionicons.glyphMap; color: string; text: string }) {
  return (
    <View style={styles.bullet}>
      <Ionicons name={icon} size={16} color={color} style={styles.bulletIcon} />
      <AppText variant="small" style={styles.flexShrink}>
        {text}
      </AppText>
    </View>
  );
}

function ShareTile({ icon, label, sub, bg, fg, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; sub: string; bg: string; fg: string; onPress: () => void }) {
  return (
    <PressableScale feedback={false} onPress={onPress} accessibilityLabel={`${label} ${sub}로 공유`} style={styles.shareTile}>
      <View style={[styles.shareIcon, { backgroundColor: bg }]}>
        <Ionicons name={icon} size={22} color={fg} />
      </View>
      <AppText variant="caption" weight="700" align="center" numberOfLines={1}>
        {label}
      </AppText>
      <AppText variant="caption" color="textTertiary" align="center" numberOfLines={1} style={styles.shareSub}>
        {sub}
      </AppText>
    </PressableScale>
  );
}

/** 축 하나 — 고른 쪽에서부터 막대가 차오른다 */
function AxisBar({ axis, fill, delay }: { axis: KktiAxisResult; fill: string; delay: number }) {
  const theme = useTheme();
  const plusSide = axis.pole.letter === axis.plus.letter;
  const v = useSharedValue(0);
  useEffect(() => {
    v.value = withDelay(delay, withTiming(axis.percent / 100, { duration: 900, easing: Easing.out(Easing.cubic) }));
  }, [axis.percent, delay, v]);
  const barStyle = useAnimatedStyle(() => ({ width: `${v.value * 100}%` }));
  return (
    <View style={styles.axis}>
      <AppText variant="caption" color="textTertiary">
        {axis.emoji} {axis.label}
      </AppText>
      <View style={styles.axisLabels}>
        <AppText variant={plusSide ? 'smallStrong' : 'small'} color={plusSide ? 'text' : 'textTertiary'} style={styles.flexShrink} numberOfLines={1}>
          {axis.plus.letter} {axis.plus.label} {axis.plusPercent}%
        </AppText>
        <AppText variant={plusSide ? 'small' : 'smallStrong'} color={plusSide ? 'textTertiary' : 'text'} style={styles.flexShrink} numberOfLines={1} align="right">
          {100 - axis.plusPercent}% {axis.minus.label} {axis.minus.letter}
        </AppText>
      </View>
      <View style={[styles.axisTrack, { backgroundColor: theme.surfaceSelected, alignItems: plusSide ? 'flex-start' : 'flex-end' }]}>
        <Animated.View style={[styles.axisFill, { backgroundColor: fill }, barStyle]} />
      </View>
    </View>
  );
}

function MatchRow({ label, good, emoji, name, code, reason }: { label: string; good: boolean; emoji: string; name: string; code: string; reason: string }) {
  const theme = useTheme();
  return (
    <View style={[styles.matchRow, { backgroundColor: theme.surface }]}>
      <AppText style={styles.matchEmoji}>{emoji}</AppText>
      <View style={styles.flexShrink}>
        <AppText variant="caption" weight="800" color={good ? 'success' : 'danger'}>
          {label}
        </AppText>
        <AppText variant="bodyStrong">
          {name}{' '}
          <AppText variant="small" color="textTertiary">
            {code}
          </AppText>
        </AppText>
        <AppText variant="small" color="textSecondary">
          {reason}
        </AppText>
      </View>
    </View>
  );
}

/** 작게 시작해 통통 튀며 나타난다 */
function PopIn({ delay = 0, from = 0.6, style, children }: PropsWithChildren<{ delay?: number; from?: number; style?: StyleProp<ViewStyle> }>) {
  const v = useSharedValue(0);
  useEffect(() => {
    v.value = withDelay(delay, withSpring(1, { damping: 10, stiffness: 180, mass: 0.8 }));
  }, [delay, v]);
  const animated = useAnimatedStyle(() => ({
    opacity: Math.min(1, Math.max(0, v.value * 1.6)),
    transform: [{ scale: from + (1 - from) * v.value }],
  }));
  return <Animated.View style={[style, animated]}>{children}</Animated.View>;
}

/** 아래에서 살짝 떠오르며 나타난다 */
function FadeUp({ delay = 0, style, children }: PropsWithChildren<{ delay?: number; style?: StyleProp<ViewStyle> }>) {
  const v = useSharedValue(0);
  useEffect(() => {
    v.value = withDelay(delay, withTiming(1, { duration: 450, easing: Easing.out(Easing.cubic) }));
  }, [delay, v]);
  const animated = useAnimatedStyle(() => ({ opacity: v.value, transform: [{ translateY: (1 - v.value) * 18 }] }));
  return <Animated.View style={[style, animated]}>{children}</Animated.View>;
}

const HERO_FLOOD = 1400;

const styles = StyleSheet.create({
  flex: { flex: 1 },
  flexShrink: { flexShrink: 1 },
  clip: { overflow: 'hidden' },
  flood: { position: 'absolute' },
  content: { paddingHorizontal: Spacing.lg, gap: Spacing.md, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  iconCircle: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: Spacing.md, height: 36, borderRadius: Radius.pill },

  hero: { borderRadius: Radius.xl, overflow: 'hidden', paddingHorizontal: Spacing.lg, paddingTop: Spacing.xl, paddingBottom: Spacing.lg, alignItems: 'center', gap: Spacing.md },
  heroFlood: {
    position: 'absolute',
    width: HERO_FLOOD,
    height: HERO_FLOOD,
    borderRadius: HERO_FLOOD / 2,
    left: '50%',
    marginLeft: -HERO_FLOOD / 2,
    top: 104 - HERO_FLOOD / 2,
  },
  emojiCircle: { width: 96, height: 96, borderRadius: 48, alignItems: 'center', justifyContent: 'center' },
  heroEmoji: { fontSize: 52, lineHeight: 64 },
  letters: { flexDirection: 'row', gap: 6, alignSelf: 'stretch', justifyContent: 'center' },
  letterTile: { flex: 1, maxWidth: 84, borderRadius: Radius.md, paddingVertical: Spacing.sm, paddingHorizontal: 2, alignItems: 'center' },
  letter: { fontSize: 30, lineHeight: 38, fontWeight: '900' },
  letterLabel: { fontSize: 10, lineHeight: 13, fontWeight: '600' },
  heroNameLong: { fontSize: 26, lineHeight: 34 },
  heroChips: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6 },
  heroChip: { paddingHorizontal: Spacing.sm + 2, paddingVertical: 4, borderRadius: Radius.pill },

  friend: { borderRadius: Radius.lg, borderWidth: 1.5, padding: Spacing.lg, gap: Spacing.sm },
  section: { borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.lg, gap: Spacing.md },
  list: { gap: Spacing.xs + 2 },
  bullet: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  bulletIcon: { marginTop: 2 },

  shareRow: { flexDirection: 'row', gap: Spacing.sm },
  shareTile: { flex: 1, alignItems: 'center', gap: 4, paddingVertical: Spacing.xs },
  shareIcon: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  shareSub: { fontSize: 10, lineHeight: 13 },

  axis: { gap: 6 },
  axisLabels: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.sm },
  axisTrack: { height: 12, borderRadius: 6, overflow: 'hidden' },
  axisFill: { height: '100%', borderRadius: 6 },

  mbtiRow: { flexDirection: 'row', gap: Spacing.sm },
  mbtiCell: { flex: 1, alignItems: 'center', borderRadius: Radius.md, paddingVertical: Spacing.md, gap: 2 },
  mbtiLetter: { fontSize: 32, lineHeight: 40, fontWeight: '900' },

  enneaRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  enneaBadge: { width: 56, height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  enneaNumber: { fontSize: 28, lineHeight: 34, fontWeight: '900' },

  swatch: { height: 132, borderRadius: Radius.lg, padding: Spacing.lg, justifyContent: 'space-between' },
  swatchFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  copyChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: Spacing.sm, paddingVertical: 3, borderRadius: Radius.pill },
  metaRow: { flexDirection: 'row', gap: Spacing.sm },
  meta: { flex: 1, borderRadius: Radius.md, paddingVertical: Spacing.sm, alignItems: 'center' },

  matchRow: { flexDirection: 'row', gap: Spacing.md, borderRadius: Radius.md, padding: Spacing.md, alignItems: 'flex-start' },
  matchEmoji: { fontSize: 30, lineHeight: 38 },

  quote: { borderLeftWidth: 4, paddingLeft: Spacing.md, paddingVertical: 2 },
  actions: { gap: Spacing.sm, marginTop: Spacing.sm },
  savedRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 48 },

  invalid: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.xl },
  invalidInner: { width: '100%', maxWidth: 420, alignItems: 'center', gap: Spacing.md },
  invalidEmoji: { fontSize: 56, lineHeight: 68 },
  invalidActions: { alignSelf: 'stretch', gap: Spacing.sm, marginTop: Spacing.md },
});
