/**
 * 타임어택 특가 팝업 (2026-11-17 — 11/12 회의 10번 「알라미처럼 타임어택 세일 팝업」, 사장님: 무료를 다 썼을 때).
 *
 * 무료를 다 써서 막힌 순간 결제 화면 대신 아래에서 올라오는 시트. 흐름은 lib/billing/paywall-route.ts.
 * - 이 팝업이 뜨는 순간 특가(SALE_WINDOW_MS, 10분)가 시작된다 — 7일에 한 번(lib/billing/sale). 이미 진행 중이면 남은 시간 그대로.
 * - 팝업에서 바로 결제한다(특가 상품). 결제되면 축하하고, 닫으면 막혔던 요청이 저절로 이어진다(use-resume-after-paywall).
 * - 특가를 열 수 없으면(스토어에 특가 상품이 없음·가격 비교 불가·쉬는 기간) 곧바로 일반 결제 화면으로 바꾼다.
 * - 정직하게: 실제 시각으로 줄어드는 카운트다운, 취소선은 지금 판매 중인 정가, 마감되면 특가로 결제하지 않는다.
 * 데모 웹에서는 `/sale?preview=1` 로 가짜 상품을 넣어 모양만 볼 수 있다(결제 없음).
 */
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, SlideInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GradientButton, formatClock, useRemaining } from '@/components/brand/brand';
import { useCelebrate } from '@/components/fx/celebration';
import { AppText } from '@/components/ui/app-text';
import { Radius, Spacing } from '@/constants/theme';
import { usePlanProducts } from '@/hooks/use-plan-products';
import { paywallClosed } from '@/hooks/use-resume-after-paywall';
import { useTheme } from '@/hooks/use-theme';
import { track } from '@/lib/analytics';
import { billingSupported, purchasePlan, type PlanProduct } from '@/lib/billing/iap';
import type { PaywallReason } from '@/lib/billing/paywall-route';
import { PRODUCT_IDS } from '@/lib/billing/plans';
import { formatPassEnd } from '@/lib/billing/quota';
import { isSaleActive, SALE_COOLDOWN_MS, SALE_WINDOW_MS, saleOffer, saleWindow } from '@/lib/billing/sale';
import { isDemoMode } from '@/lib/demo';
import { haptic } from '@/lib/haptics';
import { useAppStore } from '@/store/app-store';

/** 데모 웹 미리보기용 가짜 상품 — 실제 앱에서는 쓰지 않는다 */
const PREVIEW_PRODUCTS: PlanProduct[] = [
  { plan: 'day', productId: PRODUCT_IDS.day, displayPrice: '₩3,900', available: true, price: 3900, currency: 'KRW' },
  { plan: 'day', productId: 'mylovecoach.pass.day.sale', displayPrice: '₩2,900', available: true, price: 2900, currency: 'KRW', sale: true },
];

const won = (display: string) => {
  const m = /^\s*₩\s?([\d,]+)\s*$/.exec(display);
  return m ? `${m[1]}원` : display;
};

