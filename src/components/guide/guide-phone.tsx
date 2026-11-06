/**
 * 사용법 안내의 휴대폰 틀 — 실제 앱 화면 캡처(guide-steps 의 그림)를 틀 안에 보여 주고,
 * 누르는 곳에 반짝이는 원과 짧은 말을 띄운다. 크기·자르기·강조 위치는 모두 guide-steps 설정 값에서 온다.
 */
import { Image } from 'expo-image';
import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, FadeIn, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withTiming } from 'react-native-reanimated';

import { Brand, palette } from '@/constants/theme';

import { STATUS_BAR, type GuideBox, type GuideShot, type GuideSpot } from './guide-steps';

/** 휴대폰 테두리 색 — 짙은 먹색 (금속 느낌 없이 납작하게) */
const BEZEL = palette.sendInk;
/** 아이폰 화면 대비 다이내믹 아일랜드 크기 (393pt 기준 125×37, 위에서 11) */
const ISLAND = { w: 125 / 393, h: 37 / 393, top: 11 / 393 };
/** 화면 모서리 둥글기 (화면 폭 대비) */
const SCREEN_RADIUS = 0.13;
const SPOT = 44;

export interface PhoneLayout {
  /** 휴대폰 바깥 폭 */
  width: number;
  /** 틀 두께 */
  bezel: number;
  /** 화면(그림) 폭 */
  screenWidth: number;
  /** 그림 전체를 화면 폭에 맞췄을 때의 높이 */
  imageHeight: number;
  /** 휴대폰을 다 보여 주는지 (아니면 카드 아래로 잘려 이어진다) */
  whole: boolean;
  /** 휴대폰 바깥 높이 */
  height: number;
}

/**
 * 카드 안 공간(가로·세로)에 맞춰 휴대폰 크기를 정한다 — crop 범위가 다 보이는 가장 큰 크기 (가로는 카드의 78%, 300 까지).
 * crop 이 그림 끝까지면 휴대폰 전체를, 아니면 카드 아래로 잘려 이어지게 그린다.
 */
export function phoneLayout(shot: GuideShot, area: { width: number; height: number }): PhoneLayout {
  const ratio = shot.height / shot.width;
  const span = Math.min(1, Math.max(0.15, shot.crop.bottom - shot.crop.top));
  const height = Math.max(160, area.height);
  // 위 테두리 + 보일 범위가 공간 높이에 들어오게 (테두리는 폭의 2.6%)
  const byHeight = height / (0.026 + 0.948 * ratio * span);
  const width = Math.floor(Math.max(120, Math.min(byHeight, area.width * 0.78, 300)));
  const bezel = Math.max(5, Math.round(width * 0.026));
  const screenWidth = width - bezel * 2;
  const imageHeight = screenWidth * ratio;
  const rest = imageHeight * (1 - shot.crop.top);
  const whole = shot.crop.bottom >= 0.999 && rest + bezel * 2 <= height + 1;
  return { width, bezel, screenWidth, imageHeight, whole, height: whole ? rest + bezel * 2 : height + 48 };
}

