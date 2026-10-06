import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { SignupCard } from '@/components/auth/signup-card';
import { AppText } from '@/components/ui/app-text';
import { Screen } from '@/components/ui/screen';
import { useToast } from '@/components/ui/toast';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { track } from '@/lib/analytics';
import { SIGNUP_BONUS } from '@/lib/billing/plans';
import { haptic } from '@/lib/haptics';

const PERKS: { icon: keyof typeof Ionicons.glyphMap; title: string; body: string }[] = [
  { icon: 'gift-outline', title: `무료 코칭 ${SIGNUP_BONUS}회 보너스`, body: '가입하자마자 바로 받아요' },
  { icon: 'sunny-outline', title: '매일 무료 코칭 1회', body: '하루가 지나면 다시 충전돼요' },
  { icon: 'lock-closed-outline', title: '대화는 그대로 내 기기에', body: '캡처와 채팅방은 지금처럼 이 기기에만 저장돼요' },
];

/** 회원가입 화면 (마이 탭 등에서 연다). 무료 횟수가 끝났을 때는 결제 화면에 같은 가입 카드가 나온다 */
export default function Signup() {
  const theme = useTheme();
  const router = useRouter();
  const toast = useToast();

  useEffect(() => {
    track('signup_open');
  }, []);

  const close = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)'));

  return (
    <Screen safeTop safeBottom contentStyle={styles.content}>
      <View style={styles.topBar}>
        <Pressable accessibilityRole="button" accessibilityLabel="닫기" onPress={close} hitSlop={12} style={[styles.close, { backgroundColor: theme.surface }]}>
          <Ionicons name="close" size={20} color={theme.textSecondary} />
        </Pressable>
      </View>

      <View style={[styles.perks, { backgroundColor: theme.surface }]}>
        {PERKS.map((p) => (
          <View key={p.title} style={styles.perk}>
            <View style={[styles.perkIcon, { backgroundColor: theme.primarySoft }]}>
              <Ionicons name={p.icon} size={18} color={theme.primary} />
            </View>
            <View style={styles.perkTexts}>
              <AppText variant="smallStrong">{p.title}</AppText>
              <AppText variant="caption" color="textSecondary">
                {p.body}
              </AppText>
            </View>
          </View>
        ))}
      </View>

      <SignupCard
        onDone={(result) => {
          haptic.celebrate();
          close();
          // 모달을 닫은 뒤라 이 토스트는 보인다
          toast.show(result.bonus ? `가입 완료! 무료 코칭 ${SIGNUP_BONUS}회를 받았어요 🎁` : '로그인했어요.', 'success');
        }}
      />

      <Pressable accessibilityRole="button" onPress={close} hitSlop={8} style={styles.later}>
        <AppText variant="caption" color="textSecondary">
          나중에 할게요
        </AppText>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: Spacing.xl, paddingBottom: Spacing.xl },
  topBar: { flexDirection: 'row', justifyContent: 'flex-end' },
  close: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  perks: { borderRadius: Radius.lg, padding: Spacing.lg, gap: Spacing.lg },
  perk: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  perkIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  perkTexts: { flex: 1, gap: 2 },
  later: { alignSelf: 'center' },
});
