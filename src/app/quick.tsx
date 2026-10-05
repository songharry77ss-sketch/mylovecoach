import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { AppText } from '@/components/ui/app-text';
import { Avatar } from '@/components/ui/avatar';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Screen } from '@/components/ui/screen';
import { useToast } from '@/components/ui/toast';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { haptic } from '@/lib/haptics';
import { pickImage } from '@/lib/images';
import { sortCrushes, useAppStore } from '@/store/app-store';

const SECRET = '__secret';

/**
 * 빠른 코칭 — 플로팅 버블(안드로이드)이나 아이폰 「뒷면 탭」 단축어로 바로 여는 화면.
 * 방금 찍은 캡처나 복사한 대화를 골라 상대를 탭하면 바로 코칭이 시작된다.
 */
export default function QuickCoach() {
  const theme = useTheme();
  const router = useRouter();
  const toast = useToast();
  const crushMap = useAppStore((s) => s.crushes);
  const crushes = useMemo(() => sortCrushes(crushMap).filter((c) => !c.secret), [crushMap]);
  const [target, setTarget] = useState<string>(crushes[0]?.id ?? SECRET);
  const [busy, setBusy] = useState(false);
  const [guide, setGuide] = useState(false);

  /** 고른 상대(없으면 새로 만든 기본 채팅방 / 비밀 상담) 채팅방 id */
  const resolveTarget = () => {
    const s = useAppStore.getState();
    if (target === SECRET) return s.createSecretChat();
    if (s.crushes[target]) return target;
    return s.quickStart();
  };

  const withCapture = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const picked = await pickImage('screenshot');
      if (!picked) return;
      haptic.thud();
      const id = resolveTarget();
      router.replace({ pathname: '/crush/[id]', params: { id, pendingImage: picked.uri, pendingWidth: String(picked.width) } });
    } catch (e) {
      toast.show(e instanceof Error ? e.message : '사진을 불러오지 못했어요.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const withClipboard = async () => {
    const text = (await Clipboard.getStringAsync().catch(() => ''))?.trim();
    if (!text) {
      haptic.warning();
      toast.show('복사한 글이 없어요. 카톡에서 대화를 길게 눌러 복사해 주세요.', 'error');
      return;
    }
    haptic.thud();
    const id = resolveTarget();
    router.replace({ pathname: '/crush/[id]', params: { id, pendingText: `상대와 나눈 대화예요. 분석하고 답장을 추천해줘:\n${text.slice(0, 700)}` } });
  };

  return (
    <Screen contentStyle={styles.content}>
      <AppText variant="title2">누구와의 대화예요?</AppText>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.targets} style={styles.targetsWrap}>
        {crushes.map((c) => {
          const on = target === c.id;
          return (
            <PressableScale key={c.id} feedback="select" onPress={() => setTarget(c.id)} style={[styles.target, { backgroundColor: on ? theme.primarySoft : theme.surface, borderColor: on ? theme.primary : 'transparent' }]}>
              <Avatar name={c.name} uri={c.photoUri} size={40} seed={c.id} />
              <AppText variant="caption" color={on ? 'primary' : 'textSecondary'} numberOfLines={1}>
                {c.name}
              </AppText>
            </PressableScale>
          );
        })}
        <PressableScale feedback="select" onPress={() => setTarget(SECRET)} style={[styles.target, { backgroundColor: target === SECRET ? theme.primarySoft : theme.surface, borderColor: target === SECRET ? theme.primary : 'transparent' }]}>
          <View style={[styles.secretAvatar, { backgroundColor: theme.text }]}>
            <AppText style={styles.secretEmoji}>🕶️</AppText>
          </View>
          <AppText variant="caption" color={target === SECRET ? 'primary' : 'textSecondary'}>
            비밀 상담
          </AppText>
        </PressableScale>
      </ScrollView>

      <Animated.View entering={FadeInDown.duration(260)}>
        <PressableScale onPress={withCapture} disabled={busy} style={[styles.big, { backgroundColor: theme.primary }]}>
          <Ionicons name="image" size={26} color={theme.primaryText} />
          <View style={styles.flex}>
            <AppText variant="title3" color={theme.primaryText}>
              {busy ? '사진 여는 중…' : '방금 찍은 캡처 올리기'}
            </AppText>
            <AppText variant="caption" color={theme.primaryText}>
              고르자마자 바로 분석을 시작해요
            </AppText>
          </View>
        </PressableScale>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(80).duration(260)}>
        <PressableScale onPress={withClipboard} style={[styles.big, { backgroundColor: theme.surface }]}>
          <Ionicons name="clipboard-outline" size={26} color={theme.primary} />
          <View style={styles.flex}>
            <AppText variant="title3">복사한 대화 붙여넣기</AppText>
            <AppText variant="caption" color="textSecondary">
              카톡에서 메시지를 길게 눌러 복사했다면 이걸로
            </AppText>
          </View>
        </PressableScale>
      </Animated.View>

      {Platform.OS === 'ios' ? (
        <View style={[styles.guide, { backgroundColor: theme.surface }]}>
          <PressableScale feedback="select" onPress={() => setGuide((v) => !v)} style={styles.guideHead}>
            <AppText variant="smallStrong" style={styles.flex}>
              📱 아이폰 뒷면을 두 번 톡 치면 이 화면이 열리게 하기
            </AppText>
            <Ionicons name={guide ? 'chevron-up' : 'chevron-down'} size={16} color={theme.textTertiary} />
          </PressableScale>
          {guide ? (
            <AppText variant="caption" color="textSecondary">
              1. 「단축어」 앱 → + → 「URL 열기」 추가 → 주소에 mylovecoach://quick 입력 → 이름 「연애코치 빠른 코칭」으로 저장{'\n'}
              2. 설정 → 손쉬운 사용 → 터치 → 뒷면 탭 → 이중 탭 → 방금 만든 단축어 선택{'\n'}
              이제 카톡을 보다가 폰 뒷면을 두 번 톡 치면 바로 여기로 와요.
            </AppText>
          ) : null}
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: Spacing.lg, paddingTop: Spacing.lg },
  flex: { flex: 1 },
  targetsWrap: { marginHorizontal: -Spacing.lg, flexGrow: 0 },
  targets: { gap: Spacing.sm, paddingHorizontal: Spacing.lg },
  target: { width: 76, alignItems: 'center', gap: 4, paddingVertical: Spacing.sm, borderRadius: Radius.md, borderWidth: 1.5 },
  secretAvatar: { width: 40, height: 40, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  secretEmoji: { fontSize: 18, lineHeight: 22 },
  big: { flexDirection: 'row', alignItems: 'center', gap: Spacing.lg, borderRadius: Radius.xl, padding: Spacing.xl },
  guide: { borderRadius: Radius.lg, padding: Spacing.lg, gap: Spacing.sm },
  guideHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
});
