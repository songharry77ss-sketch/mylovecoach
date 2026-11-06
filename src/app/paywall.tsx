import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, { FadeInDown, ZoomIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SignupCard } from '@/components/auth/signup-card';
import { BrandGradient, BrandPill, GradientButton, Icon3D, ResearchBadge, SenditLogo, WashBackground, formatClock, useRemaining } from '@/components/brand/brand';
import { useCelebrate } from '@/components/fx/celebration';
import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { Screen, useScreenTopInset } from '@/components/ui/screen';
import { useToast } from '@/components/ui/toast';
import { Brand, BrandShadow, Radius, Spacing } from '@/constants/theme';
import { onSalePrice, usePlanProducts } from '@/hooks/use-plan-products';
import { paywallClosed } from '@/hooks/use-resume-after-paywall';
import { useTheme } from '@/hooks/use-theme';
import { track } from '@/lib/analytics';
import { STORE_LABEL, STORE_URL, downloadDevice, type DownloadStore } from '@/lib/app-download';
import { billingSupported, lastStoreProblem, purchasePlan, restorePremium, type PlanProduct } from '@/lib/billing/iap';
import { CREDITS_PER_PACK, FALLBACK_PRICES, PRODUCT_IDS, SIGNUP_BONUS, freeRules, isConsumablePlan, type PlanKey } from '@/lib/billing/plans';
import { formatPassEnd, isPremiumActive, passEndIfBoughtNow, quotaLabel, quotaStatus } from '@/lib/billing/quota';
import { isSaleActive, saleAudience, saleOffer, saleWindow, shouldStartSale } from '@/lib/billing/sale';
import { APP_CONFIG } from '@/lib/config';
import { haptic } from '@/lib/haptics';
import { authAvailable } from '@/lib/supabase';
import { useAppStore } from '@/store/app-store';

type Reason = 'quota' | 'regenerate' | 'my' | 'banner' | 'upsell' | 'report' | 'practice' | 'mind';

/** 들어온 곳마다 맨 위 큰 제목 — *…* 는 파란 강조 */
const HEADLINES: Record<Reason, { title: string; subtitle: string }> = {
  // 하루 이용권이 스토어에 있으면 화면에서 가격을 넣은 문구로 바꾼다
  quota: { title: '오늘의 무료 코칭을\n*다 썼어요*', subtitle: '이용권이면 횟수 제한 없이 지금 바로 이어서 코칭받을 수 있어요.' },
  regenerate: { title: '마음에 드는 답장이\n*나올 때까지*', subtitle: '이용권이면 다른 버전도 횟수 제한 없이 넘겨 볼 수 있어요.' },
  my: { title: '필요한 만큼,\n*편하게* 물어봐요', subtitle: '답장이 막힐 때마다 횟수 걱정 없이 불러요.' },
  banner: { title: '필요한 만큼,\n*편하게* 물어봐요', subtitle: '답장이 막힐 때마다 횟수 걱정 없이 불러요.' },
  // 채팅 속 「답장이 도움이 됐나요?」 카드 — 결과를 받아 본 뒤
  upsell: { title: '마음에 드는 답장이\n*나올 때까지*', subtitle: '이용권이면 횟수 걱정 없이 답장을 계속 받아볼 수 있어요.' },
  report: { title: '그 사람 *분석 보고서*,\n지금 열어볼까요?', subtitle: '성향·호감 신호·공략법·궁합까지 한 번에 정리해 드려요.' },
  practice: { title: '연애 연습,\n*실전처럼* 계속해요', subtitle: '이용권이면 AI 상대와 마음껏 리허설할 수 있어요.' },
  mind: { title: '그 사람 *속마음*,\n더 들여다볼까요?', subtitle: '이용권이면 궁금한 상황을 횟수 걱정 없이 물어볼 수 있어요.' },
};

const BENEFITS: { icon: keyof typeof Ionicons.glyphMap; title: string; body: string }[] = [
  { icon: 'infinite-outline', title: '코칭 무제한', body: '캡처마다 답장 여러 버전과 호감 온도를 받아요' },
  { icon: 'sparkles-outline', title: '속마음 풀이 · 다른 답장 더 보기', body: '그 사람 속마음도, 마음에 드는 답장이 나올 때까지도' },
  { icon: 'analytics-outline', title: '상대 분석 보고서', body: '성향·호감 신호·공략법·궁합을 언제든 새로 분석해요' },
];

const PLAN_TEXT: Record<PlanKey, { title: string; caption: string; badge?: string }> = {
  day: { title: '하루 이용권', caption: '지금부터 24시간 무제한 · 자동 결제 없음', badge: '부담 없이' },
  weekly: { title: '주간 구독', caption: '매주 자동 갱신 · 언제든 해지', badge: '인기' },
  lifetime: { title: '평생권', caption: '한 번 결제로 서비스가 운영되는 동안 계속 · 자동 결제 없음', badge: '주간 구독 3주 가격' },
  credits: { title: `횟수권 ${CREDITS_PER_PACK}회`, caption: '필요할 때만 한 번씩 · 기간 제한 없음' },
};

/** 웹에서 결제 화면 모양을 확인·캡처하기 위한 개발용 플래그: ios | android (실제 결제는 되지 않음) */
const previewStore = process.env.EXPO_PUBLIC_PAYWALL_PREVIEW;
const showPlans = billingSupported || Boolean(previewStore);
/** 실제 스토어와 연결된 앱에서만 타임 세일을 연다 (웹·미리보기에는 특가 상품이 없다) */
const saleSupported = billingSupported && !previewStore;

