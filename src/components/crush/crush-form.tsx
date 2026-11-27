import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { isUnnamedCrush } from '@/components/crush/crush-name';
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
import { errorText } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { isEn, isKo, L } from '@/lib/i18n';
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
  // 영어판: 이름 없는 상대(저장값 '상대')는 빈칸으로 보여 주고, 비운 채 저장하면 그대로 「이름 없음」으로 둔다
  const unnamed = isEn && isUnnamedCrush(initial?.name);
  const [name, setName] = useState(unnamed ? '' : (initial?.name ?? ''));
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
      toast.show(errorText(e, '사진을 불러오지 못했어요.', 'Couldn’t load the photo.'), 'error');
    }
  };

  const submit = () => {
    const finalName = name.trim() || (unnamed && initial?.name ? initial.name : '');
    if (!finalName) {
      setNameError(L('이름 또는 별명을 입력해주세요.', 'Enter a name or nickname.'));
      return;
    }
    const parsedAge = age.trim() ? Number(age) : undefined;
    onSubmit({
      name: finalName,
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
        <Pressable accessibilityRole="button" accessibilityLabel={L('상대 사진 선택', 'Choose their photo')} onPress={choosePhoto} style={({ pressed }) => [styles.photo, pressed ? styles.pressed : null]}>
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
          {L('사진은 선택이에요. 기기에만 저장돼요.', 'Photo is optional. It stays on your device.')}
        </AppText>
      </View>

      <CardSection title={L('기본 정보', 'Basics')}>
        <TextField
          label={L('이름 / 별명', 'Name / nickname')}
          placeholder={L('예: 민지', 'e.g. Emma')}
          value={name}
          onChangeText={(t) => {
            setName(t);
            if (nameError) setNameError(undefined);
          }}
          error={nameError}
          maxLength={20}
          returnKeyType="done"
        />
        <FormField label={L('성별', 'Gender')}>
          <ChoiceChips options={GENDERS} value={gender} onChange={(g) => g && setGender(g)} fill />
        </FormField>
        <FormField label={L('지금 어떤 사이예요?', 'What are you two?')}>
          <ChoiceChips options={RELATIONSHIPS} value={relationship} onChange={(r) => r && setRelationship(r)} />
        </FormField>
        {more ? (
          <View style={styles.twoCol}>
            <TextField label={L('나이 (선택)', 'Age (optional)')} placeholder={L('예: 26', 'e.g. 26')} value={age} onChangeText={setAge} keyboardType="number-pad" maxLength={2} containerStyle={styles.col} />
            <SelectField
              label={L('MBTI (선택)', 'MBTI (optional)')}
              value={mbti}
              onPress={() => setMbtiOpen(true)}
              accessibilityLabel={L(`MBTI ${mbti ?? '선택 안 함'}, 바꾸기`, `MBTI ${mbti ?? 'not set'}, change`)}
              style={styles.col}
            />
          </View>
        ) : null}
      </CardSection>

      {more ? (
        <>
          <CardSection title={L('이 사람과의 목표 (선택)', 'Your goal with them (optional)')}>
            <ChoiceChips options={GOAL_OPTIONS} value={goal} onChange={setGoal} allowEmpty />
          </CardSection>

          <CardSection title={L('답장 말투 맞추기', 'Match your texting style')}>
            <TextField
              label={L('내가 부르는 호칭 (선택)', 'What you call them (optional)')}
              placeholder={L('예: 언니, 오빠, 선배님, 민지야', 'e.g. babe, Em, Mr. Smith')}
              value={callName}
              onChangeText={setCallName}
              maxLength={12}
              helper={
                initial?.detected?.callName && !callName.trim()
                  ? L(
                      `캡처에서 읽은 호칭 「${initial.detected.callName}」을 쓰고 있어요. 비워 두면 계속 알아서 읽어요.`,
                      `Using “${initial.detected.callName}” from your screenshot. Leave blank and I’ll keep picking it up.`,
                    )
                  : L('비워 두면 대화 캡처에서 알아서 읽어요. 답장도 같은 호칭으로 나와요.', 'Leave blank and I’ll pick it up from your screenshots. Replies will use the same name.')
              }
            />
            {/* 존댓말·반말은 영어에 없는 구분이라 영어판에서는 숨긴다 (값은 auto 그대로 저장) */}
            {isKo ? (
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
            ) : null}
          </CardSection>

          <CardSection title={L('상대에 대해', 'About them')}>
            <FormField label={L('상대 스타일', 'Their vibe')} hint={L('최대 6개 · 코치가 참고해요', 'Up to 6 · Your coach uses these')}>
              <TagPicker options={CRUSH_STYLE_TAGS} value={style} onChange={setStyle} max={6} />
            </FormField>
            <TextField
              label={L('메모 (선택)', 'Notes (optional)')}
              placeholder={L('어떻게 알게 됐는지, 최근 있었던 일, 상대가 좋아하는 것 등', 'How you met, what happened lately, things they like…')}
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
          accessibilityLabel={L('더 알려 주기, 나이·MBTI·목표·호칭·말투·상대 스타일·메모', 'Add more: age, MBTI, goal, nickname, their vibe, notes')}
          accessibilityState={{ expanded: false }}
          onPress={openMore}
          style={({ pressed }) => [styles.moreRow, card, pressed ? { backgroundColor: fill } : null]}>
          <View style={styles.flex}>
            <AppText variant="bodyStrong">{L('더 알려 주기 (선택)', 'Add more (optional)')}</AppText>
            <AppText variant="small" color="textSecondary" style={styles.moreHint}>
              {L('나이·MBTI·목표·호칭·말투·상대 스타일·메모 — 안 적어도 캡처에서 알아서 읽어요', 'Age, MBTI, goal, nickname, their vibe, notes — or skip it, I’ll read your screenshots')}
            </AppText>
          </View>
          <Ionicons name="chevron-down" size={18} color={theme.textSecondary} />
        </Pressable>
      )}

      <Button title={submitTitle} variant="brand" onPress={submit} style={styles.submit} />

      <SelectSheet
        visible={mbtiOpen}
        title={L('MBTI 선택', 'Choose MBTI')}
        columns={4}
        options={[{ key: '__none', label: L('모름', 'Not sure') }, ...MBTI_LIST.map((m) => ({ key: m, label: m }))]}
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
