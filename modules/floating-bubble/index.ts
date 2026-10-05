import { requireOptionalNativeModule } from 'expo';

/**
 * 안드로이드 전용 「플로팅 버블」 (다른 앱 위에 떠 있는 연애코치 바로가기).
 * 네이티브 쪽: android/src/main/java/expo/modules/floatingbubble/FloatingBubbleModule.kt
 *
 * iOS·웹·Expo Go 에는 이 모듈이 없으므로 모든 함수가 안전한 기본값(false / 아무것도 안 함)을 돌려준다.
 */
type FloatingBubbleNativeModule = {
  canDrawOverlays(): boolean;
  openOverlaySettings(): void;
  start(): boolean;
  stop(): void;
  isRunning(): boolean;
};

const native = requireOptionalNativeModule<FloatingBubbleNativeModule>('FloatingBubble');

/** 네이티브 호출이 실패해도 앱이 죽지 않도록 기본값으로 감싼다 */
function call<T>(fn: (m: FloatingBubbleNativeModule) => T, fallback: T): T {
  if (native == null) return fallback;
  try {
    return fn(native);
  } catch (error) {
    console.warn('[FloatingBubble]', error);
    return fallback;
  }
}

/** 이 기기에서 네이티브 버블 모듈을 쓸 수 있는지 (안드로이드 개발/스토어 빌드에서만 true) */
export function isAvailable(): boolean {
  return native != null;
}

/** 「다른 앱 위에 표시」 권한이 켜져 있는지 */
export function canDrawOverlays(): boolean {
  return call((m) => m.canDrawOverlays(), false);
}

/**
 * 「다른 앱 위에 표시」 설정 화면을 연다.
 * 안드로이드 11 이상은 앱 목록 화면이 열리므로 사용자가 목록에서 이 앱을 찾아 켜야 한다.
 */
export function openOverlaySettings(): void {
  call((m) => m.openOverlaySettings(), undefined);
}

/** 버블을 띄운다. 권한이 없거나 시작하지 못하면 false. */
export function start(): boolean {
  return call((m) => m.start(), false);
}

/** 버블을 끈다 (떠 있지 않으면 아무 일도 없다) */
export function stop(): void {
  call((m) => m.stop(), undefined);
}

/**
 * 버블이 켜져 있는지.
 * 사용자가 ✕ 영역이나 알림으로 끌 수도 있으니, 앱으로 돌아올 때(AppState 'active') 다시 확인할 것.
 */
export function isRunning(): boolean {
  return call((m) => m.isRunning(), false);
}
