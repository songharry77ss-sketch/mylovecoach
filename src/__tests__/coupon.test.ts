/**
 * 쿠폰 코드 (2026-11-19 「FINISH 입력하면 3일 무제한」)
 * - 서버(api/team POST, api/_coupon): 코드가 맞는지·며칠인지. 철자 맞히기를 막으려고 IP 마다 10분 10번
 * - 앱(lib/billing/coupon, quota grantCoupon): 이 기기의 하루 이용권 칸에 N일을 더하고, 같은 코드는 한 번만
 */
import { checkCoupon, normalizeCoupon } from '../../api/_coupon';
import teamHandler from '../../api/team';
import { redeemCoupon } from '@/lib/billing/coupon';
import { DAY_PASS_MS } from '@/lib/billing/plans';
import { couponUsed, EMPTY_USAGE, EMPTY_WALLET, grantCoupon, quotaLabel, quotaStatus } from '@/lib/billing/quota';
import { useAppStore } from '@/store/app-store';

jest.mock('@/lib/config', () => ({
  APP_CONFIG: { apiUrl: 'https://coach.test', apiSameOrigin: false, apiToken: 'app-token', supportEmail: '', privacyUrl: '', termsUrl: '' },
}));
jest.mock('@/lib/analytics', () => ({ track: jest.fn() }));
jest.mock('@react-native-async-storage/async-storage', () => {
  const mem = new Map<string, string>();
  return {
    __esModule: true,
    default: {
      getItem: async (k: string) => mem.get(k) ?? null,
      setItem: async (k: string, v: string) => void mem.set(k, v),
      removeItem: async (k: string) => void mem.delete(k),
    },
  };
});

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 10, 19, 6, 0, 0);

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

let ipSeq = 0;
async function post(body: unknown, headers: Record<string, string> = {}) {
  const res = fakeRes();
  await teamHandler({ method: 'POST', headers: { 'x-forwarded-for': `10.0.0.${(ipSeq += 1)}`, ...headers }, query: {}, body } as never, res as never);
  return res;
}

describe('서버 — 쿠폰 코드 확인', () => {
  it('FINISH 는 3일', () => {
    expect(checkCoupon('FINISH', NOW)).toEqual({ ok: true, code: 'FINISH', days: 3 });
  });

  it('소문자·앞뒤 빈칸·띄어쓰기·하이픈·전각 글자도 같은 코드로 본다', () => {
    for (const typed of [' finish ', 'Finish', 'FIN-ISH', 'fin ish', 'ＦＩＮＩＳＨ']) expect(checkCoupon(typed, NOW)).toMatchObject({ ok: true, code: 'FINISH' });
    expect(normalizeCoupon(42)).toBe('');
  });

  it('없는 코드·빈칸·끝난 코드는 막는다', () => {
    expect(checkCoupon('FINISHED', NOW)).toEqual({ ok: false, reason: 'unknown' });
    expect(checkCoupon('constructor', NOW)).toEqual({ ok: false, reason: 'unknown' });
    expect(checkCoupon('  ', NOW)).toEqual({ ok: false, reason: 'empty' });
    const rules = { OLD: { days: 3, until: '2026-11-01T00:00:00Z' }, ZERO: { days: 0 } };
    expect(checkCoupon('old', NOW, rules)).toEqual({ ok: false, reason: 'expired' });
    expect(checkCoupon('zero', NOW, rules)).toEqual({ ok: false, reason: 'unknown' });
  });

  it('POST /api/team { coupon } — 맞으면 200, 없는 코드면 404 와 안내 문구', async () => {
    delete process.env.COACH_APP_TOKEN;
    const ok = await post({ coupon: 'finish' });
    expect(ok.statusCode).toBe(200);
    expect(ok.body).toEqual({ ok: true, code: 'FINISH', days: 3 });
    const bad = await post(JSON.stringify({ coupon: 'nope' }));
    expect(bad.statusCode).toBe(404);
    expect(bad.body?.error).toContain('없는 쿠폰');
  });

  it('앱 토큰이 다르면 401', async () => {
    process.env.COACH_APP_TOKEN = 'server-token';
    try {
      expect((await post({ coupon: 'FINISH' }, { 'x-app-token': 'wrong' })).statusCode).toBe(401);
      expect((await post({ coupon: 'FINISH' }, { 'x-app-token': 'server-token' })).statusCode).toBe(200);
    } finally {
      delete process.env.COACH_APP_TOKEN;
    }
  });

  it('한 곳에서 10분에 10번을 넘게 입력하면 429', async () => {
    const res = fakeRes();
    const send = () => teamHandler({ method: 'POST', headers: { 'x-forwarded-for': '10.9.9.9' }, query: {}, body: { coupon: 'guess' } } as never, res as never);
    for (let i = 0; i < 10; i += 1) await send();
    expect(res.statusCode).toBe(404);
    await send();
    expect(res.statusCode).toBe(429);
  });
});

