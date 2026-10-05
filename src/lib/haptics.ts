/**
 * 진동(햅틱) 효과 모음.
 * 화면 곳곳에서 같은 손맛이 나도록 상황별 패턴을 한곳에 모았다.
 * - iOS: Taptic Engine (impact · notification · selection)
 * - Android: 시스템 햅틱(performAndroidHapticsAsync)을 우선 쓰고, 묵직한 효과는 impact 로
 * - 웹: expo-haptics 가 navigator.vibrate 로 흉내 낸다 (지원하는 휴대폰 브라우저에서만)
 * 마이 탭에서 「진동 효과」를 끄면 전부 무시된다.
 */
import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

const { ImpactFeedbackStyle: Impact, NotificationFeedbackType: Notify, AndroidHaptics } = Haptics;

let enabled = true;

export function setHapticsEnabled(value: boolean) {
  enabled = value;
}

export function hapticsEnabled(): boolean {
  return enabled;
}

const run = (fn: () => Promise<void>) => {
  if (!enabled) return;
  try {
    fn().catch(() => {});
  } catch {
    // 진동 모듈이 없는 환경(테스트 등)에서는 조용히 넘어간다
  }
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Step = Haptics.ImpactFeedbackStyle | 'success' | 'warning' | 'error' | 'select';

const once = (step: Step) => {
  if (step === 'success' || step === 'warning' || step === 'error') {
    const type = step === 'success' ? Notify.Success : step === 'warning' ? Notify.Warning : Notify.Error;
    run(() => Haptics.notificationAsync(type));
  } else if (step === 'select') {
    run(() => Haptics.selectionAsync());
  } else {
    run(() => Haptics.impactAsync(step));
  }
};

/** 여러 번 이어지는 패턴. [효과, 다음 효과까지 대기 ms] */
async function sequence(steps: [Step, number][]) {
  if (!enabled) return;
  for (const [step, wait] of steps) {
    once(step);
    if (wait > 0) await sleep(wait);
  }
}

const androidOr = (type: Haptics.AndroidHaptics, fallback: Step) => {
  if (Platform.OS === 'android') run(() => Haptics.performAndroidHapticsAsync(type));
  else once(fallback);
};

let lastTick = 0;

export const haptic = {
  /** 일반 버튼 */
  tap: () => once(Impact.Light),
  /** 칩·토글·탭 전환처럼 가벼운 선택 */
  select: () => androidOr(AndroidHaptics.Segment_Tick, 'select'),
  /** 온도계·카운터 눈금 — 너무 잦으면 건너뛴다 */
  tick: () => {
    const now = Date.now();
    if (now - lastTick < 45) return;
    lastTick = now;
    androidOr(AndroidHaptics.Clock_Tick, 'select');
  },
  /** 묵직한 확정 (보내기·시작) */
  thud: () => once(Impact.Medium),
  heavy: () => once(Impact.Heavy),
  /** 말랑한 눌림 (카드·타일) */
  soft: () => once(Impact.Soft),
  /** 스와이프로 카드가 넘어가 자리를 잡을 때 */
  snap: () => androidOr(AndroidHaptics.Gesture_End, Impact.Rigid),
  /** 길게 누르기 */
  longPress: () => androidOr(AndroidHaptics.Long_Press, Impact.Medium),
  success: () => once('success'),
  warning: () => once('warning'),
  error: () => once('error'),
  /** 두근두근 — 심장이 두 번 뛰는 느낌 */
  heartbeat: () => sequence([[Impact.Medium, 130], [Impact.Light, 0]]),
  /** 온도가 오를 때 — 점점 세게 */
  rise: () => sequence([[Impact.Light, 70], [Impact.Medium, 70], [Impact.Heavy, 0]]),
  /** 온도가 떨어질 때 — 툭 떨어지는 느낌 */
  drop: () => sequence([[Impact.Rigid, 110], [Impact.Soft, 0]]),
  /** 축하 — 팡파레 */
  celebrate: () => sequence([['success', 170], [Impact.Heavy, 90], [Impact.Medium, 90], [Impact.Light, 0]]),
  /** 결과 카드가 도착했을 때 */
  arrive: () => sequence([[Impact.Soft, 80], [Impact.Medium, 0]]),
};

export type HapticName = keyof typeof haptic;
