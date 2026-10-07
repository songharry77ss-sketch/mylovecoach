// TestFlight 전용 무제한 빌드 — 무제한은 테스트 경로 설치가 확인됐을 때만 (iOS: StoreKit 환경이 Sandbox·Xcode)
import { isTestEnvironment } from '@/lib/billing/test-install';

describe('TestFlight 설치 확인', () => {
  it('Sandbox(TestFlight)·Xcode 만 테스트 설치로 본다', () => {
    expect(isTestEnvironment('Sandbox')).toBe(true);
    expect(isTestEnvironment('sandbox')).toBe(true);
    expect(isTestEnvironment('Xcode')).toBe(true);
  });

  it('App Store 설치(Production)·빈 값·이상한 값은 유료 동작', () => {
    expect(isTestEnvironment('Production')).toBe(false);
    expect(isTestEnvironment('')).toBe(false);
    expect(isTestEnvironment(null)).toBe(false);
    expect(isTestEnvironment(undefined)).toBe(false);
    expect(isTestEnvironment({})).toBe(false);
  });
});

describe('횟수 제한 — 무제한 빌드라도 확인 전에는 유료 동작', () => {
  const load = (freeUnlimited: boolean) => {
    jest.resetModules();
    process.env.EXPO_PUBLIC_FREE_UNLIMITED = freeUnlimited ? '1' : '';
    process.env.EXPO_PUBLIC_API_URL = 'https://example.test';
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('@/lib/billing/gate') as typeof import('@/lib/billing/gate');
  };
  afterEach(() => {
    delete process.env.EXPO_PUBLIC_FREE_UNLIMITED;
    delete process.env.EXPO_PUBLIC_API_URL;
  });

  it('무제한 빌드 + 테스트 설치 확인 → 제한 없음', () => {
    expect(load(true).isQuotaEnforced(true)).toBe(false);
  });

  it('무제한 빌드라도 확인 전·실패(App Store 설치) → 제한 그대로', () => {
    expect(load(true).isQuotaEnforced(false)).toBe(true);
  });

  it('일반 빌드는 확인 값과 상관없이 제한 그대로', () => {
    const gate = load(false);
    expect(gate.isQuotaEnforced(true)).toBe(true);
    expect(gate.isQuotaEnforced(false)).toBe(true);
  });
});

describe('TestFlight 설치 확인 → 무제한 반영 (iOS)', () => {
  const run = async (environment: string | Error) => {
    jest.resetModules();
    process.env.EXPO_PUBLIC_FREE_UNLIMITED = '1';
    jest.doMock('expo-iap', () => ({
      getAppTransactionIOS: async () => {
        if (environment instanceof Error) throw environment;
        return { environment };
      },
    }));
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('@/lib/billing/test-install') as typeof import('@/lib/billing/test-install');
    expect(mod.useTestInstall.getState().unlimited).toBe(false); // iOS 는 확인 전에는 유료 동작
    await mod.refreshTestInstall();
    return mod.useTestInstall.getState().unlimited;
  };
  afterEach(() => {
    delete process.env.EXPO_PUBLIC_FREE_UNLIMITED;
    jest.dontMock('expo-iap');
  });

  it('TestFlight(Sandbox) 설치면 무제한', async () => {
    expect(await run('Sandbox')).toBe(true);
  });
  it('App Store(Production) 설치면 유료 동작 그대로', async () => {
    expect(await run('Production')).toBe(false);
  });
  it('확인에 실패하면(오프라인·iOS 16 미만 등) 유료 동작', async () => {
    expect(await run(new Error('offline'))).toBe(false);
  });
});
