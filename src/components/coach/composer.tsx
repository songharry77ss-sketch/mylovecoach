import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import Animated, { FadeIn, useAnimatedStyle, useSharedValue, withSequence, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/app-text';
import { Chip } from '@/components/ui/chip';
import { IconButton } from '@/components/ui/icon-button';
import { Radius, Spacing, Typography } from '@/constants/theme';
import { useKeyboardVisible } from '@/hooks/use-keyboard';
import { useTheme } from '@/hooks/use-theme';
import { haptic } from '@/lib/haptics';
import type { PickedImage } from '@/lib/images';
import { TONES } from '@/lib/labels';
import type { EmojiPref, Tone } from '@/lib/types';

interface ComposerProps {
  tone: Tone;
  onToneChange: (tone: Tone) => void;
  /** 답장에 이모지 넣기 */
  emoji: EmojiPref;
  onEmojiChange: (emoji: EmojiPref) => void;
  image: PickedImage | null;
  onPickImage: () => void;
  onClearImage: () => void;
  /** false 를 돌려주면 보내지 않은 것으로 보고 입력한 글을 그대로 둔다 */
  onSend: (text: string) => boolean | void;
  sending?: boolean;
  /** 입력창 위에 보여 줄 안내 (무료 횟수 등) */
  notice?: { text: string; actionLabel?: string; onAction?: () => void; emphasized?: boolean } | null;
  /** 입력창이 비었을 때 띄울 무작위 질문들 (누르면 바로 물어본다) */
  questions?: string[];
  onQuestion?: (question: string) => void;
  onShuffleQuestions?: () => void;
}

const EMOJI_NEXT: Record<EmojiPref, EmojiPref> = { on: 'off', off: 'auto', auto: 'on' };
const EMOJI_LABEL: Record<EmojiPref, string> = { on: '😊 이모지 넣기', off: '🚫 이모지 빼기', auto: '🪞 이모지 자동' };

export function Composer({ tone, onToneChange, emoji, onEmojiChange, image, onPickImage, onClearImage, onSend, sending, notice, questions, onQuestion, onShuffleQuestions }: ComposerProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const keyboardVisible = useKeyboardVisible();
  const [text, setText] = useState('');
  const sendScale = useSharedValue(1);
  const sendStyle = useAnimatedStyle(() => ({ transform: [{ scale: sendScale.value }] }));
  // 키보드가 올라오면 홈 인디케이터 여백이 필요 없다 — 그대로 두면 키보드와 입력창 사이가 벌어진다
  const bottomPad = (keyboardVisible ? 0 : insets.bottom) + Spacing.sm;
  const canSend = !sending && (Boolean(image) || text.trim().length > 0);
  const showQuestions = Boolean(questions?.length) && !text && !image && !sending;

  const submit = () => {
    if (!canSend) return;
    if (onSend(text.trim()) === false) return;
    haptic.thud();
    sendScale.value = withSequence(withSpring(0.8, { damping: 10, stiffness: 400 }), withSpring(1, { damping: 8, stiffness: 260 }));
    setText('');
  };

  return (
    <View style={[styles.wrap, { backgroundColor: theme.background, borderTopColor: theme.border, paddingBottom: bottomPad }]}>
      {notice ? (
        <Pressable
          accessibilityRole={notice.onAction ? 'button' : 'text'}
          onPress={notice.onAction}
          disabled={!notice.onAction}
          style={[styles.notice, { backgroundColor: notice.emphasized ? theme.accentSoft : theme.surface }]}>
          <AppText variant="caption" color="textSecondary" style={styles.noticeText}>
            {notice.text}
          </AppText>
          {notice.actionLabel ? (
            <AppText variant="caption" color={notice.emphasized ? 'accent' : 'primary'} weight="700">
              {notice.actionLabel} ›
            </AppText>
          ) : null}
        </Pressable>
      ) : null}

      {/* 「그 사람은 지금 무슨 생각일까?」 같은 질문을 무작위로 띄워 바로 물어보게 한다 */}
      {showQuestions ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.questions} keyboardShouldPersistTaps="handled">
          {onShuffleQuestions ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="다른 질문 보기"
              onPress={() => {
                haptic.select();
                onShuffleQuestions();
              }}
              style={[styles.dice, { backgroundColor: theme.accentSoft }]}>
              <AppText style={styles.diceText}>🎲</AppText>
            </Pressable>
          ) : null}
          {questions!.map((q) => (
            <Animated.View key={q} entering={FadeIn.duration(240)}>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  haptic.tap();
                  onQuestion?.(q);
                }}
                style={({ pressed }) => [styles.question, { backgroundColor: theme.surface, borderColor: theme.border, opacity: pressed ? 0.7 : 1 }]}>
                <AppText variant="caption" color="textSecondary">
                  {q}
                </AppText>
              </Pressable>
            </Animated.View>
          ))}
        </ScrollView>
      ) : null}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tones} keyboardShouldPersistTaps="handled">
        <Chip
          label={EMOJI_LABEL[emoji]}
          selected={emoji !== 'off'}
          tone="accent"
          size="sm"
          onPress={() => onEmojiChange(EMOJI_NEXT[emoji])}
        />
        <View style={[styles.divider, { backgroundColor: theme.border }]} />
        {TONES.map((t) => (
          <Chip key={t.key} label={t.label} emoji={t.emoji} selected={tone === t.key} onPress={() => onToneChange(t.key)} size="sm" />
        ))}
      </ScrollView>

      {image ? (
        <View style={styles.preview}>
          <Image source={{ uri: image.uri }} style={[styles.previewImage, { backgroundColor: theme.surface }]} contentFit="cover" />
          <Pressable accessibilityRole="button" accessibilityLabel="캡처 제거" onPress={onClearImage} style={[styles.previewClose, { backgroundColor: theme.text }]}>
            <Ionicons name="close" size={14} color={theme.background} />
          </Pressable>
          <AppText variant="caption" color="textSecondary">
            캡처 1장 첨부됨 · 호칭과 말투도 같이 읽어요
          </AppText>
        </View>
      ) : null}

      <View style={styles.row}>
        <IconButton
          name="image-outline"
          accessibilityLabel="대화 캡처 올리기"
          onPress={onPickImage}
          color={theme.primary}
          background={theme.primarySoft}
          disabled={sending}
        />
        <View style={[styles.inputBox, { backgroundColor: theme.surface }]}>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder={image ? '상황을 덧붙여도 좋아요 (선택)' : '캡처를 올리거나 상황을 적어주세요'}
            placeholderTextColor={theme.textTertiary}
            multiline
            maxLength={800}
            editable={!sending}
            style={[styles.input, Typography.body, { color: theme.text }]}
          />
        </View>
        <Animated.View style={sendStyle}>
          <IconButton
            name="arrow-up"
            accessibilityLabel="코치에게 보내기"
            onPress={submit}
            disabled={!canSend}
            color={theme.primaryText}
            background={canSend ? theme.primary : theme.surfaceSelected}
            haptic={false}
          />
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: Spacing.sm, paddingHorizontal: Spacing.md, gap: Spacing.sm },
  notice: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm },
  noticeText: { flex: 1 },
  questions: { gap: Spacing.xs, paddingHorizontal: Spacing.xs, alignItems: 'center' },
  dice: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  diceText: { fontSize: 16, lineHeight: 20 },
  question: { paddingHorizontal: Spacing.md, paddingVertical: 7, borderRadius: Radius.pill, borderWidth: 1 },
  tones: { gap: Spacing.sm, paddingHorizontal: Spacing.xs, alignItems: 'center' },
  divider: { width: 1, height: 18 },
  preview: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  previewImage: { width: 44, height: 60, borderRadius: Radius.sm },
  previewClose: { position: 'absolute', left: 32, top: -6, width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.sm },
  inputBox: { flex: 1, borderRadius: Radius.lg, paddingHorizontal: Spacing.lg, minHeight: 44, maxHeight: 140, justifyContent: 'center' },
  input: { paddingVertical: Spacing.sm + 2 },
});
