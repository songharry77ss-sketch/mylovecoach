/**
 * api/daily-report.ts — 매일 아침 운영자 리포트 (Vercel Cron).
 * CRON_SECRET 인증, 어제(한국 날짜) 기간으로 묻는지, 리포트 문구(회원·매출·이용)를 가짜 PostgREST 응답으로 확인한다.
 */
import handler, { reportMessage } from '../../api/daily-report';
import { countRows } from '../../api/_supabase';

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

const SECRET = 'cron-secret-0123456789';
const calls: { url: string; method: string; body?: string }[] = [];

const NEW_MEMBERS = [
  { nickname: '민수', provider: 'kakao', email: 'minsu@example.com' },
  { nickname: '<지은>', provider: 'apple', email: 'abc@privaterelay.appleid.com' },
];
const SALES = [
  { store: 'apple', kind: 'purchase', plan: 'day', product_id: 'mylovecoach.pass.day', amount: 2700, currency: 'KRW' },
  { store: 'apple', kind: 'purchase', plan: 'day', product_id: 'mylovecoach.pass.day', amount: '2700', currency: 'KRW' },
  { store: 'google', kind: 'renewal', plan: 'weekly', product_id: 'mylovecoach.premium.weekly', amount: 9900, currency: 'KRW' },
  { store: 'apple', kind: 'refund', plan: 'lifetime', product_id: 'mylovecoach.premium.lifetime', amount: 29800, currency: 'KRW' },
  { store: 'google', kind: 'cancel', plan: 'weekly', product_id: 'mylovecoach.premium.weekly', amount: null, currency: 'KRW' },
];

beforeEach(() => {
  calls.length = 0;
  process.env.CRON_SECRET = SECRET;
  process.env.SUPABASE_URL = 'https://db.example';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
  process.env.TELEGRAM_BOT_TOKEN = 'bot-token';
  process.env.TELEGRAM_CHAT_ID = '777';
  global.fetch = jest.fn(async (url: string, init: { method?: string; body?: string } = {}) => {
    const u = String(url);
    calls.push({ url: u, method: init.method ?? 'GET', body: init.body });
    const rows = (json: unknown, total?: number) => ({
      ok: true,
      status: 200,
      headers: { get: (k: string) => (k === 'content-range' && total != null ? `0-0/${total}` : null) },
      json: async () => json,
      text: async () => JSON.stringify(json),
    });
    if (u.startsWith('https://api.telegram.org/')) return rows({ ok: true });
    if (u.includes('/rest/v1/member?select=*')) return rows([], u.includes('created_at=gte.') ? 12 : 340);
    if (u.includes('/rest/v1/member?select=nickname')) return rows(NEW_MEMBERS);
    if (u.includes('/rest/v1/store_event?')) return rows(SALES);
    if (u.includes('/rest/v1/app_event?') && u.includes('coach_success')) return rows([], 57);
    if (u.includes('/rest/v1/app_session?')) return rows([{ device_id: 'd_1' }, { device_id: 'd_1' }, { device_id: 'd_2' }, { device_id: 'd_3' }]);
    if (u.includes('/rest/v1/app_event?') && u.includes('paywall_open')) return rows([{ device_id: 'd_1' }, { device_id: 'd_2' }]);
    if (u.includes('/rest/v1/app_event?') && u.includes('purchase_start')) return rows([{ device_id: 'd_1' }]);
    return rows([]);
  }) as unknown as typeof fetch;
});

afterAll(() => {
  delete process.env.CRON_SECRET;
  delete process.env.TELEGRAM_BOT_TOKEN;
  delete process.env.TELEGRAM_CHAT_ID;
});

const cronReq = (authorization?: string) => ({ method: 'GET', query: {}, headers: authorization ? { authorization } : {} }) as never;
const telegramTexts = () => calls.filter((c) => c.url.startsWith('https://api.telegram.org/')).map((c) => String(JSON.parse(c.body ?? '{}').text));

