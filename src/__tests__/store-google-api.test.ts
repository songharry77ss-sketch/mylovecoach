/**
 * api/store-google.ts — Google Play 실시간 개발자 알림(Pub/Sub 푸시).
 * 주소의 토큰 확인, 연결 확인 알림, 결제 → store_event 기록(같은 알림은 한 번만) + 운영자 텔레그램.
 * Supabase·텔레그램은 fetch 를 가짜로 바꿔 어떤 요청이 나가는지만 본다.
 */
import handler, { googleEventRow, readPush, subscriptionKind, tokenHash } from '../../api/store-google';

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

const TOKEN = 'rtdn-secret-0123456789';
const calls: { url: string; method: string; body?: string; headers?: Record<string, string> }[] = [];
/** store_event 에 이미 같은 행이 있는 것처럼 (중복 무시 → 빈 배열) */
let duplicate = false;
/** 오늘 이미 들어온 실제 결제 */
let todayRows: { amount: number; currency: string }[] = [];
let earlierRows: unknown[] = [];

const push = (notification: object, messageId = 'm-1') => ({
  message: { data: Buffer.from(JSON.stringify(notification)).toString('base64'), messageId, publishTime: '2026-10-21T00:00:00Z' },
  subscription: 'projects/x/subscriptions/play-rtdn',
});
/** token: null 이면 주소에 토큰을 붙이지 않는다 */
const req = (body: unknown, token: string | null = TOKEN, method = 'POST') => ({ method, body, query: token === null ? {} : { token }, headers: {} }) as never;
const telegramTexts = () => calls.filter((c) => c.url.startsWith('https://api.telegram.org/')).map((c) => String(JSON.parse(c.body ?? '{}').text));
const inserts = () => calls.filter((c) => c.method === 'POST' && c.url.includes('/rest/v1/store_event'));

beforeEach(() => {
  calls.length = 0;
  duplicate = false;
  todayRows = [];
  earlierRows = [];
  process.env.GOOGLE_RTDN_TOKEN = TOKEN;
  process.env.SUPABASE_URL = 'https://db.example';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
  process.env.TELEGRAM_BOT_TOKEN = 'bot-token';
  process.env.TELEGRAM_CHAT_ID = '777';
  global.fetch = jest.fn(async (url: string, init: { method?: string; body?: string; headers?: Record<string, string> } = {}) => {
    const u = String(url);
    const method = init.method ?? 'GET';
    calls.push({ url: u, method, body: init.body, headers: init.headers });
    const reply = (json: unknown) => ({ ok: true, status: 200, json: async () => json, text: async () => JSON.stringify(json) });
    if (u.includes('/rest/v1/store_event') && method === 'POST') {
      const rows = JSON.parse(init.body ?? '[]') as unknown[];
      return { ok: true, status: 201, json: async () => (duplicate ? [] : rows.map(() => ({ store: 'google' }))), text: async () => '' };
    }
    if (u.includes('/rest/v1/store_event?select=amount')) return reply(todayRows);
    if (u.includes('/rest/v1/store_event?select=product_id')) return reply(earlierRows);
    return reply({ ok: true });
  }) as unknown as typeof fetch;
});

afterAll(() => {
  delete process.env.GOOGLE_RTDN_TOKEN;
  delete process.env.TELEGRAM_BOT_TOKEN;
  delete process.env.TELEGRAM_CHAT_ID;
});

describe('/api/store-google 인증', () => {
  it('GOOGLE_RTDN_TOKEN 이 없으면 503 (아무것도 기록하지 않음)', async () => {
    delete process.env.GOOGLE_RTDN_TOKEN;
    const res = fakeRes();
    await handler(req(push({ packageName: 'app.mylovecoach.android', testNotification: { version: '1.0' } })), res as never);
    expect(res.statusCode).toBe(503);
    expect(calls).toHaveLength(0);
  });

  it.each([[null], ['wrong-token'], ['']])('토큰이 없거나 다르면(%s) 401', async (token) => {
    const res = fakeRes();
    await handler(req(push({ packageName: 'app.mylovecoach.android', testNotification: { version: '1.0' } }), token), res as never);
    expect(res.statusCode).toBe(401);
    expect(calls).toHaveLength(0);
  });

  it('POST 가 아니면 405', async () => {
    const res = fakeRes();
    await handler(req(undefined, TOKEN, 'GET'), res as never);
    expect(res.statusCode).toBe(405);
  });

  it('Pub/Sub 형식이 아니면 400', async () => {
    const res = fakeRes();
    await handler(req({ message: { data: Buffer.from('not json').toString('base64') } }), res as never);
    expect(res.statusCode).toBe(400);
  });
});

