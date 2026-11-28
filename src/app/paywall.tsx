import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, ZoomIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SignupCard } from '@/components/auth/signup-card';
import { GradientButton, formatClock, useRemaining } from '@/components/brand/brand';
import { useCelebrate } from '@/components/fx/celebration';
import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { Screen, useScreenTopInset } from '@/components/ui/screen';
import { useToast } from '@/components/ui/toast';
import { Brand, Radius, Spacing } from '@/constants/theme';
import { RESEARCH_SHORT, RESEARCH_SHORT_EN } from '@/constants/brand';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { onSalePrice, usePlanProducts } from '@/hooks/use-plan-products';
import { hasPendingResume, paywallClosed } from '@/hooks/use-resume-after-paywall';
import { useTheme } from '@/hooks/use-theme';
import { track } from '@/lib/analytics';
import { STORE_LABEL, STORE_URL, downloadDevice, type DownloadStore } from '@/lib/app-download';
import { couponSupported } from '@/lib/billing/coupon';
import { fallbackPrice } from '@/lib/billing/fallback-price';
import { billingSupported, lastStoreProblem, purchasePlan, restorePremium, type PlanProduct } from '@/lib/billing/iap';
import { storeFixHint } from '@/lib/billing/store-hint';
import { CREDITS_PER_PACK, PRODUCT_IDS, SELLING_PLANS, SIGNUP_BONUS, freeRules, isConsumablePlan, yearPassEnd, type PlanKey } from '@/lib/billing/plans';
import { PREMIUM_PLAN_NAMES, formatDate, formatPassEnd, isPremiumActive, passEndIfBoughtNow, premiumUntilSentence, quotaLabel, quotaStatus } from '@/lib/billing/quota';
import { isSaleActive, priceNumber, SALE_WINDOW_MS, saleAnchorAllowed, saleAudience, saleOffer, saleWindow, shouldStartSale } from '@/lib/billing/sale';
import { APP_CONFIG } from '@/lib/config';
import { haptic } from '@/lib/haptics';
import { L, isKo } from '@/lib/i18n';
import { authAvailable } from '@/lib/supabase';
import { introUntil, useAppStore } from '@/store/app-store';

type Reason = 'quota' | 'regenerate' | 'my' | 'banner' | 'upsell' | 'report' | 'practice' | 'mind' | 'renew';
/** 무료를 다 써서 막혀 들어온 이유들 (lib/billing/paywall-route 의 BLOCKED_REASONS 와 같다) */
const BLOCKED: ReadonlySet<Reason> = new Set<Reason>(['quota', 'regenerate', 'report', 'practice', 'mind']);

/**
 * 결제 없이 닫을 때 한 번 묻는 이유 (기기당 한 번 · 건너뛸 수 있음) — 하루 8명꼴이라 A/B 로는 판단이 안 돼서 이유를 직접 모은다.
 * 2026-11-28 결제 전환 검토(김대표): 「비싸요 / 아직 필요 없어요 / 무료로 충분 / 결제 번거로움 / 답이 별로」
 */
const WHY_OPTIONS: { key: string; label: string }[] = L(
  [
    { key: 'price', label: '가격이 부담돼요' },
    { key: 'later', label: '지금은 필요 없어요' },
    { key: 'free_ok', label: '무료로도 충분해요' },
    { key: 'hassle', label: '결제가 번거로워요' },
    { key: 'quality', label: '답장이 기대보다 별로예요' },
  ],
  [
    { key: 'price', label: 'Too expensive' },
    { key: 'later', label: "Don't need it right now" },
    { key: 'free_ok', label: 'Free is enough for me' },
    { key: 'hassle', label: 'Paying is a hassle' },
    { key: 'quality', label: "Replies weren't good enough" },
  ],
);
/** 스토어에 닿지 못했을 때 저절로 다시 묻는 횟수 (그다음은 「다시 불러오기」 버튼) */
const AUTO_RELOADS = 2;

/**
 * 들어온 곳마다 맨 위 제목 — 1.4 「깔끔하게」 개편: 한 줄 사실 문장(파란 강조·두 줄 큰 제목을 걷었다). 결제 화면 조사 R3.
 */
const HEADLINES_KO: Record<Reason, { title: string; subtitle: string }> = {
  // 하루 이용권이 스토어에 있으면 화면에서 가격·충전 안내를 넣은 문구로 바꾼다
  quota: { title: '오늘 무료 코칭을 다 썼어요', subtitle: '이용권이면 횟수 제한 없이 지금 바로 이어서 코칭받을 수 있어요.' },
  regenerate: { title: '다른 답장도 더 볼까요?', subtitle: '이용권이면 마음에 드는 답장이 나올 때까지 넘겨 볼 수 있어요.' },
  my: { title: '횟수 걱정 없이 물어봐요', subtitle: '답장이 막힐 때마다 바로 불러요.' },
  banner: { title: '횟수 걱정 없이 물어봐요', subtitle: '답장이 막힐 때마다 바로 불러요.' },
  // 채팅 속 「답장이 도움이 됐나요?」 카드 — 결과를 받아 본 뒤
  upsell: { title: '마음에 드는 답장이 나올 때까지', subtitle: '이용권이면 횟수 걱정 없이 답장을 계속 받아볼 수 있어요.' },
  report: { title: '그 사람 분석 보고서, 지금 열어볼까요?', subtitle: '성향·호감 신호·공략법·궁합까지 한 번에 정리해 드려요.' },
  practice: { title: '연애 연습, 실전처럼 계속해요', subtitle: '이용권이면 AI 상대와 마음껏 리허설할 수 있어요.' },
  mind: { title: '그 사람 속마음, 더 들여다볼까요?', subtitle: '이용권이면 궁금한 상황을 횟수 걱정 없이 물어볼 수 있어요.' },
  // 하루 이용권이 곧 끝날 때 채팅방 안내 줄에서 — 1년권을 먼저 고른다 (결제 루프, lib/billing/paywall-route)
  renew: { title: '하루 무제한이 곧 끝나요', subtitle: '자주 쓴다면 1년권이 훨씬 싸요. 자동 결제도 없어요.' },
};
const HEADLINES_EN: Record<Reason, { title: string; subtitle: string }> = {
  quota: { title: "You're out of free coaching today", subtitle: 'Get a pass to keep going right now — no limits.' },
  regenerate: { title: 'Want to see more replies?', subtitle: 'With a pass, keep swiping until you get a reply you love.' },
  my: { title: 'Ask as much as you want', subtitle: 'Call on your coach whenever you get stuck.' },
  banner: { title: 'Ask as much as you want', subtitle: 'Call on your coach whenever you get stuck.' },
  upsell: { title: 'Keep going till you get the one', subtitle: 'With a pass, get as many reply ideas as you want.' },
  report: { title: 'Open their crush report now?', subtitle: 'Personality, interest signals, game plan and compatibility — all in one place.' },
  practice: { title: 'Keep practicing like it’s real', subtitle: 'With a pass, rehearse with your AI match as much as you want.' },
  mind: { title: 'Want to dig deeper into their head?', subtitle: 'With a pass, ask about anything on your mind — no limits.' },
  renew: { title: 'Your 24 hours are almost up', subtitle: 'Use it a lot? The 1-year pass is way cheaper. No auto-renewal.' },
};
const HEADLINES = L(HEADLINES_KO, HEADLINES_EN);

/** 이용권으로 얻는 것 — 아이콘 타일 없이 체크 한 줄씩 (조사: 아이콘 타일 반복이 「AI 티」) */
const BENEFITS = L(
  ['코칭 무제한 — 캡처마다 답장 3가지와 호감 온도', '속마음 풀이 · 다른 답장 더 보기', '상대 분석 보고서'],
  ['Unlimited coaching — 3 reply ideas + interest level for every screenshot', 'Read their mind · More reply ideas', 'Crush reports'],
);

