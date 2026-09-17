import { type PropsWithChildren } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View, type ScrollViewProps, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

interface ScreenProps extends PropsWithChildren {
  /** 스크롤 가능 여부 (기본 true) */
  scroll?: boolean;
  padded?: boolean;
  /** 상단 safe area 포함 여부 (헤더가 있는 스택 화면은 false) */
  safeTop?: boolean;
  safeBottom?: boolean;
  keyboard?: boolean;
  style?: ViewStyle;
  contentStyle?: ViewStyle;
  scrollProps?: ScrollViewProps;
  background?: string;
}

export function Screen({
  children,
  scroll = true,
  padded = true,
  safeTop = false,
  safeBottom = true,
  keyboard = false,
  style,
  contentStyle,
  scrollProps,
  background,
}: ScreenProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const paddingStyle: ViewStyle = {
    paddingTop: safeTop ? insets.top + Spacing.sm : 0,
    paddingBottom: safeBottom ? insets.bottom + Spacing.lg : 0,
    paddingHorizontal: padded ? Spacing.lg : 0,
  };
  const body = scroll ? (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      contentContainerStyle={[styles.content, paddingStyle, contentStyle]}
      {...scrollProps}>
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.content, paddingStyle, contentStyle]}>{children}</View>
  );

  const wrapped = keyboard ? (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {body}
    </KeyboardAvoidingView>
  ) : (
    body
  );

  return <View style={[styles.flex, { backgroundColor: background ?? theme.background }, style]}>{wrapped}</View>;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { flexGrow: 1, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
});
