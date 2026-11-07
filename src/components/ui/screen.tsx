import { useCallback, useEffect, useRef, useState, type PropsWithChildren } from 'react';
import { Dimensions, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View, type NativeScrollEvent, type NativeSyntheticEvent, type ScrollViewProps, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTabBarSpace } from '@/components/ui/tab-bar-space';
import { FocusStatusBar, StatusBarScrim, useScrolledPast } from '@/components/ui/system-bars';
import { Brand, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

interface ScreenProps extends PropsWithChildren {
  /** 스크롤 가능 여부 (기본 true) */
  scroll?: boolean;
  padded?: boolean;
  /** 상단 safe area 포함 여부 (헤더가 있는 스택 화면은 false) */
  safeTop?: boolean;
  safeBottom?: boolean;
  /** 탭 화면 — 떠 있는 유리 탭 바(+ 기기 아래 영역)만큼 아래를 비운다 */
  tab?: boolean;
  /** 모달로 뜨는 화면 — 아이폰에서는 상태 표시줄 아래에서 올라오는 카드라 위를 상태 표시줄만큼 띄우지 않는다 */
  sheet?: boolean;
  /** 맨 위가 그라데이션 면인 화면 — 상태 표시줄 글자를 흰색으로, 스크롤하면 그 뒤에 파란 띠를 깐다 */
  stage?: boolean;
  keyboard?: boolean;
  style?: ViewStyle;
  contentStyle?: ViewStyle;
  scrollProps?: ScrollViewProps;
  background?: string;
}

/** 이 화면의 위 시스템 영역 — 아이폰 모달(카드)은 상태 표시줄 아래에서 시작하므로 0 */
export function useScreenTopInset(sheet = false) {
  const insets = useSafeAreaInsets();
  return sheet && Platform.OS === 'ios' ? 0 : insets.top;
}

export function Screen({
  children,
  scroll = true,
  padded = true,
  safeTop = false,
  safeBottom = true,
  tab = false,
  sheet = false,
  stage = false,
  keyboard = false,
  style,
  contentStyle,
  scrollProps,
  background,
}: ScreenProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  // 떠 있는 유리 탭 바(glass-tab-bar)에 마지막 내용이 가리지 않게
  const tabSpace = useTabBarSpace();
  const top = useScreenTopInset(sheet);
  const { scrolled, onScroll } = useScrolledPast();
  const paddingStyle: ViewStyle = {
    paddingTop: safeTop ? top + Spacing.sm : 0,
    paddingBottom: tab ? tabSpace : safeBottom ? insets.bottom + Spacing.lg : 0,
    paddingHorizontal: padded ? Spacing.lg : 0,
  };

  // 키보드를 피할 때 이 화면이 창의 어디서 시작하는지(헤더 높이)를 알아야 정확히 올린다.
  // 안드로이드도 화면을 끝까지 쓰는(edge-to-edge) 방식이라 창이 저절로 줄지 않아 같은 계산을 쓴다.
  const rootRef = useRef<View>(null);
  const [keyboardOffset, setKeyboardOffset] = useState(0);
  const measure = useCallback(() => {
    rootRef.current?.measureInWindow?.((_x, y, _w, h) => {
      // 아이폰 모달(카드) 안에서는 창 기준 위치가 카드 시작만큼 덜 잡힌다 — 카드 바닥이 화면 바닥과 같으니 높이로 거꾸로 구한다
      const top = sheet && Platform.OS === 'ios' && typeof h === 'number' && h > 0 ? Dimensions.get('window').height - h : y;
      if (typeof top === 'number' && Number.isFinite(top)) setKeyboardOffset(Math.max(0, top));
    });
  }, [sheet]);
  useEffect(() => {
    if (!keyboard) return;
    // 모달은 올라오는 동안 위치가 바뀌므로 자리 잡은 뒤에 다시 잰다
    const timers = [setTimeout(measure, 250), setTimeout(measure, 700)];
    return () => timers.forEach(clearTimeout);
  }, [keyboard, measure]);

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    onScroll(e);
    scrollProps?.onScroll?.(e);
  };

  const body = scroll ? (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      contentContainerStyle={[styles.content, paddingStyle, contentStyle]}
      scrollEventThrottle={32}
      {...scrollProps}
      onScroll={handleScroll}>
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.content, paddingStyle, contentStyle]}>{children}</View>
  );

  const wrapped = keyboard ? (
    <KeyboardAvoidingView style={styles.flex} behavior="padding" keyboardVerticalOffset={keyboardOffset}>
      {body}
    </KeyboardAvoidingView>
  ) : (
    body
  );

  const bg = background ?? theme.background;
  return (
    <View ref={rootRef} onLayout={keyboard ? measure : undefined} style={[styles.flex, { backgroundColor: bg }, style]}>
      {wrapped}
      {/* 스크롤한 내용이 시계·배터리 글자 뒤로 비치지 않게 — 그라데이션 머리 화면은 내려갈 때만 파란 띠, 그 밖에는 바탕색 띠 */}
      {scroll && stage ? <StatusBarScrim height={top} color={Brand.blue} visible={scrolled} /> : null}
      {scroll && safeTop && !stage ? <StatusBarScrim height={top} color={bg} /> : null}
      {stage || (sheet && Platform.OS === 'ios') ? <FocusStatusBar style="light" /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { flexGrow: 1, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
});
