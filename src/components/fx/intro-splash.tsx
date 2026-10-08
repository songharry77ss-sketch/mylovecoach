import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useMemo, useRef } from 'react';
import { Image, Platform, Pressable, StyleSheet, View } from 'react-native';
import Animated, { Easing, Extrapolation, interpolate, ReduceMotion, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';

import { palette } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

/**
 * 앱을 켤 때 나오는 로고 인트로.
 * 네이티브 스플래시(app.json 의 expo-splash-screen — 같은 배경색·같은 로고·같은 크기·같은 위치)와 첫 화면이 똑같아서 끊김 없이 이어진다.
 * 로고가 살짝 움츠렸다 두근 튀어 오르면서 빛이 번지고 물결이 퍼지고 하트·반짝이가 터진 뒤,
 * 로고 위로 빛이 한 번 스치고 별이 반짝, 로고가 올라가며 앱 이름이 한 글자씩 올라온다. 저장소를 다 읽으면 살짝 커지며 사라진다.
 * 탭하면 건너뛴다(저장소를 다 읽은 뒤). 「동작 줄이기」를 켠 기기에서는 움직임 없이 짧게 보여 준다.
 */

/** 네이티브 스플래시 배경 (app.json expo-splash-screen 의 backgroundColor · dark.backgroundColor 와 같아야 한다 — 테스트로 확인) */
export const SPLASH_BACKGROUND = { light: '#EEF7FF', dark: '#0F1419' } as const;
/** 네이티브 스플래시 로고 폭 (app.json imageWidth) */
export const SPLASH_LOGO_SIZE = 160;

// splash-icon.png(512px)를 160 으로 줄였을 때: 둥근 사각형 17.5~142.5(모서리 약 29), 보라 별 중심 (99.8, 75.5)
const SQUARE = { inset: 17.5, size: 125, radius: 29 };
const STAR = { x: 99.8, y: 75.5 };

/** 타임라인 (ms) — 하나의 시계(clock)로 모든 움직임을 맞춘다 */
const T = {
  hold: 120,
  squash: 220,
  pop: 720,
  ripples: [230, 350, 470],
  rippleDur: 820,
  burst: 240,
  shine: [520, 1000] as const,
  twinkle: [880, 1320] as const,
  twinkle2: [1040, 1440] as const,
  lift: [680, 1080] as const,
  title: 760,
  letterGap: 55,
  letterDur: 440,
  tagline: [1180, 1580] as const,
  end: 1650,
};
/** 최소 노출 시간 — 이 뒤에 저장소까지 읽혔으면 닫는다 */
export const INTRO_MIN_MS = 1900;
const REDUCED_MIN_MS = 900;
/** 사라지는 시간 */
export const INTRO_EXIT_MS = 420;
/** 저장소가 늦어도 이만큼 지나면 닫는다 */
const MAX_WAIT_MS = 5000;
/** 로고 이미지가 늦게 뜨면 이만큼 기다린 뒤 그냥 시작 */
const IMAGE_WAIT_MS = 450;
/** 로고가 올라가는 거리 (아래에 앱 이름이 들어올 자리) */
const LIFT = 44;

const TITLE = '나만의 연애코치';
const TAGLINE = '캡처 한 장으로 완성하는 답장';
/** 「연애코치」 글자는 로고처럼 파랑 → 보라로 */
const TITLE_ACCENT = ['#4F8FF6', '#6487F5', '#7D82F6', '#9A7CF8'];

const logoImage = require('../../../assets/images/splash-icon.png');

/** 빛 번짐은 boxShadow 로 그린다 — 안드로이드 9(API 28) 미만은 바깥 그림자를 못 그려 딱딱한 원만 남으므로 그리지 않는다 */
const GLOW_SUPPORTED = Platform.OS !== 'android' || Number(Platform.Version) >= 28;
/** 동작 줄이기는 위에서 직접 다룬다(움직임 없이 불투명도만) — Reanimated 가 시스템 설정을 보고 애니메이션을 건너뛰지 않게 */
const TIMING = { easing: Easing.linear, reduceMotion: ReduceMotion.Never };

// ── 시간·완급 (UI 스레드에서 도는 함수) ─────────────────────

/** 구간 진행률 0~1 */
function seg(ms: number, from: number, to: number) {
  'worklet';
  return Math.min(1, Math.max(0, (ms - from) / (to - from)));
}
function easeOutCubic(x: number) {
  'worklet';
  return 1 - Math.pow(1 - x, 3);
}
function easeInCubic(x: number) {
  'worklet';
  return x * x * x;
}
function easeInOutCubic(x: number) {
  'worklet';
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}
function easeOutBack(x: number) {
  'worklet';
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
}

// ── 터지는 조각 (항상 같은 모양이 나오도록 고정 난수) ─────────

type PieceKind = 'heart' | 'sparkle' | 'dot';
export interface Piece {
  kind: PieceKind;
  angle: number;
  distance: number;
  size: number;
  delay: number;
  duration: number;
  spin: number;
  color: string;
}

function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PIECE_COLORS: Record<PieceKind, { light: string[]; dark: string[] }> = {
  heart: { light: [palette.pink400, palette.pink500, palette.pink300], dark: [palette.pink400, palette.pink300, '#FF7DA0'] },
  sparkle: { light: [palette.lavender400, palette.sky400, palette.yellow500], dark: [palette.lavender400, palette.sky300, palette.yellow500, palette.white] },
  dot: { light: [palette.sky300, palette.pink200, palette.lavender400], dark: [palette.sky400, palette.pink300, palette.lavender400] },
};

/** 로고 둘레로 고르게 퍼지는 조각 목록 */
export function makePieces(scheme: 'light' | 'dark', count = 18, seed = 7): Piece[] {
  const rand = seeded(seed);
  const kinds: PieceKind[] = ['heart', 'sparkle', 'dot', 'sparkle', 'heart', 'dot'];
  return Array.from({ length: count }, (_, i) => {
    const kind = kinds[i % kinds.length];
    const colors = PIECE_COLORS[kind][scheme];
    const angle = (i / count) * Math.PI * 2 - Math.PI / 2 + (rand() - 0.5) * 0.5;
    // 아래로 가는 조각은 덜 멀리 — 곧 앱 이름이 올라올 자리를 어지럽히지 않게
    const below = Math.sin(angle) > 0.35;
    return {
      kind,
      angle,
      distance: below ? 85 + rand() * 50 : 105 + rand() * 85,
      size: kind === 'dot' ? 6 + rand() * 5 : kind === 'heart' ? 13 + rand() * 9 : 12 + rand() * 10,
      delay: rand() * 140,
      duration: 950 + rand() * 300,
      spin: (rand() - 0.5) * (kind === 'sparkle' ? 260 : 120),
      color: colors[Math.floor(rand() * colors.length)],
    };
  });
}

// ── 화면 ────────────────────────────────────────────────

export interface IntroSplashProps {
  /** 저장소를 다 읽었는지 — 읽기 전에는 닫지 않는다 */
  ready: boolean;
  /** 첫 화면(네이티브 스플래시와 같은 로고)을 그렸을 때 — 여기서 네이티브 스플래시를 내린다 */
  onShown?: () => void;
  /** 로고가 두근 튀어 오르는 순간 (진동용) */
  onBeat?: () => void;
  /** 다 사라졌을 때 — 여기서 화면에서 뺀다 */
  onDone: () => void;
}

export function IntroSplash({ ready, onShown, onBeat, onDone }: IntroSplashProps) {
  const scheme = useColorScheme();
  const reduced = useReducedMotion();
  const clock = useSharedValue(0);
  const exit = useSharedValue(0);
  const pieces = useMemo(() => makePieces(scheme), [scheme]);

  // 콜백은 최신 것을 쓰되 타이머는 한 번만 건다
  const cb = useRef({ onShown, onBeat, onDone });
  cb.current = { onShown, onBeat, onDone };
  const state = useRef({ started: false, minPassed: false, skipped: false, leaving: false, ready });
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const later = (fn: () => void, ms: number) => timers.current.push(setTimeout(fn, ms));

  const leave = () => {
    const s = state.current;
    if (s.leaving) return;
    s.leaving = true;
    // 완급은 사라지는 순서(로고·이름 먼저 → 배경)마다 따로 준다
    exit.value = withTiming(1, { ...TIMING, duration: reduced ? 260 : INTRO_EXIT_MS });
    later(() => cb.current.onDone(), (reduced ? 260 : INTRO_EXIT_MS) + 40);
  };
  const maybeLeave = () => {
    const s = state.current;
    if (s.ready && (s.minPassed || s.skipped)) leave();
  };

  const start = () => {
    const s = state.current;
    if (s.started || s.leaving) return;
    s.started = true;
    // 로고가 그려졌으니 네이티브 스플래시를 내리고(같은 그림이라 바뀌는 순간이 보이지 않음), 바로 그 시점부터 시계를 돌린다 —
    // 처음 T.hold(0.12초)는 정지 화면이라 스플래시가 내려가는 동안 움직임이 겹치지 않는다
    cb.current.onShown?.();
    clock.value = withTiming(T.end, { ...TIMING, duration: T.end });
    if (!reduced) later(() => {
      if (!state.current.leaving) cb.current.onBeat?.();
    }, T.ripples[0]);
    later(() => {
      state.current.minPassed = true;
      maybeLeave();
    }, reduced ? REDUCED_MIN_MS : INTRO_MIN_MS);
  };

  useEffect(() => {
    // 로고 이미지가 늦게 뜨는 기기에서도 멈추지 않게
    later(start, IMAGE_WAIT_MS);
    // 저장소가 끝내 안 읽혀도 화면을 연다 (처음 띄운 때부터 셈)
    later(leave, MAX_WAIT_MS);
    const list = timers.current;
    return () => list.forEach(clearTimeout);
    // 처음 한 번만
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    state.current.ready = ready;
    maybeLeave();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  const skip = () => {
    state.current.skipped = true;
    maybeLeave();
  };

  const bg = SPLASH_BACKGROUND[scheme];
  const dark = scheme === 'dark';

  // 사라질 때: 로고·이름이 먼저 커지며 사라지고, 그다음 배경이 걷힌다 — 인트로 글자와 앱 화면 글자가 겹쳐 보이지 않게
  const overlayStyle = useAnimatedStyle(() => ({ opacity: 1 - easeInCubic(seg(exit.value, 0.3, 1)) }));
  const stageStyle = useAnimatedStyle(() => {
    const lift = reduced ? 0 : LIFT * easeInOutCubic(seg(clock.value, T.lift[0], T.lift[1]));
    const e = exit.value;
    return {
      opacity: 1 - easeInCubic(seg(e, 0, 0.5)),
      transform: [{ translateY: -lift - 6 * e }, { scale: 1 + (reduced ? 0 : 0.14 * easeOutCubic(e)) }],
    };
  });
  const logoStyle = useAnimatedStyle(() => {
    if (reduced) return { transform: [{ scale: 1 }] };
    const ms = clock.value;
    const scale = interpolate(ms, [0, T.hold, T.squash, 380, 520, 640, T.pop], [1, 1, 0.9, 1.13, 0.97, 1.015, 1], Extrapolation.CLAMP);
    const tilt = interpolate(ms, [T.squash, 380, 520, T.pop], [0, -5, 2, 0], Extrapolation.CLAMP);
    return { transform: [{ scale }, { rotate: `${tilt}deg` }] };
  });

  return (
    // 화면 낭독기: 인트로가 떠 있는 동안은 이 덮개만 읽게 하고(iOS accessibilityViewIsModal, 안드로이드는 _layout 이 아래 화면을 숨김),
    // 그림·글자 층은 숨겨 앱 이름을 한 글자씩 따로 읽지 않게 한다 — 건너뛰기 버튼 이름이 앱 이름을 대신 읽는다
    <Animated.View accessibilityViewIsModal pointerEvents="auto" style={[StyleSheet.absoluteFill, styles.root, { backgroundColor: bg }, overlayStyle]}>
      <Pressable style={StyleSheet.absoluteFill} onPress={skip} accessibilityRole="button" accessibilityLabel={`${TITLE}, ${TAGLINE}. 누르면 바로 시작해요`} />
      <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.center}>
        <Animated.View style={[styles.stage, stageStyle]}>
          {reduced ? null : (
            <>
              {GLOW_SUPPORTED ? (
                <>
                  <Glow clock={clock} exit={exit} color={dark ? 'rgba(84,140,255,0.55)' : 'rgba(120,170,255,0.45)'} size={92} dx={0} dy={0} from={200} drift={[0, -6]} />
                  <Glow clock={clock} exit={exit} color={dark ? 'rgba(160,130,255,0.5)' : 'rgba(170,150,252,0.38)'} size={70} dx={34} dy={26} from={300} drift={[10, 6]} />
                  <Glow clock={clock} exit={exit} color={dark ? 'rgba(255,120,170,0.35)' : 'rgba(255,150,185,0.3)'} size={56} dx={-38} dy={-22} from={380} drift={[-8, -6]} />
                </>
              ) : null}
              {T.ripples.map((startAt, i) => (
                <Ripple key={startAt} clock={clock} startAt={startAt} color={[palette.sky400, palette.lavender400, palette.pink400][i]} />
              ))}
              {pieces.map((p, i) => (
                <PieceView key={i} piece={p} clock={clock} />
              ))}
            </>
          )}
          <Animated.View style={[styles.logo, logoStyle]}>
            <Image source={logoImage} style={styles.logoImage} fadeDuration={0} onLoad={start} accessibilityIgnoresInvertColors />
            {reduced ? null : (
              <>
                <Shine clock={clock} />
                <Twinkle clock={clock} at={T.twinkle} x={STAR.x} y={STAR.y} size={30} />
                <Twinkle clock={clock} at={T.twinkle2} x={SQUARE.inset + SQUARE.size - 6} y={SQUARE.inset + 4} size={20} />
              </>
            )}
          </Animated.View>
          <View style={styles.titleBlock}>
            <View style={styles.titleRow}>
              {Array.from(TITLE).map((ch, i) => (
                <Letter key={i} ch={ch} index={i} clock={clock} reduced={reduced} color={i >= 4 ? TITLE_ACCENT[i - 4] : dark ? palette.white : palette.gray900} />
              ))}
            </View>
            <Tagline clock={clock} reduced={reduced} color={dark ? palette.gray400 : palette.gray600} />
          </View>
        </Animated.View>
      </View>
    </Animated.View>
  );
}

/** 로고 뒤로 번지는 빛 — 작은 원의 큰 그림자(boxShadow)로 부드러운 빛을 만든다 (그림자를 못 그리는 안드로이드 9 미만에서는 그리지 않음 — GLOW_SUPPORTED) */
function Glow({ clock, exit, color, size, dx, dy, from, drift }: { clock: SharedValue<number>; exit: SharedValue<number>; color: string; size: number; dx: number; dy: number; from: number; drift: [number, number] }) {
  const style = useAnimatedStyle(() => {
    const p = seg(clock.value, from, from + 700);
    const settle = seg(clock.value, from + 700, T.end);
    const d = easeInOutCubic(seg(clock.value, from, T.end));
    return {
      opacity: easeOutCubic(p) * (1 - 0.2 * settle),
      transform: [{ translateX: dx + drift[0] * d }, { translateY: dy + drift[1] * d }, { scale: (0.4 + 0.75 * easeOutCubic(p) - 0.1 * settle) * (1 + 0.35 * exit.value) }],
    };
  });
  return (
    <Animated.View
      style={[
        styles.glow,
        { width: size, height: size, borderRadius: size / 2, marginLeft: -size / 2, marginTop: -size / 2, backgroundColor: color, boxShadow: `0 0 ${size}px ${size * 0.7}px ${color}` },
        style,
      ]}
    />
  );
}

/** 로고 모양(둥근 사각형) 물결 */
function Ripple({ clock, startAt, color }: { clock: SharedValue<number>; startAt: number; color: string }) {
  const style = useAnimatedStyle(() => {
    const p = seg(clock.value, startAt, startAt + T.rippleDur);
    // 빨리 옅어지게 (제곱) — 앱 이름이 올라올 때는 거의 남지 않는다
    return { opacity: p > 0 && p < 1 ? 0.6 * (1 - p) * (1 - p) : 0, transform: [{ scale: 1 + 1.35 * easeOutCubic(p) }] };
  });
  return <Animated.View style={[styles.ripple, { borderColor: color }, style]} />;
}

function PieceView({ piece, clock }: { piece: Piece; clock: SharedValue<number> }) {
  const { angle, distance, size, delay, duration, spin, kind } = piece;
  const style = useAnimatedStyle(() => {
    const p = seg(clock.value, T.burst + delay, T.burst + delay + duration);
    const r = distance * easeOutCubic(p);
    // 하트는 살짝 떠오른다
    const float = kind === 'heart' ? -22 * p : 0;
    return {
      opacity: interpolate(p, [0, 0.06, 0.55, 1], [0, 1, 1, 0], Extrapolation.CLAMP),
      transform: [
        { translateX: Math.cos(angle) * r - size / 2 },
        { translateY: Math.sin(angle) * r + float - size / 2 },
        { scale: interpolate(p, [0, 0.2, 1], [0.3, 1.12, 0.85], Extrapolation.CLAMP) },
        { rotate: `${spin * p}deg` },
      ],
    };
  });
  return (
    <Animated.View style={[styles.piece, style]}>
      {kind === 'heart' ? <Heart size={size} color={piece.color} /> : kind === 'sparkle' ? <Sparkle size={size} color={piece.color} /> : <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: piece.color }} />}
    </Animated.View>
  );
}

