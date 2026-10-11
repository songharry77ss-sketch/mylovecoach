/**
 * 새 버전 안내 — 스토어에 더 새 버전이 나와 있으면 업데이트를 권한다.
 * 서버(api/version.ts)가 스토어의 최신 버전(latest)과, 꼭 필요할 때만 켜는 최소 지원 버전(min)을 알려 준다.
 * 웹은 늘 최신이라 확인하지 않는다.
 */
import Constants from 'expo-constants';
import { Linking, Platform } from 'react-native';

import { ANDROID_PACKAGE } from '@/lib/billing/plans';
import { APP_CONFIG } from '@/lib/config';
import { isDemoMode } from '@/lib/demo';

const IOS_APP_ID = '6813404855';
/** 「나중에」를 누르면 이만큼 지난 뒤 다시 권한다 */
export const UPDATE_SNOOZE_MS = 3 * 24 * 60 * 60 * 1000;
/** 「업데이트하기」로 스토어에 다녀온 뒤에도 그대로면 이만큼 지난 뒤 다시 권한다 */
export const UPDATE_RETRY_MS = 24 * 60 * 60 * 1000;
/** 켜져 있는 동안 이 간격보다 자주 묻지 않는다 */
const CHECK_EVERY_MS = 6 * 60 * 60 * 1000;
const TIMEOUT_MS = 8000;

export interface AppUpdate {
  /** 스토어의 최신 버전 */
  latest: string;
  /** 업데이트해야 계속 쓸 수 있음 (닫을 수 없는 안내) */
  required: boolean;
}

export const currentVersion = (): string => Constants.expoConfig?.version ?? '';

/** 점으로 나눈 숫자끼리 비교한다 (1.0.10 > 1.0.9, 1.0 = 1.0.0). a 가 크면 양수 */
export function compareVersions(a: string, b: string): number {
  const parts = (v: string) => v.split('.').map((n) => Number.parseInt(n, 10) || 0);
  const [x, y] = [parts(a), parts(b)];
  for (let i = 0; i < Math.max(x.length, y.length); i += 1) {
    const diff = (x[i] ?? 0) - (y[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

const versionOf = (value: unknown): string | null => (typeof value === 'string' && /^\d+(\.\d+)*$/.test(value) ? value : null);

/** 서버가 알려 준 버전으로 안내할 것이 있는지 정한다 — 없으면 null */
export function updateFor(current: string, server: { latest?: unknown; min?: unknown } | null | undefined): AppUpdate | null {
  if (!versionOf(current)) return null;
  const latest = versionOf(server?.latest);
  const min = versionOf(server?.min);
  const required = min != null && compareVersions(current, min) < 0;
  const newer = latest != null && compareVersions(current, latest) < 0;
  if (!required && !newer) return null;
  // 최소 버전만 알려 준 경우에도 받을 버전을 보여 줄 수 있게 한다
  return { latest: newer && latest ? latest : (min ?? current), required };
}

let lastCheckedAt = 0;

/** 테스트에서 확인 간격 기억을 비운다 */
export const resetUpdateCheckForTest = () => {
  lastCheckedAt = 0;
};

/**
 * 서버에 최신 버전을 묻는다. 안내할 것이 없으면 null, 확인하지 못했으면(오프라인·서버 없음·아직 물을 때가 아님) undefined.
 * force 는 확인 간격을 건너뛴다 (서버가 「업데이트가 필요해요」로 거절했을 때).
 */
export async function fetchAppUpdate(now = Date.now(), force = false): Promise<AppUpdate | null | undefined> {
  if (Platform.OS === 'web' || isDemoMode || !APP_CONFIG.apiUrl) return undefined;
  if (!force && now - lastCheckedAt < CHECK_EVERY_MS) return undefined;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${APP_CONFIG.apiUrl}/api/version?platform=${Platform.OS}`, {
      headers: APP_CONFIG.apiToken ? { 'x-app-token': APP_CONFIG.apiToken } : {},
      signal: controller.signal,
    });
    if (!res.ok) return undefined;
    const update = updateFor(currentVersion(), (await res.json()) as { latest?: unknown; min?: unknown });
    lastCheckedAt = now;
    return update;
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}

let onServerAsksUpdate: (() => void) | null = null;

/** 서버가 「업데이트가 필요해요」(426)로 거절했을 때 부를 함수 — 새 버전 안내 시트(AppUpdateHost)가 등록한다 */
export const setUpdateRequestHandler = (fn: (() => void) | null) => {
  onServerAsksUpdate = fn;
};

/** 서버가 업데이트를 요구했다 — 미뤄 둔 안내가 있어도 바로 다시 확인해 띄운다 */
export const requestUpdatePrompt = () => onServerAsksUpdate?.();

/** 스토어의 앱 페이지를 연다 — 스토어 앱으로 바로 열고, 안 되면 웹 주소로 */
export async function openStore(): Promise<void> {
  const [direct, web] =
    Platform.OS === 'android'
      ? [`market://details?id=${ANDROID_PACKAGE}`, `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE}`]
      : [`itms-apps://apps.apple.com/app/id${IOS_APP_ID}`, `https://apps.apple.com/kr/app/id${IOS_APP_ID}`];
  await Linking.openURL(direct).catch(() => Linking.openURL(web));
}
