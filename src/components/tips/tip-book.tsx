import { Ionicons } from '@expo/vector-icons';
import type { ReactNode, Ref } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { useCardStyle, useInsetFill } from '@/components/ui/list-group';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { haptic } from '@/lib/haptics';
import type { Worry, WorryId } from '@/lib/tips';
import type { Gender } from '@/lib/types';
import { useAppStore } from '@/store/app-store';

/** 「연애팁 백서」(11/12 회의 8번) 부품 — 탐색 탭의 고민 카드·기능 줄, 해답 화면이 같이 쓴다 */

/** 고민마다 아이콘 하나 (이모지 대신 — 화면마다 3D·이모지가 반복되면 「AI 티」가 난다) */
export const WORRY_ICON: Record<WorryId, keyof typeof Ionicons.glyphMap> = {
  'late-reply': 'time',
  some: 'help-circle',
  'first-text': 'paper-plane',
  'talk-dies': 'chatbubbles',
  'ask-out': 'calendar',
  'after-date': 'cafe',
  fight: 'thunderstorm',
  ex: 'refresh',
};

/** 카드 모서리 — 지침 1.2: 카드·타일 22 */
export const TIP_CARD_RADIUS = Radius.lg + 2;

/** 속마음을 볼 쪽 — 내가 여자면 남자 속마음, 남자면 여자 속마음, 모르면 첫 채팅방 상대 성별(없으면 남자) */
export function useDefaultPerspective(): Gender {
  const myGender = useAppStore((s) => s.user?.gender);
  const firstCrushGender = useAppStore((s) => Object.values(s.crushes).find((c) => !c.secret && c.gender !== 'other')?.gender);
  return myGender === 'female' ? 'male' : myGender === 'male' ? 'female' : (firstCrushGender ?? 'male');
}

/** 탐색 탭의 고민 카드 — 흰 타일, 아이콘 하나, 고민 한 줄 + 찾는 말 */
export function WorryTile({ worry, onPress }: { worry: Worry; onPress: () => void }) {
  const theme = useTheme();
  const card = useCardStyle();
  return (
    <PressableScale pressedScale={0.97} feedback="select" onPress={onPress} accessibilityLabel={`${worry.title}, ${worry.keywords.replace(/ · /g, ', ')}`} style={[styles.tile, card]}>
      <View style={[styles.tileIcon, { backgroundColor: theme.primarySoft }]}>
        <Ionicons name={WORRY_ICON[worry.id]} size={17} color={theme.primary} />
      </View>
      <View style={styles.tileTexts}>
        <AppText variant="bodyStrong" weight="700" style={styles.tileTitle} numberOfLines={2} lineBreakStrategyIOS="hangul-word">
          {worry.title}
        </AppText>
        <AppText variant="caption" color="textTertiary" numberOfLines={1}>
          {worry.keywords}
        </AppText>
      </View>
    </PressableScale>
  );
}

/**
 * 탐색 탭 「더 해 볼 것」의 한 줄 — ListGroup 안에 넣는다 (ListRow 와 같은 크기·여백).
 * dot 을 켜면 이름 옆에 빨간 점, note 를 주면 설명 앞에 앱 색 짧은 표시(「이런 기능도 있어요」).
 */
export function ExploreRow({
  icon,
  iconNode,
  title,
  subtitle,
  note,
  dot,
  onPress,
  accessibilityLabel,
  rowRef,
}: {
  icon?: keyof typeof Ionicons.glyphMap;
  /** 아이콘 대신 그릴 것 (예: KKTI 결과 이모지) */
  iconNode?: ReactNode;
  title: string;
  subtitle: string;
  note?: string;
  dot?: boolean;
  onPress: () => void;
  accessibilityLabel: string;
  /** 화면에 보였는지 재려고 (탐색 탭의 연애 연습 빨간 점) */
  rowRef?: Ref<View>;
}) {
  const theme = useTheme();
  const inset = useInsetFill();
  return (
    <Pressable
      ref={rowRef}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={() => {
        haptic.select();
        onPress();
      }}
      style={({ pressed }) => [styles.row, { backgroundColor: pressed ? inset : 'transparent' }]}>
      <View style={[styles.rowIcon, { backgroundColor: theme.primarySoft }]}>{iconNode ?? (icon ? <Ionicons name={icon} size={18} color={theme.primary} /> : null)}</View>
      <View style={styles.rowTexts}>
        <View style={styles.rowTitleLine}>
          <AppText variant="body" weight="600" numberOfLines={1} style={styles.rowTitle}>
            {title}
          </AppText>
          {dot ? <View style={[styles.dot, { backgroundColor: theme.danger }]} accessibilityElementsHidden importantForAccessibility="no" /> : null}
        </View>
        <AppText variant="caption" color="textTertiary" numberOfLines={1}>
          {note ? (
            <AppText variant="caption" color="primary" weight="700">
              {`${note} · `}
            </AppText>
          ) : null}
          {subtitle}
        </AppText>
      </View>
      <Ionicons name="chevron-forward" size={18} color={theme.textTertiary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: { flex: 1, borderRadius: TIP_CARD_RADIUS, paddingHorizontal: Spacing.md + 2, paddingVertical: Spacing.md, gap: Spacing.sm, minHeight: 96 },
  tileIcon: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  tileTexts: { gap: 2 },
  tileTitle: { fontSize: 16, lineHeight: 22, letterSpacing: -0.3 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingHorizontal: Spacing.lg, paddingVertical: 14, minHeight: 60 },
  rowIcon: { width: 36, height: 36, borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center' },
  rowTexts: { flex: 1, gap: 2 },
  rowTitleLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rowTitle: { flexShrink: 1 },
  dot: { width: 7, height: 7, borderRadius: 4 },
});
