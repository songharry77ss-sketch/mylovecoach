/**
 * 스토어 결제 알림 공통 도우미 — api/store-apple.ts(App Store 서버 알림)·api/store-google.ts(Google Play 실시간 알림)·api/daily-report.ts.
 * 받은 알림은 store_event 표(supabase/store_event.sql)에 한 줄씩 남기고, 처음 받은 알림만 운영자 텔레그램으로 알린다.
 * 매출은 실제 결제(Production)만 더한다 — 샌드박스·연결 확인 알림은 빼고.
 */
import { FALLBACK_PRICES, planOfProduct, type PlanKey } from '../src/lib/billing/plans';

import { insertNew, query } from './_supabase';
import { escapeHtml, formatWon, kstMidnight } from './_telegram';

export type StoreName = 'apple' | 'google';
export type StoreKind = 'purchase' | 'renewal' | 'refund' | 'cancel' | 'expire' | 'fail' | 'test' | 'other';

export interface StoreEventRow {
  store: StoreName;
  /** Production · Sandbox · test (Google 연결 확인) */
  environment: string | null;
  kind: StoreKind;
  /** 스토어가 붙인 알림 이름 (예: DID_RENEW/BILLING_RECOVERY, SUBSCRIPTION_RENEWED) */
  notification: string | null;
  product_id: string | null;
  plan: PlanKey | null;
  amount: number | null;
  currency: string | null;
  transaction_id: string | null;
  original_transaction_id: string | null;
  /** 필요한 항목만 골라 남긴 알림 내용 (이름·이메일 등은 들어 있지 않음) */
  raw: Record<string, unknown> | null;
}

/** 결제 화면(src/app/paywall.tsx)과 같은 상품 이름 */
export const PLAN_LABELS: Record<PlanKey, string> = {
  day: '하루 이용권',
  weekly: '주간 구독',
  lifetime: '평생권',
  credits: '횟수권 10회',
};

export const STORE_LABELS: Record<StoreName, string> = { apple: 'iOS', google: 'Android' };

export const planLabel = (plan: PlanKey | null, productId: string | null): string =>
  plan ? PLAN_LABELS[plan] : productId ? escapeHtml(productId) : '상품 모름';

/** 정가(원) — 스토어가 금액을 알려 주지 않을 때(Google 실시간 알림) 쓴다 */
export const listPriceKrw = (plan: PlanKey | null): number | null => {
  if (!plan) return null;
  const digits = FALLBACK_PRICES[plan].replace(/[^0-9]/g, '');
  return digits ? Number(digits) : null;
};

export const planOf = (productId: string | null | undefined): PlanKey | null => (productId ? planOfProduct(productId) : null);

/**
 * store_event 에 남긴다. 같은 (스토어, 거래 ID, 종류)가 이미 있으면(스토어가 같은 알림을 다시 보낸 것) 'duplicate'.
 * 표가 없거나 데이터베이스에 닿지 못하면 'failed' — 이때도 알림은 보낸다(놓치는 것보다 두 번 받는 편이 낫다).
 */
export async function recordStoreEvent(row: StoreEventRow): Promise<'new' | 'duplicate' | 'failed'> {
  const inserted = await insertNew('store_event', row, 'store,transaction_id,kind');
  if (inserted === null) return 'failed';
  return inserted > 0 ? 'new' : 'duplicate';
}

export interface Revenue {
  /** 원화 매출 합계 */
  krw: number;
  /** 결제·갱신 건수 */
  count: number;
  /** 원화가 아닌 통화별 합계 (해외 스토어 결제) */
  other: Record<string, number>;
}

/** 실제 결제(Production)의 결제·갱신 행에서 매출을 더한다 */
export function sumRevenue(rows: { amount: number | string | null; currency: string | null }[]): Revenue {
  const out: Revenue = { krw: 0, count: 0, other: {} };
  for (const row of rows) {
    out.count += 1;
    const amount = Number(row.amount ?? 0);
    if (!Number.isFinite(amount)) continue;
    const currency = (row.currency ?? 'KRW').toUpperCase();
    if (currency === 'KRW') out.krw += amount;
    else out.other[currency] = (out.other[currency] ?? 0) + amount;
  }
  return out;
}

export const formatRevenue = (r: Revenue): string =>
  [formatWon(r.krw), ...Object.entries(r.other).map(([c, v]) => `${escapeHtml(c)} ${Math.round(v * 100) / 100}`)].join(' + ');

/** 알림에 「오늘 매출」 줄을 붙일 기록인지 — 실제 결제(Production)의 결제·갱신만 */
export const countsAsRevenue = (row: StoreEventRow): boolean => row.environment === 'Production' && (row.kind === 'purchase' || row.kind === 'renewal');

/** 오늘(한국 날짜) 실제 결제 매출. 읽지 못하면 null */
export async function todayRevenue(now = Date.now()): Promise<Revenue | null> {
  const since = encodeURIComponent(kstMidnight(now).toISOString());
  const rows = await query<{ amount: number | null; currency: string | null }>(
    'store_event',
    `select=amount,currency&environment=eq.Production&kind=in.(purchase,renewal)&created_at=gte.${since}&limit=1000`,
  );
  return rows ? sumRevenue(rows) : null;
}

const money = (row: StoreEventRow): string => {
  if (row.amount == null) return '';
  const currency = (row.currency ?? 'KRW').toUpperCase();
  return currency === 'KRW' ? ` ${formatWon(row.amount)}` : ` ${escapeHtml(currency)} ${row.amount}`;
};

/**
 * 운영자에게 보낼 문구. 알리지 않는 종류(other)면 null.
 * note: 재구독·대기 결제 취소처럼 덧붙일 말 (escape 된 값)
 */
export function storeAlertText(row: StoreEventRow, revenue: Revenue | null, note = ''): string | null {
  const store = STORE_LABELS[row.store];
  const sandbox = row.environment === 'Sandbox' ? '[샌드박스] ' : '';
  const item = planLabel(row.plan, row.product_id);
  const extra = note ? ` (${note})` : '';
  let line: string;
  switch (row.kind) {
    case 'purchase':
      line = `💳 결제 · ${item}${money(row)} · ${store}${extra}`;
      break;
    case 'renewal':
      line = `🔁 구독 갱신 · ${item}${money(row)} · ${store}${extra}`;
      break;
    case 'refund':
      line = `↩️ 환불 · ${item}${money(row)} · ${store}${extra}`;
      break;
    case 'cancel':
      line = row.plan === 'weekly' || !row.plan ? `⚠️ 구독 해지 예약 · ${item} · ${store}${extra}` : `⚠️ 결제 취소 · ${item} · ${store}${extra}`;
      break;
    case 'expire':
      line = `⌛ 구독 만료 · ${item} · ${store}${extra}`;
      break;
    case 'fail':
      line = `❗ 구독 결제 실패 · ${item} · ${store}${extra}`;
      break;
    case 'test':
      return `🧪 ${row.store === 'apple' ? 'App Store 서버' : 'Google Play 실시간'} 알림 연결 확인${row.environment && row.environment !== 'test' ? ` (${escapeHtml(row.environment)})` : ''}`;
    default:
      return null;
  }
  const revenueLine = countsAsRevenue(row) && revenue ? `\n오늘 매출 ${formatRevenue(revenue)} (${revenue.count}건)` : '';
  return `${sandbox}${line}${revenueLine}`;
}
