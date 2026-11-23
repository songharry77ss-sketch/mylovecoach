import { requireOptionalNativeModule } from 'expo';

/**
 * 설치 경로 읽기 (광고 추적). 네이티브 쪽:
 * - 안드로이드 android/src/main/java/expo/modules/installattribution/InstallAttributionModule.kt — Play 설치 경로
 * - iOS ios/InstallAttributionModule.swift — 애플 광고 귀속 토큰
 *
 * 웹·Expo Go·예전 빌드에는 이 모듈이 없으므로 모든 함수가 null 을 돌려준다. 해석은 src/lib/install-attribution.ts 가 한다.
 */
export interface PlayReferrer {
  /** utm_source=…&gclid=… 같은 Play 설치 경로 문자열 */
  referrer: string;
  /** 광고·링크를 누른 시각 (초, 모르면 0) */
  clickTs: number;
  /** 설치를 시작한 시각 (초) */
  installTs: number;
}

type InstallAttributionNativeModule = {
  getInstallReferrer?: () => Promise<PlayReferrer>;
  getAppleAdsToken?: () => Promise<string>;
};

const native = requireOptionalNativeModule<InstallAttributionNativeModule>('InstallAttribution');

/** 이 빌드에 네이티브 모듈이 들어 있는지 (1.3.2 부터) */
export function isAvailable(): boolean {
  return native != null;
}

/** 안드로이드 Play 설치 경로. 모듈이 없으면 null, 읽지 못하면 오류(메시지: referrer_unavailable:<번호> · referrer_timeout · referrer_failed) */
export async function getInstallReferrer(): Promise<PlayReferrer | null> {
  if (!native?.getInstallReferrer) return null;
  return native.getInstallReferrer();
}

/** 아이폰 애플 광고 귀속 토큰. 모듈이 없으면 null, 만들지 못하면 오류(메시지: token_unavailable:unsupported · token_unavailable:<번호>) */
export async function getAppleAdsToken(): Promise<string | null> {
  if (!native?.getAppleAdsToken) return null;
  return native.getAppleAdsToken();
}
