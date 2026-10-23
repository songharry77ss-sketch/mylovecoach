/**
 * 결제 흐름 텔레그램 알림 — 결제 화면 열림·앱 받기 누름·결제창 진입·결제 결과(완료·취소·오류·대기).
 * /api/track 이 이용 기록을 저장한 뒤 부른다 (저장 조건을 통과한 기록만 — 만 14세 미만·처리 정지 기기·수집 판 미달은 여기까지 오지 않음).
 *
 * 한 번 받은 묶음(앱은 8초마다 모아 보냄)에서 알릴 이벤트를 모아 기기당 메시지 한 통으로 보낸다.
 * 결제 화면만 연 것(결제 시도 없음)은 같은 기기에서 10분에 한 번만 알린다. 결제창 진입·결과는 늘 알린다.
 * 스토어가 확인한 실제 결제는 따로 /api/store-apple·store-google 이 알린다 (여기는 앱이 보고한 결과).
 *
 * 환경변수 FUNNEL_ALERTS: 'off' 면 보내지 않음, 'purchase' 면 결제창 진입·결과만(결제 화면 열림·앱 받기 제외). 없으면 전부.
 * 이용자가 적은 값(닉네임·이메일·유입 경로·오류 문구)은 escapeHtml 로 감싼다.
 */
import { countRows, query } from './_supabase';
import { escapeHtml, notifyTelegram, telegramReady } from './_telegram';

export interface AlertEvent {
  name: string;
  props: Record<string, string | number | boolean | null> | null;
}

/** 결제 화면을 연 곳 (src/app/paywall.tsx 의 reason) */
export const REASON_LABELS: Record<string, string> = {
  quota: '무료 횟수를 다 써서',
  regenerate: '다른 답장 더 보기에서',
  my: '마이 탭에서',
  // 채팅방 입력창 위 「무료 코칭 N회 남았어요 · 무제한 이용」 (홈 배너 아님 — 1.0.4 이하 앱은 채팅 속 안내 카드도 이 값)
  banner: '채팅 입력창 안내에서',
  // 채팅 속 「답장이 도움이 됐나요?」 카드 (1.0.5~)
  upsell: '채팅 속 「도움이 됐나요?」 카드에서',
  report: '상대 분석 보고서에서',
  practice: '연애 연습에서',
  mind: '속마음 카드에서',
};

export const PLAN_LABELS: Record<string, string> = {
  day: '하루 이용권',
  weekly: '주간 구독',
  lifetime: '평생권',
  credits: '횟수권',
};

const PLATFORM_LABELS: Record<string, string> = { ios: 'iOS 앱', android: 'Android 앱', web: '웹' };
const PROVIDER_LABELS: Record<string, string> = { kakao: '카카오', google: 'Google', apple: 'Apple' };

/** 이벤트 하나의 중요도 — 클수록 제목에 쓴다. 0 이면 알리지 않는다 */
const RANK: Record<string, number> = {
  paywall_close: 1,
  paywall_open: 2,
  app_download_click: 3,
  purchase_start: 4,
  purchase_cancelled: 5,
  purchase_pending: 6,
  purchase_error: 7,
  purchase_purchased: 8,
  purchase_granted: 8,
};
/** 결제창 진입·결과 — 쿨다운 없이 늘 알림 */
const PURCHASE_EVENTS = new Set(['purchase_start', 'purchase_cancelled', 'purchase_pending', 'purchase_error', 'purchase_purchased', 'purchase_granted']);
/** 이것만 있으면(결제 화면 닫기) 알리지 않는다 — 다른 알림에 한 줄로만 붙인다 */
const TAIL_ONLY = new Set(['paywall_close']);

export const PAYWALL_COOLDOWN_MS = 10 * 60 * 1000;
/** 한 서버 인스턴스가 한 시간에 보내는 알림 상한 (가짜 기기 ID 로 대화방을 도배하지 못하게) */
export const HOURLY_CAP = 40;

const text = (v: unknown, max = 80): string => escapeHtml(String(v ?? '').slice(0, max));
const planText = (props: AlertEvent['props']): string => PLAN_LABELS[String(props?.plan ?? '')] ?? (props?.plan ? text(props.plan, 24) : '상품 모름');

