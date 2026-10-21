/**
 * 웹에서 결제가 필요할 때 — 보고 있는 기기에 맞는 스토어로 앱 설치를 안내한다.
 * 웹에는 인앱결제가 없어서(billing/iap.web.ts) 이용권은 iPhone·Android 앱에서만 살 수 있다.
 */
import { Platform } from 'react-native';

import { ANDROID_PACKAGE } from '@/lib/billing/plans';

export const APP_STORE_URL = 'https://apps.apple.com/kr/app/id6813404855';
export const PLAY_STORE_URL = `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE}`;

export type DownloadStore = 'ios' | 'android';
/** 앱을 받을 기기 — 아이폰·아이패드면 ios, 안드로이드면 android, 그 밖(컴퓨터 등)은 desktop */
export type DownloadDevice = DownloadStore | 'desktop';

export const STORE_URL: Record<DownloadStore, string> = { ios: APP_STORE_URL, android: PLAY_STORE_URL };
/** 스토어 버튼 이름 — 아이폰 앱 화면에는 App Store 만 나온다 (앱에서는 그 기기의 스토어만 고르므로, store-wording.test.ts) */
export const STORE_LABEL: Record<DownloadStore, string> = { ios: 'App Store', android: 'Google Play' };

/**
 * 어느 스토어를 먼저 보여 줄지. 웹은 브라우저의 user agent 로 기기를 가르고,
 * 앱(결제 모듈이 없는 개발용 빌드 등)은 그 기기의 스토어만 고른다.
 */
export function downloadDevice(): DownloadDevice {
  if (Platform.OS === 'ios' || Platform.OS === 'android') return Platform.OS;
  if (Platform.OS !== 'web' || typeof navigator === 'undefined') return 'desktop';
  const ua = navigator.userAgent || '';
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
  // iPadOS 13 이후 사파리는 맥처럼 보인다 — 맥에는 터치 화면이 없으니 터치가 되면 아이패드로 본다
  if (/Macintosh/i.test(ua) && (navigator.maxTouchPoints ?? 0) > 1) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  return 'desktop';
}
