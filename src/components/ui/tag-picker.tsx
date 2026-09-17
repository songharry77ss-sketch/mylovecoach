import { StyleSheet, View } from 'react-native';

import { Chip } from '@/components/ui/chip';
import { Spacing } from '@/constants/theme';

interface TagPickerProps {
  options: readonly string[];
  value: string[];
  onChange: (next: string[]) => void;
  max?: number;
  tone?: 'primary' | 'accent';
}

export function TagPicker({ options, value, onChange, max = 6, tone = 'primary' }: TagPickerProps) {
  const toggle = (tag: string) => {
    if (value.includes(tag)) onChange(value.filter((t) => t !== tag));
    else if (value.length < max) onChange([...value, tag]);
  };
  return (
    <View style={styles.wrap}>
      {options.map((tag) => (
        <Chip key={tag} label={tag} selected={value.includes(tag)} onPress={() => toggle(tag)} tone={tone} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({ wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm } });
