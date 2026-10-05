import { useEffect, useState } from 'react';
import { type StyleProp, type TextStyle } from 'react-native';
import { Easing, runOnJS, useAnimatedReaction, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';

import { AppText, type AppTextProps } from '@/components/ui/app-text';
import { haptic } from '@/lib/haptics';

interface AnimatedNumberProps extends Omit<AppTextProps, 'children'> {
  value: number;
  /** 숫자 뒤에 붙일 글자 (예: °, %, 점) */
  suffix?: string;
  duration?: number;
  delay?: number;
  /** 올라가는 동안 눈금 진동 */
  ticks?: boolean;
  style?: StyleProp<TextStyle>;
}

/** 0 에서 목표값까지 숫자가 촤르륵 올라가는 텍스트 */
export function AnimatedNumber({ value, suffix = '', duration = 1100, delay = 200, ticks = true, ...text }: AnimatedNumberProps) {
  const v = useSharedValue(0);
  const [shown, setShown] = useState(0);

  useEffect(() => {
    v.value = withDelay(delay, withTiming(value, { duration, easing: Easing.out(Easing.cubic) }));
  }, [value, duration, delay, v]);

  useAnimatedReaction(
    () => Math.round(v.value),
    (now, prev) => {
      if (prev == null || now === prev) return;
      runOnJS(setShown)(now);
      if (ticks && now % 4 === 0) runOnJS(haptic.tick)();
    },
  );

  return (
    <AppText {...text}>
      {shown}
      {suffix}
    </AppText>
  );
}
