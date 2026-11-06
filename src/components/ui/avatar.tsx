import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { palette } from '@/constants/theme';

interface AvatarProps {
  name: string;
  uri?: string;
  size?: number;
  seed?: string;
}

/** 사진이 없을 때 첫 글자 바탕 — 센딧 색(하늘색·파랑·보라) 위주에 민트·살구로 구분만 (분홍은 쓰지 않는다) */
const AVATAR_COLORS = [
  [palette.sky100, palette.sky600],
  [palette.sendMist, palette.sendBlue600],
  [palette.lavender100, palette.sendViolet600],
  [palette.mint100, '#1E9E6E'],
  [palette.sendSky50, palette.sendBlue700],
  [palette.peach100, '#D2712E'],
];

export function Avatar({ name, uri, size = 48, seed }: AvatarProps) {
  const key = seed ?? name;
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  const [bg, fg] = AVATAR_COLORS[hash % AVATAR_COLORS.length];
  const radius = size * 0.38;
  if (uri) {
    return <Image source={{ uri }} style={{ width: size, height: size, borderRadius: radius }} contentFit="cover" transition={150} />;
  }
  return (
    <View style={[styles.fallback, { width: size, height: size, borderRadius: radius, backgroundColor: bg }]}>
      <AppText style={{ fontSize: size * 0.4, lineHeight: size * 0.5, fontWeight: '700' }} color={fg}>
        {name.trim().slice(0, 1) || '?'}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({ fallback: { alignItems: 'center', justifyContent: 'center' } });