/** 로고 위로 한 번 스치는 빛 (둥근 사각형 안으로 잘라서) */
function Shine({ clock }: { clock: SharedValue<number> }) {
  const style = useAnimatedStyle(() => {
    const p = seg(clock.value, T.shine[0], T.shine[1]);
    return { opacity: p > 0 && p < 1 ? 1 : 0, transform: [{ translateX: -120 + 250 * easeInOutCubic(p) }, { rotate: '22deg' }] };
  });
  return (
    <View pointerEvents="none" style={styles.shineClip}>
      <Animated.View style={[styles.shineBar, style]}>
        <LinearGradient colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.6)', 'rgba(255,255,255,0)']} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={StyleSheet.absoluteFill} />
      </Animated.View>
    </View>
  );
}

/** 별이 반짝 */
function Twinkle({ clock, at, x, y, size }: { clock: SharedValue<number>; at: readonly [number, number]; x: number; y: number; size: number }) {
  const style = useAnimatedStyle(() => {
    const p = seg(clock.value, at[0], at[1]);
    return {
      opacity: p > 0 && p < 1 ? 1 : 0,
      transform: [{ scale: interpolate(p, [0, 0.45, 1], [0, 1.25, 0], Extrapolation.CLAMP) }, { rotate: `${90 * p}deg` }],
    };
  });
  return (
    <Animated.View style={[styles.twinkle, { left: x - size / 2, top: y - size / 2, width: size, height: size }, style]}>
      <Sparkle size={size} color={palette.white} glow />
    </Animated.View>
  );
}