/**
 * 이용권 줄 글 — 배지는 사실만(1.4 개편): 근거 없는 「인기」와 계산이 100원 틀린 「주간 구독 3주 가격」(29,800 ≠ 9,900×3)을 뺐다.
 */
const PLAN_TEXT_KO: Record<PlanKey, { title: string; caption: string }> = {
  day: { title: '하루 이용권', caption: '지금부터 24시간 무제한 · 자동 결제 없음' },
  weekly: { title: '주간 구독', caption: '매주 자동 결제 · 언제든 해지할 수 있어요' },
  year: { title: '1년권', caption: '결제한 날부터 1년 · 자동 결제 없음' },
  // 평생권은 2026-11-07 부터 팔지 않아 목록에 나오지 않는다 (SELLING_PLANS). 이미 산 사람은 「이용 중」 화면만 본다
  lifetime: { title: '평생권', caption: '판매 종료' },
  credits: { title: `횟수권 ${CREDITS_PER_PACK}회`, caption: '필요할 때만 한 번씩 · 기간 제한 없음' },
};
const PLAN_TEXT_EN: Record<PlanKey, { title: string; caption: string }> = {
  day: { title: '24-hour pass', caption: 'Unlimited for 24 hours · No auto-renewal' },
  weekly: { title: 'Weekly plan', caption: 'Renews weekly · Cancel anytime' },
  year: { title: '1-year pass', caption: '1 year from purchase · No auto-renewal' },
  lifetime: { title: 'Lifetime pass', caption: 'No longer sold' },
  credits: { title: `${CREDITS_PER_PACK}-credit pack`, caption: 'Use only when you need it · Never expires' },
};
const PLAN_TEXT = L(PLAN_TEXT_KO, PLAN_TEXT_EN);

/** 1년권이 하루에 얼마꼴인지 — 원화 스토어 가격 ÷ 365, 「약 82원」. 원화가 아니거나 모르면 null */
export function perDayWon(display: string, price?: number | null): string | null {
  const n = typeof price === 'number' && price > 0 ? price : Number((/^\s*₩\s?([\d,]+)\s*$/.exec(display)?.[1] ?? '').replace(/,/g, ''));
  if (!n || !Number.isFinite(n) || !/₩/.test(display)) return null;
  const perDay = Math.round(n / 365).toLocaleString('ko-KR');
  return L(`하루 약 ${perDay}원`, `About ₩${perDay}/day`);
}

/** 웹에서 결제 화면 모양을 확인·캡처하기 위한 개발용 플래그: ios | android (실제 결제는 되지 않음) */
const previewStore = process.env.EXPO_PUBLIC_PAYWALL_PREVIEW;
const showPlans = billingSupported || Boolean(previewStore);
/** 실제 스토어와 연결된 앱에서만 타임 세일을 연다 (웹·미리보기에는 특가 상품이 없다) */
const saleSupported = billingSupported && !previewStore;

const DEFAULT_PRODUCTS: PlanProduct[] = SELLING_PLANS.map((plan) => ({
  plan,
  productId: PRODUCT_IDS[plan],
  displayPrice: fallbackPrice(plan),
}));

/** 이름은 길면 줄인다 — 「{이름}님을 위한」이 한 줄에 들어가게 */
const shortName = (name: string) => {
  const chars = Array.from(name.trim());
  return chars.length > 10 ? `${chars.slice(0, 9).join('')}…` : chars.join('');
};

