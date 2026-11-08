import { StyleSheet, View, type ViewStyle } from 'react-native';

import { Chip } from '@/components/ui/chip';
import { useInsetFill } from '@/components/ui/list-group';
import { Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

type ChipOn = 'background' | 'canvas';

/** 고르지 않은 칩 바탕 — 다크 모드의 카드 안은 surface 가 카드와 같은 색이라 한 단계 밝게 (흰 화면·카드 안 공통) */
function useIdleChip(on: ChipOn): ViewStyle | undefined {
  const fill = useInsetFill();
  const dark = useColorScheme() === 'dark';
  return dark && on === 'background' ? { backgroundColor: fill } : undefined;
}

interface TagPickerProps {
  options: readonly string[];
  value: string[];
  onChange: (next: string[]) => void;
  max?: number;
  tone?: 'primary' | 'accent';
  /** 칩이 놓인 바탕 (Chip 의 on) */
  on?: ChipOn;
}

/** 여러 개 고르는 칩 (최대 max 개) */
export function TagPicker({ options, value, onChange, max = 6, tone = 'primary', on = 'background' }: TagPickerProps) {
  const idle = useIdleChip(on);
  const toggle = (tag: string) => {
    if (value.includes(tag)) onChange(value.filter((t) => t !== tag));
    else if (value.length < max) onChange([...value, tag]);
  };
  return (
    <View style={styles.wrap}>
      {options.map((tag) => {
        const selected = value.includes(tag);
        return <Chip key={tag} label={tag} selected={selected} onPress={() => toggle(tag)} tone={tone} on={on} style={selected ? undefined : idle} />;
      })}
    </View>
  );
}

export interface ChoiceOption<T extends string> {
  key: T;
  label: string;
  emoji?: string;
}

interface ChoiceChipsProps<T extends string> {
  options: readonly ChoiceOption<T>[];
  value: T | undefined;
  onChange: (next: T | undefined) => void;
  tone?: 'primary' | 'accent';
  /** 고른 칩을 다시 누르면 고름을 푼다 (목표처럼 선택 항목) */
  allowEmpty?: boolean;
  /** 칩을 한 줄에 같은 너비로 채운다 (성별처럼 2~3개일 때) */
  fill?: boolean;
  on?: ChipOn;
}

/** 하나만 고르는 칩 — 성별·관계·말투·목표 */
export function ChoiceChips<T extends string>({ options, value, onChange, tone = 'primary', allowEmpty = false, fill = false, on = 'background' }: ChoiceChipsProps<T>) {
  const idle = useIdleChip(on);
  return (
    <View style={[styles.wrap, fill ? styles.nowrap : null]}>
      {options.map((o) => {
        const selected = value === o.key;
        return (
          <Chip
            key={o.key}
            label={o.label}
            emoji={o.emoji}
            selected={selected}
            tone={tone}
            on={on}
            onPress={() => onChange(selected && allowEmpty ? undefined : o.key)}
            style={StyleSheet.flatten([fill ? styles.fill : null, selected ? null : idle])}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  nowrap: { flexWrap: 'nowrap' },
  fill: { flex: 1, alignItems: 'center', paddingVertical: Spacing.md - 1 },
});
