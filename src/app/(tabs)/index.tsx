import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, FadeInDown, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTabBarSpace } from '@/components/ui/tab-bar-space';
import { BrandPill, HeroCard, Icon3D, ResearchBadge, SenditLogo } from '@/components/brand/brand';
import { WhoSheet, type WhoTarget } from '@/components/coach/who-sheet';
import { CrushListItem } from '@/components/crush/crush-list-item';
import { DemoReel } from '@/components/fx/demo-reel';
import { AppText } from '@/components/ui/app-text';
import { PressableScale } from '@/components/ui/pressable-scale';
import { StatusBarScrim } from '@/components/ui/system-bars';
import { useToast } from '@/components/ui/toast';
import { APP_NAME } from '@/constants/brand';
import { Brand, MaxContentWidth, Radius, Spacing, Typography } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { track } from '@/lib/analytics';
import { useQuota } from '@/lib/billing/gate';
import { quotaLabel, type QuotaStatus } from '@/lib/billing/quota';
import { APP_CONFIG } from '@/lib/config';
import { isDemoMode } from '@/lib/demo';
import { haptic } from '@/lib/haptics';
import { deleteImageQuietly, pickImage, type PickedImage } from '@/lib/images';
import { PRIVACY_NOTICE_VERSION, sortCrushes, useAppStore } from '@/store/app-store';

/** 등장 순서 — 위에서부터 50ms 간격으로 살짝 올라온다 */
const enter = (step: number) => FadeInDown.delay(step * 50).duration(420);

/**
 * 홈 — 「럽코」 시안 배치: 로고 → 인사·큰 제목(+3D 아이콘) → 그라데이션 카드 하나(캡처 올리기) → 캡처 없이 적기 → 최근 상담.
 * 캡처나 상황 적기를 고르면 채팅방이 있을 때 「누구와의 대화예요?」 시트로 보낼 곳만 고르고(최근 대화가 맨 위), 없으면 바로 첫 채팅방을 연다.
 * 속마음 카드·KKTI·비밀 상담·(켰으면) 연애 연습 같은 부가 기능은 「탐색」 탭에 따로 둔다.
 */
