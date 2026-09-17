import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, Platform, Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { useToast } from '@/components/ui/toast';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { billingSupported, loadPlanProducts, purchasePlan, restorePremium, type PlanProduct } from '@/lib/billing/iap';
import { FALLBACK_PRICES, PRODUCT_IDS, type PlanKey } from '@/lib/billing/plans';
import { isPremiumActive } from '@/lib/billing/quota';
import { APP_CONFIG } from '@/lib/config';
import { useAppStore } from '@/store/app-store';

type Reason = 'quota' | 'regenerate' | 'my' | 'banner';

const HEADLINES: Record<Reason, { title: string; subtitle: string }> = {
  quota: { title: '오늘의 무료 코칭을\n다 썼어요', subtitle: '프리미엄이면 기다리지 않고 바로 이어서 코칭받을 수 있어요.' },
  regenerate: { title: '마음에 드는 답장이\n나올 때까지', subtitle: '프리미엄이면 다른 답장도 횟수 제한 없이 받아볼 수 있어요.' },
  my: { title: '답장 고민,\n이제 무제한으로', subtitle: '횟수 걱정 없이 필요한 순간마다 코치를 불러보세요.' },
  banner: { title: '답장 고민,\n이제 무제한으로', subtitle: '횟수 걱정 없이 필요한 순간마다 코치를 불러보세요.' },
};

const BENEFITS: { icon: keyof typeof Ionicons.glyphMap; title: string; body: string }[] = [
  { icon: 'infinite-outline', title: '코칭 무제한', body: '하루 횟수 제한 없이 캡처를 올리고 답장을 받아요' },
  { icon: 'refresh-outline', title: '다른 답장 더 보기 무제한', body: '마음에 쏙 드는 답장이 나올 때까지 다시 받아요' },
  { icon: 'chatbubbles-outline', title: '모든 채팅방에서', body: '썸, 소개팅, 연인까지 상대가 몇 명이든 그대로 적용돼요' },
];

/** 웹에서 결제 화면 모양을 확인·캡처하기 위한 개발용 플래그 (실제 결제는 되지 않음) */
const showPlans = billingSupported || process.env.EXPO_PUBLIC_PAYWALL_PREVIEW === '1';

const DEFAULT_PRODUCTS: PlanProduct[] = [
  { plan: 'lifetime', productId: PRODUCT_IDS.lifetime, displayPrice: FALLBACK_PRICES.lifetime },
  { plan: 'weekly', productId: PRODUCT_IDS.weekly, displayPrice: FALLBACK_PRICES.weekly },
];