/** 「₩29,800」 → 큰 숫자 「29,800」 + 단위 「원」 (원화가 아니면 스토어 표시 그대로, 영어판은 늘 그대로) */
function splitPrice(display: string): { value: string; unit: string } {
  if (!isKo) return { value: display, unit: '' };
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

/** 주간 구독 값 뒤의 「/주」 */
const PER_WEEK = L('/주', '/wk');

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
  const intro = useAppStore(introUntil);
  const name = useAppStore((s) => s.user?.name?.trim() || s.member?.nickname?.trim() || '');
  const saleStartedAt = useAppStore((s) => s.saleOfferStartedAt);
  const startSaleOffer = useAppStore((s) => s.startSaleOffer);
  const setPremium = useAppStore((s) => s.setPremium);
  const whyAsked = useAppStore((s) => s.paywallWhyAsked);
  const setWhyAsked = useAppStore((s) => s.setPaywallWhyAsked);
  const blocked = BLOCKED.has(reason);
  // 막혀서 들어왔고 그 요청이 기다리고 있으면 — 결제·가입하면 저절로 이어진다고 말한다 (use-resume-after-paywall)
  const [resumes] = useState(() => BLOCKED.has(reason) && hasPendingResume());
  // 비회원이 막혔을 때 「가입 없이 바로 이용권」을 펼쳤는지
  const [buyOpen, setBuyOpen] = useState(false);
  // 닫을 때 이유를 묻는 중인지
  const [asking, setAsking] = useState(false);
  // 안드로이드에서 결제창을 닫았을 때 결제 수단 안내를 이미 했는지
  const cancelHinted = useRef(false);

  // 앱에서는 스토어 응답을 받은 뒤에 상품을 보여 준다 (스토어에 없는 상품이 잠깐이라도 보이지 않도록)
  // 스토어에 닿지 못했을 때 「다시 불러오기」로 한 번 더 묻는다
  const [loadAttempt, setLoadAttempt] = useState(0);
  const storeProducts = usePlanProducts(loadAttempt);
  const products = billingSupported && !previewStore ? storeProducts : DEFAULT_PRODUCTS;
  // 맨 위 큰 카드(「{이름}님을 위한 하루 무제한 이용권」)를 늘 먼저 고른다 — 마이 탭에서 와도 큰 카드와 아래 버튼이 어긋나지 않게 (2026-11-07)
  // 하루 이용권이 곧 끝나서 온 사람(renew)에게는 1년권을 먼저 고른다
  const [selected, setSelected] = useState<PlanKey>(reason === 'renew' ? 'year' : 'day');
  const [busy, setBusy] = useState<'purchase' | 'restore' | null>(null);
  // 「다른 이용권 보기」를 펼쳤는지
  const [moreOpen, setMoreOpen] = useState(false);
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
  const priceOf = (plan: PlanKey) => products?.find((p) => p.plan === plan && !p.sale)?.displayPrice ?? fallbackPrice(plan);
  // 스토어에서 확인된 상품만 보여 준다. 스토어에 닿지 못했으면 이미 등록된 프리미엄(주간 구독·1년권)만 (미리보기·웹은 전부)
  // 하루 이용권 특가는 고르는 목록에 넣지 않는다 — 타임 세일 동안 하루 이용권 카드의 가격으로만 쓴다
  const confirmed = products?.some((p) => p.available === true) ?? false;
  const visible = (products ?? []).filter((p) => !p.sale && (previewStore || !billingSupported || (confirmed ? p.available === true : !isConsumablePlan(p.plan))));
  // 고른 상품이 목록에 없으면(스토어 확인 실패 등) 자동 결제가 아닌 상품을 먼저 고른다 — 주간 구독이 저절로 골라져 있지 않게
  const chosen = visible.some((p) => p.plan === selected) ? selected : (visible.find((p) => p.plan !== 'weekly')?.plan ?? visible[0]?.plan ?? 'year');
  // 앱에서 스토어 상품을 하나도 확인하지 못했으면 다시 불러오기를 권한다
  const storeUnreachable = billingSupported && !previewStore && products != null && !confirmed;
  // 다시 불러와도 안 풀리는 상태(스토어 앱이 오래됨 -2·결제 사용 불가 3)면 할 일을 알려 준다
  const fixHint = storeUnreachable ? storeFixHint(lastStoreProblem()) : null;
  // 스토어에 닿지 못했으면 두 번까지 저절로 다시 묻는다 (Play 네트워크 오류 12·연결 끊김 -1 은 잠깐 뒤 대부분 풀린다 —
  // 예전에는 「다시 불러오기」를 눌러야 해서 하루 이용권이 빠진 채 1년권만 보고 닫는 경우가 많았다, 11-19 데이터)
  useEffect(() => {
    if (!storeUnreachable || loadAttempt >= AUTO_RELOADS) return;
    const t = setTimeout(() => {
      track('store_retry', { reason, attempt: loadAttempt + 1 });
      setLoadAttempt((n) => n + 1);
    }, 1500 * (loadAttempt + 1));
    return () => clearTimeout(t);
  }, [storeUnreachable, loadAttempt, reason]);
  // 스토어 상품을 하나도 확인하지 못했으면 그 이유(스토어 오류 코드·Google Play 응답 코드)를 남긴다 — 결제가 막힌 원인을 찾게
  useEffect(() => {
    if (!storeUnreachable) return;
    const problem = lastStoreProblem();
    track('store_unavailable', { reason, code: problem?.code ?? 'none', ...(problem?.responseCode != null ? { rc: problem.responseCode } : {}) });
  }, [storeUnreachable, reason]);
  const dayPrice = onSalePrice(products, 'day');
  const active = isPremiumActive(premium, Date.now());
  const status = quotaStatus(premium, usage, Date.now(), wallet, team, freeRules(authAvailable, isMember), intro);
  // 비회원이면 결제보다 가입(무료 보너스)을 먼저 권한다
  const offerSignup = authAvailable && !isMember && !active && status.kind !== 'team';
  const storeName = Platform.OS === 'ios' || previewStore === 'ios' ? 'App Store' : 'Google Play';
  visit.current.plan = chosen;

  // ── 타임 세일 (lib/billing/sale.ts) ──
  // 스토어가 특가 상품과 정가 하루 이용권을 둘 다 확인했고, 이미 무제한인 사람이 아닐 때만
  const offer = saleSupported && !active && saleAudience(status.kind) && visible.some((p) => p.plan === 'day') ? saleOffer(products) : null;
  const offerReady = offer != null;
  // 무료를 다 써서 막혀 들어온 결제 화면에서만 한 번 시작한다 — 시작 시각은 저장돼서 다시 열어도 처음부터 돌지 않는다.
  // 마이 탭·안내 줄·「도움이 됐나요」 카드에서 구경만 해도 10분이 흘러가 7일 잠기던 것을 막는다(2026-11-28 결제 전환 검토 약점 1).
  // 이미 진행 중인 특가는 어느 결제 화면에서든 그대로 보인다
  const saleMoment = blocked;
  useEffect(() => {
    if (!offerReady || !saleMoment) return;
    const at = Date.now();
    if (!shouldStartSale(useAppStore.getState().saleOfferStartedAt, at)) return;
    startSaleOffer(at);
    track('sale_offer_start', { reason });
  }, [offerReady, saleMoment, reason, startSaleOffer]);
  const sale = saleWindow(saleStartedAt, Date.now());
  // 1초마다 다시 그려 남은 시간을 줄인다 (끝나면 정가로 돌아간다)
  useRemaining(offer && sale.phase === 'active' ? sale.endsAt : null);
  const saleOn = offer != null && sale.phase === 'active' && sale.remainingMs > 0;
  const salePrice = saleOn ? offer.sale.displayPrice : null;
  // 막혀서 온 사람에게는 가격을 넣어 바로 이어갈 수 있다고 알린다 (특가 중이면 특가로)
  // 1년권이 하루 이용권 몇 번 값보다 싼지 — 스토어가 준 두 가격으로만 계산한다 (모르면 문구를 쓰지 않음)
  const yearAnchor = (() => {
    const day = products?.find((p) => p.plan === 'day' && !p.sale && p.available === true);
    const year = products?.find((p) => p.plan === 'year' && p.available === true);
    const d = day ? priceNumber(day) : null;
    const y = year ? priceNumber(year) : null;
    if (!d || !y || y <= d) return null;
    const times = Math.ceil(y / d);
    return times * d > y
      ? L(`1년권은 하루 이용권 ${times}번 값보다 싸게 1년 내내 무제한이에요. 자동 결제도 없어요.`, `The 1-year pass costs less than ${times} 24-hour passes — unlimited all year. No auto-renewal.`)
      : null;
  })();
  // 회원은 매일 무료가 다시 채워진다 — 무료로 기다리는 길을 돈 내는 길보다 먼저 적는다(피클 「사실 → 무료 길 → 유료 길」)
  const refills = (status.daily ?? 0) > 0;
  const subtitle =
    reason === 'renew' && yearAnchor
      ? yearAnchor
      : reason === 'quota' && refills
        ? L('무료 코칭은 내일 다시 채워져요. 지금 바로 이어서 하려면 이용권을 골라 주세요.', 'Free coaching refills tomorrow. To keep going now, pick a pass.')
        : reason === 'quota' && saleOn
          ? L('지금은 특가로 바로 이어서 코칭받을 수 있어요.', 'Keep going right now at a special price.')
          : reason === 'quota' && dayPrice
            ? L(`하루 이용권 ${priceText(dayPrice)}이면 바로 이어서 코칭받아요.`, `Keep going right now with a 24-hour pass for ${dayPrice}.`)
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
    // 화면에 특가가 보이던 채로 눌렀는데 그 사이 마감이 지났으면 정가 결제창을 열지 않는다 — 알리고 화면을 정가로 바꾼다
    const shownSale = chosen === 'day' && salePrice != null;
    const stillOpen = offer != null && isSaleActive(useAppStore.getState().saleOfferStartedAt, Date.now());
    if (shownSale && !stillOpen) {
      track('sale_offer_missed', { reason });
      // iOS 모달 위에서는 앱 토스트가 가려지므로 버튼 바로 위에 보여 준다 (다시 그리면서 화면이 정가로 바뀐다)
      setNotice({ kind: 'info', text: L('특가가 방금 끝났어요. 지금은 정가로 살 수 있어요.', 'The deal just ended. You can still get it at the regular price.') });
      return;
    }
    const useSale = shownSale && stillOpen && offer != null;
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
      setNotice({ kind: 'info', text: L('결제 승인을 기다리고 있어요. 승인되면 자동으로 적용돼요.', 'Waiting for payment approval. It’ll kick in automatically once approved.') });
    } else if (outcome.status === 'error') {
      setNotice({ kind: 'error', text: outcome.message });
    } else if (outcome.status === 'cancelled' && Platform.OS === 'android' && isKo && !cancelHinted.current) {
      // 카드를 등록하지 않은 사람이 첫 결제창에서 떠나는 경우가 많아 한 번만 알린다 (Google Play 는 통신사 결제를 지원)
      cancelHinted.current = true;
      setNotice({ kind: 'info', text: `카드가 없어도 ${storeName} 결제창의 결제 수단에서 휴대폰(통신사) 결제를 고를 수 있어요.` });
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
      toast.show(L('구매 내역을 복원했어요.', 'Purchases restored.'), 'success');
      close();
    } else {
      setNotice(
        result === null
          ? { kind: 'info', text: L('복원할 구매 내역이 없어요.', 'No purchases to restore.') }
          : { kind: 'error', text: L('스토어에 연결하지 못했어요. 잠시 후 다시 시도해주세요.', "Couldn't connect to the store. Try again in a moment.") },
      );
    }
  };

  if (done) return <PurchaseDone plan={done.plan} onClose={close} />;

  // 1년권이면 언제까지인지 붙인다 (Android 는 어림한 날짜라 「끝날 예정」)
  const until = premiumUntilSentence(premium);
  const planName = PREMIUM_PLAN_NAMES[premium?.plan ?? 'weekly'];
  const headline = active
    ? {
        title: L('프리미엄 이용 중이에요', "You're on Premium"),
        subtitle: `${L(`${planName}으로 모든 기능을 무제한으로 쓰고 있어요.`, `Your ${planName} gives you unlimited access to everything.`)}${until ? ` ${until}` : ''}`,
      }
    : offerSignup && status.kind === 'exhausted'
      ? {
          title: L('무료 맛보기를 다 썼어요', "You've used your free trial"),
          subtitle: L(
            `가입하면 무료 코칭 ${SIGNUP_BONUS}회를 바로 더 드리고, 그 뒤로도 매일 1회씩 무료로 채워져요.`,
            `Sign up to get ${SIGNUP_BONUS} more free sessions right away — plus 1 free session every day after that.`,
          ),
        }
      : reason === 'renew' && wallet.passUntil > minuteNow
        ? { title: L(`하루 무제한이 ${formatPassEnd(wallet.passUntil, minuteNow)}에 끝나요`, `Your pass ends at ${formatPassEnd(wallet.passUntil, minuteNow)}`), subtitle }
        : { title: HEADLINES[reason].title, subtitle };

  // 비회원이 무료를 다 써서 막혔으면 가입(무료 보너스) 한 갈래만 먼저 — 결제는 「가입 없이 바로 이용권 보기」 한 줄로 접는다.
  // 가입 카드·이용권 목록·아래 결제 버튼이 한꺼번에 보여 아무것도 고르지 않고 떠나던 것을 줄인다(결제 전환 검토 약점 2).
  // 가입 없이 사는 길은 늘 남긴다 (스토어 정책: 계정 없이도 살 수 있어야 한다)
  const guestGate = offerSignup && blocked && status.kind === 'exhausted' && !buyOpen;
  const ready = showPlans && products != null && !active && !guestGate;
  // 처음 보이는 줄은 두 개 — 하루 이용권·횟수권(곧 끝나요 화면은 1년권·하루 이용권). 주간 구독·1년권은 「다른 이용권 보기」로 그 자리에서 펼친다
  // (조사 R2: 상위 결제 화면 62%가 요금제 2개). 2026-11-28: 30일 결제 3건이 모두 하루 이용권이고 1년권은 0건이라,
  // 첫 결제 문턱이 낮은 횟수권(1회 490원꼴)을 두 번째로 올렸다 — 1년권은 하루 이용권이 끝나 갈 때(renew) 먼저 권한다
  const MAIN: PlanKey[] = reason === 'renew' ? ['year', 'day'] : ['day', 'credits'];
  const mainRows = ready ? MAIN.map((k) => visible.find((p) => p.plan === k)).filter((p): p is PlanProduct => Boolean(p)) : [];
  const extraRows = ready ? visible.filter((p) => !MAIN.includes(p.plan)) : [];
  // 두 줄이 모두 없으면(스토어가 소모성 상품을 확인하지 못함) 남은 것을 바로 보여 준다
  const showExtras = moreOpen || mainRows.length === 0 || extraRows.some((p) => p.plan === chosen);
  const chosenPrice = chosen === 'day' && salePrice ? salePrice : priceOf(chosen);
  const footer = active || (ready && visible.length > 0);
  // 스토어에서 이용권을 하나도 확인하지 못했으면 결제 버튼 대신 다시 불러오기를 주 버튼으로 (확인 안 된 1년권 결제창을 열지 않게)
  const reloadMain = ready && storeUnreachable;
  // 특가 취소선·할인율은 2026-11-27 20:45 부터 (lib/billing/sale SALE_ANCHOR_FROM)
  const anchorOk = saleAnchorAllowed(minuteNow);
  const rowFor = (p: PlanProduct) => {
    if (p.plan === 'day') {
      const dayTitle = name ? L(`${shortName(name)}님을 위한 하루 이용권`, `24-hour pass for ${shortName(name)}`) : PLAN_TEXT.day.title;
      return (
        <PlanRow
          key={p.plan}
          selected={chosen === 'day'}
          onPress={() => pick('day')}
          title={dayTitle}
          caption={L(
            `${wallet.passUntil > minuteNow ? '지금 연장하면' : '지금 시작하면'} ${formatPassEnd(passEnd, minuteNow)}까지 무제한 · 자동 결제 없음`,
            `${wallet.passUntil > minuteNow ? 'Extend now' : 'Start now'}: unlimited until ${formatPassEnd(passEnd, minuteNow)} · No auto-renewal`,
          )}
          price={p.displayPrice}
          sale={saleOn && offer ? { price: offer.sale.displayPrice, regular: offer.regular.displayPrice, percent: offer.percent, left: sale.remainingMs, anchor: anchorOk } : null}
        />
      );
    }
    if (p.plan === 'year') {
      return (
        <PlanRow
          key={p.plan}
          selected={chosen === 'year'}
          onPress={() => pick('year')}
          title={PLAN_TEXT.year.title}
          caption={L(`${formatDate(yearPassEnd(minuteNow))}까지 무제한 · 자동 결제 없음`, `Unlimited until ${formatDate(yearPassEnd(minuteNow))} · No auto-renewal`)}
          note={perDayWon(priceOf('year'), p.price) ?? undefined}
          price={priceOf('year')}
        />
      );
    }
    return (
      <PlanRow
        key={p.plan}
        selected={chosen === p.plan}
        onPress={() => pick(p.plan)}
        title={PLAN_TEXT[p.plan].title}
        caption={PLAN_TEXT[p.plan].caption}
        note={p.plan === 'credits' ? (perUseWon(priceOf('credits'), p.price) ?? undefined) : undefined}
        price={priceOf(p.plan)}
        per={p.plan === 'weekly' ? PER_WEEK : undefined}
      />
    );
  };

  // 결제 없이 닫을 때 — 막혀서 들어왔으면 기기당 한 번 이유를 묻는다 (건너뛸 수 있음)
  const requestClose = () => {
    const v = visit.current;
    if (blocked && !active && !v.done && v.result !== 'signup' && !whyAsked && !asking) {
      setWhyAsked();
      setAsking(true);
      track('paywall_why_view', { reason });
      return;
    }
    close();
  };
  const answerWhy = (why: string) => {
    haptic.select();
    track('paywall_why', { reason, why, plan: visit.current.plan, picked: visit.current.picked, result: visit.current.result });
    setAsking(false);
    close();
  };

  return (
    <View style={[styles.flex, { backgroundColor: theme.background }]}>
      <Screen sheet safeTop safeBottom={!footer} contentStyle={styles.content}>
        <View style={styles.topBar}>
          <Pressable accessibilityRole="button" accessibilityLabel={L('닫기', 'Close')} onPress={requestClose} hitSlop={8} style={[styles.close, { backgroundColor: theme.surface }]}>
            <Ionicons name="close" size={20} color={theme.textSecondary} />
          </Pressable>
        </View>

        {/* 제목 한 줄 + 사실 한 줄 (1.4 개편 — 큰 그라데이션 카드·3D 티켓·연구진 배지를 걷었다) */}
        <Animated.View entering={FadeInDown.duration(280)} style={styles.head}>
          <Text accessibilityRole="header" style={[styles.headline, { color: theme.text }]}>
            {headline.title}
          </Text>
          <AppText variant="body" color="textSecondary">
            {headline.subtitle}
          </AppText>
          {!active && (status.kind === 'team' || status.kind === 'pass' || (status.credits ?? 0) > 0) ? (
            <AppText variant="caption" color="textSecondary" weight="600">
              {L('지금', 'Now')}: {quotaLabel(status)}
            </AppText>
          ) : null}
          {!active && resumes ? (
            <View style={styles.resume}>
              <Ionicons name="checkmark-circle" size={16} color={theme.primary} />
              <AppText variant="small" color="primary" weight="600" style={styles.flex}>
                {offerSignup && status.kind === 'exhausted'
                  ? L('가입하거나 이용권을 사면 방금 보낸 요청이 바로 이어져요', 'Sign up or get a pass and your last request picks right back up')
                  : L('결제하면 방금 보낸 요청이 바로 이어져요', 'Get a pass and your last request picks right back up')}
              </AppText>
            </View>
          ) : null}
          {!active ? (
            <AppText variant="caption" color="textTertiary">
              {L(RESEARCH_SHORT, RESEARCH_SHORT_EN)}
            </AppText>
          ) : null}
        </Animated.View>

        {offerSignup ? (
          <SignupCard
            onDone={(result) => {
              // 결제 없이 닫히지만 가입으로 끝났다는 걸 남긴다
              visit.current.result = 'signup';
              haptic.celebrate();
              celebrate({ kind: 'sparkles', count: 22, haptic: false });
              close();
              toast.show(
                result.bonus ? L(`가입 완료! 무료 코칭 ${SIGNUP_BONUS}회를 받았어요`, `You're in! ${SIGNUP_BONUS} free sessions added`) : L('로그인했어요.', 'Signed in.'),
                'success',
              );
            }}
          />
        ) : null}

        {guestGate && showPlans ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={L('가입 없이 바로 이용권 보기', 'Get a pass without signing up')}
            onPress={() => {
              haptic.select();
              track('paywall_guest_buy', { reason });
              setBuyOpen(true);
            }}
            hitSlop={6}
            style={[styles.guestBuy, { borderColor: theme.separator }]}>
            <View style={styles.flex}>
              <AppText variant="body" weight="600">
                {L('가입 없이 바로 이용권 보기', 'Get a pass without signing up')}
              </AppText>
              <AppText variant="caption" color="textSecondary">
                {L(`하루 무제한 ${priceText(dayPrice ?? priceOf('day'))} · 자동 결제 없음`, `24 hours unlimited for ${dayPrice ?? priceOf('day')} · No auto-renewal`)}
              </AppText>
            </View>
            <Ionicons name="chevron-forward" size={18} color={theme.textTertiary} />
          </Pressable>
        ) : null}

        {/* 얻는 것 — 체크 세 줄 (막혀서 온 사람은 이미 알고 있어 이용권 줄 아래로) */}
        {!active && !blocked ? <Benefits /> : null}

        {showPlans && !products && !active ? (
          <View style={styles.loading}>
            <ActivityIndicator color={theme.primary} />
            <AppText variant="caption" color="textSecondary">
              {L('상품 정보를 불러오는 중…', 'Loading options…')}
            </AppText>
          </View>
        ) : null}

        {mainRows.length || extraRows.length ? (
          <Animated.View entering={FadeInDown.delay(60).duration(280)} style={styles.plans} accessibilityRole="radiogroup">
            {mainRows.map(rowFor)}
            {extraRows.length && showExtras ? extraRows.map(rowFor) : null}
            {extraRows.length && !showExtras ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={L('다른 이용권 보기', 'See other passes')}
                onPress={() => {
                  haptic.select();
                  track('paywall_more', { reason });
                  setMoreOpen(true);
                }}
                hitSlop={6}
                style={styles.moreRow}>
                <AppText variant="small" color="textSecondary" style={styles.flex} numberOfLines={2}>
                  {L('다른 이용권 보기', 'See other passes')} ·{' '}
                  {extraRows
                    .map((p) => {
                      const price = priceText(priceOf(p.plan));
                      return `${PLAN_TEXT[p.plan].title}${price ? ` ${price}${p.plan === 'weekly' ? PER_WEEK : ''}` : ''}`;
                    })
                    .join(' · ')}
                </AppText>
                <Ionicons name="chevron-down" size={16} color={theme.textTertiary} />
              </Pressable>
            ) : null}
          </Animated.View>
        ) : null}

        {ready && storeUnreachable ? (
          <Pressable accessibilityRole="button" onPress={() => setLoadAttempt((n) => n + 1)} hitSlop={8} style={styles.reload}>
            <AppText variant="caption" color="textSecondary" align="center">
              {fixHint ?? L('스토어 정보를 다 불러오지 못했어요', "Couldn't load everything from the store")} ·{' '}
              <AppText variant="caption" color="primary" weight="700">
                {L('다시 불러오기', 'Try again')}
              </AppText>
            </AppText>
          </Pressable>
        ) : null}

        {ready && chosen === 'year' ? <YearPassNote price={priceOf('year')} until={formatDate(yearPassEnd(minuteNow))} storeName={storeName} /> : null}

        {!active && blocked && !guestGate ? <Benefits /> : null}

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
                {busy === 'restore' ? L('복원 중…', 'Restoring…') : L('구매 복원', 'Restore purchases')}
              </AppText>
            </Pressable>
          ) : null}
          {couponSupported && !active ? (
            <Pressable accessibilityRole="button" onPress={() => router.push('/coupon')} hitSlop={8}>
              <AppText variant="caption" color="textSecondary">
                {L('쿠폰 코드', 'Coupon code')}
              </AppText>
            </Pressable>
          ) : null}
          <Pressable accessibilityRole="link" onPress={() => Linking.openURL(APP_CONFIG.termsUrl)} hitSlop={8}>
            <AppText variant="caption" color="textSecondary">
              {L('이용약관', 'Terms')}
            </AppText>
          </Pressable>
          <Pressable accessibilityRole="link" onPress={() => Linking.openURL(APP_CONFIG.privacyUrl)} hitSlop={8}>
            <AppText variant="caption" color="textSecondary">
              {L('개인정보 처리방침', 'Privacy Policy')}
            </AppText>
          </Pressable>
        </View>
        {active ? (
          <AppText variant="caption" color="textTertiary" align="center" style={styles.research}>
            {L(RESEARCH_SHORT, RESEARCH_SHORT_EN)}
          </AppText>
        ) : null}
      </Screen>

      {footer ? (
        <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.md, backgroundColor: theme.background, borderTopColor: theme.separator }]}>
          {notice ? (
            <View accessibilityLiveRegion="polite" style={[styles.notice, { backgroundColor: notice.kind === 'error' ? theme.accentSoft : theme.surface }]}>
              <AppText variant="small" color={notice.kind === 'error' ? 'danger' : 'textSecondary'} align="center">
                {notice.text}
              </AppText>
            </View>
          ) : null}
          {active ? (
            <Button variant="brand" title={L('확인', 'Done')} onPress={close} />
          ) : reloadMain ? (
            <>
              <Button
                variant="brand"
                title={L('이용권 다시 불러오기', 'Load passes again')}
                onPress={() => {
                  track('store_retry', { reason, attempt: loadAttempt + 1, manual: true });
                  setLoadAttempt((n) => n + 1);
                }}
              />
              <AppText variant="caption" color="textSecondary" align="center">
                {fixHint ?? L(`${storeName}에서 이용권 정보를 아직 받지 못했어요`, `Couldn't load passes from ${storeName} yet`)}
              </AppText>
            </>
          ) : (
            <>
              {/* 화면에서 색이 찬 버튼은 이것 하나 — 무엇을 얼마에 사는지 버튼이 말한다(조사 R3) */}
              <GradientButton
                haptic
                title={buyTitle(chosen, chosenPrice, chosen === 'day' && salePrice != null)}
                accessibilityLabel={L(
                  `${buyTitle(chosen, chosenPrice, chosen === 'day' && salePrice != null)}, ${priceText(chosenPrice)} 결제`,
                  `${buyTitle(chosen, chosenPrice, chosen === 'day' && salePrice != null)}${chosenPrice ? `, pay ${chosenPrice}` : ''}`,
                )}
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

      {asking ? (
        <View style={styles.whyBackdrop}>
          <Animated.View entering={FadeInDown.duration(220)} style={[styles.whyCard, { backgroundColor: theme.background, paddingBottom: insets.bottom + Spacing.lg }]}>
            <AppText variant="body" weight="700">
              {L('잠깐, 하나만 물어볼게요', 'Quick question before you go')}
            </AppText>
            <AppText variant="small" color="textSecondary">
              {L('어떤 점이 망설여졌나요? 알려 주시면 더 좋게 고칠게요.', 'What held you back? It helps us make Sendit better.')}
            </AppText>
            <View style={styles.whyList}>
              {WHY_OPTIONS.map((o) => (
                <Pressable key={o.key} accessibilityRole="button" onPress={() => answerWhy(o.key)} style={[styles.whyChip, { backgroundColor: theme.surface }]}>
                  <AppText variant="body">{o.label}</AppText>
                </Pressable>
              ))}
            </View>
            <Pressable accessibilityRole="button" onPress={() => answerWhy('skip')} hitSlop={8} style={styles.whySkip}>
              <AppText variant="small" color="textSecondary" align="center">
                {L('건너뛰기', 'Skip')}
              </AppText>
            </Pressable>
          </Animated.View>
        </View>
      ) : null}
    </View>
  );
}

