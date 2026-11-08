import { type PropsWithChildren } from 'react';
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, * as Reanimated from 'react-native-reanimated';
import { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';

import { haptic, type HapticName } from '@/lib/haptics';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
// 움직임 줄이기 설정 — 화면 테스트의 가짜 reanimated 에 없을 수 있어 없으면 「아님」으로 본다
const useReducedMotion: () => boolean = typeof Reanimated.useReducedMotion === 'function' ? Reanimated.useReducedMotion : () => false;

interface PressableScaleProps extends Omit<PressableProps, 'style'> {
  style?: StyleProp<ViewStyle>;
  /** 눌렸을 때 크기 (기본 0.96) */
  pressedScale?: number;
  /** 눌렀을 때 진동 (기본 soft). false 면 진동 없음 */
  feedback?: HapticName | false;
}

/**
 * 누르면 말랑하게 줄어들었다가 튕겨 돌아오는 버튼 바탕.
 * 카드·타일처럼 크게 누르는 곳에 쓴다.
 */
export function PressableScale({ children, style, pressedScale = 0.96, feedback = 'soft', onPressIn, onPressOut, onPress, ...rest }: PropsWithChildren<PressableScaleProps>) {
  const scale = useSharedValue(1);
  // 움직임 줄이기 설정이면 튕기지 않고 살짝만 줄었다 돌아온다
  const reduced = useReducedMotion();
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <AnimatedPressable
      accessibilityRole="button"
      {...rest}
      onPressIn={(e) => {
        scale.value = reduced ? withTiming(1 - (1 - pressedScale) / 2, { duration: 80 }) : withSpring(pressedScale, { damping: 18, stiffness: 380 });
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        scale.value = reduced ? withTiming(1, { duration: 120 }) : withSpring(1, { damping: 12, stiffness: 260 });
        onPressOut?.(e);
      }}
      onPress={(e) => {
        if (feedback) haptic[feedback]();
        onPress?.(e);
      }}
      style={[style, animated]}>
      {children}
    </AnimatedPressable>
  );
}
