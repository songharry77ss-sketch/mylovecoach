/**
 * 빌드 시 주입되는 공개 설정값.
 * EXPO_PUBLIC_* 변수는 번들에 포함되므로 비밀키를 넣으면 안 됩니다.
 */
export const APP_CONFIG = {
  /** 코치 API 프록시 주소 (예: https://mylovecoach.vercel.app). 비어 있으면 설정 화면에서 직접 입력한 키를 사용 */
  apiUrl: (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/+$/, ''),
  /** 프록시가 요구하는 앱 토큰 (선택) */
  apiToken: process.env.EXPO_PUBLIC_API_TOKEN ?? '',
  supportEmail: process.env.EXPO_PUBLIC_SUPPORT_EMAIL ?? 'support@mylovecoach.app',
  privacyUrl: process.env.EXPO_PUBLIC_PRIVACY_URL ?? 'https://mylovecoach.vercel.app/privacy.html',
  termsUrl: process.env.EXPO_PUBLIC_TERMS_URL ?? 'https://mylovecoach.vercel.app/terms.html',
};