describe('앱 — 지급 (이 기기의 하루 이용권 칸)', () => {
  it('3일을 더하고, 같은 코드는 이 기기에서 한 번만', () => {
    const once = grantCoupon(EMPTY_WALLET, 'FINISH', 3, NOW)!;
    expect(once.passUntil).toBe(NOW + 3 * DAY);
    expect(couponUsed(once, 'FINISH')).toBe(true);
    expect(grantCoupon(once, 'FINISH', 3, NOW + DAY)).toBeNull();
  });

  it('하루 이용권을 쓰는 중이면 남은 시간 뒤로 이어 붙인다', () => {
    const pass = { ...EMPTY_WALLET, passUntil: NOW + 5 * 60 * 60 * 1000 };
    expect(grantCoupon(pass, 'FINISH', 3, NOW)!.passUntil).toBe(NOW + 5 * 60 * 60 * 1000 + 3 * DAY);
  });

  it('24시간보다 길게 남으면 「무제한 이용권 · 날짜까지」, 하루 이용권 하나면 예전 그대로', () => {
    const wallet = grantCoupon(EMPTY_WALLET, 'FINISH', 3, NOW)!;
    const status = quotaStatus(null, EMPTY_USAGE, NOW, wallet);
    expect(status).toMatchObject({ kind: 'pass', remaining: Infinity, until: NOW + 3 * DAY, long: true });
    const end = new Date(NOW + 3 * DAY);
    expect(quotaLabel(status)).toContain(`무제한 이용권 · ${end.getMonth() + 1}월 ${end.getDate()}일`);
    // 3일이 지나면 끝
    expect(quotaStatus(null, EMPTY_USAGE, NOW + 3 * DAY + 1, wallet).kind).not.toBe('pass');
    // 하루 이용권 하나(24시간)는 「long」 없이 예전 문구
    const day = quotaStatus(null, EMPTY_USAGE, NOW, { ...EMPTY_WALLET, passUntil: NOW + DAY_PASS_MS });
    expect(day).toEqual({ kind: 'pass', remaining: Infinity, until: NOW + DAY_PASS_MS });
    expect(quotaLabel(day)).toContain('하루 이용권');
  });
});

describe('앱 — 쿠폰 쓰기 (서버 확인 → 지급)', () => {
  const fetchMock = jest.fn();
  beforeEach(() => {
    useAppStore.setState({ wallet: EMPTY_WALLET });
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it('서버가 맞다고 하면 바로 3일 무제한, 두 번째는 서버에 묻지 않고 「이미 쓴 쿠폰」', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true, code: 'FINISH', days: 3 }) });
    const before = Date.now();
    const first = await redeemCoupon(' finish ');
    expect(first).toMatchObject({ ok: true, code: 'FINISH', days: 3 });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://coach.test/api/team');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ coupon: 'FINISH' });
    expect(init.headers['x-app-token']).toBe('app-token');
    expect(useAppStore.getState().wallet.passUntil).toBeGreaterThanOrEqual(before + 3 * DAY);

    const again = await redeemCoupon('FINISH');
    expect(again).toEqual({ ok: false, message: '이 기기에서 이미 쓴 쿠폰이에요.' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('서버가 거절하면 그 문구를 그대로, 연결이 안 되면 다시 시도 안내 — 지갑은 그대로', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 404, json: async () => ({ ok: false, error: '없는 쿠폰 코드예요. 철자를 확인해주세요.' }) });
    expect(await redeemCoupon('nope')).toEqual({ ok: false, message: '없는 쿠폰 코드예요. 철자를 확인해주세요.' });
    fetchMock.mockRejectedValueOnce(new Error('offline'));
    expect(await redeemCoupon('FINISH')).toMatchObject({ ok: false, message: expect.stringContaining('인터넷') });
    expect(await redeemCoupon('')).toEqual({ ok: false, message: '쿠폰 코드를 입력해주세요.' });
    expect(useAppStore.getState().wallet).toEqual(EMPTY_WALLET);
  });
});
