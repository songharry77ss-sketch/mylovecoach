import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { SectionHeader } from '@/components/ui/section-header';
import { SelectSheet } from '@/components/ui/select-sheet';
import { TagPicker } from '@/components/ui/tag-picker';
import { TextField } from '@/components/ui/text-field';
import { useToast } from '@/components/ui/toast';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { pickImage } from '@/lib/images';
import { CRUSH_STYLE_TAGS, GENDERS, MBTI_LIST, RELATIONSHIPS } from '@/lib/labels';
import type { Crush, Gender, Relationship } from '@/lib/types';

export type CrushFormValue = Omit<Crush, 'id' | 'createdAt' | 'updatedAt' | 'lastMessageAt' | 'lastTemperature' | 'lastInterestScore'>;

interface CrushFormProps {
  initial?: Partial<CrushFormValue>;
  submitTitle: string;
  onSubmit: (value: CrushFormValue) => void;
}

export function CrushForm({ initial, submitTitle, onSubmit }: CrushFormProps) {
  const theme = useTheme();
  const toast = useToast();
  const [name, setName] = useState(initial?.name ?? '');
  const [gender, setGender] = useState<Gender>(initial?.gender ?? 'female');
  const [age, setAge] = useState(initial?.age ? String(initial.age) : '');
  const [mbti, setMbti] = useState<string | undefined>(initial?.mbti);
  const [relationship, setRelationship] = useState<Relationship>(initial?.relationship ?? 'talking');
  const [style, setStyle] = useState<string[]>(initial?.style ?? []);
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [photoUri, setPhotoUri] = useState<string | undefined>(initial?.photoUri);
  const [mbtiOpen, setMbtiOpen] = useState(false);
  const [nameError, setNameError] = useState<string | undefined>();

  const choosePhoto = async () => {
    try {
      const picked = await pickImage('photo');
      if (picked) setPhotoUri(picked.uri);
    } catch (e) {
      toast.show(e instanceof Error ? e.message : '사진을 불러오지 못했어요.', 'error');
    }
  };

  const submit = () => {
    if (!name.trim()) {
      setNameError('이름 또는 별명을 입력해주세요.');
      return;
    }
    const parsedAge = age.trim() ? Number(age) : undefined;
    onSubmit({
      name: name.trim(),
      gender,
      age: parsedAge && Number.isFinite(parsedAge) ? parsedAge : undefined,
      mbti,
      relationship,
      style,
      notes: notes.trim(),
      photoUri,
    });
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.photoRow}>
        <Pressable accessibilityRole="button" accessibilityLabel="상대 사진 선택" onPress={choosePhoto} style={styles.photo}>
          <Avatar name={name || '?'} uri={photoUri} size={84} />
          <View style={[styles.photoBadge, { backgroundColor: theme.primary }]}>
            <Ionicons name="camera" size={14} color={theme.primaryText} />
          </View>
        </Pressable>
        <AppText variant="caption" color="textTertiary">
          사진은 선택이에요. 기기에만 저장돼요.
        </AppText>
      </View>

      <TextField
        label="이름 / 별명"
        placeholder="예: 민지"
        value={name}
        onChangeText={(t) => {
          setName(t);
          if (nameError) setNameError(undefined);
        }}
        error={nameError}
        maxLength={20}
        returnKeyType="done"
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
        <TextField label="나이 (선택)" placeholder="예: 26" value={age} onChangeText={setAge} keyboardType="number-pad" maxLength={2} containerStyle={styles.col} />
        <View style={styles.col}>
          <AppText variant="smallStrong" color="textSecondary" style={styles.label}>
            MBTI (선택)
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
          지금 어떤 사이예요?
        </AppText>
        <View style={styles.chips}>
          {RELATIONSHIPS.map((r) => (
            <Chip key={r.key} label={r.label} emoji={r.emoji} selected={relationship === r.key} onPress={() => setRelationship(r.key)} tone="accent" />
          ))}
        </View>
      </View>

      <View>
        <SectionHeader title="상대 스타일" subtitle="최대 6개 · 코치가 참고해요" />
        <TagPicker options={CRUSH_STYLE_TAGS} value={style} onChange={setStyle} max={6} />
      </View>

      <TextField
        label="메모 (선택)"
        placeholder="어떻게 알게 됐는지, 최근 있었던 일, 상대가 좋아하는 것 등"
        value={notes}
        onChangeText={setNotes}
        multiline
        maxLength={500}
      />

      <Button title={submitTitle} onPress={submit} style={styles.submit} />

      <SelectSheet
        visible={mbtiOpen}
        title="MBTI 선택"
        columns={4}
        options={[{ key: '__none', label: '모름' }, ...MBTI_LIST.map((m) => ({ key: m, label: m }))]}
        value={mbti ?? '__none'}
        onSelect={(k) => setMbti(k === '__none' ? undefined : k)}
        onClose={() => setMbtiOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.xl, paddingTop: Spacing.sm },
  photoRow: { alignItems: 'center', gap: Spacing.sm },
  photo: { position: 'relative' },
  photoBadge: { position: 'absolute', right: -4, bottom: -4, width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#fff' },
  label: { marginBottom: Spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  twoCol: { flexDirection: 'row', gap: Spacing.md },
  col: { flex: 1 },
  select: { height: 54, borderRadius: Radius.md, paddingHorizontal: Spacing.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  submit: { marginTop: Spacing.sm },
});
