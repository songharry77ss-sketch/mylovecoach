import { useEffect, useState } from 'react';
import { Text, type StyleProp, type TextStyle } from 'react-native';
import { Easing, runOnJS, useAnimatedReaction, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';

import { haptic } from '@/lib/haptics';

interface CountUpProps {
  value: number;
  /** 처음 도착한 결과에서만 0 부터 세어 올라간다. 아니면 바로 그 숫자 (목록이 다시 그려져도 다시 세지 않게) */
  animate?: boolean;
  /** 숫자 뒤 단위 (%, °, 점) — 숫자보다 작게 */
  suffix?: string;
  delay?: number;
  duration?: number;
  /** 세는 동안 눈금 진동 */
  ticks?: boolean;
  style?: StyleProp<TextStyle>;
  suffixStyle?: StyleProp<TextStyle>;
  /** 다 세면 (축하를 터뜨릴 때) */
  onDone?: () => void;
}

/** 큰 숫자 — 결과가 도착하면 0 에서 목표값까지 촤르륵 세어 올라간다 */
export function CountUp({ value, animate, suffix, delay = 300, duration = 1000, ticks = false, style, suffixStyle, onDone }: CountUpProps) {
  const v = useSharedValue(animate ? 0 : value);
  const [shown, setShown] = useState(animate ? 0 : Math.round(value));

  useEffect(() => {
    if (!animate) {
      v.value = value;
      setShown(Math.round(value));
      return;
    }
    v.value = withDelay(
      delay,
      withTiming(value, { duration, easing: Easing.out(Easing.cubic) }, (done) => {
        if (done && onDone) runOnJS(onDone)();
      }),
    );
    // 처음 한 번만 센다 (onDone 은 매번 새 함수라 넣지 않는다)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, animate]);

  useAnimatedReaction(
    () => Math.round(v.value),
    (now, prev) => {
      if (prev == null || now === prev) return;
      runOnJS(setShown)(now);
      if (ticks && now % 5 === 0) runOnJS(haptic.tick)();
    },
  );

  return (
    <Text style={style} accessibilityLabel={`${Math.round(value)}${suffix ?? ''}`}>
      {shown}
      {suffix ? <Text style={suffixStyle}>{suffix}</Text> : null}
    </Text>
  );
}
