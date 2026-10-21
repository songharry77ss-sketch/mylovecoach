/**
 * Google Play 실시간 개발자 알림 (Real-time Developer Notifications, Cloud Pub/Sub 푸시)
 *   POST /api/store-google?token=<GOOGLE_RTDN_TOKEN>  { message: { data: base64(DeveloperNotification), messageId }, subscription }
 *   Play Console → 수익 창출 설정 → 실시간 개발자 알림에 Pub/Sub 주제를 넣고, 그 주제의 푸시 구독이 이 주소로 보낸다 — docs/ALERTS_SETUP.md
 *
 * 인증: 주소의 token 을 환경변수 GOOGLE_RTDN_TOKEN 과 비교 (없으면 503, 다르면 401 — Pub/Sub 은 2xx 가 아니면 다시 보낸다).
 * 처리: 앱 패키지 확인 → store_event 에 한 줄(같은 알림은 한 번만) → 처음 받은 알림이면 운영자 텔레그램. 처리했으면 항상 200.
 * 금액: Google 알림에는 금액이 없어 요금제 정가(src/lib/billing/plans 의 FALLBACK_PRICES, 원)로 적는다 — 할인·해외 가격은 반영되지 않음.
 * 라이선스 테스터의 시험 결제도 실제 결제와 똑같이 오므로(구분하려면 Play Developer API 조회가 필요) 실제 매출로 셈한다.
 * 구매 토큰은 그대로 저장하지 않고 SHA-256 으로 바꾼 값만 남긴다.
 * 환경변수: GOOGLE_RTDN_TOKEN (필수), SUPABASE_URL·SUPABASE_SERVICE_ROLE_KEY, TELEGRAM_BOT_TOKEN·TELEGRAM_CHAT_ID
 */
import { createHash, timingSafeEqual } from 'node:crypto';

import type { VercelRequest, VercelResponse } from '@vercel/node';

import { ANDROID_PACKAGE, type PlanKey } from '../src/lib/billing/plans';

import { bodyTooLarge } from './_limits';
import { countsAsRevenue, listPriceKrw, planOf, recordStoreEvent, storeAlertText, todayRevenue, type StoreEventRow, type StoreKind } from './_store';
import { query } from './_supabase';
import { notifyTelegram } from './_telegram';

export const config = { maxDuration: 15 };

const MAX_BODY_BYTES = 64 * 1024;

const digest = (s: string) => createHash('sha256').update(s).digest();
const sameSecret = (a: string, b: string) => timingSafeEqual(digest(a), digest(b));
/** 구매 토큰은 결제를 조회할 수 있는 값이라 그대로 두지 않고 바꾼 값(해시)으로만 남긴다 */
export const tokenHash = (purchaseToken: string) => createHash('sha256').update(purchaseToken).digest('hex').slice(0, 40);

export interface DeveloperNotification {
  version?: string;
  packageName?: string;
  eventTimeMillis?: string | number;
  oneTimeProductNotification?: { notificationType?: number; purchaseToken?: string; sku?: string };
  subscriptionNotification?: { notificationType?: number; purchaseToken?: string; subscriptionId?: string };
  /** productType 1 = 구독, 2 = 일회성 상품 · refundType 1 = 전액, 2 = 일부 */
  voidedPurchaseNotification?: { purchaseToken?: string; orderId?: string; productType?: number; refundType?: number };
  testNotification?: { version?: string };
}

const ONE_TIME_TYPES: Record<number, string> = { 1: 'ONE_TIME_PRODUCT_PURCHASED', 2: 'ONE_TIME_PRODUCT_CANCELED' };
const SUBSCRIPTION_TYPES: Record<number, string> = {
  1: 'SUBSCRIPTION_RECOVERED',
  2: 'SUBSCRIPTION_RENEWED',
  3: 'SUBSCRIPTION_CANCELED',
  4: 'SUBSCRIPTION_PURCHASED',
  5: 'SUBSCRIPTION_ON_HOLD',
  6: 'SUBSCRIPTION_IN_GRACE_PERIOD',
  7: 'SUBSCRIPTION_RESTARTED',
  9: 'SUBSCRIPTION_DEFERRED',
  10: 'SUBSCRIPTION_PAUSED',
  11: 'SUBSCRIPTION_PAUSE_SCHEDULE_CHANGED',
  12: 'SUBSCRIPTION_REVOKED',
  13: 'SUBSCRIPTION_EXPIRED',
  20: 'SUBSCRIPTION_PENDING_PURCHASE_CANCELED',
};

