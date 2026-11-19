import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { GradientButton } from '@/components/brand/brand';
import { AppText } from '@/components/ui/app-text';
import { Chip } from '@/components/ui/chip';
import { Screen } from '@/components/ui/screen';
import { SelectSheet } from '@/components/ui/select-sheet';
import { TagPicker } from '@/components/ui/tag-picker';
import { TextField } from '@/components/ui/text-field';
import { Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';
import { haptic } from '@/lib/haptics';
import { CRUSH_STYLE_TAGS, GENDERS, MBTI_LIST, RELATIONSHIPS } from '@/lib/labels';
import { customPersona } from '@/lib/practice';
import type { Gender, Relationship } from '@/lib/types';
import { useAppStore } from '@/store/app-store';

const LEVELS = [
  { key: 1, label: '쉬움' },
  { key: 2, label: '보통' },
  { key: 3, label: '어려움' },
] as const;

/**
 * 연습 상대 직접 만들기.
 * 1.4 「깔끔하게」 개편: 떠다니는 3D 하트, 칩 앞 이모지(🙇 👋)·별(★☆)을 걷었다. 고른 칩은 검정(Chip), 색은 아래 「연습 시작하기」 하나.
 */
export default function CustomPersonaScreen() {
  const theme = useTheme();
  const dark = useColorScheme() === 'dark';
  const router = useRouter();
  const startPractice = useAppStore((s) => s.startPractice);
  const [name, setName] = useState('');
  const [gender, setGender] = useState<Gender>('female');
  const [age, setAge] = useState('27');
  const [mbti, setMbti] = useState('ENFP');
  const [style, setStyle] = useState<string[]>([]);
  const [relationship, setRelationship] = useState<Relationship>('talking');
  const [scenario, setScenario] = useState('');
  const [speech, setSpeech] = useState<'polite' | 'casual'>('casual');
  const [difficulty, setDifficulty] = useState<1 | 2 | 3>(2);
  const [mbtiOpen, setMbtiOpen] = useState(false);
  const [nameError, setNameError] = useState<string>();

  const start = () => {
    if (!name.trim()) {
      haptic.warning();
      setNameError('이름을 적어주세요.');
      return;
    }
    const parsedAge = Number(age);
    const persona = customPersona({
      name: name.trim(),
      gender,
      age: Number.isFinite(parsedAge) && parsedAge > 0 ? parsedAge : 27,
      mbti,
      style,
      relationship,
      scenario: scenario.trim() || '평소처럼 카톡을 주고받는 사이예요.',
      speech,
      difficulty,
    });
    const id = startPractice(persona);
    router.replace({ pathname: '/practice/[id]', params: { id } });
  };

  return (
    <Screen sheet keyboard contentStyle={styles.content}>
      <View style={styles.intro}>
        <AppText variant="title2">어떤 상대와 연습할까요?</AppText>
        <AppText variant="small" color="textSecondary">
          실제 그 사람과 비슷하게 적을수록 연습이 실전 같아져요
        </AppText>
      </View>
      <TextField
        label="상대 이름"
        placeholder="예: 지우"
        value={name}
        onChangeText={(t) => {
          setName(t);
          setNameError(undefined);
        }}
        error={nameError}
        maxLength={12}
      />
      <View>
        <AppText variant="smallStrong" color="textSecondary" style={styles.label}>
          성별
        </AppText>
        <View style={styles.chips}>
          {GENDERS.map((g) => (
            <Chip key={g.key} label={g.label} selected={gender === g.key} onPress={() => setGender(g.key)} />
          ))}
        </View>
      </View>
      <View style={styles.twoCol}>
        <TextField label="나이" value={age} onChangeText={setAge} keyboardType="number-pad" maxLength={2} containerStyle={styles.col} />
        <View style={styles.col}>
          <AppText variant="smallStrong" color="textSecondary" style={styles.label}>
            MBTI
          </AppText>
          <Pressable accessibilityRole="button" accessibilityLabel={`MBTI ${mbti}, 바꾸기`} onPress={() => setMbtiOpen(true)} style={[styles.select, { backgroundColor: dark ? theme.surfaceElevated : theme.surface }]}>
            <AppText variant="body">{mbti}</AppText>
            <Ionicons name="chevron-down" size={18} color={theme.textTertiary} />
          </Pressable>
        </View>
      </View>
      <View>
        <AppText variant="smallStrong" color="textSecondary" style={styles.label}>
          어떤 사이예요?
        </AppText>
        <View style={styles.chips}>
          {RELATIONSHIPS.map((r) => (
            <Chip key={r.key} label={r.label} selected={relationship === r.key} onPress={() => setRelationship(r.key)} />
          ))}
        </View>
      </View>
      <View>
        <AppText variant="smallStrong" color="textSecondary" style={styles.label}>
          상대 말투
        </AppText>
        <View style={styles.chips}>
          <Chip label="존댓말" selected={speech === 'polite'} onPress={() => setSpeech('polite')} />
          <Chip label="반말" selected={speech === 'casual'} onPress={() => setSpeech('casual')} />
        </View>
      </View>
      <View>
        <AppText variant="smallStrong" color="textSecondary" style={styles.label}>
          난이도
        </AppText>
        <View style={styles.chips}>
          {LEVELS.map((d) => (
            <Chip key={d.key} label={d.label} selected={difficulty === d.key} onPress={() => setDifficulty(d.key)} />
          ))}
        </View>
      </View>
      <View>
        <AppText variant="smallStrong" color="textSecondary" style={styles.label}>
          성향 (최대 4개)
        </AppText>
        <TagPicker options={CRUSH_STYLE_TAGS} value={style} onChange={setStyle} max={4} />
      </View>
      <TextField
        label="상황 (선택)"
        placeholder="예: 동아리 뒤풀이에서 처음 얘기했고, 오늘 처음 카톡해요."
        value={scenario}
        onChangeText={setScenario}
        multiline
        maxLength={200}
      />
      <GradientButton title="연습 시작하기" onPress={start} />
      <SelectSheet
        visible={mbtiOpen}
        title="MBTI 선택"
        columns={4}
        options={MBTI_LIST.map((m) => ({ key: m, label: m }))}
        value={mbti}
        onSelect={(k) => setMbti(k)}
        onClose={() => setMbtiOpen(false)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: Spacing.xl, paddingTop: Spacing.lg },
  intro: { gap: 4 },
  label: { marginBottom: Spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  twoCol: { flexDirection: 'row', gap: Spacing.md },
  col: { flex: 1 },
  select: { height: 54, borderRadius: 14, paddingHorizontal: Spacing.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