const DEFAULT_PRODUCTS: PlanProduct[] = (['day', 'weekly', 'lifetime', 'credits'] as PlanKey[]).map((plan) => ({
  plan,
  productId: PRODUCT_IDS[plan],
  displayPrice: FALLBACK_PRICES[plan],
}));

/** 이름은 길면 줄인다 — 「{이름}님을 위한」이 한 줄에 들어가게 */
const shortName = (name: string) => {
  const chars = Array.from(name.trim());
  return chars.length > 10 ? `${chars.slice(0, 9).join('')}…` : chars.join('');
};

/** 「₩29,800」 → 큰 숫자 「29,800」 + 단위 「원」 (원화가 아니면 스토어 표시 그대로) */
function splitPrice(display: string): { value: string; unit: string } {
  const won = /^\s*₩\s?([\d,]+)\s*$/.exec(display);
  return won ? { value: won[1], unit: '원' } : { value: display, unit: '' };
}
const priceText = (display: string) => {
  const p = splitPrice(display);
  return `${p.value}${p.unit}`;
};

/** 분이 바뀔 때마다 다시 그린다 — 「지금 시작하면 내일 오후 3:42까지」가 늘 지금 기준이 되게 */
function useMinuteNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      timer = setTimeout(() => {
        setNow(Date.now());
        schedule();
      }, 60_000 - (Date.now() % 60_000) + 50);
    };
    schedule();
    return () => clearTimeout(timer);
  }, []);
  return now;
}

type Done = { plan: PlanKey };

