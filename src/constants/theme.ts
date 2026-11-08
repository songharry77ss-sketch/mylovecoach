import { Platform } from 'react-native';

/**
 * 센딧(나만의 연애 코치) 디자인 토큰 — 2026-11 개편.
 * 「럽코」 시안의 토스 결(흰 화면, 연회색 카드, 큰 한글·숫자, 한 가지 주요 행동)에
 * 앱 아이콘과 같은 하늘색 → 파랑 → 보라 그라데이션을 주인공 색으로 쓴다. 분홍은 쓰지 않는다.
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

  // 2026-11 센딧: 앱 아이콘 색
  sendSky: '#8AD8FF',
  sendSky50: '#EEF8FF',
  sendBlue300: '#9DB4FF',
  sendBlue400: '#5D86FF',
  sendBlue500: '#3D63F5',
  sendBlue600: '#2F4FE0',
  sendBlue700: '#2539B8',
  sendViolet400: '#9583FF',
  sendViolet500: '#7559F6',
  sendViolet600: '#5B42E0',
  sendInk: '#191F28',
  sendMist: '#F4F6FF',

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
  /** 카드가 놓이는 화면 바탕 (탭 화면·설정) — 토스처럼 옅은 회색 위에 흰 카드 (1.2 개편) */
  canvas: string;
  /** canvas 위에 놓는 카드 */
  card: string;
  /** 카드 안 줄 사이 가는 선 */
  separator: string;
}

export const Colors: Record<'light' | 'dark', ThemeColors> = {
  light: {
    background: palette.white,
    surface: palette.gray100,
    surfaceElevated: palette.white,
    surfaceSelected: '#E9EEFF',
    border: '#EBEEF2',
    text: palette.sendInk,
    textSecondary: '#5B6573',
    textTertiary: palette.gray500,
    primary: palette.sendBlue500,
    primarySoft: '#EDF1FF',
    primaryText: palette.white,
    accent: palette.sendViolet500,
    accentSoft: '#F1EEFF',
    danger: palette.red500,
    success: palette.mint500,
    warning: palette.peach500,
    bubbleUser: '#E6EDFF',
    bubbleCoach: palette.white,
    tabBar: palette.white,
    canvas: '#F3F5F9',
    card: palette.white,
    separator: '#EEF0F4',
  },
  dark: {
    background: '#0D1018',
    surface: '#161A24',
    surfaceElevated: '#1C2130',
    surfaceSelected: '#242B42',
    border: '#252B3A',
    text: '#F2F4F8',
    textSecondary: '#AEB6C4',
    textTertiary: '#7D8696',
    primary: '#6E8BFF',
    primarySoft: '#1A2247',
    primaryText: palette.white,
    accent: '#9C8CFF',
    accentSoft: '#231E45',
    danger: '#FF6B76',
    success: palette.mint500,
    warning: palette.peach500,
    bubbleUser: '#1E2A57',
    bubbleCoach: '#1C2130',
    tabBar: '#0D1018',
    canvas: '#0B0E15',
    card: '#161A24',
    separator: '#232938',
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

/**
 * 센딧 브랜드 — 앱 아이콘과 같은 그라데이션. 큰 카드·주요 버튼·숫자 강조에 쓴다.
 * 그라데이션 위 글자는 흰색(onBrand). 흰 바탕 위 강조 글자는 primary(파랑) 또는 accent(보라).
 */
export const Brand = {
  /**
   * 주인공 그라데이션 (왼쪽 위 → 오른쪽 아래): 파랑 → 보라. 글자가 놓이는 왼쪽 위에서도 흰 글자 대비 3.8:1 이상이 되게
   * 아이콘보다 조금 짙게 시작한다 — 아이콘의 하늘색은 카드 오른쪽 위 장식 빛(HeroCard)과 gradientBright 로 낸다
   */
  gradient: ['#3F7CF8', palette.sendBlue500, palette.sendViolet500] as [string, string, string],
  /** 글자가 없는 장식 면 — 아이콘과 같은 하늘색 시작 */
  gradientBright: ['#6FC8FF', palette.sendBlue500, palette.sendViolet500] as [string, string, string],
  /** 떠 있는 둥근 구슬(탭 바 「새 채팅」·채팅 「보내기」) — 위가 밝은 유리 구슬 */
  orb: ['#6B9BFF', palette.sendBlue500, '#5845EE'] as [string, string, string],
  /** 버튼처럼 좁은 면 — 흰 글자가 또렷하게 */
  button: ['#4A78FB', palette.sendBlue500, '#6A55F2'] as [string, string, string],
  /** 화면 바탕의 옅은 빛 (스플래시와 같은 흰색 → 옅은 라벤더) */
  wash: ['#FFFFFF', '#F3F5FF', '#ECEFFF'] as [string, string, string],
  washDark: ['#0D1018', '#111528', '#151A36'] as [string, string, string],
  /** 그라데이션 위 글자 */
  onBrand: '#FFFFFF',
  onBrandDim: 'rgba(255,255,255,0.82)',
  onBrandFaint: 'rgba(255,255,255,0.62)',
  /** 그라데이션 위 반투명 칩·장식 */
  glass: 'rgba(255,255,255,0.18)',
  glassBorder: 'rgba(255,255,255,0.32)',
  /** 그라데이션 버튼·카드 아래 퍼지는 그림자 색 */
  shadow: '#3D4FE8',
  sky: palette.sendSky,
  blue: palette.sendBlue500,
  violet: palette.sendViolet500,
} as const;

/** 그라데이션 버튼·카드 아래 은은한 파란 그림자 */
export const BrandShadow = Platform.select({
  ios: { shadowColor: Brand.shadow, shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.28, shadowRadius: 18 },
  android: { elevation: 8, shadowColor: Brand.shadow },
  default: { boxShadow: '0 10px 24px rgba(61,79,232,0.28)' },
}) as object;

export const Shadow = Platform.select({
  ios: {
    shadowColor: '#1B2A5A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
  },
  android: { elevation: 2 },
  default: { boxShadow: '0 6px 16px rgba(27,42,58,0.06)' },
}) as object;

/** 흰 카드(canvas 위)의 아주 옅은 그림자 — 다크 모드에서는 쓰지 않고 가는 테두리로 */
export const CardShadow = Platform.select({
  ios: { shadowColor: '#1B2559', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 14 },
  android: { elevation: 1 },
  default: { boxShadow: '0 4px 14px rgba(27,37,89,0.05)' },
}) as object;

export const MaxContentWidth = 640;

