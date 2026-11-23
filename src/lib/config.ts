/**
 * 빌드 시 주입되는 공개 설정값.
 * EXPO_PUBLIC_* 변수는 번들에 포함되므로 비밀키를 넣으면 안 됩니다.
 */
import { Platform } from 'react-native';

/**
 * 코치 API 주소.
 * - 네이티브 앱: EXPO_PUBLIC_API_URL (Vercel 배포 주소)
 * - 웹: 같은 도메인에서 서비스되므로 비어 있으면 상대 경로(/api/coach) 사용
 */
function resolveApiUrl(): string {
  const configured = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/+$/, '');
  if (configured) return configured;
  if (Platform.OS === 'web' && process.env.EXPO_PUBLIC_DEMO_MODE !== '1') return '';
  return '';
}

export const APP_CONFIG = {
  /** 코치 API 프록시 주소. 빈 문자열이면 (웹) 상대 경로 또는 (네이티브) 개인 키 모드 */
  apiUrl: resolveApiUrl(),
  /** 웹 빌드에서는 항상 서버(/api/coach)가 있다고 간주 */
  apiSameOrigin: Platform.OS === 'web' && process.env.EXPO_PUBLIC_DEMO_MODE !== '1',
  /** 프록시가 요구하는 앱 토큰 (선택) */
  apiToken: process.env.EXPO_PUBLIC_API_TOKEN ?? '',
  /**
   * 안드로이드 앱 안 Google 로그인(계정 선택 창)이 ID 토큰을 받을 웹 클라이언트 ID — Supabase Google 제공자에 등록된 것과 같아야 한다.
   * 로그인 주소에 그대로 실리는 공개 값이다(비밀 아님). 안드로이드 클라이언트(앱 서명 SHA-1)는 같은 Google Cloud 프로젝트에 따로 있다
   */
  googleWebClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '134476362186-jf8fu8rjro34fj0afghm6l38h4hfsd9p.apps.googleusercontent.com',
  supportEmail: process.env.EXPO_PUBLIC_SUPPORT_EMAIL ?? 'contact@craving.win',
  privacyUrl: process.env.EXPO_PUBLIC_PRIVACY_URL ?? 'https://mylovecoach.vercel.app/privacy.html',
  termsUrl: process.env.EXPO_PUBLIC_TERMS_URL ?? 'https://mylovecoach.vercel.app/terms.html',
};