export default function HomeScreen() {
  const theme = useTheme();
  const router = useRouter();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const tabSpace = useTabBarSpace();
  const quota = useQuota();
  const user = useAppStore((s) => s.user);
  const crushMap = useAppStore((s) => s.crushes);
  const crushes = useMemo(() => sortCrushes(crushMap).filter((c) => !c.secret), [crushMap]);
  const messages = useAppStore((s) => s.messages);
  const hasApiKey = useAppStore((s) => s.hasApiKey);
  const hidePreviews = useAppStore((s) => s.hidePreviews);
  // 바뀐 개인정보 안내를 아직 못 본 기존 이용자 (새 이용자는 첫 화면 동의 창에서 본다). 코치 서버가 없는 데모·개인 키 빌드는 이용 기록을 보내지 않아 띄우지 않는다
  const privacyNoticeDue = useAppStore((s) => s.privacyNoticeSeen < PRIVACY_NOTICE_VERSION) && !isDemoMode && Boolean(APP_CONFIG.apiSameOrigin || APP_CONFIG.apiUrl);
  const dismissPrivacyNotice = useAppStore((s) => s.dismissPrivacyNotice);
  const profileThin = !user?.about?.trim() && !user?.vibes?.length && !user?.goal;
  const name = user?.name?.trim();
  const [busy, setBusy] = useState(false);
  // 「누구와의 대화예요?」 시트 — 캡처를 골랐으면 그 캡처를, 상황 적기면 null 을 들고 연다
  const [who, setWho] = useState<{ image: PickedImage | null } | null>(null);

  const previewFor = (id: string) => {
    const list = messages[id] ?? [];
    for (let i = list.length - 1; i >= 0; i--) {
      const m = list[i];
      if (m.role === 'coach' && m.analysis) return `${APP_NAME}: ${m.analysis.summary}`;
      if (m.role === 'user' && m.text) return `나: ${m.text}`;
      if (m.role === 'user' && m.imageUri) return '나: 대화 캡처를 보냈어요';
    }
    return undefined;
  };

  const closePrivacyNotice = (open: boolean) => {
    track('privacy_notice', { action: open ? 'open' : 'dismiss' });
    dismissPrivacyNotice();
    if (open) router.push('/settings/privacy');
  };

  /** 고른 상대의 채팅방으로 — 캡처가 있으면 들어가자마자 분석하고, 없으면 입력창을 열어 둔다 */
  const openRoom = (target: WhoTarget, image: PickedImage | null) => {
    const s = useAppStore.getState();
    // 「새로운 사람」은 늘 새 방 — quickStart 는 이미 방이 있으면 가장 오래된 방을 돌려주므로 방이 하나도 없을 때만 쓴다
    const hasRoom = Object.values(s.crushes).some((c) => !c.secret);
    const id =
      target.kind === 'crush'
        ? target.id
        : target.kind === 'secret'
          ? s.createSecretChat()
          : hasRoom
            ? s.addCrush({ name: '상대', gender: 'female', relationship: 'talking', style: [], notes: '' }).id
            : s.quickStart();
    track('home_start', { mode: image ? 'image' : 'text', target: target.kind, rooms: crushes.length });
    router.push({ pathname: '/crush/[id]', params: image ? { id, pendingImage: image.uri, pendingWidth: String(image.width) } : { id, compose: '1' } });
  };

  // 캡처부터 고른다 — 채팅방이 있으면 누구와의 대화인지 묻고, 없으면 바로 첫 채팅방에서 분석한다
  const capture = async () => {
    if (busy) return;
    haptic.thud();
    track('home_capture', { rooms: crushes.length });
    setBusy(true);
    try {
      const picked = await pickImage('screenshot');
      if (!picked) return;
      if (crushes.length) setWho({ image: picked });
      else openRoom({ kind: 'new' }, picked);
    } catch (e) {
      toast.show(e instanceof Error ? e.message : '사진을 불러오지 못했어요.', 'error');
    } finally {
      setBusy(false);
    }
  };

  // 캡처 없이 상황만 적기 — 보낼 채팅방을 고른 뒤 그 방의 입력창에서 바로 적는다
  const write = () => {
    haptic.tap();
    track('home_write', { rooms: crushes.length });
    if (crushes.length) setWho({ image: null });
    else openRoom({ kind: 'new' }, null);
  };

  const pickWho = (target: WhoTarget) => {
    const image = who?.image ?? null;
    haptic.select();
    setWho(null);
    openRoom(target, image);
  };

  const newRoom = () => {
    haptic.thud();
    router.push('/crush/new');
  };

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      {/* 떠 있는 유리 탭 바에 마지막 내용이 가리지 않게 그만큼 아래를 비운다 */}
      <ScrollView showsVerticalScrollIndicator={false} scrollEventThrottle={32} contentContainerStyle={[styles.content, { paddingTop: insets.top + Spacing.sm, paddingBottom: tabSpace }]}>
        {/* 새 채팅방 + 는 탭 바 옆 「새 채팅」 구슬로 옮겼다 (2026-11-07 팀 제안 — 엄지가 닿는 자리) */}
        <Animated.View entering={enter(0)} style={styles.topRow}>
          <SenditLogo size="sm" />
        </Animated.View>

        <Animated.View entering={enter(1)} style={styles.greeting}>
          <View style={styles.flex}>
            <AppText variant="body" color="textSecondary">
              {name ? `${name}님, 안녕하세요` : '안녕하세요'}
            </AppText>
            <Text style={[styles.title, { color: theme.text }]} accessibilityRole="header">
              {'어떤 답장을\n보내볼까요?'}
            </Text>
          </View>
          <Icon3D name="send" size={92} float style={styles.icon3d} />
        </Animated.View>

        {/* 주인공 — 캡처 올리기 */}
        <Animated.View entering={enter(2)}>
          <HeroCard style={styles.hero}>
            <ResearchBadge tone="glass" />
            <View style={styles.heroTexts}>
              <Text style={styles.heroTitle}>카톡 캡처 한 장이면 돼요</Text>
              <Text style={styles.heroBody} lineBreakStrategyIOS="hangul-word">{'말투에 맞는 답장 3가지와\n호감 온도까지 바로 알려 드려요'}</Text>
            </View>
            <CaptureButton busy={busy} onPress={capture} />
            <Remaining quota={quota} />
          </HeroCard>
        </Animated.View>

        {/* 캡처 없이 상황만 적기 */}
        <Animated.View entering={enter(3)} style={styles.section}>
          <AppText variant="title3" weight="800">
            캡처 없이도 괜찮아요
          </AppText>
          <PressableScale
            onPress={write}
            feedback={false}
            pressedScale={0.98}
            accessibilityLabel="캡처 없이 상황만 적기"
            style={[styles.writeRow, { borderColor: theme.border, backgroundColor: theme.surfaceElevated }]}>
            <AppText variant="body" color="textTertiary" style={styles.flex} numberOfLines={1}>
              지금 어떤 상황인지 적어 주세요
            </AppText>
            <View style={[styles.writeArrow, { backgroundColor: theme.primarySoft }]}>
              <Ionicons name="arrow-up" size={20} color={theme.primary} />
            </View>
          </PressableScale>
        </Animated.View>

        {privacyNoticeDue ? (
          <Animated.View entering={enter(4)} style={[styles.notice, { backgroundColor: theme.surface }]}>
            <View style={[styles.noticeIcon, { backgroundColor: theme.primarySoft }]}>
              <Ionicons name="shield-checkmark" size={18} color={theme.primary} />
            </View>
            <View style={styles.flex}>
              <AppText variant="smallStrong">개인정보 처리방침이 바뀌었어요</AppText>
              <AppText variant="caption" color="textSecondary" style={styles.noticeBody}>
                앱 이용 기록(화면·버튼 이용)은 서비스 제공·개선을 위해 자동으로 수집돼요(만 14세 미만 제외). 질문·답변 같은 코칭 내용 저장은 계속 선택이에요.
              </AppText>
              <AppText variant="smallStrong" color="primary" accessibilityRole="link" onPress={() => closePrivacyNotice(true)} style={styles.noticeMore}>
                자세히 보기 · 설정 바꾸기 ›
              </AppText>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="개인정보 안내 닫기" onPress={() => closePrivacyNotice(false)} hitSlop={14}>
              <Ionicons name="close" size={18} color={theme.textTertiary} />
            </Pressable>
          </Animated.View>
        ) : null}

        {crushes.length === 0 ? (
          // 아직 채팅방이 없으면 「이렇게 나와요」 시연으로 첫 캡처를 부른다
          <Animated.View entering={enter(5)} style={styles.section}>
            <View style={styles.sectionHead}>
              <AppText variant="title3" weight="800">
                이렇게 나와요
              </AppText>
              <AppText variant="small" color="textSecondary">
                캡처 한 장 올리면 {APP_NAME}이 대화를 읽고 답장을 골라 줘요
              </AppText>
            </View>
            <DemoReel />
            <Pressable accessibilityRole="button" onPress={newRoom} hitSlop={8} style={styles.registerLink}>
              <AppText variant="smallStrong" color="textSecondary">
                마음에 둔 사람을 먼저 등록할래요 ›
              </AppText>
            </Pressable>
          </Animated.View>
        ) : (
          <Animated.View entering={enter(5)} style={styles.section}>
            <View style={styles.listHead}>
              <View style={styles.flex}>
                <AppText variant="title3" weight="800">
                  최근 상담
                </AppText>
                <AppText variant="caption" color="textTertiary">
                  {crushes.length}명과 대화 중 · 호감 온도는 0°에서 시작해요
                </AppText>
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel="새 채팅방 만들기" onPress={newRoom} hitSlop={10} style={styles.listAdd}>
                <Ionicons name="add" size={16} color={theme.primary} />
                <AppText variant="smallStrong" color="primary">
                  새 채팅방
                </AppText>
              </Pressable>
            </View>
            <View>
              {crushes.map((c, i) => (
                <Animated.View key={c.id} entering={FadeInDown.delay(300 + 50 * Math.min(i, 8)).duration(360)}>
                  <CrushListItem
                    crush={c}
                    hidePreview={hidePreviews}
                    lastPreview={previewFor(c.id)}
                    divider={i < crushes.length - 1}
                    onPress={() => router.push({ pathname: '/crush/[id]', params: { id: c.id } })}
                  />
                </Animated.View>
              ))}
            </View>
          </Animated.View>
        )}

        {profileThin ? (
          <Animated.View entering={enter(6)}>
            {/* 처음 실행 때와 같은 「센딧과의 짧은 대화」로 묻는다 — 끝나면 홈으로 돌아온다 */}
            <PressableScale
              onPress={() => router.push({ pathname: '/about-me', params: { from: 'home' } })}
              pressedScale={0.98}
              accessibilityLabel="나에 대해 알려주세요"
              style={[styles.profileCard, { backgroundColor: theme.surface }]}>
              <View style={[styles.profileIcon, { backgroundColor: theme.surfaceElevated }]}>
                <Ionicons name="person" size={22} color={theme.primary} />
              </View>
              <View style={styles.flex}>
                <View style={styles.profileHead}>
                  <AppText variant="bodyStrong">나에 대해 알려주세요</AppText>
                  <BrandPill label="30초" />
                </View>
                <AppText variant="caption" color="textSecondary">
                  답할수록 더 「나다운」 답장이 나와요
                </AppText>
              </View>
              <Ionicons name="chevron-forward" size={18} color={theme.textTertiary} />
            </PressableScale>
          </Animated.View>
        ) : null}

        {!isDemoMode && !APP_CONFIG.apiSameOrigin && !process.env.EXPO_PUBLIC_API_URL && !hasApiKey ? (
          <Pressable accessibilityRole="button" onPress={() => router.push('/settings/api-key')} style={[styles.keyNotice, { backgroundColor: theme.accentSoft }]}>
            <Ionicons name="key-outline" size={18} color={theme.accent} />
            <AppText variant="small" color="accent" style={styles.flex}>
              AI 코치가 아직 연결되지 않았어요. 눌러서 연결하기
            </AppText>
          </Pressable>
        ) : null}
      </ScrollView>
      {/* 흰 화면이라 시계·배터리는 기본(검은 글자) 그대로 — 스크롤한 내용이 그 뒤로 비치지 않게 바탕색 띠만 깐다 */}
      <StatusBarScrim height={insets.top} color={theme.background} />
      <WhoSheet
        visible={who != null}
        crushes={crushes}
        imageUri={who?.image?.uri}
        onPick={pickWho}
        onClose={() => {
          // 고르지 않고 닫으면 방금 고른 캡처 사본(대화 내용)을 바로 지운다
          deleteImageQuietly(who?.image?.uri);
          setWho(null);
        }}
      />
    </View>
  );
}

