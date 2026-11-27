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
import { L, isKo } from '@/lib/i18n';
import { CRUSH_STYLE_TAGS, GENDERS, MBTI_LIST, RELATIONSHIPS } from '@/lib/labels';
import { customPersona } from '@/lib/practice';
import type { Gender, Relationship } from '@/lib/types';
import { useAppStore } from '@/store/app-store';

const LEVELS = [
  { key: 1, label: L('쉬움', 'Easy') },
  { key: 2, label: L('보통', 'Medium') },
  { key: 3, label: L('어려움', 'Hard') },
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
      setNameError(L('이름을 적어주세요.', 'Add their name.'));
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
      scenario: scenario.trim() || L('평소처럼 카톡을 주고받는 사이예요.', 'We text each other pretty regularly.'),
      speech,
      difficulty,
    });
    const id = startPractice(persona);
    router.replace({ pathname: '/practice/[id]', params: { id } });
  };

  return (
    <Screen sheet keyboard contentStyle={styles.content}>
      <View style={styles.intro}>
        <AppText variant="title2">{L('어떤 상대와 연습할까요?', 'Who do you want to practice with?')}</AppText>
        <AppText variant="small" color="textSecondary">
          {L('실제 그 사람과 비슷하게 적을수록 연습이 실전 같아져요', 'The closer this is to the real person, the more real the practice feels')}
        </AppText>
      </View>
      <TextField
        label={L('상대 이름', 'Their name')}
        placeholder={L('예: 지우', 'e.g. Jordan')}
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
          {L('성별', 'Gender')}
        </AppText>
        <View style={styles.chips}>
          {GENDERS.map((g) => (
            <Chip key={g.key} label={g.label} selected={gender === g.key} onPress={() => setGender(g.key)} />
          ))}
        </View>
      </View>
      <View style={styles.twoCol}>
        <TextField label={L('나이', 'Age')} value={age} onChangeText={setAge} keyboardType="number-pad" maxLength={2} containerStyle={styles.col} />
        <View style={styles.col}>
          <AppText variant="smallStrong" color="textSecondary" style={styles.label}>
            MBTI
          </AppText>
          <Pressable accessibilityRole="button" accessibilityLabel={L(`MBTI ${mbti}, 바꾸기`, `MBTI ${mbti}, change`)} onPress={() => setMbtiOpen(true)} style={[styles.select, { backgroundColor: dark ? theme.surfaceElevated : theme.surface }]}>
            <AppText variant="body">{mbti}</AppText>
            <Ionicons name="chevron-down" size={18} color={theme.textTertiary} />
          </Pressable>
        </View>
      </View>
      <View>
        <AppText variant="smallStrong" color="textSecondary" style={styles.label}>
          {L('어떤 사이예요?', "What's your situation?")}
        </AppText>
        <View style={styles.chips}>
          {RELATIONSHIPS.map((r) => (
            <Chip key={r.key} label={r.label} selected={relationship === r.key} onPress={() => setRelationship(r.key)} />
          ))}
        </View>
      </View>
      {/* 존댓말·반말은 영어에 없다 — 영어판은 숨기고 casual(처음 값) 그대로 */}
      {isKo ? (
        <View>
          <AppText variant="smallStrong" color="textSecondary" style={styles.label}>
            상대 말투
          </AppText>
          <View style={styles.chips}>
            <Chip label="존댓말" selected={speech === 'polite'} onPress={() => setSpeech('polite')} />
            <Chip label="반말" selected={speech === 'casual'} onPress={() => setSpeech('casual')} />
          </View>
        </View>
      ) : null}
      <View>
        <AppText variant="smallStrong" color="textSecondary" style={styles.label}>
          {L('난이도', 'Difficulty')}
        </AppText>
        <View style={styles.chips}>
          {LEVELS.map((d) => (
            <Chip key={d.key} label={d.label} selected={difficulty === d.key} onPress={() => setDifficulty(d.key)} />
          ))}
        </View>
      </View>
      <View>
        <AppText variant="smallStrong" color="textSecondary" style={styles.label}>
          {L('성향 (최대 4개)', 'Personality (up to 4)')}
        </AppText>
        <TagPicker options={CRUSH_STYLE_TAGS} value={style} onChange={setStyle} max={4} />
      </View>
      <TextField
        label={L('상황 (선택)', 'Scenario (optional)')}
        placeholder={L('예: 동아리 뒤풀이에서 처음 얘기했고, 오늘 처음 카톡해요.', "e.g. We first talked at a friend's party, and today's our first time texting.")}
        value={scenario}
        onChangeText={setScenario}
        multiline
        maxLength={200}
      />
      <GradientButton title={L('연습 시작하기', 'Start practicing')} onPress={start} />
      <SelectSheet
        visible={mbtiOpen}
        title={L('MBTI 선택', 'Choose MBTI')}
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
