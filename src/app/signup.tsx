import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { SignupCard } from '@/components/auth/signup-card';
import { SenditLogo } from '@/components/brand/brand';
import { useCelebrate } from '@/components/fx/celebration';
import { AppText } from '@/components/ui/app-text';
import { Screen } from '@/components/ui/screen';
import { useToast } from '@/components/ui/toast';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { track } from '@/lib/analytics';
import { FREE_DAILY, SIGNUP_BONUS } from '@/lib/billing/plans';
import { haptic } from '@/lib/haptics';
import { L } from '@/lib/i18n';
import { useAppStore } from '@/store/app-store';

type Perk = { icon: keyof typeof Ionicons.glyphMap; title: string; body: string };

const PERKS: Perk[] = L(
  [{ icon: 'sunny-outline', title: `매일 무료 코칭 ${FREE_DAILY}회`, body: '하루가 지나면 다시 충전돼요' }],
  [{ icon: 'sunny-outline', title: `${FREE_DAILY} free ${FREE_DAILY === 1 ? 'session' : 'sessions'} every day`, body: 'Refills every day' }],
);

const REPLIES_PERK: Perk = L(
  { icon: 'lock-open-outline', title: '가려진 답장이 바로 보여요', body: '지금 받은 답장의 나머지 버전과 이유까지 전부 열려요' },
  { icon: 'lock-open-outline', title: 'See the hidden replies now', body: 'Unlock every version of these replies — and why they work' },
);

/** 저장 위치 안내 — 「코칭 내용 저장」에 동의한 기기는 코칭 질문·답이 서버에도 저장되고 회원과 연결된다 (처리방침 4번·5번) */
const storagePerk = (contentOn: boolean): Perk => ({
  icon: 'lock-closed-outline',
  title: L('캡처와 채팅방은 내 기기에', 'Screenshots and chats stay on your phone'),
  body: contentOn
    ? L('코칭 내용 저장에 동의해 둬서 코칭 질문·답은 서버에도 보관되고 회원과 연결돼요', "Since you opted in to saving coaching, your questions and answers are also stored on our server and linked to your account")
    : L('가입해도 지금처럼 이 기기에만 저장돼요', 'Signing up doesn’t change that — they’re saved only on this device'),
});

/** 회원가입 화면 (마이 탭 등에서 연다). 무료 횟수가 끝났을 때는 결제 화면에 같은 가입 카드가 나온다 */
export default function Signup() {
  const theme = useTheme();
  const router = useRouter();
  const toast = useToast();
  const celebrate = useCelebrate();
  const contentOn = useAppStore((s) => s.contentConsent === true);
  // 채팅방에서 가려진 답장을 보려고 왔으면 그 이유를 맨 위에 보여 준다
  const { from } = useLocalSearchParams<{ from?: string }>();
  const forReplies = from === 'replies';

  useEffect(() => {
    track('signup_open', forReplies ? { from: 'replies' } : undefined);
  }, [forReplies]);

  const close = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)'));

  return (
    <Screen sheet safeTop safeBottom contentStyle={styles.content}>
      <View style={styles.topBar}>
        <SenditLogo size="sm" />
        <Pressable accessibilityRole="button" accessibilityLabel={L('닫기', 'Close')} onPress={close} hitSlop={8} style={[styles.close, { backgroundColor: theme.surface }]}>
          <Ionicons name="close" size={20} color={theme.textSecondary} />
        </Pressable>
      </View>

      <Animated.View entering={FadeInDown.duration(320)} style={styles.head}>
        {/* 1.4 개편: 「+3회」 큰 그라데이션 카드·3D 하트·연구진 배지를 걷고 제목 한 문장에 담았다 (제목과 같은 말을 되풀이하던 카드) */}
        <Text accessibilityRole="header" style={[styles.headline, { color: theme.text }]}>
          {forReplies ? L('가입하면 ', 'Sign up to ') : L('가입하고 ', 'Sign up and ')}
          <Text style={{ color: theme.primary }}>
            {forReplies ? L('나머지 답장이 열려요', 'unlock the rest of the replies') : L(`무료 코칭 ${SIGNUP_BONUS}회 더 받기`, `get ${SIGNUP_BONUS} more free sessions`)}
          </Text>
        </Text>
        <AppText variant="body" color="textSecondary">
          {forReplies
            ? L(`가입하자마자 무료 코칭 ${SIGNUP_BONUS}회도 더 드려요. `, `You also get ${SIGNUP_BONUS} more free sessions right away. `)
            : L('가입하자마자 바로 받아요. ', 'They’re yours the moment you sign up. ')}
          {L('쓰던 계정으로 간편하게 가입해요.', 'Just use an account you already have.')}
        </AppText>
      </Animated.View>

      <View style={styles.perks}>
        {[...(forReplies ? [REPLIES_PERK] : []), ...PERKS, storagePerk(contentOn)].map((p) => (
          <View key={p.title} style={styles.perk}>
            <Ionicons name="checkmark" size={18} color={theme.text} style={styles.perkIcon} />
            <View style={styles.flex}>
              <AppText variant="smallStrong">{p.title}</AppText>
              <AppText variant="caption" color="textSecondary">
                {p.body}
              </AppText>
            </View>
          </View>
        ))}
      </View>

      <SignupCard
        heading={false}
        onDone={(result) => {
          haptic.celebrate();
          celebrate({ kind: 'sparkles', count: 22, haptic: false });
          close();
          // 모달을 닫은 뒤라 이 토스트는 보인다
          toast.show(result.bonus ? L(`가입 완료! 무료 코칭 ${SIGNUP_BONUS}회를 받았어요`, `You're in! ${SIGNUP_BONUS} free sessions added`) : L('로그인했어요.', 'Signed in.'), 'success');
        }}
      />

      <Pressable accessibilityRole="button" onPress={close} hitSlop={8} style={styles.later}>
        <AppText variant="small" color="textSecondary">
          {L('나중에 할게요', 'Maybe later')}
        </AppText>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { gap: Spacing.xl, paddingBottom: Spacing.xl },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: -Spacing.sm },
  close: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  head: { gap: Spacing.sm },
  headline: { fontSize: 24, lineHeight: 32, fontWeight: '700', letterSpacing: -0.6 },
  perks: { gap: Spacing.md, paddingHorizontal: 2 },
  perk: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm + 2 },
  perkIcon: { marginTop: 1 },
  later: { alignSelf: 'center', minHeight: 44, justifyContent: 'center', paddingHorizontal: Spacing.lg },
});
