/**
 * 홍보 추적 링크 (/go/코드 · /api/go-stats) — api/_go.ts
 */
import vercelConfig from '../../vercel.json';

const mockRpc = jest.fn(async () => true);
const mockQuery = jest.fn(async (table: string, _q?: string): Promise<unknown[] | null> => {
  if (table === 'usage_quota')
    return [
      { day: '2026-11-17', kind: 'go:everytime-ku:a', units: 3 },
      { day: '2026-11-17', kind: 'go:everytime-ku:i', units: 2 },
      { day: '2026-11-17', kind: 'kkti:start', units: 9 },
      { day: '2026-11-16', kind: 'go:Bad Code:a', units: 1 },
    ];
  return [
    { source: 'go-everytime-ku', platform: 'web', first_seen_at: '2026-11-17T01:00:00Z' },
    { source: 'go-everytime-ku', platform: 'web', first_seen_at: '2026-11-17T02:00:00Z' },
    { source: 'go-disquiet', platform: 'android', first_seen_at: '2026-11-16T16:00:00Z' },
    { source: 'go-!!', platform: 'web', first_seen_at: '2026-11-16T16:00:00Z' },
  ];
});
jest.mock('../../api/_supabase', () => ({
  supabaseReady: () => true,
  rpc: (...args: unknown[]) => (mockRpc as (...a: unknown[]) => unknown)(...args),
  query: (...args: unknown[]) => (mockQuery as (...a: unknown[]) => unknown)(...args),
}));

// eslint-disable-next-line import/first
import { goDestination, goDevice, goHandler, parseGoRows } from '../../api/_go';
// eslint-disable-next-line import/first
import cardHandler from '../../api/kkti-card';

interface FakeRes {
  statusCode: number;
  headers: Record<string, string>;
  body?: unknown;
  setHeader: (name: string, value: string) => FakeRes;
  status: (code: number) => FakeRes;
  json: (body: unknown) => FakeRes;
  end: () => FakeRes;
}