export default function Paywall() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const celebrate = useCelebrate();
  const params = useLocalSearchParams<{ reason?: string }>();
  const reason: Reason = params.reason && params.reason in HEADLINES ? (params.reason as Reason) : 'my';
  const premium = useAppStore((s) => s.premium);
  const usage = useAppStore((s) => s.usage);
  const wallet = useAppStore((s) => s.wallet);
  const team = useAppStore((s) => s.team);
  const isMember = useAppStore((s) => s.member != null);
  const name = useAppStore((s) => s.user?.name?.trim() || s.member?.nickname?.trim() || '');
  const saleStartedAt = useAppStore((s) => s.saleOfferStartedAt);
  const startSaleOffer = useAppStore((s) => s.startSaleOffer);
  const setPremium = useAppStore((s) => s.setPremium);

  // 앱에서는 스토어 응답을 받은 뒤에 상품을 보여 준다 (스토어에 없는 상품이 잠깐이라도 보이지 않도록)
  // 스토어에 닿지 못했을 때 「다시 불러오기」로 한 번 더 묻는다
  const [loadAttempt, setLoadAttempt] = useState(0);
  const storeProducts = usePlanProducts(loadAttempt);
  const products = billingSupported && !previewStore ? storeProducts : DEFAULT_PRODUCTS;
  // 쓰다가 들어온 사람(채팅 안내·막힘)에게는 가장 가벼운 하루 이용권부터, 마이 탭에서 둘러보러 온 사람에게는 평생권부터 보여 준다
  const [selected, setSelected] = useState<PlanKey>(reason === 'my' ? 'lifetime' : 'day');
  const [busy, setBusy] = useState<'purchase' | 'restore' | null>(null);
  const [done, setDone] = useState<Done | null>(null);
  // 이 화면은 iOS 네이티브 모달이라 앱 전체 토스트가 모달 뒤에 가려진다.
  // 그래서 결제·복원 결과는 버튼 바로 위에 직접 보여 준다.
  const [notice, setNotice] = useState<{ kind: 'error' | 'info'; text: string } | null>(null);

  // 결제 없이 닫았을 때 남길 것 — 머문 시간, 상품을 직접 골랐는지, 마지막 결제 결과, 특가를 봤는지 (서비스 이용 기록 — 결제 흐름 분석)
  const visit = useRef({ openedAt: Date.now(), picked: false, result: 'none', done: false, plan: '' as PlanKey | '', sale: false });

  useEffect(() => {
    track('paywall_open', { reason });
  }, [reason]);
  // 닫히면 알린다 — 결제·가입 없이 닫았으면 막혔던 요청을 나중에 저절로 보내지 않게 (use-resume-after-paywall)
  useEffect(() => () => paywallClosed(), []);

  const close = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)'));
  const priceOf = (plan: PlanKey) => products?.find((p) => p.plan === plan && !p.sale)?.displayPrice ?? FALLBACK_PRICES[plan];
  // 스토어에서 확인된 상품만 보여 준다. 스토어에 닿지 못했으면 이미 등록된 프리미엄(주간·평생)만 (미리보기·웹은 전부)
  // 하루 이용권 특가는 고르는 목록에 넣지 않는다 — 타임 세일 동안 하루 이용권 카드의 가격으로만 쓴다
  const confirmed = products?.some((p) => p.available === true) ?? false;
  const visible = (products ?? []).filter((p) => !p.sale && (previewStore || !billingSupported || (confirmed ? p.available === true : !isConsumablePlan(p.plan))));
  // 고른 상품이 목록에 없으면(스토어 확인 실패 등) 자동 결제가 아닌 상품을 먼저 고른다 — 주간 구독이 저절로 골라져 있지 않게
  const chosen = visible.some((p) => p.plan === selected) ? selected : (visible.find((p) => p.plan !== 'weekly')?.plan ?? visible[0]?.plan ?? 'lifetime');
  // 앱에서 스토어 상품을 하나도 확인하지 못했으면 다시 불러오기를 권한다
  const storeUnreachable = billingSupported && !previewStore && products != null && !confirmed;
  // 스토어 상품을 하나도 확인하지 못했으면 그 이유(스토어 오류 코드·Google Play 응답 코드)를 남긴다 — 결제가 막힌 원인을 찾게
  useEffect(() => {
    if (!storeUnreachable) return;
    const problem = lastStoreProblem();
    track('store_unavailable', { reason, code: problem?.code ?? 'none', ...(problem?.responseCode != null ? { rc: problem.responseCode } : {}) });
  }, [storeUnreachable, reason]);
  const dayPrice = onSalePrice(products, 'day');
  const active = isPremiumActive(premium, Date.now());
  const status = quotaStatus(premium, usage, Date.now(), wallet, team, freeRules(authAvailable, isMember));
  // 비회원이면 결제보다 가입(무료 보너스)을 먼저 권한다
  const offerSignup = authAvailable && !isMember && !active && status.kind !== 'team';
  const storeName = Platform.OS === 'ios' || previewStore === 'ios' ? 'App Store' : 'Google Play';
  visit.current.plan = chosen;

  // ── 타임 세일 (lib/billing/sale.ts) ──
  // 스토어가 특가 상품과 정가 하루 이용권을 둘 다 확인했고, 이미 무제한인 사람이 아닐 때만
  const offer = saleSupported && !active && saleAudience(status.kind) && visible.some((p) => p.plan === 'day') ? saleOffer(products) : null;
  const offerReady = offer != null;
  // 처음 조건에 맞는 결제 화면을 볼 때 한 번 시작한다 — 시작 시각은 저장돼서 다시 열어도 처음부터 돌지 않는다
  useEffect(() => {
    if (!offerReady) return;
    const at = Date.now();
    if (!shouldStartSale(useAppStore.getState().saleOfferStartedAt, at)) return;
    startSaleOffer(at);
    track('sale_offer_start', { reason });
  }, [offerReady, reason, startSaleOffer]);
  const sale = saleWindow(saleStartedAt, Date.now());
  // 1초마다 다시 그려 남은 시간을 줄인다 (끝나면 정가로 돌아간다)
  useRemaining(offer && sale.phase === 'active' ? sale.endsAt : null);
  const saleOn = offer != null && sale.phase === 'active' && sale.remainingMs > 0;
  const salePrice = saleOn ? offer.sale.displayPrice : null;
  // 막혀서 온 사람에게는 가격을 넣어 바로 이어갈 수 있다고 알린다 (특가 중이면 특가로)
  const subtitle =
    reason === 'quota' && saleOn
      ? '지금은 특가로 바로 이어서 코칭받을 수 있어요.'
      : reason === 'quota' && dayPrice
        ? `하루 이용권 ${priceText(dayPrice)}이면 바로 이어서 코칭받아요.`
        : HEADLINES[reason].subtitle;
  useEffect(() => {
    if (!saleOn || visit.current.sale) return;
    visit.current.sale = true;
    track('sale_offer_view', { reason, left: Math.round(sale.remainingMs / 1000) });
  }, [saleOn, reason, sale.remainingMs]);

  // 「지금 시작하면 내일 오후 3:42까지」— 하루 이용권 24시간이 끝나는 시각 (이미 이용 중이면 이어 붙인 시각)
  const minuteNow = useMinuteNow();
  const passEnd = passEndIfBoughtNow(wallet.passUntil, minuteNow);

  // 이미 이용 중인 사람이 확인만 하고 닫는 건 세지 않는다
  const activeAtOpen = useRef(active);
  useEffect(() => {
    const v = visit.current;
    const wasActive = activeAtOpen.current;
    return () => {
      if (v.done || wasActive) return;
      track('paywall_close', { reason, plan: v.plan, sec: Math.round((Date.now() - v.openedAt) / 100) / 10, picked: v.picked, result: v.result, ...(v.sale ? { sale: true } : {}) });
    };
  }, [reason]);

  const pick = (plan: PlanKey) => {
    haptic.select();
    if (plan !== chosen) track('paywall_plan', { plan, reason });
    visit.current.picked = true;
    setSelected(plan);
  };

  const buy = async () => {
    if (busy) return;
    // 누르는 순간에 특가가 아직 열려 있을 때만 특가 상품을 산다 (마감이 지나면 정가)
    const useSale = chosen === 'day' && offer != null && isSaleActive(useAppStore.getState().saleOfferStartedAt, Date.now());
    const product = useSale ? offer.sale : products?.find((p) => p.plan === chosen && !p.sale);
    if (!product) return;
    setBusy('purchase');
    setNotice(null);
    const props = { plan: chosen, ...(useSale ? { sale: true } : {}) };
    track('purchase_start', props);
    const outcome = await purchasePlan(product);
    setBusy(null);
    track(`purchase_${outcome.status}`, { ...props, ...(outcome.status === 'error' ? { message: outcome.message } : {}) });
    visit.current.result = outcome.status;
    if (outcome.status === 'purchased' || outcome.status === 'granted') {
      visit.current.done = true;
      if (outcome.status === 'purchased') setPremium(outcome.premium);
      // 결제 완료 — 축하 (충전은 앱 전체의 결제 이벤트에서 이미 처리됐다, 중복 충전 방지)
      haptic.celebrate();
      celebrate({ kind: 'confetti', count: 32, haptic: false });
      setDone({ plan: outcome.status === 'granted' ? outcome.plan : outcome.premium.plan });
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
    track('restore_start');
    const result = await restorePremium();
    setBusy(null);
    track('restore_result', { result: result ? 'restored' : result === null ? 'none' : 'error' });
    if (result) {
      visit.current.done = true;
      setPremium(result);
      toast.show('구매 내역을 복원했어요.', 'success');
      close();
    } else {
      setNotice(result === null ? { kind: 'info', text: '복원할 구매 내역이 없어요.' } : { kind: 'error', text: '스토어에 연결하지 못했어요. 잠시 후 다시 시도해주세요.' });
    }
  };

  if (done) return <PurchaseDone plan={done.plan} onClose={close} />;

  const headline = active
    ? { title: '프리미엄 *이용 중*이에요', subtitle: premium?.plan === 'lifetime' ? '평생권으로 모든 기능을 무제한으로 쓰고 있어요.' : '주간 구독으로 모든 기능을 무제한으로 쓰고 있어요.' }
    : offerSignup && status.kind === 'exhausted'
      ? { title: '무료 맛보기를\n*다 썼어요*', subtitle: `가입하면 무료 코칭 ${SIGNUP_BONUS}회를 더 드려요. 이용권으로 바로 이어서 할 수도 있어요.` }
      : { title: HEADLINES[reason].title, subtitle };

  const ready = showPlans && products != null && !active;
  const day = ready ? visible.find((p) => p.plan === 'day') : undefined;
  const others = ready ? visible.filter((p) => p.plan !== 'day') : [];
  const chosenPrice = chosen === 'day' && salePrice ? salePrice : priceOf(chosen);
  const footer = active || (ready && visible.length > 0);

  return (
    <View style={[styles.flex, { backgroundColor: theme.background }]}>
      <Screen sheet safeTop safeBottom={!footer} contentStyle={styles.content}>
        <View style={styles.topBar}>
          <SenditLogo size="sm" />
          <Pressable accessibilityRole="button" accessibilityLabel="닫기" onPress={close} hitSlop={8} style={[styles.close, { backgroundColor: theme.surface }]}>
            <Ionicons name="close" size={20} color={theme.textSecondary} />
          </Pressable>
        </View>

        <Animated.View entering={FadeInDown.duration(320)} style={styles.head}>
          <Headline text={headline.title} />
          <AppText variant="body" color="textSecondary">
            {headline.subtitle}
          </AppText>
          <View style={styles.headChips}>
            <ResearchBadge />
            {!active && (status.kind === 'team' || status.kind === 'pass' || (status.credits ?? 0) > 0) ? <BrandPill icon="checkmark-circle" label={`지금: ${quotaLabel(status)}`} /> : null}
          </View>
        </Animated.View>

        {offerSignup ? (
          <SignupCard
            onDone={(result) => {
              // 결제 없이 닫히지만 가입으로 끝났다는 걸 남긴다
              visit.current.result = 'signup';
              haptic.celebrate();
              celebrate({ kind: 'sparkles', count: 22, haptic: false });
              close();
              toast.show(result.bonus ? `가입 완료! 무료 코칭 ${SIGNUP_BONUS}회를 받았어요 🎁` : '로그인했어요.', 'success');
            }}
          />
        ) : null}

        {showPlans && !products && !active ? (
          <View style={styles.loading}>
            <ActivityIndicator color={theme.primary} />
            <AppText variant="caption" color="textSecondary">
              상품 정보를 불러오는 중…
            </AppText>
          </View>
        ) : null}

        {day ? (
          <Animated.View entering={FadeInDown.delay(60).duration(320)}>
            <DayPassHero
              name={name ? shortName(name) : ''}
              selected={chosen === 'day'}
              onPress={() => pick('day')}
              price={day.displayPrice}
              passEnd={formatPassEnd(passEnd, minuteNow)}
              extending={wallet.passUntil > minuteNow}
              sale={saleOn && offer ? { price: offer.sale.displayPrice, regular: offer.regular.displayPrice, percent: offer.percent, left: sale.remainingMs } : null}
            />
          </Animated.View>
        ) : null}

        {others.length ? (
          <View style={styles.plans}>
            <AppText variant="smallStrong" color="textSecondary">
              {day ? '다른 이용권도 있어요' : '이용권 고르기'}
            </AppText>
            {others.map((p, i) => (
              <Animated.View key={p.plan} entering={FadeInDown.delay(120 + 60 * i).duration(300)}>
                <PlanCard
                  selected={chosen === p.plan}
                  onPress={() => pick(p.plan)}
                  title={PLAN_TEXT[p.plan].title}
                  price={priceOf(p.plan)}
                  per={p.plan === 'weekly' ? '/ 주' : undefined}
                  caption={PLAN_TEXT[p.plan].caption}
                  badge={PLAN_TEXT[p.plan].badge}
                />
              </Animated.View>
            ))}
          </View>
        ) : null}

        {ready && storeUnreachable ? (
          <Pressable accessibilityRole="button" onPress={() => setLoadAttempt((n) => n + 1)} hitSlop={8} style={styles.reload}>
            <AppText variant="caption" color="textSecondary" align="center">
              스토어 정보를 다 불러오지 못했어요 ·{' '}
              <AppText variant="caption" color="primary" weight="700">
                다시 불러오기
              </AppText>
            </AppText>
          </Pressable>
        ) : null}

        {ready && chosen === 'lifetime' ? <LifetimePromise storeName={storeName} /> : null}

        <View style={[styles.benefits, { backgroundColor: theme.surface }]}>
          <AppText variant="smallStrong" color="textSecondary">
            이용권이면 이렇게 돼요
          </AppText>
          {BENEFITS.map((b) => (
            <View key={b.title} style={styles.benefit}>
              <View style={[styles.benefitIcon, { backgroundColor: theme.primarySoft }]}>
                <Ionicons name={b.icon} size={18} color={theme.primary} />
              </View>
              <View style={styles.flex}>
                <AppText variant="smallStrong">{b.title}</AppText>
                <AppText variant="caption" color="textSecondary">
                  {b.body}
                </AppText>
              </View>
            </View>
          ))}
        </View>

        {ready && visible.length ? (
          <AppText variant="caption" color="textSecondary" style={styles.fine}>
            {fineText(chosen, chosenPrice, storeName, chosen === 'day' && salePrice != null)}
          </AppText>
        ) : null}

        {!showPlans && !active ? <AppDownload reason={reason} /> : null}

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

      {footer ? (
        <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.md, backgroundColor: theme.background, borderTopColor: theme.border }]}>
          {notice ? (
            <View accessibilityLiveRegion="polite" style={[styles.notice, { backgroundColor: notice.kind === 'error' ? theme.accentSoft : theme.primarySoft }]}>
              <AppText variant="small" color={notice.kind === 'error' ? 'danger' : 'textSecondary'} align="center">
                {notice.text}
              </AppText>
            </View>
          ) : null}
          {active ? (
            <Button variant="brand" title="확인" onPress={close} />
          ) : (
            <>
              <GradientButton
                shine
                haptic
                title={buyTitle(chosen, chosen === 'day' && salePrice != null)}
                accessibilityLabel={`${buyTitle(chosen, chosen === 'day' && salePrice != null)}, ${priceText(chosenPrice)} 결제`}
                onPress={buy}
                loading={busy === 'purchase'}
                disabled={busy != null}
              />
              <AppText variant="caption" color="textSecondary" align="center">
                {footCaption(chosen, chosenPrice, chosen === 'day' && salePrice != null)}
              </AppText>
            </>
          )}
        </View>
      ) : null}
    </View>
  );
}

