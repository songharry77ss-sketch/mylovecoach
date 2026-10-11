/**
 * api/version.ts — 앱의 「새 버전이 나왔어요」 안내에 쓰는 버전 정보.
 * iOS 최신 버전은 App Store 공개 조회에서 읽고, 출시 직후(6시간)에는 알리지 않는다.
 */
import handler, { cleanVersion, iosLatestFromLookup, RELEASE_SETTLE_MS, resetVersionCacheForTest } from '../../api/version';

interface FakeRes {
  statusCode: number;
  body?: { latest?: string | null; min?: string | null; error?: string };
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

const get = async (query: Record<string, string>, headers: Record<string, string> = {}, method = 'GET') => {
  const res = fakeRes();
  await handler({ method, query, headers } as never, res as never);
  return res;
};

const NOW = Date.parse('2026-10-11T03:00:00Z');
const lookup = (version: string, releasedAgoMs: number) => ({ resultCount: 1, results: [{ version, currentVersionReleaseDate: new Date(NOW - releasedAgoMs).toISOString() }] });
let lookups = 0;
let lookupBody: unknown = lookup('1.0.3', RELEASE_SETTLE_MS + 60_000);
let lookupFails = false;

const ENV = { ...process.env };
beforeEach(() => {
  jest.useFakeTimers({ now: NOW });
  process.env = { ...ENV };
  for (const k of ['COACH_APP_TOKEN', 'IOS_LATEST_VERSION', 'ANDROID_LATEST_VERSION', 'IOS_MIN_VERSION', 'ANDROID_MIN_VERSION']) delete process.env[k];
  resetVersionCacheForTest();
  lookups = 0;
  lookupBody = lookup('1.0.3', RELEASE_SETTLE_MS + 60_000);
  lookupFails = false;
  global.fetch = jest.fn(async () => {
    lookups += 1;
    if (lookupFails) throw new Error('offline');
    return { ok: true, status: 200, json: async () => lookupBody };
  }) as unknown as typeof fetch;
});
afterEach(() => {
  jest.useRealTimers();
  process.env = ENV;
});

describe('버전 값 고르기', () => {
  it('버전 모양이 아닌 값은 버린다 (환경변수 오타가 안내로 새지 않게)', () => {
    expect(cleanVersion('1.0.3')).toBe('1.0.3');
    expect(cleanVersion(' 2.1 ')).toBe('2.1');
    expect(cleanVersion('v1.0.3')).toBeNull();
    expect(cleanVersion('1.0.3-beta')).toBeNull();
    expect(cleanVersion('')).toBeNull();
    expect(cleanVersion(undefined)).toBeNull();
  });

  it('출시한 지 6시간이 안 된 버전은 알리지 않는다 (스토어에 퍼지는 중)', () => {
    expect(iosLatestFromLookup(lookup('1.0.3', RELEASE_SETTLE_MS - 1000), NOW)).toBeNull();
    expect(iosLatestFromLookup(lookup('1.0.3', RELEASE_SETTLE_MS + 1000), NOW)).toBe('1.0.3');
  });

  it('조회 결과가 비었거나 출시 시각이 없으면 모름', () => {
    expect(iosLatestFromLookup({ resultCount: 0, results: [] }, NOW)).toBeNull();
    expect(iosLatestFromLookup({ results: [{ version: '1.0.3' }] }, NOW)).toBeNull();
    expect(iosLatestFromLookup(null, NOW)).toBeNull();
  });
});

describe('GET /api/version', () => {
  it('GET 이 아니면 405, platform 이 없거나 다르면 400', async () => {
    expect((await get({ platform: 'ios' }, {}, 'POST')).statusCode).toBe(405);
    expect((await get({})).statusCode).toBe(400);
    expect((await get({ platform: 'web' })).statusCode).toBe(400);
  });

  it('앱 토큰이 설정돼 있으면 토큰이 맞아야 한다', async () => {
    process.env.COACH_APP_TOKEN = 'tok';
    expect((await get({ platform: 'ios' })).statusCode).toBe(401);
    expect((await get({ platform: 'ios' }, { 'x-app-token': 'tok' })).statusCode).toBe(200);
  });

  it('iOS 는 App Store 공개 조회의 버전을 알려 주고, 10분 동안은 다시 조회하지 않는다', async () => {
    expect((await get({ platform: 'ios' })).body).toEqual({ latest: '1.0.3', min: null });
    await get({ platform: 'ios' });
    expect(lookups).toBe(1);
    jest.setSystemTime(NOW + 11 * 60_000);
    await get({ platform: 'ios' });
    expect(lookups).toBe(2);
  });

  it('조회가 실패하면 앞서 읽은 값을 쓰고, 읽은 적이 없으면 모름(null)', async () => {
    lookupFails = true;
    expect((await get({ platform: 'ios' })).body).toEqual({ latest: null, min: null });
    lookupFails = false;
    expect((await get({ platform: 'ios' })).body?.latest).toBe('1.0.3');
    jest.setSystemTime(NOW + 11 * 60_000);
    lookupFails = true;
    expect((await get({ platform: 'ios' })).body?.latest).toBe('1.0.3');
  });

  it('IOS_LATEST_VERSION 을 적어 두면 조회하지 않고 그 값을 쓴다', async () => {
    process.env.IOS_LATEST_VERSION = '1.0.2';
    expect((await get({ platform: 'ios' })).body?.latest).toBe('1.0.2');
    expect(lookups).toBe(0);
  });

  it('안드로이드는 환경변수에 적은 값만 알려 준다 (없으면 모름)', async () => {
    expect((await get({ platform: 'android' })).body).toEqual({ latest: null, min: null });
    process.env.ANDROID_LATEST_VERSION = '1.0.3';
    process.env.ANDROID_MIN_VERSION = '1.0.1';
    expect((await get({ platform: 'android' })).body).toEqual({ latest: '1.0.3', min: '1.0.1' });
    expect(lookups).toBe(0);
  });

  it('최소 지원 버전은 플랫폼별 환경변수에서만 온다', async () => {
    process.env.IOS_MIN_VERSION = '1.0.1';
    process.env.ANDROID_MIN_VERSION = 'oops';
    expect((await get({ platform: 'ios' })).body?.min).toBe('1.0.1');
    expect((await get({ platform: 'android' })).body?.min).toBeNull();
  });
});
