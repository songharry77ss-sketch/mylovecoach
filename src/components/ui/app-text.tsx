import { Platform, Text, type TextProps, type TextStyle } from 'react-native';

import { Typography, type ThemeColorKey, type ThemeColors } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type TextVariant = keyof typeof Typography;

export interface AppTextProps extends TextProps {
  variant?: TextVariant;
  color?: ThemeColorKey | (string & {});
  align?: TextStyle['textAlign'];
  weight?: TextStyle['fontWeight'];
}

const isThemeKey = (c: string, theme: ThemeColors): c is ThemeColorKey => c in theme;

/** 한글이 단어 중간(「칼답하/면」)에서 줄바꿈되지 않게 — 웹은 keep-all, 아이폰은 hangul-word (1.4 개편, 앱 전체 기본값) */
const KEEP_WORDS = (Platform.OS === 'web' ? { wordBreak: 'keep-all', overflowWrap: 'anywhere' } : null) as TextStyle | null;

export function AppText({ variant = 'body', color = 'text', align, weight, style, ...rest }: AppTextProps) {
  const theme = useTheme();
  const resolved = isThemeKey(color, theme) ? theme[color] : color;
  return (
    <Text
      lineBreakStrategyIOS="hangul-word"
      {...rest}
      style={[Typography[variant], KEEP_WORDS, { color: resolved }, align ? { textAlign: align } : null, weight ? { fontWeight: weight } : null, style]}
    />
  );
}