function buyTitle(plan: PlanKey, sale: boolean): string {
  switch (plan) {
    case 'day':
      return sale ? '특가로 하루 무제한 시작하기' : '하루 무제한 시작하기';
    case 'weekly':
      return '주간 구독 시작하기';
    case 'lifetime':
      return '평생권 시작하기';
    case 'credits':
      return `횟수권 ${CREDITS_PER_PACK}회 충전하기`;
  }
}

/** 결제 버튼 바로 아래 한 줄 — 무엇을 얼마에, 자동 결제가 있는지 */
function footCaption(plan: PlanKey, price: string, sale: boolean): string {
  const won = priceText(price);
  switch (plan) {
    case 'day':
      return `${sale ? '특가 ' : ''}${won} · 24시간 무제한 · 자동 결제 없음`;
    case 'weekly':
      return `매주 ${won} 자동 결제 · 언제든 해지할 수 있어요`;
    case 'lifetime':
      return `${won} 한 번 결제 · 자동 결제 없음`;
    case 'credits':
      return `${won} · 코칭 ${CREDITS_PER_PACK}회 · 기간 제한 없음`;
  }
}

function fineText(plan: PlanKey, display: string, storeName: string, sale = false): string {
  const price = priceText(display);
  if (plan === 'weekly')
    return `주간 구독은 해지하지 않으면 매주 ${price}이 ${storeName} 계정으로 자동 결제돼요. 현재 기간이 끝나기 24시간 전까지 ${storeName} 계정 설정의 구독 메뉴에서 언제든 해지할 수 있어요.`;
  if (plan === 'lifetime')
    return `평생권은 ${price} 1회 결제이며 자동으로 다시 결제되지 않아요. 「평생」은 서비스가 운영되는 기간을 뜻하고, 같은 ${storeName} 계정이면 기기를 바꿔도 「구매 복원」으로 다시 쓸 수 있어요. 자세한 내용은 이용약관의 평생권 조항을 확인해 주세요.`;
  const common = '자동으로 다시 결제되지 않고, 결제한 이 기기에서 쓸 수 있어요 (다른 기기로 옮기거나 복원되지 않아요).';
  if (plan === 'day' && sale)
    return `하루 이용권 특가는 ${price} 1회 결제로 결제한 때부터 24시간 동안 무제한이에요 (하루 이용권과 똑같아요). 특가는 표시된 마감 시각까지만 살 수 있고, 마감 뒤에는 정가로 돌아가요. 이미 이용 중이면 24시간이 이어서 늘어나요. ${common}`;
  if (plan === 'day') return `하루 이용권은 ${price} 1회 결제로 결제한 때부터 24시간 동안 무제한이에요. 이미 이용 중이면 24시간이 이어서 늘어나요. ${common}`;
  return `횟수권은 ${price} 1회 결제로 코칭 ${CREDITS_PER_PACK}회가 충전되고 기간 제한이 없어요. 무료 횟수를 먼저 쓰고 그다음 횟수권이 차감돼요. ${common}`;
}

