import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/app-text';
import { useInsetFill } from '@/components/ui/list-group';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { haptic } from '@/lib/haptics';

const GAP = Spacing.sm;

export interface SelectOption<T extends string> {
  key: T;
  label: string;
  emoji?: string;
  description?: string;
}

interface SelectSheetProps<T extends string> {
  visible: boolean;
  title: string;
  options: readonly SelectOption<T>[];
  value?: T;
  onSelect: (key: T) => void;
  onClose: () => void;
  columns?: 1 | 2 | 4;
}

/** 아래에서 올라오는 고르기 시트 — 고르면 바로 닫힌다 */
export function SelectSheet<T extends string>({ visible, title, options, value, onSelect, onClose, columns = 1 }: SelectSheetProps<T>) {
  const theme = useTheme();
  const fill = useInsetFill();
  const insets = useSafeAreaInsets();
  // 여러 칸(2·4열)은 실제 너비를 재서 칸 너비를 똑같이 — 마지막 줄 칸이 혼자 늘어나지 않게
  const [gridWidth, setGridWidth] = useState(0);
  const cellWidth = columns > 1 && gridWidth > 0 ? Math.floor((gridWidth - GAP * (columns - 1)) / columns) : undefined;
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="닫기" />
      <View style={[styles.sheet, { backgroundColor: theme.card, paddingBottom: insets.bottom + Spacing.lg }]}>
        <View style={[styles.handle, { backgroundColor: theme.border }]} />
        <View style={styles.head}>
          <AppText variant="title2" weight="800" style={styles.flex}>
            {title}
          </AppText>
          <Pressable accessibilityRole="button" accessibilityLabel="닫기" onPress={onClose} hitSlop={10} style={({ pressed }) => [styles.close, { backgroundColor: fill }, pressed ? styles.pressed : null]}>
            <Ionicons name="close" size={18} color={theme.textSecondary} />
          </Pressable>
        </View>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.grid, columns > 1 ? styles.gridWrap : null]}
          onLayout={(e) => setGridWidth(e.nativeEvent.layout.width)}
          showsVerticalScrollIndicator={false}>
          {options.map((opt) => {
            const selected = opt.key === value;
            return (
              <Pressable
                key={opt.key}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => {
                  haptic.select();
                  onSelect(opt.key);
                  onClose();
                }}
                style={({ pressed }) => [
                  styles.option,
                  columns === 2 ? styles.half : columns === 4 ? styles.quarter : null,
                  cellWidth ? { width: cellWidth, flexBasis: 'auto', flexGrow: 0 } : null,
                  { backgroundColor: selected ? theme.primarySoft : fill, borderColor: selected ? theme.primary : 'transparent', opacity: pressed ? 0.7 : 1 },
                ]}>
                <View style={styles.optionTexts}>
                  <AppText variant="bodyStrong" weight={selected ? '800' : undefined} color={selected ? 'primary' : 'text'} align={columns === 4 ? 'center' : undefined}>
                    {opt.emoji ? `${opt.emoji} ${opt.label}` : opt.label}
                  </AppText>
                  {opt.description ? (
                    <AppText variant="caption" color="textSecondary">
                      {opt.description}
                    </AppText>
                  ) : null}
                </View>
                {selected && columns === 1 ? <Ionicons name="checkmark-circle" size={22} color={theme.primary} /> : null}
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    </Modal>
  );
}

interface SelectFieldProps {
  label?: string;
  /** 고른 값 (없으면 placeholder 를 흐리게) */
  value?: string;
  placeholder?: string;
  onPress: () => void;
  accessibilityLabel?: string;
  style?: ViewStyle;
}

/** 고르기 시트를 여는 칸 — TextField 와 같은 모양(높이 52·모서리 14) */
export function SelectField({ label, value, placeholder = '선택하기', onPress, accessibilityLabel, style }: SelectFieldProps) {
  const theme = useTheme();
  const fill = useInsetFill();
  return (
    <View style={style}>
      {label ? (
        <AppText variant="smallStrong" color="textSecondary" style={styles.fieldLabel}>
          {label}
        </AppText>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? `${label ?? ''} ${value ?? placeholder}, 바꾸기`.trim()}
        onPress={onPress}
        style={({ pressed }) => [styles.field, { backgroundColor: fill }, pressed ? styles.pressed : null]}>
        <AppText variant="body" weight={value ? '600' : undefined} color={value ? 'text' : 'textTertiary'}>
          {value ?? placeholder}
        </AppText>
        <Ionicons name="chevron-down" size={18} color={theme.textTertiary} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pressed: { opacity: 0.7 },
  backdrop: { flex: 1, backgroundColor: 'rgba(10,14,30,0.4)' },
  sheet: { borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl, paddingHorizontal: Spacing.lg, maxHeight: '75%' },
  handle: { width: 40, height: 5, borderRadius: 3, alignSelf: 'center', marginTop: Spacing.sm + 2, marginBottom: Spacing.md },
  head: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, marginBottom: Spacing.lg, paddingLeft: Spacing.xs },
  close: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  scroll: { flexGrow: 0 },
  grid: { gap: GAP, paddingBottom: Spacing.sm },
  gridWrap: { flexDirection: 'row', flexWrap: 'wrap' },
  option: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 52, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, borderRadius: Radius.md, borderWidth: 1.5 },
  half: { flexBasis: '48%', flexGrow: 1 },
  quarter: { flexBasis: '22%', flexGrow: 1, paddingHorizontal: Spacing.sm, justifyContent: 'center' },
  optionTexts: { gap: 2, flexShrink: 1 },
  fieldLabel: { marginBottom: Spacing.sm, marginLeft: 2 },
  field: { height: 52, borderRadius: Radius.md, paddingHorizontal: Spacing.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
