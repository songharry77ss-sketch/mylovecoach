import { Ionicons } from '@expo/vector-icons';
import type { Ref } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';
import { isUnlimited, useQuota } from '@/lib/billing/gate';
import { haptic } from '@/lib/haptics';
import type { Worry } from '@/lib/tips';
import type { Gender } from '@/lib/types';
import { useAppStore } from '@/store/app-store';

/**
 * 「연애팁 백서」(11/12 회의 8번) 부품 — 탐색 탭의 고민 버튼·기능 줄, 해답 화면이 같이 쓴다.
 * 1.4 「깔끔하게」 개편: 고민 타일의 아이콘·그림자, 줄 왼쪽의 연파랑 아이콘 타일을 걷었다(「AI 티」의 가장 큰 원인 — 같은 타일이 화면마다 반복).
 */

/** 흰 바탕 위 회색 면 — 다크는 바탕과 surface 가 가까워 한 단계 밝은 면으로 */
export function useFill(): string {
  const theme = useTheme();
  return useColorScheme() === 'dark' ? theme.surfaceElevated : theme.surface;
}

/** 속마음을 볼 쪽 — 내가 여자면 남자 속마음, 남자면 여자 속마음, 모르면 첫 채팅방 상대 성별(없으면 남자) */
export function useDefaultPerspective(): Gender {
  const myGender = useAppStore((s) => s.user?.gender);
  const firstCrushGender = useAppStore((s) => Object.values(s.crushes).find((c) => !c.secret && c.gender !== 'other')?.gender);
  return myGender === 'female' ? 'male' : myGender === 'male' ? 'female' : (firstCrushGender ?? 'male');
}

/**
 * 무료 횟수를 쓰는 버튼 곁의 한 줄(속마음 보기·다시 풀이·연습 시작 등이 같이 쓴다 — 감사 보고서 6장 1·2).
 * - 횟수 제한이 없거나(데모·개인 키) 무제한(이용권·체험)이면 아무것도 적지 않는다.
 * - 남았으면 「3회 남았어요 · 볼 때 1회 써요」, 버튼 뒤에 붙일 「 · 1회」.
 * - 0회면 「1회가 차감돼요」는 사실과 어긋나므로 「무료 횟수를 다 썼어요」로 먼저 알린다(눌러야 막히는 것보다 정직하다).
 */
export function useCostNote(when: string): { note: string | null; left: string | null; out: boolean; suffix: string } {
  const quota = useQuota();
  if (!quota.enforced || isUnlimited(quota)) return { note: null, left: null, out: false, suffix: '' };
  if (quota.remaining <= 0) return { note: '무료 횟수를 다 썼어요 · 이용권이 있으면 바로 이어서 돼요', left: null, out: true, suffix: '' };
  const left = `${quota.remaining}회 남았어요`;
  return { note: `${left} · ${when} 1회 써요`, left, out: false, suffix: ' · 1회' };
}

/** 탐색 탭의 고민 버튼 — 아이콘 없는 회색 글자 버튼(높이 52). 찾는 말(키워드)은 화면 읽기에만 */
export function WorryTile({ worry, onPress }: { worry: Worry; onPress: () => void }) {
  const fill = useFill();
  return (
    <PressableScale pressedScale={0.97} feedback="select" onPress={onPress} accessibilityLabel={`${worry.title}, ${worry.keywords.replace(/ · /g, ', ')}`} style={[styles.tile, { backgroundColor: fill }]}>
      <AppText variant="smallStrong" style={styles.tileTitle} numberOfLines={1}>
        {worry.title}
      </AppText>
    </PressableScale>
  );
}

/**
 * 탐색 탭 「더 해 볼 것」의 한 줄 — 흰 바탕 위 줄(카드·아이콘 타일 없이): 이름 + 한 줄 설명 + 오른쪽 ›.
 * dot 을 켜면 이름 옆에 빨간 점, note 를 주면 설명 앞에 짧은 표시(「이런 기능도 있어요」). divider 면 아래에 가는 선.
 */
export function ExploreRow({
  title,
  subtitle,
  note,
  dot,
  divider,
  onPress,
  accessibilityLabel,
  rowRef,
}: {
  title: string;
  subtitle: string;
  note?: string;
  dot?: boolean;
  divider?: boolean;
  onPress: () => void;
  accessibilityLabel: string;
  /** 화면에 보였는지 재려고 (탐색 탭의 연애 연습 빨간 점) */
  rowRef?: Ref<View>;
}) {
  const theme = useTheme();
  const fill = useFill();
  return (
    <Pressable
      ref={rowRef}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={() => {
        haptic.select();
        onPress();
      }}
      style={({ pressed }) => [styles.row, { backgroundColor: pressed ? fill : 'transparent' }]}>
      <View style={styles.rowTexts}>
        <View style={styles.rowTitleLine}>
          <AppText variant="bodyStrong" numberOfLines={1} style={styles.rowTitle}>
            {title}
          </AppText>
          {dot ? <View style={[styles.dot, { backgroundColor: theme.danger }]} accessibilityElementsHidden importantForAccessibility="no" /> : null}
        </View>
        <AppText variant="small" color="textSecondary" numberOfLines={1}>
          {note ? (
            <AppText variant="small" color="primary" weight="600">
              {`${note} · `}
            </AppText>
          ) : null}
          {subtitle}
        </AppText>
      </View>
      <Ionicons name="chevron-forward" size={18} color={theme.textTertiary} />
      {divider ? <View pointerEvents="none" style={[styles.divider, { backgroundColor: theme.separator }]} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: { height: 52, borderRadius: 16, paddingHorizontal: 14, justifyContent: 'center' },
  tileTitle: { fontSize: 15, letterSpacing: -0.4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, minHeight: 64 },
  rowTexts: { flex: 1, gap: 2 },
  rowTitleLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rowTitle: { flexShrink: 1 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  divider: { position: 'absolute', bottom: 0, left: Spacing.lg, right: Spacing.lg, height: StyleSheet.hairlineWidth },
});