/** 횟수권 1회 값 — 원화 스토어 가격 ÷ 횟수, 「1회 약 490원」. 원화가 아니거나 모르면 null */
export function perUseWon(display: string, price?: number | null): string | null {
  const n = typeof price === 'number' && price > 0 ? price : Number((/^\s*₩\s?([\d,]+)\s*$/.exec(display)?.[1] ?? '').replace(/,/g, ''));
  if (!n || !Number.isFinite(n) || !/₩/.test(display)) return null;
  const per = Math.round(n / CREDITS_PER_PACK).toLocaleString('ko-KR');
  return L(`1회 약 ${per}원`, `About ₩${per} per session`);
}

/** 결제 버튼 — 금액을 넣어 무엇을 얼마에 사는지 말한다 */
function buyTitle(plan: PlanKey, price: string, sale: boolean): string {
  if (!isKo) return buyTitleEn(plan, price, sale);
  const won = priceText(price);
  switch (plan) {
    case 'day':
      return sale ? `특가 ${won}으로 시작하기` : `${won}으로 하루 무제한 시작하기`;
    case 'weekly':
      return `주 ${won}으로 구독 시작하기`;
    case 'year':
      return `${won}으로 1년 무제한 시작하기`;
    case 'lifetime': // 판매 중지 — 고를 수 없다
      return '평생권 시작하기';
    case 'credits':
      return `${won}으로 ${CREDITS_PER_PACK}회 충전하기`;
  }
}

