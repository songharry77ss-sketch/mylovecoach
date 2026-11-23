import { Platform } from 'react-native';

/**
 * 센딧(나만의 연애 코치) 디자인 토큰 — 1.4 「깔끔하게」 개편 (2026-11-19, 11/12 회의 7번 「AI 느낌」).
 * 피클·토스 결: 흰 바탕 + 무채색 회색 면 + 거의 검정 글자, 색은 센딧 파랑 **한 가지를 단색으로** 화면의 한두 곳에만.
 * 그라데이션·파란 빛 그림자·떠다니는 3D 그림을 걷었다(「AI 티」의 대부분이 이것이었다 — docs/design/SENDIT_UI.md).
 * 분홍은 쓰지 않는다.
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
    // 회색 면은 무채색(피클 #F5F5F5 결) — 예전 #F2F4F6 은 푸른 기가 돌아 차가웠다
    surface: '#F4F4F6',
    surfaceElevated: palette.white,
    surfaceSelected: '#EDF0FE',
    border: '#E8E8EC',
    // 글자는 거의 검정, 보조 글자는 무채색 회색(흰 바탕 5.9:1) — 남색 잉크는 「앱 템플릿」 느낌이 났다
    text: '#141518',
    textSecondary: '#5E626B',
    // 옅은 글자도 4.5:1 을 넘게(예전 #8B95A1 은 3.0:1 — 동의 고지문까지 이 색이었다)
    textTertiary: '#737780',
    primary: palette.sendBlue500,
    primarySoft: '#EEF1FE',
    primaryText: palette.white,
    accent: palette.sendViolet500,
    accentSoft: '#F1EEFF',
    danger: palette.red500,
    // 글자로 쓰는 초록은 짙게(흰 바탕 4.6:1)
    success: '#14855A',
    warning: '#C2410C',
    // 내 말풍선 — 옅은 라벤더 블루 면 + 검정 글자(11/12 회의 9번 「보랏빛」을 바탕 대신 여기서 낸다)
    bubbleUser: '#E4E6FF',
    bubbleCoach: '#F4F4F6',
    tabBar: palette.white,
    // 11/12 회의 9번: 바탕에 아주 옅은 보랏빛 — 카드 화면(마이·설정·결제)에만. 대화·홈은 흰 바탕
    canvas: '#F6F6FA',
    card: palette.white,
    separator: '#EFEFF3',
  },
  dark: {
    background: '#0E0F12',
    surface: '#1A1B20',
    surfaceElevated: '#202128',
    surfaceSelected: '#232A45',
    border: '#2A2B32',
    text: '#F3F3F5',
    textSecondary: '#B1B3BB',
    textTertiary: '#8D9099',
    primary: '#7590FF',
    primarySoft: '#1B2140',
    primaryText: palette.white,
    accent: '#9C8CFF',
    accentSoft: '#231E45',
    danger: '#FF6B76',
    success: '#4CD69A',
    warning: '#FF9F5A',
    bubbleUser: '#2A2F5C',
    bubbleCoach: '#1A1B20',
    tabBar: '#0E0F12',
    canvas: '#0B0B0F',
    card: '#17181D',
    separator: '#26272E',
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
  /**
   * 1.4 개편: 크기는 조금만 키우고 위계는 굵기(700·600·400)와 회색으로 — 900·800 같은 아주 굵은 글자는 「AI 앱」 느낌의 큰 원인이었다.
   * 무대 화면(첫 화면·결제)의 큰 제목
   */
  hero: { fontSize: 28, lineHeight: 36, fontWeight: '700' as const, letterSpacing: -0.7 },
  display: { fontSize: 26, lineHeight: 34, fontWeight: '700' as const, letterSpacing: -0.6 },
  title1: { fontSize: 22, lineHeight: 30, fontWeight: '700' as const, letterSpacing: -0.4 },
  title2: { fontSize: 19, lineHeight: 26, fontWeight: '700' as const, letterSpacing: -0.3 },
  title3: { fontSize: 17, lineHeight: 24, fontWeight: '600' as const, letterSpacing: -0.2 },
  body: { fontSize: 16, lineHeight: 24, fontWeight: '400' as const, letterSpacing: -0.1 },
  bodyStrong: { fontSize: 16, lineHeight: 24, fontWeight: '600' as const, letterSpacing: -0.1 },
  small: { fontSize: 14, lineHeight: 20, fontWeight: '400' as const },
  smallStrong: { fontSize: 14, lineHeight: 20, fontWeight: '600' as const },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '500' as const },
} as const;

/**
 * 센딧 브랜드 색 — 1.4 개편부터 **단색**. 예전 이름(gradient·button·orb …)은 그대로 두고 값만 한 가지 색으로 바꿔
 * 남은 LinearGradient 들도 저절로 단색 면이 된다. 새 화면에서는 그라데이션을 만들지 말고 theme.primary / Brand.blue 를 쓴다.
 * 색 면 위 글자는 흰색(onBrand).
 */
const SOLID = palette.sendBlue500;
export const Brand = {
  /** 색 면(예전 그라데이션 카드) — 단색 */
  gradient: [SOLID, SOLID, SOLID] as [string, string, string],
  gradientBright: [SOLID, SOLID, SOLID] as [string, string, string],
  /** 떠 있는 둥근 버튼(탭 바 「새 채팅」·채팅 「보내기」) — 단색 */
  orb: [SOLID, SOLID, SOLID] as [string, string, string],
  /** 주요 버튼 — 단색 */
  button: [SOLID, SOLID, SOLID] as [string, string, string],
  /** 화면 바탕 — 흰색 한 가지(옅은 라벤더 그라데이션 바탕은 걷었다) */
  wash: ['#FFFFFF', '#FFFFFF', '#FFFFFF'] as [string, string, string],
  washDark: ['#0E0F12', '#0E0F12', '#0E0F12'] as [string, string, string],
  /** 색 면 위 글자 */
  onBrand: '#FFFFFF',
  onBrandDim: 'rgba(255,255,255,0.86)',
  onBrandFaint: 'rgba(255,255,255,0.7)',
  /** 색 면 위 반투명 칩 */
  glass: 'rgba(255,255,255,0.18)',
  glassBorder: 'rgba(255,255,255,0.32)',
  shadow: '#000000',
  sky: palette.sendSky,
  blue: SOLID,
  violet: palette.sendViolet500,
} as const;

/**
 * 예전 「파란 빛 그림자」 자리 — 1.4 개편에서 걷었다(네온 빛 번짐처럼 보였다). 색 면·버튼에는 그림자를 두지 않는다.
 * 떠 있는 것(탭 바·새 채팅 버튼)은 FloatShadow 를 쓴다.
 */
export const BrandShadow = {} as object;

/** 화면 위에 떠 있는 조작부(탭 바·새 채팅 버튼·시트) — 무채색 아주 옅게 */
export const FloatShadow = Platform.select({
  ios: { shadowColor: '#000000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 14 },
  android: { elevation: 4, shadowColor: '#000000' },
  default: { boxShadow: '0 4px 14px rgba(0,0,0,0.08)' },
}) as object;

export const Shadow = Platform.select({
  ios: { shadowColor: '#000000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 8 },
  android: { elevation: 1 },
  default: { boxShadow: '0 2px 8px rgba(0,0,0,0.04)' },
}) as object;

/** 흰 카드(canvas 위) — 그림자 없이 면으로만 나눈다(피클 결) */
export const CardShadow = {} as object;

export const MaxContentWidth = 640;