/** 휴대폰 틀 + 실제 화면 + 누르는 곳 표시 */
export function GuidePhone({ shot, area, active }: { shot: GuideShot; area: { width: number; height: number }; active: boolean }) {
  const layout = phoneLayout(shot, area);
  const { width, bezel, screenWidth, imageHeight, whole, height } = layout;
  const cropTop = shot.crop.top * imageHeight;
  const statusHeight = STATUS_BAR * imageHeight;
  const radius = screenWidth * SCREEN_RADIUS;
  // 그림 비율 좌표 → 화면 안 좌표
  const at = (x: number, y: number) => ({ left: x * screenWidth, top: y * imageHeight - cropTop });
  // 작은 화면에서 카드 아래로 잘려 안 보이는 곳은 표시하지 않는다 (아래에 붙는 말 높이까지 들어와야 보인다)
  const shown = height - bezel - (whole ? bezel : 48) - 8;
  const fits = (y: number, below: boolean) => at(0, y).top + (below ? 46 : SPOT / 2) <= shown;
  const boxes = (shot.boxes ?? []).filter((b) => fits(b.y + b.h, b.side === 'bottom'));
  const spots = shot.spots.filter((p) => fits(p.y, p.side === 'bottom'));

  return (
    <View style={[styles.phone, { width, height, padding: bezel, paddingBottom: whole ? bezel : 0, borderRadius: radius + bezel }, whole ? null : styles.openBottom]}>
      <View style={[styles.screen, { borderRadius: radius }, whole ? null : { borderBottomLeftRadius: 0, borderBottomRightRadius: 0 }]}>
        <Image source={shot.image} style={{ position: 'absolute', left: 0, top: -cropTop, width: screenWidth, height: imageHeight }} contentFit="fill" accessibilityIgnoresInvertColors />
        {/* 내린 화면이어도 상태 표시줄은 맨 위에 그대로 */}
        {cropTop > statusHeight ? (
          <View style={[styles.statusStrip, { height: statusHeight }]}>
            <Image source={shot.image} style={{ width: screenWidth, height: imageHeight }} contentFit="fill" accessibilityIgnoresInvertColors />
          </View>
        ) : null}
        <View style={[styles.island, { width: screenWidth * ISLAND.w, height: screenWidth * ISLAND.h, top: screenWidth * ISLAND.top, left: (screenWidth * (1 - ISLAND.w)) / 2, borderRadius: screenWidth * ISLAND.h }]} />
      </View>
      {/* 말이 화면 밖으로 조금 나가도 잘리지 않게 화면 위에 따로 얹는다 */}
      {active ? (
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { left: bezel, top: bezel }]}>
          {/* 보는 곳(상자) 다음에 누르는 곳(점)이 차례로 나타난다 */}
          {boxes.map((box, i) => (
            <Look key={`b${box.x}-${box.y}`} box={box} {...at(box.x, box.y)} width={box.w * screenWidth} height={box.h * imageHeight} delay={500 + i * 650} />
          ))}
          {spots.map((spot, i) => (
            <Spot key={`s${spot.x}-${spot.y}`} spot={spot} {...at(spot.x, spot.y)} delay={500 + (boxes.length + i) * 650} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

/** 반짝이며 퍼지는 원 + 짧은 말 */
function Spot({ spot, left, top, delay }: { spot: GuideSpot; left: number; top: number; delay: number }) {
  const pulse = useSharedValue(0);
  useEffect(() => {
    pulse.value = withDelay(delay, withRepeat(withTiming(1, { duration: 1500, easing: Easing.out(Easing.quad) }), -1, false));
  }, [delay, pulse]);
  const ring = useAnimatedStyle(() => ({ opacity: 0.9 * (1 - pulse.value), transform: [{ scale: 0.45 + pulse.value * 1.1 }] }));
  const side = spot.side ?? 'right';
  return (
    <Animated.View entering={FadeIn.delay(delay).duration(320)} style={[styles.spot, { left: left - SPOT / 2, top: top - SPOT / 2 }]}>
      <Animated.View style={[styles.ring, ring]} />
      <View style={styles.halo} />
      <View style={styles.dot} />
      {spot.label ? (
        <View style={[styles.labelWrap, LABEL_SIDE[side]]}>
          <View style={styles.label}>
            <Text style={styles.labelText} numberOfLines={1}>
              {spot.label}
            </Text>
          </View>
        </View>
      ) : null}
    </Animated.View>
  );
}

/** 둘러 강조하는 상자 + 짧은 말 */
function Look({ box, left, top, width, height, delay }: { box: GuideBox; left: number; top: number; width: number; height: number; delay: number }) {
  return (
    <Animated.View entering={FadeIn.delay(delay).duration(360)} style={[styles.box, { left: left - 3, top: top - 3, width: width + 6, height: height + 6 }]}>
      <View style={styles.boxFill} />
      {box.label ? (
        <View style={[styles.boxLabel, box.side === 'bottom' ? { top: height + 12 } : { bottom: height + 12 }]}>
          <View style={styles.label}>
            <Text style={styles.labelText} numberOfLines={1}>
              {box.label}
            </Text>
          </View>
        </View>
      ) : null}
    </Animated.View>
  );
}

const LABEL_GAP = SPOT / 2 + 4;
const LABEL_SIDE = StyleSheet.create({
  top: { bottom: SPOT - 6, left: -80, right: -80, alignItems: 'center' },
  bottom: { top: SPOT - 6, left: -80, right: -80, alignItems: 'center' },
  right: { left: SPOT / 2 + LABEL_GAP, top: 0, bottom: 0, width: 180, justifyContent: 'center', alignItems: 'flex-start' },
  left: { right: SPOT / 2 + LABEL_GAP, top: 0, bottom: 0, width: 180, justifyContent: 'center', alignItems: 'flex-end' },
});

const styles = StyleSheet.create({
  phone: {
    backgroundColor: BEZEL,
    // 카드 위에 살짝 뜬 느낌만 (빛 번짐 없이)
    shadowColor: palette.sendInk,
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.28,
    shadowRadius: 24,
    elevation: 12,
  },
  openBottom: { borderBottomLeftRadius: 0, borderBottomRightRadius: 0 },
  screen: { flex: 1, overflow: 'hidden', backgroundColor: palette.white },
  statusStrip: { position: 'absolute', top: 0, left: 0, right: 0, overflow: 'hidden' },
  island: { position: 'absolute', backgroundColor: palette.black },
  box: { position: 'absolute', borderRadius: 12, borderWidth: 2.5, borderColor: Brand.blue },
  boxFill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 10, backgroundColor: Brand.blue, opacity: 0.08 },
  boxLabel: { position: 'absolute', left: -80, right: -80, alignItems: 'center' },
  spot: { position: 'absolute', width: SPOT, height: SPOT, alignItems: 'center', justifyContent: 'center' },
  // 퍼지는 고리는 테두리만 (아래 글자를 덮지 않게), 가운데 점은 흰 바탕·파란 바탕 어디서나 보이게 흰 점 + 파란 테
  ring: { position: 'absolute', width: SPOT, height: SPOT, borderRadius: SPOT / 2, borderWidth: 3, borderColor: Brand.blue },
  halo: { position: 'absolute', width: 24, height: 24, borderRadius: 12, backgroundColor: Brand.blue, opacity: 0.22 },
  dot: { width: 14, height: 14, borderRadius: 7, backgroundColor: palette.white, borderWidth: 3.5, borderColor: Brand.blue },
  labelWrap: { position: 'absolute' },
  label: { backgroundColor: palette.sendInk, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  labelText: { color: palette.white, fontSize: 12, fontWeight: '800', letterSpacing: -0.2 },
});
