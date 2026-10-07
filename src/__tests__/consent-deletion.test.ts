/**
 * 동의 철회·「모든 데이터 삭제」의 서버 기록 삭제 요청(store.pendingDeletion + lib/server-deletion)과
 * 팀원 확인 14일 만료(lib/billing/team).
 */
import { refreshTeam } from '@/lib/billing/team';
import { processPendingDeletion, resetDeletionStateForTest, SETTLE_MS } from '@/lib/server-deletion';
import { useAppStore } from '@/store/app-store';

jest.mock('@/lib/config', () => ({
  APP_CONFIG: { apiUrl: 'https://api.example', apiSameOrigin: false, apiToken: 'tok', supportEmail: '', privacyUrl: '', termsUrl: '' },
}));
// 테스트 환경에는 기기 저장소 네이티브 모듈이 없어 메모리로 대신한다
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

type Call = { url: string; method: string; body?: string; headers?: Record<string, string> };
const calls: Call[] = [];
let fail = false;

beforeEach(() => {
  jest.useFakeTimers({ now: 1_950_000_000_000 });
  calls.length = 0;
  fail = false;
  resetDeletionStateForTest();
  useAppStore.setState({ analyticsConsent: null, pendingDeletion: null, teamCheck: false, teamCheckAt: 0, team: null, deviceId: 'd_consent_test' });
  global.fetch = jest.fn(async (url: string, init: { method?: string; body?: string; headers?: Record<string, string> } = {}) => {
    calls.push({ url: String(url), method: init.method ?? 'GET', body: init.body, headers: init.headers });
    if (fail) throw new Error('offline');
    if (String(url).includes('/api/team')) return { ok: true, status: 200, json: async () => ({ ready: true, team: false }) };
    return { ok: true, status: 204 };
  }) as unknown as typeof fetch;
});

afterEach(() => {
  jest.useRealTimers();
});

describe('삭제 요청 남기기 (store)', () => {
  it('켜져 있던 동의를 끄면 그 기기 기록 삭제가 요청된다 — 마이 탭이든 첫 화면이든', () => {
    useAppStore.getState().setAnalyticsConsent(true);
    expect(useAppStore.getState().pendingDeletion).toBeNull();
    useAppStore.getState().setAnalyticsConsent(false);
    expect(useAppStore.getState().pendingDeletion).toEqual({ deviceId: 'd_consent_test', at: Date.now(), sent: 0 });
  });

  it('처음 묻는 자리에서 동의하지 않은 것(null → false)은 지울 것이 없어 요청하지 않는다', () => {
    useAppStore.getState().setAnalyticsConsent(false);
    expect(useAppStore.getState().pendingDeletion).toBeNull();
  });

  it('「모든 데이터 삭제」도 서버 기록 삭제를 요청하고 팀원 확인을 끈다', () => {
    useAppStore.setState({ teamCheck: true, teamCheckAt: Date.now() });
    useAppStore.getState().resetAll();
    const s = useAppStore.getState();
    expect(s.pendingDeletion).toMatchObject({ deviceId: 'd_consent_test', sent: 0 });
    expect(s.teamCheck).toBe(false);
  });
});

