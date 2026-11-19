import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { FadeIn, FadeOutLeft, LinearTransition, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { GlassSurface } from '@/components/ui/glass-surface';
import { PressableScale } from '@/components/ui/pressable-scale';
import { useToast } from '@/components/ui/toast';
import { APP_NAME } from '@/constants/brand';
import { Brand, CardShadow, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';
import { haptic } from '@/lib/haptics';
import { MEMORY_NOTICE } from '@/lib/privacy-copy';
import { useAppStore } from '@/store/app-store';

const EMPTY: string[] = [];
/** 기억 띠 높이 (알약 — 모서리는 절반) */
const CARD_H = 42;

/**
 * 채팅방 위의 작은 띠 「센딧이 기억하는 이야기 N개」 — 누르면 기억 시트를 연다.
 * 탭 바·입력창과 같은 유리 알약(가는 테두리 + 아주 옅은 그림자). 기억이 늘면 띠가 통 튀고 「+1」이 떠오른다
 */
export function MemoryCard({ count, onPress, inline = false }: { count: number; onPress: () => void; /** 이미 여백이 있는 화면 안에 둘 때 (상대 정보 수정) */ inline?: boolean }) {
  const theme = useTheme();
  const dark = useColorScheme() === 'dark';
  const scale = useSharedValue(1);
  const plus = useSharedValue(0);
  const prev = useRef(count);
  const [added, setAdded] = useState(0);

  useEffect(() => {
    const before = prev.current;
    prev.current = count;
    if (count <= before) return;
    setAdded(count - before);
    scale.value = withSequence(withSpring(1.05, { damping: 6, stiffness: 320 }), withSpring(1, { damping: 10, stiffness: 220 }));
    plus.value = withSequence(withTiming(1, { duration: 260 }), withTiming(1, { duration: 1300 }), withTiming(0, { duration: 400 }));
  }, [count, scale, plus]);

  const pop = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const plusStyle = useAnimatedStyle(() => ({ opacity: plus.value, transform: [{ translateY: (1 - plus.value) * 8 }] }));

  return (
    <Animated.View style={[inline ? styles.cardInline : styles.cardWrap, pop]}>
      <PressableScale
        accessibilityLabel={`${APP_NAME}이 기억하는 이야기 ${count}개 보기`}
        feedback="tap"
        onPress={onPress}
        style={[styles.card, dark ? null : CardShadow]}>
        <GlassSurface radius={CARD_H / 2} floating={false} style={StyleSheet.absoluteFill} />
        <View style={[styles.cardIcon, { backgroundColor: dark ? theme.surfaceElevated : theme.surface }]}>
          <Ionicons name="bookmark-outline" size={15} color={theme.textSecondary} />
        </View>
        <AppText variant="smallStrong" style={styles.cardText} numberOfLines={1}>
          {APP_NAME}이 기억하는 이야기{' '}
          <AppText variant="smallStrong" color="primary">
            {count}개
          </AppText>
        </AppText>
        <Animated.View style={plusStyle} pointerEvents="none">
          <LinearGradient colors={Brand.button} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.plus}>
            <AppText style={styles.plusText}>+{added}</AppText>
          </LinearGradient>
        </Animated.View>
        <Ionicons name="chevron-forward" size={16} color={theme.textTertiary} />
      </PressableScale>
    </Animated.View>
  );
}

/**
 * 기억 시트 — 무엇을 기억하는지 보여 주고, 줄마다 지우거나 모두 지울 수 있다(지우면 다음 요청부터 빠진다).
 * 기억은 기기에만 저장되고 코칭을 요청할 때 함께 간다는 안내도 여기서 한다
 */
export function MemorySheet({ crushId, partnerName, visible, onClose }: { crushId: string; partnerName?: string; visible: boolean; onClose: () => void }) {
  const theme = useTheme();
  // 흰 시트 안 회색 면(다크는 한 단계 밝게)
  const fill = useColorScheme() === 'dark' ? theme.surfaceElevated : theme.surface;
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const facts = useAppStore((s) => s.crushes[crushId]?.memory?.facts) ?? EMPTY;
  const forgotten = useAppStore((s) => s.crushes[crushId]?.memoryForgotten) ?? EMPTY;
  const forget = useAppStore((s) => s.forgetCrushMemory);
  const clearForgotten = useAppStore((s) => s.clearForgottenMemory);
  const [confirm, setConfirm] = useState(false);

  useEffect(() => {
    if (!visible) setConfirm(false);
  }, [visible]);

  // 지운 줄은 「다시 기억하지 않을 이야기」로 남아, 다음 대화에서 같은 이야기가 다시 생기지 않는다
  const remove = (index: number) => {
    haptic.tap();
    const left = facts.length - 1;
    forget(crushId, [facts[index]]);
    toast.show(left ? '그 이야기는 잊었어요. 다시 기억하지 않을게요.' : '기억을 모두 지웠어요. 다시 기억하지 않을게요.');
  };
  const clearAll = () => {
    haptic.heavy();
    forget(crushId);
    toast.show('기억을 모두 지웠어요. 다시 기억하지 않을게요.');
    onClose();
  };
  const clearForgottenList = () => {
    haptic.tap();
    clearForgotten(crushId);
    toast.show('잊은 이야기 목록을 비웠어요.');
    if (!facts.length) onClose();
  };

  const who = partnerName && partnerName !== '상대' ? `${partnerName}님과의` : '이 채팅방의';

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable accessibilityRole="button" accessibilityLabel="닫기" onPress={onClose} style={[StyleSheet.absoluteFill, styles.backdrop]} />
        <View
          accessibilityViewIsModal
          onAccessibilityEscape={onClose}
          style={[styles.sheet, { backgroundColor: theme.background, paddingBottom: insets.bottom + Spacing.md, maxHeight: height - insets.top - Spacing.xl }]}>
          <View style={[styles.handle, { backgroundColor: theme.border }]} />
          {/* 1.4 개편: 3D 그림·그라데이션 「확인」 버튼을 걷었다 — 보기만 하는 시트라 닫기는 × · 바깥 누르기 · 뒤로 가기 */}
          <View style={styles.head}>
            <View style={styles.flex}>
              <AppText variant="title2" accessibilityRole="header">
                {APP_NAME}이 기억하는 이야기
              </AppText>
              <AppText variant="small" color="textSecondary">
                {who} 지난 대화에서 기억해 둔 거예요. 다음 답장부터 이어서 써요.
              </AppText>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="닫기" onPress={onClose} hitSlop={6} style={({ pressed }) => [styles.close, { backgroundColor: fill, opacity: pressed ? 0.6 : 1 }]}>
              <Ionicons name="close" size={18} color={theme.textSecondary} />
            </Pressable>
          </View>
          <ScrollView style={styles.scroll} contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
            {/* 줄마다 회색 알약 카드 → 가는 선으로 나눈 한 목록 */}
            <View>
              {facts.map((fact, i) => (
                <Animated.View
                  key={fact}
                  entering={FadeIn.delay(i * 40)}
                  exiting={FadeOutLeft.duration(200)}
                  layout={LinearTransition.springify().damping(18)}
                  style={[styles.row, i > 0 ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.separator } : null]}>
                  <View style={styles.rowTexts}>
                    {i === facts.length - 1 ? (
                      <AppText variant="caption" color="primary" weight="600">
                        가장 최근
                      </AppText>
                    ) : null}
                    <AppText variant="body">{fact}</AppText>
                  </View>
                  <Pressable accessibilityRole="button" accessibilityLabel={`「${fact}」 잊기`} onPress={() => remove(i)} hitSlop={4} style={({ pressed }) => [styles.remove, { opacity: pressed ? 0.5 : 1 }]}>
                    <Ionicons name="close" size={18} color={theme.textTertiary} />
                  </Pressable>
                </Animated.View>
              ))}
            </View>

            {!facts.length ? (
              <AppText variant="small" color="textSecondary" align="center">
                지금 기억하는 이야기는 없어요.
              </AppText>
            ) : null}

            {/* 지운 이야기도 숨기지 않고 보여 준다 — 다시 기억하지 않으려고 이 기기에 남겨 두는 목록이라 비울 수 있게 */}
            {forgotten.length ? (
              <View style={[styles.forgotten, { backgroundColor: fill }]}>
                <View style={styles.forgottenHead}>
                  <AppText variant="smallStrong" color="textSecondary" style={styles.flex}>
                    다시 기억하지 않을 이야기 {forgotten.length}개
                  </AppText>
                  <Pressable accessibilityRole="button" accessibilityLabel="다시 기억하지 않을 이야기 목록 비우기" onPress={clearForgottenList} hitSlop={10} style={styles.textButton}>
                    <AppText variant="smallStrong" color="primary">
                      비우기
                    </AppText>
                  </Pressable>
                </View>
                {forgotten.slice(-3).map((line) => (
                  <AppText key={line} variant="caption" color="textSecondary" numberOfLines={1}>
                    · {line}
                  </AppText>
                ))}
                {forgotten.length > 3 ? (
                  <AppText variant="caption" color="textSecondary">
                    외 {forgotten.length - 3}개
                  </AppText>
                ) : null}
              </View>
            ) : null}

            {/* 기억이 어디에 저장되고 어디로 가는지 — 상자 없이 작은 글로 (내용은 그대로) */}
            <View style={styles.notice}>
              <Ionicons name="lock-closed-outline" size={14} color={theme.textSecondary} style={styles.noticeIcon} />
              <AppText variant="caption" color="textSecondary" style={[styles.flex, styles.noticeText]}>
                {MEMORY_NOTICE}
              </AppText>
            </View>
          </ScrollView>

          {facts.length ? (
            <View style={styles.actions}>
              {confirm ? (
                <Animated.View entering={FadeIn.duration(160)} style={styles.confirm}>
                  <AppText variant="smallStrong" align="center">
                    기억 {facts.length}개를 모두 지울까요? 되돌릴 수 없어요.
                  </AppText>
                  <View style={styles.confirmRow}>
                    <Button title="취소" variant="secondary" size="md" onPress={() => setConfirm(false)} style={styles.flex} />
                    <Button title="모두 지우기" variant="danger" size="md" onPress={clearAll} style={styles.flex} />
                  </View>
                </Animated.View>
              ) : (
                <Button title="모두 지우기" variant="ghost" size="md" onPress={() => setConfirm(true)} />
              )}
            </View>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  cardWrap: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.xs, paddingBottom: Spacing.sm, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  cardInline: { marginTop: Spacing.xl },
  card: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm + 2, minHeight: CARD_H, paddingLeft: 6, paddingRight: Spacing.md, borderRadius: CARD_H / 2 },
  cardIcon: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  cardText: { flex: 1 },
  plus: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: Radius.pill },
  plusText: { color: Brand.onBrand, fontSize: 12, lineHeight: 16, fontWeight: '700' },
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: { width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center', borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl, paddingTop: Spacing.sm, paddingHorizontal: Spacing.xl },
  handle: { width: 40, height: 5, borderRadius: 3, alignSelf: 'center', marginBottom: Spacing.md },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md, paddingBottom: Spacing.md },
  close: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginTop: -2 },
  scroll: { flexGrow: 0, flexShrink: 1 },
  body: { gap: Spacing.lg, paddingBottom: Spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.sm + 2, minHeight: 56 },
  rowTexts: { flex: 1, gap: 2 },
  remove: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginRight: -Spacing.md },
  notice: { flexDirection: 'row', gap: 6 },
  noticeText: { lineHeight: 18 },
  noticeIcon: { marginTop: 2 },
  forgotten: { borderRadius: Radius.md, padding: Spacing.md, gap: 4 },
  forgottenHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  textButton: { minHeight: 32, justifyContent: 'center' },
  actions: { gap: Spacing.xs, paddingTop: Spacing.xs },
  confirm: { gap: Spacing.md },
  confirmRow: { flexDirection: 'row', gap: Spacing.sm },
});
