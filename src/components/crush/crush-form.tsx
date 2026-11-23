import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { CardSection, FormField, useCardStyle, useInsetFill } from '@/components/ui/list-group';
import { SelectField, SelectSheet } from '@/components/ui/select-sheet';
import { ChoiceChips, TagPicker } from '@/components/ui/tag-picker';
import { TextField } from '@/components/ui/text-field';
import { useToast } from '@/components/ui/toast';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { haptic } from '@/lib/haptics';
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
/** 라벨 앞 이모지(「🪞 캡처 따라」)는 칩에 그리지 않는다 — 1.4 「AI 티」 (labels.ts 값은 다른 화면도 써서 여기서만 뗀다) */
const plainLabel = (label: string) => {
  const space = label.indexOf(' ');
  return space > 0 && !/[가-힣A-Za-z0-9]/.test(label.slice(0, space)) ? label.slice(space + 1) : label;
};
const SPEECH_CHOICES = SPEECH_OPTIONS.map((o) => ({ ...o, label: plainLabel(o.label) }));

/**
 * 채팅방 만들기·상대 정보 고치기 폼 (1.2 개편) — 옅은 회색 바탕(canvas) 위 흰 카드 묶음.
 * 1.4 「깔끔하게」 개편(점검 4.13 — 「+」 구슬이 여는 폼이 화면 세 장 길이였다):
 * - 새 채팅방은 꼭 필요한 것(이름 · 성별 · 관계)만 펼쳐 두고, 나이·MBTI·목표·호칭·말투·상대 스타일·메모는 「더 알려 주기」 안에 접어 둔다
 *   (필드·기본값·저장하는 값은 예전과 같다 — 접혀 있어도 비워 둔 채로 저장된다). 상대 정보 수정은 처음부터 다 펼쳐 둔다.
 * - 그라데이션 사진 테두리·배지, 선택 색 두 가지(파랑·보라), 칩 이모지를 걷었다 — 고른 칩은 검정 한 가지(Chip).
 */
export function CrushForm({ initial, submitTitle, onSubmit }: CrushFormProps) {
  const theme = useTheme();
  const fill = useInsetFill();
  const card = useCardStyle();
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
  // 수정(initial 있음)은 처음부터 다 보이고, 새 채팅방은 접어 둔다
  const [more, setMore] = useState(Boolean(initial));

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

  const openMore = () => {
    haptic.select();
    setMore((v) => !v);
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.photoRow}>
        <Pressable accessibilityRole="button" accessibilityLabel="상대 사진 선택" onPress={choosePhoto} style={({ pressed }) => [styles.photo, pressed ? styles.pressed : null]}>
          {photoUri || name.trim() ? (
            // 옅은 얼굴 원이 옅은 바탕(canvas)에 묻히지 않게 가는 테두리
            <View style={[styles.photoRing, { borderColor: theme.border }]}>
              <Avatar name={name.trim() || '?'} uri={photoUri} size={80} />
            </View>
          ) : (
            // 아직 이름도 사진도 없으면 「?」 대신 카메라 — 「?」는 오류 표시처럼 보였다
            <View style={[styles.photoBlank, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <Ionicons name="camera-outline" size={28} color={theme.textSecondary} />
            </View>
          )}
          {photoUri || name.trim() ? (
            <View style={[styles.photoBadge, { backgroundColor: theme.card, borderColor: theme.canvas }]}>
              <Ionicons name="camera-outline" size={15} color={theme.textSecondary} />
            </View>
          ) : null}
        </Pressable>
        <AppText variant="caption" color="textSecondary">
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
        <FormField label="지금 어떤 사이예요?">
          <ChoiceChips options={RELATIONSHIPS} value={relationship} onChange={(r) => r && setRelationship(r)} />
        </FormField>
        {more ? (
          <View style={styles.twoCol}>
            <TextField label="나이 (선택)" placeholder="예: 26" value={age} onChangeText={setAge} keyboardType="number-pad" maxLength={2} containerStyle={styles.col} />
            <SelectField label="MBTI (선택)" value={mbti} onPress={() => setMbtiOpen(true)} accessibilityLabel={`MBTI ${mbti ?? '선택 안 함'}, 바꾸기`} style={styles.col} />
          </View>
        ) : null}
      </CardSection>

      {more ? (
        <>
          <CardSection title="이 사람과의 목표 (선택)">
            <ChoiceChips options={GOAL_OPTIONS} value={goal} onChange={setGoal} allowEmpty />
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
              <ChoiceChips options={SPEECH_CHOICES} value={speech} onChange={(s) => s && setSpeech(s)} />
              <AppText variant="caption" color="textSecondary" style={styles.helper}>
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
        </>
      ) : (
        // 새 채팅방 — 나머지는 접어 두고, 방 안 「상대 정보」에서도 언제든 채울 수 있다
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="더 알려 주기, 나이·MBTI·목표·호칭·말투·상대 스타일·메모"
          accessibilityState={{ expanded: false }}
          onPress={openMore}
          style={({ pressed }) => [styles.moreRow, card, pressed ? { backgroundColor: fill } : null]}>
          <View style={styles.flex}>
            <AppText variant="bodyStrong">더 알려 주기 (선택)</AppText>
            <AppText variant="small" color="textSecondary" style={styles.moreHint}>
              나이·MBTI·목표·호칭·말투·상대 스타일·메모 — 안 적어도 캡처에서 알아서 읽어요
            </AppText>
          </View>
          <Ionicons name="chevron-down" size={18} color={theme.textSecondary} />
        </Pressable>
      )}

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
  flex: { flex: 1 },
  pressed: { opacity: 0.85 },
  photoRow: { alignItems: 'center', gap: Spacing.sm },
  photo: { position: 'relative' },
  photoRing: { borderRadius: 41, borderWidth: 1 },
  photoBlank: { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth },
  photoBadge: { position: 'absolute', right: -4, bottom: -4, width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', borderWidth: 3 },
  helper: { marginTop: Spacing.sm, marginLeft: Spacing.xs },
  twoCol: { flexDirection: 'row', gap: Spacing.md },
  col: { flex: 1 },
  moreRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, borderRadius: 20, paddingHorizontal: Spacing.lg + 2, paddingVertical: Spacing.lg, minHeight: 56, marginTop: -Spacing.sm },
  moreHint: { fontSize: 13, lineHeight: 19, marginTop: 2 },
  submit: { marginTop: Spacing.xs },
});
