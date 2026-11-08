/**
 * 스크롤하면 나타나는 유리 머리말 (1.2 개편).
 * 큰 제목(마이·탐색 등)이 위로 사라질 만큼 내리면 상태 표시줄 아래에 작은 제목이 든 유리 띠가 부드럽게 내려온다.
 * 맨 위로 돌아오면 사라진다. 상태 표시줄 뒤 띠(StatusBarScrim)를 겸한다 — 스크롤한 글자가 시계 뒤로 비치지 않게.
 * reanimated 를 쓰지 않는다 (Screen 이 쓰는 부품 — 테스트에서 가볍게 불러온다).
 */
import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text } from 'react-native';

import { GlassSurface } from '@/components/ui/glass-surface';
import { useTheme } from '@/hooks/use-theme';

/** 머리말 띠의 제목 줄 높이 (상태 표시줄 아래) */
export const GLASS_HEADER_BAR = 46;

export function GlassHeader({ title, top, visible }: { title: string; top: number; visible: boolean }) {
  const theme = useTheme();
  const shown = useRef(new Animated.Value(visible ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(shown, { toValue: visible ? 1 : 0, duration: 180, useNativeDriver: true }).start();
  }, [shown, visible]);
  const translateY = shown.interpolate({ inputRange: [0, 1], outputRange: [-8, 0] });
  return (
    <Animated.View
      pointerEvents="none"
      accessibilityElementsHidden={!visible}
      importantForAccessibility={visible ? 'auto' : 'no-hide-descendants'}
      style={[styles.wrap, { height: top + GLASS_HEADER_BAR, opacity: shown }]}>
      <GlassSurface floating={false} edge="bottom" style={StyleSheet.absoluteFill} />
      <Animated.View style={[styles.bar, { top, transform: [{ translateY }] }]}>
        <Text allowFontScaling={false} numberOfLines={1} style={[styles.title, { color: theme.text }]}>
          {title}
        </Text>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 },
  bar: { position: 'absolute', left: 0, right: 0, height: GLASS_HEADER_BAR, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 56 },
  title: { fontSize: 16, lineHeight: 22, fontWeight: '800', letterSpacing: -0.3 },
});
