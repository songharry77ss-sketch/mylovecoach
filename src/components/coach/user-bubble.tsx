import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { Brand, Radius, Spacing, palette } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { toneLabel } from '@/lib/labels';
import type { ChatMessage } from '@/lib/types';

interface UserBubbleProps {
  message: ChatMessage;
  onPressImage?: (uri: string) => void;
}

/** 말풍선 그라데이션 — 흰 글자가 또렷하게(4.5:1 이상) 파랑 → 보라만 쓴다 */
const BUBBLE = [palette.sendBlue500, palette.sendViolet500] as const;

/** 내 말 — 센딧 그라데이션 말풍선(오른쪽). 캡처는 둥근 썸네일로 */
export function UserBubble({ message, onPressImage }: UserBubbleProps) {
  const theme = useTheme();
  // 캡처 파일을 읽지 못하면(지워졌거나 깨짐) 빈 회색 칸 대신 안내를 보여 준다
  const [broken, setBroken] = useState(false);
  const auto = message.text?.startsWith('🔄');
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
          <Pressable accessibilityRole="imagebutton" accessibilityLabel="업로드한 대화 캡처 크게 보기" onPress={() => onPressImage?.(message.imageUri!)}>
            <Image source={{ uri: message.imageUri }} style={[styles.image, { backgroundColor: theme.surface, borderColor: theme.border }]} contentFit="cover" transition={120} onError={() => setBroken(true)} />
          </Pressable>
        )
      ) : null}
      {message.text ? (
        auto ? (
          // 「다른 답장 더 보기」 자동 요청은 작은 칩으로
          <View style={[styles.autoChip, { backgroundColor: theme.primarySoft }]}>
            <Ionicons name="refresh" size={13} color={theme.primary} />
            <AppText variant="caption" color="primary" weight="700">
              다른 답장 더 보기
            </AppText>
          </View>
        ) : (
          <LinearGradient colors={BUBBLE} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.bubble}>
            <AppText variant="body" color={Brand.onBrand}>
              {message.text}
            </AppText>
          </LinearGradient>
        )
      ) : null}
      {message.tone && !auto ? (
        <AppText variant="caption" color="textTertiary">
          {toneLabel(message.tone).label} 톤으로 요청
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'flex-end', gap: Spacing.xs + 2, alignSelf: 'stretch', paddingLeft: Spacing.xxxl },
  image: { width: 168, height: 240, borderRadius: Radius.lg, borderWidth: StyleSheet.hairlineWidth },
  broken: { alignItems: 'center', justifyContent: 'center', gap: Spacing.xs, borderWidth: 1, padding: Spacing.md },
  bubble: { borderRadius: Radius.lg, borderBottomRightRadius: 6, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md },
  autoChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: Spacing.md, paddingVertical: 7, borderRadius: Radius.pill },
});
