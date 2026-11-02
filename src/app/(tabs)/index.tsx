import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { WhoSheet, type WhoTarget } from '@/components/coach/who-sheet';
import { CrushListItem } from '@/components/crush/crush-list-item';
import { DemoReel } from '@/components/fx/demo-reel';
import { HeartMark, Highlight, StagePill } from '@/components/stage/stage';
import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { PressableScale } from '@/components/ui/pressable-scale';
import { SectionHeader } from '@/components/ui/section-header';
import { useToast } from '@/components/ui/toast';
import { MaxContentWidth, Radius, Spacing, Stage, palette } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { track } from '@/lib/analytics';
import { APP_CONFIG } from '@/lib/config';
import { isDemoMode } from '@/lib/demo';
import { haptic } from '@/lib/haptics';
import { pickImage, type PickedImage } from '@/lib/images';
import { PRIVACY_NOTICE_VERSION, sortCrushes, useAppStore } from '@/store/app-store';

/**
 * 홈(채팅) — 「안녕하세요」 인사 바로 아래에서 대화를 시작한다: 캡처 올리기 · 상황만 적기 두 길뿐.
 * 채팅방이 있으면 고른 뒤 「누구와의 대화예요?」 시트로 보낼 곳만 고르고(최근 대화가 맨 위), 없으면 바로 첫 채팅방을 연다.
 * 그 아래가 채팅방 목록. 속마음 카드·KKTI·비밀 상담·(켰으면) 연애 연습 같은 부가 기능은 「탐색」 탭에 따로 둔다.
 */