export default function SalePopup() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const celebrate = useCelebrate();
  const params = useLocalSearchParams<{ reason?: string; preview?: string }>();
  const reason = (params.reason ?? 'quota') as PaywallReason;
  const preview = isDemoMode && params.preview === '1';
  const storeProducts = usePlanProducts();
  const products = preview ? PREVIEW_PRODUCTS : billingSupported ? storeProducts : [];
  const name = useAppStore((s) => s.user?.name?.trim() || s.member?.nickname?.trim() || '');
  const startedAt = useAppStore((s) => s.saleOfferStartedAt);
  const startSaleOffer = useAppStore((s) => s.startSaleOffer);
  const setPremium = useAppStore((s) => s.setPremium);
  const passUntil = useAppStore((s) => s.wallet.passUntil);

  const offer = saleOffer(products);
  const loaded = products != null;
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const visit = useRef({ openedAt: Date.now(), done: false, viewed: false });

  // 상품을 확인하면: 특가를 열 수 없으면 일반 결제 화면으로, 처음이면 지금부터 10분을 시작한다
  const hasOffer = offer != null;
  useEffect(() => {
    if (!loaded) return;
    const now = Date.now();
    const phase = saleWindow(useAppStore.getState().saleOfferStartedAt, now).phase;
    if (!hasOffer || phase === 'cooldown') {
      track('sale_popup_skip', { reason, why: hasOffer ? 'cooldown' : 'no_offer' });
      visit.current.done = true;
      router.replace({ pathname: '/paywall', params: { reason } });
      return;
    }
    if (phase === 'ready') {
      startSaleOffer(now);
      track('sale_offer_start', { reason, from: 'popup' });
    }
  }, [loaded, hasOffer, reason, router, startSaleOffer]);

  const win = saleWindow(startedAt, Date.now());
  const left = useRemaining(win.phase === 'active' ? win.endsAt : null);
  const live = hasOffer && win.phase === 'active' && left > 0;

  useEffect(() => {
    if (!live || visit.current.viewed) return;
    visit.current.viewed = true;
    track('sale_popup_view', { reason, left: Math.round(left / 1000) });
  }, [live, left, reason]);

  // 닫히면 알린다 — 결제 없이 닫았으면 막혔던 요청을 나중에 저절로 보내지 않게. 결제 없이 닫은 것도 기록
  useEffect(() => {
    const v = visit.current;
    return () => {
      paywallClosed();
      if (!v.done) track('sale_popup_close', { reason, sec: Math.round((Date.now() - v.openedAt) / 1000) });
    };
  }, [reason]);

  const close = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)'));
  const more = () => {
    track('sale_popup_more', { reason });
    visit.current.done = true;
    router.replace({ pathname: '/paywall', params: { reason } });
  };

  const buy = async () => {
    if (busy || !offer) return;
    // 마감이 지난 뒤 누르면 특가로 결제하지 않는다
    if (!isSaleActive(useAppStore.getState().saleOfferStartedAt, Date.now())) {
      track('sale_offer_missed', { reason, from: 'popup' });
      setNotice('특가가 방금 끝났어요. 다른 이용권을 볼까요?');
      return;
    }
    const props = { plan: 'day', sale: true, from: 'popup' };
    track('purchase_start', props);
    if (preview) {
      visit.current.done = true;
      haptic.celebrate();
      celebrate({ kind: 'confetti', count: 32, haptic: false });
      setDone(true);
      return;
    }
    setBusy(true);
    setNotice(null);
    const outcome = await purchasePlan(offer.sale);
    setBusy(false);
    track(`purchase_${outcome.status}`, { ...props, ...(outcome.status === 'error' ? { message: outcome.message } : {}) });
    if (outcome.status === 'purchased' || outcome.status === 'granted') {
      visit.current.done = true;
      if (outcome.status === 'purchased') setPremium(outcome.premium);
      haptic.celebrate();
      celebrate({ kind: 'confetti', count: 32, haptic: false });
      setDone(true);
    } else if (outcome.status === 'pending') {
      setNotice('결제 승인을 기다리고 있어요. 승인되면 자동으로 적용돼요.');
    } else if (outcome.status === 'error') {
      setNotice(outcome.message);
    }
  };

  const store = Platform.OS === 'ios' ? 'App Store' : 'Google Play';
  const sheetPad = { paddingBottom: insets.bottom + Spacing.lg };

  return (
    <View style={styles.root}>
      <Animated.View entering={FadeIn.duration(180)} style={StyleSheet.absoluteFill}>
        <Pressable accessibilityRole="button" accessibilityLabel="닫기" onPress={close} style={[StyleSheet.absoluteFill, styles.dim]} />
      </Animated.View>
      {/* 상품을 확인하는 동안(또는 특가가 없어 일반 결제 화면으로 바꾸는 동안)은 어둡게만 */}
      {!loaded || (!hasOffer && !done) ? (
        <View style={styles.center} pointerEvents="none">
          <ActivityIndicator color="#FFFFFF" />
        </View>
      ) : (
        <Animated.View entering={SlideInDown.springify().damping(20)} style={[styles.sheet, sheetPad, { backgroundColor: theme.background }]} accessibilityViewIsModal>
          <View style={[styles.grabber, { backgroundColor: theme.border }]} />
          <Pressable accessibilityRole="button" accessibilityLabel="닫기" onPress={close} hitSlop={10} style={[styles.close, { backgroundColor: theme.surface }]}>
            <Ionicons name="close" size={18} color={theme.textSecondary} />
          </Pressable>

          {done ? (
            <Animated.View entering={FadeInDown.duration(260)} style={styles.doneBox} accessibilityLiveRegion="polite">
              <View style={[styles.doneIcon, { backgroundColor: theme.primarySoft }]}>
                <Ionicons name="checkmark" size={34} color={theme.primary} />
              </View>
              <Text accessibilityRole="header" style={[styles.title, styles.centerText, { color: theme.text }]}>
                하루 무제한 시작!
              </Text>
              <AppText variant="body" color="textSecondary" align="center">
                {passUntil > Date.now() ? `${formatPassEnd(passUntil, Date.now())}까지 마음껏 물어봐요.` : '지금부터 24시간 동안 마음껏 물어봐요.'}
              </AppText>
              <GradientButton title="바로 이어서 하기" onPress={close} style={styles.cta} />
            </Animated.View>
          ) : (
            <>
              <View style={[styles.pill, { backgroundColor: theme.primarySoft }]}>
                <Ionicons name="timer-outline" size={14} color={theme.primary} />
                <AppText variant="caption" color="primary" weight="800">
                  {SALE_WINDOW_MS / 60_000}분 한정 특가
                </AppText>
              </View>
              <Text accessibilityRole="header" style={[styles.title, { color: theme.text }]}>
                {name ? `${name}님, 무료 코칭을\n다 썼어요` : '무료 코칭을\n다 썼어요'}
              </Text>
              <AppText variant="body" color="textSecondary">
                지금 특가로 바로 이어서 코칭받을 수 있어요.
              </AppText>

              {/* 남은 시간 — 실제 시각 기준 */}
              <View style={[styles.timerBox, { backgroundColor: theme.surface }]} accessibilityLabel={`특가 마감까지 ${Math.floor(left / 60000)}분 ${Math.floor((left % 60000) / 1000)}초`}>
                <AppText variant="caption" color="textSecondary" weight="700">
                  특가 마감까지
                </AppText>
                <Text style={[styles.timer, { color: live ? theme.primary : theme.textTertiary }]}>{formatClock(left)}</Text>
              </View>

              {offer ? (
                <View style={styles.priceRow}>
                  <View style={styles.flex}>
                    <AppText variant="smallStrong">하루 이용권 · 24시간 무제한</AppText>
                    <AppText variant="caption" color="textSecondary">
                      자동 결제 없음 · 막힌 코칭이 바로 이어져요
                    </AppText>
                  </View>
                  <View style={styles.priceCol}>
                    <Text style={[styles.strike, { color: theme.textTertiary }]}>{won(offer.regular.displayPrice)}</Text>
                    <View style={styles.priceNow}>
                      <View style={[styles.off, { backgroundColor: theme.danger }]}>
                        <Text style={styles.offText}>{offer.percent}%</Text>
                      </View>
                      <Text style={[styles.price, { color: theme.text }]}>{won(offer.sale.displayPrice)}</Text>
                    </View>
                  </View>
                </View>
              ) : null}

              {notice ? (
                <View accessibilityLiveRegion="polite" style={[styles.notice, { backgroundColor: theme.primarySoft }]}>
                  <AppText variant="small" color="textSecondary" align="center">
                    {notice}
                  </AppText>
                </View>
              ) : null}

              <GradientButton
                title={live && offer ? `${won(offer.sale.displayPrice)}에 바로 이어서 하기` : '다른 이용권 보기'}
                onPress={live ? buy : more}
                loading={busy}
                disabled={busy}
                style={styles.cta}
              />
              <Pressable accessibilityRole="button" onPress={more} hitSlop={6} style={styles.more}>
                <AppText variant="smallStrong" color="textSecondary">
                  다른 이용권 보기
                </AppText>
              </Pressable>
              <AppText variant="caption" color="textTertiary" align="center">
                특가는 {Math.round(SALE_COOLDOWN_MS / 86_400_000)}일에 한 번, {SALE_WINDOW_MS / 60_000}분만 열려요 · {store} 결제
              </AppText>
            </>
          )}
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  dim: { backgroundColor: 'rgba(13,16,24,0.5)' },
  center: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  sheet: { borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl, paddingHorizontal: Spacing.xl, paddingTop: Spacing.md, gap: Spacing.md },
  grabber: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, marginBottom: Spacing.xs },
  close: { position: 'absolute', right: Spacing.lg, top: Spacing.lg, width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', zIndex: 2 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 5, borderRadius: Radius.pill, marginTop: Spacing.sm },
  title: { fontSize: 24, lineHeight: 32, fontWeight: '800', letterSpacing: -0.6 },
  centerText: { textAlign: 'center' },
  timerBox: { borderRadius: Radius.lg, paddingVertical: Spacing.md, alignItems: 'center', gap: 2 },
  timer: { fontSize: 44, lineHeight: 52, fontWeight: '900', letterSpacing: -1, fontVariant: ['tabular-nums'] },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  flex: { flex: 1, gap: 2 },
  priceCol: { alignItems: 'flex-end' },
  strike: { fontSize: 14, lineHeight: 18, fontWeight: '600', textDecorationLine: 'line-through' },
  priceNow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  off: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  offText: { color: '#FFFFFF', fontSize: 12, lineHeight: 16, fontWeight: '800' },
  price: { fontSize: 26, lineHeight: 32, fontWeight: '900', letterSpacing: -0.6 },
  notice: { borderRadius: Radius.md, padding: Spacing.md },
  cta: { marginTop: Spacing.xs },
  more: { alignSelf: 'center', minHeight: 44, justifyContent: 'center', paddingHorizontal: Spacing.md },
  doneBox: { alignItems: 'center', gap: Spacing.md, paddingTop: Spacing.lg },
  doneIcon: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
});
