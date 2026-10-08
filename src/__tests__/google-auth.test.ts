import * as AppleAuthentication from 'expo-apple-authentication';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

import { AuthCancelled, deleteAccount, providerLabel, signInWithGoogle, signInWithKakao, signOut } from '@/lib/auth';
import { EMPTY_WALLET } from '@/lib/billing/quota';
import { supabase } from '@/lib/supabase';
import { useAppStore } from '@/store/app-store';

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(async () => null), setItem: jest.fn(async () => {}), removeItem: jest.fn(async () => {}), removeMany: jest.fn(async () => {}) },
}));
jest.mock('@/lib/supabase', () => ({
  supabase: { auth: { signInWithOAuth: jest.fn(), exchangeCodeForSession: jest.fn(), getSession: jest.fn(), signOut: jest.fn() } },
  authStorageKey: 'sb-test-auth-token',
  authAvailable: true,
}));
jest.mock('@/lib/config', () => ({ APP_CONFIG: { apiUrl: 'https://coach.test', apiToken: '' } }));
jest.mock('@/lib/analytics', () => ({ track: jest.fn(), discardQueuedAnalytics: jest.fn() }));
jest.mock('expo-linking', () => ({ createURL: () => 'mylovecoach://auth/callback' }));
jest.mock('expo-web-browser', () => ({ openAuthSessionAsync: jest.fn() }));
jest.mock('expo-apple-authentication', () => ({ signInAsync: jest.fn(), isAvailableAsync: jest.fn(async () => false), AppleAuthenticationScope: {} }));

const auth = supabase!.auth;
const oauth = auth.signInWithOAuth as jest.Mock;
const exchange = auth.exchangeCodeForSession as jest.Mock;
const openBrowser = WebBrowser.openAuthSessionAsync as jest.Mock;
const fetchMock = jest.fn();
const session = { access_token: 'test-session', user: { id: 'google-user', app_metadata: { provider: 'google' } } };
const locationDescriptor = Object.getOwnPropertyDescriptor(window, 'location');

beforeAll(() => {
  Object.defineProperty(window, 'location', { configurable: true, value: { origin: 'https://coach.test' } });
});

afterAll(() => {
  if (locationDescriptor) Object.defineProperty(window, 'location', locationDescriptor);
});

beforeEach(() => {
  jest.clearAllMocks();
  Platform.OS = 'android';
  global.fetch = fetchMock as unknown as typeof fetch;
  oauth.mockResolvedValue({ data: { url: 'https://auth.test/authorize' }, error: null });
  exchange.mockResolvedValue({ data: { session }, error: null });
  openBrowser.mockResolvedValue({ type: 'success', url: 'mylovecoach://auth/callback?code=test-code' });
  (auth.getSession as jest.Mock).mockResolvedValue({ data: { session }, error: null });
  (auth.signOut as jest.Mock).mockResolvedValue({ error: null });
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ bonus: true, new: true, member: { provider: 'google', nickname: '테스트 회원', created_at: '2026-10-08T00:00:00Z' } }) });
  useAppStore.setState({ member: null, wallet: { ...EMPTY_WALLET, granted: [] } });
});

