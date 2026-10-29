import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CrushListItem } from '@/components/crush/crush-list-item';
import { HeartMark, Highlight, StagePill } from '@/components/stage/stage';
import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { PressableScale } from '@/components/ui/pressable-scale';
import { SectionHeader } from '@/components/ui/section-header';
import { useToast } from '@/components/ui/toast';
import { MaxContentWidth, Radius, Spacing, Stage, palette } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { track } from '@/lib/analytics';
import { APP_CONFIG } from '@/lib/config';
import { isDemoMode } from '@/lib/demo';
import { haptic } from '@/lib/haptics';
import { pickImage } from '@/lib/images';
import { PRIVACY_NOTICE_VERSION, sortCrushes, useAppStore } from '@/store/app-store';

/**
 * 홈(채팅) — 채팅이 먼저. 맨 위 무대 머리말(스토어 이미지와 같은 에스프레소·골드)에서 바로 캡처를 올리고,
 * 그 아래가 채팅방 목록이다. 속마음 카드·KKTI·비밀 상담 같은 부가 기능은 「탐색」 탭으로 옮겼다.
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

  // 채팅방이 있으면 누구와의 대화인지 고르는 빠른 코칭 화면으로, 없으면 바로 캡처를 골라 첫 채팅방에서 코칭한다
  const capture = async () => {
    if (busy) return;
    haptic.thud();
    track('home_capture', { rooms: crushes.length });
    if (crushes.length) {
      router.push('/quick');
      return;
    }
    setBusy(true);
    try {
      const picked = await pickImage('screenshot');
      if (!picked) return;
      const id = useAppStore.getState().quickStart();
      router.push({ pathname: '/crush/[id]', params: { id, pendingImage: picked.uri, pendingWidth: String(picked.width) } });
    } catch (e) {
      toast.show(e instanceof Error ? e.message : '사진을 불러오지 못했어요.', 'error');
    } finally {
      setBusy(false);
    }
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

            <Animated.View entering={FadeInDown.delay(80).duration(380)}>
              <PressableScale onPress={capture} pressedScale={0.97} style={styles.captureCard} accessibilityLabel="대화 캡처 올리기">
                <Animated.View style={[styles.captureIcon, pulseStyle]}>
                  {busy ? <ActivityIndicator color={palette.white} /> : <Ionicons name="image" size={24} color={palette.white} />}
                </Animated.View>
                <View style={styles.flex}>
                  <Text style={styles.captureTitle}>대화 캡처 올리기</Text>
                  <Text style={styles.captureBody}>카톡·DM 캡처 → 답장 3가지 + 호감 온도</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={palette.rose600} />
              </PressableScale>
            </Animated.View>

            <View style={styles.quickRow}>
              <PressableScale onPress={newRoom} style={styles.quick}>
                <Text style={styles.quickText}>✍️ 상대 등록하고 시작</Text>
              </PressableScale>
              <PressableScale onPress={() => router.push('/(tabs)/tips')} style={styles.quick}>
                <Text style={styles.quickText}>✨ 탐색 · 속마음 · KKTI</Text>
              </PressableScale>
            </View>
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
            <EmptyState
              emoji="💬"
              title="첫 채팅방을 만들어볼까요?"
              description="위에서 캡처를 바로 올리거나, 마음에 두고 있는 사람의 이름·MBTI·부르는 호칭을 등록하면 그 사람에게 맞춘 코칭을 받을 수 있어요."
              actionTitle="채팅방 만들기"
              onAction={newRoom}
            />
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
              <PressableScale onPress={() => router.push('/settings/profile')} style={[styles.profileCard, { backgroundColor: theme.primarySoft }]}>
                <AppText style={styles.profileEmoji}>🪞</AppText>
                <View style={styles.flex}>
                  <View style={styles.profileHead}>
                    <AppText variant="smallStrong">나에 대해 알려주세요</AppText>
                    <StagePill label="1분" style={styles.profilePill} />
                  </View>
                  <AppText variant="caption" color="textSecondary">
                    추구미·목표·자기소개를 적으면 더 「나다운」 답장이 나와요
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
  captureCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Stage.card,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  captureIcon: { width: 48, height: 48, borderRadius: 16, backgroundColor: palette.rose600, alignItems: 'center', justifyContent: 'center' },
  captureTitle: { fontSize: 17, fontWeight: '900', color: Stage.cardText, letterSpacing: -0.3 },
  captureBody: { fontSize: 13, fontWeight: '600', color: '#7A6A6C', marginTop: 2 },
  quickRow: { flexDirection: 'row', gap: Spacing.sm },
  quick: { flex: 1, borderRadius: Radius.md, backgroundColor: Stage.chip, borderWidth: 1, borderColor: Stage.chipBorder, paddingVertical: 10, alignItems: 'center' },
  quickText: { fontSize: 13, fontWeight: '800', color: Stage.text },
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
