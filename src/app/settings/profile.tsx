import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Icon3D } from '@/components/brand/brand';
import { useCelebrate } from '@/components/fx/celebration';
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
import { EMOJI_OPTIONS, GENDERS, MBTI_LIST, MY_GOALS, MY_STYLE_TAGS, TONES, VIBE_TAGS } from '@/lib/labels';
import type { EmojiPref, Gender, Tone } from '@/lib/types';
import { useAppStore } from '@/store/app-store';

const GOAL_OPTIONS = MY_GOALS.map((g) => ({ key: g, label: g }));

/**
 * 내 프로필 — 나에 대한 정보 · 추구미 · 목표를 알려 주면 「내 말투 같은」 답장이 나온다.
 * 1.2 개편: 옅은 회색 바탕 위 흰 카드 묶음(기본 정보 · 연애 스타일 · 답장 스타일), 맨 아래 큰 저장 버튼.
 */
export default function ProfileSettings() {
  const theme = useTheme();
  const card = useCardStyle();
  const router = useRouter();
  const toast = useToast();
  const celebrate = useCelebrate();
  const user = useAppStore((s) => s.user);
  const kkti = useAppStore((s) => s.kkti);
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
    celebrate({ kind: 'sparkles', count: 12 });
    toast.show('프로필을 저장했어요. 이제 더 내 말투 같은 답장이 나와요 ✨', 'success');
    router.back();
  };

  return (
    <Screen keyboard background={theme.canvas} contentStyle={styles.content}>
      {/* 머리말도 바탕과 같은 회색으로 — 흰 띠가 따로 떠 보이지 않게 */}
      <Stack.Screen options={{ headerStyle: { backgroundColor: theme.canvas } }} />
      <View style={styles.intro}>
        <View style={styles.introTexts}>
          <AppText variant="title2" weight="800">
            {'나를 알려 줄수록\n「나다운」 답장이 나와요'}
          </AppText>
          <AppText variant="small" color="textSecondary">
            전부 선택이고, 이 기기에만 저장돼요.
          </AppText>
        </View>
        <Icon3D name="memory" size={64} float />
      </View>

      <CardSection title="기본 정보">
        <TextField label="이름 / 별명" placeholder="예: 지은" value={name} onChangeText={setName} maxLength={20} />
        <FormField label="성별">
          <ChoiceChips options={GENDERS} value={gender} onChange={(g) => g && setGender(g)} fill />
        </FormField>
        <View style={styles.twoCol}>
          <TextField label="나이" placeholder="예: 26" value={age} onChangeText={setAge} keyboardType="number-pad" maxLength={2} containerStyle={styles.col} />
          <SelectField label="MBTI" value={mbti} onPress={() => setMbtiOpen(true)} accessibilityLabel={`MBTI ${mbti ?? '선택 안 함'}, 바꾸기`} style={styles.col} />
        </View>
        <TextField
          label="나를 소개해 주세요 (선택)"
          placeholder="예: 27살 마케터, 주말엔 러닝·카페. 답장은 짧게 하는 편이고 ㅋㅋ를 많이 써요."
          value={about}
          onChangeText={setAbout}
          multiline
          maxLength={300}
          helper={`${about.length}/300 · 직업·취미·연락 습관을 적으면 답장이 더 나다워져요`}
        />
      </CardSection>

      <CardSection title="연애 스타일">
        <FormField label="나의 추구미" hint="상대에게 보이고 싶은 모습 · 최대 3개">
          <TagPicker options={VIBE_TAGS} value={vibes} onChange={setVibes} max={3} tone="accent" />
        </FormField>
        <FormField label="나의 연애 목표" hint="코치가 이 방향으로 답장을 만들어요">
          <ChoiceChips options={GOAL_OPTIONS} value={goal} onChange={setGoal} tone="accent" allowEmpty />
        </FormField>
      </CardSection>

      <CardSection title="답장 스타일">
        <FormField label="나의 스타일" hint="최대 5개">
          <TagPicker options={MY_STYLE_TAGS} value={style} onChange={setStyle} max={5} />
        </FormField>
        <FormField label="기본 답장 톤">
          <ChoiceChips options={TONES} value={tone} onChange={(t) => t && setTone(t)} tone="accent" />
        </FormField>
        <FormField label="답장에 이모지">
          <ChoiceChips options={EMOJI_OPTIONS} value={emoji} onChange={(e) => e && setEmoji(e)} />
        </FormField>
      </CardSection>

      <PressableScale
        pressedScale={0.98}
        accessibilityLabel={kkti ? `내 KKTI ${kkti.code} ${kkti.name}, 다시 하기` : 'KKTI 테스트 하기'}
        onPress={() => router.push('/kkti')}
        style={[styles.kkti, card]}>
        <View style={[styles.kktiDot, { backgroundColor: kkti?.color ?? theme.primarySoft }]}>
          <AppText style={styles.kktiEmoji}>{kkti?.emoji ?? '💬'}</AppText>
        </View>
        <View style={styles.kktiTexts}>
          <AppText variant="bodyStrong">{kkti ? `내 KKTI: ${kkti.code} ${kkti.name}` : 'KKTI 테스트 — 카톡으로 보는 진짜 연애 MBTI'}</AppText>
          <AppText variant="caption" color="textSecondary">
            {kkti ? `연애 컬러 ${kkti.colorName} · 진짜 MBTI ${kkti.mbti} · 다시 하기` : '1분이면 끝. 결과가 코칭에도 반영돼요'}
          </AppText>
        </View>
        <Ionicons name="chevron-forward" size={18} color={theme.textTertiary} />
      </PressableScale>

      <Button title="저장" variant="brand" onPress={save} style={styles.save} />
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
  content: { gap: Spacing.xl, paddingTop: Spacing.md },
  twoCol: { flexDirection: 'row', gap: Spacing.md },
  col: { flex: 1 },
  intro: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingHorizontal: Spacing.xs },
  introTexts: { flex: 1, gap: Spacing.xs + 2 },
  kkti: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, borderRadius: Radius.lg + 2, padding: Spacing.lg + 2 },
  kktiDot: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  kktiEmoji: { fontSize: 22, lineHeight: 28 },
  kktiTexts: { flex: 1, gap: 2 },
  save: { marginTop: Spacing.xs },
});