/** 그라데이션 카드 위 흰 「캡처 올리기」 버튼 — 몇 초마다 하늘색 빛이 한 번 스치고, 누르면 말랑하게 튄다 */
function CaptureButton({ busy, onPress }: { busy: boolean; onPress: () => void }) {
  const [width, setWidth] = useState(0);
  const sweep = useSharedValue(-1);
  useEffect(() => {
    sweep.value = withRepeat(withSequence(withDelay(2000, withTiming(1, { duration: 950, easing: Easing.inOut(Easing.quad) })), withTiming(-1, { duration: 0 })), -1);
  }, [sweep]);
  const shine = useAnimatedStyle(() => ({ transform: [{ translateX: sweep.value * (width || 320) }, { rotate: '18deg' }] }));
  return (
    <PressableScale
      onPress={onPress}
      feedback={false}
      pressedScale={0.96}
      accessibilityLabel="대화 캡처 올리기"
      accessibilityState={{ busy }}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={styles.capture}>
      <View pointerEvents="none" style={styles.captureClip}>
        <Animated.View style={[styles.captureShine, shine]} />
      </View>
      {busy ? (
        <ActivityIndicator color={Brand.blue} />
      ) : (
        <>
          <Ionicons name="images" size={21} color={Brand.blue} />
          <Text style={styles.captureText}>캡처 올리기</Text>
        </>
      )}
    </PressableScale>
  );
}

