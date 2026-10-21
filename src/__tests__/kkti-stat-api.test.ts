/**
 * api/_kkti-stat.ts (바깥 주소 /api/kkti-stat) — KKTI 횟수 집계. 누가 했는지는 남기지 않고 날짜별 숫자만 올리는지가 핵심이다.
 * Supabase 는 fetch 를 가짜로 바꿔 어떤 요청이 나가는지만 본다.
 */
import handler, { KKTI_STAT_EVENTS, KKTI_STAT_PREFIX } from '../../api/_kkti-stat';

interface FakeRes {
  statusCode: number;
  ended: boolean;
  setHeader: () => FakeRes;
  status: (code: number) => FakeRes;
  json: (body: unknown) => FakeRes;
  end: () => FakeRes;
}

function fakeRes(): FakeRes {
  const res = { statusCode: 200, ended: false } as FakeRes;
  res.setHeader = () => res;
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = () => res;
  res.end = () => {
    res.ended = true;
    return res;
  };
  return res;
}

let ipSeq = 0;
const post = async (body: unknown, opts: { method?: string; headers?: Record<string, string>; ip?: string } = {}) => {
  const res = fakeRes();
  const headers = { 'x-forwarded-for': opts.ip ?? `10.1.0.${++ipSeq}`, ...(opts.headers ?? {}) };
  await handler({ method: opts.method ?? 'POST', body, headers, query: {} } as never, res as never);
  return res;
};

const calls: { url: string; body: unknown; headers: Record<string, string> }[] = [];
const realFetch = global.fetch;
const env = { ...process.env };

beforeEach(() => {
  calls.length = 0;
  process.env.SUPABASE_URL = 'https://db.example.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
  delete process.env.COACH_APP_TOKEN;
  global.fetch = jest.fn(async (url: unknown, init?: { body?: string; headers?: Record<string, string> }) => {
    calls.push({ url: String(url), body: init?.body ? JSON.parse(init.body) : null, headers: init?.headers ?? {} });
    return { ok: true, status: 200, text: async () => 'true' } as never;
  }) as never;
});

afterAll(() => {
  global.fetch = realFetch;
  process.env = env;
});

describe('POST /api/kkti-stat', () => {
  it('정해진 이벤트면 날짜별 횟수 표의 숫자만 1 올린다 (기기 ID·IP·답 코드 없이)', async () => {
    for (const event of KKTI_STAT_EVENTS) {
      calls.length = 0;
      const res = await post({ event, deviceId: 'd_secret123', a: '000006', name: '민지' }, { ip: '203.0.113.9' });
      expect(res.statusCode).toBe(204);
      expect(calls).toHaveLength(1);
      expect(calls[0].url).toBe('https://db.example.co/rest/v1/rpc/take_quota');
      expect(calls[0].body).toEqual({ p_kind: KKTI_STAT_PREFIX + event, p_units: 1, p_limit: 200_000 });
      const sent = JSON.stringify(calls[0].body) + calls[0].url;
      for (const secret of ['d_secret123', '000006', '민지', '203.0.113.9']) expect(sent).not.toContain(secret);
    }
  });

  it('모르는 이벤트·모양이 다른 본문은 400, 아무것도 저장하지 않는다', async () => {
    for (const body of [{ event: 'drop table' }, { event: 'kkti:start' }, { event: 1 }, {}, null, 'start']) {
      expect((await post(body)).statusCode).toBe(400);
    }
    expect(calls).toHaveLength(0);
  });

  it('POST 만 받고, 앱 토큰이 설정돼 있으면 확인한다', async () => {
    expect((await post({ event: 'start' }, { method: 'GET' })).statusCode).toBe(405);
    process.env.COACH_APP_TOKEN = 'app-token';
    expect((await post({ event: 'start' })).statusCode).toBe(401);
    expect((await post({ event: 'start' }, { headers: { 'x-app-token': 'app-token' } })).statusCode).toBe(204);
  });

  it('같은 곳에서 너무 자주 부르면 429 (숫자 부풀리기 방지)', async () => {
    let last = 204;
    for (let i = 0; i < 41; i++) last = (await post({ event: 'share' }, { ip: '198.51.100.7' })).statusCode;
    expect(last).toBe(429);
    expect(calls.length).toBe(40);
  });

  it('데이터베이스가 연결돼 있지 않아도 조용히 204', async () => {
    delete process.env.SUPABASE_URL;
    expect((await post({ event: 'complete' })).statusCode).toBe(204);
    expect(calls).toHaveLength(0);
  });

  it('너무 큰 본문은 받지 않는다', async () => {
    expect((await post({ event: 'start', pad: 'x'.repeat(500) }, { headers: { 'content-length': '600' } })).statusCode).toBe(413);
  });
});
