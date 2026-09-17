import { useState } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps, type ViewStyle } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { Radius, Spacing, Typography } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

interface TextFieldProps extends TextInputProps {
  label?: string;
  helper?: string;
  error?: string;
  containerStyle?: ViewStyle;
  right?: React.ReactNode;
}

export function TextField({ label, helper, error, containerStyle, right, style, multiline, ...rest }: TextFieldProps) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);
  const borderColor = error ? theme.danger : focused ? theme.primary : 'transparent';
  return (
    <View style={containerStyle}>
      {label ? (
        <AppText variant="smallStrong" color="textSecondary" style={styles.label}>
          {label}
        </AppText>
      ) : null}
      <View style={[styles.box, { backgroundColor: theme.surface, borderColor }, multiline ? styles.multi : null]}>
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
          style={[styles.input, Typography.body, { color: theme.text }, multiline ? styles.multiInput : null, style]}
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
  label: { marginBottom: Spacing.sm },
  box: {
    borderRadius: Radius.md,
    borderWidth: 1.5,
    paddingHorizontal: Spacing.lg,
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
  },
  multi: { alignItems: 'flex-start', paddingVertical: Spacing.md },
  input: { flex: 1, paddingVertical: Spacing.md },
  multiInput: { minHeight: 96, textAlignVertical: 'top', paddingVertical: 0 },
  helper: { marginTop: Spacing.sm, marginLeft: Spacing.xs },
});
