import { type PropsWithChildren } from 'react';
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { haptic, type HapticName } from '@/lib/haptics';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

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
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <AnimatedPressable
      accessibilityRole="button"
      {...rest}
      onPressIn={(e) => {
        scale.value = withSpring(pressedScale, { damping: 18, stiffness: 380 });
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        scale.value = withSpring(1, { damping: 12, stiffness: 260 });
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
