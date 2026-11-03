import { useIsFocused } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';

/**
 * 앱을 켤 때 로고 인트로(밝은 바탕)가 덮고 있는 동안은 false — 그 아래 미리 그려진 짙은 화면이
 * 흰 글자로 바꾸면 인트로 위 시계·배터리가 안 보인다. 루트 레이아웃이 인트로가 끝나면 true 로 내려 준다.
 */
export const SystemBarsReady = createContext(true);

/**
 * 이 화면이 보이는 동안에만 상태 표시줄(시계·배터리) 글자색을 바꾼다.
 * 짙은 무대 배경 화면에서 'light' 를 쓴다 — 기본(밝은 테마)은 검은 글자라 짙은 바탕에서 안 보인다.
 * 탭 화면은 서로 겹쳐 살아 있으므로 초점이 있을 때만 그려야 다른 탭의 색을 덮지 않는다.
 */
export function FocusStatusBar({ style }: { style: 'light' | 'dark' }) {
  const focused = useIsFocused();
  const ready = useContext(SystemBarsReady);
  return focused && ready ? <StatusBar style={style} /> : null;
}

/**
 * 상태 표시줄 뒤에 까는 띠. 스크롤한 내용이 시계·배터리 글자 뒤로 비쳐 겹쳐 보이지 않게 한다.
 * visible 을 바꾸면 부드럽게 나타나고 사라진다 (맨 위에서는 무대 배경이 그대로 보이게 숨겨 둔다).
 */
export function StatusBarScrim({ height, color, visible = true }: { height: number; color: string; visible?: boolean }) {
  const opacity = useRef(new Animated.Value(visible ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(opacity, { toValue: visible ? 1 : 0, duration: 160, useNativeDriver: true }).start();
  }, [opacity, visible]);
  if (height <= 0) return null;
  return <Animated.View pointerEvents="none" style={[styles.scrim, { height, backgroundColor: color, opacity }]} />;
}

/** 스크롤이 맨 위에서 조금이라도 내려갔는지 — 넘을 때만 다시 그린다 */
export function useScrolledPast(threshold = 8) {
  const [scrolled, setScrolled] = useState(false);
  const last = useRef(false);
  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const past = e.nativeEvent.contentOffset.y > threshold;
      if (past !== last.current) {
        last.current = past;
        setScrolled(past);
      }
    },
    [threshold],
  );
  return { scrolled, onScroll };
}

const styles = StyleSheet.create({
  scrim: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 },
});