export default function Paywall() {
  const theme = useTheme();
  const router = useRouter();
  const toast = useToast();
  const params = useLocalSearchParams<{ reason?: string }>();
  const reason: Reason = params.reason && params.reason in HEADLINES ? (params.reason as Reason) : 'my';
  const premium = useAppStore((s) => s.premium);
  const setPremium = useAppStore((s) => s.setPremium);

  const [products, setProducts] = useState<PlanProduct[]>(DEFAULT_PRODUCTS);
  const [selected, setSelected] = useState<PlanKey>('lifetime');
  const [busy, setBusy] = useState<'purchase' | 'restore' | null>(null);

  useEffect(() => {
    let alive = true;
    loadPlanProducts().then((list) => alive && setProducts(list));
    return () => {
      alive = false;
    };
  }, []);

  const close = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)'));
  const priceOf = (plan: PlanKey) => products.find((p) => p.plan === plan)?.displayPrice ?? FALLBACK_PRICES[plan];
  const active = isPremiumActive(premium, Date.now());
  const storeName = Platform.OS === 'ios' ? 'App Store' : 'Google Play';

  const buy = async () => {
    const product = products.find((p) => p.plan === selected);
    if (!product || busy) return;
    setBusy('purchase');
    const outcome = await purchasePlan(product);
    setBusy(null);
    if (outcome.status === 'purchased') {
      setPremium(outcome.premium);
      toast.show('프리미엄이 시작됐어요. 이제 무제한으로 코칭받아요 💘', 'success');
      close();
    } else if (outcome.status === 'pending') {
      toast.show('결제 승인을 기다리고 있어요. 승인되면 자동으로 적용돼요.');
    } else if (outcome.status === 'error') {
      toast.show(outcome.message, 'error');
    }
  };

  const restore = async () => {
    if (busy) return;
    setBusy('restore');
    const result = await restorePremium();
    setBusy(null);
    if (result) {
      setPremium(result);
      toast.show('구매 내역을 복원했어요.', 'success');
      close();
    } else {
      toast.show(result === null ? '복원할 구매 내역이 없어요.' : '스토어에 연결하지 못했어요. 잠시 후 다시 시도해주세요.', result === null ? 'default' : 'error');
    }
  };

  const headline = HEADLINES[reason];

  return (
    <Screen safeTop safeBottom contentStyle={styles.content}>
      <View style={styles.topBar}>
        <Pressable accessibilityRole="button" accessibilityLabel="닫기" onPress={close} hitSlop={12} style={[styles.close, { backgroundColor: theme.surface }]}>
          <Ionicons name="close" size={20} color={theme.textSecondary} />
        </Pressable>
      </View>

      <View style={styles.hero}>
        <View style={[styles.heroBadge, { backgroundColor: theme.accentSoft }]}>
          <AppText style={styles.heroEmoji}>💘</AppText>
        </View>
        <AppText variant="title1" align="center">
          {active ? '프리미엄 이용 중이에요' : headline.title}
        </AppText>
        <AppText variant="body" color="textSecondary" align="center">
          {active ? (premium?.plan === 'lifetime' ? '평생권으로 모든 기능을 무제한으로 쓰고 있어요.' : '주간 구독으로 모든 기능을 무제한으로 쓰고 있어요.') : headline.subtitle}
        </AppText>
      </View>

      <View style={[styles.benefits, { backgroundColor: theme.surface }]}>
        {BENEFITS.map((b) => (
          <View key={b.title} style={styles.benefit}>
            <View style={[styles.benefitIcon, { backgroundColor: theme.primarySoft }]}>
              <Ionicons name={b.icon} size={18} color={theme.primary} />
            </View>
            <View style={styles.benefitTexts}>
              <AppText variant="smallStrong">{b.title}</AppText>
              <AppText variant="caption" color="textSecondary">
                {b.body}
              </AppText>
            </View>
          </View>
        ))}
      </View>

      {active ? (
        <Button title="확인" onPress={close} />
      ) : showPlans ? (
        <>
          <View style={styles.plans}>
            <PlanCard
              selected={selected === 'lifetime'}
              onPress={() => setSelected('lifetime')}
              title="평생권"
              price={priceOf('lifetime')}
              caption="한 번 결제하면 계속 · 자동 결제 없음"
              badge="주간 구독 약 3주 가격"
            />
            <PlanCard selected={selected === 'weekly'} onPress={() => setSelected('weekly')} title="주간 구독" price={`${priceOf('weekly')} / 주`} caption="매주 자동 갱신 · 언제든 해지" />
          </View>

          <Button title={selected === 'lifetime' ? `평생권 ${priceOf('lifetime')} 결제하기` : `주간 구독 시작하기 · ${priceOf('weekly')}/주`} onPress={buy} loading={busy === 'purchase'} disabled={busy != null} />

          <AppText variant="caption" color="textTertiary" align="center" style={styles.fine}>
            {selected === 'weekly'
              ? `주간 구독은 해지하지 않으면 매주 ${priceOf('weekly')}이 ${storeName} 계정으로 자동 결제돼요. 현재 기간이 끝나기 24시간 전까지 ${storeName} 계정 설정의 구독 메뉴에서 언제든 해지할 수 있어요.`
              : `평생권은 ${priceOf('lifetime')} 1회 결제이며 자동으로 다시 결제되지 않아요. 같은 ${storeName} 계정이면 기기를 바꿔도 「구매 복원」으로 다시 쓸 수 있어요.`}
          </AppText>
        </>
      ) : (
        <View style={[styles.webNotice, { backgroundColor: theme.primarySoft }]}>
          <AppText variant="smallStrong" align="center">
            프리미엄은 앱에서 시작할 수 있어요
          </AppText>
          <AppText variant="caption" color="textSecondary" align="center">
            iPhone · Android 앱에서 평생권 {FALLBACK_PRICES.lifetime} 또는 주간 구독 {FALLBACK_PRICES.weekly}/주로 이용할 수 있어요. 웹에서는 매일 무료 코칭이 충전돼요.
          </AppText>
        </View>
      )}

      <View style={styles.links}>
        {showPlans && !active ? (
          <Pressable accessibilityRole="button" onPress={restore} hitSlop={8} disabled={busy != null}>
            <AppText variant="caption" color="textSecondary">
              {busy === 'restore' ? '복원 중…' : '구매 복원'}
            </AppText>
          </Pressable>
        ) : null}
        <Pressable accessibilityRole="link" onPress={() => Linking.openURL(APP_CONFIG.termsUrl)} hitSlop={8}>
          <AppText variant="caption" color="textSecondary">
            이용약관
          </AppText>
        </Pressable>
        <Pressable accessibilityRole="link" onPress={() => Linking.openURL(APP_CONFIG.privacyUrl)} hitSlop={8}>
          <AppText variant="caption" color="textSecondary">
            개인정보 처리방침
          </AppText>
        </Pressable>
      </View>
    </Screen>
  );
}

