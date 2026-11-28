/**
 * 잠금 미리보기 규칙 (lib/billing/preview) — 무료를 다 쓴 뒤 하루 한 번, 횟수가 생기면 가림이 풀린다.
 */
import { previewAvailable, previewLocked } from '@/lib/billing/preview';
import { dayKey, EMPTY_WALLET } from '@/lib/billing/quota';
import { useAppStore } from '@/store/app-store';

jest.mock('@/lib/config', () => ({
  APP_CONFIG: { apiUrl: 'https://coach.test', apiSameOrigin: false, apiToken: '', supportEmail: '', privacyUrl: '', termsUrl: '' },
}));
jest.mock('@/lib/billing/iap', () => ({ billingSupported: true }));
jest.mock('@/lib/supabase', () => ({ authAvailable: false }));
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: async () => null, setItem: async () => undefined, removeItem: async () => undefined },
}));

const now = Date.now();
const exhausted = { usage: { total: 99, day: dayKey(now), dayCount: 99 }, wallet: EMPTY_WALLET, premium: null, team: null };

describe('previewAvailable', () => {
  it('무료를 다 썼고 오늘 아직 안 썼으면 쓸 수 있다', () => {
    useAppStore.setState({ ...exhausted, previewDay: null });
    expect(previewAvailable(now)).toBe(true);
  });
  it('오늘 이미 썼으면 못 쓴다 — 다음 날에는 다시', () => {
    useAppStore.setState({ ...exhausted, previewDay: dayKey(now) });
    expect(previewAvailable(now)).toBe(false);
    useAppStore.setState({ previewDay: dayKey(now - 24 * 60 * 60 * 1000) });
    expect(previewAvailable(now)).toBe(true);
  });
  it('무료가 남아 있거나 이용권이 있으면 미리보기가 필요 없다', () => {
    useAppStore.setState({ ...exhausted, previewDay: null, usage: { total: 0, day: dayKey(now), dayCount: 0 } });
    expect(previewAvailable(now)).toBe(false);
    useAppStore.setState({ ...exhausted, previewDay: null, wallet: { ...EMPTY_WALLET, passUntil: now + 3600_000 } });
    expect(previewAvailable(now)).toBe(false);
  });
});

describe('previewLocked', () => {
  it('미리보기 결과는 횟수가 없을 때만 가린다', () => {
    expect(previewLocked(true, 0)).toBe(true);
    expect(previewLocked(true, 3)).toBe(false);
    expect(previewLocked(true, Infinity)).toBe(false);
    expect(previewLocked(undefined, 0)).toBe(false);
  });
});
