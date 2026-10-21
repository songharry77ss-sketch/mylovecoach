/**
 * api/store-apple.ts — App Store 서버 알림 V2 의 서명(JWS) 확인과 처리.
 * 진짜 Apple 인증서로는 서명할 수 없으므로, 시험 안에서 Apple 과 같은 모양의 인증서 사슬(루트 → 중간 → 잎, ECDSA P-256)을
 * 직접 만들고 그 루트의 지문을 믿도록 바꾼 처리기(createAppleHandler)로 확인한다.
 * 운영 처리기(기본 내보내기)는 진짜 Apple 루트만 믿으므로 같은 알림을 거절해야 한다.
 */
import { createHash, generateKeyPairSync, sign, type KeyObject } from 'node:crypto';

import appleHandler, { APPLE_ROOT_CA_G3_SHA256, appleKind, createAppleHandler, verifyAppleJws } from '../../api/store-apple';

// ── 아주 작은 DER(ASN.1) 작성기 — X.509 v3 인증서를 만들 만큼만 ─────────────
const len = (n: number) => (n < 0x80 ? Buffer.from([n]) : n < 0x100 ? Buffer.from([0x81, n]) : Buffer.from([0x82, n >> 8, n & 0xff]));
const tlv = (tag: number, ...parts: Buffer[]) => {
  const body = Buffer.concat(parts);
  return Buffer.concat([Buffer.from([tag]), len(body.length), body]);
};
const seq = (...parts: Buffer[]) => tlv(0x30, ...parts);
const hex = (h: string) => Buffer.from(h, 'hex');
const ECDSA_SHA256 = seq(hex('06082a8648ce3d040302'));
const name = (cn: string) => seq(tlv(0x31, seq(hex('0603550403'), tlv(0x0c, Buffer.from(cn)))));
const utcTime = (d: Date) => tlv(0x17, Buffer.from(`${d.toISOString().slice(2, 19).replace(/[-T:]/g, '')}Z`));
const BASIC_CA = seq(hex('0603551d13'), hex('0101ff'), tlv(0x04, seq(hex('0101ff'))));
/** Apple 표시 OID 를 가진 확장 (값은 NULL) */
const marker = (oidTlv: string) => seq(hex(oidTlv), tlv(0x04, hex('0500')));
const LEAF_OID = '060a2a864886f76364060b01';
const INTERMEDIATE_OID = '060a2a864886f76364060201';

interface CertSpec {
  serial: number;
  issuer: string;
  subject: string;
  publicKey: KeyObject;
  signer: KeyObject;
  notBefore: Date;
  notAfter: Date;
  extensions: Buffer[];
}

function makeCert(c: CertSpec): Buffer {
  const tbs = seq(
    tlv(0xa0, tlv(0x02, Buffer.from([2]))),
    tlv(0x02, Buffer.from([c.serial])),
    ECDSA_SHA256,
    name(c.issuer),
    seq(utcTime(c.notBefore), utcTime(c.notAfter)),
    name(c.subject),
    c.publicKey.export({ type: 'spki', format: 'der' }),
    ...(c.extensions.length ? [tlv(0xa3, seq(...c.extensions))] : []),
  );
  const signature = sign('sha256', tbs, c.signer);
  return seq(tbs, ECDSA_SHA256, tlv(0x03, Buffer.concat([Buffer.from([0]), signature])));
}

const ec = () => generateKeyPairSync('ec', { namedCurve: 'P-256' });
const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.now();

interface ChainOptions {
  leafMarker?: boolean;
  intermediateMarker?: boolean;
  leafNotAfter?: Date;
  /** 중간 인증서를 루트가 아닌 다른 키로 서명 */
  forgedIntermediate?: boolean;
}