/** 큰 제목 — *…* 부분만 파란색 */
function Headline({ text }: { text: string }) {
  const theme = useTheme();
  const parts = text.split('*');
  return (
    <Text accessibilityRole="header" style={[styles.headline, { color: theme.text }]}>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <Text key={i} style={{ color: theme.primary }}>
            {part}
          </Text>
        ) : (
          part
        ),
      )}
    </Text>
  );
}

interface HeroSale {
  price: string;
  regular: string;
  percent: number;
  left: number;
}

/**
 * 맨 위 주인공 카드 — 「{이름}님을 위한 하루 무제한 이용권」.
 * 시계는 실제로 흐른다: 지금 사면 24시간이 끝나는 시각(1분마다 갱신)과, 타임 세일 중이면 특가 마감까지 남은 시간(1초마다).
 */
function DayPassHero({ name, selected, onPress, price, passEnd, extending, sale }: { name: string; selected: boolean; onPress: () => void; price: string; passEnd: string; extending: boolean; sale: HeroSale | null }) {
  const big = splitPrice(sale ? sale.price : price);
  // 폭이 좁은 휴대폰(아이폰 SE·갤럭시 A 360dp)에서는 「하루 무제한 이용권」이 한 줄에 들어가게 조금 작게
  const compact = useWindowDimensions().width < 380;
  // 「{이름}님을 위한」 / 「하루 무제한 이용권」 (이름이 없으면 「오늘 하루」 / 「무제한 이용권」)
  const [eyebrow, title] = name ? [`${name}님을 위한`, '하루 무제한 이용권'] : ['오늘 하루', '무제한 이용권'];
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={`${eyebrow} ${title}, ${sale ? `특가 ${priceText(sale.price)}, 정가 ${priceText(sale.regular)}, 특가 마감까지 ${formatClock(sale.left)}` : priceText(price)}, ${extending ? '지금 연장하면' : '지금 시작하면'} ${passEnd}까지 무제한`}
      onPress={onPress}
      style={[styles.heroOuter, BrandShadow]}>
      <BrandGradient colors={[Brand.blue, Brand.violet]} style={styles.hero}>
        <View pointerEvents="none" style={styles.heroGlow} />
        <View pointerEvents="none" style={styles.heroOrb} />
        <View style={styles.heroTop}>
          <BrandPill tone="glass" icon={sale ? 'flash' : 'ticket-outline'} label={sale ? '타임 세일' : '자동 결제 없음'} />
          <View style={[styles.heroRadio, selected ? styles.heroRadioOn : null]}>{selected ? <Ionicons name="checkmark" size={16} color={Brand.blue} /> : null}</View>
        </View>
        <Icon3D name="ticket" size={compact ? 80 : 96} float style={styles.heroIcon} />
        <View style={[styles.heroTitles, compact && styles.heroTitlesCompact]}>
          <Text style={styles.heroEyebrow} numberOfLines={1}>
            {eyebrow}
          </Text>
          <Text style={[styles.heroTitle, compact && styles.heroTitleCompact]}>{title}</Text>
        </View>
        <View style={styles.heroClock}>
          <Ionicons name="time-outline" size={16} color={Brand.onBrand} />
          <Text style={styles.heroClockText}>
            {extending ? '지금 연장하면' : '지금 시작하면'} <Text style={styles.heroClockStrong}>{passEnd}</Text>까지 무제한
          </Text>
        </View>
        {sale ? (
          <View style={styles.saleBox}>
            <Text style={styles.saleLabel}>특가 마감까지</Text>
            <Text style={styles.saleClock} accessibilityLiveRegion="none">
              {formatClock(sale.left)}
            </Text>
          </View>
        ) : null}
        <View style={styles.heroPriceRow}>
          {sale ? <Text style={styles.heroRegular}>{priceText(sale.regular)}</Text> : null}
          <Text style={styles.heroPrice}>
            {big.value}
            {big.unit ? <Text style={styles.heroUnit}>{big.unit}</Text> : null}
          </Text>
          {sale ? (
            <View style={styles.heroPercent}>
              <Text style={styles.heroPercentText}>{sale.percent}%</Text>
            </View>
          ) : (
            <Text style={styles.heroPer}>/ 24시간</Text>
          )}
        </View>
      </BrandGradient>
    </Pressable>
  );
}

