/**
 * GET /api/version?platform=ios|android — 앱이 「새 버전이 나왔어요」 안내를 띄울지 정하는 데 쓰는 버전 정보.
 * 응답: { latest, min, notes? } — 모르면 null (앱은 아무것도 띄우지 않는다). 최신 버전을 확인하지 못했으면 503 (앱이 곧 다시 묻는다)
 *  - latest : 스토어에서 지금 받을 수 있는 최신 버전. 이보다 낮은 앱은 업데이트를 권한다 (닫을 수 있음)
 *  - min    : 이보다 낮은 앱은 업데이트해야 계속 쓸 수 있다고 안내한다 (닫을 수 없음). 꼭 필요할 때만 환경변수로 켠다.
 *             받을 수 없는 버전으로 막히지 않게, 최신 버전을 모르면 무시하고 최신 버전보다 높으면 최신 버전으로 낮춘다
 *  - notes  : 최신 버전의 「이번 버전의 새로운 기능」(docs/STORE_LISTING.md, 스토어에 올린 문구와 같음). 없으면 빠진다.
 *             새 소식을 보여 주는 시트가 든 앱부터 쓴다 (예전 앱은 모르는 값이라 무시한다)
 * 최신 버전은 출시할 때마다 손으로 바꾸지 않아도 된다:
 *  - iOS     : App Store 공개 조회(iTunes lookup)
 *  - 안드로이드: Play 스토어 공개 앱 페이지에 적힌 버전 (Play 는 공개 조회 API 가 없다)
 *  출시 직후에는 스토어에 퍼지는 중이라 「업데이트」를 눌러도 새 버전이 안 보일 수 있어, 출시(안드로이드는 업데이트 날짜) 6시간 뒤부터 알린다.
 * 환경변수(모두 선택): IOS_LATEST_VERSION(공개 조회 대신 이 값),
 *   ANDROID_LATEST_VERSION(Play 페이지를 읽지 못했거나 막 올라온 버전이라 기다리는 동안 쓰는 값 — 마지막으로 알던 버전),
 *   IOS_MIN_VERSION, ANDROID_MIN_VERSION, COACH_APP_TOKEN(앱 토큰 검사)
 * 응답 머리글 x-version-source: store(스토어에서 읽음) · env(환경변수) · none — 배포 뒤 확인(vercel.yml)이 본다
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import type { VercelRequest, VercelResponse } from '@vercel/node';

import { cleanNotes, whatsNewFor } from '../src/lib/release-notes';
import { compareVersions } from '../src/lib/version';

export const config = { maxDuration: 10 };

const IOS_BUNDLE_ID = 'app.mylovecoach.ios';
const ANDROID_PACKAGE = 'app.mylovecoach.android';
const LOOKUP_URL = `https://itunes.apple.com/lookup?bundleId=${IOS_BUNDLE_ID}&country=kr`;
const PLAY_URL = `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE}&hl=ko&gl=KR`;
/** 출시 뒤 이만큼 지나야 새 버전을 알린다 (스토어에 퍼지는 시간) */
export const RELEASE_SETTLE_MS = 6 * 60 * 60 * 1000;
const CACHE_MS = 10 * 60 * 1000;
/** 조회가 실패하면 이만큼은 다시 조회하지 않는다 (스토어 쪽 장애 때 요청마다 기다리지 않게) */
const FAIL_CACHE_MS = 60 * 1000;
const LOOKUP_TIMEOUT_MS = 4000;

type StorePlatform = 'ios' | 'android';

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

/*
 * Play 앱 페이지에 심긴 데이터(AF_initDataCallback ds:5)의 「버전」·「업데이트 날짜」 칸 — 2026-11 기준 모양:
 *   "141":[[["1.0.7"]],[[[36]],[[[24,"7.0"]]]]],"146":[["2026. 10. 30.",[1793288830,134000000]]]
 * 칸 번호가 바뀌면 버전만 담긴 [[["1.0.7"]]] 모양이 페이지에 하나뿐일 때 그것을 쓴다.
 */