/** 영어판 결제 버튼 — 스토어 가격을 아직 모르면(빈칸) 금액 없이 */
function buyTitleEn(plan: PlanKey, price: string, sale: boolean): string {
  switch (plan) {
    case 'day':
      if (sale) return price ? `Get the deal for ${price}` : 'Get the deal';
      return price ? `Get 24 hours for ${price}` : 'Get 24 hours unlimited';
    case 'weekly':
      return price ? `Subscribe for ${price}/week` : 'Start weekly plan';
    case 'year':
      return price ? `Get 1 year for ${price}` : 'Get the 1-year pass';
    case 'lifetime':
      return 'Get lifetime pass';
    case 'credits':
      return price ? `Get ${CREDITS_PER_PACK} credits for ${price}` : `Get ${CREDITS_PER_PACK} credits`;
  }
}

/** 결제 버튼 바로 아래 한 줄 — 무엇을 얼마에, 자동 결제가 있는지 */
function footCaption(plan: PlanKey, price: string, sale: boolean): string {
  if (!isKo) return footCaptionEn(plan, price, sale);
  const won = priceText(price);
  switch (plan) {
    case 'day':
      return `${sale ? '특가 · ' : ''}한 번만 결제돼요 · 24시간 뒤 저절로 끝나요 · 자동 결제 없음`;
    case 'weekly':
      return `해지하지 않으면 매주 ${won}이 결제돼요 · 언제든 해지할 수 있어요`;
    case 'year':
      return '한 번만 결제돼요 · 1년 뒤 저절로 끝나요 · 자동 결제 없음';
    case 'lifetime': // 판매 중지 — 고를 수 없다
      return `${won} 한 번 결제 · 자동 결제 없음`;
    case 'credits':
      return `한 번만 결제돼요 · 코칭 ${CREDITS_PER_PACK}회 · 기간 제한 없음`;
  }
}