/** 구독 알림 종류 → 기록 종류 (재시작 등은 알리지 않는 other) */
export function subscriptionKind(type: number | undefined): StoreKind {
  switch (type) {
    case 4:
      return 'purchase';
    case 2:
    case 1: // 계정 보류에서 결제가 복구됨 — 실제 결제라 갱신으로 센다 (Apple 의 BILLING_RECOVERY 와 같게)
      return 'renewal';
    case 3:
      return 'cancel';
    case 12:
      return 'refund';
    case 13:
      return 'expire';
    case 5: // 보류(결제 수단 문제)
    case 6: // 유예 기간
      return 'fail';
    default:
      return 'other';
  }
}

/** 일회성 상품 알림 종류 → 기록 종류 (2 = 대기 중이던 결제가 취소됨 — 구독 「해지 예약」과 섞이지 않게 알리지 않는 other) */
export const oneTimeKind = (type: number | undefined): StoreKind => (type === 1 ? 'purchase' : 'other');

/** 구독 상품 ID 가 비어 오면 하나뿐인 구독(주간)으로 본다 */
const subscriptionPlan = (subscriptionId: string | undefined): PlanKey | null => planOf(subscriptionId) ?? (subscriptionId ? null : 'weekly');

/**
 * 알림 하나를 store_event 한 줄로. 같은 알림의 재전송은 같은 거래 ID 가 되도록 만든다:
 *   결제·환불·만료는 구매 토큰마다 한 번, 갱신·해지 예약·결제 실패처럼 같은 구독에 여러 번 생기는 일은 토큰+알림 시각.
 * 환불(취소된 구매) 알림에는 상품이 없어 같은 토큰의 앞선 기록(earlier)에서 찾는다 — 못 찾으면 구독은 주간, 일회성은 상품 모름.
 */
export function googleEventRow(n: DeveloperNotification, messageId: string | null, earlier: { product_id: string | null; plan: PlanKey | null } | null = null): StoreEventRow | null {
  const at = n.eventTimeMillis != null ? String(n.eventTimeMillis) : '';
  const base = { store: 'google' as const, environment: 'Production', currency: 'KRW' };
  if (n.testNotification) {
    return { ...base, environment: 'test', kind: 'test', notification: 'TEST', product_id: null, plan: null, amount: null, currency: null, transaction_id: messageId, original_transaction_id: null, raw: { version: n.testNotification.version ?? null, eventTimeMillis: at || null } };
  }
  const one = n.oneTimeProductNotification;
  if (one?.purchaseToken) {
    const hash = tokenHash(one.purchaseToken);
    const kind = oneTimeKind(one.notificationType);
    const plan = planOf(one.sku);
    return {
      ...base,
      kind,
      notification: ONE_TIME_TYPES[one.notificationType ?? 0] ?? `ONE_TIME_${one.notificationType ?? '?'}`,
      product_id: one.sku ?? null,
      plan,
      amount: kind === 'purchase' ? listPriceKrw(plan) : null,
      transaction_id: kind === 'other' ? `${hash}:${at}` : hash,
      original_transaction_id: hash,
      raw: { eventTimeMillis: at || null, notificationType: one.notificationType ?? null },
    };
  }
  const sub = n.subscriptionNotification;
  if (sub?.purchaseToken) {
    const hash = tokenHash(sub.purchaseToken);
    const kind = subscriptionKind(sub.notificationType);
    const plan = subscriptionPlan(sub.subscriptionId);
    const once = kind === 'purchase' || kind === 'refund' || kind === 'expire';
    return {
      ...base,
      kind,
      notification: SUBSCRIPTION_TYPES[sub.notificationType ?? 0] ?? `SUBSCRIPTION_${sub.notificationType ?? '?'}`,
      product_id: sub.subscriptionId ?? null,
      plan,
      amount: kind === 'purchase' || kind === 'renewal' || kind === 'refund' ? listPriceKrw(plan) : null,
      transaction_id: once ? hash : `${hash}:${at}`,
      original_transaction_id: hash,
      raw: { eventTimeMillis: at || null, notificationType: sub.notificationType ?? null },
    };
  }
  const voided = n.voidedPurchaseNotification;
  if (voided?.purchaseToken) {
    const hash = tokenHash(voided.purchaseToken);
    const plan = earlier?.plan ?? (voided.productType === 1 ? 'weekly' : null);
    return {
      ...base,
      kind: 'refund',
      notification: 'VOIDED_PURCHASE',
      product_id: earlier?.product_id ?? null,
      plan,
      amount: listPriceKrw(plan),
      // 구독 취소(REVOKED)와 같은 환불이 함께 오므로 같은 토큰의 환불은 한 번만 센다
      transaction_id: hash,
      original_transaction_id: hash,
      // 주문 ID 는 처리방침대로 원문 대신 바꾼 값(해시)만 남긴다
      raw: { eventTimeMillis: at || null, orderIdHash: voided.orderId ? tokenHash(voided.orderId) : null, productType: voided.productType ?? null, refundType: voided.refundType ?? null },
    };
  }
  return null;
}

