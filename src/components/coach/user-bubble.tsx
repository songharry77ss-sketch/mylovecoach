import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { L } from '@/lib/i18n';
import { toneLabel } from '@/lib/labels';
import type { ChatMessage } from '@/lib/types';

interface UserBubbleProps {
  message: ChatMessage;
  onPressImage?: (uri: string) => void;
}

/**
 * 내 말 — 옅은 라벤더 블루 말풍선 + 검정 글자(오른쪽). 캡처는 둥근 썸네일로.
 * 1.4 개편: 파랑→보라 그라데이션 + 흰 글자 말풍선을 걷었다(피클·ChatGPT 결 — 내 말풍선만 옅은 한 색).
 * 11/12 회의 9번 「보랏빛」은 바탕 대신 이 말풍선 색(theme.bubbleUser)으로 낸다.
 */
export function UserBubble({ message, onPressImage }: UserBubbleProps) {
  const theme = useTheme();
  // 캡처 파일을 읽지 못하면(지워졌거나 깨짐) 빈 회색 칸 대신 안내를 보여 준다
  const [broken, setBroken] = useState(false);
  const auto = message.text?.startsWith('🔄');
  return (
    <View style={styles.wrap}>
      {message.imageUri ? (
        broken ? (
          <View style={[styles.image, styles.broken, { backgroundColor: theme.surface, borderColor: theme.border }]} accessibilityLabel={L('불러오지 못한 대화 캡처', 'Screenshot couldn’t load')}>
            <Ionicons name="image-outline" size={28} color={theme.textTertiary} />
            <AppText variant="caption" color="textTertiary" align="center">
              {L('캡처를 불러오지 못했어요', 'Couldn’t load screenshot')}
            </AppText>
          </View>
        ) : (
          <Pressable accessibilityRole="imagebutton" accessibilityLabel={L('업로드한 대화 캡처 크게 보기', 'View uploaded screenshot')} onPress={() => onPressImage?.(message.imageUri!)}>
            <Image source={{ uri: message.imageUri }} style={[styles.image, { backgroundColor: theme.surface, borderColor: theme.border }]} contentFit="cover" transition={120} onError={() => setBroken(true)} />
          </Pressable>
        )
      ) : null}
      {message.text ? (
        auto ? (
          // 「다른 답장 더 보기」 자동 요청은 작은 칩으로
          <View style={[styles.autoChip, { backgroundColor: theme.surface }]}>
            <Ionicons name="refresh" size={13} color={theme.textSecondary} />
            <AppText variant="caption" color="textSecondary" weight="600">
              {L('다른 답장 더 보기', 'More replies')}
            </AppText>
          </View>
        ) : (
          <View style={[styles.bubble, { backgroundColor: theme.bubbleUser }]}>
            <AppText variant="body">{message.text}</AppText>
          </View>
        )
      ) : null}
      {message.tone && !auto ? (
        <AppText variant="caption" color="textTertiary">
          {L(`${toneLabel(message.tone).label} 톤으로 요청`, `Asked for: ${toneLabel(message.tone).label}`)}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'flex-end', gap: Spacing.xs + 2, alignSelf: 'stretch', paddingLeft: Spacing.xxxl },
  image: { width: 168, height: 240, borderRadius: 20, borderWidth: StyleSheet.hairlineWidth },
  broken: { alignItems: 'center', justifyContent: 'center', gap: Spacing.xs, borderWidth: 1, padding: Spacing.md },
  bubble: { borderRadius: 22, borderBottomRightRadius: 6, paddingHorizontal: Spacing.md + 2, paddingVertical: Spacing.md - 1 },
  autoChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: Spacing.md, paddingVertical: 7, borderRadius: Radius.pill },
});