function makeChain(opts: ChainOptions = {}) {
  const root = ec();
  const intermediate = ec();
  const leaf = ec();
  const stranger = ec();
  const from = new Date(NOW - 365 * DAY);
  const to = new Date(NOW + 365 * DAY);
  const rootCert = makeCert({ serial: 1, issuer: 'Test Root CA', subject: 'Test Root CA', publicKey: root.publicKey, signer: root.privateKey, notBefore: from, notAfter: to, extensions: [BASIC_CA] });
  const intermediateCert = makeCert({
    serial: 2,
    issuer: 'Test Root CA',
    subject: 'Test WWDR CA',
    publicKey: intermediate.publicKey,
    signer: opts.forgedIntermediate ? stranger.privateKey : root.privateKey,
    notBefore: from,
    notAfter: to,
    extensions: [BASIC_CA, ...(opts.intermediateMarker === false ? [] : [marker(INTERMEDIATE_OID)])],
  });
  const leafCert = makeCert({
    serial: 3,
    issuer: 'Test WWDR CA',
    subject: 'Test Receipt Signing',
    publicKey: leaf.publicKey,
    signer: intermediate.privateKey,
    notBefore: from,
    notAfter: opts.leafNotAfter ?? to,
    extensions: opts.leafMarker === false ? [] : [marker(LEAF_OID)],
  });
  const rootSha256 = createHash('sha256').update(rootCert).digest('hex');
  const x5c = [leafCert, intermediateCert, rootCert].map((c) => c.toString('base64'));
  const jws = (payload: object, key: KeyObject = leaf.privateKey) => {
    const h = Buffer.from(JSON.stringify({ alg: 'ES256', x5c })).toString('base64url');
    const p = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const s = sign('sha256', Buffer.from(`${h}.${p}`), { key, dsaEncoding: 'ieee-p1363' }).toString('base64url');
    return `${h}.${p}.${s}`;
  };
  return { rootSha256, jws, stranger };
}

// ── 가짜 응답·fetch ──────────────────────────────────────────────────────
interface FakeRes {
  statusCode: number;
  body?: Record<string, unknown>;
  setHeader: () => FakeRes;
  status: (code: number) => FakeRes;
  json: (body: FakeRes['body']) => FakeRes;
  end: () => FakeRes;
}

function fakeRes(): FakeRes {
  const res = { statusCode: 200 } as FakeRes;
  res.setHeader = () => res;
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (body) => {
    res.body = body;
    return res;
  };
  res.end = () => res;
  return res;
}

const calls: { url: string; method: string; body?: string }[] = [];
let duplicate = false;
let todayRows: { amount: number; currency: string }[] = [];
const telegramTexts = () => calls.filter((c) => c.url.startsWith('https://api.telegram.org/')).map((c) => String(JSON.parse(c.body ?? '{}').text));
const insertedRow = () => JSON.parse(calls.find((c) => c.method === 'POST' && c.url.includes('/rest/v1/store_event'))?.body ?? '[]')[0];

let warn: jest.SpyInstance;

beforeEach(() => {
  warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  calls.length = 0;
  duplicate = false;
  todayRows = [];
  process.env.SUPABASE_URL = 'https://db.example';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
  process.env.TELEGRAM_BOT_TOKEN = 'bot-token';
  process.env.TELEGRAM_CHAT_ID = '777';
  global.fetch = jest.fn(async (url: string, init: { method?: string; body?: string } = {}): Promise<unknown> => {
    const u = String(url);
    const method = init.method ?? 'GET';
    calls.push({ url: u, method, body: init.body });
    if (u.includes('/rest/v1/store_event') && method === 'POST') return { ok: true, status: 201, json: async () => (duplicate ? [] : [{ store: 'apple' }]), text: async () => '' };
    if (u.includes('/rest/v1/store_event?select=amount')) return { ok: true, status: 200, json: async () => todayRows, text: async () => '' };
    return { ok: true, status: 200, json: async () => ({ ok: true }), text: async () => '' };
  }) as unknown as typeof fetch;
});

afterEach(() => warn.mockRestore());