interface PlanCardProps {
  selected: boolean;
  onPress: () => void;
  title: string;
  price: string;
  per?: string;
  caption: string;
  badge?: string;
}

/** 이용권 카드 — 연회색 카드 + 큰 가격, 고르면 그라데이션 테두리와 체크 (「럽코」 결제 시안) */
function PlanCard({ selected, onPress, title, price, per, caption, badge }: PlanCardProps) {
  const theme = useTheme();
  const p = splitPrice(price);
  const inner = (
    <View style={[styles.planInner, { backgroundColor: selected ? theme.surfaceSelected : theme.surface }]}>
      <View style={styles.planTitleRow}>
        <AppText variant="bodyStrong" style={styles.planTitle}>
          {title}
        </AppText>
        {badge ? <BrandPill label={badge} style={styles.planBadge} /> : null}
        <View style={styles.flex} />
        {selected ? (
          <BrandGradient colors={Brand.button} style={styles.check}>
            <Ionicons name="checkmark" size={15} color={Brand.onBrand} />
          </BrandGradient>
        ) : (
          <View style={[styles.check, styles.checkOff, { borderColor: theme.textTertiary }]} />
        )}
      </View>
      <Text style={[styles.planPrice, { color: selected ? theme.primary : theme.text }]}>
        {p.value}
        {p.unit ? <Text style={styles.planUnit}>{p.unit}</Text> : null}
        {per ? <Text style={[styles.planPer, { color: theme.textSecondary }]}> {per}</Text> : null}
      </Text>
      <AppText variant="caption" color="textSecondary">
        {caption}
      </AppText>
    </View>
  );
  return (
    <Pressable accessibilityRole="radio" accessibilityState={{ selected }} accessibilityLabel={`${title}, ${priceText(price)}${per ? ` ${per}` : ''}`} onPress={onPress}>
      {selected ? (
        <LinearGradient colors={Brand.button} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.planRing}>
          {inner}
        </LinearGradient>
      ) : (
        <View style={styles.planRing}>{inner}</View>
      )}
    </Pressable>
  );
}

