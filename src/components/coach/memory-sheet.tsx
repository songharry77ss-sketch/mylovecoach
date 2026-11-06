import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { FadeIn, FadeOutLeft, LinearTransition, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon3D } from '@/components/brand/brand';
import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { PressableScale } from '@/components/ui/pressable-scale';
import { useToast } from '@/components/ui/toast';
import { APP_NAME } from '@/constants/brand';
import { Brand, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { haptic } from '@/lib/haptics';
import { MEMORY_NOTICE } from '@/lib/privacy-copy';
import { useAppStore } from '@/store/app-store';

const EMPTY: string[] = [];

/**
 * 채팅방 위의 작은 카드 「센딧이 기억하는 이야기 N개」 — 누르면 기억 시트를 연다.
 * 기억이 늘면 카드가 통 튀고 「+1」이 떠오른다
 */
export function MemoryCard({ count, onPress, inline = false }: { count: number; onPress: () => void; /** 이미 여백이 있는 화면 안에 둘 때 (상대 정보 수정) */ inline?: boolean }) {
  const theme = useTheme();
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
        style={[styles.card, { backgroundColor: theme.surface }]}>
        <Icon3D name="memory" size={30} />
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
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const facts = useAppStore((s) => s.crushes[crushId]?.memory?.facts) ?? EMPTY;
  const setCrushMemory = useAppStore((s) => s.setCrushMemory);
  const [confirm, setConfirm] = useState(false);

  useEffect(() => {
    if (!visible) setConfirm(false);
  }, [visible]);

  const remove = (index: number) => {
    haptic.tap();
    const next = facts.filter((_, i) => i !== index);
    setCrushMemory(crushId, next.length ? next : null);
    toast.show(next.length ? '그 이야기는 잊었어요. 다음 요청부터 빠져요.' : '기억을 모두 지웠어요.');
    if (!next.length) onClose();
  };
  const clearAll = () => {
    haptic.heavy();
    setCrushMemory(crushId, null);
    toast.show('기억을 모두 지웠어요. 다음 요청부터 빠져요.');
    onClose();
  };

  const who = partnerName && partnerName !== '상대' ? `${partnerName}님과의` : '이 채팅방의';

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable accessibilityRole="button" accessibilityLabel="닫기" onPress={onClose} style={[StyleSheet.absoluteFill, styles.backdrop]} />
        <View
          accessibilityViewIsModal
          onAccessibilityEscape={onClose}
          style={[styles.sheet, { backgroundColor: theme.background, paddingBottom: insets.bottom + Spacing.lg, maxHeight: height - insets.top - Spacing.xl }]}>
          <View style={[styles.handle, { backgroundColor: theme.border }]} />
          <ScrollView style={styles.scroll} contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
            <View style={styles.head}>
              <Icon3D name="memory" size={64} float />
              <AppText variant="title2" align="center" accessibilityRole="header">
                {APP_NAME}이 기억하는 이야기
              </AppText>
              <AppText variant="small" color="textSecondary" align="center">
                {who} 지난 대화에서 기억해 둔 거예요.{'\n'}다음 답장부터 이어서 써요.
              </AppText>
            </View>

            <View style={styles.list}>
              {facts.map((fact, i) => (
                <Animated.View key={fact} entering={FadeIn.delay(i * 40)} exiting={FadeOutLeft.duration(200)} layout={LinearTransition.springify().damping(18)} style={[styles.row, { backgroundColor: theme.surface }]}>
                  <View style={styles.rail}>
                    <View style={[styles.dot, { backgroundColor: i === facts.length - 1 ? theme.primary : theme.textTertiary }]} />
                  </View>
                  <View style={styles.rowTexts}>
                    {i === facts.length - 1 ? (
                      <AppText variant="caption" color="primary" weight="700">
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

            <View style={[styles.notice, { backgroundColor: theme.primarySoft }]}>
              <Ionicons name="lock-closed" size={15} color={theme.primary} style={styles.noticeIcon} />
              <AppText variant="caption" color="textSecondary" style={styles.flex}>
                {MEMORY_NOTICE}
              </AppText>
            </View>
          </ScrollView>

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
              <>
                <Button title="확인" variant="brand" onPress={onClose} />
                {facts.length ? <Button title="모두 지우기" variant="ghost" size="md" onPress={() => setConfirm(true)} /> : null}
              </>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  cardWrap: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.sm, paddingBottom: Spacing.xs, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  cardInline: { marginTop: Spacing.xl },
  card: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, minHeight: 48, paddingLeft: Spacing.sm + 2, paddingRight: Spacing.md, borderRadius: Radius.lg },
  cardText: { flex: 1 },
  plus: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: Radius.pill },
  plusText: { color: Brand.onBrand, fontSize: 12, lineHeight: 16, fontWeight: '800' },
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: { width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center', borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl, paddingTop: Spacing.sm, paddingHorizontal: Spacing.xl },
  handle: { width: 40, height: 5, borderRadius: 3, alignSelf: 'center', marginBottom: Spacing.md },
  scroll: { flexGrow: 0, flexShrink: 1 },
  body: { gap: Spacing.lg, paddingBottom: Spacing.md },
  head: { alignItems: 'center', gap: Spacing.sm },
  list: { gap: Spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, borderRadius: Radius.lg, paddingLeft: Spacing.md, paddingVertical: Spacing.sm + 2, paddingRight: 2 },
  rail: { width: 10, alignItems: 'center', alignSelf: 'stretch', justifyContent: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4 },
  rowTexts: { flex: 1, gap: 1 },
  remove: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  notice: { flexDirection: 'row', gap: Spacing.sm, borderRadius: Radius.md, padding: Spacing.md },
  noticeIcon: { marginTop: 1 },
  actions: { gap: Spacing.xs, paddingTop: Spacing.sm },
  confirm: { gap: Spacing.md },
  confirmRow: { flexDirection: 'row', gap: Spacing.sm },
});
