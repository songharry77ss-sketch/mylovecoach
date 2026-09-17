import { Ionicons } from '@expo/vector-icons';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/app-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

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

export function SelectSheet<T extends string>({ visible, title, options, value, onSelect, onClose, columns = 1 }: SelectSheetProps<T>) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="닫기" />
      <View style={[styles.sheet, { backgroundColor: theme.background, paddingBottom: insets.bottom + Spacing.lg }]}>
        <View style={[styles.handle, { backgroundColor: theme.border }]} />
        <AppText variant="title2" style={styles.title}>
          {title}
        </AppText>
        <ScrollView style={styles.scroll} contentContainerStyle={[styles.grid, columns > 1 ? styles.gridWrap : null]}>
          {options.map((opt) => {
            const selected = opt.key === value;
            return (
              <Pressable
                key={opt.key}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => {
                  onSelect(opt.key);
                  onClose();
                }}
                style={({ pressed }) => [
                  styles.option,
                  columns === 2 ? styles.half : columns === 4 ? styles.quarter : null,
                  { backgroundColor: selected ? theme.primarySoft : theme.surface, opacity: pressed ? 0.7 : 1 },
                ]}>
                <View style={styles.optionTexts}>
                  <AppText variant="bodyStrong" color={selected ? 'primary' : 'text'} align={columns === 4 ? 'center' : undefined}>
                    {opt.emoji ? `${opt.emoji} ${opt.label}` : opt.label}
                  </AppText>
                  {opt.description ? (
                    <AppText variant="caption" color="textSecondary">
                      {opt.description}
                    </AppText>
                  ) : null}
                </View>
                {selected && columns === 1 ? <Ionicons name="checkmark-circle" size={20} color={theme.primary} /> : null}
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: { borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl, paddingHorizontal: Spacing.lg, maxHeight: '75%' },
  handle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginTop: Spacing.md, marginBottom: Spacing.lg },
  title: { marginBottom: Spacing.lg },
  scroll: { flexGrow: 0 },
  grid: { gap: Spacing.sm, paddingBottom: Spacing.sm },
  gridWrap: { flexDirection: 'row', flexWrap: 'wrap' },
  option: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: Spacing.lg, borderRadius: Radius.md },
  half: { flexBasis: '48%', flexGrow: 1 },
  quarter: { flexBasis: '22%', flexGrow: 1, padding: Spacing.md, justifyContent: 'center' },
  optionTexts: { gap: 2, flexShrink: 1 },
});