/** 이벤트 한 줄 */
export function eventLine(e: AlertEvent): string | null {
  const p = e.props;
  switch (e.name) {
    case 'paywall_open':
      return `👀 결제 화면 열림 · ${REASON_LABELS[String(p?.reason ?? '')] ?? (p?.reason ? text(p.reason, 24) : '들어온 곳 모름')}`;
    case 'app_download_click':
      return `📲 앱 받기 누름 · ${p?.store === 'ios' ? 'App Store' : p?.store === 'android' ? 'Google Play' : '스토어 모름'}`;
    case 'purchase_start':
      return `🛒 결제창 진입 · ${planText(p)}`;
    case 'purchase_purchased':
    case 'purchase_granted':
      return `✅ 앱에서 결제 완료 · ${planText(p)} (스토어 확인 알림이 따로 와요)`;
    case 'purchase_cancelled':
      return `↩️ 결제 취소 · ${planText(p)}`;
    case 'purchase_pending':
      return `⏳ 결제 승인 대기 · ${planText(p)}`;
    case 'purchase_error':
      return `⚠️ 결제 오류 · ${planText(p)}${p?.message ? ` · ${text(p.message, 100)}` : ''}`;
    case 'paywall_close': {
      const sec = typeof p?.sec === 'number' ? `${Math.round(p.sec)}초` : '';
      return `🚪 결제 없이 닫음${sec ? ` · ${sec} 머묾` : ''}${p?.picked === true ? ' · 상품을 직접 골라 봄' : ''}`;
    }
    default:
      return null;
  }
}

/** 이 묶음에서 알릴 이벤트만 (모드·닫기만 있는 경우 반영) */
export function alertEvents(events: AlertEvent[], mode: string | undefined = process.env.FUNNEL_ALERTS): AlertEvent[] {
  const m = (mode ?? '').trim().toLowerCase();
  if (m === 'off' || m === '0' || m === 'false') return [];
  const picked = events.filter((e) => RANK[e.name] && (m !== 'purchase' || PURCHASE_EVENTS.has(e.name) || TAIL_ONLY.has(e.name)));
  return picked.some((e) => !TAIL_ONLY.has(e.name)) ? picked : [];
}

export interface AlertContext {
  platform: string | null;
  appVersion: string | null;
  premiumPlan: string | null;
  member: { nickname: string | null; email: string | null; provider: string | null } | null;
  source: string | null;
  coachCount: number | null;
  paywallOpens: number | null;
}

