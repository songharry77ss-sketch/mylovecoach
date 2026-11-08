/**
 * 묶음 목록 카드 (1.2 개편 — 토스·iOS 설정처럼 옅은 회색 바탕 위 흰 카드 하나에 줄들을 담는다).
 * 안에 넣은 ListRow 는 카드 안쪽 여백·누름 색·아이콘 색을 카드에 맞춘다. 줄 사이에는 가는 선.
 *
 *   <ListGroup title="프라이버시">
 *     <ListRow icon="eye-off-outline" title="채팅 미리보기 숨기기" right={<Switch …/>} />
 *     <ListRow icon="shield-outline" title="개인정보 설정" onPress={…} />
 *   </ListGroup>
 */
import { Children, createContext, Fragment, isValidElement, type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { CardShadow, Radius, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';

/** ListRow 가 카드 안에 있는지 */
export const InListGroup = createContext(false);

/** canvas 위 흰 카드의 바탕 — 라이트는 아주 옅은 그림자, 다크는 그림자 대신 가는 테두리 (프로필 카드·안내 카드 등 직접 만드는 카드용) */
export function useCardStyle(): ViewStyle {
  const theme = useTheme();
  const dark = useColorScheme() === 'dark';
  return { backgroundColor: theme.card, ...(dark ? { borderWidth: StyleSheet.hairlineWidth, borderColor: theme.separator } : (CardShadow as ViewStyle)) };
}

/** 흰 카드 안 칩·입력칸 바탕 — 다크는 카드와 surface 가 같은 색이라 한 단계 밝게 */
export function useInsetFill(): string {
  const theme = useTheme();
  return useColorScheme() === 'dark' ? theme.surfaceElevated : theme.surface;
}

interface CardSectionProps {
  title?: string;
  subtitle?: string;
  footer?: string;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
}

/**
 * 입력 폼 묶음 — ListGroup 과 같은 제목·흰 카드에 줄 대신 자유 내용(입력칸·칩)을 담는다.
 *   <CardSection title="기본 정보"><TextField …/><ChoiceChips …/></CardSection>
 */
export function CardSection({ title, subtitle, footer, children, style, contentStyle }: CardSectionProps) {
  const card = useCardStyle();
  return (
    <View style={[styles.group, style]}>
      {title ? (
        <View style={styles.head}>
          <AppText variant="smallStrong" color="textSecondary" accessibilityRole="header">
            {title}
          </AppText>
          {subtitle ? (
            <AppText variant="caption" color="textTertiary">
              {subtitle}
            </AppText>
          ) : null}
        </View>
      ) : null}
      <View style={[styles.card, styles.padded, card, contentStyle]}>{children}</View>
      {footer ? (
        <AppText variant="caption" color="textTertiary" style={styles.footer}>
          {footer}
        </AppText>
      ) : null}
    </View>
  );
}

/** 카드 안 한 항목 — 작은 이름(+ 옅은 설명) 아래에 칩·칸 */
export function FormField({ label, hint, children, style }: { label: string; hint?: string; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={style}>
      <View style={styles.fieldHead}>
        <AppText variant="smallStrong" color="textSecondary">
          {label}
        </AppText>
        {hint ? (
          <AppText variant="caption" color="textTertiary">
            {hint}
          </AppText>
        ) : null}
      </View>
      {children}
    </View>
  );
}

interface ListGroupProps {
  title?: string;
  subtitle?: string;
  /** 카드 아래 작은 안내 */
  footer?: string;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}

export function ListGroup({ title, subtitle, footer, children, style }: ListGroupProps) {
  const theme = useTheme();
  const dark = useColorScheme() === 'dark';
  const rows = Children.toArray(children).filter(isValidElement);
  return (
    <View style={[styles.group, style]}>
      {title ? (
        <View style={styles.head}>
          <AppText variant="smallStrong" color="textSecondary" accessibilityRole="header">
            {title}
          </AppText>
          {subtitle ? (
            <AppText variant="caption" color="textTertiary">
              {subtitle}
            </AppText>
          ) : null}
        </View>
      ) : null}
      {/* 그림자는 바깥 칸에, 누름 색이 모서리 밖으로 나가지 않게 자르는 건 안쪽 칸에 (아이폰은 overflow 를 자르면 그림자도 잘린다) */}
      <View style={[styles.card, { backgroundColor: theme.card }, dark ? { borderWidth: StyleSheet.hairlineWidth, borderColor: theme.separator } : CardShadow]}>
        <View style={styles.clip}>
          <InListGroup.Provider value>
            {rows.map((row, i) => (
              <Fragment key={row.key ?? i}>
                {i > 0 ? <View style={[styles.separator, { backgroundColor: theme.separator }]} /> : null}
                {row}
              </Fragment>
            ))}
          </InListGroup.Provider>
        </View>
      </View>
      {footer ? (
        <AppText variant="caption" color="textTertiary" style={styles.footer}>
          {footer}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: Spacing.sm },
  head: { gap: 2, paddingHorizontal: Spacing.xs },
  card: { borderRadius: Radius.lg + 2 },
  padded: { padding: Spacing.lg + 2, gap: Spacing.lg + 4 },
  fieldHead: { gap: 2, marginBottom: Spacing.sm + 2, marginLeft: 2 },
  clip: { borderRadius: Radius.lg + 2, overflow: 'hidden' },
  // 아이콘(36) + 간격(12) + 안쪽 여백(16) 만큼 들여서 — 글자 줄 아래에서 시작한다
  separator: { height: StyleSheet.hairlineWidth, marginLeft: Spacing.lg + 36 + Spacing.md, marginRight: Spacing.lg },
  footer: { paddingHorizontal: Spacing.xs },
});