export default function HomeScreen() {
  const theme = useTheme();
  const router = useRouter();
  const toast = useToast();
  const insets = useSafeAreaInsets();
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
  const hottest = crushes.reduce<number>((m, c) => Math.max(m, c.heat ?? 0), 0);
  const name = user?.name?.trim();
  const [busy, setBusy] = useState(false);
  // 「누구와의 대화예요?」 시트 — 캡처를 골랐으면 그 캡처를, 상황 적기면 null 을 들고 연다
  const [who, setWho] = useState<{ image: PickedImage | null } | null>(null);

  // 캡처 버튼의 아이콘이 은은하게 숨 쉰다
  const pulse = useSharedValue(1);
  useEffect(() => {
    pulse.value = withRepeat(withSequence(withTiming(1.1, { duration: 900 }), withTiming(1, { duration: 900 })), -1);
  }, [pulse]);
  const pulseStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));

  const previewFor = (id: string) => {
    const list = messages[id] ?? [];
    for (let i = list.length - 1; i >= 0; i--) {
      const m = list[i];
      if (m.role === 'coach' && m.analysis) return `코치: ${m.analysis.summary}`;
      if (m.role === 'user' && m.text) return `나: ${m.text}`;
      if (m.role === 'user' && m.imageUri) return '나: 📸 대화 캡처';
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
    const id = target.kind === 'crush' ? target.id : target.kind === 'secret' ? s.createSecretChat() : s.quickStart();
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
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + Spacing.xl }}>
        <LinearGradient colors={Stage.bg} start={{ x: 0, y: 0 }} end={{ x: 0.4, y: 1 }} style={[styles.stage, { paddingTop: insets.top + Spacing.md }]}>
          <LinearGradient pointerEvents="none" colors={[Stage.glow, 'rgba(255,176,120,0)']} start={{ x: 1, y: 0 }} end={{ x: 0.3, y: 0.7 }} style={styles.glow} />
          <View style={styles.inner}>
            <View style={styles.topRow}>
              <View style={styles.brand}>
                <Ionicons name="heart-outline" size={16} color={Stage.gold} />
                <Text style={styles.brandText}>나만의 연애코치</Text>
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel="새 채팅방" onPress={newRoom} hitSlop={8} style={styles.addBtn}>
                <Ionicons name="add" size={22} color={Stage.onGold} />
              </Pressable>
            </View>

            <Animated.View entering={FadeInDown.duration(380)} style={styles.greeting}>
              <Highlight variant="display" text={`${name ? `${name}님,` : '안녕하세요,'}\n오늘은 *누구 답장*이\n고민돼요?`} />
              <Text style={styles.greetingSub}>{hottest >= 50 ? `가장 뜨거운 대화 ${hottest}° · 분위기 좋아요 🔥` : '캡처 한 장이면 답장 3가지와 호감 온도가 바로 나와요'}</Text>
              <HeartMark size={44} rotate={14} style={styles.heart} />
            </Animated.View>

            {/* 대화 시작은 이 카드 하나 — 캡처 올리기 / 상황만 적기 */}
            <Animated.View entering={FadeInDown.delay(80).duration(380)} style={styles.startCard}>
              <PressableScale onPress={capture} pressedScale={0.98} style={styles.captureRow} accessibilityLabel="대화 캡처 올리기">
                <Animated.View style={[styles.captureIcon, pulseStyle]}>
                  {busy ? <ActivityIndicator color={palette.white} /> : <Ionicons name="image" size={24} color={palette.white} />}
                </Animated.View>
                <View style={styles.flex}>
                  <Text style={styles.captureTitle}>대화 캡처 올리기</Text>
                  <Text style={styles.captureBody}>카톡·DM 캡처 → 답장 3가지 + 호감 온도</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={palette.rose600} />
              </PressableScale>
              <View style={styles.startDivider} />
              <PressableScale onPress={write} pressedScale={0.98} style={styles.writeRow} accessibilityLabel="캡처 없이 상황만 적기">
                <Ionicons name="create-outline" size={20} color="#7A6A6C" />
                <Text style={styles.writeText}>캡처 없이 상황만 적어서 물어보기</Text>
                <Ionicons name="chevron-forward" size={18} color="#B9A9AB" />
              </PressableScale>
            </Animated.View>
          </View>
        </LinearGradient>

        <View style={styles.body}>
          {privacyNoticeDue ? (
            <View style={[styles.privacyNotice, { backgroundColor: theme.surface }]}>
              <Ionicons name="shield-checkmark-outline" size={20} color={theme.primary} style={styles.privacyIcon} />
              <View style={styles.flex}>
                <AppText variant="smallStrong">개인정보 처리방침이 바뀌었어요</AppText>
                <AppText variant="caption" color="textSecondary">
                  앱 이용 기록(화면·버튼 이용)은 서비스 제공·개선을 위해 자동으로 수집돼요(만 14세 미만 제외). 질문·답변 같은 코칭 내용 저장은 계속 선택이에요.
                </AppText>
                <AppText variant="caption" color="primary" accessibilityRole="link" onPress={() => closePrivacyNotice(true)} style={styles.privacyMore}>
                  자세히 보기 · 설정 바꾸기 ›
                </AppText>
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel="개인정보 안내 닫기" onPress={() => closePrivacyNotice(false)} hitSlop={12}>
                <Ionicons name="close" size={18} color={theme.textTertiary} />
              </Pressable>
            </View>
          ) : null}

          {crushes.length === 0 ? (
            // 아직 채팅방이 없으면 「이렇게 나와요」 시연으로 첫 캡처를 부른다
            <Animated.View entering={FadeInDown.delay(120).duration(380)} style={styles.firstRun}>
              <SectionHeader title="이렇게 나와요" subtitle="캡처 한 장 올리면 코치가 대화를 읽고 답장을 골라 줘요" />
              <DemoReel />
              <Pressable accessibilityRole="button" onPress={newRoom} hitSlop={8} style={styles.registerLink}>
                <AppText variant="small" color="textSecondary">
                  마음에 둔 사람을 먼저 등록할래요 ›
                </AppText>
              </Pressable>
            </Animated.View>
          ) : (
            <>
              <SectionHeader title="채팅방" subtitle={`${crushes.length}명과 대화 중 · 온도는 0°에서 시작해요`} />
              <View style={styles.list}>
                {crushes.map((c, i) => (
                  <Animated.View key={c.id} entering={FadeInDown.delay(40 * i).duration(260)}>
                    <CrushListItem crush={c} hidePreview={hidePreviews} lastPreview={previewFor(c.id)} onPress={() => router.push({ pathname: '/crush/[id]', params: { id: c.id } })} />
                  </Animated.View>
                ))}
              </View>
              <Button title="새 채팅방 만들기" variant="soft" onPress={newRoom} style={styles.bottomBtn} />
            </>
          )}

          {profileThin ? (
            <Animated.View entering={FadeInDown.delay(250)}>
              {/* 처음 실행 때와 같은 「코치와의 짧은 대화」로 묻는다 — 끝나면 홈으로 돌아온다 */}
              <PressableScale onPress={() => router.push({ pathname: '/about-me', params: { from: 'home' } })} style={[styles.profileCard, { backgroundColor: theme.primarySoft }]}>
                <AppText style={styles.profileEmoji}>🪞</AppText>
                <View style={styles.flex}>
                  <View style={styles.profileHead}>
                    <AppText variant="smallStrong">나에 대해 알려주세요</AppText>
                    <StagePill label="30초" style={styles.profilePill} />
                  </View>
                  <AppText variant="caption" color="textSecondary">
                    코치가 몇 가지만 물어볼게요 · 더 「나다운」 답장이 나와요
                  </AppText>
                </View>
                <Ionicons name="chevron-forward" size={18} color={theme.textTertiary} />
              </PressableScale>
            </Animated.View>
          ) : null}

          {!isDemoMode && !APP_CONFIG.apiSameOrigin && !process.env.EXPO_PUBLIC_API_URL && !hasApiKey ? (
            <Pressable accessibilityRole="button" onPress={() => router.push('/settings/api-key')} style={[styles.notice, { backgroundColor: theme.accentSoft }]}>
              <Ionicons name="key-outline" size={18} color={theme.accent} />
              <AppText variant="small" color="accent" style={styles.flex}>
                AI 코치가 아직 연결되지 않았어요. 탭해서 연결하기
              </AppText>
            </Pressable>
          ) : null}
        </View>
      </ScrollView>
      <WhoSheet visible={who != null} crushes={crushes} imageUri={who?.image?.uri} onPick={pickWho} onClose={() => setWho(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  stage: { borderBottomLeftRadius: Radius.xl, borderBottomRightRadius: Radius.xl, overflow: 'hidden', paddingBottom: Spacing.xl },
  glow: { position: 'absolute', top: -140, right: -100, width: 380, height: 380, borderRadius: 190 },
  inner: { paddingHorizontal: Spacing.lg, gap: Spacing.lg, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  brandText: { fontSize: 13, fontWeight: '800', color: Stage.text, letterSpacing: -0.2 },
  addBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: Stage.gold, alignItems: 'center', justifyContent: 'center' },
  greeting: { gap: Spacing.sm, paddingRight: 48 },
  greetingSub: { fontSize: 14, lineHeight: 20, fontWeight: '600', color: Stage.textDim },
  heart: { position: 'absolute', right: 0, top: 6 },
  startCard: {
    backgroundColor: Stage.card,
    borderRadius: Radius.lg,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  captureRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.lg },
  startDivider: { height: StyleSheet.hairlineWidth, backgroundColor: '#E9DFDC', marginHorizontal: Spacing.lg },
  writeRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.lg, paddingVertical: 14 },
  writeText: { flex: 1, fontSize: 14, fontWeight: '700', color: '#5A4A4C' },
  firstRun: { gap: Spacing.md },
  registerLink: { alignSelf: 'center', paddingVertical: Spacing.sm },
  captureIcon: { width: 48, height: 48, borderRadius: 16, backgroundColor: palette.rose600, alignItems: 'center', justifyContent: 'center' },
  captureTitle: { fontSize: 17, fontWeight: '900', color: Stage.cardText, letterSpacing: -0.3 },
  captureBody: { fontSize: 13, fontWeight: '600', color: '#7A6A6C', marginTop: 2 },
  body: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.xl, gap: Spacing.lg, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  profileCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, borderRadius: Radius.lg, padding: Spacing.lg },
  profileHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  profilePill: { backgroundColor: palette.gold300 },
  profileEmoji: { fontSize: 28, lineHeight: 34 },
  list: { gap: Spacing.md },
  bottomBtn: { marginTop: Spacing.xs },
  notice: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.lg, borderRadius: Radius.md },
  privacyNotice: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md, padding: Spacing.lg, borderRadius: Radius.lg },
  privacyIcon: { marginTop: 1 },
  privacyMore: { marginTop: Spacing.xs },
});
