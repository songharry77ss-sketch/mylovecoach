import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HeartMark, Highlight, StageBackground } from '@/components/stage/stage';
import { Button } from '@/components/ui/button';
import { MaxContentWidth, Radius, Spacing, Stage } from '@/constants/theme';
import { track } from '@/lib/analytics';
import { haptic } from '@/lib/haptics';
import { GENDERS, MBTI_LIST, MY_GOALS, VIBE_TAGS } from '@/lib/labels';
import type { Gender } from '@/lib/types';
import { useAppStore } from '@/store/app-store';

/**
 * 처음 실행 2단계 — 「나에 대해 알려주세요」. 전부 선택이고 건너뛸 수 있다.
 * 적은 내용은 내 프로필(마이 → 내 프로필)과 같고, 답장을 「나답게」 만드는 데 쓴다. 저장하거나 건너뛰면 첫 캡처 화면으로 간다.
 */
export default function AboutMe() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const user = useAppStore((s) => s.user);
  const setUser = useAppStore((s) => s.setUser);

  const [name, setName] = useState(user?.name ?? '');
  const [gender, setGender] = useState<Gender | null>(user && user.gender !== 'other' ? user.gender : null);
  const [age, setAge] = useState(user?.age ? String(user.age) : '');
  const [mbti, setMbti] = useState<string | undefined>(user?.mbti);
  const [vibes, setVibes] = useState<string[]>(user?.vibes ?? []);
  const [goal, setGoal] = useState<string | undefined>(user?.goal);
  const [showMbti, setShowMbti] = useState(false);

  useEffect(() => {
    track('onboarding', { step: 'profile', action: 'open' });
  }, []);

  const filled = [name.trim(), gender, age.trim(), mbti, vibes.length ? 'v' : '', goal].filter(Boolean).length;

  const finish = (save: boolean) => {
    haptic.tap();
    if (save) {
      const parsedAge = age.trim() ? Number(age) : undefined;
      setUser({
        name: name.trim(),
        gender: gender ?? 'other',
        age: parsedAge && Number.isFinite(parsedAge) ? parsedAge : undefined,
        mbti,
        style: user?.style ?? [],
        defaultTone: user?.defaultTone ?? 'natural',
        about: user?.about,
        vibes,
        goal,
        emoji: user?.emoji ?? 'on',
        createdAt: user?.createdAt ?? Date.now(),
      });
    }
    track('onboarding', { step: 'profile', action: save ? 'save' : 'skip', filled });
    router.replace('/start');
  };

  const toggleVibe = (v: string) => {
    haptic.select();
    setVibes((prev) => (prev.includes(v) ? prev.filter((x) => x !== v) : prev.length >= 3 ? [...prev.slice(1), v] : [...prev, v]));
  };

  return (
    <StageBackground>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingTop: insets.top + Spacing.lg, paddingBottom: insets.bottom + Spacing.xl }]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}>
          <View style={styles.topRow}>
            <Text style={styles.step}>2 / 3</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="나에 대해 알려주기 건너뛰기" onPress={() => finish(false)} hitSlop={12} style={styles.skip}>
              <Text style={styles.skipText}>건너뛰기</Text>
            </Pressable>
          </View>

          <Animated.View entering={FadeInDown.duration(380)} style={styles.head}>
            <Highlight text={'*나에 대해*\n알려주세요'} />
            <Text style={styles.sub}>알려 줄수록 「나다운」 말투의 답장이 나와요. 전부 선택이고, 언제든 마이 → 내 프로필에서 바꿀 수 있어요.</Text>
            <HeartMark size={40} rotate={12} style={styles.heart} />
          </Animated.View>

          <Field label="이름 · 별명">
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="코치가 부를 이름 (예: 지은)"
              placeholderTextColor={Stage.textFaint}
              maxLength={20}
              accessibilityLabel="이름 또는 별명"
              style={styles.input}
            />
          </Field>

          <Field label="성별">
            <View style={styles.wrap}>
              {GENDERS.filter((g) => g.key !== 'other').map((g) => (
                <Choice key={g.key} label={g.label} selected={gender === g.key} onPress={() => setGender(gender === g.key ? null : g.key)} />
              ))}
            </View>
          </Field>

          <View style={styles.row}>
            <Field label="나이" style={styles.flex}>
              <TextInput
                value={age}
                onChangeText={(v) => setAge(v.replace(/[^0-9]/g, ''))}
                placeholder="예: 25"
                placeholderTextColor={Stage.textFaint}
                keyboardType="number-pad"
                maxLength={2}
                accessibilityLabel="나이"
                style={styles.input}
              />
            </Field>
            <Field label="MBTI" style={styles.flex}>
              <Pressable accessibilityRole="button" accessibilityLabel="MBTI 고르기" onPress={() => setShowMbti((v) => !v)} style={[styles.input, styles.select]}>
                <Text style={[styles.selectText, !mbti && { color: Stage.textFaint }]}>{mbti ?? '모름'}</Text>
                <Ionicons name={showMbti ? 'chevron-up' : 'chevron-down'} size={18} color={Stage.textDim} />
              </Pressable>
            </Field>
          </View>
          {showMbti ? (
            <Animated.View entering={FadeInDown.duration(220)} style={styles.mbtiGrid}>
              {['모름', ...MBTI_LIST].map((m) => (
                <Choice
                  key={m}
                  label={m}
                  compact
                  selected={(mbti ?? '모름') === m}
                  onPress={() => {
                    setMbti(m === '모름' ? undefined : m);
                    setShowMbti(false);
                  }}
                />
              ))}
            </Animated.View>
          ) : null}

          <Field label="✨ 나의 추구미" hint="상대에게 보이고 싶은 모습 · 최대 3개">
            <View style={styles.wrap}>
              {VIBE_TAGS.map((v) => (
                <Choice key={v} label={v} selected={vibes.includes(v)} onPress={() => toggleVibe(v)} />
              ))}
            </View>
          </Field>

          <Field label="🎯 나의 연애 목표" hint="코치가 이 방향으로 답장을 만들어요">
            <View style={styles.wrap}>
              {MY_GOALS.map((g) => (
                <Choice key={g} label={g} selected={goal === g} onPress={() => setGoal(goal === g ? undefined : g)} />
              ))}
            </View>
          </Field>

          <View style={styles.actions}>
            <Button title={filled ? '다음' : '나중에 할게요'} variant={filled ? 'gold' : 'stage'} onPress={() => finish(filled > 0)} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </StageBackground>
  );
}

