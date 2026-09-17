import { Image } from 'expo-image';
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
  return (
    <View style={styles.wrap}>
      {message.imageUri ? (
        <Pressable accessibilityRole="imagebutton" accessibilityLabel="업로드한 대화 캡처" onPress={() => onPressImage?.(message.imageUri!)}>
          <Image source={{ uri: message.imageUri }} style={[styles.image, { backgroundColor: theme.surface }]} contentFit="cover" transition={120} />
        </Pressable>
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
  bubble: { borderRadius: Radius.lg, borderTopRightRadius: Radius.sm, padding: Spacing.lg, maxWidth: '85%' },
});