function parseBody(req: VercelRequest): Record<string, unknown> | null {
  let body: unknown = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body || '{}');
    } catch {
      return null;
    }
  }
  return body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
}

/** Pub/Sub 푸시 본문 → 알림과 메시지 ID. 구독에서 「페이로드 래핑 해제」를 켠 경우(본문이 곧 알림)도 받는다 */
export function readPush(body: Record<string, unknown> | null, headers: VercelRequest['headers'] = {}): { notification: DeveloperNotification; messageId: string | null } | null {
  if (!body) return null;
  if (typeof body.packageName === 'string') {
    const id = headers['x-goog-pubsub-message-id'];
    return { notification: body as DeveloperNotification, messageId: typeof id === 'string' ? id : null };
  }
  const message = body.message as { data?: unknown; messageId?: unknown; message_id?: unknown } | undefined;
  if (!message || typeof message.data !== 'string') return null;
  try {
    const notification = JSON.parse(Buffer.from(message.data, 'base64').toString('utf8')) as DeveloperNotification;
    if (!notification || typeof notification !== 'object') return null;
    const id = message.messageId ?? message.message_id;
    return { notification, messageId: typeof id === 'string' || typeof id === 'number' ? String(id) : null };
  } catch {
    return null;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('cache-control', 'no-store');
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'POST만 지원합니다.' });
    return;
  }
  const expected = process.env.GOOGLE_RTDN_TOKEN;
  if (!expected) {
    res.status(503).json({ error: 'GOOGLE_RTDN_TOKEN 환경변수가 설정되지 않았어요.' });
    return;
  }
  const token = Array.isArray(req.query?.token) ? req.query.token[0] : req.query?.token;
  if (typeof token !== 'string' || !token || !sameSecret(token, expected)) {
    res.status(401).json({ error: '인증에 실패했어요.' });
    return;
  }
  if (bodyTooLarge(req, MAX_BODY_BYTES)) {
    res.status(413).json({ error: '요청이 너무 커요.' });
    return;
  }
  const push = readPush(parseBody(req), req.headers);
  if (!push) {
    res.status(400).json({ error: 'Pub/Sub 알림 형식이 아니에요.' });
    return;
  }
  const n = push.notification;
  // 같은 주제를 다른 앱과 함께 쓰면 그 앱의 알림도 온다 — 다시 보내지 않게 200 으로 받고 넘긴다
  if (n.packageName !== ANDROID_PACKAGE) {
    res.status(200).json({ ok: true, ignored: 'package' });
    return;
  }
  // 환불 알림에는 상품이 없어 같은 구매의 앞선 기록에서 찾는다
  let earlier: { product_id: string | null; plan: PlanKey | null } | null = null;
  if (n.voidedPurchaseNotification?.purchaseToken) {
    const rows = await query<{ product_id: string | null; plan: PlanKey | null }>(
      'store_event',
      `select=product_id,plan&store=eq.google&original_transaction_id=eq.${tokenHash(n.voidedPurchaseNotification.purchaseToken)}&product_id=not.is.null&limit=1`,
    );
    earlier = rows?.[0] ?? null;
  }
  const row = googleEventRow(n, push.messageId, earlier);
  if (!row) {
    res.status(200).json({ ok: true, ignored: 'type' });
    return;
  }
  const saved = await recordStoreEvent(row);
  if (saved !== 'duplicate') {
    const revenue = countsAsRevenue(row) ? await todayRevenue() : null;
    const text = storeAlertText(row, revenue);
    if (text) await notifyTelegram(text);
  }
  res.status(200).json({ ok: true });
}
