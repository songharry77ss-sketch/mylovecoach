/**
 * 안드로이드 앱 안 Google 로그인 (계정 선택 창 → ID 토큰).
 *
 * 2026-11-23: 14일 새 안드로이드 이용자 36명 중 1명만 가입(아이폰은 Apple 버튼 한 번으로 40%).
 * 카카오·Google 로그인이 브라우저를 거쳐야 해서 대부분 중간에 떠났다 → Google 은 앱 안 계정 선택 창으로.
 *
 * 필요한 설정 (Google Cloud 프로젝트 mylovecoach, 11-23 만듦):
 * - 웹 클라이언트 = Supabase Google 제공자 클라이언트 (APP_CONFIG.googleWebClientId) — ID 토큰의 aud
 * - 안드로이드 클라이언트 2개: app.mylovecoach.android + Play 앱 서명 키 SHA-1 / 업로드 키 SHA-1(직접 설치 APK)
 * 안드로이드 클라이언트가 없거나 SHA-1 이 다르면 DEVELOPER_ERROR(10) — 그때는 브라우저 로그인으로 넘어간다.
 */
import { GoogleSignin, isErrorWithCode, isSuccessResponse, statusCodes } from '@react-native-google-signin/google-signin';

import { APP_CONFIG } from '@/lib/config';

import type { NativeGoogleResult } from './google-native';

export type { NativeGoogleResult } from './google-native';

let configured = false;

export async function nativeGoogleSignIn(): Promise<NativeGoogleResult> {
  const webClientId = APP_CONFIG.googleWebClientId;
  if (!webClientId) return { status: 'unavailable', reason: 'no-client-id' };
  try {
    if (!configured) {
      // 로그인에 필요한 기본 정보(이메일·프로필)만 — 브라우저 로그인과 같은 범위
      GoogleSignin.configure({ webClientId, scopes: ['email', 'profile'] });
      configured = true;
    }
    // Play 서비스가 없거나 오래된 기기는 업데이트 창을 띄우지 않고 브라우저 로그인으로 보낸다
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: false });
    const response = await GoogleSignin.signIn();
    if (!isSuccessResponse(response)) return { status: 'cancelled' };
    const idToken = response.data.idToken;
    if (!idToken) return { status: 'unavailable', reason: 'no-id-token' };
    return { status: 'success', idToken };
  } catch (error) {
    if (isErrorWithCode(error)) {
      if (error.code === statusCodes.SIGN_IN_CANCELLED) return { status: 'cancelled' };
      // IN_PROGRESS·PLAY_SERVICES_NOT_AVAILABLE·DEVELOPER_ERROR(10) 등
      return { status: 'unavailable', reason: String(error.code) };
    }
    return { status: 'unavailable', reason: 'unknown' };
  }
}

export async function nativeGoogleSignOut(): Promise<void> {
  if (!configured) return;
  await GoogleSignin.signOut().catch(() => null);
}
