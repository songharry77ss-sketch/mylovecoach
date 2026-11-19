/**
 * 묶음 목록 카드 (1.2 개편 — 토스·iOS 설정처럼 옅은 회색 바탕 위 흰 카드 하나에 줄들을 담는다).
 * 안에 넣은 ListRow 는 카드 안쪽 여백·누름 색을 카드에 맞춘다. 줄 사이에는 가는 선.
 * 1.4 「깔끔하게」 개편: 그림자 없이 면으로만 나누고(다크는 가는 테두리), 줄마다 붙던 아이콘 타일을 걷었다 — 카드 안 줄은 글자만.
 * 바탕(canvas) 위에 놓이는 제목·설명·아래 안내는 읽어야 하는 글이라 textSecondary(옅은 회색은 canvas 위 4.5:1 이 안 됐다).
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
            <AppText variant="caption" color="textSecondary">
              {subtitle}
            </AppText>
          ) : null}
        </View>
      ) : null}
      <View style={[styles.card, styles.padded, card, contentStyle]}>{children}</View>
      {footer ? (
        <AppText variant="caption" color="textSecondary" style={styles.footer}>
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
          <AppText variant="caption" color="textSecondary">
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
            <AppText variant="caption" color="textSecondary">
              {subtitle}
            </AppText>
          ) : null}
        </View>
      ) : null}
      {/* 누름 색이 모서리 밖으로 나가지 않게 안쪽 칸에서 자른다 (바깥 칸은 다크 모드 테두리) */}
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
        <AppText variant="caption" color="textSecondary" style={styles.footer}>
          {footer}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: Spacing.sm },
  head: { gap: 2, paddingHorizontal: Spacing.xs },
  // 카드 모서리 20 (1.4 지침: 카드 20~24)
  card: { borderRadius: Radius.lg },
  padded: { padding: Spacing.lg + 2, gap: Spacing.lg + 4 },
  fieldHead: { gap: 2, marginBottom: Spacing.sm + 2, marginLeft: 2 },
  clip: { borderRadius: Radius.lg, overflow: 'hidden' },
  // 줄 글자와 같은 자리(안쪽 여백 18)에서 시작해 오른쪽 끝까지 — 아이콘 타일이 없어져 들여 쓸 자리가 없다
  separator: { height: StyleSheet.hairlineWidth, marginLeft: Spacing.lg + 2 },
  footer: { paddingHorizontal: Spacing.xs, lineHeight: 17 },
});
