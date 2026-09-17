import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/app-text';
import { Chip } from '@/components/ui/chip';
import { IconButton } from '@/components/ui/icon-button';
import { Radius, Spacing, Typography } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { TONES } from '@/lib/labels';
import type { Tone } from '@/lib/types';
import type { PickedImage } from '@/lib/images';

interface ComposerProps {
  tone: Tone;
  onToneChange: (tone: Tone) => void;
  image: PickedImage | null;
  onPickImage: () => void;
  onClearImage: () => void;
  onSend: (text: string) => void;
  sending?: boolean;
}

export function Composer({ tone, onToneChange, image, onPickImage, onClearImage, onSend, sending }: ComposerProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [text, setText] = useState('');
  const canSend = !sending && (Boolean(image) || text.trim().length > 0);

  const submit = () => {
    if (!canSend) return;
    onSend(text.trim());
    setText('');
  };

  return (
    <View style={[styles.wrap, { backgroundColor: theme.background, borderTopColor: theme.border, paddingBottom: insets.bottom + Spacing.sm }]}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tones} keyboardShouldPersistTaps="handled">
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
            캡처 1장 첨부됨
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
        <IconButton
          name="arrow-up"
          accessibilityLabel="코치에게 보내기"
          onPress={submit}
          disabled={!canSend}
          color={theme.primaryText}
          background={canSend ? theme.primary : theme.surfaceSelected}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: Spacing.sm, paddingHorizontal: Spacing.md, gap: Spacing.sm },
  tones: { gap: Spacing.sm, paddingHorizontal: Spacing.xs },
  preview: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  previewImage: { width: 44, height: 60, borderRadius: Radius.sm },
  previewClose: { position: 'absolute', left: 32, top: -6, width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.sm },
  inputBox: { flex: 1, borderRadius: Radius.lg, paddingHorizontal: Spacing.lg, minHeight: 44, maxHeight: 140, justifyContent: 'center' },
  input: { paddingVertical: Spacing.sm + 2 },
});
