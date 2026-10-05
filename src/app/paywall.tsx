import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Platform, Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { useToast } from '@/components/ui/toast';
import { Radius, Spacing } from '@/constants/theme';
import { onSalePrice, usePlanProducts } from '@/hooks/use-plan-products';
import { useTheme } from '@/hooks/use-theme';
import { track } from '@/lib/analytics';
import { billingSupported, purchasePlan, restorePremium, type PlanProduct } from '@/lib/billing/iap';
import { CREDITS_PER_PACK, FALLBACK_PRICES, PRODUCT_IDS, isConsumablePlan, type PlanKey } from '@/lib/billing/plans';
import { isPremiumActive, quotaLabel, quotaStatus } from '@/lib/billing/quota';
import { haptic } from '@/lib/haptics';
import { APP_CONFIG } from '@/lib/config';
import { useAppStore } from '@/store/app-store';

type Reason = 'quota' | 'regenerate' | 'my' | 'banner' | 'report' | 'practice' | 'mind';

const HEADLINES: Record<Reason, { title: string; subtitle: string }> = {
  // 하루 이용권이 스토어에 있으면 화면에서 가격을 넣은 문구로 바꾼다
  quota: { title: '오늘의 무료 코칭을\n다 썼어요', subtitle: '이용권이면 횟수 제한 없이 지금 바로 이어서 코칭받을 수 있어요.' },
  regenerate: { title: '마음에 드는 답장이\n나올 때까지', subtitle: '이용권이면 다른 버전도 횟수 제한 없이 넘겨 볼 수 있어요.' },
  my: { title: '답장 고민,\n이제 무제한으로', subtitle: '횟수 걱정 없이 필요한 순간마다 코치를 불러보세요.' },
  banner: { title: '답장 고민,\n이제 무제한으로', subtitle: '횟수 걱정 없이 필요한 순간마다 코치를 불러보세요.' },
  report: { title: '그 사람 분석 보고서,\n지금 열어볼까요?', subtitle: '성향·호감 신호·공략법·궁합까지 한 번에 정리해 드려요.' },
  practice: { title: '연애 연습,\n실전처럼 계속해요', subtitle: '이용권이면 AI 상대와 마음껏 리허설할 수 있어요.' },
  mind: { title: '그 사람 속마음,\n더 들여다볼까요?', subtitle: '이용권이면 궁금한 상황을 횟수 걱정 없이 물어볼 수 있어요.' },
};

const BENEFITS: { icon: keyof typeof Ionicons.glyphMap; title: string; body: string }[] = [
  { icon: 'infinite-outline', title: '코칭 무제한', body: '캡처를 올릴 때마다 답장 여러 버전과 호감 온도를 받아요' },
  { icon: 'game-controller-outline', title: '연애 연습 · 속마음 풀이', body: 'AI 상대와 카톡 리허설, 「그 사람 속마음」도 마음껏' },
  { icon: 'analytics-outline', title: '상대 분석 보고서', body: '성향·호감 신호·공략법·궁합을 언제든 새로 분석해요' },
];

const PLAN_TEXT: Record<PlanKey, { title: string; caption: string; badge?: string }> = {
  day: { title: '하루 이용권', caption: '지금부터 24시간 무제한 · 자동 결제 없음', badge: '부담 없이' },
  weekly: { title: '주간 구독', caption: '매주 자동 갱신 · 언제든 해지', badge: '인기' },
  lifetime: { title: '평생권', caption: '한 번 결제하면 계속 · 자동 결제 없음', badge: '주간 구독 3주 가격' },
  credits: { title: `횟수권 ${CREDITS_PER_PACK}회`, caption: '필요할 때만 한 번씩 · 기간 제한 없음' },
};

/** 웹에서 결제 화면 모양을 확인·캡처하기 위한 개발용 플래그: ios | android (실제 결제는 되지 않음) */
const previewStore = process.env.EXPO_PUBLIC_PAYWALL_PREVIEW;
const showPlans = billingSupported || Boolean(previewStore);

const DEFAULT_PRODUCTS: PlanProduct[] = (['day', 'weekly', 'lifetime', 'credits'] as PlanKey[]).map((plan) => ({
  plan,
  productId: PRODUCT_IDS[plan],
  displayPrice: FALLBACK_PRICES[plan],
}));

