/**
 * lib/app-update.ts — 새 버전 안내: 버전 비교, 안내할지 정하기, 서버 확인 간격.
 */
import { Platform } from 'react-native';

import { compareVersions, fetchAppUpdate, resetUpdateCheckForTest, updateFor } from '@/lib/app-update';

jest.mock('@/lib/config', () => ({
  APP_CONFIG: { apiUrl: 'https://api.example', apiSameOrigin: false, apiToken: 'tok', supportEmail: '', privacyUrl: '', termsUrl: '' },
}));
jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { version: '1.0.2' } } }));

const calls: { url: string; headers?: Record<string, string> }[] = [];
let body: unknown = { latest: '1.0.3', min: null };
let status = 200;
let offline = false;

beforeEach(() => {
  Platform.OS = 'ios';
  resetUpdateCheckForTest();
  calls.length = 0;
  body = { latest: '1.0.3', min: null };
  status = 200;
  offline = false;
  global.fetch = jest.fn(async (url: string, init: { headers?: Record<string, string> } = {}) => {
    calls.push({ url: String(url), headers: init.headers });
    if (offline) throw new Error('offline');
    return { ok: status >= 200 && status < 300, status, json: async () => body };
  }) as unknown as typeof fetch;
});

describe('버전 비교', () => {
  it('점으로 나눈 숫자끼리 비교한다', () => {
    expect(compareVersions('1.0.10', '1.0.9')).toBeGreaterThan(0);
    expect(compareVersions('1.0.2', '1.0.3')).toBeLessThan(0);
    expect(compareVersions('1.0', '1.0.0')).toBe(0);
    expect(compareVersions('2.0', '1.9.9')).toBeGreaterThan(0);
  });
});

describe('안내할지 정하기', () => {
  it('스토어 버전이 더 새로우면 권한다 (닫을 수 있음)', () => {
    expect(updateFor('1.0.2', { latest: '1.0.3', min: null })).toEqual({ latest: '1.0.3', required: false });
  });

  it('같거나 내 버전이 더 새로우면(심사 중인 빌드 등) 안내하지 않는다', () => {
    expect(updateFor('1.0.3', { latest: '1.0.3', min: null })).toBeNull();
    expect(updateFor('1.0.4', { latest: '1.0.3', min: '1.0.1' })).toBeNull();
  });

  it('최소 지원 버전보다 낮으면 꼭 업데이트해야 한다', () => {
    expect(updateFor('1.0.0', { latest: '1.0.3', min: '1.0.1' })).toEqual({ latest: '1.0.3', required: true });
    // 최신 버전을 모르고 최소 버전만 아는 경우에도 받을 버전을 보여 준다
    expect(updateFor('1.0.0', { latest: null, min: '1.0.1' })).toEqual({ latest: '1.0.1', required: true });
  });

  it('서버가 모른다고 하거나 값이 이상하면 안내하지 않는다', () => {
    expect(updateFor('1.0.2', { latest: null, min: null })).toBeNull();
    expect(updateFor('1.0.2', { latest: 'v2', min: 3 })).toBeNull();
    expect(updateFor('1.0.2', null)).toBeNull();
    expect(updateFor('', { latest: '1.0.3' })).toBeNull();
  });
});

describe('서버에 묻기', () => {
  it('플랫폼과 앱 토큰을 붙여 묻고, 6시간 안에는 다시 묻지 않는다', async () => {
    const now = 1_950_000_000_000;
    expect(await fetchAppUpdate(now)).toEqual({ latest: '1.0.3', required: false });
    expect(calls[0]).toEqual({ url: 'https://api.example/api/version?platform=ios', headers: { 'x-app-token': 'tok' } });
    expect(await fetchAppUpdate(now + 60_000)).toBeUndefined();
    expect(calls).toHaveLength(1);
    expect(await fetchAppUpdate(now + 6 * 60 * 60 * 1000 + 1)).toEqual({ latest: '1.0.3', required: false });
    expect(calls).toHaveLength(2);
  });

  it('서버가 업데이트를 요구해 다시 물을 때는(force) 간격을 건너뛴다', async () => {
    const now = 1_950_000_000_000;
    await fetchAppUpdate(now);
    expect(await fetchAppUpdate(now + 1000, true)).toEqual({ latest: '1.0.3', required: false });
    expect(calls).toHaveLength(2);
  });

  it('최신이면 null, 확인하지 못하면(오프라인·서버 오류) undefined 이고 곧 다시 묻는다', async () => {
    const now = 1_950_000_000_000;
    body = { latest: '1.0.2', min: null };
    expect(await fetchAppUpdate(now)).toBeNull();
    resetUpdateCheckForTest();
    offline = true;
    expect(await fetchAppUpdate(now)).toBeUndefined();
    offline = false;
    status = 503;
    expect(await fetchAppUpdate(now + 1000)).toBeUndefined();
    status = 200;
    body = { latest: '1.0.3', min: null };
    expect(await fetchAppUpdate(now + 2000)).toEqual({ latest: '1.0.3', required: false });
  });

  it('서버가 확인하지 못했다고(503) 하면 알고 있던 안내를 그대로 두도록 undefined', async () => {
    status = 503;
    expect(await fetchAppUpdate(1_950_000_000_000)).toBeUndefined();
  });

  it('웹은 늘 최신이라 묻지 않는다', async () => {
    Platform.OS = 'web';
    expect(await fetchAppUpdate(1_950_000_000_000)).toBeUndefined();
    expect(calls).toHaveLength(0);
  });
});
