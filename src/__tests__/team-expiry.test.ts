/**
 * 기한 있는 무제한 — 관리자가 기간을 고르면 끝나는 시각을 저장하고(api/admin), 끝난 기기는 팀원이 아니라고 답한다(api/team).
 * 지금 나와 있는 앱은 팀원 기기를 주기적으로 다시 확인하므로, 서버가 「아님」이라 답하면 무제한이 꺼진다.
 */
import adminHandler, { teamExpiry } from '../../api/admin';
import teamHandler from '../../api/team';

interface FakeRes {
  statusCode: number;
  body?: Record<string, unknown>;
  setHeader: () => FakeRes;
  status: (code: number) => FakeRes;
  json: (body: Record<string, unknown>) => FakeRes;
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
const DAY = 24 * 60 * 60 * 1000;
const calls: { url: string; method: string; body: unknown }[] = [];
let teamRows: { label: string | null; expires_at: string | null }[] = [];

beforeEach(() => {
  calls.length = 0;
  teamRows = [];
  process.env.SUPABASE_URL = 'https://db.example';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
  process.env.ADMIN_TOKEN = '0729';
  process.env.ADMIN_DEVICE_SECRET = DEVICE;
  delete process.env.COACH_APP_TOKEN;
  global.fetch = jest.fn(async (url: string, init: { method?: string; body?: string } = {}) => {
    const method = init.method ?? 'GET';
    calls.push({ url: String(url), method, body: init.body ? JSON.parse(init.body) : null });
    const json = String(url).includes('/rest/v1/team_member') && method === 'GET' ? teamRows : [];
    return { ok: true, status: 200, text: async () => JSON.stringify(json), json: async () => json };
  }) as unknown as typeof fetch;
});

describe('teamExpiry — 관리자가 고른 기간', () => {
  const now = Date.UTC(2026, 10, 5, 3, 0, 0);
  it('30일이면 30일 뒤에 끝난다', () => {
    expect(teamExpiry(30, now)).toBe(new Date(now + 30 * DAY).toISOString());
  });
  it('없거나 0·음수·숫자가 아니면 무기한(null)', () => {
    for (const v of [undefined, null, 0, -3, 'abc', '']) expect(teamExpiry(v, now)).toBeNull();
  });
  it('너무 길면 1년(366일)까지만', () => {
    expect(teamExpiry(10_000, now)).toBe(new Date(now + 366 * DAY).toISOString());
  });
});

describe('POST /api/admin team_add', () => {
  const post = async (body: Record<string, unknown>) => {
    const res = fakeRes();
    await adminHandler({ method: 'POST', body, query: {}, headers: { 'x-forwarded-for': '10.9.9.9', 'x-admin-device': DEVICE, authorization: 'Bearer 0729' } } as never, res as never);
    return res;
  };
  const saved = () => {
    const body = calls.find((c) => c.url.includes('/rest/v1/team_member') && c.method === 'POST')?.body;
    return (Array.isArray(body) ? body[0] : body) as Record<string, unknown>;
  };

  it('기간을 주면 끝나는 시각을 함께 저장한다', async () => {
    const before = Date.now();
    const res = await post({ action: 'team_add', deviceId: 'd_abcdef123456', label: '오지은', days: 30 });
    expect(res.statusCode).toBe(200);
    const row = saved();
    expect(row).toMatchObject({ device_id: 'd_abcdef123456', label: '오지은' });
    const until = new Date(String(row.expires_at)).getTime();
    expect(until).toBeGreaterThanOrEqual(before + 30 * DAY);
    expect(until).toBeLessThanOrEqual(Date.now() + 30 * DAY);
  });

  it('기간이 없으면 예전처럼 무기한(expires_at null)', async () => {
    await post({ action: 'team_add', deviceId: 'd_abcdef123456', label: '디자인' });
    expect(saved()).toMatchObject({ device_id: 'd_abcdef123456', expires_at: null });
  });
});

describe('GET /api/team', () => {
  const get = async () => {
    const res = fakeRes();
    await teamHandler({ method: 'GET', query: {}, headers: { 'x-device-id': 'd_abcdef123456' } } as never, res as never);
    return res;
  };

  it('끝나지 않은 기기만 찾도록 묻는다 (끝나는 시각이 없거나 지금보다 뒤)', async () => {
    await get();
    const url = decodeURIComponent(calls[0].url);
    expect(url).toContain('device_id=eq.d_abcdef123456');
    expect(url).toMatch(/or=\(expires_at\.is\.null,expires_at\.gt\.\d{4}-\d{2}-\d{2}T/);
  });

  it('기한이 있으면 끝나는 시각(until)을 함께 알려 준다', async () => {
    teamRows = [{ label: '오지은', expires_at: '2026-12-05T03:00:00.000Z' }];
    const res = await get();
    expect(res.body).toEqual({ ready: true, team: true, label: '오지은', until: '2026-12-05T03:00:00.000Z' });
  });

  it('무기한이면 예전과 같은 응답', async () => {
    teamRows = [{ label: null, expires_at: null }];
    expect((await get()).body).toEqual({ ready: true, team: true, label: '팀원' });
  });

  it('끝났거나 없는 기기는 팀원이 아니다 → 앱이 다음 확인 때 무제한을 끈다', async () => {
    teamRows = [];
    expect((await get()).body).toEqual({ ready: true, team: false });
  });
});