/** 텔레그램 메시지 (HTML) */
export function funnelMessage(events: AlertEvent[], ctx: AlertContext): string {
  const lines = events.map(eventLine).filter((l): l is string => Boolean(l));
  const top = [...events].sort((a, b) => (RANK[b.name] ?? 0) - (RANK[a.name] ?? 0))[0];
  const title =
    top?.name === 'purchase_purchased' || top?.name === 'purchase_granted'
      ? '💰 결제 완료 (앱 보고)'
      : top?.name === 'purchase_error'
        ? '⚠️ 결제 오류'
        : top?.name && PURCHASE_EVENTS.has(top.name)
          ? '🛒 결제 진행'
          : top?.name === 'app_download_click'
            ? '📲 웹에서 앱 받기'
            : '👀 결제 화면 열림';
  const who = ctx.member
    ? `👤 ${text(ctx.member.nickname ?? '(닉네임 없음)', 40)} · ${text(ctx.member.email ?? '(이메일 없음)', 80)}${ctx.member.provider ? ` (${PROVIDER_LABELS[ctx.member.provider] ?? text(ctx.member.provider, 16)})` : ''}`
    : '👤 비회원';
  const device = [ctx.platform ? (PLATFORM_LABELS[ctx.platform] ?? text(ctx.platform, 16)) : '기기 모름', ctx.appVersion ? text(ctx.appVersion, 16) : null].filter(Boolean).join(' ');
  const stats = [
    ctx.coachCount != null ? `코칭 ${ctx.coachCount}회` : null,
    ctx.paywallOpens != null ? `결제 화면 ${ctx.paywallOpens}번째` : null,
    ctx.premiumPlan ? `이용 중: ${PLAN_LABELS[ctx.premiumPlan] ?? text(ctx.premiumPlan, 24)}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  return [title, ...lines, who, `📱 ${device} · 🧭 유입: ${ctx.source ? text(ctx.source, 80) : '모름'}`, stats ? `📊 ${stats}` : null].filter(Boolean).join('\n');
}

// ── 쿨다운·상한 (인스턴스 메모리 — 최선 노력. 인스턴스가 여러 개면 조금 더 갈 수 있음) ──
const lastPaywallAlert = new Map<string, number>();
let hourStart = 0;
let sentThisHour = 0;

/** 테스트용 */
export function resetFunnelAlertState(): void {
  lastPaywallAlert.clear();
  hourStart = 0;
  sentThisHour = 0;
}

/** 보낼지 정하고 보낼 거면 기록한다 */
export function shouldAlert(deviceId: string, events: AlertEvent[], now = Date.now()): boolean {
  if (!events.length) return false;
  if (now - hourStart >= 60 * 60 * 1000) {
    hourStart = now;
    sentThisHour = 0;
  }
  if (sentThisHour >= HOURLY_CAP) return false;
  const purchase = events.some((e) => PURCHASE_EVENTS.has(e.name));
  if (!purchase) {
    const last = lastPaywallAlert.get(deviceId);
    if (last != null && now - last < PAYWALL_COOLDOWN_MS) return false;
  }
  lastPaywallAlert.set(deviceId, now);
  if (lastPaywallAlert.size > 2000) lastPaywallAlert.delete(lastPaywallAlert.keys().next().value as string);
  sentThisHour += 1;
  return true;
}

interface UserRow {
  user_id: string | null;
  source: string | null;
  source_detail: { medium?: unknown; campaign?: unknown } | null;
}

/** 알림에 붙일 회원·유입·횟수를 모은다. 못 읽은 값은 비워 둔다 */
async function loadContext(deviceId: string, base: Pick<AlertContext, 'platform' | 'appVersion' | 'premiumPlan'> & { source: string | null }): Promise<AlertContext> {
  const device = `device_id=eq.${encodeURIComponent(deviceId)}`;
  const [users, coachCount, paywallOpens] = await Promise.all([
    query<UserRow>('app_user', `select=user_id,source,source_detail&${device}&limit=1`),
    countRows('app_event', `${device}&name=eq.coach_success`),
    countRows('app_event', `${device}&name=eq.paywall_open`),
  ]);
  const user = users?.[0] ?? null;
  const members = user?.user_id
    ? await query<{ nickname: string | null; email: string | null; provider: string | null }>('member', `select=nickname,email,provider&user_id=eq.${encodeURIComponent(user.user_id)}&provider=not.is.null&limit=1`)
    : null;
  const detail = user?.source_detail ?? {};
  const extra = [detail.medium, detail.campaign].filter((v): v is string => typeof v === 'string' && Boolean(v.trim()));
  const recorded = user?.source ? [user.source, ...extra.filter((v) => v !== user.source)].join(' · ') : null;
  return { ...base, source: recorded ?? base.source, member: members?.[0] ?? null, coachCount, paywallOpens };
}

/**
 * 결제 흐름 알림을 보낸다. 텔레그램이 없거나 알릴 이벤트가 없으면 아무것도 읽지 않는다. 실패해도 예외 없음.
 * 이용 기록 응답이 늘어지지 않게 조회·전송을 합쳐 timeoutMs 안에 끝낸다.
 */
export async function alertFunnel(
  deviceId: string,
  events: AlertEvent[],
  base: Pick<AlertContext, 'platform' | 'appVersion' | 'premiumPlan'> & { source: string | null },
  timeoutMs = 6000,
): Promise<boolean> {
  if (!telegramReady()) return false;
  const picked = alertEvents(events);
  if (!shouldAlert(deviceId, picked)) return false;
  const work = (async () => {
    try {
      return await notifyTelegram(funnelMessage(picked, await loadContext(deviceId, base)));
    } catch (e) {
      console.warn('[funnel-alert] 실패:', e instanceof Error ? e.name : 'unknown');
      return false;
    }
  })();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<boolean>((resolve) => {
    timer = setTimeout(() => resolve(false), timeoutMs);
  });
  try {
    return await Promise.race([work, timeout]);
  } finally {
    clearTimeout(timer);
  }
}
