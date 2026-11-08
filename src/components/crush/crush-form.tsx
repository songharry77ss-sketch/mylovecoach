import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { CardSection, FormField } from '@/components/ui/list-group';
import { SelectField, SelectSheet } from '@/components/ui/select-sheet';
import { ChoiceChips, TagPicker } from '@/components/ui/tag-picker';
import { TextField } from '@/components/ui/text-field';
import { useToast } from '@/components/ui/toast';
import { Brand, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { pickImage } from '@/lib/images';
import { CRUSH_GOALS, CRUSH_STYLE_TAGS, GENDERS, MBTI_LIST, RELATIONSHIPS, SPEECH_OPTIONS } from '@/lib/labels';
import type { Crush, Gender, Relationship, SpeechPref } from '@/lib/types';

export type CrushFormValue = Omit<
  Crush,
  'id' | 'createdAt' | 'updatedAt' | 'lastMessageAt' | 'lastTemperature' | 'lastInterestScore' | 'heat' | 'heatLog' | 'detected' | 'report' | 'secret' | 'memory'
>;

interface CrushFormProps {
  initial?: Partial<CrushFormValue> & Pick<Partial<Crush>, 'detected'>;
  submitTitle: string;
  onSubmit: (value: CrushFormValue) => void;
}

const GOAL_OPTIONS = CRUSH_GOALS.map((g) => ({ key: g, label: g }));

/**
 * 채팅방 만들기·상대 정보 고치기 폼 (1.2 개편) — 옅은 회색 바탕(canvas) 위 흰 카드 묶음.
 * 사진 → 기본 정보 → 관계 → 답장 말투 → 상대에 대해 → 맨 아래 큰 버튼.
 */
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
  const [callName, setCallName] = useState(initial?.callName ?? '');
  const [speech, setSpeech] = useState<SpeechPref>(initial?.speech ?? 'auto');
  const [goal, setGoal] = useState<string | undefined>(initial?.goal);
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
      callName: callName.trim() || undefined,
      speech,
      goal,
    });
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.photoRow}>
        <Pressable accessibilityRole="button" accessibilityLabel="상대 사진 선택" onPress={choosePhoto} style={({ pressed }) => [styles.photo, pressed ? styles.pressed : null]}>
          <LinearGradient colors={Brand.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.photoRing}>
            <View style={[styles.photoInner, { backgroundColor: theme.canvas }]}>
              <Avatar name={name || '?'} uri={photoUri} size={84} />
            </View>
          </LinearGradient>
          <LinearGradient colors={Brand.button} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.photoBadge, { borderColor: theme.canvas }]}>
            <Ionicons name="camera" size={15} color={Brand.onBrand} />
          </LinearGradient>
        </Pressable>
        <AppText variant="caption" color="textTertiary">
          사진은 선택이에요. 기기에만 저장돼요.
        </AppText>
      </View>

      <CardSection title="기본 정보">
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
        <FormField label="성별">
          <ChoiceChips options={GENDERS} value={gender} onChange={(g) => g && setGender(g)} fill />
        </FormField>
        <View style={styles.twoCol}>
          <TextField label="나이 (선택)" placeholder="예: 26" value={age} onChangeText={setAge} keyboardType="number-pad" maxLength={2} containerStyle={styles.col} />
          <SelectField label="MBTI (선택)" value={mbti} onPress={() => setMbtiOpen(true)} accessibilityLabel={`MBTI ${mbti ?? '선택 안 함'}, 바꾸기`} style={styles.col} />
        </View>
      </CardSection>

      <CardSection title="관계">
        <FormField label="지금 어떤 사이예요?">
          <ChoiceChips options={RELATIONSHIPS} value={relationship} onChange={(r) => r && setRelationship(r)} tone="accent" />
        </FormField>
        <FormField label="이 사람과의 목표 (선택)">
          <ChoiceChips options={GOAL_OPTIONS} value={goal} onChange={setGoal} tone="accent" allowEmpty />
        </FormField>
      </CardSection>

      <CardSection title="답장 말투 맞추기">
        <TextField
          label="내가 부르는 호칭 (선택)"
          placeholder="예: 언니, 오빠, 선배님, 민지야"
          value={callName}
          onChangeText={setCallName}
          maxLength={12}
          helper={
            initial?.detected?.callName && !callName.trim()
              ? `캡처에서 읽은 호칭 「${initial.detected.callName}」을 쓰고 있어요. 비워 두면 계속 알아서 읽어요.`
              : '비워 두면 대화 캡처에서 알아서 읽어요. 답장도 같은 호칭으로 나와요.'
          }
        />
        <FormField label="답장 말투">
          <ChoiceChips options={SPEECH_OPTIONS} value={speech} onChange={(s) => s && setSpeech(s)} />
          <AppText variant="caption" color="textTertiary" style={styles.helper}>
            {speech === 'auto'
              ? initial?.detected?.speech
                ? `캡처에서 ${initial.detected.speech === 'polite' ? '존댓말' : '반말'}을 쓰고 있어서 그대로 이어가요.`
                : '존댓말을 쓰던 사이면 존댓말로, 반말이면 반말로 이어가요.'
              : SPEECH_OPTIONS.find((o) => o.key === speech)?.description}
          </AppText>
        </FormField>
      </CardSection>

      <CardSection title="상대에 대해">
        <FormField label="상대 스타일" hint="최대 6개 · 코치가 참고해요">
          <TagPicker options={CRUSH_STYLE_TAGS} value={style} onChange={setStyle} max={6} />
        </FormField>
        <TextField
          label="메모 (선택)"
          placeholder="어떻게 알게 됐는지, 최근 있었던 일, 상대가 좋아하는 것 등"
          value={notes}
          onChangeText={setNotes}
          multiline
          maxLength={500}
        />
      </CardSection>

      <Button title={submitTitle} variant="brand" onPress={submit} style={styles.submit} />

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
  pressed: { opacity: 0.85 },
  photoRow: { alignItems: 'center', gap: Spacing.sm },
  photo: { position: 'relative' },
  photoRing: { padding: 3, borderRadius: 38 },
  photoInner: { padding: 3, borderRadius: 35 },
  photoBadge: { position: 'absolute', right: -2, bottom: -2, width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', borderWidth: 3 },
  helper: { marginTop: Spacing.sm, marginLeft: Spacing.xs },
  twoCol: { flexDirection: 'row', gap: Spacing.md },
  col: { flex: 1 },
  submit: { marginTop: Spacing.xs },
});
