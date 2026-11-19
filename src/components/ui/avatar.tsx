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

/**
 * 사진이 없을 때 첫 글자 바탕 — 1.4 개편: 사람마다 다른 여섯 가지 색(하늘·파랑·보라·민트·살구)을 걷고
 * 홈 목록(RoomAvatar)과 같은 옅은 파랑 한 가지로 — 같은 상대가 화면마다 다른 색으로 보였다.
 */
const AVATAR_COLORS = [[palette.sendMist, palette.sendBlue500]];

export function Avatar({ name, uri, size = 48, seed }: AvatarProps) {
  const key = seed ?? name;
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  const [bg, fg] = AVATAR_COLORS[hash % AVATAR_COLORS.length];
  const radius = size / 2;
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