function Letter({ ch, index, clock, reduced, color }: { ch: string; index: number; clock: SharedValue<number>; reduced: boolean; color: string }) {
  const style = useAnimatedStyle(() => {
    if (reduced) {
      const p = seg(clock.value, 150, 450);
      return { opacity: p };
    }
    const from = T.title + index * T.letterGap;
    const p = seg(clock.value, from, from + T.letterDur);
    return {
      opacity: Math.min(1, p * 1.8),
      transform: [{ translateY: 18 * (1 - easeOutBack(p)) }, { scale: 0.85 + 0.15 * easeOutCubic(p) }],
    };
  });
  if (ch === ' ') return <View style={styles.space} />;
  // 스플래시를 이어 받는 화면이라 시스템 큰 글자를 따르지 않는다 (한 줄로 이어 붙인 글자라 커지면 화면 밖으로 잘림)
  return (
    <Animated.Text allowFontScaling={false} style={[styles.letter, { color }, style]}>
      {ch}
    </Animated.Text>
  );
}

function Tagline({ clock, reduced, color }: { clock: SharedValue<number>; reduced: boolean; color: string }) {
  const style = useAnimatedStyle(() => {
    const p = reduced ? seg(clock.value, 250, 550) : easeOutCubic(seg(clock.value, T.tagline[0], T.tagline[1]));
    return { opacity: p, transform: [{ translateY: reduced ? 0 : 10 * (1 - p) }] };
  });
  return (
    <Animated.Text maxFontSizeMultiplier={1.3} style={[styles.tagline, { color }, style]}>
      {TAGLINE}
    </Animated.Text>
  );
}

