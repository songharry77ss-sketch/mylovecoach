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
  supportEmail: process.env.EXPO_PUBLIC_SUPPORT_EMAIL ?? 'support@mylovecoach.app',
  privacyUrl: process.env.EXPO_PUBLIC_PRIVACY_URL ?? 'https://mylovecoach.vercel.app/privacy.html',
  termsUrl: process.env.EXPO_PUBLIC_TERMS_URL ?? 'https://mylovecoach.vercel.app/terms.html',
};
