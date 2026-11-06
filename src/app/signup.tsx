import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { SignupCard } from '@/components/auth/signup-card';
import { BigNumber, BrandGradient, BrandPill, Icon3D, ResearchBadge, SenditLogo } from '@/components/brand/brand';
import { useCelebrate } from '@/components/fx/celebration';
import { AppText } from '@/components/ui/app-text';
import { Screen } from '@/components/ui/screen';
import { useToast } from '@/components/ui/toast';
import { Brand, BrandShadow, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { track } from '@/lib/analytics';
import { FREE_DAILY, SIGNUP_BONUS } from '@/lib/billing/plans';
import { haptic } from '@/lib/haptics';
import { useAppStore } from '@/store/app-store';

type Perk = { icon: keyof typeof Ionicons.glyphMap; title: string; body: string };

const PERKS: Perk[] = [{ icon: 'sunny-outline', title: `매일 무료 코칭 ${FREE_DAILY}회`, body: '하루가 지나면 다시 충전돼요' }];

const REPLIES_PERK: Perk = { icon: 'lock-open-outline', title: '가려진 답장이 바로 보여요', body: '지금 받은 답장의 나머지 버전과 이유까지 전부 열려요' };

/** 저장 위치 안내 — 「코칭 내용 저장」에 동의한 기기는 코칭 질문·답이 서버에도 저장되고 회원과 연결된다 (처리방침 4번·5번) */
const storagePerk = (contentOn: boolean): Perk => ({
  icon: 'lock-closed-outline',
  title: '캡처와 채팅방은 내 기기에',
  body: contentOn ? '코칭 내용 저장에 동의해 둬서 코칭 질문·답은 서버에도 보관되고 회원과 연결돼요' : '가입해도 지금처럼 이 기기에만 저장돼요',
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
        <Pressable accessibilityRole="button" accessibilityLabel="닫기" onPress={close} hitSlop={8} style={[styles.close, { backgroundColor: theme.surface }]}>
          <Ionicons name="close" size={20} color={theme.textSecondary} />
        </Pressable>
      </View>

      <Animated.View entering={FadeInDown.duration(320)} style={styles.head}>
        <Text accessibilityRole="header" style={[styles.headline, { color: theme.text }]}>
          {forReplies ? '가입하면\n' : '가입하고\n'}
          <Text style={{ color: theme.primary }}>{forReplies ? '나머지 답장이 열려요' : `무료 코칭 ${SIGNUP_BONUS}회 더`}</Text>
        </Text>
        <AppText variant="body" color="textSecondary">
          쓰던 계정으로 간편하게 가입해요.
        </AppText>
        <ResearchBadge style={styles.badge} />
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(60).duration(320)} style={[styles.heroOuter, BrandShadow]}>
        <BrandGradient colors={[Brand.blue, Brand.violet]} style={styles.hero}>
          <View pointerEvents="none" style={styles.heroGlow} />
          <BrandPill tone="glass" icon="gift-outline" label="가입 보너스" />
          <View style={styles.heroRow}>
            <View style={styles.flex}>
              <BigNumber tone="white" value={`+${SIGNUP_BONUS}`} unit="회" style={styles.heroNumber} />
              <Text style={styles.heroText}>가입하자마자 바로 받아요</Text>
            </View>
            <Icon3D name="heart" size={88} float />
          </View>
        </BrandGradient>
      </Animated.View>

      <View style={[styles.perks, { backgroundColor: theme.surface }]}>
        {[...(forReplies ? [REPLIES_PERK] : []), ...PERKS, storagePerk(contentOn)].map((p) => (
          <View key={p.title} style={styles.perk}>
            <View style={[styles.perkIcon, { backgroundColor: theme.primarySoft }]}>
              <Ionicons name={p.icon} size={18} color={theme.primary} />
            </View>
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
          toast.show(result.bonus ? `가입 완료! 무료 코칭 ${SIGNUP_BONUS}회를 받았어요 🎁` : '로그인했어요.', 'success');
        }}
      />

      <Pressable accessibilityRole="button" onPress={close} hitSlop={8} style={styles.later}>
        <AppText variant="small" color="textSecondary">
          나중에 할게요
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
  headline: { fontSize: 28, lineHeight: 37, fontWeight: '900', letterSpacing: -0.9 },
  badge: { marginTop: Spacing.xs },
  heroOuter: { borderRadius: Radius.xl },
  hero: { borderRadius: Radius.xl, overflow: 'hidden', padding: Spacing.xl, gap: Spacing.md },
  heroGlow: { position: 'absolute', width: 220, height: 220, borderRadius: 110, top: -100, right: -60, backgroundColor: 'rgba(138,216,255,0.32)' },
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  heroNumber: { fontSize: 48, lineHeight: 54 },
  heroText: { color: Brand.onBrand, fontSize: 15, lineHeight: 21, fontWeight: '700', letterSpacing: -0.2 },
  perks: { borderRadius: Radius.lg, padding: Spacing.lg, gap: Spacing.lg },
  perk: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  perkIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  later: { alignSelf: 'center', minHeight: 44, justifyContent: 'center', paddingHorizontal: Spacing.lg },
});