interface PlanCardProps {
  selected: boolean;
  onPress: () => void;
  title: string;
  price: string;
  caption: string;
  badge?: string;
}

function PlanCard({ selected, onPress, title, price, caption, badge }: PlanCardProps) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.plan, { borderColor: selected ? theme.primary : theme.border, backgroundColor: selected ? theme.primarySoft : theme.background }]}>
      <View style={[styles.radio, { borderColor: selected ? theme.primary : theme.textTertiary }]}>{selected ? <View style={[styles.radioDot, { backgroundColor: theme.primary }]} /> : null}</View>
      <View style={styles.planTexts}>
        <View style={styles.planTitleRow}>
          <AppText variant="bodyStrong">{title}</AppText>
          {badge ? (
            <View style={[styles.badge, { backgroundColor: theme.accent }]}>
              <AppText variant="caption" color="#FFFFFF">
                {badge}
              </AppText>
            </View>
          ) : null}
        </View>
        <AppText variant="caption" color="textSecondary">
          {caption}
        </AppText>
      </View>
      <AppText variant="bodyStrong">{price}</AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { gap: Spacing.xl, paddingBottom: Spacing.xl },
  topBar: { flexDirection: 'row', justifyContent: 'flex-end' },
  close: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  hero: { alignItems: 'center', gap: Spacing.sm },
  heroBadge: { width: 72, height: 72, borderRadius: 28, alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.sm },
  heroEmoji: { fontSize: 36, lineHeight: 44 },
  benefits: { borderRadius: Radius.lg, padding: Spacing.lg, gap: Spacing.lg },
  benefit: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  benefitIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  benefitTexts: { flex: 1, gap: 2 },
  plans: { gap: Spacing.sm },
  plan: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, borderWidth: 1.5, borderRadius: Radius.lg, padding: Spacing.lg },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 10, height: 10, borderRadius: 5 },
  planTexts: { flex: 1, gap: 2 },
  planTitleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flexWrap: 'wrap' },
  badge: { paddingHorizontal: Spacing.sm, paddingVertical: 2, borderRadius: Radius.pill },
  fine: { marginTop: -Spacing.sm },
  webNotice: { borderRadius: Radius.lg, padding: Spacing.lg, gap: Spacing.xs },
  links: { flexDirection: 'row', justifyContent: 'center', gap: Spacing.lg, flexWrap: 'wrap' },
});
