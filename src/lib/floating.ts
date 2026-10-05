import { Platform } from 'react-native';

import * as Bubble from '../../modules/floating-bubble';

/**
 * 플로팅 버블(다른 앱 위에 떠 있는 연애코치 바로가기) 앱용 진입점.
 * 안드로이드 네이티브 빌드에서만 동작하고, iOS·웹·Expo Go 에서는 모두 false / 아무것도 안 함.
 */
export const {
  isAvailable,
  canDrawOverlays,
  openOverlaySettings,
  start,
  stop,
  isRunning,
} = Bubble;

/** 이 기기에서 버블 기능을 보여 줄지 (설정 화면의 스위치 노출 여부 등) */
export const floatingSupported: boolean = Platform.OS === 'android' && Bubble.isAvailable();
