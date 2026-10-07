/**
 * api/admin.ts — 등록한 브라우저(기기 열쇠) + 비밀번호, IP 단위 잠금.
 * 익명 요청이 데이터베이스(잠금 기록)를 건드리지 못하는지가 핵심이다.
 */
import handler from '../../api/admin';

interface FakeRes {
  statusCode: number;
  body?: { error?: string; code?: string } & Record<string, unknown>;
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

const DEVICE = 'device-secret-0123456789-abcdefghijklmnop';
const calls: { url: string; method: string }[] = [];
let failRows = 0;
/** ai_report 표가 아직 없는 DB 흉내 (스키마 조각을 실행하기 전) */
let reportTableMissing = false;
const REPORTS = [{ id: 1, created_at: '2026-10-07T10:00:00Z', mode: 'practice', reason: 'sexual', note: null, content: '연습 상대 「민준」: …', model: 'google/relay', platform: 'android', app_version: '1.0.0', status: 'new' }];

function fakeReq(headers: Record<string, string>, query: Record<string, string> = {}, method = 'GET') {
  return { method, body: undefined, query, headers: { 'x-forwarded-for': '10.2.3.4', ...headers } } as never;
}

beforeEach(() => {
  calls.length = 0;
  failRows = 0;
  reportTableMissing = false;
  process.env.SUPABASE_URL = 'https://db.example';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
  process.env.ADMIN_TOKEN = '0729';
  process.env.ADMIN_DEVICE_SECRET = DEVICE;
  global.fetch = jest.fn(async (url: string, init: { method?: string } = {}) => {
    const method = init.method ?? 'GET';
    calls.push({ url: String(url), method });
    const u = String(url);
    if (u.includes('/rest/v1/admin_auth_fail') && method === 'POST') failRows += 1;
    if (u.includes('/rest/v1/ai_report') && reportTableMissing) return { ok: false, status: 404, text: async () => 'relation "ai_report" does not exist', json: async () => ({}) };
    const json = u.includes('/rest/v1/admin_auth_fail')
      ? Array.from({ length: failRows }, (_, i) => ({ id: i }))
      : u.includes('/rpc/admin_stats')
        ? { days: 7 }
        : u.includes('/rest/v1/ai_report')
          ? REPORTS
          : [];
    return { ok: true, status: 200, text: async () => JSON.stringify(json), json: async () => json };
  }) as unknown as typeof fetch;
});

describe('/api/admin', () => {
  it('등록 안 된 브라우저는 데이터베이스를 건드리지 않고 401(device)', async () => {
    const res = fakeRes();
    await handler(fakeReq({ authorization: 'Bearer 0729' }), res as never);
    expect(res.statusCode).toBe(401);
    expect(res.body?.code).toBe('device');
    expect(calls).toHaveLength(0);
  });

  it('주소의 ?token= 으로는 들어갈 수 없다', async () => {
    const res = fakeRes();
    await handler(fakeReq({ 'x-admin-device': DEVICE }, { token: '0729' }), res as never);
    expect(res.statusCode).toBe(401);
    expect(res.body?.code).toBeUndefined();
  });

  it('등록된 브라우저 + 맞는 비밀번호면 집계를 돌려주고 시도 기록을 지운다', async () => {
    const res = fakeRes();
    await handler(fakeReq({ 'x-admin-device': DEVICE, authorization: 'Bearer 0729' }), res as never);
    expect(res.statusCode).toBe(200);
    expect(calls.some((c) => c.url.includes('/rpc/admin_stats'))).toBe(true);
    expect(calls.some((c) => c.url.includes('/rest/v1/admin_auth_fail') && c.method === 'DELETE')).toBe(true);
  });

  it('등록된 브라우저에서 비밀번호를 10번 넘게 틀리면 429', async () => {
    let last = fakeRes();
    for (let i = 0; i < 11; i += 1) {
      last = fakeRes();
      await handler(fakeReq({ 'x-admin-device': DEVICE, authorization: `Bearer ${1000 + i}` }), last as never);
    }
    expect(last.statusCode).toBe(429);
  });

  it('기본 응답에 최근 AI 답변 신고 50건을 함께 돌려준다', async () => {
    const res = fakeRes();
    await handler(fakeReq({ 'x-admin-device': DEVICE, authorization: 'Bearer 0729' }), res as never);
    expect(res.statusCode).toBe(200);
    expect(res.body?.reports).toEqual(REPORTS);
    const call = calls.find((c) => c.url.includes('/rest/v1/ai_report'));
    expect(call?.url).toContain('order=created_at.desc');
    expect(call?.url).toContain('limit=50');
  });

  it('ai_report 표가 아직 없어도 나머지 화면은 그대로 열린다 (신고는 빈 목록)', async () => {
    reportTableMissing = true;
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const res = fakeRes();
    await handler(fakeReq({ 'x-admin-device': DEVICE, authorization: 'Bearer 0729' }), res as never);
    warn.mockRestore();
    expect(res.statusCode).toBe(200);
    expect(res.body?.reports).toEqual([]);
  });

  it('「기록 삭제」는 void 함수의 본문 없는 204 응답에도 성공한다 (예전에는 지우고도 502)', async () => {
    const base = global.fetch as jest.Mock;
    const original = base.getMockImplementation()!;
    base.mockImplementation(async (url: string, init: { method?: string } = {}) => {
      if (String(url).includes('/rpc/delete_device')) {
        calls.push({ url: String(url), method: init.method ?? 'GET' });
        return {
          ok: true,
          status: 204,
          text: async () => '',
          json: async () => {
            throw new SyntaxError('Unexpected end of JSON input');
          },
        };
      }
      return original(url, init);
    });
    const res = fakeRes();
    const req = {
      method: 'POST',
      body: { action: 'device_delete', deviceId: 'd_testdevice01' },
      query: {},
      headers: { 'x-forwarded-for': '10.2.3.4', 'x-admin-device': DEVICE, authorization: 'Bearer 0729' },
    } as never;
    await handler(req, res as never);
    expect(res.statusCode).toBe(200);
    expect(calls.some((c) => c.url.includes('/rpc/delete_device'))).toBe(true);
  });

  it('기기 열쇠가 서버에 설정되지 않았으면 500 (열쇠 없이 열리지 않음)', async () => {
    delete process.env.ADMIN_DEVICE_SECRET;
    const res = fakeRes();
    await handler(fakeReq({ 'x-admin-device': DEVICE, authorization: 'Bearer 0729' }), res as never);
    expect(res.statusCode).toBe(500);
  });
});