const PLAY_VERSION = /"141":\[\[\["(\d{1,4}(?:\.\d{1,4}){0,3})"\]\]/;
const PLAY_VERSION_LOOSE = /\[\[\["(\d{1,4}(?:\.\d{1,4}){1,3})"\]\]/g;
const PLAY_UPDATED = /"146":\[\["[^"]*",\[(\d{9,11})[,\]]/;

/**
 * Play 앱 페이지에서 지금 받을 수 있는 버전을 읽는다.
 * 페이지에 보이는 버전은 이미 출시된 것이지만, 업데이트 날짜가 6시간 안이면 아직 알리지 않는다(null).
 * 버전을 찾지 못하면 undefined (페이지 모양이 바뀜 — 모름).
 */
export function androidLatestFromPage(html: string, now: number): string | null | undefined {
  let version = cleanVersion(PLAY_VERSION.exec(html)?.[1]);
  if (!version) {
    const loose = [...new Set([...html.matchAll(PLAY_VERSION_LOOSE)].map((m) => m[1]))];
    version = loose.length === 1 ? cleanVersion(loose[0]) : null;
  }
  if (!version) return undefined;
  const updated = Number(PLAY_UPDATED.exec(html)?.[1]) * 1000;
  // 날짜를 못 읽으면 그대로 알린다 — 페이지에 보이는 버전은 이미 출시된 것이고, 날짜는 대개 출시(검토 통과)보다 이르다
  if (Number.isFinite(updated) && updated > 0 && now - updated < RELEASE_SETTLE_MS) return null;
  return version;
}

/** 최소 지원 버전은 실제로 받을 수 있는 버전을 넘지 못한다 — 최신 버전을 모르면 쓰지 않는다 */
export function clampMin(min: string | null, latest: string | null): string | null {
  if (!min || !latest) return null;
  return compareVersions(min, latest) > 0 ? latest : min;
}

const freshCaches = (): Record<StorePlatform, { hit: { latest: string | null; at: number } | null; failedAt: number }> => ({
  ios: { hit: null, failedAt: 0 },
  android: { hit: null, failedAt: 0 },
});
let caches = freshCaches();
/** 스토어 문구 문서 — undefined 는 아직 읽지 않음, null 은 읽을 수 없음 */
let listing: string | null | undefined;

/** 테스트에서 조회 결과 기억을 비운다 (스토어 문구도 비운다 — 필요한 테스트만 setStoreListingForTest 로 넣는다) */
export const resetVersionCacheForTest = () => {
  caches = freshCaches();
  listing = null;
};
/** 테스트에서 스토어 문구 문서를 바꾼다 (undefined 면 실제 파일을 다시 읽는다) */
export const setStoreListingForTest = (markdown: string | null | undefined) => {
  listing = markdown;
};

async function readStore(platform: StorePlatform, now: number, signal: AbortSignal): Promise<string | null> {
  if (platform === 'ios') {
    const res = await fetch(LOOKUP_URL, { signal });
    if (!res.ok) throw new Error(`lookup ${res.status}`);
    return iosLatestFromLookup(await res.json(), now);
  }
  const res = await fetch(PLAY_URL, { signal, headers: { 'user-agent': 'Mozilla/5.0 (mylovecoach version check)', 'accept-language': 'ko-KR,ko;q=0.9' } });
  if (!res.ok) throw new Error(`play ${res.status}`);
  const latest = androidLatestFromPage(await res.text(), now);
  if (latest === undefined) {
    // 페이지 모양이 바뀌었다 — 환경변수 값으로 버티는 동안 로그로 알린다 (배포 뒤 확인도 경고를 낸다)
    console.warn('[version] Play 페이지에서 버전을 찾지 못했어요 — ANDROID_LATEST_VERSION 으로 대신합니다');
    throw new Error('play page format');
  }
  return latest;
}

/** 스토어에서 읽은 최신 버전. 조회하지 못했고 앞서 읽은 값도 없으면 undefined (모름과 구분) */
async function storeLatest(platform: StorePlatform, now: number): Promise<string | null | undefined> {
  const cache = caches[platform];
  if (cache.hit && now - cache.hit.at < CACHE_MS) return cache.hit.latest;
  if (now - cache.failedAt >= FAIL_CACHE_MS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), LOOKUP_TIMEOUT_MS);
    try {
      cache.hit = { latest: await readStore(platform, now, controller.signal), at: now };
    } catch {
      // 조회가 안 되면 앞서 읽은 값을 그대로 쓴다
      cache.failedAt = now;
    } finally {
      clearTimeout(timer);
    }
  }
  return cache.hit ? cache.hit.latest : undefined;
}

/** 최신 버전의 새 소식 — 문서를 못 읽거나 그 버전 제목이 없으면 [] */
function notesFor(version: string): string[] {
  if (listing === undefined) {
    listing = null;
    for (const file of [path.join(__dirname, '..', 'docs', 'STORE_LISTING.md'), path.join(process.cwd(), 'docs', 'STORE_LISTING.md')]) {
      try {
        listing = readFileSync(file, 'utf8');
        break;
      } catch {
        // 다음 후보 경로
      }
    }
  }
  return listing ? cleanNotes(whatsNewFor(listing, version)) : [];
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
  const now = Date.now();
  let latest: string | null | undefined;
  let source: 'store' | 'env' | 'none';
  if (platform === 'ios') {
    // iOS 는 환경변수가 공개 조회보다 먼저다 (조회 결과를 덮어써야 할 때만 적는다)
    const fixed = cleanVersion(process.env.IOS_LATEST_VERSION);
    latest = fixed ?? (await storeLatest('ios', now));
    source = fixed ? 'env' : latest ? 'store' : 'none';
  } else {
    // 안드로이드는 Play 페이지가 먼저다 — 환경변수는 페이지를 못 읽었거나 막 올라온 버전을 기다리는 동안의 마지막 값
    const fromStore = await storeLatest('android', now);
    const fallback = cleanVersion(process.env.ANDROID_LATEST_VERSION);
    latest = fromStore || fallback || fromStore;
    source = fromStore ? 'store' : fallback ? 'env' : 'none';
  }
  res.setHeader('x-version-source', source);
  if (latest === undefined) {
    // 「최신」과 「확인 못 함」을 섞지 않는다 — 앱은 알고 있던 안내를 그대로 두고 곧 다시 묻는다
    res.status(503).json({ error: '지금은 최신 버전을 확인할 수 없어요.' });
    return;
  }
  const min = clampMin(cleanVersion(platform === 'ios' ? process.env.IOS_MIN_VERSION : process.env.ANDROID_MIN_VERSION), latest);
  const notes = latest ? notesFor(latest) : [];
  res.status(200).json(notes.length ? { latest, min, notes } : { latest, min });
}
