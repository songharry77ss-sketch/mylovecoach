import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { GradientButton } from '@/components/brand/brand';
import { RoomAvatar } from '@/components/crush/crush-list-item';
import { AppText } from '@/components/ui/app-text';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Screen } from '@/components/ui/screen';
import { useToast } from '@/components/ui/toast';
import { APP_NAME } from '@/constants/brand';
import { Brand, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';
import { haptic } from '@/lib/haptics';
import { pickImage } from '@/lib/images';
import { sortCrushes, useAppStore } from '@/store/app-store';

const SECRET = '__secret';
const AVATAR = 44;

/**
 * 빠른 코칭 — 플로팅 버블(안드로이드)이나 아이폰 「뒷면 탭」 단축어로 바로 여는 화면.
 * 방금 찍은 캡처나 복사한 대화를 골라 상대를 탭하면 바로 코칭이 시작된다.
 * 1.4 「깔끔하게」 개편: 빨리 끝내야 하는 화면이라 제목 → 대상(홈과 같은 얼굴 원) → [캡처 올리기] 주 버튼 → [복사한 대화 붙여넣기] 보조 버튼만.
 * 큰 파란 카드·떠다니는 3D 그림·뻔한 부제 둘·대상마다 다른 색 얼굴을 걷었다. 고른 대상은 검정 테두리(Chip 과 같은 결).
 */
export default function QuickCoach() {
  const theme = useTheme();
  const dark = useColorScheme() === 'dark';
  const fill = dark ? theme.surfaceElevated : theme.surface;
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

  const targetStyle = (on: boolean) => [styles.target, { borderColor: on ? theme.text : 'transparent' }];

  return (
    <Screen sheet contentStyle={styles.content}>
      <AppText variant="title1" accessibilityRole="header">
        누구와의 대화예요?
      </AppText>

      {/* 대상 — 홈 「최근 상담」과 같은 얼굴 원. 고르면 얼굴에 검정 테두리 + 이름이 진하게 */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.targets} style={styles.targetsWrap}>
        {crushes.map((c) => {
          const on = target === c.id;
          return (
            <PressableScale key={c.id} feedback="select" accessibilityLabel={c.name} accessibilityState={{ selected: on }} onPress={() => setTarget(c.id)} style={styles.targetItem}>
              <View style={targetStyle(on)}>
                <RoomAvatar crush={c} size={AVATAR} />
              </View>
              <AppText variant="caption" weight={on ? '700' : '500'} color={on ? 'text' : 'textSecondary'} numberOfLines={1}>
                {c.name}
              </AppText>
            </PressableScale>
          );
        })}
        <PressableScale feedback="select" accessibilityLabel="비밀 상담" accessibilityState={{ selected: target === SECRET }} onPress={() => setTarget(SECRET)} style={styles.targetItem}>
          <View style={targetStyle(target === SECRET)}>
            <View style={[styles.secretAvatar, { backgroundColor: fill }]}>
              <Ionicons name="glasses-outline" size={20} color={theme.textSecondary} />
            </View>
          </View>
          <AppText variant="caption" weight={target === SECRET ? '700' : '500'} color={target === SECRET ? 'text' : 'textSecondary'} numberOfLines={1}>
            비밀 상담
          </AppText>
        </PressableScale>
      </ScrollView>

      {/* 이 화면의 주요 행동 하나 — 센딧 파랑 단색 버튼 */}
      <Animated.View entering={FadeInDown.duration(260)} style={styles.actions}>
        <GradientButton
          title="방금 찍은 캡처 올리기"
          accessibilityLabel="방금 찍은 캡처 올리기"
          loading={busy}
          onPress={withCapture}
          icon={<Ionicons name="images-outline" size={19} color={Brand.onBrand} />}
        />
        <PressableScale feedback="tap" pressedScale={0.98} onPress={withClipboard} accessibilityLabel="복사한 대화 붙여넣기" style={[styles.secondary, { backgroundColor: fill }]}>
          <Ionicons name="clipboard-outline" size={18} color={theme.text} />
          <AppText variant="bodyStrong">복사한 대화 붙여넣기</AppText>
        </PressableScale>
      </Animated.View>

      {Platform.OS === 'ios' ? (
        <View style={[styles.guide, { backgroundColor: fill }]}>
          <PressableScale feedback="select" onPress={() => setGuide((v) => !v)} accessibilityState={{ expanded: guide }} style={styles.guideHead}>
            <Ionicons name="phone-portrait-outline" size={18} color={theme.textSecondary} />
            <AppText variant="smallStrong" style={styles.flex}>
              아이폰 뒷면을 두 번 톡 치면 이 화면이 열리게 하기
            </AppText>
            <Ionicons name={guide ? 'chevron-up' : 'chevron-down'} size={16} color={theme.textTertiary} />
          </PressableScale>
          {guide ? (
            <AppText variant="small" color="textSecondary">
              1. 「단축어」 앱 → + → 「URL 열기」 추가 → 주소에 mylovecoach://quick 입력 → 이름 「{APP_NAME} 빠른 코칭」으로 저장{'\n'}
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
  content: { gap: Spacing.xl, paddingTop: Spacing.lg },
  flex: { flex: 1 },
  targetsWrap: { marginHorizontal: -Spacing.lg, flexGrow: 0, marginTop: -Spacing.sm },
  targets: { gap: Spacing.md, paddingHorizontal: Spacing.lg },
  targetItem: { width: 64, alignItems: 'center', gap: 6, paddingVertical: 2 },
  // 고른 얼굴 둘레 — 얼굴과 테두리 사이를 2 띄운다
  target: { padding: 2, borderRadius: (AVATAR + 8) / 2, borderWidth: 2 },
  secretAvatar: { width: AVATAR, height: AVATAR, borderRadius: AVATAR / 2, alignItems: 'center', justifyContent: 'center' },
  actions: { gap: Spacing.sm },
  secondary: { height: 54, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm },
  guide: { borderRadius: 20, padding: Spacing.lg, gap: Spacing.sm },
  guideHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, minHeight: 28 },
});