/** 평생권을 고르면 결제 버튼 위에 약속을 또렷하게 보여 준다 (이용약관 평생권 조항의 요약) */
function LifetimePromise({ storeName }: { storeName: string }) {
  const theme = useTheme();
  const items = [
    '한 번 결제 · 자동 결제 없음 · 나중에 가격이 올라도 추가 요금 없음',
    '서비스가 운영되는 동안 코칭·속마음·보고서 무제한 (앞으로 프리미엄에 더해지는 기능 포함 · 따로 파는 상품 제외)',
    `같은 ${storeName} 계정이면 기기를 바꿔도 「구매 복원」으로 다시 쓸 수 있어요 (다른 스토어 앱으로는 옮겨지지 않아요)`,
    '개인이 보통 쓰는 만큼 무제한 — 자동 프로그램 대량 요청·계정 공유는 제한될 수 있어요',
    '서비스를 끝내게 되면 30일 전에 앱에서 먼저 알려 드려요',
  ];
  return (
    <View style={[styles.promise, { backgroundColor: theme.primarySoft }]} accessibilityLabel="평생권 약속">
      <View style={styles.promiseHead}>
        <Ionicons name="infinite" size={18} color={theme.primary} />
        <AppText variant="smallStrong">평생권 약속</AppText>
      </View>
      {items.map((t) => (
        <View key={t} style={styles.promiseRow}>
          <Ionicons name="checkmark-circle" size={16} color={theme.primary} />
          <AppText variant="caption" color="textSecondary" style={styles.flex}>
            {t}
          </AppText>
        </View>
      ))}
      <AppText variant="caption" color="primary" weight="700" accessibilityRole="link" onPress={() => Linking.openURL(`${APP_CONFIG.termsUrl}#lifetime`)}>
        평생권 약관 전문 보기 ›
      </AppText>
    </View>
  );
}

/** 결제 완료 — 축하 화면 (아이폰은 모달 위라 앱 전체 효과가 가려지므로 여기서 직접 보여 준다) */
function PurchaseDone({ plan, onClose }: { plan: PlanKey; onClose: () => void }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const top = useScreenTopInset(true);
  const passUntil = useAppStore((s) => s.wallet.passUntil);
  const [now] = useState(() => Date.now());
  const text: Record<PlanKey, { title: string; body: string }> = {
    day: { title: '하루 무제한 시작!', body: passUntil > now ? `${formatPassEnd(passUntil, now)}까지 마음껏 물어봐요.` : '지금부터 24시간 동안 마음껏 물어봐요.' },
    weekly: { title: '주간 구독 시작!', body: '이제 횟수 걱정 없이 마음껏 물어봐요.' },
    lifetime: { title: '평생권 시작!', body: '이제 횟수 걱정 없이 마음껏 물어봐요.' },
    credits: { title: `횟수권 ${CREDITS_PER_PACK}회 충전!`, body: '필요할 때 한 번씩 꺼내 써요.' },
  };
  return (
    <WashBackground style={{ paddingTop: top + Spacing.xxl, paddingBottom: insets.bottom + Spacing.lg }}>
      <View style={styles.doneBody} accessibilityLiveRegion="polite">
        <Animated.View entering={ZoomIn.springify().damping(12)} style={styles.doneIcon}>
          <BrandGradient style={styles.doneHalo} />
          <Icon3D name="ticket" size={156} float />
        </Animated.View>
        <Animated.View entering={FadeInDown.delay(140).duration(320)} style={styles.doneTexts}>
          <BrandPill icon="checkmark-circle" label="결제 완료" style={styles.doneChip} />
          <Text accessibilityRole="header" style={[styles.doneTitle, { color: theme.text }]}>
            {text[plan].title}
          </Text>
          <AppText variant="body" color="textSecondary" align="center">
            {text[plan].body}
          </AppText>
        </Animated.View>
      </View>
      <Animated.View entering={FadeInDown.delay(260).duration(320)} style={styles.doneFoot}>
        <GradientButton shine title="바로 이어서 하기" onPress={onClose} />
      </Animated.View>
    </WashBackground>
  );
}

/**
 * 웹에는 결제가 없으니 보고 있는 기기에 맞는 스토어로 앱 받기를 권한다.
 * 아이폰·아이패드는 App Store, 안드로이드는 Google Play 버튼 하나, 컴퓨터는 둘을 나란히.
 */
