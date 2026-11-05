/**
 * 요청한 기기 종류. 앱이 알려 주면 그대로, 아니면 요청 머리글(user-agent)로 짐작한다:
 * 앱(React Native)의 요청은 iOS 가 「앱이름/빌드 CFNetwork/… Darwin/…」, Android 가 「okhttp/…」이고 브라우저는 「Mozilla/…」로 시작한다
 */
export type RequestPlatform = 'ios' | 'android' | 'web';

export function requestPlatform(userAgent: unknown, hinted?: unknown): RequestPlatform | null {
  if (hinted === 'ios' || hinted === 'android' || hinted === 'web') return hinted;
  const ua = typeof userAgent === 'string' ? userAgent : '';
  if (!ua) return null;
  if (/Mozilla\//i.test(ua)) return 'web';
  if (/CFNetwork|Darwin|iPhone|iPad|iOS/i.test(ua)) return 'ios';
  if (/okhttp|Android/i.test(ua)) return 'android';
  return null;
}
