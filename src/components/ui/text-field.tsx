import { useState } from 'react';
import { Platform, StyleSheet, TextInput, View, type TextInputProps, type ViewStyle } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { useInsetFill } from '@/components/ui/list-group';
import { Radius, Spacing, Typography } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

interface TextFieldProps extends TextInputProps {
  label?: string;
  helper?: string;
  error?: string;
  containerStyle?: ViewStyle;
  right?: React.ReactNode;
}

/**
 * 입력칸 (1.2 개편) — 연회색 칸(높이 52·모서리 14), 누르면 흰 바탕 + 앱 색 테두리로 또렷하게.
 * 흰 카드(CardSection) 안에서도, 흰 화면에서도 같은 모양. 다크 모드는 카드보다 한 단계 밝은 칸.
 */
export function TextField({ label, helper, error, containerStyle, right, style, multiline, ...rest }: TextFieldProps) {
  const theme = useTheme();
  const fill = useInsetFill();
  const [focused, setFocused] = useState(false);
  const borderColor = error ? theme.danger : focused ? theme.primary : 'transparent';
  return (
    <View style={containerStyle}>
      {label ? (
        <AppText variant="smallStrong" color="textSecondary" style={styles.label}>
          {label}
        </AppText>
      ) : null}
      <View style={[styles.box, { backgroundColor: focused ? theme.card : fill, borderColor }, multiline ? styles.multi : null]}>
        <TextInput
          {...rest}
          multiline={multiline}
          onFocus={(e) => {
            setFocused(true);
            rest.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            rest.onBlur?.(e);
          }}
          placeholderTextColor={theme.textTertiary}
          style={[styles.input, Typography.body, styles.noOutline, { color: theme.text }, multiline ? styles.multiInput : null, style]}
        />
        {right}
      </View>
      {error ? (
        <AppText variant="caption" color="danger" style={styles.helper}>
          {error}
        </AppText>
      ) : helper ? (
        <AppText variant="caption" color="textTertiary" style={styles.helper}>
          {helper}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  label: { marginBottom: Spacing.sm, marginLeft: 2 },
  box: {
    borderRadius: Radius.md,
    borderWidth: 1.5,
    paddingHorizontal: Spacing.lg,
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
  },
  multi: { alignItems: 'flex-start', paddingVertical: Spacing.md },
  input: { flex: 1, paddingVertical: Spacing.md - 1 },
  // 웹 브라우저의 검은 포커스 테두리 대신 칸 테두리(파랑)로 초점을 보여 준다
  noOutline: Platform.select({ web: { outlineStyle: 'none' }, default: {} }) as object,
  multiInput: { minHeight: 96, textAlignVertical: 'top', paddingVertical: 0 },
  helper: { marginTop: Spacing.sm, marginHorizontal: Spacing.xs, lineHeight: 17 },
});
