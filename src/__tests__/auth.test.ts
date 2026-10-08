/**
 * src/lib/auth.ts 회원 탈퇴(deleteAccount) — 세션 확인과 Apple 확인 창 결과에 따라 어디서 멈추고 무엇을 서버에 보내는지.
 * Supabase·Apple 확인 창·서버는 가짜로 바꾼다.
 */
import * as AppleAuthentication from 'expo-apple-authentication';
import { Platform } from 'react-native';

import { discardQueuedAnalytics } from '@/lib/analytics';
import { AppleRevocationError, AuthCancelled, deleteAccount, MEMBER_DELETE_TIMEOUT_MS, SessionMissing } from '@/lib/auth';
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
  signInAsync.mockResolvedValue({ authorizationCode: 'apple-code' });
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

  it('Apple 확인 창이 오류로 끝나면 회원을 보존하고 재시도·수동 안내 오류를 돌려준다', async () => {
    signInAsync.mockRejectedValue(Object.assign(new Error('The operation couldn’t be completed.'), { code: 'ERR_REQUEST_UNKNOWN' }));
    await expect(deleteAccount()).rejects.toMatchObject({ name: 'AppleRevocationError', code: 'apple_reauthentication_failed' });
    expect(deleteCalls()).toHaveLength(0);
    expect(discardQueuedAnalytics).not.toHaveBeenCalled();
    expect(useAppStore.getState().member).not.toBeNull();
  });

  it('Apple 확인 창을 취소하면 탈퇴하지 않는다', async () => {
    signInAsync.mockRejectedValue(Object.assign(new Error('canceled'), { code: 'ERR_REQUEST_CANCELED' }));
    await expect(deleteAccount()).rejects.toBeInstanceOf(AuthCancelled);
    expect(deleteCalls()).toHaveLength(0);
    expect(discardQueuedAnalytics).not.toHaveBeenCalled();
    expect(useAppStore.getState().member).not.toBeNull();
  });

  it.each([null, '', '  '])('Apple 코드가 없으면(%j) 서버 삭제를 보내지 않는다', async (authorizationCode) => {
    signInAsync.mockResolvedValue({ authorizationCode });
    await expect(deleteAccount()).rejects.toMatchObject({ code: 'apple_code_required' });
    expect(deleteCalls()).toHaveLength(0);
    expect(useAppStore.getState().member).not.toBeNull();
  });

  it.each(['web', 'android'])('%s에서는 자동 Apple 재인증 대신 수동 안내를 선택하게 한다', async (platform) => {
    Platform.OS = platform as typeof Platform.OS;
    await expect(deleteAccount()).rejects.toBeInstanceOf(AppleRevocationError);
    expect(signInAsync).not.toHaveBeenCalled();
    expect(deleteCalls()).toHaveLength(0);
    expect(useAppStore.getState().member).not.toBeNull();
  });

  it('Google로 로그인했어도 세션에 Apple identity가 연결돼 있으면 재인증한다', async () => {
    getSession.mockResolvedValue({ data: { session: { ...session, user: { id: 'u1', app_metadata: { provider: 'google' }, identities: [{ provider: 'apple' }] } } }, error: null });
    useAppStore.getState().setMember({ userId: 'u1', provider: 'google', nickname: null, joinedAt: 1 });
    await deleteAccount();
    expect(signInAsync).toHaveBeenCalledTimes(1);
    expect(JSON.parse(deleteCalls()[0][1].body)).toEqual({ appleAuthorizationCode: 'apple-code' });
  });

  it('서버에서 Apple 취소 실패를 받으면 회원·로컬 세션을 보존한다', async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({ code: 'apple_revocation_failed', error: 'Apple 연결 해제를 확인하지 못했어요.' }) });
    await expect(deleteAccount()).rejects.toBeInstanceOf(AppleRevocationError);
    expect(useAppStore.getState().member).not.toBeNull();
    expect(supabase!.auth.signOut).not.toHaveBeenCalled();
  });

  it('수동 안내를 확인한 명시적 선택은 재인증 없이 플래그를 보내고 manual로 완료한다', async () => {
    Platform.OS = 'web';
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ deleted: true, appleRevocation: 'manual' }) });
    await expect(deleteAccount({ appleManualRevocationAcknowledged: true })).resolves.toEqual({ appleRevocation: 'manual' });
    expect(signInAsync).not.toHaveBeenCalled();
    expect(JSON.parse(deleteCalls()[0][1].body)).toEqual({ appleManualRevocationAcknowledged: true });
    expect(useAppStore.getState().member).toBeNull();
  });

  it.each([false, true])('최종 확인 대상과 현재 세션이 다르면 수동 안내 여부(%s)와 관계없이 삭제 전에 멈춘다', async (manual) => {
    getSession.mockResolvedValue({ data: { session: { ...session, user: { id: 'different-user', app_metadata: { provider: 'apple' } } } }, error: null });
    await expect(deleteAccount({ expectedUserId: 'u1', appleManualRevocationAcknowledged: manual })).rejects.toThrow('로그인 계정이 바뀌었어요');
    expect(signInAsync).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(discardQueuedAnalytics).not.toHaveBeenCalled();
    expect(supabase!.auth.signOut).not.toHaveBeenCalled();
  });

  it('확인 대상이 그대로면 정상 삭제하며 확인용 회원 ID는 서버 본문으로 보내지 않는다', async () => {
    await deleteAccount({ expectedUserId: 'u1' });
    expect(JSON.parse(deleteCalls()[0][1].body)).toEqual({ appleAuthorizationCode: 'apple-code' });
    expect(useAppStore.getState().member).toBeNull();
  });

  it('확인 창을 기다리는 동안 로그인 계정이 바뀌면 다른 계정을 삭제하지 않는다', async () => {
    getSession.mockResolvedValueOnce({ data: { session }, error: null });
    getSession.mockResolvedValue({ data: { session: { ...session, user: { id: 'different-user', app_metadata: { provider: 'google' } } } }, error: null });
    await expect(deleteAccount()).rejects.toThrow('로그인 계정이 바뀌었어요');
    expect(deleteCalls()).toHaveLength(0);
    expect(supabase!.auth.signOut).not.toHaveBeenCalled();
  });

  it('탈퇴를 연달아 눌러도 Apple 확인 창과 삭제 요청은 한 번만 보낸다', async () => {
    const first = deleteAccount();
    const second = deleteAccount();
    expect(second).toBe(first);
    await Promise.all([first, second]);
    expect(signInAsync).toHaveBeenCalledTimes(1);
    expect(deleteCalls()).toHaveLength(1);
  });

  it('다른 회원의 동시 호출은 진행 중인 탈퇴 성공 결과를 공유하지 않는다', async () => {
    const pending = deleteAccount({ expectedUserId: 'u1' });
    await expect(deleteAccount({ expectedUserId: 'different-user' })).rejects.toThrow('로그인 계정이 바뀌었어요');
    await pending;
    expect(signInAsync).toHaveBeenCalledTimes(1);
    expect(deleteCalls()).toHaveLength(1);
  });

  it.each(['세션만', '회원 표시만', '세션과 회원 표시'])('서버 삭제 응답 전에 %s 바뀌면 새 계정의 로컬 정보를 지우지 않는다', async (changed) => {
    let finish!: (response: unknown) => void;
    let started!: () => void;
    const requested = new Promise<void>((resolve) => { started = resolve; });
    fetchMock.mockImplementation(() => {
      started();
      return new Promise((resolve) => { finish = resolve; });
    });
    const pending = deleteAccount({ expectedUserId: 'u1' });
    await requested;
    if (changed !== '회원 표시만') getSession.mockResolvedValue({ data: { session: { ...session, user: { id: 'different-user', app_metadata: { provider: 'google' } } } }, error: null });
    if (changed !== '세션만') useAppStore.getState().setMember({ userId: 'different-user', provider: 'google', nickname: null, joinedAt: 2 });
    finish({ ok: true, json: async () => ({ deleted: true, appleRevocation: 'revoked' }) });
    await expect(pending).resolves.toEqual({ appleRevocation: 'revoked' });
    expect(supabase!.auth.signOut).not.toHaveBeenCalled();
    expect(useAppStore.getState().member?.userId).toBe(changed === '세션만' ? 'u1' : 'different-user');
    expect(deleteCalls()).toHaveLength(1);
  });

  it('실패 후 사용자가 다시 시도하면 일회용 코드를 새로 받는다', async () => {
    signInAsync.mockResolvedValueOnce({ authorizationCode: 'first-code' }).mockResolvedValueOnce({ authorizationCode: 'fresh-code' });
    fetchMock.mockResolvedValueOnce({ ok: false, json: async () => ({ code: 'apple_revocation_failed', error: '다시 시도해주세요.' }) });
    await expect(deleteAccount()).rejects.toBeInstanceOf(AppleRevocationError);
    await deleteAccount();
    expect(deleteCalls().map((c) => JSON.parse(c[1].body).appleAuthorizationCode)).toEqual(['first-code', 'fresh-code']);
  });

  it.each(['google', 'kakao'])('Apple identity 없는 %s 탈퇴는 Apple 확인 없이 기존처럼 진행한다', async (provider) => {
    getSession.mockResolvedValue({ data: { session: { ...session, user: { id: 'u1', app_metadata: { provider }, identities: [{ provider }] } } }, error: null });
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ deleted: true, appleRevocation: 'not_applicable' }) });
    await expect(deleteAccount()).resolves.toEqual({ appleRevocation: 'not_applicable' });
    expect(signInAsync).not.toHaveBeenCalled();
    expect(deleteCalls()).toHaveLength(1);
    expect(deleteCalls()[0][1].body).toBeUndefined();
  });

  it('삭제 응답이 멈추면 자동 재요청·로그아웃 없이 결과 미확인을 알린다', async () => {
    jest.useFakeTimers();
    try {
      fetchMock.mockImplementation((_url: string, init: { signal: AbortSignal }) => new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true })));
      const pending = deleteAccount().catch((error: unknown) => error);
      await jest.advanceTimersByTimeAsync(MEMBER_DELETE_TIMEOUT_MS + 1);
      const error = await pending;
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain('처리 결과를 확인하지 못했어요');
      expect(deleteCalls()).toHaveLength(1);
      expect(useAppStore.getState().member).not.toBeNull();
      expect(supabase!.auth.signOut).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });
});
