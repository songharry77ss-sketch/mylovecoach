import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { heatMeta } from '@/components/coach/heat-gauge';
import { AppText } from '@/components/ui/app-text';
import { Avatar } from '@/components/ui/avatar';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { relativeTime } from '@/lib/format';
import { relationshipLabel } from '@/lib/labels';
import type { Crush } from '@/lib/types';

/** 고른 상대 — 채팅방 id, 새로운 사람, 비밀 상담 */
export type WhoTarget = { kind: 'crush'; id: string } | { kind: 'new' } | { kind: 'secret' };

interface WhoSheetProps {
  visible: boolean;
  /** 최근 대화 순으로 정렬된 채팅방 (비밀 상담 제외) */
  crushes: Crush[];
  /** 방금 고른 캡처 — 있으면 위에 작게 보여 준다 */
  imageUri?: string;
  onPick: (target: WhoTarget) => void;
  onClose: () => void;
}

/**
 * 「누구와의 대화예요?」 — 홈에서 캡처를 고르거나 상황을 적으려 할 때 어느 채팅방으로 보낼지 한 번에 고른다.
 * 맨 위가 가장 최근 대화라 대부분은 첫 줄을 누르면 끝. 처음 보는 사람이면 「새로운 사람」, 흔적 없이 물으려면 「비밀 상담」.
 */
export function WhoSheet({ visible, crushes, imageUri, onPick, onClose }: WhoSheetProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="닫기" />
      <View style={[styles.sheet, { backgroundColor: theme.background, paddingBottom: insets.bottom + Spacing.lg }]}>
        <View style={[styles.handle, { backgroundColor: theme.border }]} />
        <View style={styles.head}>
          {imageUri ? <Image source={{ uri: imageUri }} style={[styles.thumb, { backgroundColor: theme.surface }]} contentFit="cover" /> : null}
          <View style={styles.flex}>
            <AppText variant="title2">누구와의 대화예요?</AppText>
            <AppText variant="small" color="textSecondary">
              {imageUri ? '고르면 바로 분석을 시작해요' : '고르면 그 채팅방에서 바로 적을 수 있어요'}
            </AppText>
          </View>
        </View>
        <ScrollView style={styles.scroll} contentContainerStyle={styles.list}>
          {crushes.map((c) => {
            const heat = c.heat ?? 0;
            const rel = relationshipLabel(c.relationship);
            return (
              <Pressable
                key={c.id}
                accessibilityRole="button"
                accessibilityLabel={`${c.name}와의 대화`}
                onPress={() => onPick({ kind: 'crush', id: c.id })}
                style={({ pressed }) => [styles.row, { backgroundColor: theme.surface, opacity: pressed ? 0.7 : 1 }]}>
                <Avatar name={c.name} uri={c.photoUri} size={44} seed={c.id} />
                <View style={styles.flex}>
                  <AppText variant="bodyStrong" numberOfLines={1}>
                    {c.name}
                  </AppText>
                  <AppText variant="caption" color="textTertiary" numberOfLines={1}>
                    {rel.emoji} {rel.label} · {heatMeta(heat).emoji} {heat}°{c.lastMessageAt ? ` · ${relativeTime(c.lastMessageAt)}` : ''}
                  </AppText>
                </View>
                <Ionicons name="chevron-forward" size={18} color={theme.textTertiary} />
              </Pressable>
            );
          })}
          <Pressable accessibilityRole="button" onPress={() => onPick({ kind: 'new' })} style={({ pressed }) => [styles.row, styles.outline, { borderColor: theme.border, opacity: pressed ? 0.7 : 1 }]}>
            <View style={[styles.icon, { backgroundColor: theme.primarySoft }]}>
              <Ionicons name="person-add" size={20} color={theme.primary} />
            </View>
            <View style={styles.flex}>
              <AppText variant="bodyStrong">새로운 사람</AppText>
              <AppText variant="caption" color="textTertiary">
                새 채팅방을 열어요 · 정보는 나중에 채워도 돼요
              </AppText>
            </View>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => onPick({ kind: 'secret' })} style={({ pressed }) => [styles.row, styles.outline, { borderColor: theme.border, opacity: pressed ? 0.7 : 1 }]}>
            <View style={[styles.icon, { backgroundColor: theme.text }]}>
              <AppText style={styles.secretEmoji}>🕶️</AppText>
            </View>
            <View style={styles.flex}>
              <AppText variant="bodyStrong">비밀 상담</AppText>
              <AppText variant="caption" color="textTertiary">
                기기에 남지 않고, 나가면 지워져요
              </AppText>
            </View>
          </Pressable>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: { borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl, paddingHorizontal: Spacing.lg, maxHeight: '80%' },
  handle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginTop: Spacing.md, marginBottom: Spacing.lg },
  head: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, marginBottom: Spacing.lg },
  thumb: { width: 44, height: 60, borderRadius: Radius.sm },
  scroll: { flexGrow: 0 },
  list: { gap: Spacing.sm, paddingBottom: Spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md, borderRadius: Radius.md },
  outline: { borderWidth: 1 },
  icon: { width: 44, height: 44, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  secretEmoji: { fontSize: 20, lineHeight: 24 },
});
