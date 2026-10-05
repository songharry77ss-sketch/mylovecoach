import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { Easing, interpolate, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';

import { palette } from '@/constants/theme';
import { haptic } from '@/lib/haptics';

/**
 * 화면 전체 위로 하트·꽃가루가 터지는 축하 효과.
 * 루트에 Provider 를 한 번 두고, 어디서든 useCelebrate()(...) 로 터뜨린다.
 * 터치를 막지 않도록 pointerEvents="none".
 */
export type BurstKind = 'hearts' | 'confetti' | 'sparkles' | 'fire' | 'ice';

export interface CelebrateOptions {
  kind?: BurstKind;
  /** 터지는 위치 (화면 좌표). 없으면 화면 가운데 조금 위 */
  x?: number;
  y?: number;
  /** 조각 수 (기본 18) */
  count?: number;
  /** 진동도 같이 (기본 true) */
  haptic?: boolean;
}

interface Burst {
  id: number;
  kind: BurstKind;
  x: number;
  y: number;
  count: number;
}

const CelebrationContext = createContext<(options?: CelebrateOptions) => void>(() => {});

export const useCelebrate = () => useContext(CelebrationContext);

const EMOJI: Record<Exclude<BurstKind, 'confetti'>, string[]> = {
  hearts: ['💗', '💖', '💕', '💘', '✨'],
  sparkles: ['✨', '⭐️', '💫', '🌟'],
  fire: ['🔥', '❤️‍🔥', '💥', '✨'],
  ice: ['🧊', '❄️', '💧'],
};

const CONFETTI_COLORS = [palette.pink400, palette.sky400, palette.lavender400, palette.yellow500, palette.mint500, palette.peach500];

let seq = 0;

export function CelebrationProvider({ children }: PropsWithChildren) {
  const [bursts, setBursts] = useState<Burst[]>([]);
  const { width, height } = useWindowDimensions();
  const size = useRef({ width, height });
  size.current = { width, height };

  const celebrate = useCallback((options: CelebrateOptions = {}) => {
    const id = ++seq;
    const burst: Burst = {
      id,
      kind: options.kind ?? 'hearts',
      x: options.x ?? size.current.width / 2,
      y: options.y ?? size.current.height * 0.42,
      count: Math.min(36, options.count ?? 18),
    };
    // 동시에 너무 많이 쌓이지 않게 최근 3개까지만
    setBursts((list) => [...list.slice(-2), burst]);
    if (options.haptic !== false) {
      if (burst.kind === 'ice') haptic.drop();
      else haptic.celebrate();
    }
    setTimeout(() => setBursts((list) => list.filter((b) => b.id !== id)), 1900);
  }, []);

  return (
    <CelebrationContext.Provider value={celebrate}>
      {children}
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        {bursts.map((b) => (
          <BurstView key={b.id} burst={b} />
        ))}
      </View>
    </CelebrationContext.Provider>
  );
}

function BurstView({ burst }: { burst: Burst }) {
  const particles = useMemo(
    () =>
      Array.from({ length: burst.count }, (_, i) => {
        // 위쪽 반원으로 고르게 퍼지되 약간씩 흔들리게
        const spread = Math.PI * 1.15;
        const base = -Math.PI / 2 - spread / 2 + (spread * i) / Math.max(1, burst.count - 1);
        const angle = base + (Math.random() - 0.5) * 0.35;
        const emojis = burst.kind === 'confetti' ? null : EMOJI[burst.kind];
        return {
          angle,
          distance: 90 + Math.random() * 150,
          size: burst.kind === 'confetti' ? 8 + Math.random() * 6 : 18 + Math.random() * 16,
          delay: Math.random() * 140,
          spin: (Math.random() - 0.5) * 540,
          emoji: emojis ? emojis[Math.floor(Math.random() * emojis.length)] : null,
          color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        };
      }),
    [burst.count, burst.kind],
  );
  return (
    <>
      {particles.map((p, i) => (
        <Particle key={i} {...p} x={burst.x} y={burst.y} />
      ))}
    </>
  );
}

interface ParticleProps {
  angle: number;
  distance: number;
  size: number;
  delay: number;
  spin: number;
  emoji: string | null;
  color: string;
  x: number;
  y: number;
}

function Particle({ angle, distance, size, delay, spin, emoji, color, x, y }: ParticleProps) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withDelay(delay, withTiming(1, { duration: 1250, easing: Easing.out(Easing.cubic) }));
  }, [delay, t]);

  const style = useAnimatedStyle(() => {
    const p = t.value;
    const dx = Math.cos(angle) * distance * p;
    // 위로 솟았다가 중력처럼 살짝 떨어지는 궤적
    const dy = Math.sin(angle) * distance * p + 140 * p * p;
    return {
      opacity: interpolate(p, [0, 0.08, 0.7, 1], [0, 1, 1, 0]),
      transform: [
        { translateX: x + dx - size / 2 },
        { translateY: y + dy - size / 2 },
        { scale: interpolate(p, [0, 0.18, 1], [0.2, 1.15, 0.75]) },
        { rotate: `${spin * p}deg` },
      ],
    };
  });

  if (emoji) {
    return <Animated.Text style={[styles.particle, { fontSize: size, lineHeight: size * 1.2 }, style]}>{emoji}</Animated.Text>;
  }
  return <Animated.View style={[styles.particle, { width: size, height: size * 0.55, borderRadius: 2, backgroundColor: color }, style]} />;
}

const styles = StyleSheet.create({
  particle: { position: 'absolute', left: 0, top: 0 },
});