/** 하트 — 45° 돌린 사각형 + 원 두 개 */
function Heart({ size, color }: { size: number; color: string }) {
  const a = size * 0.58;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: a, height: a, marginTop: size * 0.18, transform: [{ rotate: '45deg' }] }}>
        <View style={{ position: 'absolute', width: a, height: a, backgroundColor: color }} />
        <View style={{ position: 'absolute', left: -a / 2, width: a, height: a, borderRadius: a / 2, backgroundColor: color }} />
        <View style={{ position: 'absolute', top: -a / 2, width: a, height: a, borderRadius: a / 2, backgroundColor: color }} />
      </View>
    </View>
  );
}

/** 네 갈래 반짝이 — 가늘게 누른 마름모 두 개를 겹친다 */
function Sparkle({ size, color, glow }: { size: number; color: string; glow?: boolean }) {
  const d = size / Math.SQRT2;
  const diamond = { position: 'absolute' as const, width: d, height: d, backgroundColor: color, borderRadius: d * 0.12 };
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      {glow ? <View style={{ position: 'absolute', width: size * 0.3, height: size * 0.3, borderRadius: size, backgroundColor: color, boxShadow: `0 0 ${size * 0.5}px ${size * 0.2}px rgba(255,255,255,0.9)` }} /> : null}
      <View style={[diamond, { transform: [{ scaleX: 0.34 }, { rotate: '45deg' }] }]} />
      <View style={[diamond, { transform: [{ scaleY: 0.34 }, { rotate: '45deg' }] }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { zIndex: 1000, elevation: 1000 },
  center: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  stage: { width: SPLASH_LOGO_SIZE, height: SPLASH_LOGO_SIZE },
  logo: { width: SPLASH_LOGO_SIZE, height: SPLASH_LOGO_SIZE },
  logoImage: { width: SPLASH_LOGO_SIZE, height: SPLASH_LOGO_SIZE },
  glow: { position: 'absolute', left: SPLASH_LOGO_SIZE / 2, top: SPLASH_LOGO_SIZE / 2 },
  ripple: {
    position: 'absolute',
    left: SQUARE.inset,
    top: SQUARE.inset,
    width: SQUARE.size,
    height: SQUARE.size,
    borderRadius: SQUARE.radius,
    borderWidth: 2,
  },
  piece: { position: 'absolute', left: SPLASH_LOGO_SIZE / 2, top: SPLASH_LOGO_SIZE / 2 },
  shineClip: {
    position: 'absolute',
    left: SQUARE.inset,
    top: SQUARE.inset,
    width: SQUARE.size,
    height: SQUARE.size,
    borderRadius: SQUARE.radius,
    overflow: 'hidden',
  },
  shineBar: { position: 'absolute', top: -50, left: 30, width: 56, height: SQUARE.size + 100 },
  twinkle: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  titleBlock: { position: 'absolute', top: SPLASH_LOGO_SIZE + 6, left: SPLASH_LOGO_SIZE / 2 - 170, width: 340, alignItems: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'flex-end' },
  letter: { fontSize: 30, lineHeight: 40, fontWeight: '800', letterSpacing: -0.6 },
  space: { width: 8 },
  tagline: { marginTop: 6, fontSize: 15, lineHeight: 22, fontWeight: '500', letterSpacing: -0.2 },
});
