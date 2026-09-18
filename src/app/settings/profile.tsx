import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { Screen } from '@/components/ui/screen';
import { SelectSheet } from '@/components/ui/select-sheet';
import { TagPicker } from '@/components/ui/tag-picker';
import { TextField } from '@/components/ui/text-field';
import { useToast } from '@/components/ui/toast';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { GENDERS, MBTI_LIST, MY_STYLE_TAGS, TONES } from '@/lib/labels';
import type { Gender, Tone } from '@/lib/types';
import { useAppStore } from '@/store/app-store';

export default function ProfileSettings() {
  const theme = useTheme();
  const router = useRouter();
  const toast = useToast();
  const user = useAppStore((s) => s.user);
  const setUser = useAppStore((s) => s.setUser);

  const [name, setName] = useState(user?.name ?? '');
  const [gender, setGender] = useState<Gender>(user?.gender ?? 'male');
  const [age, setAge] = useState(user?.age ? String(user.age) : '');
  const [mbti, setMbti] = useState<string | undefined>(user?.mbti);
  const [style, setStyle] = useState<string[]>(user?.style ?? []);
  const [tone, setTone] = useState<Tone>(user?.defaultTone ?? 'natural');
  const [mbtiOpen, setMbtiOpen] = useState(false);

  const save = () => {
    const parsedAge = age.trim() ? Number(age) : undefined;
    setUser({
      name: name.trim(),
      gender,
      age: parsedAge && Number.isFinite(parsedAge) ? parsedAge : undefined,
      mbti,
      style,
      defaultTone: tone,
      createdAt: user?.createdAt ?? Date.now(),
    });
    toast.show('프로필을 저장했어요.', 'success');
    router.back();
  };

  return (
    <Screen keyboard contentStyle={styles.content}>
      <TextField label="이름 / 별명" value={name} onChangeText={setName} maxLength={20} />
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
          <Pressable accessibilityRole="button" onPress={() => setMbtiOpen(true)} style={[styles.select, { backgroundColor: theme.surface }]}>
            <AppText variant="body" color={mbti ? 'text' : 'textTertiary'}>
              {mbti ?? '선택하기'}
            </AppText>
            <Ionicons name="chevron-down" size={18} color={theme.textTertiary} />
          </Pressable>
        </View>
      </View>
      <View>
        <AppText variant="smallStrong" color="textSecondary" style={styles.label}>
          나의 스타일
        </AppText>
        <TagPicker options={MY_STYLE_TAGS} value={style} onChange={setStyle} max={5} />
      </View>
      <View>
        <AppText variant="smallStrong" color="textSecondary" style={styles.label}>
          기본 답장 톤
        </AppText>
        <View style={styles.chips}>
          {TONES.map((t) => (
            <Chip key={t.key} label={t.label} emoji={t.emoji} selected={tone === t.key} onPress={() => setTone(t.key)} tone="accent" />
          ))}
        </View>
      </View>
      <Button title="저장" onPress={save} />
      <SelectSheet
        visible={mbtiOpen}
        title="MBTI 선택"
        columns={4}
        options={[{ key: '__none', label: '모름' }, ...MBTI_LIST.map((m) => ({ key: m, label: m }))]}
        value={mbti ?? '__none'}
        onSelect={(k) => setMbti(k === '__none' ? undefined : k)}
        onClose={() => setMbtiOpen(false)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: Spacing.xl, paddingTop: Spacing.lg },
  label: { marginBottom: Spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  twoCol: { flexDirection: 'row', gap: Spacing.md },
  col: { flex: 1 },
  select: { height: 54, borderRadius: Radius.md, paddingHorizontal: Spacing.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
