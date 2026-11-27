import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { CardSection, FormField, useCardStyle } from '@/components/ui/list-group';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Screen } from '@/components/ui/screen';
import { SelectField, SelectSheet } from '@/components/ui/select-sheet';
import { ChoiceChips, TagPicker } from '@/components/ui/tag-picker';
import { TextField } from '@/components/ui/text-field';
import { useToast } from '@/components/ui/toast';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { L } from '@/lib/i18n';
import { kktiCopy } from '@/lib/kkti-en';
import { EMOJI_OPTIONS, GENDERS, MBTI_LIST, MY_GOALS, MY_STYLE_TAGS, TONES, VIBE_TAGS } from '@/lib/labels';
import type { EmojiPref, Gender, Tone } from '@/lib/types';
import { useAppStore } from '@/store/app-store';

const GOAL_OPTIONS = MY_GOALS.map((g) => ({ key: g, label: g }));
/** 라벨 앞 이모지(「😊 넣기」)는 칩에 그리지 않는다 — 1.4 「AI 티」 (labels.ts 의 값은 다른 화면도 써서 여기서만 뗀다) */
const plainLabel = (label: string) => {
  const space = label.indexOf(' ');
  return space > 0 && !/[가-힣A-Za-z0-9]/.test(label.slice(0, space)) ? label.slice(space + 1) : label;
};
const EMOJI_CHOICES = EMOJI_OPTIONS.map((o) => ({ ...o, label: plainLabel(o.label) }));

/**
 * 내 프로필 — 나에 대한 정보 · 추구미 · 목표를 알려 주면 「내 말투 같은」 답장이 나온다.
 * 1.2 개편: 옅은 회색 바탕 위 흰 카드 묶음(기본 정보 · 연애 스타일 · 답장 스타일), 맨 아래 큰 저장 버튼.
 * 1.4 개편: 떠 있는 3D 그림·저장 때 반짝이·칩 이모지를 걷고, 고른 칩은 한 가지(검정) — 파랑·보라 두 선택 색을 없앴다.
 */
