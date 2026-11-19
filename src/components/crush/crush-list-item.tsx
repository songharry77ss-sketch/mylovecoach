import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { heatMeta } from '@/components/coach/heat-gauge';
import { AnimatedNumber } from '@/components/ui/animated-number';
import { AppText } from '@/components/ui/app-text';
import { useInsetFill } from '@/components/ui/list-group';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { relativeTime } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { relationshipLabel } from '@/lib/labels';
import type { Crush } from '@/lib/types';

interface CrushListItemProps {
  crush: Crush;
  lastPreview?: string;
  /** 대화 미리보기 숨기기 (마이 탭 설정) */
  hidePreview?: boolean;
  /** 아래에 얇은 구분선 (목록의 마지막 줄은 끈다) */
  divider?: boolean;
  onPress: () => void;
}

const AVATAR = 48;

/** 이름 첫 글자 동그라미 — 사진이 있으면 사진. 파랑·보라 두 가지 옅은 색을 이름마다 고정해서 쓴다 */
export function RoomAvatar({ crush, size = 48 }: { crush: Pick<Crush, 'id' | 'name' | 'photoUri'>; size?: number }) {
  const theme = useTheme();
  if (crush.photoUri) {
    return <Image source={{ uri: crush.photoUri }} style={{ width: size, height: size, borderRadius: size / 2 }} contentFit="cover" transition={150} />;
  }
  // 1.4 개편: 파랑·보라 두 색을 번갈아 쓰던 것을 한 가지 옅은 색으로 — 사람마다 색이 달라 화면이 어수선했다
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2, backgroundColor: theme.primarySoft }]}>
      <Text style={[styles.avatarText, { fontSize: size * 0.4, lineHeight: size * 0.5, color: theme.primary }]}>{crush.name.trim().slice(0, 1) || '?'}</Text>
    </View>
  );
}

/**
 * 홈 「최근 상담」 한 줄 — 이름 · 마지막 대화 한 줄 · 오른쪽에 큰 호감 온도(°).
 * 흰 카드 하나에 줄들을 담는다(1.2 개편 — 토스 목록 결): 줄은 눌림 색만, 줄 사이는 글자 아래에서 시작하는 가는 선.
 * 온도는 처음 보일 때 0°에서 세어 올라간다.
 */
export function CrushListItem({ crush, lastPreview, hidePreview, divider = false, onPress }: CrushListItemProps) {
  const theme = useTheme();
  // 눌림 색 — 흰 카드 안 작은 면과 같은 색 (다크는 카드보다 한 단계 밝게)
  const pressedFill = useInsetFill();
  const heat = crush.heat ?? 0;
  const meta = heatMeta(heat);
  const rel = relationshipLabel(crush.relationship);
  const last = crush.heatLog?.[crush.heatLog.length - 1];
  const preview = hidePreview ? '미리보기를 숨겼어요' : (lastPreview ?? `${rel.label}${crush.mbti ? ` · ${crush.mbti}` : ''} · 캡처를 올려 시작해 보세요`);
  const when = crush.lastMessageAt ? relativeTime(crush.lastMessageAt) : '새 채팅방';
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => {
        haptic.soft();
        onPress();
      }}
      accessibilityLabel={`${crush.name}, 호감 온도 ${heat}도, ${when}`}
      accessibilityHint="채팅방을 열어요"
      style={({ pressed }) => [styles.row, { backgroundColor: pressed ? pressedFill : 'transparent' }]}>
      <RoomAvatar crush={crush} size={AVATAR} />
      <View style={styles.texts}>
        <View style={styles.nameRow}>
          <AppText variant="bodyStrong" numberOfLines={1} style={styles.name}>
            {crush.name}
          </AppText>
          <AppText variant="caption" color="textTertiary">
            {when}
          </AppText>
        </View>
        <AppText variant="small" color="textSecondary" numberOfLines={1}>
          {preview}
        </AppText>
      </View>
      <View style={styles.heat}>
        <AnimatedNumber value={heat} suffix="°" ticks={false} duration={900} style={[styles.heatNum, { color: theme.primary }]} />
        {last && last.delta !== 0 ? (
          <AppText variant="caption" weight="600" color={last.delta > 0 ? theme.primary : theme.textTertiary}>
            {last.delta > 0 ? `▲ ${last.delta}°` : `▼ ${Math.abs(last.delta)}°`}
          </AppText>
        ) : (
          <AppText variant="caption" color="textTertiary">
            {meta.label}
          </AppText>
        )}
      </View>
      {divider ? <View pointerEvents="none" style={[styles.divider, { backgroundColor: theme.separator }]} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.md, paddingHorizontal: Spacing.lg, minHeight: 72 },
  avatar: { alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontWeight: '700' },
  texts: { flex: 1, gap: 3 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  name: { flexShrink: 1 },
  heat: { alignItems: 'flex-end', minWidth: 64 },
  heatNum: { fontSize: 24, lineHeight: 30, fontWeight: '700', letterSpacing: -0.8 },
  // 줄 사이 가는 선 — 이름 글자 아래에서 시작한다 (안쪽 여백 + 동그라미 + 간격)
  divider: { position: 'absolute', bottom: 0, right: Spacing.lg, left: Spacing.lg + AVATAR + Spacing.md, height: StyleSheet.hairlineWidth },
});