afterAll(() => {
  delete process.env.TELEGRAM_BOT_TOKEN;
  delete process.env.TELEGRAM_CHAT_ID;
});

const chain = makeChain();
const transaction = (extra: object = {}) => ({
  bundleId: 'app.mylovecoach.ios',
  productId: 'mylovecoach.premium.weekly',
  transactionId: '2000000123',
  originalTransactionId: '2000000001',
  price: 9900000,
  currency: 'KRW',
  environment: 'Production',
  transactionReason: 'RENEWAL',
  type: 'Auto-Renewable Subscription',
  signedDate: NOW,
  ...extra,
});
const notification = (type: string, subtype: string | undefined, tx: object | null, environment = 'Production', c = chain) => ({
  notificationType: type,
  ...(subtype ? { subtype } : {}),
  notificationUUID: 'uuid-1',
  version: '2.0',
  signedDate: NOW,
  data: { bundleId: 'app.mylovecoach.ios', environment, ...(tx ? { signedTransactionInfo: c.jws(tx) } : {}) },
});
const post = (signedPayload: unknown) => ({ method: 'POST', body: { signedPayload }, query: {}, headers: {} }) as never;
const testHandler = createAppleHandler({ rootSha256: chain.rootSha256 });

describe('verifyAppleJws (서명 확인)', () => {
  it('믿는 루트에서 이어진 사슬·Apple 표시·서명이 맞으면 본문을 돌려준다', () => {
    const payload = verifyAppleJws<{ notificationType: string }>(chain.jws({ notificationType: 'TEST', signedDate: NOW }), { rootSha256: chain.rootSha256 });
    expect(payload.notificationType).toBe('TEST');
  });

  it('루트 지문이 다르면(진짜 Apple 루트만 믿는 운영 설정) 거절', () => {
    expect(() => verifyAppleJws(chain.jws({ signedDate: NOW }), { rootSha256: APPLE_ROOT_CA_G3_SHA256 })).toThrow('Apple 루트 인증서가 아니에요');
  });

  it('본문을 바꾸거나 다른 키로 서명하면 거절', () => {
    const token = chain.jws({ notificationType: 'TEST', signedDate: NOW });
    const [h, , s] = token.split('.');
    const tampered = `${h}.${Buffer.from(JSON.stringify({ notificationType: 'REFUND', signedDate: NOW })).toString('base64url')}.${s}`;
    expect(() => verifyAppleJws(tampered, { rootSha256: chain.rootSha256 })).toThrow('서명이 맞지 않아요');
    expect(() => verifyAppleJws(chain.jws({ signedDate: NOW }, chain.stranger.privateKey), { rootSha256: chain.rootSha256 })).toThrow('서명이 맞지 않아요');
  });

  it('중간 인증서를 루트가 서명하지 않았으면 거절', () => {
    const forged = makeChain({ forgedIntermediate: true });
    expect(() => verifyAppleJws(forged.jws({ signedDate: NOW }), { rootSha256: forged.rootSha256 })).toThrow('중간 인증서 서명이 맞지 않아요');
  });

  it('잎·중간 인증서에 Apple 표시(OID)가 없으면 거절', () => {
    const noLeaf = makeChain({ leafMarker: false });
    expect(() => verifyAppleJws(noLeaf.jws({ signedDate: NOW }), { rootSha256: noLeaf.rootSha256 })).toThrow('Apple 영수증 서명 인증서 표시가 없어요');
    const noIntermediate = makeChain({ intermediateMarker: false });
    expect(() => verifyAppleJws(noIntermediate.jws({ signedDate: NOW }), { rootSha256: noIntermediate.rootSha256 })).toThrow('Apple 중간 인증서 표시가 없어요');
  });

  it('서명 시각(signedDate)에 인증서가 유효하지 않으면 거절', () => {
    const expired = makeChain({ leafNotAfter: new Date(NOW - DAY) });
    expect(() => verifyAppleJws(expired.jws({ signedDate: NOW }), { rootSha256: expired.rootSha256 })).toThrow('서명 시각에 유효한 인증서가 아니에요');
    // 인증서가 유효하던 때 서명한 것이면 받는다
    expect(verifyAppleJws(expired.jws({ signedDate: NOW - 2 * DAY }), { rootSha256: expired.rootSha256 })).toBeTruthy();
  });

  it.each([undefined, 'a.b', 'not.a.jws', `${Buffer.from('{"alg":"HS256"}').toString('base64url')}.e30.sig`])('형식이 틀리면(%s) 거절', (token) => {
    expect(() => verifyAppleJws(token, { rootSha256: chain.rootSha256 })).toThrow();
  });
});

