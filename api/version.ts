/**
 * GET /api/version?platform=ios|android — 앱이 「새 버전이 나왔어요」 안내를 띄울지 정하는 데 쓰는 버전 정보.
 * 응답: { latest, min } — 모르면 null (앱은 아무것도 띄우지 않는다)
 *  - latest : 스토어에서 지금 받을 수 있는 최신 버전. 이보다 낮은 앱은 업데이트를 권한다 (닫을 수 있음)
 *  - min    : 이보다 낮은 앱은 업데이트해야 계속 쓸 수 있다고 안내한다 (닫을 수 없음). 꼭 필요할 때만 환경변수로 켠다
 * iOS 최신 버전은 App Store 공개 조회(iTunes lookup)에서 읽는다 — 출시할 때마다 손으로 바꾸지 않아도 된다.
 *   출시 직후에는 스토어에 퍼지는 중이라 「업데이트」를 눌러도 새 버전이 안 보일 수 있어, 출시 6시간 뒤부터 알린다.
 * 환경변수(모두 선택): IOS_LATEST_VERSION(공개 조회 대신 이 값), ANDROID_LATEST_VERSION(Play 는 공개 조회가 없어 직접 적는다),
 *   IOS_MIN_VERSION, ANDROID_MIN_VERSION, COACH_APP_TOKEN(앱 토큰 검사)
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';

export const config = { maxDuration: 10 };

const IOS_BUNDLE_ID = 'app.mylovecoach.ios';
const LOOKUP_URL = `https://itunes.apple.com/lookup?bundleId=${IOS_BUNDLE_ID}&country=kr`;
/** 출시 뒤 이만큼 지나야 새 버전을 알린다 (스토어에 퍼지는 시간) */
export const RELEASE_SETTLE_MS = 6 * 60 * 60 * 1000;
const CACHE_MS = 10 * 60 * 1000;
const LOOKUP_TIMEOUT_MS = 4000;

const VERSION = /^\d{1,4}(\.\d{1,4}){0,3}$/;
/** 버전 모양이 아니면 null (환경변수 오타가 앱 안내로 새지 않게) */
export const cleanVersion = (value: unknown): string | null => (typeof value === 'string' && VERSION.test(value.trim()) ? value.trim() : null);

/** App Store 공개 조회 응답에서, 출시 뒤 충분히 지난 최신 버전만 고른다 */
export function iosLatestFromLookup(json: unknown, now: number): string | null {
  const app = (json as { results?: { version?: unknown; currentVersionReleaseDate?: unknown }[] } | null)?.results?.[0];
  const version = cleanVersion(app?.version);
  if (!version) return null;
  const released = typeof app?.currentVersionReleaseDate === 'string' ? Date.parse(app.currentVersionReleaseDate) : NaN;
  // 출시 시각을 모르면 알리지 않는다 (막 올라온 버전일 수 있음)
  if (!Number.isFinite(released) || now - released < RELEASE_SETTLE_MS) return null;
  return version;
}

let cached: { latest: string | null; at: number } | null = null;

/** 테스트에서 조회 결과 기억을 비운다 */
export const resetVersionCacheForTest = () => {
  cached = null;
};

async function iosLatest(now: number): Promise<string | null> {
  if (cached && now - cached.at < CACHE_MS) return cached.latest;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LOOKUP_TIMEOUT_MS);
  try {
    const res = await fetch(LOOKUP_URL, { signal: controller.signal });
    if (!res.ok) throw new Error(`lookup ${res.status}`);
    cached = { latest: iosLatestFromLookup(await res.json(), now), at: now };
  } catch {
    // 조회가 안 되면 앞서 읽은 값을 그대로 쓴다 (없으면 모름)
  } finally {
    clearTimeout(timer);
  }
  return cached?.latest ?? null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('cache-control', 'no-store');
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'GET만 지원합니다.' });
    return;
  }
  const expectedToken = process.env.COACH_APP_TOKEN;
  if (expectedToken && req.headers['x-app-token'] !== expectedToken) {
    res.status(401).end();
    return;
  }
  const platform = String(req.query.platform ?? '');
  if (platform !== 'ios' && platform !== 'android') {
    res.status(400).json({ error: 'platform 은 ios 또는 android 여야 해요.' });
    return;
  }
  const latest =
    platform === 'ios' ? (cleanVersion(process.env.IOS_LATEST_VERSION) ?? (await iosLatest(Date.now()))) : cleanVersion(process.env.ANDROID_LATEST_VERSION);
  const min = cleanVersion(platform === 'ios' ? process.env.IOS_MIN_VERSION : process.env.ANDROID_MIN_VERSION);
  res.status(200).json({ latest, min });
}
