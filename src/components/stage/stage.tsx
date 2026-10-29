/**
 * 무대 화면 부품 — 스토어 상세 페이지(에스프레소 바탕 · 흰 큰 글자 · 골드 강조 · 하트 낙서 · 폴라로이드 사진)를 앱 안에서 그대로 쓴다.
 * 첫 화면 소개, 나에 대해, 캡처 안내, 홈 머리말, 탐색, 결제 화면이 같은 결로 보이게.
 */
import { Ionicons } from '@expo/vector-icons';
import { Image, type ImageSource } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Fragment, type ReactNode } from 'react';
import { StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';

import { Radius, Spacing, Stage, Typography, type ThemeColors } from '@/constants/theme';

/** 앱에 넣은 AI 가상 인물 사진 (스토어 소개 이미지와 같은 인물 · 실존 인물 아님) */
export const STAGE_PHOTOS = {
  cafeWoman: require('../../../assets/images/stage/cafe-woman.jpg'),
  lamplightWoman: require('../../../assets/images/stage/lamplight-woman.jpg'),
  riversideCouple: require('../../../assets/images/stage/riverside-couple.jpg'),
  sofaMan: require('../../../assets/images/stage/sofa-man.jpg'),
  sunsetWoman: require('../../../assets/images/stage/sunset-woman.jpg'),
  windowMan: require('../../../assets/images/stage/window-man.jpg'),
} satisfies Record<string, ImageSource>;
export type StagePhoto = keyof typeof STAGE_PHOTOS;

interface StageBackgroundProps {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** 위쪽에 깔 사진 — 아래로 갈수록 바탕색으로 녹아든다 */
  photo?: StagePhoto;
  /** 사진이 차지하는 높이 (기본 화면 위 58%) */
  photoHeight?: number | `${number}%`;
}

/** 에스프레소 바탕 + 따뜻한 조명 + (선택) 위쪽 사진 */
export function StageBackground({ children, style, photo, photoHeight = '58%' }: StageBackgroundProps) {
  return (
    <LinearGradient colors={Stage.bg} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={[styles.fill, style]}>
      {photo ? (
        <View pointerEvents="none" style={[styles.photoWrap, { height: photoHeight }]}>
          <Image source={STAGE_PHOTOS[photo]} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} accessibilityIgnoresInvertColors />
          <LinearGradient colors={['rgba(18,10,12,0.15)', 'rgba(30,18,20,0.35)', Stage.bg[1]]} locations={[0, 0.55, 1]} style={StyleSheet.absoluteFill} />
        </View>
      ) : (
        <LinearGradient pointerEvents="none" colors={[Stage.glow, 'rgba(255,176,120,0)']} start={{ x: 0.8, y: 0 }} end={{ x: 0.2, y: 0.6 }} style={styles.glow} />
      )}
      {children}
    </LinearGradient>
  );
}

interface HighlightProps {
  /** *별표* 로 감싼 부분이 골드로 칠해진다. 줄바꿈은 \n */
  text: string;
  variant?: keyof typeof Typography;
  color?: string;
  accent?: string;
  align?: TextStyle['textAlign'];
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
}

/** 스토어 이미지처럼 일부 단어만 골드로 강조한 큰 제목 */
export function Highlight({ text, variant = 'hero', color = Stage.text, accent = Stage.gold, align, style, numberOfLines }: HighlightProps) {
  const parts = text.split('*');
  return (
    <Text accessibilityRole="header" numberOfLines={numberOfLines} style={[Typography[variant], { color }, align ? { textAlign: align } : null, style]}>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <Text key={i} style={{ color: accent }}>
            {part}
          </Text>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </Text>
  );
}

/** 「실제 답장 예시」 같은 작은 흰 알약 이름표 */
export function StagePill({ label, icon, style }: { label: string; icon?: keyof typeof Ionicons.glyphMap; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.pill, style]}>
      {icon ? <Ionicons name={icon} size={12} color={Stage.cardText} /> : null}
      <Text style={styles.pillText}>{label}</Text>
    </View>
  );
}

/** 반투명 흰 테두리의 작은 칩 (무대 바탕 위 보조 정보) */
export function StageChip({ label, style }: { label: string; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.chip, style]}>
      <Text style={styles.chipText}>{label}</Text>
    </View>
  );
}

/** 손으로 그린 듯한 골드 하트 (스토어 이미지의 하트 낙서) */
export function HeartMark({ size = 36, rotate = -12, style }: { size?: number; rotate?: number; style?: StyleProp<ViewStyle> }) {
  return (
    <View pointerEvents="none" style={[{ transform: [{ rotate: `${rotate}deg` }] }, style]}>
      <Ionicons name="heart-outline" size={size} color={Stage.gold} />
    </View>
  );
}

/** 흰 테두리 폴라로이드 사진 */
export function Polaroid({ photo, width = 150, rotate = -4, style }: { photo: StagePhoto; width?: number; rotate?: number; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.polaroid, { width, transform: [{ rotate: `${rotate}deg` }] }, style]}>
      <Image source={STAGE_PHOTOS[photo]} style={{ width: width - 12, height: (width - 12) * 1.18, borderRadius: 4 }} contentFit="cover" transition={200} />
    </View>
  );
}

/** 「+10°」 같은 기울어진 골드 스티커 */
export function GoldSticker({ text, rotate = 8, style }: { text: string; rotate?: number; style?: StyleProp<ViewStyle> }) {
  return (
    <View pointerEvents="none" style={[styles.sticker, { transform: [{ rotate: `${rotate}deg` }] }, style]}>
      <Text style={styles.stickerText}>{text}</Text>
    </View>
  );
}

/** 무대 위 흰 카드 — 실제 앱 화면 조각(답장 예시·온도 등)을 보여 줄 때 */
export function StageCard({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

/** 무대 화면 안의 글자 색 (밝은 테마 색 대신) */
export const stageText = (dim = false): string => (dim ? Stage.textDim : Stage.text);

/** 밝은 화면의 테마 색으로 무대 카드 안 글자를 칠할 때 쓰는 고정 색 */
export const STAGE_CARD_COLORS: Pick<ThemeColors, 'text' | 'textSecondary'> = { text: Stage.cardText, textSecondary: '#7A6A6C' };

const styles = StyleSheet.create({
  fill: { flex: 1 },
  photoWrap: { position: 'absolute', top: 0, left: 0, right: 0, overflow: 'hidden' },
  glow: { position: 'absolute', top: -120, right: -80, width: 420, height: 420, borderRadius: 210 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    backgroundColor: Stage.card,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.pill,
  },
  pillText: { fontSize: 11, lineHeight: 15, fontWeight: '800', color: Stage.cardText, letterSpacing: -0.2 },
  chip: { alignSelf: 'flex-start', borderRadius: Radius.pill, borderWidth: 1, borderColor: Stage.chipBorder, backgroundColor: Stage.chip, paddingHorizontal: 12, paddingVertical: 6 },
  chipText: { fontSize: 13, lineHeight: 18, fontWeight: '700', color: Stage.text },
  polaroid: {
    backgroundColor: '#FFFDF8',
    padding: 6,
    paddingBottom: 18,
    borderRadius: 6,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  sticker: {
    alignSelf: 'flex-start',
    backgroundColor: Stage.gold,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: Radius.md,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  stickerText: { fontSize: 22, lineHeight: 26, fontWeight: '900', color: Stage.onGold, letterSpacing: -0.6 },
  card: {
    backgroundColor: Stage.card,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    gap: Spacing.sm,
    shadowColor: '#000',
    shadowOpacity: 0.28,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
});