function AppDownload({ reason }: { reason: Reason }) {
  const theme = useTheme();
  const toast = useToast();
  const [device] = useState(downloadDevice);
  const desktop = device === 'desktop';
  const stores: DownloadStore[] = desktop ? ['ios', 'android'] : [device];

  const open = (store: DownloadStore) => {
    track('app_download_click', { store, reason });
    Linking.openURL(STORE_URL[store]).catch(() => toast.show(`${STORE_LABEL[store]}를 열지 못했어요.`, 'error'));
  };

  return (
    <View style={styles.download}>
      <View style={[styles.webNotice, { backgroundColor: theme.primarySoft }]}>
        <AppText variant="smallStrong" align="center">
          이용권은 앱에서 결제할 수 있어요
        </AppText>
        <AppText variant="caption" color="textSecondary" align="center">
          {desktop ? '휴대폰에 앱을 받아' : `${STORE_LABEL[device]}에서 앱을 받아`} 결제하면 횟수 제한 없이 바로 이어서 코칭받을 수 있어요.
        </AppText>
      </View>
      <View style={desktop ? styles.storeRow : null}>
        {stores.map((store) => (
          <Button
            key={store}
            variant="brand"
            title={desktop ? STORE_LABEL[store] : `${STORE_LABEL[store]}에서 앱 받기`}
            icon={<Ionicons name={store === 'ios' ? 'logo-apple' : 'logo-google-playstore'} size={18} color={Brand.onBrand} />}
            onPress={() => open(store)}
            style={desktop ? styles.storeButton : undefined}
          />
        ))}
      </View>
      {desktop ? (
        <AppText variant="caption" color="textSecondary" align="center">
          휴대폰에서 이 페이지를 열면 기기에 맞는 스토어로 바로 안내해 드려요.
        </AppText>
      ) : null}
      {Platform.OS === 'web' ? (
        <AppText variant="caption" color="textTertiary" align="center">
          웹에서도 {authAvailable ? '가입하면 ' : ''}매일 무료 코칭이 충전돼요.
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { gap: Spacing.xl, paddingBottom: Spacing.xl },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: -Spacing.sm },
  close: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  head: { gap: Spacing.sm },
  headline: { fontSize: 28, lineHeight: 37, fontWeight: '900', letterSpacing: -0.9 },
  headChips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginTop: Spacing.xs },
  loading: { alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.xl },

  heroOuter: { borderRadius: Radius.xl },
  hero: { borderRadius: Radius.xl, overflow: 'hidden', padding: Spacing.xl, gap: Spacing.md },
  heroGlow: { position: 'absolute', width: 240, height: 240, borderRadius: 120, top: -110, right: -70, backgroundColor: 'rgba(138,216,255,0.26)' },
  heroOrb: { position: 'absolute', width: 160, height: 160, borderRadius: 80, bottom: -80, left: -50, backgroundColor: 'rgba(255,255,255,0.08)' },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heroRadio: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: Brand.onBrandDim, alignItems: 'center', justifyContent: 'center' },
  heroRadioOn: { backgroundColor: Brand.onBrand, borderColor: Brand.onBrand },
  heroIcon: { position: 'absolute', right: Spacing.md, top: 50 },
  heroTitles: { paddingRight: 92, gap: 2 },
  heroEyebrow: { color: Brand.onBrand, fontSize: 19, lineHeight: 26, fontWeight: '800', letterSpacing: -0.5 },
  heroTitle: { color: Brand.onBrand, fontSize: 28, lineHeight: 36, fontWeight: '900', letterSpacing: -1 },
  heroTitlesCompact: { paddingRight: 72 },
  heroTitleCompact: { fontSize: 24, lineHeight: 32 },
  heroClock: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  heroClockText: { flex: 1, color: Brand.onBrand, fontSize: 14, lineHeight: 20, fontWeight: '600', letterSpacing: -0.2 },
  heroClockStrong: { fontWeight: '800' },
  saleBox: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: Brand.onBrand, borderRadius: Radius.md, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm },
  saleLabel: { color: Brand.blue, fontSize: 15, fontWeight: '800', letterSpacing: -0.3 },
  saleClock: { color: Brand.blue, fontSize: 30, lineHeight: 36, fontWeight: '900', letterSpacing: -0.5, fontVariant: ['tabular-nums'] },
  heroPriceRow: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', columnGap: Spacing.sm },
  heroRegular: { color: Brand.onBrand, fontSize: 17, fontWeight: '600', textDecorationLine: 'line-through' },
  heroPrice: { color: Brand.onBrand, fontSize: 40, lineHeight: 46, fontWeight: '900', letterSpacing: -1.4 },
  heroUnit: { fontSize: 20, fontWeight: '800', letterSpacing: -0.3 },
  heroPer: { color: Brand.onBrand, fontSize: 15, fontWeight: '700' },
  heroPercent: { backgroundColor: Brand.onBrand, borderRadius: Radius.pill, paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'center' },
  heroPercentText: { color: Brand.violet, fontSize: 15, fontWeight: '900' },

  plans: { gap: Spacing.sm },
  planRing: { borderRadius: Radius.lg + 2, padding: 2 },
  planInner: { borderRadius: Radius.lg, paddingHorizontal: Spacing.lg + 2, paddingVertical: Spacing.lg, gap: 2 },
  planTitleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: 2 },
  planTitle: { fontSize: 17, fontWeight: '800', letterSpacing: -0.3 },
  planBadge: { paddingVertical: 3, paddingHorizontal: 8 },
  check: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  checkOff: { borderWidth: 2 },
  planPrice: { fontSize: 30, lineHeight: 38, fontWeight: '900', letterSpacing: -1 },
  planUnit: { fontSize: 17, fontWeight: '800', letterSpacing: -0.3 },
  planPer: { fontSize: 15, fontWeight: '700' },

  reload: { marginTop: -Spacing.sm },
  promise: { borderRadius: Radius.lg, padding: Spacing.lg, gap: Spacing.sm },
  promiseHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  promiseRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  benefits: { borderRadius: Radius.lg, padding: Spacing.lg, gap: Spacing.md },
  benefit: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  benefitIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  fine: { marginTop: -Spacing.sm, lineHeight: 18 },
  links: { flexDirection: 'row', justifyContent: 'center', gap: Spacing.lg, flexWrap: 'wrap' },

  footer: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.md, gap: Spacing.sm, borderTopWidth: StyleSheet.hairlineWidth },
  notice: { borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm },

  doneIcon: { alignItems: 'center', justifyContent: 'center' },
  doneHalo: { position: 'absolute', width: 210, height: 210, borderRadius: 105, opacity: 0.14 },
  doneBody: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.lg, paddingHorizontal: Spacing.xl },
  doneTexts: { alignItems: 'center', gap: Spacing.sm },
  doneChip: { alignSelf: 'center' },
  doneTitle: { fontSize: 32, lineHeight: 40, fontWeight: '900', letterSpacing: -1.1, textAlign: 'center' },
  doneFoot: { paddingHorizontal: Spacing.lg },

  download: { gap: Spacing.md },
  webNotice: { borderRadius: Radius.lg, padding: Spacing.lg, gap: Spacing.xs },
  storeRow: { flexDirection: 'row', gap: Spacing.sm },
  storeButton: { flex: 1 },
});
