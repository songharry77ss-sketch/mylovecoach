import { Platform } from 'react-native';

/**
 * 나만의 연애코치 디자인 토큰.
 * 토스 UI 문법(넉넉한 여백, 큰 타이틀, 둥근 카드, 단색 CTA)을 따르되
 * 색상은 하늘색·연분홍 파스텔 톤으로 구성합니다.
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
    surface: palette.gray50,
    surfaceElevated: palette.white,
    surfaceSelected: palette.gray100,
    border: palette.gray100,
    text: palette.gray900,
    textSecondary: palette.gray600,
    textTertiary: palette.gray500,
    primary: palette.sky500,
    primarySoft: palette.sky50,
    primaryText: palette.white,
    accent: palette.pink400,
    accentSoft: palette.pink50,
    danger: palette.red500,
    success: palette.mint500,
    warning: palette.peach500,
    bubbleUser: palette.sky100,
    bubbleCoach: palette.white,
    tabBar: palette.white,
  },
  dark: {
    background: '#0F1419',
    surface: '#161C24',
    surfaceElevated: '#1C232D',
    surfaceSelected: '#242C37',
    border: '#242C37',
    text: '#F5F7FA',
    textSecondary: '#AEB7C2',
    textTertiary: '#7C8794',
    primary: palette.sky400,
    primarySoft: '#16324A',
    primaryText: palette.white,
    accent: palette.pink400,
    accentSoft: '#3A2230',
    danger: '#FF6B76',
    success: palette.mint500,
    warning: palette.peach500,
    bubbleUser: '#1E3A52',
    bubbleCoach: '#1C232D',
    tabBar: '#0F1419',
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
