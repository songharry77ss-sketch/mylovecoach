/**
 * 떠 있는 유리 면 (1.2 개편 — 탭 바·채팅 입력창·스크롤 머리말이 같은 유리를 쓴다).
 * - 아이폰 iOS 26 이상: 시스템 유리(expo-glass-effect GlassView) — 뒤가 흐리게 비친다.
 * - 그 밖(안드로이드·예전 iOS·웹): 흐림을 못 하므로 불투명한 흰 면(다크는 짙은 남색) + 가는 테두리 + 위쪽 광택 + 떠 있는 그림자.
 * 이 파일은 reanimated 를 쓰지 않는다 (Screen 처럼 테스트에서 가볍게 불러오는 부품이 쓴다).
 */
import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useColorScheme } from '@/hooks/use-color-scheme';

type GlassModule = typeof import('expo-glass-effect');
let glassModule: GlassModule | null | undefined;

/** iOS 26 시스템 유리 모듈 — 없거나 예전 iOS 면 null */
export function liquidGlass(): GlassModule | null {
  if (glassModule !== undefined) return glassModule;
  glassModule = null;
  if (Platform.OS !== 'ios') return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('expo-glass-effect') as GlassModule;
    if (mod.isLiquidGlassAvailable()) glassModule = mod;
  } catch {
    glassModule = null;
  }
  return glassModule;
}

/**
 * 시스템 유리가 없을 때 쓰는 색 — 불투명. 흐림 없이 반투명으로 두면 뒤 글자가 생각보다 진하게 비친다
 * (웹·안드로이드 캡처에서 0.985 로도 아래 줄 글자가 뚜렷이 보였다). 유리 느낌은 위 광택·가는 테두리·그림자로 낸다.
 */
export function glassColors(dark: boolean) {
  return dark ? { fill: '#1C202E', edge: 'rgba(255,255,255,0.09)' } : { fill: '#FFFFFF', edge: 'rgba(25,31,40,0.07)' };
}

/** 떠 있는 유리 아래 그림자 */
export function glassShadow(dark: boolean): ViewStyle {
  return (
    Platform.select<ViewStyle>({
      ios: { shadowColor: '#1B2559', shadowOpacity: dark ? 0.4 : 0.12, shadowRadius: 18, shadowOffset: { width: 0, height: 8 } },
      android: { elevation: 10, shadowColor: '#1B2559' },
      default: { boxShadow: dark ? '0 8px 28px rgba(0,0,0,0.45)' : '0 8px 28px rgba(27,37,89,0.13)' } as ViewStyle,
    }) ?? {}
  );
}

interface GlassSurfaceProps {
  children?: ReactNode;
  /** 모서리 둥글기 (알약이면 높이의 절반) */
  radius?: number;
  style?: StyleProp<ViewStyle>;
  /** 떠 있는 그림자 (기본 true). 화면 끝에 붙는 머리말은 false */
  floating?: boolean;
  /** 시스템 유리를 손으로 누를 때 반응 (탭 바처럼 누르는 면) */
  interactive?: boolean;
  /** 테두리를 아래쪽만 (머리말) */
  edge?: 'all' | 'bottom' | 'none';
  testID?: string;
}

export function GlassSurface({ children, radius = 0, style, floating = true, interactive = false, edge = 'all', testID }: GlassSurfaceProps) {
  const dark = useColorScheme() === 'dark';
  const glass = liquidGlass();
  const c = glassColors(dark);
  const border: ViewStyle =
    edge === 'all'
      ? { borderWidth: StyleSheet.hairlineWidth, borderColor: c.edge }
      : edge === 'bottom'
        ? { borderBottomWidth: StyleSheet.hairlineWidth, borderColor: c.edge }
        : {};
  return (
    <View
      testID={testID}
      // 안드로이드는 배경색이 있어야 그림자(elevation)를 그린다
      style={[{ borderRadius: radius }, floating ? glassShadow(dark) : null, Platform.OS === 'android' && floating && !glass ? { backgroundColor: c.fill } : null, style]}>
      {glass ? (
        <glass.GlassView glassEffectStyle="regular" isInteractive={interactive} style={[StyleSheet.absoluteFill, { borderRadius: radius }]} />
      ) : (
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: radius, backgroundColor: c.fill, overflow: 'hidden' }, border]}>
          {!dark ? <LinearGradient colors={['rgba(255,255,255,0.9)', 'rgba(255,255,255,0)']} style={styles.sheen} /> : null}
        </View>
      )}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  sheen: { position: 'absolute', left: 0, right: 0, top: 0, height: '55%' },
});
