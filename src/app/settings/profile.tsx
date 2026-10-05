import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useCelebrate } from '@/components/fx/celebration';
import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Screen } from '@/components/ui/screen';
import { SectionHeader } from '@/components/ui/section-header';
import { SelectSheet } from '@/components/ui/select-sheet';
import { TagPicker } from '@/components/ui/tag-picker';
import { TextField } from '@/components/ui/text-field';
import { useToast } from '@/components/ui/toast';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { EMOJI_OPTIONS, GENDERS, MBTI_LIST, MY_GOALS, MY_STYLE_TAGS, TONES, VIBE_TAGS } from '@/lib/labels';
import type { EmojiPref, Gender, Tone } from '@/lib/types';
import { useAppStore } from '@/store/app-store';

/** 내 프로필 — 나에 대한 정보 · 추구미 · 목표를 알려 주면 「내 말투 같은」 답장이 나온다 */
export default function ProfileSettings() {
  const theme = useTheme();
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
    <Screen keyboard contentStyle={styles.content}>
      <AppText variant="small" color="textSecondary">
        나에 대해 알려 줄수록 코치가 「나다운」 답장을 만들어요. 전부 선택이고, 이 기기에만 저장돼요.
      </AppText>

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

      <TextField
        label="나를 소개해 주세요 (선택)"
        placeholder="예: 27살 마케터, 주말엔 러닝·카페. 답장은 짧게 하는 편이고 ㅋㅋ를 많이 써요."
        value={about}
        onChangeText={setAbout}
        multiline
        maxLength={300}
        helper={`${about.length}/300 · 직업·취미·연락 습관을 적으면 답장이 더 나다워져요`}
      />

      <View>
        <SectionHeader title="✨ 나의 추구미" subtitle="상대에게 보이고 싶은 모습 · 최대 3개" />
        <TagPicker options={VIBE_TAGS} value={vibes} onChange={setVibes} max={3} tone="accent" />
      </View>

      <View>
        <SectionHeader title="🎯 나의 연애 목표" subtitle="코치가 이 방향으로 답장을 만들어요" />
        <View style={styles.chips}>
          {MY_GOALS.map((g) => (
            <Chip key={g} label={g} selected={goal === g} onPress={() => setGoal(goal === g ? undefined : g)} tone="accent" />
          ))}
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

      <View>
        <AppText variant="smallStrong" color="textSecondary" style={styles.label}>
          답장에 이모지
        </AppText>
        <View style={styles.chips}>
          {EMOJI_OPTIONS.map((o) => (
            <Chip key={o.key} label={o.label} selected={emoji === o.key} onPress={() => setEmoji(o.key)} />
          ))}
        </View>
      </View>

      <PressableScale onPress={() => router.push('/kkti')} style={[styles.kkti, { backgroundColor: kkti?.color ? `${kkti.color}33` : theme.primarySoft }]}>
        <AppText style={styles.kktiEmoji}>{kkti?.emoji ?? '🧪'}</AppText>
        <View style={styles.kktiTexts}>
          <AppText variant="smallStrong">{kkti ? `내 KKTI: ${kkti.code} ${kkti.name}` : 'KKTI 테스트 — 카톡으로 보는 진짜 연애 MBTI'}</AppText>
          <AppText variant="caption" color="textSecondary">
            {kkti ? `연애 컬러 ${kkti.colorName} · 진짜 MBTI ${kkti.mbti} · 다시 하기` : '1분이면 끝. 결과가 코칭에도 반영돼요'}
          </AppText>
        </View>
        <Ionicons name="chevron-forward" size={18} color={theme.textTertiary} />
      </PressableScale>

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
  kkti: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, borderRadius: Radius.lg, padding: Spacing.lg },
  kktiEmoji: { fontSize: 28, lineHeight: 34 },
  kktiTexts: { flex: 1, gap: 2 },
});