/** 영어판 결제 버튼 아래 한 줄 */
function footCaptionEn(plan: PlanKey, price: string, sale: boolean): string {
  switch (plan) {
    case 'day':
      return `${sale ? 'Special price · ' : ''}One-time payment · Ends after 24 hours · No auto-renewal`;
    case 'weekly':
      return `${price ? `Renews at ${price}/week` : 'Renews weekly'} until you cancel · Cancel anytime`;
    case 'year':
      return 'One-time payment · Ends after 1 year · No auto-renewal';
    case 'lifetime':
      return `${price ? `${price} one-time` : 'One-time payment'} · No auto-renewal`;
    case 'credits':
      return `One-time payment · ${CREDITS_PER_PACK} sessions · Never expires`;
  }
}

/** 영어판 결제 안내 (자동 결제·환불·기기 이동) */
function fineTextEn(plan: PlanKey, price: string, storeName: string, sale: boolean): string {
  const once = price ? `a one-time payment of ${price}` : 'a one-time payment';
  if (plan === 'weekly')
    return `The weekly plan renews automatically${price ? ` at ${price} per week` : ' every week'}, charged to your ${storeName} account, unless you cancel. You can cancel anytime in your ${storeName} account's subscription settings at least 24 hours before the current period ends.`;
  if (plan === 'year')
    return `The 1-year pass is ${once} for unlimited use for 1 year from the purchase date. It never renews or charges you again. After a year you go back to the free plan — just buy again if you want to keep going. On the same ${storeName} account, you can use it on a new device with “Restore purchases.”`;
  const common = "It doesn't renew automatically and only works on this device (it can't be moved or restored to another device).";
  if (plan === 'day' && sale)
    return `The 24-hour pass deal is ${once} for 24 hours of unlimited use from purchase (same as the 24-hour pass). The deal opens once every 7 days for ${SALE_WINDOW_MS / 60_000} minutes. You can only get it before the countdown ends — after that, it's back to the regular price. If you already have a pass, 24 hours are added on. ${common}`;
  if (plan === 'day') return `The 24-hour pass is ${once} for 24 hours of unlimited use from purchase. If you already have a pass, 24 hours are added on. ${common}`;
  return `The credit pack is ${once} for ${CREDITS_PER_PACK} coaching sessions that never expire. Free sessions are used first, then credits. ${common}`;
}

