import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Dimensions, Pressable, ScrollView, StyleSheet, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { ProgressDots } from '@/components/ui/progress-dots';
import { SelectSheet } from '@/components/ui/select-sheet';
import { TagPicker } from '@/components/ui/tag-picker';
import { TextField } from '@/components/ui/text-field';
import { Radius, Spacing, palette } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { GENDERS, MBTI_LIST, MY_STYLE_TAGS, TONES } from '@/lib/labels';
import type { Gender, Tone } from '@/lib/types';
import { useAppStore } from '@/store/app-store';

const { width: SCREEN_W } = Dimensions.get('window');
const PAGE_W = Math.min(SCREEN_W, 640);

const INTRO = [
  {
    emoji: '💬',
    title: '대화 캡처만 올리면\n답장이 나와요',
    body: '카톡·인스타 DM 화면을 캡처해서 올려보세요. 코치가 분위기를 읽고 바로 보낼 수 있는 답장 3개를 추천해요.',
    colors: [palette.sky100, palette.pink50],
  },
  {
    emoji: '🌡️',
    title: '상대의 호감 온도를\n알려드려요',
    body: 'MBTI, 나이, 성향까지 반영해서 지금 상대가 얼마나 마음이 열려 있는지, 다음 스텝은 뭔지 함께 짚어드려요.',
    colors: [palette.pink100, palette.lavender100],
  },
];

export default function Onboarding() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const setUser = useAppStore((s) => s.setUser);
  const scrollRef = useRef<ScrollView>(null);
  const [page, setPage] = useState(0);

  const [name, setName] = useState('');
  const [gender, setGender] = useState<Gender>('male');
  const [age, setAge] = useState('');
  const [mbti, setMbti] = useState<string | undefined>();
  const [style, setStyle] = useState<string[]>([]);
  const [tone, setTone] = useState<Tone>('natural');
  const [mbtiOpen, setMbtiOpen] = useState(false);
  const [nameError, setNameError] = useState<string>();

  const goTo = (i: number) => {
    scrollRef.current?.scrollTo({ x: i * PAGE_W, animated: true });
    setPage(i);
  };

  const onScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setPage(Math.round(e.nativeEvent.contentOffset.x / PAGE_W));
  };

  const finish = () => {
    if (!name.trim()) {
      setNameError('이름이나 별명을 알려주세요.');
      goTo(2);
      return;
    }
    const parsedAge = age.trim() ? Number(age) : undefined;
    setUser({
      name: name.trim(),
      gender,
      age: parsedAge && Number.isFinite(parsedAge) ? parsedAge : undefined,
      mbti,
      style,
      defaultTone: tone,
      createdAt: Date.now(),
    });
    router.replace('/(tabs)');
  };

  return (
    <View style={[styles.root, { backgroundColor: theme.background, paddingTop: insets.top }]}>
      <View style={styles.topBar}>
        <ProgressDots count={3} index={page} />
        {page < 2 ? (
          <Pressable accessibilityRole="button" onPress={() => goTo(2)} hitSlop={8}>
            <AppText variant="smallStrong" color="textTertiary">
              건너뛰기
            </AppText>
          </Pressable>
        ) : null}
      </View>

      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScrollEnd}
        keyboardShouldPersistTaps="handled"
        style={styles.pager}
        contentContainerStyle={{ width: PAGE_W * 3 }}>
        {INTRO.map((slide, i) => (
          <View key={i} style={[styles.page, { width: PAGE_W }]}>
            <LinearGradient colors={slide.colors as [string, string]} style={styles.hero}>
              <AppText style={styles.heroEmoji}>{slide.emoji}</AppText>
            </LinearGradient>
            <AppText variant="display" style={styles.title}>
              {slide.title}
            </AppText>
            <AppText variant="body" color="textSecondary">
              {slide.body}
            </AppText>
          </View>
        ))}

        <ScrollView style={{ width: PAGE_W }} contentContainerStyle={[styles.page, styles.formPage]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <AppText variant="title1">
            코치가 알아둘{'\n'}내 정보를 알려주세요
          </AppText>
          <AppText variant="small" color="textSecondary" style={styles.formHint}>
            모든 정보는 내 휴대폰에만 저장되고, 답장을 만들 때만 사용돼요.
          </AppText>

          <TextField
            label="이름 / 별명"
            placeholder="예: 지훈"
            value={name}
            onChangeText={(t) => {
              setName(t);
              if (nameError) setNameError(undefined);
            }}
            error={nameError}
            maxLength={20}
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
            <TextField label="나이 (선택)" placeholder="예: 27" value={age} onChangeText={setAge} keyboardType="number-pad" maxLength={2} containerStyle={styles.col} />
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
              나는 이런 스타일이에요 (최대 5개)
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
        </ScrollView>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.lg }]}>
        {page < 2 ? <Button title="다음" onPress={() => goTo(page + 1)} /> : <Button title="시작하기" onPress={finish} />}
      </View>

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
  root: { flex: 1 },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Spacing.xl, paddingVertical: Spacing.lg },
  pager: { flex: 1, alignSelf: 'center', width: PAGE_W },
  page: { paddingHorizontal: Spacing.xl, gap: Spacing.lg },
  formPage: { paddingBottom: 120, gap: Spacing.xl },
  hero: { height: 240, borderRadius: Radius.xl, alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.sm },
  heroEmoji: { fontSize: 96, lineHeight: 112 },
  title: { marginTop: Spacing.sm },
  formHint: { marginTop: -Spacing.sm },
  label: { marginBottom: Spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  twoCol: { flexDirection: 'row', gap: Spacing.md },
  col: { flex: 1 },
  select: { height: 54, borderRadius: Radius.md, paddingHorizontal: Spacing.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  footer: { paddingHorizontal: Spacing.xl, paddingTop: Spacing.sm, alignSelf: 'center', width: '100%', maxWidth: 640 },
});