function fakeRes(): FakeRes {
  const res = { statusCode: 200, headers: {} } as FakeRes;
  res.setHeader = (name, value) => {
    res.headers[name.toLowerCase()] = value;
    return res;
  };
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

const ANDROID = 'Mozilla/5.0 (Linux; Android 14; SM-S918N) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36';
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 KAKAOTALK 10.8.0';
const DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36';
const DAUM_APP = 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/119 Mobile Safari/537.36 DaumApps/8.6.0';

const go = async (code: string, ua: string, method = 'GET') => {
  const res = fakeRes();
  await cardHandler({ method, query: { route: 'go', c: code }, headers: { 'user-agent': ua, 'x-forwarded-for': `10.0.0.${Math.floor(Math.random() * 200)}` } } as never, res as never);
  return res;
};

beforeEach(() => {
  mockRpc.mockClear();
  mockQuery.mockClear();
});

describe('홍보 추적 링크 /go/코드', () => {
  it('기기를 가른다', () => {
    expect(goDevice(ANDROID)).toBe('a');
    expect(goDevice(IPHONE)).toBe('i');
    expect(goDevice(DESKTOP)).toBe('w');
  });

  it('안드로이드는 Play 스토어로, referrer 에 go- 를 붙인 utm 을 싣는다', () => {
    const url = goDestination('everytime-ku', 'a');
    expect(url.startsWith('https://play.google.com/store/apps/details?id=app.mylovecoach.android&referrer=')).toBe(true);
    expect(decodeURIComponent(url.split('referrer=')[1])).toBe('utm_source=go-everytime-ku&utm_medium=community&utm_campaign=promo');
  });

  it('아이폰은 App Store 캠페인 링크로 — pt 는 숫자일 때만 붙인다', () => {
    expect(goDestination('disquiet', 'i', '')).toBe('https://apps.apple.com/kr/app/id6813404855?ct=disquiet&mt=8');
    expect(goDestination('disquiet', 'i', '123456')).toBe('https://apps.apple.com/kr/app/id6813404855?ct=disquiet&pt=123456&mt=8');
    expect(goDestination('disquiet', 'i', 'abc')).not.toContain('pt=');
  });

  it('컴퓨터는 웹 앱으로 보낸다 (웹 앱이 utm_source 를 처음 연 곳으로 저장)', () => {
    expect(goDestination('geeknews', 'w')).toBe('/?utm_source=go-geeknews&utm_medium=community&utm_campaign=promo');
  });

  it('누르면 기기별로 한 번 세고 도착 주소로 보낸다', async () => {
    const res = await go('everytime-ku', ANDROID);
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toContain('play.google.com');
    expect(res.headers['cache-control']).toBe('no-store');
    expect(mockRpc).toHaveBeenCalledWith('take_quota', { p_kind: 'go:everytime-ku:a', p_units: 1, p_limit: 50_000 });
  });

  it('대문자 코드는 소문자로 센다', async () => {
    await go('Everytime-KU', IPHONE);
    expect(mockRpc).toHaveBeenCalledWith('take_quota', expect.objectContaining({ p_kind: 'go:everytime-ku:i' }));
  });

  it('다음 앱 브라우저는 사람이라 센다 (다음 검색 로봇만 뺀다)', async () => {
    await go('everytime-ku', DAUM_APP);
    expect(mockRpc).toHaveBeenCalledTimes(1);
  });

  it('링크 미리보기 수집기와 HEAD 요청은 세지 않는다', async () => {
    const bot = await go('everytime-ku', 'facebookexternalhit/1.1');
    expect(bot.statusCode).toBe(302);
    expect(bot.headers.location).toBe('/?utm_source=go-everytime-ku&utm_medium=community&utm_campaign=promo');
    await go('everytime-ku', 'kakaotalk-scrap/1.0');
    await go('everytime-ku', ANDROID, 'HEAD');
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('형식이 틀린 코드는 세지 않고 첫 화면으로', async () => {
    for (const code of ['', 'a', '-x', 'a b', 'x'.repeat(41), '../admin']) {
      const res = await go(code, ANDROID);
      expect(res.statusCode).toBe(302);
      expect(res.headers.location).toBe('/');
    }
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('POST 는 받지 않는다', async () => {
    const res = fakeRes();
    await goHandler({ method: 'POST', query: { c: 'abc' }, headers: {} } as never, res as never);
    expect(res.statusCode).toBe(405);
  });

  it('vercel.json 이 /go/코드와 /api/go-stats 를 카드 함수로 넘긴다 (모든 주소를 웹 앱으로 보내는 마지막 규칙보다 앞에서)', () => {
    const rewrites = vercelConfig.rewrites as { source: string; destination: string }[];
    const goIdx = rewrites.findIndex((r) => r.source === '/go/:code');
    const statsIdx = rewrites.findIndex((r) => r.source === '/api/go-stats');
    const catchAll = rewrites.findIndex((r) => r.source === '/((?!api/).*)');
    expect(rewrites[goIdx].destination).toBe('/api/kkti-card?route=go&c=:code');
    expect(rewrites[statsIdx].destination).toBe('/api/kkti-card?route=go-stats');
    expect(goIdx).toBeLessThan(catchAll);
  });
});

describe('홍보 링크 통계 /api/go-stats', () => {
  it('kind 를 코드·기기로 풀고 다른 집계·잘못된 모양은 버린다', () => {
    expect(
      parseGoRows([
        { day: '2026-11-17', kind: 'go:everytime-ku:a', units: 3 },
        { day: '2026-11-17', kind: 'kkti:start', units: 9 },
        { day: '2026-11-17', kind: 'go:x:z', units: 1 },
      ]),
    ).toEqual([{ day: '2026-11-17', code: 'everytime-ku', device: 'a', count: 3 }]);
  });

  it('클릭과 앱을 연 사람 수를 숫자로만 묶어 준다 (한국 날짜 기준)', async () => {
    const res = fakeRes();
    await cardHandler({ method: 'GET', query: { route: 'go-stats' }, headers: { 'x-forwarded-for': '10.1.1.1' } } as never, res as never);
    expect(res.statusCode).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe('*');
    const body = res.body as { clicks: unknown[]; opens: { day: string; code: string; platform: string; count: number }[]; ready: boolean };
    expect(body.ready).toBe(true);
    expect(body.clicks).toEqual([
      { day: '2026-11-17', code: 'everytime-ku', device: 'a', count: 3 },
      { day: '2026-11-17', code: 'everytime-ku', device: 'i', count: 2 },
    ]);
    expect(body.opens).toEqual(
      expect.arrayContaining([
        { day: '2026-11-17', code: 'everytime-ku', platform: 'web', count: 2 },
        { day: '2026-11-17', code: 'disquiet', platform: 'android', count: 1 },
      ]),
    );
    expect(body.opens).toHaveLength(2);
    const appUserQuery = String(mockQuery.mock.calls.find((c) => c[0] === 'app_user')?.[1]);
    expect(appUserQuery).toContain('select=source,platform,first_seen_at');
    expect(appUserQuery).not.toContain('device_id');
  });
});
