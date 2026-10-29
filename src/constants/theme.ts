import { Platform } from 'react-native';

/**
 * 나만의 연애코치 디자인 토큰.
 * 토스 UI 문법(넉넉한 여백, 큰 타이틀, 둥근 카드, 단색 CTA)을 따르되,
 * 색은 스토어 상세 페이지와 같은 결 — 따뜻한 로즈 · 라벤더, 무대 화면은 에스프레소 바탕에 골드 강조.
 */
export const palette = {
  sky50: '#EEF7FF',
  sky100: '#D9EEFF',
  sky200: '#B5DDFF',
  sky300: '#8FCBFF',
  sky400: '#5FB4FA',
  sky500: '#3DA0F2',
  sky600: '#2A86D6',

  pink50: '#FFF1F5',
  pink100: '#FFE1E9',
  pink200: '#FFC5D4',
  pink300: '#FFA6BD',
  pink400: '#FF8AA8',
  pink500: '#F56C90',
  pink600: '#D9557A',

  lavender100: '#EDE9FF',
  lavender400: '#A594F9',
  mint100: '#E3F9F1',
  mint500: '#3CCB98',
  peach100: '#FFEFE3',
  peach500: '#FF9F5A',
  yellow100: '#FFF6D6',
  yellow500: '#F7C948',

  gray50: '#F9FAFB',
  gray100: '#F2F4F6',
  gray200: '#E5E8EB',
  gray300: '#D1D6DB',
  gray400: '#B0B8C1',
  gray500: '#8B95A1',
  gray600: '#6B7684',
  gray700: '#4E5968',
  gray800: '#333D4B',
  gray900: '#191F28',

  // 2026-10 개편: 스토어 상세 페이지와 같은 따뜻한 색
  rose50: '#FFF1F4',
  rose100: '#FFE0E8',
  rose200: '#FFC2D1',
  rose400: '#FF6B8A',
  rose500: '#E8436A',
  rose600: '#D9365F',
  violet50: '#F4F0FF',
  violet500: '#7C5CFA',
  gold100: '#FFF4D1',
  gold300: '#FFE08A',
  gold400: '#FFD666',
  gold500: '#F5B83D',
  espresso950: '#120A0C',
  espresso900: '#1C1113',
  espresso800: '#2B1B1D',
  espresso700: '#3B2628',
  espresso600: '#5A3E3F',

  white: '#FFFFFF',
  black: '#000000',
  red500: '#F04452',
} as const;

export interface ThemeColors {
  background: string;
  surface: string;
  surfaceElevated: string;
  surfaceSelected: string;
  border: string;
  text: string;
  textSecondary: string;
  textTertiary: string;
  primary: string;
  primarySoft: string;
  primaryText: string;
  accent: string;
  accentSoft: string;
  danger: string;
  success: string;
  warning: string;
  bubbleUser: string;
  bubbleCoach: string;
  tabBar: string;
}

export const Colors: Record<'light' | 'dark', ThemeColors> = {
  light: {
    background: palette.white,
    surface: '#FAF7F5',
    surfaceElevated: palette.white,
    surfaceSelected: '#F3EEEA',
    border: '#F0EAE6',
    text: '#1F1416',
    textSecondary: '#6B5D60',
    textTertiary: '#8F8285',
    primary: palette.rose600,
    primarySoft: palette.rose50,
    primaryText: palette.white,
    accent: palette.violet500,
    accentSoft: palette.violet50,
    danger: palette.red500,
    success: palette.mint500,
    warning: palette.peach500,
    bubbleUser: palette.rose100,
    bubbleCoach: palette.white,
    tabBar: palette.white,
  },
  dark: {
    background: palette.espresso950,
    surface: '#1C1315',
    surfaceElevated: '#24191B',
    surfaceSelected: '#2E2124',
    border: '#33252A',
    text: '#FBF5F3',
    textSecondary: '#C4B5B7',
    textTertiary: '#9A8A8D',
    primary: palette.rose400,
    primarySoft: '#3A1A24',
    primaryText: palette.white,
    accent: '#A594F9',
    accentSoft: '#2A2140',
    danger: '#FF6B76',
    success: palette.mint500,
    warning: palette.peach500,
    bubbleUser: '#3A1F28',
    bubbleCoach: '#24191B',
    tabBar: palette.espresso950,
  },
};

export type ThemeColorKey = keyof ThemeColors;

export const Fonts = Platform.select({
  ios: { sans: 'system-ui', rounded: 'ui-rounded', mono: 'ui-monospace' },
  default: { sans: 'normal', rounded: 'normal', mono: 'monospace' },
  web: { sans: 'system-ui, -apple-system, "Pretendard", sans-serif', rounded: 'system-ui', mono: 'monospace' },
});

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const Radius = {
  sm: 10,
  md: 14,
  lg: 20,
  xl: 28,
  pill: 999,
} as const;

export const Typography = {
  /** 무대 화면(첫 화면·홈 머리말·결제)의 큰 제목 — 스토어 이미지처럼 굵게 */
  hero: { fontSize: 34, lineHeight: 42, fontWeight: '900' as const, letterSpacing: -1.2 },
  display: { fontSize: 30, lineHeight: 40, fontWeight: '800' as const, letterSpacing: -0.5 },
  title1: { fontSize: 24, lineHeight: 32, fontWeight: '700' as const, letterSpacing: -0.4 },
  title2: { fontSize: 20, lineHeight: 28, fontWeight: '700' as const, letterSpacing: -0.3 },
  title3: { fontSize: 17, lineHeight: 24, fontWeight: '600' as const, letterSpacing: -0.2 },
  body: { fontSize: 16, lineHeight: 24, fontWeight: '400' as const, letterSpacing: -0.1 },
  bodyStrong: { fontSize: 16, lineHeight: 24, fontWeight: '600' as const, letterSpacing: -0.1 },
  small: { fontSize: 14, lineHeight: 20, fontWeight: '400' as const },
  smallStrong: { fontSize: 14, lineHeight: 20, fontWeight: '600' as const },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '500' as const },
} as const;

export const Shadow = Platform.select({
  ios: {
    shadowColor: '#1B2A3A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
  },
  android: { elevation: 2 },
  default: { boxShadow: '0 6px 16px rgba(27,42,58,0.06)' },
}) as object;

export const MaxContentWidth = 640;

/**
 * 무대 화면 — 스토어 상세 페이지와 같은 에스프레소 바탕 · 흰 글자 · 골드 강조.
 * 첫 화면 소개, 홈 머리말, 탐색, 결제처럼 「보여 주는」 화면에 쓴다 (채팅·설정은 밝은 화면 그대로).
 */
export const Stage = {
  /** 위에서 아래로 짙어지는 바탕 */
  bg: ['#33201F', '#1E1214', palette.espresso950] as [string, string, string],
  /** 따뜻한 조명 같은 은은한 빛 */
  glow: 'rgba(255, 176, 120, 0.22)',
  gold: palette.gold400,
  goldSoft: palette.gold300,
  text: '#FFFFFF',
  textDim: 'rgba(255,255,255,0.76)',
  textFaint: 'rgba(255,255,255,0.52)',
  chip: 'rgba(255,255,255,0.10)',
  chipBorder: 'rgba(255,255,255,0.18)',
  card: '#FFFFFF',
  cardText: palette.espresso800,
  /** 골드 버튼 위 글자 */
  onGold: palette.espresso800,
} as const;
