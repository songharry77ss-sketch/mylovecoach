/**
 * 떠 있는 유리 탭 바(glass-tab-bar)의 자리 계산 — 화면(Screen)·홈이 아래를 얼마나 비울지 여기서 정한다.
 * 애니메이션 모듈 없이 가볍게 두어, 어느 화면에서 가져와도 탭 바 전체를 끌고 오지 않게 한다.
 */
import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** 알약·구슬 높이 */
export const TAB_BAR_HEIGHT = 62;

/**
 * 탭 바가 화면 바닥에서 떠 있는 거리.
 * 아이폰은 홈 막대 영역에 조금 걸치게(iOS 26 탭 바처럼), 안드로이드는 버튼·제스처 영역 위로, 아래 영역이 없는 기기는 조금만 띄운다.
 */
export function tabBarBottom(insetBottom: number, os: string = Platform.OS): number {
  if (insetBottom <= 0) return 12;
  return os === 'ios' ? Math.max(insetBottom - 12, 12) : insetBottom + 8;
}

/** 탭 화면 아래에 비워 둘 높이 — 마지막 내용이 떠 있는 탭 바에 가리지 않게 */
export function useTabBarSpace(): number {
  const insets = useSafeAreaInsets();
  return tabBarBottom(insets.bottom) + TAB_BAR_HEIGHT + 16;
}
