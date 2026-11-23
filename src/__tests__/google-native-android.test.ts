/**
 * google-native.android.ts — 계정 선택 창 결과를 로그인 흐름이 쓰는 값으로 바꾼다.
 */
import { GoogleSignin } from '@react-native-google-signin/google-signin';

import { nativeGoogleSignIn, nativeGoogleSignOut } from '@/lib/google-native.android';

const mockConfig: { googleWebClientId: string } = { googleWebClientId: 'web-client.apps.googleusercontent.com' };

// 불러오는 순간이 아니라 쓰는 순간에 읽게 (jest.mock 은 import 보다 먼저 올라간다)
jest.mock('@/lib/config', () => ({
  get APP_CONFIG() {
    return mockConfig;
  },
}));
jest.mock('@react-native-google-signin/google-signin', () => {
  const statusCodes = { SIGN_IN_CANCELLED: 'SIGN_IN_CANCELLED', IN_PROGRESS: 'IN_PROGRESS', PLAY_SERVICES_NOT_AVAILABLE: 'PLAY_SERVICES_NOT_AVAILABLE' };
  return {
    statusCodes,
    GoogleSignin: { configure: jest.fn(), hasPlayServices: jest.fn(), signIn: jest.fn(), signOut: jest.fn() },
    isSuccessResponse: (r: { type: string }) => r.type === 'success',
    isErrorWithCode: (e: unknown) => typeof e === 'object' && e !== null && 'code' in e,
  };
});

const g = GoogleSignin as unknown as Record<string, jest.Mock>;

beforeEach(() => {
  jest.clearAllMocks();
  mockConfig.googleWebClientId = 'web-client.apps.googleusercontent.com';
  g.hasPlayServices.mockResolvedValue(true);
  g.signOut.mockResolvedValue(null);
});

it('계정을 고르면 ID 토큰을 돌려준다 — 웹 클라이언트 ID·기본 범위로 한 번만 설정', async () => {
  g.signIn.mockResolvedValue({ type: 'success', data: { idToken: 'id-token' } });
  await expect(nativeGoogleSignIn()).resolves.toEqual({ status: 'success', idToken: 'id-token' });
  await nativeGoogleSignIn();
  expect(g.configure).toHaveBeenCalledTimes(1);
  expect(g.configure).toHaveBeenCalledWith({ webClientId: 'web-client.apps.googleusercontent.com', scopes: ['email', 'profile'] });
  expect(g.hasPlayServices).toHaveBeenCalledWith({ showPlayServicesUpdateDialog: false });
});

it('창을 닫으면 취소', async () => {
  g.signIn.mockResolvedValue({ type: 'cancelled', data: null });
  await expect(nativeGoogleSignIn()).resolves.toEqual({ status: 'cancelled' });
  g.signIn.mockRejectedValue({ code: 'SIGN_IN_CANCELLED' });
  await expect(nativeGoogleSignIn()).resolves.toEqual({ status: 'cancelled' });
});

it('설정 오류(10)·Play 서비스 없음·토큰 없음은 「쓸 수 없음」 — 브라우저 로그인으로 넘기게', async () => {
  g.signIn.mockRejectedValue({ code: '10' });
  await expect(nativeGoogleSignIn()).resolves.toEqual({ status: 'unavailable', reason: '10' });
  g.hasPlayServices.mockRejectedValue({ code: 'PLAY_SERVICES_NOT_AVAILABLE' });
  await expect(nativeGoogleSignIn()).resolves.toEqual({ status: 'unavailable', reason: 'PLAY_SERVICES_NOT_AVAILABLE' });
  g.hasPlayServices.mockResolvedValue(true);
  g.signIn.mockResolvedValue({ type: 'success', data: { idToken: null } });
  await expect(nativeGoogleSignIn()).resolves.toEqual({ status: 'unavailable', reason: 'no-id-token' });
  g.signIn.mockRejectedValue(new Error('boom'));
  await expect(nativeGoogleSignIn()).resolves.toEqual({ status: 'unavailable', reason: 'unknown' });
});

it('웹 클라이언트 ID 가 비어 있으면 창을 띄우지 않는다', async () => {
  mockConfig.googleWebClientId = '';
  await expect(nativeGoogleSignIn()).resolves.toEqual({ status: 'unavailable', reason: 'no-client-id' });
  expect(g.signIn).not.toHaveBeenCalled();
});

it('로그아웃하면 고른 계정을 지운다', async () => {
  await nativeGoogleSignOut();
  expect(g.signOut).toHaveBeenCalled();
});
