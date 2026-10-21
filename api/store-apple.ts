/**
 * App Store 서버 알림 (App Store Server Notifications V2)
 *   POST /api/store-apple { signedPayload } — Apple 이 결제·갱신·환불·해지 예약 등이 생길 때 보낸다.
 *   App Store Connect → 앱 → 앱 정보 → App Store 서버 알림 에 이 주소를 프로덕션·샌드박스 모두 등록 (버전 2) — docs/ALERTS_SETUP.md
 *
 * 서명 확인 (Apple 이 보낸 것인지): JWS 머리글의 x5c = [잎, 중간, 루트] 인증서
 *   ① 루트 인증서의 SHA-256 이 Apple Root CA - G3 과 같고 ② 중간은 루트가, 잎은 중간이 서명했으며
 *   ③ 잎에 Apple 영수증 서명 표시(OID 1.2.840.113635.100.6.11.1), 중간에 Apple WWDR 표시(1.2.840.113635.100.6.2.1)가 있고
 *   ④ 세 인증서가 알림 서명 시각(signedDate)에 유효하며 ⑤ 본문이 잎 인증서 키의 ES256 서명과 맞아야 한다.
 *   안의 거래 정보(signedTransactionInfo)도 같은 방법으로 확인한다. 인증서 폐기(OCSP) 조회는 하지 않는다.
 *
 * 처리: 앱 번들 ID 확인 → store_event 에 한 줄(같은 거래·종류는 한 번만) → 처음 받은 알림이면 운영자 텔레그램.
 * 답: 처리했으면 200 (Apple 은 200 이 아니면 다시 보낸다), 서명·형식이 틀리면 400, POST 가 아니면 405.
 * 환경변수: SUPABASE_URL·SUPABASE_SERVICE_ROLE_KEY (없으면 기록 없이 알림만), TELEGRAM_BOT_TOKEN·TELEGRAM_CHAT_ID (없으면 알림 없음)
 */
import { createHash, verify, X509Certificate } from 'node:crypto';

import type { VercelRequest, VercelResponse } from '@vercel/node';

import { bodyTooLarge } from './_limits';
import { countsAsRevenue, listPriceKrw, planOf, recordStoreEvent, storeAlertText, todayRevenue, type StoreEventRow, type StoreKind } from './_store';
import { notifyTelegram } from './_telegram';

export const config = { maxDuration: 15 };

/** Apple Root CA - G3 (https://www.apple.com/certificateauthority/AppleRootCA-G3.cer) 의 SHA-256 — 2026-10-21 확인 */
export const APPLE_ROOT_CA_G3_SHA256 = '63343abfb89a6a03ebb57e9b3f5fa7be7c4f5c756f3017b3a8c488c3653e9179';
export const IOS_BUNDLE_ID = 'app.mylovecoach.ios';

/** 잎 인증서: Mac App Store·iTunes Store 영수증 서명 (OID 1.2.840.113635.100.6.11.1 의 DER) */
const LEAF_MARKER = Buffer.from('060a2a864886f76364060b01', 'hex');
/** 중간 인증서: Apple Worldwide Developer Relations (OID 1.2.840.113635.100.6.2.1 의 DER) */
const INTERMEDIATE_MARKER = Buffer.from('060a2a864886f76364060201', 'hex');
const MAX_BODY_BYTES = 256 * 1024;

export class AppleJwsError extends Error {}

export interface AppleVerifyOptions {
  /** 믿을 루트 인증서의 SHA-256 (시험에서 가짜 루트로 바꿔 넣는다) */
  rootSha256: string;
}

const decodePart = (part: string): unknown => JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));

function validAt(cert: X509Certificate, at: Date): boolean {
  const from = new Date(cert.validFrom).getTime();
  const to = new Date(cert.validTo).getTime();
  return Number.isFinite(from) && Number.isFinite(to) && from <= at.getTime() && at.getTime() <= to;
}

/**
 * Apple 이 서명한 JWS(서버 알림·거래 정보)를 확인하고 본문을 돌려준다. 맞지 않으면 AppleJwsError.
 * 인증서 유효 기간은 본문의 signedDate(없으면 지금) 기준으로 본다.
 */
