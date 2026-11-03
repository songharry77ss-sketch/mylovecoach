/**
 * api/version.ts — 앱의 「새 버전이 나왔어요」 안내에 쓰는 버전 정보.
 * iOS 최신 버전은 App Store 공개 조회, 안드로이드는 Play 앱 페이지에서 읽고, 출시 직후(6시간)에는 알리지 않는다.
 */
import handler, {
  androidLatestFromPage,
  clampMin,
  cleanVersion,
  iosLatestFromLookup,
  RELEASE_SETTLE_MS,
  resetVersionCacheForTest,
  setStoreListingForTest,
} from '../../api/version';

interface FakeRes {
  statusCode: number;
  headers: Record<string, string>;
  body?: { latest?: string | null; min?: string | null; notes?: string[]; error?: string };
  setHeader: (name: string, value: string) => FakeRes;
  status: (code: number) => FakeRes;
  json: (body: FakeRes['body']) => FakeRes;
  end: () => FakeRes;
}

function fakeRes(): FakeRes {
  const res = { statusCode: 200, headers: {} } as FakeRes;
  res.setHeader = (name, value) => {
    res.headers[name] = value;
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

const get = async (query: Record<string, string>, headers: Record<string, string> = {}, method = 'GET') => {
  const res = fakeRes();
  await handler({ method, query, headers } as never, res as never);
  return res;
};

const NOW = Date.parse('2026-10-11T03:00:00Z');
const lookup = (version: string, releasedAgoMs: number) => ({ resultCount: 1, results: [{ version, currentVersionReleaseDate: new Date(NOW - releasedAgoMs).toISOString() }] });
/** 2026-11 Play 앱 페이지에 심긴 데이터 모양 그대로 (버전 칸 141 · 업데이트 날짜 칸 146) */
const playPage = (version: string, updatedAgoMs: number) =>
  `<script>AF_initDataCallback({key: 'ds:5', data:[{"141":[[["${version}"]],[[[36]],[[[24,"7.0"]]]]],"146":[["2026. 10. 30.",[${Math.floor((NOW - updatedAgoMs) / 1000)},134000000]]]}]});</script>`;
let lookups = 0;
let plays = 0;
let lookupBody: unknown = lookup('1.0.3', RELEASE_SETTLE_MS + 60_000);
let lookupFails = false;
let playHtml = playPage('1.0.4', RELEASE_SETTLE_MS + 60_000);
let playFails = false;

const ENV = { ...process.env };
beforeEach(() => {
  jest.useFakeTimers({ now: NOW });
  process.env = { ...ENV };
  for (const k of ['COACH_APP_TOKEN', 'IOS_LATEST_VERSION', 'ANDROID_LATEST_VERSION', 'IOS_MIN_VERSION', 'ANDROID_MIN_VERSION']) delete process.env[k];
  resetVersionCacheForTest();
  lookups = 0;
  plays = 0;
  lookupBody = lookup('1.0.3', RELEASE_SETTLE_MS + 60_000);
  lookupFails = false;
  playHtml = playPage('1.0.4', RELEASE_SETTLE_MS + 60_000);
  playFails = false;
  global.fetch = jest.fn(async (url: string) => {
    if (String(url).startsWith('https://play.google.com/')) {
      plays += 1;
      if (playFails) throw new Error('offline');
      return { ok: true, status: 200, text: async () => playHtml };
    }
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

  it('Play 앱 페이지에서 버전을 읽고, 업데이트한 지 6시간이 안 됐으면 아직 알리지 않는다', () => {
    expect(androidLatestFromPage(playPage('1.0.7', RELEASE_SETTLE_MS + 1000), NOW)).toBe('1.0.7');
    expect(androidLatestFromPage(playPage('1.0.7', RELEASE_SETTLE_MS - 1000), NOW)).toBeNull();
    // 날짜 칸이 없으면 그대로 알린다 (페이지에 보이는 버전은 이미 출시된 것)
    expect(androidLatestFromPage('"141":[[["1.0.8"]],[[[36]]]]', NOW)).toBe('1.0.8');
  });

  it('칸 번호가 바뀌어도 버전만 담긴 모양이 하나뿐이면 읽고, 여럿이거나 없으면 모름(undefined)', () => {
    expect(androidLatestFromPage('"150":[[["1.0.9"]],[[[36]]]]', NOW)).toBe('1.0.9');
    expect(androidLatestFromPage('[[["1.0.9"]]] [[["2.3.1"]]]', NOW)).toBeUndefined();
    expect(androidLatestFromPage('<html>점검 중</html>', NOW)).toBeUndefined();
    expect(androidLatestFromPage('"141":[[["기기에 따라 다름"]]]', NOW)).toBeUndefined();
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
    const first = await get({ platform: 'ios' });
    expect(first.body).toEqual({ latest: '1.0.3', min: null });
    expect(first.headers['x-version-source']).toBe('store');
    await get({ platform: 'ios' });
    expect(lookups).toBe(1);
    jest.setSystemTime(NOW + 11 * 60_000);
    await get({ platform: 'ios' });
    expect(lookups).toBe(2);
  });

  it('조회가 실패하고 읽은 적도 없으면 503 (「최신」으로 답하지 않는다), 1분 동안은 다시 조회하지 않는다', async () => {
    lookupFails = true;
    expect((await get({ platform: 'ios' })).statusCode).toBe(503);
    expect((await get({ platform: 'ios' })).statusCode).toBe(503);
    expect(lookups).toBe(1);
    jest.setSystemTime(NOW + 61_000);
    lookupFails = false;
    expect((await get({ platform: 'ios' })).body).toEqual({ latest: '1.0.3', min: null });
    expect(lookups).toBe(2);
  });

  it('조회가 실패해도 앞서 읽은 값이 있으면 그 값을 쓴다', async () => {
    expect((await get({ platform: 'ios' })).body?.latest).toBe('1.0.3');
    jest.setSystemTime(NOW + 11 * 60_000);
    lookupFails = true;
    const res = await get({ platform: 'ios' });
    expect(res.statusCode).toBe(200);
    expect(res.body?.latest).toBe('1.0.3');
  });

  it('출시 직후라 알릴 버전이 없으면 200 에 latest null (확인 못 함과 구분)', async () => {
    lookupBody = lookup('1.0.3', 60_000);
    const res = await get({ platform: 'ios' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ latest: null, min: null });
    expect(res.headers['x-version-source']).toBe('none');
  });

  it('IOS_LATEST_VERSION 을 적어 두면 조회하지 않고 그 값을 쓴다', async () => {
    process.env.IOS_LATEST_VERSION = '1.0.2';
    const res = await get({ platform: 'ios' });
    expect(res.body?.latest).toBe('1.0.2');
    expect(res.headers['x-version-source']).toBe('env');
    expect(lookups).toBe(0);
  });

  it('안드로이드는 Play 앱 페이지의 버전을 알려 준다 — 출시 때마다 환경변수를 바꾸지 않아도 된다', async () => {
    process.env.ANDROID_LATEST_VERSION = '1.0.3';
    process.env.ANDROID_MIN_VERSION = '1.0.1';
    const res = await get({ platform: 'android' });
    expect(res.body).toEqual({ latest: '1.0.4', min: '1.0.1' });
    expect(res.headers['x-version-source']).toBe('store');
    await get({ platform: 'android' });
    expect(plays).toBe(1);
    expect(lookups).toBe(0);
  });

  it('안드로이드: 막 올라온 버전이면 기다리는 동안 환경변수(마지막으로 알던 버전)를 쓴다', async () => {
    playHtml = playPage('1.0.5', 60_000);
    expect((await get({ platform: 'android' })).body).toEqual({ latest: null, min: null });
    resetVersionCacheForTest();
    process.env.ANDROID_LATEST_VERSION = '1.0.4';
    const res = await get({ platform: 'android' });
    expect(res.body).toEqual({ latest: '1.0.4', min: null });
    expect(res.headers['x-version-source']).toBe('env');
  });

  it('안드로이드: 페이지를 못 읽거나 모양이 바뀌면 환경변수로 버티고, 그것도 없으면 503', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    playHtml = '<html>점검 중</html>';
    expect((await get({ platform: 'android' })).statusCode).toBe(503);
    expect(warn).toHaveBeenCalled();
    process.env.ANDROID_LATEST_VERSION = '1.0.4';
    expect((await get({ platform: 'android' })).body).toEqual({ latest: '1.0.4', min: null });
    // 실패하면 1분 동안은 다시 읽지 않는다
    expect(plays).toBe(1);
    jest.setSystemTime(NOW + 61_000);
    playFails = true;
    expect((await get({ platform: 'android' })).body?.latest).toBe('1.0.4');
    expect(plays).toBe(2);
    warn.mockRestore();
  });

  it('최신 버전의 「새로운 기능」 문구를 세 줄까지 함께 알려 준다 (문서에 그 버전이 없으면 빠진다)', async () => {
    setStoreListingForTest(
      [
        '## 이번 버전의 새로운 기능 (1.0.4)',
        '',
        '- 답장이 더 빨라졌어요.',
        '- 캡처가 또렷해졌어요.',
        '- 결제 화면을 다듬었어요.',
        '- 넷째 줄은 빠져요.',
        '',
        '## 이번 버전의 새로운 기능 (1.0.3)',
        '',
        '- 예전 소식',
      ].join('\n'),
    );
    expect((await get({ platform: 'android' })).body).toEqual({
      latest: '1.0.4',
      min: null,
      notes: ['답장이 더 빨라졌어요.', '캡처가 또렷해졌어요.', '결제 화면을 다듬었어요.'],
    });
    lookupBody = lookup('1.0.2', RELEASE_SETTLE_MS + 60_000);
    expect((await get({ platform: 'ios' })).body).toEqual({ latest: '1.0.2', min: null });
  });

  it('스토어 문구 문서(docs/STORE_LISTING.md)를 실제로 읽어 새 소식을 붙인다', async () => {
    setStoreListingForTest(undefined);
    playHtml = playPage('1.0.7', RELEASE_SETTLE_MS + 60_000);
    const notes = (await get({ platform: 'android' })).body?.notes ?? [];
    expect(notes.length).toBeGreaterThan(0);
    expect(notes.length).toBeLessThanOrEqual(3);
    expect(notes[0]).toContain('사용법');
  });

  it('최소 지원 버전은 플랫폼별 환경변수에서만 온다', async () => {
    process.env.IOS_MIN_VERSION = '1.0.1';
    process.env.ANDROID_MIN_VERSION = 'oops';
    process.env.ANDROID_LATEST_VERSION = '1.0.3';
    expect((await get({ platform: 'ios' })).body?.min).toBe('1.0.1');
    expect((await get({ platform: 'android' })).body?.min).toBeNull();
  });

  it('받을 수 없는 버전으로 막지 않는다 — 최소 버전이 최신보다 높으면 최신으로 낮추고, 최신을 모르면 쓰지 않는다', async () => {
    expect(clampMin('1.1.0', '1.0.3')).toBe('1.0.3');
    expect(clampMin('1.0.2', '1.0.3')).toBe('1.0.2');
    expect(clampMin('1.0.2', null)).toBeNull();
    expect(clampMin(null, '1.0.3')).toBeNull();
    // 안드로이드: 최신 버전을 모르면(막 올라온 버전을 기다리는 중·환경변수 없음) 최소 버전만으로는 아무도 막지 않는다
    playHtml = playPage('1.0.5', 60_000);
    process.env.ANDROID_MIN_VERSION = '1.0.3';
    expect((await get({ platform: 'android' })).body).toEqual({ latest: null, min: null });
    // iOS: 오타로 너무 높게 적어도 스토어의 최신 버전까지만 요구한다
    process.env.IOS_MIN_VERSION = '2.0.0';
    expect((await get({ platform: 'ios' })).body).toEqual({ latest: '1.0.3', min: '1.0.3' });
  });
});
