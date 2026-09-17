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

const AVATAR_COLORS = [
  [palette.sky100, palette.sky600],
  [palette.pink100, palette.pink600],
  [palette.lavender100, '#6F5AE0'],
  [palette.mint100, '#1E9E6E'],
  [palette.peach100, '#D2712E'],
  [palette.yellow100, '#B58A00'],
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
