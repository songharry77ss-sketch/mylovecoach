import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { CrushListItem } from '@/components/crush/crush-list-item';
import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Screen } from '@/components/ui/screen';
import { SectionHeader } from '@/components/ui/section-header';
import { Radius, Spacing, palette } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { APP_CONFIG } from '@/lib/config';
import { isDemoMode } from '@/lib/demo';
import { sortCrushes, useAppStore } from '@/store/app-store';

export default function HomeScreen() {
  const theme = useTheme();
  const router = useRouter();
  const user = useAppStore((s) => s.user);
  const crushMap = useAppStore((s) => s.crushes);
  const crushes = useMemo(() => sortCrushes(crushMap), [crushMap]);
  const messages = useAppStore((s) => s.messages);
  const hasApiKey = useAppStore((s) => s.hasApiKey);

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

  return (
    <Screen safeTop>
      <View style={styles.header}>
        <View style={styles.headerTexts}>
          <AppText variant="display">
            {user?.name?.trim() ? `${user.name.trim()}님,` : '안녕하세요,'}
          </AppText>
          <AppText variant="title2" color="textSecondary">
            오늘은 누구와 대화할까요?
          </AppText>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="새 채팅방" onPress={() => router.push('/crush/new')} style={[styles.addBtn, { backgroundColor: theme.primary }]}>
          <Ionicons name="add" size={26} color={theme.primaryText} />
        </Pressable>
      </View>

      <LinearGradient colors={[palette.sky100, palette.pink100]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.banner}>
        <View style={styles.bannerTexts}>
          <AppText variant="title3" color={palette.gray900}>
            캡처 한 장이면 충분해요
          </AppText>
          <AppText variant="small" color={palette.gray700}>
            채팅방에 대화 캡처를 올리면 답장 3개와 호감 온도를 알려드려요.
          </AppText>
        </View>
        <AppText style={styles.bannerEmoji}>💌</AppText>
      </LinearGradient>

      {crushes.length === 0 ? (
        <EmptyState
          emoji="💘"
          title="첫 채팅방을 만들어볼까요?"
          description="마음에 두고 있는 사람의 이름과 MBTI를 등록하면 그 사람에게 맞춘 코칭을 받을 수 있어요."
          actionTitle="채팅방 만들기"
          onAction={() => router.push('/crush/new')}
        />
      ) : (
        <>
          <SectionHeader title="채팅방" subtitle={`${crushes.length}명과 대화 중`} />
          <View style={styles.list}>
            {crushes.map((c) => (
              <CrushListItem key={c.id} crush={c} lastPreview={previewFor(c.id)} onPress={() => router.push({ pathname: '/crush/[id]', params: { id: c.id } })} />
            ))}
          </View>
          <Button title="새 채팅방 만들기" variant="soft" onPress={() => router.push('/crush/new')} style={styles.bottomBtn} />
        </>
      )}
      {!isDemoMode && !APP_CONFIG.apiSameOrigin && !process.env.EXPO_PUBLIC_API_URL && !hasApiKey ? (
        <Pressable accessibilityRole="button" onPress={() => router.push('/settings/api-key')} style={[styles.notice, { backgroundColor: theme.accentSoft }]}>
          <Ionicons name="key-outline" size={18} color={theme.accent} />
          <AppText variant="small" color="accent" style={styles.noticeText}>
            AI 코치가 아직 연결되지 않았어요. 탭해서 연결하기
          </AppText>
        </Pressable>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginTop: Spacing.sm, marginBottom: Spacing.xl },
  headerTexts: { gap: 2 },
  addBtn: { width: 48, height: 48, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  banner: { borderRadius: Radius.lg, padding: Spacing.lg, flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  bannerTexts: { flex: 1, gap: 4 },
  bannerEmoji: { fontSize: 40, lineHeight: 48 },
  list: { gap: Spacing.md },
  bottomBtn: { marginTop: Spacing.xl },
  notice: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.lg, borderRadius: Radius.md, marginTop: Spacing.xl },
  noticeText: { flex: 1 },
});
