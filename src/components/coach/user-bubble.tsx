import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { toneLabel } from '@/lib/labels';
import type { ChatMessage } from '@/lib/types';

interface UserBubbleProps {
  message: ChatMessage;
  onPressImage?: (uri: string) => void;
}

export function UserBubble({ message, onPressImage }: UserBubbleProps) {
  const theme = useTheme();
  // 캡처 파일을 읽지 못하면(지워졌거나 깨짐) 빈 회색 칸 대신 안내를 보여 준다
  const [broken, setBroken] = useState(false);
  return (
    <View style={styles.wrap}>
      {message.imageUri ? (
        broken ? (
          <View style={[styles.image, styles.broken, { backgroundColor: theme.surface, borderColor: theme.border }]} accessibilityLabel="불러오지 못한 대화 캡처">
            <Ionicons name="image-outline" size={28} color={theme.textTertiary} />
            <AppText variant="caption" color="textTertiary" align="center">
              캡처를 불러오지 못했어요
            </AppText>
          </View>
        ) : (
          <Pressable accessibilityRole="imagebutton" accessibilityLabel="업로드한 대화 캡처" onPress={() => onPressImage?.(message.imageUri!)}>
            <Image source={{ uri: message.imageUri }} style={[styles.image, { backgroundColor: theme.surface }]} contentFit="cover" transition={120} onError={() => setBroken(true)} />
          </Pressable>
        )
      ) : null}
      {message.text ? (
        <View style={[styles.bubble, { backgroundColor: theme.bubbleUser }]}>
          <AppText variant="body">{message.text}</AppText>
        </View>
      ) : null}
      {message.tone ? (
        <AppText variant="caption" color="textTertiary">
          {toneLabel(message.tone).emoji} {toneLabel(message.tone).label} 톤으로 요청
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'flex-end', gap: Spacing.xs, alignSelf: 'stretch' },
  image: { width: 180, height: 260, borderRadius: Radius.lg },
  broken: { alignItems: 'center', justifyContent: 'center', gap: Spacing.xs, borderWidth: 1, padding: Spacing.md },
  bubble: { borderRadius: Radius.lg, borderTopRightRadius: Radius.sm, padding: Spacing.lg, maxWidth: '85%' },
});