describe('/api/store-google 처리', () => {
  it('연결 확인 알림 → 기록하고 「연결 확인」을 알린다', async () => {
    const res = fakeRes();
    await handler(req(push({ version: '1.0', packageName: 'app.mylovecoach.android', eventTimeMillis: '1761000000000', testNotification: { version: '1.0' } }, 'test-msg')), res as never);
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(inserts()[0].body ?? '[]')[0]).toMatchObject({ store: 'google', environment: 'test', kind: 'test', transaction_id: 'test-msg' });
    expect(telegramTexts()).toEqual(['🧪 Google Play 실시간 알림 연결 확인']);
  });

  it('하루 이용권 결제 → store_event 에 한 줄(중복 무시) + 결제·오늘 매출 알림', async () => {
    todayRows = [{ amount: 2700, currency: 'KRW' }, { amount: 9900, currency: 'KRW' }];
    const res = fakeRes();
    await handler(
      req(push({ version: '1.0', packageName: 'app.mylovecoach.android', eventTimeMillis: '1761000000000', oneTimeProductNotification: { version: '1.0', notificationType: 1, purchaseToken: 'secret-purchase-token', sku: 'mylovecoach.pass.day' } })),
      res as never,
    );
    expect(res.statusCode).toBe(200);
    const insert = inserts()[0];
    expect(insert.url).toContain('on_conflict=store%2Ctransaction_id%2Ckind');
    expect(insert.headers?.Prefer).toBe('resolution=ignore-duplicates,return=representation');
    const row = JSON.parse(insert.body ?? '[]')[0];
    expect(row).toMatchObject({
      store: 'google',
      environment: 'Production',
      kind: 'purchase',
      notification: 'ONE_TIME_PRODUCT_PURCHASED',
      product_id: 'mylovecoach.pass.day',
      plan: 'day',
      amount: 2700,
      currency: 'KRW',
      transaction_id: tokenHash('secret-purchase-token'),
    });
    // 구매 토큰 원문은 어디에도 저장하지 않는다
    expect(insert.body).not.toContain('secret-purchase-token');
    expect(telegramTexts()).toEqual(['💳 결제 · 하루 이용권 ₩2,700 · Android\n오늘 매출 ₩12,600 (2건)']);
    // 매출은 실제 결제(Production)의 결제·갱신만, 한국 자정부터
    const revenueQuery = calls.find((c) => c.url.includes('/rest/v1/store_event?select=amount'))!.url;
    expect(revenueQuery).toContain('environment=eq.Production');
    expect(revenueQuery).toContain('kind=in.(purchase,renewal)');
  });

  it('같은 알림을 다시 받으면(이미 기록됨) 알리지 않고 200', async () => {
    duplicate = true;
    const res = fakeRes();
    await handler(req(push({ packageName: 'app.mylovecoach.android', eventTimeMillis: '1', oneTimeProductNotification: { notificationType: 1, purchaseToken: 't', sku: 'mylovecoach.pass.day' } })), res as never);
    expect(res.statusCode).toBe(200);
    expect(telegramTexts()).toHaveLength(0);
  });

  it('다른 앱(패키지)의 알림은 기록·알림 없이 200 으로 넘긴다', async () => {
    const res = fakeRes();
    await handler(req(push({ packageName: 'com.other.app', oneTimeProductNotification: { notificationType: 1, purchaseToken: 't', sku: 'x' } })), res as never);
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ ignored: 'package' });
    expect(calls).toHaveLength(0);
  });

  it('주간 구독 해지 예약 → 「구독 해지 예약」, 매출 줄 없음', async () => {
    const res = fakeRes();
    await handler(req(push({ packageName: 'app.mylovecoach.android', eventTimeMillis: '1761000000000', subscriptionNotification: { notificationType: 3, purchaseToken: 'sub-token', subscriptionId: 'mylovecoach.premium.weekly' } })), res as never);
    expect(telegramTexts()).toEqual(['⚠️ 구독 해지 예약 · 주간 구독 · Android']);
    const row = JSON.parse(inserts()[0].body ?? '[]')[0];
    // 같은 구독에 여러 번 생길 수 있는 일은 토큰+알림 시각으로 구분
    expect(row.transaction_id).toBe(`${tokenHash('sub-token')}:1761000000000`);
    expect(row.original_transaction_id).toBe(tokenHash('sub-token'));
  });

  it('환불(취소된 구매) → 같은 구매의 앞선 기록에서 상품을 찾아 알린다', async () => {
    earlierRows = [{ product_id: 'mylovecoach.premium.lifetime', plan: 'lifetime' }];
    const res = fakeRes();
    await handler(req(push({ packageName: 'app.mylovecoach.android', eventTimeMillis: '1', voidedPurchaseNotification: { purchaseToken: 'life-token', orderId: 'GPA.1', productType: 2, refundType: 1 } })), res as never);
    expect(res.statusCode).toBe(200);
    expect(calls.find((c) => c.url.includes('select=product_id'))!.url).toContain(`original_transaction_id=eq.${tokenHash('life-token')}`);
    expect(telegramTexts()).toEqual(['↩️ 환불 · 평생권 ₩29,800 · Android']);
  });

  it('구독 복구처럼 알리지 않는 종류는 기록만 한다', async () => {
    const res = fakeRes();
    await handler(req(push({ packageName: 'app.mylovecoach.android', eventTimeMillis: '5', subscriptionNotification: { notificationType: 1, purchaseToken: 'sub-token', subscriptionId: 'mylovecoach.premium.weekly' } })), res as never);
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(inserts()[0].body ?? '[]')[0]).toMatchObject({ kind: 'other', notification: 'SUBSCRIPTION_RECOVERED' });
    expect(telegramTexts()).toHaveLength(0);
  });

  it('데이터베이스에 닿지 못해도 알림은 보내고 200 (놓치지 않게)', async () => {
    delete process.env.SUPABASE_URL;
    const res = fakeRes();
    await handler(req(push({ packageName: 'app.mylovecoach.android', eventTimeMillis: '1', subscriptionNotification: { notificationType: 2, purchaseToken: 'sub-token', subscriptionId: 'mylovecoach.premium.weekly' } })), res as never);
    expect(res.statusCode).toBe(200);
    expect(telegramTexts()).toEqual(['🔁 구독 갱신 · 주간 구독 ₩9,900 · Android']);
  });
});

describe('알림 해석', () => {
  it('구독 알림 종류', () => {
    expect([4, 2, 3, 12, 13, 6, 1, 7].map(subscriptionKind)).toEqual(['purchase', 'renewal', 'cancel', 'refund', 'expire', 'fail', 'other', 'other']);
  });

  it('구독 상품 ID 가 비어 오면 주간 구독으로 본다', () => {
    const row = googleEventRow({ packageName: 'app.mylovecoach.android', eventTimeMillis: 9, subscriptionNotification: { notificationType: 4, purchaseToken: 'p' } }, null);
    expect(row).toMatchObject({ kind: 'purchase', plan: 'weekly', amount: 9900, transaction_id: tokenHash('p') });
  });

  it('페이로드 래핑 해제(본문이 곧 알림)도 받는다', () => {
    const parsed = readPush({ packageName: 'app.mylovecoach.android', testNotification: {} }, { 'x-goog-pubsub-message-id': 'abc' });
    expect(parsed?.messageId).toBe('abc');
    expect(readPush(null)).toBeNull();
  });
});
