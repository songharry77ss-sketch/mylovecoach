/**
 * api/track.ts — 동의 판 확인, 남용 막기(크기·빈도·props), 시각 보정, 동의 철회 삭제.
 * Supabase 는 fetch 를 가짜로 바꿔 어떤 요청이 나가는지만 본다.
 */
import handler, { clampAt, cleanProps } from '../../api/track';

interface FakeRes {
  statusCode: number;
  body?: unknown;
  setHeader: () => FakeRes;
  status: (code: number) => FakeRes;
  json: (body: unknown) => FakeRes;
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

let ipSeq = 0;
function fakeReq(method: string, body: unknown, headers: Record<string, string> = {}) {
  ipSeq += 1;
  return { method, body, query: {}, headers: { 'x-forwarded-for': `10.1.${Math.floor(ipSeq / 250)}.${ipSeq % 250}`, ...headers } } as never;
}

const calls: { url: string; method: string; body?: string }[] = [];
const NOW = Date.now();
const goodBody = (extra: Record<string, unknown> = {}) => ({
  deviceId: 'd_testdevice01',
  sessionId: 's_session01',
  consentVersion: 2,
  platform: 'web',
  events: [
    { type: 'screen', name: '/crush/c_abc', durationMs: 5 * 60 * 60 * 1000, at: NOW - 1000 },
    { type: 'event', name: 'paywall_open', props: { reason: 'quota', nested: { a: 1 }, long: 'x'.repeat(500), n: 3, ok: true }, at: NOW - 500 },
  ],
  ...extra,
});

beforeEach(() => {
  calls.length = 0;
  process.env.SUPABASE_URL = 'https://db.example';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
  process.env.ANALYTICS_ENABLED = '1';
  delete process.env.COACH_APP_TOKEN;
  global.fetch = jest.fn(async (url: string, init: { method?: string; body?: string } = {}) => {
    calls.push({ url: String(url), method: init.method ?? 'GET', body: init.body });
    return { ok: true, status: 201, text: async () => '', json: async () => ({}) };
  }) as unknown as typeof fetch;
});

describe('POST /api/track', () => {
  it('예전 미리 체크 동의(판 없음)는 받기만 하고 저장하지 않는다', async () => {
    const res = fakeRes();
    await handler(fakeReq('POST', goodBody({ consentVersion: undefined })), res as never);
    expect(res.statusCode).toBe(204);
    expect(calls).toHaveLength(0);
  });

  it('직접 체크한 동의(판 2)는 저장하고, props·체류 시간을 정리한다', async () => {
    const res = fakeRes();
    await handler(fakeReq('POST', goodBody()), res as never);
    expect(res.statusCode).toBe(204);
    const eventInsert = calls.find((c) => c.url.endsWith('/rest/v1/app_event') && c.method === 'POST');
    const screenInsert = calls.find((c) => c.url.endsWith('/rest/v1/screen_view') && c.method === 'POST');
    expect(eventInsert).toBeDefined();
    const [event] = JSON.parse(eventInsert!.body!);
    expect(event.props).toEqual({ reason: 'quota', long: 'x'.repeat(200), n: 3, ok: true });
    const [screen] = JSON.parse(screenInsert!.body!);
    expect(screen.duration_ms).toBe(30 * 60 * 1000);
  });

  it('수집이 꺼져 있으면 저장하지 않는다', async () => {
    process.env.ANALYTICS_ENABLED = '0';
    const res = fakeRes();
    await handler(fakeReq('POST', goodBody()), res as never);
    expect(res.statusCode).toBe(204);
    expect(calls).toHaveLength(0);
  });

  it('기기 ID 형식이 틀리면 400', async () => {
    const res = fakeRes();
    await handler(fakeReq('POST', goodBody({ deviceId: 'bad id!' })), res as never);
    expect(res.statusCode).toBe(400);
    expect(calls).toHaveLength(0);
  });

  it('본문이 64KB 를 넘으면 413', async () => {
    const res = fakeRes();
    await handler(fakeReq('POST', goodBody(), { 'content-length': String(70 * 1024) }), res as never);
    expect(res.statusCode).toBe(413);
  });

  it('같은 IP 가 5분에 60번을 넘으면 429', async () => {
    let last = fakeRes();
    for (let i = 0; i < 61; i += 1) {
      last = fakeRes();
      await handler({ method: 'POST', body: goodBody({ consentVersion: undefined }), query: {}, headers: { 'x-forwarded-for': '10.9.9.9' } } as never, last as never);
    }
    expect(last.statusCode).toBe(429);
  });

  it('앱 토큰이 설정돼 있으면 맞지 않는 요청은 401', async () => {
    process.env.COACH_APP_TOKEN = 'app-token';
    const res = fakeRes();
    await handler(fakeReq('POST', goodBody(), { 'x-app-token': 'wrong' }), res as never);
    expect(res.statusCode).toBe(401);
  });
});

describe('DELETE /api/track (동의 철회)', () => {
  it('그 기기의 기록을 지우는 함수를 부른다 — 수집이 꺼져 있어도', async () => {
    process.env.ANALYTICS_ENABLED = '0';
    const res = fakeRes();
    await handler(fakeReq('DELETE', { deviceId: 'd_testdevice01' }), res as never);
    expect(res.statusCode).toBe(204);
    const call = calls.find((c) => c.url.endsWith('/rest/v1/rpc/delete_device'));
    expect(call && JSON.parse(call.body!)).toEqual({ p_device: 'd_testdevice01' });
  });

  it('기기 ID 형식이 틀리면 400', async () => {
    const res = fakeRes();
    await handler(fakeReq('DELETE', { deviceId: "x' or 1=1" }), res as never);
    expect(res.statusCode).toBe(400);
    expect(calls).toHaveLength(0);
  });
});

describe('도우미', () => {
  it('cleanProps 는 짧은 원시값만, 12개까지 남긴다', () => {
    const many = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`k${i}`, i]));
    expect(Object.keys(cleanProps(many) ?? {})).toHaveLength(12);
    expect(cleanProps({ a: [1, 2], b: undefined, c: NaN })).toBeNull();
    expect(cleanProps('text')).toBeNull();
  });

  it('clampAt 은 최근 7일 ~ 10분 뒤 밖의 시각을 서버 시각으로 바꾼다', () => {
    const now = 1_800_000_000_000;
    expect(clampAt(now - 1000, now)).toBe(now - 1000);
    expect(clampAt(now - 8 * 24 * 60 * 60 * 1000, now)).toBe(now);
    expect(clampAt(now + 60 * 60 * 1000, now)).toBe(now);
    expect(clampAt(Number.MAX_SAFE_INTEGER, now)).toBe(now);
    expect(clampAt(undefined, now)).toBe(now);
  });
});
