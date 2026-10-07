/**
 * src/lib/auth.ts 회원 탈퇴(deleteAccount) — 세션 확인과 Apple 확인 창 결과에 따라 어디서 멈추고 무엇을 서버에 보내는지.
 * Supabase·Apple 확인 창·서버는 가짜로 바꾼다.
 */
import * as AppleAuthentication from 'expo-apple-authentication';
import { Platform } from 'react-native';

import { discardQueuedAnalytics } from '@/lib/analytics';
import { AuthCancelled, deleteAccount, SessionMissing } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { useAppStore } from '@/store/app-store';

jest.mock('@react-native-async-storage/async-storage', () => {
  const mem = new Map<string, string>();
  return {
    __esModule: true,
    default: {
      getItem: async (k: string) => mem.get(k) ?? null,
      setItem: async (k: string, v: string) => void mem.set(k, v),
      removeItem: async (k: string) => void mem.delete(k),
      removeMany: async (keys: string[]) => keys.forEach((k) => mem.delete(k)),
    },
  };
});
jest.mock('@/lib/supabase', () => ({
  supabase: { auth: { getSession: jest.fn(), signOut: jest.fn(async () => ({ error: null })) } },
  authStorageKey: 'sb-test-auth-token',
  authAvailable: true,
}));
jest.mock('expo-apple-authentication', () => ({ signInAsync: jest.fn(), isAvailableAsync: jest.fn(async () => true), AppleAuthenticationScope: {} }));
jest.mock('@/lib/analytics', () => ({ track: jest.fn(), discardQueuedAnalytics: jest.fn() }));

const getSession = supabase!.auth.getSession as jest.Mock;
const signInAsync = AppleAuthentication.signInAsync as jest.Mock;
const fetchMock = jest.fn();
const session = { access_token: 'user-token', user: { id: 'u1', app_metadata: { provider: 'apple' } } };
const deleteCalls = () => fetchMock.mock.calls.filter(([url, init]) => String(url).endsWith('/api/member') && init?.method === 'DELETE');

beforeEach(() => {
  jest.clearAllMocks();
  Platform.OS = 'ios';
  global.fetch = fetchMock as unknown as typeof fetch;
  fetchMock.mockImplementation(async () => ({ ok: true, json: async () => ({ deleted: true }) }));
  getSession.mockResolvedValue({ data: { session }, error: null });
  useAppStore.getState().setMember({ userId: 'u1', provider: 'apple', nickname: null, joinedAt: 1 });
});

describe('deleteAccount (회원 탈퇴)', () => {
  it('세션 갱신이 네트워크 오류로 실패하면(error) 「로그인이 끝났어요」가 아니라 연결 오류 — 회원 표시는 그대로', async () => {
    getSession.mockResolvedValue({ data: { session: null }, error: new Error('Failed to fetch') });
    const failure = await deleteAccount().catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(Error);
    expect(failure).not.toBeInstanceOf(SessionMissing);
    expect((failure as Error).message).toBe('서버에 연결하지 못했어요. 잠시 후 다시 시도해주세요.');
    expect(signInAsync).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(useAppStore.getState().member).not.toBeNull();
  });

  it('세션이 정말 없을 때(error 없음)만 SessionMissing', async () => {
    getSession.mockResolvedValue({ data: { session: null }, error: null });
    await expect(deleteAccount()).rejects.toBeInstanceOf(SessionMissing);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('Apple 확인 창에서 코드를 받으면 함께 보낸다', async () => {
    signInAsync.mockResolvedValue({ authorizationCode: 'apple-code' });
    await deleteAccount();
    expect(deleteCalls()).toHaveLength(1);
    // 탈퇴 요청 전에 아직 보내지 않은 이용 기록을 버린다 (탈퇴 뒤 다시 저장되지 않게)
    expect((discardQueuedAnalytics as jest.Mock).mock.invocationCallOrder[0]).toBeLessThan(fetchMock.mock.invocationCallOrder[0]);
    expect(JSON.parse(deleteCalls()[0][1].body)).toEqual({ appleAuthorizationCode: 'apple-code' });
    expect(useAppStore.getState().member).toBeNull();
  });

  it('Apple 확인 창이 취소가 아닌 오류로 끝나면 코드 없이 탈퇴를 이어 간다 (서버는 토큰 취소만 건너뜀)', async () => {
    signInAsync.mockRejectedValue(Object.assign(new Error('The operation couldn’t be completed.'), { code: 'ERR_REQUEST_UNKNOWN' }));
    await deleteAccount();
    expect(deleteCalls()).toHaveLength(1);
    expect(deleteCalls()[0][1].body).toBeUndefined();
    expect(useAppStore.getState().member).toBeNull();
  });

  it('Apple 확인 창을 취소하면 탈퇴하지 않는다', async () => {
    signInAsync.mockRejectedValue(Object.assign(new Error('canceled'), { code: 'ERR_REQUEST_CANCELED' }));
    await expect(deleteAccount()).rejects.toBeInstanceOf(AuthCancelled);
    expect(deleteCalls()).toHaveLength(0);
    expect(discardQueuedAnalytics).not.toHaveBeenCalled();
    expect(useAppStore.getState().member).not.toBeNull();
  });
});