export default function Paywall() {
  const theme = useTheme();
  const router = useRouter();
  const toast = useToast();
  const params = useLocalSearchParams<{ reason?: string }>();
  const reason: Reason = params.reason && params.reason in HEADLINES ? (params.reason as Reason) : 'my';
  const premium = useAppStore((s) => s.premium);
  const usage = useAppStore((s) => s.usage);
  const wallet = useAppStore((s) => s.wallet);
  const team = useAppStore((s) => s.team);
  const setPremium = useAppStore((s) => s.setPremium);

  // 앱에서는 스토어 응답을 받은 뒤에 상품을 보여 준다 (스토어에 없는 상품이 잠깐이라도 보이지 않도록)
  const storeProducts = usePlanProducts();
  const products = billingSupported && !previewStore ? storeProducts : DEFAULT_PRODUCTS;
  // 지금 막혀서 들어온 사람에게는 가장 가벼운 하루 이용권부터 보여 준다
  const [selected, setSelected] = useState<PlanKey>(reason === 'my' || reason === 'banner' ? 'lifetime' : 'day');
  const [busy, setBusy] = useState<'purchase' | 'restore' | null>(null);
  // 이 화면은 iOS 네이티브 모달이라 앱 전체 토스트가 모달 뒤에 가려진다.
  // 그래서 결제·복원 결과는 버튼 바로 아래에 직접 보여 준다.
  const [notice, setNotice] = useState<{ kind: 'error' | 'info'; text: string } | null>(null);

  useEffect(() => {
    track('paywall_open', { reason });
  }, [reason]);

  const close = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)'));
  const priceOf = (plan: PlanKey) => products?.find((p) => p.plan === plan)?.displayPrice ?? FALLBACK_PRICES[plan];
  // 스토어에서 확인된 상품만 보여 준다. 스토어에 닿지 못했으면 이미 등록된 프리미엄(주간·평생)만 (미리보기·웹은 전부)
  const confirmed = products?.some((p) => p.available === true) ?? false;
  const visible = (products ?? []).filter((p) => previewStore || !billingSupported || (confirmed ? p.available === true : !isConsumablePlan(p.plan)));
  const chosen = visible.some((p) => p.plan === selected) ? selected : (visible[0]?.plan ?? 'lifetime');
  const dayPrice = onSalePrice(products, 'day');
  const subtitle = reason === 'quota' && dayPrice ? `하루 이용권이면 ${dayPrice}으로 지금 바로 이어서 코칭받을 수 있어요.` : HEADLINES[reason].subtitle;
  const active = isPremiumActive(premium, Date.now());
  const status = quotaStatus(premium, usage, Date.now(), wallet, team);
  const storeName = Platform.OS === 'ios' || previewStore === 'ios' ? 'App Store' : 'Google Play';

  const buy = async () => {
    const product = products?.find((p) => p.plan === chosen);
    if (!product || busy) return;
    haptic.thud();
    setBusy('purchase');
    setNotice(null);
    track('purchase_start', { plan: chosen });
    const outcome = await purchasePlan(product);
    setBusy(null);
    track(`purchase_${outcome.status}`, { plan: chosen, ...(outcome.status === 'error' ? { message: outcome.message } : {}) });
    if (outcome.status === 'purchased') {
      setPremium(outcome.premium);
      haptic.celebrate();
      // 모달을 닫은 뒤라 이 토스트는 보인다
      toast.show('프리미엄이 시작됐어요. 이제 무제한으로 코칭받아요 💘', 'success');
      close();
    } else if (outcome.status === 'granted') {
      // 충전은 앱 전체의 결제 이벤트에서 이미 처리됐다 (중복 충전 방지)
      haptic.celebrate();
      toast.show(outcome.plan === 'day' ? '하루 이용권 시작! 24시간 동안 무제한이에요 🔥' : `횟수권 ${CREDITS_PER_PACK}회를 충전했어요 🎁`, 'success');
      close();
    } else if (outcome.status === 'pending') {
      setNotice({ kind: 'info', text: '결제 승인을 기다리고 있어요. 승인되면 자동으로 적용돼요.' });
    } else if (outcome.status === 'error') {
      setNotice({ kind: 'error', text: outcome.message });
    }
  };

  const restore = async () => {
    if (busy) return;
    setBusy('restore');
    setNotice(null);
    const result = await restorePremium();
    setBusy(null);
    if (result) {
      setPremium(result);
      toast.show('구매 내역을 복원했어요.', 'success');
      close();
    } else {
      setNotice(result === null ? { kind: 'info', text: '복원할 구매 내역이 없어요.' } : { kind: 'error', text: '스토어에 연결하지 못했어요. 잠시 후 다시 시도해주세요.' });
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
          {active ? (premium?.plan === 'lifetime' ? '평생권으로 모든 기능을 무제한으로 쓰고 있어요.' : '주간 구독으로 모든 기능을 무제한으로 쓰고 있어요.') : subtitle}
        </AppText>
        {!active && (status.kind === 'team' || status.kind === 'pass' || (status.credits ?? 0) > 0) ? (
          <View style={[styles.statusPill, { backgroundColor: theme.primarySoft }]}>
            <AppText variant="caption" color="primary" weight="700">
              지금: {quotaLabel(status)}
            </AppText>
          </View>
        ) : null}
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
      ) : showPlans && !products ? (
        <View style={styles.loading}>
          <ActivityIndicator color={theme.primary} />
          <AppText variant="caption" color="textTertiary">
            상품 정보를 불러오는 중…
          </AppText>
        </View>
      ) : showPlans ? (
        <>
          <View style={styles.plans}>
            {visible.map((p, i) => (
              <Animated.View key={p.plan} entering={FadeInDown.delay(60 * i).duration(260)}>
                <PlanCard
                  selected={chosen === p.plan}
                  onPress={() => {
                    haptic.select();
                    setSelected(p.plan);
                  }}
                  title={PLAN_TEXT[p.plan].title}
                  price={p.plan === 'weekly' ? `${priceOf('weekly')} / 주` : priceOf(p.plan)}
                  caption={PLAN_TEXT[p.plan].caption}
                  badge={PLAN_TEXT[p.plan].badge}
                />
              </Animated.View>
            ))}
          </View>

          <Button title={buyTitle(chosen, priceOf(chosen))} onPress={buy} loading={busy === 'purchase'} disabled={busy != null} />

          {notice ? (
            <View accessibilityLiveRegion="polite" style={[styles.notice, { backgroundColor: notice.kind === 'error' ? theme.accentSoft : theme.primarySoft }]}>
              <AppText variant="small" color={notice.kind === 'error' ? 'danger' : 'textSecondary'} align="center">
                {notice.text}
              </AppText>
            </View>
          ) : null}

          <AppText variant="caption" color="textTertiary" align="center" style={styles.fine}>
            {fineText(chosen, priceOf(chosen), storeName)}
          </AppText>
        </>
      ) : (
        <View style={[styles.webNotice, { backgroundColor: theme.primarySoft }]}>
          <AppText variant="smallStrong" align="center">
            프리미엄은 앱에서 시작할 수 있어요
          </AppText>
          <AppText variant="caption" color="textSecondary" align="center">
            iPhone · Android 앱에서 이용권을 결제하면 횟수 제한 없이 코칭받을 수 있어요. 웹에서는 매일 무료 코칭이 충전돼요.
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

function buyTitle(plan: PlanKey, price: string): string {
  switch (plan) {
    case 'day':
      return `하루 이용권 ${price} 결제하기`;
    case 'weekly':
      return `주간 구독 시작하기 · ${price}/주`;
    case 'lifetime':
      return `평생권 ${price} 결제하기`;
    case 'credits':
      return `횟수권 ${CREDITS_PER_PACK}회 ${price} 결제하기`;
  }
}

function fineText(plan: PlanKey, price: string, storeName: string): string {
  if (plan === 'weekly')
    return `주간 구독은 해지하지 않으면 매주 ${price}이 ${storeName} 계정으로 자동 결제돼요. 현재 기간이 끝나기 24시간 전까지 ${storeName} 계정 설정의 구독 메뉴에서 언제든 해지할 수 있어요.`;
  if (plan === 'lifetime') return `평생권은 ${price} 1회 결제이며 자동으로 다시 결제되지 않아요. 같은 ${storeName} 계정이면 기기를 바꿔도 「구매 복원」으로 다시 쓸 수 있어요.`;
  const common = '자동으로 다시 결제되지 않고, 결제한 이 기기에서 쓸 수 있어요 (다른 기기로 옮기거나 복원되지 않아요).';
  if (plan === 'day') return `하루 이용권은 ${price} 1회 결제로 결제한 때부터 24시간 동안 무제한이에요. 이미 이용 중이면 24시간이 이어서 늘어나요. ${common}`;
  return `횟수권은 ${price} 1회 결제로 코칭 ${CREDITS_PER_PACK}회가 충전되고 기간 제한이 없어요. 무료 횟수를 먼저 쓰고 그다음 횟수권이 차감돼요. ${common}`;
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
  loading: { alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.xl },
  plan: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, borderWidth: 1.5, borderRadius: Radius.lg, padding: Spacing.lg },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 10, height: 10, borderRadius: 5 },
  planTexts: { flex: 1, gap: 2 },
  planTitleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flexWrap: 'wrap' },
  badge: { paddingHorizontal: Spacing.sm, paddingVertical: 2, borderRadius: Radius.pill },
  fine: { marginTop: -Spacing.sm },
  notice: { borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm },
  webNotice: { borderRadius: Radius.lg, padding: Spacing.lg, gap: Spacing.xs },
  links: { flexDirection: 'row', justifyContent: 'center', gap: Spacing.lg, flexWrap: 'wrap' },
  statusPill: { paddingHorizontal: Spacing.md, paddingVertical: 4, borderRadius: Radius.pill, marginTop: Spacing.xs },
});
