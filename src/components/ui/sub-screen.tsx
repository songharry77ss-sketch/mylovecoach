/**
 * 마이 → 설정 하위 화면 틀 (11/12 회의 4번 「마이 정리」).
 * 옅은 바탕(canvas) 위 큰 제목 + 흰 카드 묶음(ListGroup). 왼쪽 위 뒤로 가기는 늘 그 자리에 떠 있고,
 * 내리기 시작하면 그 뒤에 유리 띠(GlassSurface — Screen title 머리말과 같은 유리)가 깔리고, 큰 제목이 가려지면 가운데 작은 제목이 뜬다.
 *
 *   <SubScreen title="앱 설정">
 *     <ListGroup title="기능">…</ListGroup>
 *   </SubScreen>
 *
 * 머리말은 스택 머리말 대신 직접 그린다(_layout 에서 headerShown: false) — 큰 제목과 유리 띠를 마이 탭과 같은 결로 맞추려고.
 * reanimated 를 쓰지 않는다 (화면 테스트에서 가볍게 불러온다).
 */
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, Pressable, StyleSheet, Text, View, type NativeScrollEvent, type NativeSyntheticEvent, type ViewStyle } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { GLASS_HEADER_BAR } from '@/components/ui/glass-header';
import { GlassSurface } from '@/components/ui/glass-surface';
import { Screen, useScreenTopInset } from '@/components/ui/screen';
import { useScrolledPast } from '@/components/ui/system-bars';
import { Spacing, Typography } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { L } from '@/lib/i18n';

/** 큰 제목(위 46 아래에서 시작, 38 높이)이 머리말 띠 뒤로 다 들어가는 스크롤 위치 */
const TITLE_GONE = 40;

interface SubScreenProps {
  title: string;
  children: ReactNode;
  contentStyle?: ViewStyle;
}

export function SubScreen({ title, children, contentStyle }: SubScreenProps) {
  const theme = useTheme();
  const router = useRouter();
  const top = useScreenTopInset();
  // 조금이라도 내리면 뒤로 가기 뒤에 유리 띠 — 내용이 버튼 밑으로 지나가며 겹쳐 보이지 않게
  const { scrolled, onScroll } = useScrolledPast(2);
  const { scrolled: pastTitle, onScroll: onScrollTitle } = useScrolledPast(TITLE_GONE);
  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    onScroll(e);
    onScrollTitle(e);
  };
  const glass = useFade(scrolled);
  const small = useFade(pastTitle);
  // 링크로 바로 들어와 돌아갈 곳이 없으면 마이 탭으로
  const back = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)/my'));

  return (
    <View style={[styles.flex, { backgroundColor: theme.canvas }]}>
      <Screen safeTop background={theme.canvas} contentStyle={{ ...styles.content, ...contentStyle }} scrollProps={{ onScroll: handleScroll }}>
        {/* 뒤로 가기 자리만큼 비우고 큰 제목 */}
        <View style={styles.barSpace} />
        <Text style={[styles.title, { color: theme.text }]} accessibilityRole="header">
          {title}
        </Text>
        {children}
      </Screen>

      <View pointerEvents="box-none" style={[styles.header, { height: top + GLASS_HEADER_BAR }]}>
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: glass }]}>
          <GlassSurface floating={false} edge="bottom" style={StyleSheet.absoluteFill} />
        </Animated.View>
        <Animated.View
          pointerEvents="none"
          accessibilityElementsHidden={!pastTitle}
          importantForAccessibility={pastTitle ? 'auto' : 'no-hide-descendants'}
          style={[styles.smallTitle, { top, opacity: small }]}>
          <Text allowFontScaling={false} numberOfLines={1} style={[styles.smallTitleText, { color: theme.text }]}>
            {title}
          </Text>
        </Animated.View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={L('뒤로', 'Back')}
          onPress={back}
          hitSlop={6}
          style={({ pressed }) => [styles.back, { top: top + (GLASS_HEADER_BAR - 44) / 2, opacity: pressed ? 0.45 : 1 }]}>
          <Ionicons name="chevron-back" size={26} color={theme.text} />
        </Pressable>
      </View>
    </View>
  );
}

/** 맨 아래 작은 글자 버튼 — 눈에 덜 띄지만 누르기 쉽게(높이 44). 회원 탈퇴·모든 데이터 삭제처럼 되돌릴 수 없는 일에 쓴다 */
export function QuietLink({ title, onPress }: { title: string; onPress?: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ disabled: !onPress }} onPress={onPress} disabled={!onPress} hitSlop={8} style={styles.quiet}>
      <AppText variant="caption" color="textSecondary" style={styles.quietText}>
        {title}
      </AppText>
    </Pressable>
  );
}

function useFade(visible: boolean) {
  const value = useRef(new Animated.Value(visible ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(value, { toValue: visible ? 1 : 0, duration: 160, useNativeDriver: true }).start();
  }, [value, visible]);
  return value;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { gap: Spacing.xl },
  // Screen 이 위에 (상태 표시줄 + 8) 을 이미 비우므로 머리말 띠 높이에서 8 을 뺀다. 큰 제목 아래 간격은 gap 이 맡는다
  barSpace: { height: GLASS_HEADER_BAR - Spacing.sm, marginBottom: -Spacing.xl },
  title: { ...Typography.hero, fontSize: 30, lineHeight: 38, marginTop: Spacing.xs, marginBottom: -Spacing.sm, paddingHorizontal: Spacing.xs },
  header: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 },
  smallTitle: { position: 'absolute', left: 56, right: 56, height: GLASS_HEADER_BAR, alignItems: 'center', justifyContent: 'center' },
  smallTitleText: { fontSize: 16, lineHeight: 22, fontWeight: '700', letterSpacing: -0.3 },
  back: { position: 'absolute', left: Spacing.sm, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  quiet: { minHeight: 44, justifyContent: 'center', paddingHorizontal: Spacing.xs },
  quietText: { textDecorationLine: 'underline' },
});
