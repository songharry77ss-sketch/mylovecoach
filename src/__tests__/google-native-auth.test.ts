/**
 * 안드로이드 앱 안 Google 로그인 (11-23) — 계정 선택 창으로 ID 토큰을 받아 바로 로그인하고,
 * 쓸 수 없으면 예전 브라우저 로그인으로 넘어간다.
 */
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

import { track } from '@/lib/analytics';
import { AuthCancelled, signInWithGoogle } from '@/lib/auth';
import { EMPTY_WALLET } from '@/lib/billing/quota';
import { nativeGoogleSignIn } from '@/lib/google-native';
import { supabase } from '@/lib/supabase';
import { useAppStore } from '@/store/app-store';

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(async () => null), setItem: jest.fn(async () => {}), removeItem: jest.fn(async () => {}), removeMany: jest.fn(async () => {}) },
}));
jest.mock('@/lib/supabase', () => ({
  supabase: { auth: { signInWithOAuth: jest.fn(), signInWithIdToken: jest.fn(), exchangeCodeForSession: jest.fn(), getSession: jest.fn(), signOut: jest.fn() } },
  authStorageKey: 'sb-test-auth-token',
  authAvailable: true,
}));
jest.mock('@/lib/config', () => ({ APP_CONFIG: { apiUrl: 'https://coach.test', apiToken: '', googleWebClientId: 'web-client.apps.googleusercontent.com' } }));
jest.mock('@/lib/analytics', () => ({ track: jest.fn(), discardQueuedAnalytics: jest.fn() }));
jest.mock('@/lib/google-native', () => ({ nativeGoogleSignIn: jest.fn(), nativeGoogleSignOut: jest.fn(async () => {}) }));
jest.mock('expo-linking', () => ({ createURL: () => 'mylovecoach://auth/callback' }));
jest.mock('expo-web-browser', () => ({ openAuthSessionAsync: jest.fn() }));
jest.mock('expo-apple-authentication', () => ({ signInAsync: jest.fn(), isAvailableAsync: jest.fn(async () => false), AppleAuthenticationScope: {} }));

const auth = supabase!.auth as unknown as Record<string, jest.Mock>;
const native = nativeGoogleSignIn as jest.Mock;
const openBrowser = WebBrowser.openAuthSessionAsync as jest.Mock;
const fetchMock = jest.fn();
const session = { access_token: 'test-session', user: { id: 'google-user', app_metadata: { provider: 'google' } } };

beforeEach(() => {
  jest.clearAllMocks();
  Platform.OS = 'android';
  global.fetch = fetchMock as unknown as typeof fetch;
  auth.signInWithOAuth.mockResolvedValue({ data: { url: 'https://auth.test/authorize' }, error: null });
  auth.signInWithIdToken.mockResolvedValue({ data: { session }, error: null });
  auth.exchangeCodeForSession.mockResolvedValue({ data: { session }, error: null });
  auth.getSession.mockResolvedValue({ data: { session }, error: null });
  openBrowser.mockResolvedValue({ type: 'success', url: 'mylovecoach://auth/callback?code=test-code' });
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ bonus: true, new: true, member: { provider: 'google', nickname: '테스트 회원', created_at: '2026-11-23T00:00:00Z' } }) });
  useAppStore.setState({ member: null, wallet: { ...EMPTY_WALLET, granted: [] } });
});

it('안드로이드: 계정 선택 창에서 받은 ID 토큰으로 바로 로그인하고, 브라우저는 열지 않는다', async () => {
  native.mockResolvedValue({ status: 'success', idToken: 'id-token' });
  const result = await signInWithGoogle();
  expect(auth.signInWithIdToken).toHaveBeenCalledWith({ provider: 'google', token: 'id-token' });
  expect(openBrowser).not.toHaveBeenCalled();
  expect(auth.signInWithOAuth).not.toHaveBeenCalled();
  expect(result?.bonus).toBe(true);
  expect(useAppStore.getState().member?.provider).toBe('google');
  expect(track).toHaveBeenCalledWith('google_native', { result: 'ok' });
});

it('안드로이드: 계정 선택 창을 닫으면 조용히 취소 — 브라우저로 넘어가지 않는다', async () => {
  native.mockResolvedValue({ status: 'cancelled' });
  await expect(signInWithGoogle()).rejects.toBeInstanceOf(AuthCancelled);
  expect(openBrowser).not.toHaveBeenCalled();
  expect(auth.signInWithIdToken).not.toHaveBeenCalled();
});

it('안드로이드: 앱 안 로그인을 쓸 수 없으면(예: 설정 오류 10) 예전 브라우저 로그인으로 넘어가고 이유를 남긴다', async () => {
  native.mockResolvedValue({ status: 'unavailable', reason: '10' });
  const result = await signInWithGoogle();
  expect(openBrowser).toHaveBeenCalledTimes(1);
  expect(auth.exchangeCodeForSession).toHaveBeenCalledWith('test-code');
  expect(result?.member.provider).toBe('google');
  expect(track).toHaveBeenCalledWith('google_native', { result: 'fallback', reason: '10' });
});

it('안드로이드: 로그인 서버가 ID 토큰을 거절하면 브라우저 로그인으로 넘어간다', async () => {
  native.mockResolvedValue({ status: 'success', idToken: 'bad-token' });
  auth.signInWithIdToken.mockResolvedValue({ data: { session: null }, error: { message: 'audience mismatch' } });
  const result = await signInWithGoogle();
  expect(openBrowser).toHaveBeenCalledTimes(1);
  expect(result?.member.provider).toBe('google');
  expect(track).toHaveBeenCalledWith('google_native', { result: 'fallback', reason: 'token-rejected' });
});

it('아이폰·웹은 앱 안 Google 로그인을 쓰지 않는다', async () => {
  Platform.OS = 'ios';
  await signInWithGoogle();
  expect(native).not.toHaveBeenCalled();
  expect(openBrowser).toHaveBeenCalledTimes(1);
});
