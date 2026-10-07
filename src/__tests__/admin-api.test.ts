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

function fakeReq(headers: Record<string, string>, query: Record<string, string> = {}, method = 'GET') {
  return { method, body: undefined, query, headers: { 'x-forwarded-for': '10.2.3.4', ...headers } } as never;
}

beforeEach(() => {
  calls.length = 0;
  failRows = 0;
  process.env.SUPABASE_URL = 'https://db.example';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
  process.env.ADMIN_TOKEN = '0729';
  process.env.ADMIN_DEVICE_SECRET = DEVICE;
  global.fetch = jest.fn(async (url: string, init: { method?: string } = {}) => {
    const method = init.method ?? 'GET';
    calls.push({ url: String(url), method });
    const u = String(url);
    if (u.includes('/rest/v1/admin_auth_fail') && method === 'POST') failRows += 1;
    const json = u.includes('/rest/v1/admin_auth_fail')
      ? Array.from({ length: failRows }, (_, i) => ({ id: i }))
      : u.includes('/rpc/admin_stats')
        ? { days: 7 }
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

  it('기기 열쇠가 서버에 설정되지 않았으면 500 (열쇠 없이 열리지 않음)', async () => {
    delete process.env.ADMIN_DEVICE_SECRET;
    const res = fakeRes();
    await handler(fakeReq({ 'x-admin-device': DEVICE, authorization: 'Bearer 0729' }), res as never);
    expect(res.statusCode).toBe(500);
  });
});
