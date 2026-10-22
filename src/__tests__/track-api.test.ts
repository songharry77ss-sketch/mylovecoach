/**
 * api/track.ts — 수집 기준의 판 확인(3 기본 이용 기록 · 2 예전 선택 동의), 이름 미저장, 처리 정지 기기,
 * 남용 막기(크기·빈도·props), 시각 보정, 전체 삭제·코칭 내용만 삭제.
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
  delete process.env.ANALYTICS_OPTOUT_DEVICES;
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

  it('유입 경로 보충은 수집 1년 안의 이용자에게만 (1년 지나 파기한 경로를 다시 채우지 않게)', async () => {
    const res = fakeRes();
    await handler(fakeReq('POST', goodBody({ acquisition: { channel: 'web', source: 'tiktok', at: NOW - 1000 } })), res as never);
    expect(res.statusCode).toBe(204);
    const refill = calls.find((c) => c.method === 'PATCH' && c.url.includes('source=is.null'));
    expect(refill?.url).toMatch(/first_seen_at=gte\./);
  });

  it('직접 체크한 동의(판 2)는 저장하고, props·체류 시간을 정리한다', async () => {
    const res = fakeRes();
    await handler(fakeReq('POST', goodBody()), res as never);
    expect(res.statusCode).toBe(204);
    const eventInsert = calls.find((c) => c.url.endsWith('/rest/v1/app_event') && c.method === 'POST');
    const screenInsert = calls.find((c) => c.url.endsWith('/rest/v1/screen_view') && c.method === 'POST');
    expect(eventInsert).toBeDefined();
    const [event] = JSON.parse(eventInsert!.body!);
    expect(event.props).toEqual({ reason: 'quota', long: 'x'.repeat(100), n: 3, ok: true });
    const [screen] = JSON.parse(screenInsert!.body!);
    expect(screen.duration_ms).toBe(30 * 60 * 1000);
  });

  it('판 3(기본 이용 기록 — 선택 동의 없이 보낸 1.0.4 앱)도 저장하되, 이름은 저장하지 않고 예전 동의로 저장된 이름도 지운다', async () => {
    const res = fakeRes();
    await handler(fakeReq('POST', goodBody({ consentVersion: 3, user: { name: '민지', gender: 'female', age: 25 } })), res as never);
    expect(res.statusCode).toBe(204);
    expect(calls.some((c) => c.method === 'POST' && c.url.endsWith('/rest/v1/app_event'))).toBe(true);
    const [created] = JSON.parse(calls.find((c) => c.method === 'POST' && c.url.endsWith('/rest/v1/app_user'))!.body!);
    expect(created).toMatchObject({ name: null, gender: 'female', age: 25 });
    const update = calls.find((c) => c.method === 'PATCH' && c.url.includes('/rest/v1/app_user?device_id=eq.') && !c.url.includes('source=is.null'));
    expect(JSON.parse(update!.body!)).toMatchObject({ name: null, gender: 'female', age: 25 });
  });

  it('예전 앱의 직접 체크 동의(판 2)는 동의받은 대로 이름까지 저장한다 (1.0.3 까지의 앱)', async () => {
    const res = fakeRes();
    await handler(fakeReq('POST', goodBody({ user: { name: '민지', age: 25 } })), res as never);
    expect(res.statusCode).toBe(204);
    const [created] = JSON.parse(calls.find((c) => c.method === 'POST' && c.url.endsWith('/rest/v1/app_user'))!.body!);
    expect(created.name).toBe('민지');
  });

  it('메일로 처리 정지를 요청한 기기(ANALYTICS_OPTOUT_DEVICES)는 받기만 하고 저장하지 않는다', async () => {
    process.env.ANALYTICS_OPTOUT_DEVICES = 'd_other01, d_testdevice01';
    const res = fakeRes();
    await handler(fakeReq('POST', goodBody({ consentVersion: 3 })), res as never);
    expect(res.statusCode).toBe(204);
    expect(calls).toHaveLength(0);
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

  it('본문이 16KB 를 넘으면 413', async () => {
    const res = fakeRes();
    await handler(fakeReq('POST', goodBody(), { 'content-length': String(20 * 1024) }), res as never);
    expect(res.statusCode).toBe(413);
  });

  it('이벤트가 60개를 넘으면 400', async () => {
    const res = fakeRes();
    const events = Array.from({ length: 61 }, (_, i) => ({ type: 'event', name: `e${i}`, at: NOW - 1000 }));
    await handler(fakeReq('POST', goodBody({ events })), res as never);
    expect(res.statusCode).toBe(400);
  });

  it('만 14세 미만이면 동의 판이 없는 예전 앱이 보낸 것이라도 저장하지 않고 그 기기 기록을 지운다', async () => {
    const res = fakeRes();
    await handler(fakeReq('POST', goodBody({ consentVersion: undefined, user: { name: '민수', age: 12 } })), res as never);
    expect(res.statusCode).toBe(204);
    const del = calls.find((c) => c.url.endsWith('/rest/v1/rpc/delete_device'));
    expect(del && JSON.parse(del.body!)).toEqual({ p_device: 'd_testdevice01' });
  });

  it('만 14세 미만으로 입력했으면 저장하지 않고 그 기기 기록을 지운다', async () => {
    const res = fakeRes();
    await handler(fakeReq('POST', goodBody({ user: { name: '민수', age: 13 } })), res as never);
    expect(res.statusCode).toBe(204);
    expect(calls.some((c) => c.method === 'POST' && /\/rest\/v1\/(app_event|screen_view|app_user|app_session)$/.test(c.url))).toBe(false);
    const del = calls.find((c) => c.url.endsWith('/rest/v1/rpc/delete_device'));
    expect(del && JSON.parse(del.body!)).toEqual({ p_device: 'd_testdevice01' });
  });

  it('하루 저장 상한을 넘으면(take_quota=false) 저장하지 않는다', async () => {
    global.fetch = jest.fn(async (url: string, init: { method?: string; body?: string } = {}) => {
      calls.push({ url: String(url), method: init.method ?? 'GET', body: init.body });
      const body = String(url).endsWith('/rpc/take_quota') ? 'false' : '';
      return { ok: true, status: 200, text: async () => body, json: async () => JSON.parse(body || '{}') };
    }) as unknown as typeof fetch;
    const res = fakeRes();
    await handler(fakeReq('POST', goodBody()), res as never);
    expect(res.statusCode).toBe(204);
    const quota = JSON.parse(calls.find((c) => c.url.endsWith('/rpc/take_quota'))!.body!);
    // 저장할 내용의 크기(KB)로 센다 (행 수가 아니라)
    expect(quota).toMatchObject({ p_kind: 'track', p_limit: 10_000 });
    expect(quota.p_units).toBeGreaterThanOrEqual(2);
    expect(calls.some((c) => c.url.endsWith('/rest/v1/app_event'))).toBe(false);
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

describe('DELETE /api/track (전체 삭제·코칭 내용 삭제)', () => {
  it('scope: content 면 delete_device_content 함수로 코칭 내용·호감 온도·예전 이름만 지운다 (기본 이용 기록은 남김)', async () => {
    const res = fakeRes();
    await handler(fakeReq('DELETE', { deviceId: 'd_testdevice01', scope: 'content' }), res as never);
    expect(res.statusCode).toBe(204);
    const fn = calls.find((c) => c.url.endsWith('/rpc/delete_device_content'));
    expect(JSON.parse(fn!.body!)).toEqual({ p_device: 'd_testdevice01' });
    expect(calls.some((c) => c.url.endsWith('/rpc/delete_device'))).toBe(false);
    expect(calls.some((c) => c.method === 'DELETE')).toBe(false);
  });

  it('delete_device_content 가 아직 없는 DB 면 코칭 내용과 예전 동의로 저장된 이름을 표에서 직접 지운다', async () => {
    const base = global.fetch as jest.Mock;
    const original = base.getMockImplementation()!;
    global.fetch = jest.fn(async (url: string, init: { method?: string; body?: string } = {}) => {
      if (String(url).endsWith('/rpc/delete_device_content')) {
        calls.push({ url: String(url), method: init.method ?? 'GET', body: init.body });
        return { ok: false, status: 404, text: async () => 'Could not find the function' };
      }
      return original(url, init);
    }) as unknown as typeof fetch;
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const res = fakeRes();
    await handler(fakeReq('DELETE', { deviceId: 'd_testdevice01', scope: 'content' }), res as never);
    warn.mockRestore();
    expect(res.statusCode).toBe(204);
    const del = calls.find((c) => c.method === 'DELETE');
    expect(del?.url).toBe('https://db.example/rest/v1/coach_log?device_id=eq.d_testdevice01');
    const name = calls.find((c) => c.method === 'PATCH');
    expect(name?.url).toBe('https://db.example/rest/v1/app_user?device_id=eq.d_testdevice01');
    expect(JSON.parse(name!.body!)).toEqual({ name: null });
    expect(calls.some((c) => c.url.endsWith('/rpc/delete_device'))).toBe(false);
  });

  it('코칭 내용 삭제가 실패하면 502 — 앱이 남겨 두었다가 다시 보낸다', async () => {
    global.fetch = jest.fn(async (url: string, init: { method?: string; body?: string } = {}) => {
      calls.push({ url: String(url), method: init.method ?? 'GET', body: init.body });
      const failed = init.method === 'DELETE' || String(url).includes('/rpc/');
      return { ok: !failed, status: failed ? 500 : 204, text: async () => '' };
    }) as unknown as typeof fetch;
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const res = fakeRes();
    await handler(fakeReq('DELETE', { deviceId: 'd_testdevice01', scope: 'content' }), res as never);
    warn.mockRestore();
    expect(res.statusCode).toBe(502);
  });

  it('void 함수의 본문 없는 204 응답도 성공으로 본다 (예전에는 502)', async () => {
    global.fetch = jest.fn(async (url: string, init: { method?: string; body?: string } = {}) => {
      calls.push({ url: String(url), method: init.method ?? 'GET', body: init.body });
      return {
        ok: true,
        status: 204,
        text: async () => '',
        json: async () => {
          throw new SyntaxError('Unexpected end of JSON input');
        },
      };
    }) as unknown as typeof fetch;
    const res = fakeRes();
    await handler(fakeReq('DELETE', { deviceId: 'd_testdevice01' }), res as never);
    expect(res.statusCode).toBe(204);
  });

  it('기기 시계와 상관없이 그 기기 기록을 모두 지운다 (예전 앱이 보낸 before 는 무시)', async () => {
    const res = fakeRes();
    await handler(fakeReq('DELETE', { deviceId: 'd_testdevice01', before: Date.now() - 10 * 60 * 1000 }), res as never);
    expect(res.statusCode).toBe(204);
    const call = calls.find((c) => c.url.endsWith('/rest/v1/rpc/delete_device'));
    expect(JSON.parse(call!.body!)).toEqual({ p_device: 'd_testdevice01' });
  });

  it('이용 기록이 빈도 제한에 걸린 IP 에서도 삭제 요청은 따로 센다', async () => {
    const ip = { 'x-forwarded-for': '10.8.8.8' };
    for (let i = 0; i < 61; i += 1) {
      await handler({ method: 'POST', body: goodBody({ consentVersion: undefined }), query: {}, headers: ip } as never, fakeRes() as never);
    }
    const post = fakeRes();
    await handler({ method: 'POST', body: goodBody({ consentVersion: undefined }), query: {}, headers: ip } as never, post as never);
    expect(post.statusCode).toBe(429);
    const del = fakeRes();
    await handler({ method: 'DELETE', body: { deviceId: 'd_testdevice01' }, query: {}, headers: ip } as never, del as never);
    expect(del.statusCode).toBe(204);
  });

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
  it('cleanProps 는 짧은 원시값만, 8개까지 남긴다', () => {
    const many = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`k${i}`, i]));
    expect(Object.keys(cleanProps(many) ?? {})).toHaveLength(8);
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
