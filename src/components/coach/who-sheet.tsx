import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RoomAvatar } from '@/components/crush/crush-list-item';
import { crushDisplayName } from '@/components/crush/crush-name';
import { AppText } from '@/components/ui/app-text';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { relativeTime } from '@/lib/format';
import { L } from '@/lib/i18n';
import { josa } from '@/lib/kkti';
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
  /** 제목 아래 안내를 바꿀 때 (예: 연애팁 백서 — 「고르면 이 고민으로 바로 물어봐요」) */
  subtitle?: string;
}

/**
 * 「누구와의 대화예요?」 — 홈에서 캡처를 고르거나 상황을 적으려 할 때 어느 채팅방으로 보낼지 한 번에 고른다.
 * 맨 위가 가장 최근 대화라 대부분은 첫 줄을 누르면 끝. 처음 보는 사람이면 「새로운 사람」, 흔적 없이 물으려면 「비밀 상담」.
 */
export function WhoSheet({ visible, crushes, imageUri, onPick, onClose, subtitle }: WhoSheetProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel={L('닫기', 'Close')} />
      <View style={[styles.sheet, { backgroundColor: theme.background, paddingBottom: insets.bottom + Spacing.lg }]}>
        <View style={[styles.handle, { backgroundColor: theme.surfaceSelected }]} />
        <View style={styles.head}>
          {imageUri ? <Image source={{ uri: imageUri }} style={[styles.thumb, { backgroundColor: theme.surface, borderColor: theme.border }]} contentFit="cover" /> : null}
          <View style={styles.flex}>
            <AppText variant="title1" accessibilityRole="header">
              {L('누구와의 대화예요?', 'Who’s this chat with?')}
            </AppText>
            <AppText variant="small" color="textSecondary">
              {subtitle ??
                (imageUri
                  ? L('고르면 바로 분석을 시작해요', 'Pick one and I’ll start right away')
                  : L('고르면 그 채팅방에서 바로 적을 수 있어요', 'Pick one to start typing in that chat'))}
            </AppText>
          </View>
        </View>
        <ScrollView style={styles.scroll} contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
          {crushes.map((c, i) => {
            const heat = c.heat ?? 0;
            const rel = relationshipLabel(c.relationship);
            return (
              <Animated.View key={c.id} entering={FadeInDown.delay(40 * Math.min(i, 6)).duration(260)}>
                <PressableScale
                  feedback={false}
                  pressedScale={0.97}
                  accessibilityLabel={L(`${c.name}${josa(c.name, '과', '와')}의 대화`, `Chat with ${crushDisplayName(c.name)}`)}
                  onPress={() => onPick({ kind: 'crush', id: c.id })}
                  style={[styles.row, { backgroundColor: theme.surface }]}>
                  <RoomAvatar crush={c} size={44} />
                  <View style={styles.flex}>
                    <AppText variant="bodyStrong" numberOfLines={1}>
                      {crushDisplayName(c.name)}
                    </AppText>
                    <AppText variant="caption" color="textTertiary" numberOfLines={1}>
                      {rel.label}
                      {c.lastMessageAt ? ` · ${relativeTime(c.lastMessageAt)}` : L(' · 새 채팅방', ' · New chat')}
                    </AppText>
                  </View>
                  <Text style={[styles.heat, { color: heat >= 50 ? theme.accent : theme.primary }]}>{heat}°</Text>
                </PressableScale>
              </Animated.View>
            );
          })}
          <Animated.View entering={FadeInDown.delay(40 * Math.min(crushes.length, 6)).duration(260)} style={styles.extra}>
            <PressableScale feedback={false} pressedScale={0.97} accessibilityLabel={L('새로운 사람', 'Someone new')} onPress={() => onPick({ kind: 'new' })} style={[styles.row, styles.outline, { borderColor: theme.border }]}>
              <View style={[styles.icon, { backgroundColor: theme.primarySoft }]}>
                <Ionicons name="person-add" size={20} color={theme.primary} />
              </View>
              <View style={styles.flex}>
                <AppText variant="bodyStrong">{L('새로운 사람', 'Someone new')}</AppText>
                <AppText variant="caption" color="textTertiary">
                  {L('새 채팅방을 열어요 · 정보는 나중에 채워도 돼요', 'Start a new chat · Add details later')}
                </AppText>
              </View>
              <Ionicons name="chevron-forward" size={18} color={theme.textTertiary} />
            </PressableScale>
            <PressableScale feedback={false} pressedScale={0.97} accessibilityLabel={L('비밀 상담', 'Private chat')} onPress={() => onPick({ kind: 'secret' })} style={[styles.row, styles.outline, { borderColor: theme.border }]}>
              <View style={[styles.icon, { backgroundColor: theme.text }]}>
                <Ionicons name="glasses" size={20} color={theme.background} />
              </View>
              <View style={styles.flex}>
                <AppText variant="bodyStrong">{L('비밀 상담', 'Private chat')}</AppText>
                <AppText variant="caption" color="textTertiary">
                  {L('기기에 남지 않고, 나가면 지워져요', 'Not saved — gone when you leave')}
                </AppText>
              </View>
              <Ionicons name="chevron-forward" size={18} color={theme.textTertiary} />
            </PressableScale>
          </Animated.View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, gap: 2 },
  backdrop: { flex: 1, backgroundColor: 'rgba(13,16,24,0.45)' },
  sheet: { borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl, paddingHorizontal: Spacing.lg, maxHeight: '82%' },
  handle: { width: 40, height: 5, borderRadius: 3, alignSelf: 'center', marginTop: Spacing.md, marginBottom: Spacing.lg },
  head: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, marginBottom: Spacing.lg },
  thumb: { width: 46, height: 62, borderRadius: Radius.sm, borderWidth: StyleSheet.hairlineWidth },
  scroll: { flexGrow: 0 },
  list: { gap: Spacing.sm, paddingBottom: Spacing.sm },
  extra: { gap: Spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.md, paddingHorizontal: Spacing.md, borderRadius: Radius.lg, minHeight: 68 },
  outline: { borderWidth: 1 },
  icon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  heat: { fontSize: 22, lineHeight: 26, fontWeight: '700', letterSpacing: -0.8 },
});
