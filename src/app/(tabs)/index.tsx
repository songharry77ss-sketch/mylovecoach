import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useEffect, useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';

import { CrushListItem } from '@/components/crush/crush-list-item';
import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Screen } from '@/components/ui/screen';
import { SectionHeader } from '@/components/ui/section-header';
import { Radius, Spacing, palette } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { APP_CONFIG } from '@/lib/config';
import { isDemoMode } from '@/lib/demo';
import { haptic } from '@/lib/haptics';
import { sortCrushes, useAppStore } from '@/store/app-store';

const TILES: { key: string; emoji: string; title: string; body: string; colors: [string, string]; href: '/(tabs)/practice' | '/(tabs)/tips' | '/kkti' | 'secret' }[] = [
  { key: 'practice', emoji: '🎮', title: '연애 연습', body: 'AI 상대와 카톡 리허설', colors: [palette.lavender100, palette.sky100], href: '/(tabs)/practice' },
  { key: 'mind', emoji: '🔮', title: '속마음 카드', body: '그 사람은 무슨 생각일까', colors: [palette.pink100, palette.peach100], href: '/(tabs)/tips' },
  { key: 'secret', emoji: '🕶️', title: '비밀 상담', body: '기록이 남지 않아요', colors: [palette.gray100, palette.sky50], href: 'secret' },
  { key: 'kkti', emoji: '🧪', title: 'KKTI 테스트', body: '카톡 속 진짜 연애 MBTI', colors: [palette.mint100, palette.yellow100], href: '/kkti' },
];

export default function HomeScreen() {
  const theme = useTheme();
  const router = useRouter();
  const user = useAppStore((s) => s.user);
  const crushMap = useAppStore((s) => s.crushes);
  const crushes = useMemo(() => sortCrushes(crushMap).filter((c) => !c.secret), [crushMap]);
  const messages = useAppStore((s) => s.messages);
  const hasApiKey = useAppStore((s) => s.hasApiKey);
  const hidePreviews = useAppStore((s) => s.hidePreviews);
  const createSecretChat = useAppStore((s) => s.createSecretChat);
  const profileThin = !user?.about?.trim() && !user?.vibes?.length && !user?.goal;
  const hottest = crushes.reduce<number>((m, c) => Math.max(m, c.heat ?? 0), 0);

  // 「+」 버튼이 은은하게 숨 쉬듯 커졌다 작아진다
  const pulse = useSharedValue(1);
  useEffect(() => {
    pulse.value = withRepeat(withSequence(withTiming(1.08, { duration: 900 }), withTiming(1, { duration: 900 })), -1);
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

  const openTile = (href: (typeof TILES)[number]['href']) => {
    if (href === 'secret') {
      const id = createSecretChat();
      router.push({ pathname: '/crush/[id]', params: { id } });
      return;
    }
    router.push(href);
  };

  return (
    <Screen safeTop>
      <View style={styles.header}>
        <View style={styles.headerTexts}>
          <AppText variant="display">{user?.name?.trim() ? `${user.name.trim()}님,` : '안녕하세요,'}</AppText>
          <AppText variant="title2" color="textSecondary">
            {hottest >= 50 ? `온도 ${hottest}°, 분위기 좋아요 🔥` : '오늘은 누구와 대화할까요?'}
          </AppText>
        </View>
        <Animated.View style={pulseStyle}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="새 채팅방"
            onPress={() => {
              haptic.thud();
              router.push('/crush/new');
            }}
            style={[styles.addBtn, { backgroundColor: theme.primary }]}>
            <Ionicons name="add" size={26} color={theme.primaryText} />
          </Pressable>
        </Animated.View>
      </View>

      <View style={styles.tiles}>
        {TILES.map((t, i) => (
          <Animated.View key={t.key} entering={FadeInDown.delay(50 * i).duration(280)} style={styles.tileSlot}>
            <PressableScale onPress={() => openTile(t.href)} pressedScale={0.94}>
              <LinearGradient colors={t.colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.tile}>
                <AppText style={styles.tileEmoji}>{t.emoji}</AppText>
                <AppText variant="smallStrong" color={palette.gray900}>
                  {t.title}
                </AppText>
                <AppText variant="caption" color={palette.gray700} numberOfLines={1}>
                  {t.body}
                </AppText>
              </LinearGradient>
            </PressableScale>
          </Animated.View>
        ))}
      </View>

      {profileThin ? (
        <Animated.View entering={FadeInDown.delay(250)}>
          <PressableScale onPress={() => router.push('/settings/profile')} style={[styles.profileCard, { backgroundColor: theme.accentSoft }]}>
            <AppText style={styles.profileEmoji}>🪞</AppText>
            <View style={styles.flex}>
              <AppText variant="smallStrong">나에 대해 알려주세요</AppText>
              <AppText variant="caption" color="textSecondary">
                추구미·목표·자기소개를 적으면 더 「나다운」 답장이 나와요
              </AppText>
            </View>
            <Ionicons name="chevron-forward" size={18} color={theme.textTertiary} />
          </PressableScale>
        </Animated.View>
      ) : null}

      {crushes.length === 0 ? (
        <EmptyState
          emoji="💬"
          title="첫 채팅방을 만들어볼까요?"
          description="마음에 두고 있는 사람의 이름과 MBTI, 부르는 호칭을 등록하면 그 사람에게 맞춘 코칭을 받을 수 있어요."
          actionTitle="채팅방 만들기"
          onAction={() => router.push('/crush/new')}
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
          <Button title="새 채팅방 만들기" variant="soft" onPress={() => router.push('/crush/new')} style={styles.bottomBtn} />
        </>
      )}
      {!isDemoMode && !APP_CONFIG.apiSameOrigin && !process.env.EXPO_PUBLIC_API_URL && !hasApiKey ? (
        <Pressable accessibilityRole="button" onPress={() => router.push('/settings/api-key')} style={[styles.notice, { backgroundColor: theme.accentSoft }]}>
          <Ionicons name="key-outline" size={18} color={theme.accent} />
          <AppText variant="small" color="accent" style={styles.flex}>
            AI 코치가 아직 연결되지 않았어요. 탭해서 연결하기
          </AppText>
        </Pressable>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginTop: Spacing.sm, marginBottom: Spacing.lg },
  headerTexts: { gap: 2, flex: 1 },
  addBtn: { width: 48, height: 48, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -Spacing.xs },
  tileSlot: { width: '50%', padding: Spacing.xs },
  tile: { borderRadius: Radius.lg, padding: Spacing.md, gap: 2, minHeight: 104 },
  tileEmoji: { fontSize: 28, lineHeight: 34, marginBottom: 2 },
  profileCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, borderRadius: Radius.lg, padding: Spacing.lg, marginTop: Spacing.md },
  profileEmoji: { fontSize: 28, lineHeight: 34 },
  list: { gap: Spacing.md },
  bottomBtn: { marginTop: Spacing.xl },
  notice: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.lg, borderRadius: Radius.md, marginTop: Spacing.xl },
});