export function verifyAppleJws<T = Record<string, unknown>>(token: unknown, options: AppleVerifyOptions): T {
  if (typeof token !== 'string') throw new AppleJwsError('서명 값이 없어요');
  const parts = token.split('.');
  if (parts.length !== 3 || parts.some((p) => !p)) throw new AppleJwsError('JWS 형식이 아니에요');
  let header: { alg?: unknown; x5c?: unknown };
  let payload: Record<string, unknown>;
  try {
    header = decodePart(parts[0]) as typeof header;
    payload = decodePart(parts[1]) as Record<string, unknown>;
  } catch {
    throw new AppleJwsError('JWS 를 읽지 못했어요');
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new AppleJwsError('JWS 본문이 객체가 아니에요');
  if (header?.alg !== 'ES256') throw new AppleJwsError('ES256 서명이 아니에요');
  const x5c = header.x5c;
  if (!Array.isArray(x5c) || x5c.length !== 3 || !x5c.every((c) => typeof c === 'string')) throw new AppleJwsError('인증서 사슬(x5c)이 없어요');

  let leaf: X509Certificate;
  let intermediate: X509Certificate;
  let root: X509Certificate;
  try {
    [leaf, intermediate, root] = (x5c as string[]).map((c) => new X509Certificate(Buffer.from(c, 'base64')));
  } catch {
    throw new AppleJwsError('인증서를 읽지 못했어요');
  }
  const expectedRoot = options.rootSha256.toLowerCase().replace(/[^0-9a-f]/g, '');
  if (createHash('sha256').update(root.raw).digest('hex') !== expectedRoot) throw new AppleJwsError('Apple 루트 인증서가 아니에요');
  if (!intermediate.ca || !intermediate.checkIssued(root) || !intermediate.verify(root.publicKey)) throw new AppleJwsError('중간 인증서 서명이 맞지 않아요');
  if (!leaf.checkIssued(intermediate) || !leaf.verify(intermediate.publicKey)) throw new AppleJwsError('잎 인증서 서명이 맞지 않아요');
  if (!intermediate.raw.includes(INTERMEDIATE_MARKER)) throw new AppleJwsError('Apple 중간 인증서 표시가 없어요');
  if (!leaf.raw.includes(LEAF_MARKER)) throw new AppleJwsError('Apple 영수증 서명 인증서 표시가 없어요');

  const signedDate = typeof payload.signedDate === 'number' ? payload.signedDate : Date.now();
  const at = new Date(signedDate);
  if (![leaf, intermediate, root].every((cert) => validAt(cert, at))) throw new AppleJwsError('서명 시각에 유효한 인증서가 아니에요');

  const signature = Buffer.from(parts[2], 'base64url');
  let ok = false;
  try {
    ok = signature.length === 64 && verify('sha256', Buffer.from(`${parts[0]}.${parts[1]}`), { key: leaf.publicKey, dsaEncoding: 'ieee-p1363' }, signature);
  } catch {
    ok = false;
  }
  if (!ok) throw new AppleJwsError('서명이 맞지 않아요');
  return payload as T;
}

/** 서버 알림 본문 (필요한 것만) */
export interface AppleNotification {
  notificationType?: string;
  subtype?: string;
  notificationUUID?: string;
  signedDate?: number;
  data?: { bundleId?: string; environment?: string; signedTransactionInfo?: string; status?: number };
  summary?: { bundleId?: string; environment?: string };
  externalPurchaseToken?: { bundleId?: string };
}

/** 거래 정보 (필요한 것만) */
export interface AppleTransaction {
  bundleId?: string;
  productId?: string;
  transactionId?: string;
  originalTransactionId?: string;
  /** 1/1000 단위 (₩2,700 → 2700000) */
  price?: number;
  currency?: string;
  environment?: string;
  transactionReason?: string;
  type?: string;
  purchaseDate?: number;
  expiresDate?: number;
  revocationDate?: number;
  revocationReason?: number;
  offerType?: number;
}

/** 알림 종류 → 기록 종류 */
export function appleKind(type: string | undefined, subtype: string | undefined): StoreKind {
  switch (type) {
    case 'ONE_TIME_CHARGE':
    case 'SUBSCRIBED':
      return 'purchase';
    case 'DID_RENEW':
      return 'renewal';
    case 'REFUND':
      return 'refund';
    case 'DID_CHANGE_RENEWAL_STATUS':
      return subtype === 'AUTO_RENEW_DISABLED' ? 'cancel' : 'other';
    case 'EXPIRED':
      return 'expire';
    case 'DID_FAIL_TO_RENEW':
      return 'fail';
    case 'TEST':
      return 'test';
    default:
      return 'other';
  }
}

/** 검증한 알림·거래로 store_event 한 줄을 만든다 (이름·이메일 같은 항목은 애초에 없고, 고른 항목만 남긴다) */
export function appleEventRow(n: AppleNotification, tx: AppleTransaction | null): StoreEventRow {
  const kind = appleKind(n.notificationType, n.subtype);
  const productId = tx?.productId ?? null;
  const plan = planOf(productId);
  const hasPrice = typeof tx?.price === 'number' && Number.isFinite(tx.price);
  return {
    store: 'apple',
    environment: n.data?.environment ?? tx?.environment ?? n.summary?.environment ?? null,
    kind,
    notification: [n.notificationType, n.subtype].filter(Boolean).join('/') || null,
    product_id: productId,
    plan,
    amount: hasPrice ? (tx!.price as number) / 1000 : tx ? listPriceKrw(plan) : null,
    currency: hasPrice ? (tx!.currency ?? null) : tx && listPriceKrw(plan) != null ? 'KRW' : null,
    transaction_id: tx?.transactionId ?? null,
    original_transaction_id: tx?.originalTransactionId ?? null,
    raw: {
      notificationUUID: n.notificationUUID ?? null,
      signedDate: n.signedDate ?? null,
      status: n.data?.status ?? null,
      ...(tx
        ? {
            transaction: {
              type: tx.type ?? null,
              transactionReason: tx.transactionReason ?? null,
              purchaseDate: tx.purchaseDate ?? null,
              expiresDate: tx.expiresDate ?? null,
              revocationDate: tx.revocationDate ?? null,
              revocationReason: tx.revocationReason ?? null,
              offerType: tx.offerType ?? null,
            },
          }
        : {}),
    },
  };
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

/** 루트 인증서 지문을 바꿔 끼울 수 있게 만든 처리기 (운영은 아래 기본값 = Apple Root CA - G3) */
export function createAppleHandler(options: AppleVerifyOptions) {
  return async function handler(req: VercelRequest, res: VercelResponse) {
    res.setHeader('cache-control', 'no-store');
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'POST만 지원합니다.' });
      return;
    }
    if (bodyTooLarge(req, MAX_BODY_BYTES)) {
      res.status(413).json({ error: '요청이 너무 커요.' });
      return;
    }
    const body = parseBody(req);
    let notification: AppleNotification;
    let tx: AppleTransaction | null = null;
    try {
      notification = verifyAppleJws<AppleNotification>(body?.signedPayload, options);
      const bundleId = notification.data?.bundleId ?? notification.summary?.bundleId ?? notification.externalPurchaseToken?.bundleId;
      if (bundleId !== IOS_BUNDLE_ID) throw new AppleJwsError('이 앱의 알림이 아니에요');
      if (notification.data?.signedTransactionInfo) {
        tx = verifyAppleJws<AppleTransaction>(notification.data.signedTransactionInfo, options);
        if (tx.bundleId !== IOS_BUNDLE_ID) throw new AppleJwsError('이 앱의 거래가 아니에요');
      }
    } catch (e) {
      console.warn('[store-apple] 거절:', e instanceof AppleJwsError ? e.message : 'unknown');
      res.status(400).json({ error: e instanceof AppleJwsError ? e.message : '알림을 확인하지 못했어요.' });
      return;
    }

    const row = appleEventRow(notification, tx);
    const saved = await recordStoreEvent(row);
    if (saved !== 'duplicate') {
      const revenue = countsAsRevenue(row) ? await todayRevenue() : null;
      const note = notification.subtype === 'RESUBSCRIBE' ? '재구독' : notification.subtype === 'BILLING_RECOVERY' ? '결제 복구' : '';
      const text = storeAlertText(row, revenue, note);
      if (text) await notifyTelegram(text);
    }
    res.status(200).json({ ok: true });
  };
}

export default createAppleHandler({ rootSha256: APPLE_ROOT_CA_G3_SHA256 });