describe('삭제 요청 보내기 (lib/server-deletion)', () => {
  it('철회 시각과 함께 보내고, 2분 30초 뒤 한 번 더 지운 다음 요청을 지운다', async () => {
    useAppStore.getState().requestServerDeletion();
    const at = useAppStore.getState().pendingDeletion!.at;
    await processPendingDeletion();
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ url: 'https://api.example/api/track', method: 'DELETE' });
    // 기기 시계와 상관없이 그 기기 기록을 모두 지운다 (삭제가 끝날 때까지 새 기록을 보내지 않으므로)
    expect(JSON.parse(calls[0].body!)).toEqual({ deviceId: 'd_consent_test' });
    expect(at).toBe(Date.now());
    expect(useAppStore.getState().pendingDeletion).toMatchObject({ sent: 1 });

    await jest.advanceTimersByTimeAsync(SETTLE_MS + 2000);
    expect(calls).toHaveLength(2);
    expect(useAppStore.getState().pendingDeletion).toBeNull();
  });

  it('보내지 못하면(오프라인) 요청을 남겨 두었다가 다음에 다시 보낸다', async () => {
    useAppStore.getState().requestServerDeletion();
    fail = true;
    await processPendingDeletion();
    expect(useAppStore.getState().pendingDeletion).toMatchObject({ sent: 0 });

    // 다음 실행: 이미 2분 30초가 지났으면 한 번 보내고 끝
    fail = false;
    jest.setSystemTime(Date.now() + SETTLE_MS + 1000);
    await processPendingDeletion();
    expect(calls.filter((c) => c.method === 'DELETE')).toHaveLength(2);
    expect(useAppStore.getState().pendingDeletion).toBeNull();
  });

  it('응답 없이 멈추면 15초 뒤 실패로 보고, 앱이 켜져 있는 동안 1분 뒤 다시 보낸다', async () => {
    useAppStore.getState().requestServerDeletion();
    jest.setSystemTime(Date.now() + SETTLE_MS + 1000);
    (global.fetch as jest.Mock).mockImplementationOnce(
      (_url: string, init: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => init.signal?.addEventListener('abort', () => reject(new Error('aborted')))),
    );
    const first = processPendingDeletion();
    await jest.advanceTimersByTimeAsync(15_000);
    await first;
    expect(useAppStore.getState().pendingDeletion).not.toBeNull();
    await jest.advanceTimersByTimeAsync(60_000);
    expect(useAppStore.getState().pendingDeletion).toBeNull();
  });

  it('서버가 거부해도(5xx) 남겨 두고, 형식 오류(400)는 다시 보내도 같으니 끝낸다', async () => {
    useAppStore.getState().requestServerDeletion();
    jest.setSystemTime(Date.now() + SETTLE_MS + 1000);
    (global.fetch as jest.Mock).mockImplementationOnce(async () => ({ ok: false, status: 502 }));
    await processPendingDeletion();
    expect(useAppStore.getState().pendingDeletion).not.toBeNull();
    (global.fetch as jest.Mock).mockImplementationOnce(async () => ({ ok: false, status: 400 }));
    await processPendingDeletion();
    expect(useAppStore.getState().pendingDeletion).toBeNull();
  });
});

describe('예전 판 저장 데이터 정리 (persist 판 2)', () => {
  const migrate = (state: object, version: number) => useAppStore.persist.getOptions().migrate!(state, version) as { pendingDeletion?: unknown };

  it('예전 판에서 동의를 꺼 둔 기기는 이 판을 처음 열 때 한 번 삭제를 요청한다', () => {
    expect(migrate({ deviceId: 'd_old_off', analyticsConsent: false }, 1).pendingDeletion).toMatchObject({ deviceId: 'd_old_off', sent: 0 });
  });

  it('동의한 채 만 14세 미만 나이로 저장된 기기도 삭제를 요청한다', () => {
    expect(migrate({ deviceId: 'd_old_kid', analyticsConsent: true, user: { age: 13 } }, 1).pendingDeletion).toMatchObject({ deviceId: 'd_old_kid' });
  });

  it('동의한 성인 기기와 이미 판 2 인 저장 데이터는 그대로', () => {
    expect(migrate({ deviceId: 'd_adult', analyticsConsent: true, user: { age: 25 } }, 1).pendingDeletion).toBeUndefined();
    expect(migrate({ deviceId: 'd_v2', analyticsConsent: false }, 2).pendingDeletion).toBeUndefined();
  });
});

describe('팀원 확인 (lib/billing/team)', () => {
  it('「내 기기 ID」를 누른 기기는 기기 ID 를 주소가 아닌 머리글로 보낸다', async () => {
    useAppStore.getState().enableTeamCheck();
    await refreshTeam({ force: true });
    const call = calls.find((c) => c.url.includes('/api/team'));
    expect(call?.url).toBe('https://api.example/api/team');
    expect(call?.headers).toMatchObject({ 'x-device-id': 'd_consent_test', 'x-app-token': 'tok' });
  });

  it('누른 뒤 14일 안에 팀원으로 등록되지 않으면 더 묻지 않는다', async () => {
    useAppStore.setState({ teamCheck: true, teamCheckAt: Date.now() - 15 * 24 * 60 * 60 * 1000, team: null });
    await refreshTeam({ force: true });
    expect(calls.some((c) => c.url.includes('/api/team'))).toBe(false);
    expect(useAppStore.getState().teamCheck).toBe(false);
  });

  it('이미 팀원인 기기는 14일이 지나도 계속 확인한다', async () => {
    useAppStore.setState({ teamCheck: true, teamCheckAt: Date.now() - 30 * 24 * 60 * 60 * 1000, team: { label: '팀원', verifiedAt: Date.now() } });
    await refreshTeam({ force: true });
    expect(calls.some((c) => c.url.includes('/api/team'))).toBe(true);
  });

  it('예전 판에서 켠 확인(시각 없음)은 지금부터 14일을 센다', async () => {
    useAppStore.setState({ teamCheck: true, teamCheckAt: 0 });
    await refreshTeam({ force: true });
    expect(useAppStore.getState().teamCheckAt).toBe(Date.now());
    expect(calls.some((c) => c.url.includes('/api/team'))).toBe(true);
  });
});
