import { Text, type TextProps, type TextStyle } from 'react-native';

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

export function AppText({ variant = 'body', color = 'text', align, weight, style, ...rest }: AppTextProps) {
  const theme = useTheme();
  const resolved = isThemeKey(color, theme) ? theme[color] : color;
  return (
    <Text
      {...rest}
      style={[Typography[variant], { color: resolved }, align ? { textAlign: align } : null, weight ? { fontWeight: weight } : null, style]}
    />
  );
}