export default function ProfileSettings() {
  const theme = useTheme();
  const card = useCardStyle();
  const router = useRouter();
  const toast = useToast();
  const user = useAppStore((s) => s.user);
  const kkti = useAppStore((s) => s.kkti);
  // 저장된 KKTI 결과를 지금 언어의 이름·코드로 (한국어판은 저장값 그대로)
  const kktiView = kkti ? kktiCopy.saved(kkti) : null;
  const setUser = useAppStore((s) => s.setUser);

  const [name, setName] = useState(user?.name ?? '');
  const [gender, setGender] = useState<Gender>(user?.gender ?? 'other');
  const [age, setAge] = useState(user?.age ? String(user.age) : '');
  const [mbti, setMbti] = useState<string | undefined>(user?.mbti);
  const [style, setStyle] = useState<string[]>(user?.style ?? []);
  const [tone, setTone] = useState<Tone>(user?.defaultTone ?? 'natural');
  const [about, setAbout] = useState(user?.about ?? '');
  const [vibes, setVibes] = useState<string[]>(user?.vibes ?? []);
  const [goal, setGoal] = useState<string | undefined>(user?.goal);
  const [emoji, setEmoji] = useState<EmojiPref>(user?.emoji ?? 'on');
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
      about: about.trim() || undefined,
      vibes,
      goal,
      emoji,
      createdAt: user?.createdAt ?? Date.now(),
    });
    toast.show(L('프로필을 저장했어요. 다음 답장부터 반영돼요', 'Profile saved. Your next replies will use it'), 'success');
    router.back();
  };

  return (
    <Screen keyboard background={theme.canvas} contentStyle={styles.content}>
      {/* 머리말도 바탕과 같은 회색으로 — 흰 띠가 따로 떠 보이지 않게 */}
      <Stack.Screen options={{ headerStyle: { backgroundColor: theme.canvas } }} />
      <View style={styles.intro}>
        <AppText variant="title3" weight="700">
          {L('알려 줄수록 「나다운」 답장이 나와요', 'The more you share, the more the replies sound like you')}
        </AppText>
        <AppText variant="small" color="textSecondary">
          {L('전부 선택이고, 이 기기에만 저장돼요.', 'Everything is optional and stays on this device.')}
        </AppText>
      </View>

      <CardSection title={L('기본 정보', 'Basics')}>
        <TextField label={L('이름 / 별명', 'Name / nickname')} placeholder={L('예: 지은', 'e.g. Emma')} value={name} onChangeText={setName} maxLength={20} />
        <FormField label={L('성별', 'Gender')}>
          <ChoiceChips options={GENDERS} value={gender} onChange={(g) => g && setGender(g)} fill />
        </FormField>
        <View style={styles.twoCol}>
          <TextField label={L('나이', 'Age')} placeholder={L('예: 26', 'e.g. 26')} value={age} onChangeText={setAge} keyboardType="number-pad" maxLength={2} containerStyle={styles.col} />
          <SelectField label="MBTI" value={mbti} onPress={() => setMbtiOpen(true)} accessibilityLabel={L(`MBTI ${mbti ?? '선택 안 함'}, 바꾸기`, `MBTI ${mbti ?? 'not set'}, change`)} style={styles.col} />
        </View>
        <TextField
          label={L('나를 소개해 주세요 (선택)', 'About you (optional)')}
          placeholder={L('예: 27살 마케터, 주말엔 러닝·카페. 답장은 짧게 하는 편이고 ㅋㅋ를 많이 써요.', 'e.g. 27, marketer. Weekend runs and coffee shops. I keep texts short and say "lol" a lot.')}
          value={about}
          onChangeText={setAbout}
          multiline
          maxLength={300}
          helper={L(`${about.length}/300 · 직업·취미·연락 습관을 적으면 답장이 더 나다워져요`, `${about.length}/300 · Add your job, hobbies and texting habits so replies sound more like you`)}
        />
      </CardSection>

      <CardSection title={L('연애 스타일', 'Dating style')}>
        <FormField label={L('나의 추구미', 'My vibe')} hint={L('상대에게 보이고 싶은 모습 · 최대 3개', 'How you want to come across · Up to 3')}>
          <TagPicker options={VIBE_TAGS} value={vibes} onChange={setVibes} max={3} />
        </FormField>
        <FormField label={L('나의 연애 목표', 'My dating goal')} hint={L('코치가 이 방향으로 답장을 만들어요', 'Your coach writes replies with this in mind')}>
          <ChoiceChips options={GOAL_OPTIONS} value={goal} onChange={setGoal} allowEmpty />
        </FormField>
      </CardSection>

      <CardSection title={L('답장 스타일', 'Reply style')}>
        <FormField label={L('나의 스타일', 'My style')} hint={L('최대 5개', 'Up to 5')}>
          <TagPicker options={MY_STYLE_TAGS} value={style} onChange={setStyle} max={5} />
        </FormField>
        <FormField label={L('기본 답장 톤', 'Default tone')}>
          <ChoiceChips options={TONES} value={tone} onChange={(t) => t && setTone(t)} />
        </FormField>
        <FormField label={L('답장에 이모지', 'Emoji in replies')}>
          <ChoiceChips options={EMOJI_CHOICES} value={emoji} onChange={(e) => e && setEmoji(e)} />
        </FormField>
      </CardSection>

      <PressableScale
        pressedScale={0.98}
        accessibilityLabel={kkti ? L(`내 KKTI ${kktiView?.code} ${kktiView?.name}, 다시 하기`, `My Texting Type ${kktiView?.code} ${kktiView?.name}, retake`) : L('KKTI 테스트 하기', 'Take the Texting Type Test')}
        onPress={() => router.push('/kkti')}
        style={[styles.kkti, card]}>
        {/* KKTI 는 유형 색이 내용이라 작은 점 하나로만 (이모지 타일은 걷었다) */}
        {kkti?.color ? <View style={[styles.kktiDot, { backgroundColor: kkti.color }]} /> : null}
        <View style={styles.kktiTexts}>
          <AppText variant="bodyStrong">
            {kkti
              ? L(`내 KKTI: ${kktiView?.code} ${kktiView?.name}`, `My Texting Type: ${kktiView?.code} ${kktiView?.name}`)
              : L('KKTI 테스트 — 카톡으로 보는 진짜 연애 MBTI', 'Texting Type Test — your real dating MBTI, from how you text')}
          </AppText>
          <AppText variant="small" color="textSecondary" style={styles.kktiCaption}>
            {kkti
              ? L(`연애 컬러 ${kkti.colorName} · 진짜 MBTI ${kkti.mbti} · 다시 하기`, `Love color ${kkti.colorName} · Real MBTI ${kkti.mbti} · Retake`)
              : L('1분이면 끝. 결과가 코칭에도 반영돼요', 'Takes 1 minute. Your result shapes your coaching')}
          </AppText>
        </View>
        <Ionicons name="chevron-forward" size={16} color={theme.textTertiary} />
      </PressableScale>

      <Button title={L('저장', 'Save')} variant="brand" onPress={save} style={styles.save} />
      <SelectSheet
        visible={mbtiOpen}
        title={L('MBTI 선택', 'Choose MBTI')}
        columns={4}
        options={[{ key: '__none', label: L('모름', 'Not sure') }, ...MBTI_LIST.map((m) => ({ key: m, label: m }))]}
        value={mbti ?? '__none'}
        onSelect={(k) => setMbti(k === '__none' ? undefined : k)}
        onClose={() => setMbtiOpen(false)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: Spacing.xl, paddingTop: Spacing.md },
  twoCol: { flexDirection: 'row', gap: Spacing.md },
  col: { flex: 1 },
  intro: { gap: Spacing.xs, paddingHorizontal: Spacing.xs },
  kkti: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, borderRadius: Radius.lg, padding: Spacing.lg + 2 },
  kktiDot: { width: 12, height: 12, borderRadius: 6 },
  kktiTexts: { flex: 1, gap: 2 },
  kktiCaption: { fontSize: 13, lineHeight: 19 },
  save: { marginTop: Spacing.xs },
});