describe('/api/daily-report', () => {
  it('CRON_SECRET 이 없으면 503', async () => {
    delete process.env.CRON_SECRET;
    const res = fakeRes();
    await handler(cronReq(`Bearer ${SECRET}`), res as never);
    expect(res.statusCode).toBe(503);
    expect(calls).toHaveLength(0);
  });

  it.each([undefined, 'Bearer wrong', SECRET])('인증 머리글이 맞지 않으면(%s) 401 — 데이터베이스를 읽지 않는다', async (auth) => {
    const res = fakeRes();
    await handler(cronReq(auth), res as never);
    expect(res.statusCode).toBe(401);
    expect(calls).toHaveLength(0);
  });

  it('어제(한국 날짜) 회원·매출·이용을 모아 텔레그램으로 보내고, 응답에는 내용을 싣지 않는다', async () => {
    jest.useFakeTimers({ now: new Date('2026-10-21T00:05:00Z'), doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
    try {
      const res = fakeRes();
      await handler(cronReq(`Bearer ${SECRET}`), res as never);
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({ sent: true });
    } finally {
      jest.useRealTimers();
    }
    // 어제 = 10/20 00:00 ~ 10/21 00:00 KST = 10/19 15:00Z ~ 10/20 15:00Z
    const memberQuery = calls.find((c) => c.url.includes('/rest/v1/member?select=nickname'))!.url;
    expect(memberQuery).toContain(`created_at=gte.${encodeURIComponent('2026-10-19T15:00:00.000Z')}`);
    expect(memberQuery).toContain(`created_at=lt.${encodeURIComponent('2026-10-20T15:00:00.000Z')}`);
    expect(calls.find((c) => c.url.includes('/rest/v1/store_event?'))!.url).toContain('environment=eq.Production');

    const [text] = telegramTexts();
    expect(text).toBe(
      [
        '📊 어제 리포트 (10/20)',
        '',
        '👥 신규 회원 12명 · 누적 340명',
        ' · 민수 · 카카오 · minsu@example.com',
        ' · &lt;지은&gt; · Apple · abc@privaterelay.appleid.com',
        ' · 외 10명',
        '',
        '💰 매출 ₩15,300 (3건)',
        ' · iOS 하루 이용권 ₩5,400 (2건)',
        ' · Android 주간 구독 ₩9,900 (1건)',
        ' · ↩️ 환불 1건 · ⚠️ 해지 예약 1건',
        '',
        '📱 이용 (이용 기록이 있는 기기)',
        ' · 앱 실행 기기 3대',
        ' · 코칭 결과 57건',
        ' · 결제 화면 열람 2대 → 결제창 진입 1대',
      ].join('\n'),
    );
  });

  it('텔레그램을 설정하지 않았으면 데이터베이스를 읽지 않고 sent: false', async () => {
    delete process.env.TELEGRAM_CHAT_ID;
    const res = fakeRes();
    await handler(cronReq(`Bearer ${SECRET}`), res as never);
    expect(res.body).toEqual({ sent: false, reason: 'telegram' });
    expect(calls).toHaveLength(0);
  });

  it('읽지 못한 항목은 「확인 못 함」으로 적는다', () => {
    const text = reportMessage({ day: '10/20', newMembers: null, members: null, totalMembers: null, sales: null, launches: null, coaching: 0, paywall: null, checkout: null });
    expect(text).toContain('👥 신규 회원 확인 못 함 · 누적 확인 못 함');
    expect(text).toContain('💰 매출 확인 못 함');
    expect(text).toContain(' · 코칭 결과 0건');
  });
});

describe('countRows (PostgREST 행 수)', () => {
  const reply = (status: number, range: string | null) => ({ ok: status < 300, status, headers: { get: (k: string) => (k === 'content-range' ? range : null) }, json: async () => [] });

  it('content-range 의 전체 수를 읽고, 0건(416 · */0)도 0 으로 센다', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(reply(206, '0-0/42'));
    await expect(countRows('member', 'provider=not.is.null')).resolves.toBe(42);
    (global.fetch as jest.Mock).mockResolvedValueOnce(reply(416, '*/0'));
    await expect(countRows('member')).resolves.toBe(0);
  });

  it('전체 수를 모르면(머리글 없음·오류) null', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    (global.fetch as jest.Mock).mockResolvedValueOnce(reply(500, null));
    await expect(countRows('member')).resolves.toBeNull();
    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('network'));
    await expect(countRows('member')).resolves.toBeNull();
    warn.mockRestore();
  });
});