/** 카드 아래 남은 횟수 — 숫자는 크게, 처음 보일 때 세어 올라간다 (지금 화면이 보여 주는 값 그대로: lib/billing/quota) */
function Remaining({ quota }: { quota: QuotaStatus & { enforced: boolean } }) {
  // 데모·개인 키 빌드는 횟수 제한이 없어 숫자 대신 무엇을 올릴 수 있는지 알려 준다
  if (!quota.enforced) return <Text style={styles.remaining}>카톡·DM 캡처 모두 읽을 수 있어요</Text>;
  const count =
    quota.kind === 'trial' || quota.kind === 'daily'
      ? { lead: quota.kind === 'daily' ? '오늘 무료 코칭 ' : '무료 코칭 ', n: quota.free ?? quota.remaining, extra: `${quota.bonus ? ` · 가입 보너스 ${quota.bonus}회` : ''}${quota.credits ? ` · 횟수권 ${quota.credits}회` : ''}` }
      : quota.kind === 'bonus'
        ? { lead: '가입 보너스 무료 코칭 ', n: quota.bonus ?? quota.remaining, extra: quota.credits ? ` · 횟수권 ${quota.credits}회` : '' }
        : quota.kind === 'credits'
          ? { lead: '코칭 횟수권 ', n: quota.remaining, extra: '' }
          : null;
  if (!count) {
    const label = quota.kind === 'premium' || quota.kind === 'team' ? '무제한으로 쓰고 있어요' : quotaLabel(quota);
    return <Text style={styles.remaining}>{label}</Text>;
  }
  return (
    <Text style={styles.remaining} accessibilityLabel={`${count.lead}${count.n}회 남았어요${count.extra}`}>
      {count.lead}
      {/* 남은 횟수는 세어 올라가지 않고 바로 보여 준다 — 0 에서 시작하면 잠깐 「0회」로 보여 다 쓴 줄 안다 */}
      <Text style={styles.remainingNum}>{count.n}회</Text>
      {' 남았어요'}
      {count.extra}
    </Text>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  content: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xxl, gap: Spacing.xl, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 44 },
  greeting: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: -Spacing.sm },
  title: { ...Typography.hero, fontSize: 32, lineHeight: 41, marginTop: 6 },
  icon3d: { marginRight: -6 },
  hero: { marginTop: -Spacing.xs },
  heroTexts: { gap: 6, marginTop: Spacing.md, marginBottom: Spacing.lg },
  heroTitle: { color: Brand.onBrand, fontSize: 23, lineHeight: 30, fontWeight: '900', letterSpacing: -0.6 },
  heroBody: { color: Brand.onBrand, fontSize: 15, lineHeight: 22, fontWeight: '700', letterSpacing: -0.2, opacity: 0.94 },
  capture: {
    height: 58,
    borderRadius: Radius.lg,
    backgroundColor: Brand.onBrand,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  captureClip: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: Radius.lg, overflow: 'hidden' },
  captureShine: { position: 'absolute', top: -20, bottom: -20, width: 60, left: '45%', backgroundColor: Brand.sky, opacity: 0.28 },
  captureText: { color: Brand.blue, fontSize: 18, lineHeight: 24, fontWeight: '900', letterSpacing: -0.4 },
  remaining: { color: Brand.onBrand, fontSize: 14, lineHeight: 22, fontWeight: '600', textAlign: 'center', marginTop: Spacing.md },
  remainingNum: { color: Brand.onBrand, fontSize: 18, lineHeight: 22, fontWeight: '900' },
  section: { gap: Spacing.md },
  sectionHead: { gap: 2 },
  writeRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, borderWidth: 1, borderRadius: Radius.lg, paddingLeft: Spacing.lg, paddingRight: Spacing.sm, minHeight: 64 },
  writeArrow: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  listHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, marginBottom: -Spacing.xs },
  listAdd: { flexDirection: 'row', alignItems: 'center', gap: 2, minHeight: 44, paddingLeft: Spacing.sm },
  registerLink: { alignSelf: 'center', minHeight: 44, justifyContent: 'center', paddingHorizontal: Spacing.sm },
  notice: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md, padding: Spacing.lg, borderRadius: Radius.lg },
  noticeIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  noticeBody: { marginTop: 2 },
  noticeMore: { marginTop: Spacing.sm },
  profileCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, borderRadius: Radius.lg, padding: Spacing.lg },
  profileIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  profileHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: 2 },
  keyNotice: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.lg, borderRadius: Radius.md },
});