function fineText(plan: PlanKey, display: string, storeName: string, sale = false): string {
  if (!isKo) return fineTextEn(plan, display, storeName, sale);
  const price = priceText(display);
  if (plan === 'weekly')
    return `주간 구독은 해지하지 않으면 매주 ${price}이 ${storeName} 계정으로 자동 결제돼요. 현재 기간이 끝나기 24시간 전까지 ${storeName} 계정 설정의 구독 메뉴에서 언제든 해지할 수 있어요.`;
  if (plan === 'year')
    return `1년권은 ${price} 1회 결제로 결제한 날부터 1년 동안 무제한이에요. 자동으로 갱신되거나 다시 결제되지 않아요. 1년이 지나면 무료 이용으로 돌아가고, 계속 쓰려면 그때 다시 결제하면 돼요. 같은 ${storeName} 계정이면 기기를 바꿔도 「구매 복원」으로 다시 쓸 수 있어요.`;
  const common = '자동으로 다시 결제되지 않고, 결제한 이 기기에서 쓸 수 있어요 (다른 기기로 옮기거나 복원되지 않아요).';
  if (plan === 'day' && sale)
    return `하루 이용권 특가는 ${price} 1회 결제로 결제한 때부터 24시간 동안 무제한이에요 (하루 이용권과 똑같아요). 특가는 7일에 한 번, ${SALE_WINDOW_MS / 60_000}분 동안 열려요. 표시된 마감 시각까지만 살 수 있고, 마감 뒤에는 정가로 돌아가요. 이미 이용 중이면 24시간이 이어서 늘어나요. ${common}`;
  if (plan === 'day') return `하루 이용권은 ${price} 1회 결제로 결제한 때부터 24시간 동안 무제한이에요. 이미 이용 중이면 24시간이 이어서 늘어나요. ${common}`;
  return `횟수권은 ${price} 1회 결제로 코칭 ${CREDITS_PER_PACK}회가 충전되고 기간 제한이 없어요. 무료 횟수를 먼저 쓰고 그다음 횟수권이 차감돼요. ${common}`;
}

/** 이용권으로 얻는 것 — 체크 세 줄 */
function Benefits() {
  const theme = useTheme();
  return (
    <View style={styles.benefits} accessibilityLabel={L(`이용권이면 ${BENEFITS.join(', ')}`, `With a pass: ${BENEFITS.join(', ')}`)}>
      {BENEFITS.map((b) => (
        <View key={b} style={styles.benefit}>
          <Ionicons name="checkmark" size={17} color={theme.text} />
          <AppText variant="small" style={styles.flex}>
            {b}
          </AppText>
        </View>
      ))}
    </View>
  );
}

interface RowSale {
  price: string;
  regular: string;
  percent: number;
  left: number;
  /** 취소선 정가·할인율을 보여도 되는지 (lib/billing/sale SALE_ANCHOR_FROM) */
  anchor: boolean;
}

/**
 * 이용권 한 줄 — 1.4 개편: 모든 이용권이 같은 모양(회색 면 + 왼쪽 동그라미 + 이름·설명 + 오른쪽 값).
 * 고르면 검정 테두리와 검정 체크. 값은 모두 같은 크기(17pt) — 예전의 40pt 흰 숫자·그라데이션 테두리·배지를 걷었다.
 * 특가 중이면 값이 특가로 바뀌고 「특가 마감까지 09:41」(1초마다, 실제 시각 기준)이 붙는다.
 */