describe('/api/store-apple', () => {
  it('POST 가 아니면 405', async () => {
    const res = fakeRes();
    await testHandler({ method: 'GET', body: undefined, query: {}, headers: {} } as never, res as never);
    expect(res.statusCode).toBe(405);
  });

  it('운영 처리기는 시험용 사슬로 서명한 알림을 400 으로 거절하고 아무것도 하지 않는다', async () => {
    const res = fakeRes();
    await appleHandler(post(chain.jws(notification('DID_RENEW', undefined, transaction()))), res as never);
    expect(res.statusCode).toBe(400);
    expect(calls).toHaveLength(0);
  });

  it('서명 값이 없거나 망가졌으면 400', async () => {
    for (const payload of [undefined, 'garbage', chain.jws(notification('TEST', undefined, null)).slice(0, -4) + 'AAAA']) {
      const res = fakeRes();
      await testHandler(post(payload), res as never);
      expect(res.statusCode).toBe(400);
    }
    expect(calls).toHaveLength(0);
  });

  it('다른 앱(번들 ID)의 알림은 400', async () => {
    const res = fakeRes();
    const n = { ...notification('TEST', undefined, null), data: { bundleId: 'com.other.app', environment: 'Production' } };
    await testHandler(post(chain.jws(n)), res as never);
    expect(res.statusCode).toBe(400);
  });

  it('주간 구독 갱신 → store_event 에 고른 항목만 남기고 「구독 갱신」·오늘 매출을 알린다', async () => {
    todayRows = [{ amount: 9900, currency: 'KRW' }, { amount: 2700, currency: 'KRW' }, { amount: 1.99, currency: 'USD' }];
    const res = fakeRes();
    await testHandler(post(chain.jws(notification('DID_RENEW', undefined, transaction()))), res as never);
    expect(res.statusCode).toBe(200);
    expect(insertedRow()).toEqual({
      store: 'apple',
      environment: 'Production',
      kind: 'renewal',
      notification: 'DID_RENEW',
      product_id: 'mylovecoach.premium.weekly',
      plan: 'weekly',
      amount: 9900,
      currency: 'KRW',
      transaction_id: '2000000123',
      original_transaction_id: '2000000001',
      raw: {
        notificationUUID: 'uuid-1',
        signedDate: NOW,
        status: null,
        transaction: { type: 'Auto-Renewable Subscription', transactionReason: 'RENEWAL', purchaseDate: null, expiresDate: null, revocationDate: null, revocationReason: null, offerType: null },
      },
    });
    expect(telegramTexts()).toEqual(['🔁 구독 갱신 · 주간 구독 ₩9,900 · iOS\n오늘 매출 ₩12,600 + USD 1.99 (3건)']);
  });

  it('하루 이용권 결제(ONE_TIME_CHARGE) → 「결제」', async () => {
    const res = fakeRes();
    await testHandler(post(chain.jws(notification('ONE_TIME_CHARGE', undefined, transaction({ productId: 'mylovecoach.pass.day', price: 2700000, transactionReason: 'PURCHASE', type: 'Consumable' })))), res as never);
    expect(res.statusCode).toBe(200);
    expect(telegramTexts()[0]).toMatch(/^💳 결제 · 하루 이용권 ₩2,700 · iOS\n오늘 매출 /);
  });

  it('샌드박스 결제는 [샌드박스] 를 붙이고 매출 줄을 넣지 않는다', async () => {
    const res = fakeRes();
    await testHandler(post(chain.jws(notification('SUBSCRIBED', 'RESUBSCRIBE', transaction({ environment: 'Sandbox' }), 'Sandbox'))), res as never);
    expect(res.statusCode).toBe(200);
    expect(insertedRow()).toMatchObject({ environment: 'Sandbox', kind: 'purchase', notification: 'SUBSCRIBED/RESUBSCRIBE' });
    expect(telegramTexts()).toEqual(['[샌드박스] 💳 결제 · 주간 구독 ₩9,900 · iOS (재구독)']);
    expect(calls.some((c) => c.url.includes('select=amount'))).toBe(false);
  });

  it('자동 갱신 끔 → 「구독 해지 예약」, 환불 → 「환불」', async () => {
    await testHandler(post(chain.jws(notification('DID_CHANGE_RENEWAL_STATUS', 'AUTO_RENEW_DISABLED', transaction()))), fakeRes() as never);
    await testHandler(post(chain.jws(notification('REFUND', undefined, transaction({ productId: 'mylovecoach.premium.lifetime', price: 29800000 })))), fakeRes() as never);
    expect(telegramTexts()).toEqual(['⚠️ 구독 해지 예약 · 주간 구독 · iOS', '↩️ 환불 · 평생권 ₩29,800 · iOS']);
  });

  it('같은 알림을 다시 받으면(이미 기록됨) 알리지 않고 200', async () => {
    duplicate = true;
    const res = fakeRes();
    await testHandler(post(chain.jws(notification('DID_RENEW', undefined, transaction()))), res as never);
    expect(res.statusCode).toBe(200);
    expect(telegramTexts()).toHaveLength(0);
  });

  it('연결 확인(TEST) → 「App Store 서버 알림 연결 확인」', async () => {
    const res = fakeRes();
    await testHandler(post(chain.jws(notification('TEST', undefined, null, 'Sandbox'))), res as never);
    expect(res.statusCode).toBe(200);
    expect(telegramTexts()).toEqual(['🧪 App Store 서버 알림 연결 확인 (Sandbox)']);
  });

  it('거래 정보의 서명이 맞지 않으면 400', async () => {
    const other = makeChain();
    const n = { ...notification('DID_RENEW', undefined, null), data: { bundleId: 'app.mylovecoach.ios', environment: 'Production', signedTransactionInfo: other.jws(transaction()) } };
    const res = fakeRes();
    await testHandler(post(chain.jws(n)), res as never);
    expect(res.statusCode).toBe(400);
    expect(calls).toHaveLength(0);
  });

  it('알림 종류 해석', () => {
    expect(appleKind('ONE_TIME_CHARGE', undefined)).toBe('purchase');
    expect(appleKind('SUBSCRIBED', 'INITIAL_BUY')).toBe('purchase');
    expect(appleKind('DID_RENEW', undefined)).toBe('renewal');
    expect(appleKind('REFUND', undefined)).toBe('refund');
    expect(appleKind('DID_CHANGE_RENEWAL_STATUS', 'AUTO_RENEW_DISABLED')).toBe('cancel');
    expect(appleKind('DID_CHANGE_RENEWAL_STATUS', 'AUTO_RENEW_ENABLED')).toBe('other');
    expect(appleKind('EXPIRED', 'VOLUNTARY')).toBe('expire');
    expect(appleKind('DID_FAIL_TO_RENEW', undefined)).toBe('fail');
    expect(appleKind('TEST', undefined)).toBe('test');
    expect(appleKind('CONSUMPTION_REQUEST', undefined)).toBe('other');
  });
});