function Field({ label, hint, children, style }: { label: string; hint?: string; children: ReactNode; style?: object }) {
  return (
    <View style={[styles.field, style]}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>{label}</Text>
        {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      </View>
      {children}
    </View>
  );
}

/** 무대 화면용 선택 칩 — 고르면 골드 */
function Choice({ label, selected, onPress, compact }: { label: string; selected: boolean; onPress: () => void; compact?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={() => {
        haptic.select();
        onPress();
      }}
      style={[styles.choice, compact && styles.choiceCompact, selected && styles.choiceOn]}>
      <Text style={[styles.choiceText, selected && styles.choiceTextOn]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { paddingHorizontal: Spacing.xl, gap: Spacing.xl, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  step: { fontSize: 13, fontWeight: '800', color: Stage.gold, letterSpacing: 1 },
  skip: { paddingHorizontal: Spacing.md, paddingVertical: 6, borderRadius: Radius.pill, backgroundColor: Stage.chip, borderWidth: 1, borderColor: Stage.chipBorder },
  skipText: { fontSize: 13, fontWeight: '700', color: Stage.text },
  head: { gap: Spacing.md },
  heart: { position: 'absolute', right: 0, top: 4 },
  sub: { fontSize: 15, lineHeight: 22, fontWeight: '500', color: Stage.textDim },
  field: { gap: Spacing.sm },
  labelRow: { flexDirection: 'row', alignItems: 'baseline', gap: Spacing.sm, flexWrap: 'wrap' },
  label: { fontSize: 15, fontWeight: '800', color: Stage.text },
  hint: { fontSize: 12, fontWeight: '500', color: Stage.textFaint },
  input: {
    height: 52,
    borderRadius: Radius.md,
    backgroundColor: Stage.chip,
    borderWidth: 1,
    borderColor: Stage.chipBorder,
    paddingHorizontal: Spacing.lg,
    fontSize: 16,
    fontWeight: '600',
    color: Stage.text,
  },
  select: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  selectText: { fontSize: 16, fontWeight: '700', color: Stage.text },
  row: { flexDirection: 'row', gap: Spacing.md },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  mbtiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginTop: -Spacing.md },
  choice: { borderRadius: Radius.pill, borderWidth: 1, borderColor: Stage.chipBorder, backgroundColor: Stage.chip, paddingHorizontal: 14, paddingVertical: 9 },
  choiceCompact: { paddingHorizontal: 10, paddingVertical: 7, minWidth: 62, alignItems: 'center' },
  choiceOn: { backgroundColor: Stage.gold, borderColor: Stage.gold },
  choiceText: { fontSize: 14, fontWeight: '700', color: Stage.text },
  choiceTextOn: { color: Stage.onGold },
  actions: { marginTop: Spacing.sm },
});