function PlanRow({ selected, onPress, title, caption, note, price, per, sale }: { selected: boolean; onPress: () => void; title: string; caption: string; note?: string; price: string; per?: string; sale?: RowSale | null }) {
  const theme = useTheme();
  const dark = useColorScheme() === 'dark';
  const shown = sale ? sale.price : price;
  const spoken = sale
    ? L(
        `특가 ${priceText(sale.price)}${sale.anchor ? `, 정가 ${priceText(sale.regular)}` : ''}, 특가 마감까지 ${formatClock(sale.left)}`,
        `Deal ${sale.price}${sale.anchor ? `, regular ${sale.regular}` : ''}, deal ends in ${formatClock(sale.left)}`,
      )
    : `${priceText(price)}${per ? L(` ${per}`, ' per week') : ''}`;
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={`${title}, ${spoken}, ${caption}${note ? `, ${note}` : ''}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: dark ? theme.surfaceElevated : theme.surface, borderColor: selected ? theme.text : 'transparent', opacity: pressed ? 0.85 : 1 },
      ]}>
      <View style={[styles.radio, selected ? { backgroundColor: theme.text, borderColor: theme.text } : { borderColor: theme.textTertiary }]}>
        {selected ? <Ionicons name="checkmark" size={14} color={theme.background} /> : null}
      </View>
      <View style={styles.rowTexts}>
        <AppText variant="bodyStrong" numberOfLines={2}>
          {title}
        </AppText>
        <AppText variant="caption" color="textSecondary">
          {caption}
        </AppText>
        {note ? (
          <AppText variant="caption" color="textSecondary" weight="600">
            {note}
          </AppText>
        ) : null}
        {sale ? (
          <AppText variant="caption" color="primary" weight="700" style={styles.saleClock}>
            {L('특가 마감까지', 'Deal ends in')} {formatClock(sale.left)}
          </AppText>
        ) : null}
      </View>
      <View style={styles.rowPrice}>
        {sale && sale.anchor ? <Text style={[styles.regular, { color: theme.textTertiary }]}>{priceText(sale.regular)}</Text> : null}
        <Text style={[styles.price, { color: sale ? theme.primary : theme.text }]}>
          {priceText(shown)}
          {per ? <Text style={[styles.per, { color: theme.textSecondary }]}>{per}</Text> : null}
        </Text>
        {sale && sale.anchor ? (
          <AppText variant="caption" color="primary" weight="700">
            {sale.percent}% {L('할인', 'off')}
          </AppText>
        ) : sale ? (
          <AppText variant="caption" color="primary" weight="700">
            {L('특가', 'Deal')}
          </AppText>
        ) : null}
      </View>
    </Pressable>
  );
}

/**
 * 1년권을 고르면 결제 버튼 위에 무엇을 사는지 또렷하게 보여 준다 — 언제까지 쓰는지(지금 결제하면 1년 뒤 같은 날),
 * 자동 결제가 없다는 것, 끝나면 어떻게 되는지, 기기를 바꿨을 때. 앱이 실제로 하는 일만 적는다 (끝나기 전 알림 같은 약속은 하지 않는다)
 */
function YearPassNote({ price, until, storeName }: { price: string; until: string; storeName: string }) {
  const theme = useTheme();
  const items = L(
    [
      `지금 결제하면 ${until}까지 코칭·속마음·보고서 무제한`,
      `${priceText(price)} 한 번 결제 · 자동 갱신·자동 결제 없음 · 따로 해지하지 않아도 돼요`,
      '1년이 지나면 무료 이용으로 돌아가요 · 계속 쓰려면 그때 다시 결제하면 돼요',
      `같은 ${storeName} 계정이면 기기를 바꿔도 「구매 복원」으로 다시 쓸 수 있어요`,
    ],
    [
      `Pay now for unlimited coaching, mind reads and reports until ${until}`,
      `${price ? `${price} one-time` : 'One-time payment'} · No auto-renewal or auto-charge · Nothing to cancel`,
      'After a year you go back to the free plan · Buy again anytime to keep going',
      `On the same ${storeName} account, use “Restore purchases” to get it back on a new device`,
    ],
  );
  return (
    <View style={[styles.promise, { borderColor: theme.separator }]} accessibilityLabel={L('1년권 안내', 'About the 1-year pass')}>
      <AppText variant="smallStrong">{L('1년권 안내', 'About the 1-year pass')}</AppText>
      {items.map((t) => (
        <View key={t} style={styles.promiseRow}>
          <Ionicons name="checkmark" size={15} color={theme.textSecondary} />
          <AppText variant="caption" color="textSecondary" style={styles.flex}>
            {t}
          </AppText>
        </View>
      ))}
      <AppText variant="caption" color="primary" weight="700" accessibilityRole="link" onPress={() => Linking.openURL(`${APP_CONFIG.termsUrl}#year`)}>
        {L('1년권 약관 전문 보기 ›', 'Read the full 1-year pass terms ›')}
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
  const text: Record<PlanKey, { title: string; body: string }> = L(
    {
      day: { title: '하루 무제한 시작!', body: passUntil > now ? `${formatPassEnd(passUntil, now)}까지 마음껏 물어봐요.` : '지금부터 24시간 동안 마음껏 물어봐요.' },
      weekly: { title: '주간 구독 시작!', body: '이제 횟수 걱정 없이 마음껏 물어봐요.' },
      year: { title: '1년권 시작!', body: '이제 1년 동안 횟수 걱정 없이 마음껏 물어봐요.' },
      lifetime: { title: '평생권 시작!', body: '이제 횟수 걱정 없이 마음껏 물어봐요.' }, // 판매 중지 — 결제로는 오지 않는다
      credits: { title: `횟수권 ${CREDITS_PER_PACK}회 충전!`, body: '필요할 때 한 번씩 꺼내 써요.' },
    },
    {
      day: { title: 'Your 24 hours start now!', body: passUntil > now ? `Ask away until ${formatPassEnd(passUntil, now)}.` : 'Ask away for the next 24 hours.' },
      weekly: { title: 'Weekly plan is on!', body: 'No more limits — ask away.' },
      year: { title: '1-year pass is on!', body: 'No limits for a whole year — ask away.' },
      lifetime: { title: 'Lifetime pass is on!', body: 'No more limits — ask away.' },
      credits: { title: `${CREDITS_PER_PACK} credits added!`, body: 'Use them whenever you need.' },
    },
  );
  return (
    <View style={[styles.flex, { backgroundColor: theme.background, paddingTop: top + Spacing.xxl, paddingBottom: insets.bottom + Spacing.lg }]}>
      <View style={styles.doneBody} accessibilityLiveRegion="polite">
        {/* 1.4 개편: 3D 티켓·빛 번짐 대신 파란 체크 원 하나 — 축하(색종이)는 결제 순간 한 번만 */}
        <Animated.View entering={ZoomIn.duration(260)} style={[styles.doneIcon, { backgroundColor: theme.primary }]}>
          <Ionicons name="checkmark" size={40} color={Brand.onBrand} />
        </Animated.View>
        <Animated.View entering={FadeInDown.delay(120).duration(280)} style={styles.doneTexts}>
          <AppText variant="smallStrong" color="primary" align="center">
            {L('결제 완료', 'Payment complete')}
          </AppText>
          <Text accessibilityRole="header" style={[styles.doneTitle, { color: theme.text }]}>
            {text[plan].title}
          </Text>
          <AppText variant="body" color="textSecondary" align="center">
            {text[plan].body}
          </AppText>
        </Animated.View>
      </View>
      <Animated.View entering={FadeInDown.delay(200).duration(280)} style={styles.doneFoot}>
        <GradientButton title={L('바로 이어서 하기', 'Keep going')} onPress={onClose} />
      </Animated.View>
    </View>
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
    Linking.openURL(STORE_URL[store]).catch(() => toast.show(L(`${STORE_LABEL[store]}를 열지 못했어요.`, `Couldn't open ${STORE_LABEL[store]}.`), 'error'));
  };

  return (
    <View style={styles.download}>
      <View style={[styles.webNotice, { backgroundColor: theme.surface }]}>
        <AppText variant="smallStrong" align="center">
          {L('이용권은 앱에서 결제할 수 있어요', 'Passes are available in the app')}
        </AppText>
        <AppText variant="caption" color="textSecondary" align="center">
          {L(
            `${desktop ? '휴대폰에 앱을 받아' : `${STORE_LABEL[device]}에서 앱을 받아`} 결제하면 횟수 제한 없이 바로 이어서 코칭받을 수 있어요.`,
            `${desktop ? 'Get the app on your phone' : `Get the app on ${STORE_LABEL[device]}`} and grab a pass to keep coaching with no limits.`,
          )}
        </AppText>
      </View>
      <View style={desktop ? styles.storeRow : null}>
        {stores.map((store) => (
          <Button
            key={store}
            variant="brand"
            title={desktop ? STORE_LABEL[store] : L(`${STORE_LABEL[store]}에서 앱 받기`, `Get it on ${STORE_LABEL[store]}`)}
            icon={<Ionicons name={store === 'ios' ? 'logo-apple' : 'logo-google-playstore'} size={18} color={Brand.onBrand} />}
            onPress={() => open(store)}
            style={desktop ? styles.storeButton : undefined}
          />
        ))}
      </View>
      {desktop ? (
        <AppText variant="caption" color="textSecondary" align="center">
          {L('휴대폰에서 이 페이지를 열면 기기에 맞는 스토어로 바로 안내해 드려요.', "Open this page on your phone and we'll take you to the right store.")}
        </AppText>
      ) : null}
      {Platform.OS === 'web' ? (
        <AppText variant="caption" color="textTertiary" align="center">
          {L(`웹에서도 ${authAvailable ? '가입하면 ' : ''}매일 무료 코칭이 충전돼요.`, `Free coaching refills daily on the web too${authAvailable ? ' when you sign up' : ''}.`)}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { gap: Spacing.lg + 4, paddingBottom: Spacing.xl },
  topBar: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', marginBottom: -Spacing.md },
  close: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  head: { gap: Spacing.sm },
  // 1.4 개편: 28pt 두 줄 + 파란 강조 → 24pt 한 문장
  headline: { fontSize: 24, lineHeight: 32, fontWeight: '700', letterSpacing: -0.6 },
  loading: { alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.xl },

  plans: { gap: Spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, borderRadius: 20, borderWidth: 2, paddingHorizontal: Spacing.md + 2, paddingVertical: Spacing.md + 2, minHeight: 72 },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  rowTexts: { flex: 1, gap: 2 },
  rowPrice: { alignItems: 'flex-end', gap: 1 },
  price: { fontSize: 17, lineHeight: 22, fontWeight: '700', letterSpacing: -0.3 },
  per: { fontSize: 13, fontWeight: '600' },
  regular: { fontSize: 13, lineHeight: 16, fontWeight: '500', textDecorationLine: 'line-through' },
  saleClock: { fontVariant: ['tabular-nums'], marginTop: 2 },
  moreRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, minHeight: 44, paddingHorizontal: Spacing.xs },

  reload: { marginTop: -Spacing.sm },
  promise: { borderRadius: 20, borderWidth: 1, padding: Spacing.lg, gap: Spacing.sm },
  promiseRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  benefits: { gap: Spacing.sm, paddingHorizontal: 2 },
  benefit: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  fine: { marginTop: -Spacing.sm, lineHeight: 18 },
  links: { flexDirection: 'row', justifyContent: 'center', gap: Spacing.lg, flexWrap: 'wrap' },
  research: { marginTop: -Spacing.md },
  resume: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  guestBuy: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, borderWidth: 1, borderRadius: 20, paddingHorizontal: Spacing.md + 2, paddingVertical: Spacing.md },
  whyBackdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  whyCard: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: Spacing.lg, paddingTop: Spacing.lg, gap: Spacing.sm },
  whyList: { gap: Spacing.sm, marginTop: Spacing.xs },
  whyChip: { borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.md - 2 },
  whySkip: { alignSelf: 'center', paddingVertical: Spacing.sm },

  footer: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.md, gap: Spacing.sm, borderTopWidth: StyleSheet.hairlineWidth },
  notice: { borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm },

  doneIcon: { width: 84, height: 84, borderRadius: 42, alignItems: 'center', justifyContent: 'center' },
  doneBody: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.lg, paddingHorizontal: Spacing.xl },
  doneTexts: { alignItems: 'center', gap: Spacing.sm },
  doneTitle: { fontSize: 26, lineHeight: 34, fontWeight: '700', letterSpacing: -0.6, textAlign: 'center' },
  doneFoot: { paddingHorizontal: Spacing.lg },

  download: { gap: Spacing.md },
  webNotice: { borderRadius: Radius.lg, padding: Spacing.lg, gap: Spacing.xs },
  storeRow: { flexDirection: 'row', gap: Spacing.sm },
  storeButton: { flex: 1 },
});