describe('Google 브라우저 로그인', () => {
  it('웹은 기본 정보 권한과 웹 콜백으로 이동하고, 회원 연결은 콜백에 맡긴다', async () => {
    Platform.OS = 'web';
    await expect(signInWithGoogle()).resolves.toBeNull();
    expect(oauth).toHaveBeenCalledWith({ provider: 'google', options: { redirectTo: 'https://coach.test/auth/callback', scopes: 'openid email profile' } });
    expect(openBrowser).not.toHaveBeenCalled();
    expect(exchange).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(['android', 'ios'] as const)('%s는 인증 코드를 교환한 뒤 Google 회원과 기기를 연결한다', async (platform) => {
    Platform.OS = platform;
    const result = await signInWithGoogle();
    expect(oauth).toHaveBeenCalledWith({ provider: 'google', options: { redirectTo: 'mylovecoach://auth/callback', skipBrowserRedirect: true, scopes: 'openid email profile' } });
    expect(openBrowser).toHaveBeenCalledWith('https://auth.test/authorize', 'mylovecoach://auth/callback');
    expect(exchange).toHaveBeenCalledWith('test-code');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('https://coach.test/api/member');
    expect(fetchMock.mock.calls[0][1].method).toBe('POST');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ deviceId: useAppStore.getState().deviceId });
    expect(result?.member.provider).toBe('google');
    expect(result?.bonus).toBe(true);
    expect(useAppStore.getState().member?.provider).toBe('google');
    expect(AppleAuthentication.signInAsync).not.toHaveBeenCalled();
  });

  it.each(['cancel', 'dismiss'])('로그인 창을 %s하면 코드 교환·회원 생성·보너스를 처리하지 않는다', async (type) => {
    openBrowser.mockResolvedValue({ type });
    await expect(signInWithGoogle()).rejects.toBeInstanceOf(AuthCancelled);
    expect(exchange).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(useAppStore.getState().member).toBeNull();
  });

  it('Google 동의를 거절한 콜백은 취소로 처리한다', async () => {
    openBrowser.mockResolvedValue({ type: 'success', url: 'mylovecoach://auth/callback?error=access_denied' });
    await expect(signInWithGoogle()).rejects.toBeInstanceOf(AuthCancelled);
    expect(exchange).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('다른 주소로 돌아오면 인증 코드를 교환하지 않는다', async () => {
    openBrowser.mockResolvedValue({ type: 'success', url: 'https://other.test/auth/callback?code=other-code' });
    await expect(signInWithGoogle()).rejects.toThrow('로그인을 마치지 못했어요.');
    expect(exchange).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('코드 교환이 실패하면 회원 생성과 보너스를 처리하지 않는다', async () => {
    exchange.mockResolvedValue({ error: new Error('인증 코드가 만료됐어요.') });
    await expect(signInWithGoogle()).rejects.toThrow('인증 코드가 만료됐어요.');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(useAppStore.getState().member).toBeNull();
  });

  it('카카오 로그인은 기존 제공자와 권한 설정을 유지한다', async () => {
    Platform.OS = 'web';
    await signInWithKakao();
    expect(oauth).toHaveBeenCalledWith({ provider: 'kakao', options: { redirectTo: 'https://coach.test/auth/callback' } });
  });
});

describe('Google 회원 상태 정리', () => {
  beforeEach(() => useAppStore.getState().setMember({ userId: 'google-user', provider: 'google', nickname: null, joinedAt: 1 }));

  it('로그아웃은 이 기기 세션과 회원 표시만 지운다', async () => {
    await signOut();
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(useAppStore.getState().member).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(providerLabel('google')).toBe('Google');
  });

  it('탈퇴는 회원 API를 호출하고 Apple 인증이나 별도 Google 권한 요청 없이 로컬 세션을 지운다', async () => {
    Platform.OS = 'ios';
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ deleted: true, appleRevocation: 'not_applicable' }) });
    await expect(deleteAccount({ expectedUserId: 'google-user' })).resolves.toEqual({ appleRevocation: 'not_applicable' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('https://coach.test/api/member');
    expect(fetchMock.mock.calls[0][1].method).toBe('DELETE');
    expect(fetchMock.mock.calls[0][1].body).toBeUndefined();
    expect(AppleAuthentication.signInAsync).not.toHaveBeenCalled();
    expect(oauth).not.toHaveBeenCalled();
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(useAppStore.getState().member).toBeNull();
  });

  it.each([
    { label: '서버 삭제 실패', ok: false, body: { error: '회원 삭제를 마치지 못했어요.' }, message: '회원 삭제를 마치지 못했어요.' },
    { label: '삭제 완료 표시 없는 성공 응답', ok: true, body: {}, message: '탈퇴 완료를 확인하지 못했어요.' },
  ])('$label 때 Google 회원과 로컬 세션을 보존한다', async ({ ok, body, message }) => {
    fetchMock.mockResolvedValue({ ok, json: async () => body });
    await expect(deleteAccount({ expectedUserId: 'google-user' })).rejects.toThrow(message);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1].method).toBe('DELETE');
    expect(AppleAuthentication.signInAsync).not.toHaveBeenCalled();
    expect(oauth).not.toHaveBeenCalled();
    expect(auth.signOut).not.toHaveBeenCalled();
    expect(useAppStore.getState().member?.userId).toBe('google-user');
  });
});
