import { Platform } from 'react-native';

import { FREE_UNLIMITED } from '@/lib/billing/plans';

/**
 * 무제한 테스트 빌드(FREE_UNLIMITED)가 정말 테스트용으로 설치됐는지.
 *
 * - iOS: StoreKit AppTransaction 의 environment 가 Sandbox(TestFlight)·Xcode 일 때만 무제한.
 *   App Store 에서 받은 설치(Production), 확인 실패, iOS 16 미만은 유료 동작 그대로다 —
 *   TestFlight 전용 무제한 빌드가 도구 실수로 App Store 에 나가도 이용자에게는 무제한이 켜지지 않는다 (fail-closed).
 * - 안드로이드: 무제한 빌드는 스토어를 거치지 않는 직접 설치 APK 뿐이라(android.yml 은 이 값을 끈 채로 만든다) 확인 없이 무제한.
 * - 웹: 무제한 웹 빌드는 만들지 않지만, 켜져 있으면 그대로 따른다.
 *
 * 저장소(app-store)는 이 값을 저장하지 않고 켤 때마다 다시 확인한다. 이 파일은 저장소를 불러오지 않는다 (서로 불러오는 고리 방지)
 */
export const initialTestUnlimited = FREE_UNLIMITED && Platform.OS !== 'ios';

/** StoreKit 설치 환경 값(Production · Sandbox · Xcode) → 무제한을 켤지 */
export function isTestEnvironment(environment: unknown): boolean {
  const env = String(environment ?? '')
    .trim()
    .toLowerCase();
  return env === 'sandbox' || env === 'xcode';
}

/** 켤 때 한 번 — 무제한을 켤지 확인한다 (iOS 만 실제로 묻고, 나머지는 initialTestUnlimited 그대로) */
export async function verifyTestInstall(): Promise<boolean> {
  if (!FREE_UNLIMITED) return false;
  if (Platform.OS !== 'ios') return initialTestUnlimited;
  try {
    // 결제 모듈은 웹 번들에 들어가지 않게 필요할 때만 불러온다 (iap.ts 와 같은 방식)
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const iap = require('expo-iap') as typeof import('expo-iap');
    const transaction = await iap.getAppTransactionIOS();
    return isTestEnvironment(transaction?.environment);
  } catch {
    return false;
  }
}
