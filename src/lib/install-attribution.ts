import { Platform } from 'react-native';

import { launchAcquisition, type Acquisition } from '@/lib/analytics';
import { isDemoMode } from '@/lib/demo';
import { useAppStore } from '@/store/app-store';

import * as Native from '../../modules/install-attribution';

/**
 * 광고 추적 — 앱을 처음 실행할 때 「어느 광고·링크로 설치했는지」를 한 번 확인해 유입 정보(acquisition)에 덧붙인다.
 * 덧붙인 정보는 이용 기록과 함께 서버로 가서 app_user.source·source_detail 에 남는다 (관리자 화면 「가입 경로」).
 *
 * - 안드로이드: Play 설치 경로(install referrer). 구글 광고면 gclid·gbraid·wbraid → source 'google-ads',
 *   /go 홍보 링크면 utm_source=go-코드 그대로. Play 검색 등 자연 설치(utm_source=google-play)는 덧붙이지 않는다.
 * - 아이폰: 애플 광고 귀속 토큰을 애플 API 로 보내 광고 설치면 source 'apple-ads' + 캠페인·광고그룹·키워드 번호.
 *   광고 ID(IDFA)·추적 허용(ATT) 동의가 필요 없다. 토큰은 애플에만 보내고 저장하지 않는다.
 * - 웹·데모는 하지 않는다 (웹은 utm_* 를 처음부터 읽는다 — analytics.launchAcquisition).
 */

/** 광고 유입으로 덧붙이는 칸 — campaign·content·term 은 애플이면 캠페인·광고그룹·키워드 번호 */
export type AttributionFields = Pick<Acquisition, 'source' | 'medium' | 'campaign' | 'term' | 'content'>;

/** found = 광고·링크 유입 · none = 확인했지만 아님(다시 안 봄) · retry = 잠깐의 오류(다음 실행에 다시) */
export type AttributionOutcome = { kind: 'found'; fields: AttributionFields } | { kind: 'none' } | { kind: 'retry' };

export const APPLE_ADS_API = 'https://api-adservices.apple.com/api/v1/';
/** 이만큼 지나도 확인을 못 하면 그만 본다 (Play 설치 경로·애플 토큰 모두 설치 직후에 의미가 있다) */
export const ATTRIBUTION_GIVE_UP_MS = 7 * 24 * 60 * 60 * 1000;
const APPLE_TRIES = 3;
const APPLE_RETRY_MS = 5000;

const clip = (value: string | null | undefined, max = 80): string | undefined => value?.trim().slice(0, max) || undefined;

/** a=1&b=2 꼴을 읽는다 (React Native 의 URLSearchParams 는 일부 기능이 없어 직접 나눈다) */
function readQuery(query: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const part of query.replace(/^[?#]/, '').split('&')) {
    if (!part) continue;
    const i = part.indexOf('=');
    const rawKey = i < 0 ? part : part.slice(0, i);
    const rawValue = i < 0 ? '' : part.slice(i + 1);
    const decode = (s: string) => {
      try {
        return decodeURIComponent(s.replace(/\+/g, ' '));
      } catch {
        return s;
      }
    };
    const key = decode(rawKey).trim().toLowerCase();
    if (key && !out.has(key)) out.set(key, decode(rawValue));
  }
  return out;
}

/** Play 설치 경로 → 광고·링크 유입이면 그 칸, 자연 설치·빈 값이면 null */
export function parsePlayReferrer(referrer: string | null | undefined): AttributionFields | null {
  if (!referrer) return null;
  // 가끔 한 번 더 인코딩된 채로 온다 (utm_source%3D…)
  const text = !referrer.includes('=') && referrer.includes('%3D') ? safeDecode(referrer) : referrer;
  const q = readQuery(text);
  const get = (key: string) => clip(q.get(key));
  if (get('gclid') || get('gbraid') || get('wbraid')) {
    return compact({ source: 'google-ads', medium: 'cpc', campaign: get('utm_campaign') });
  }
  const source = get('utm_source');
  if (!source || source === 'google-play' || source === '(not set)') return null;
  return compact({ source, medium: get('utm_medium'), campaign: get('utm_campaign'), term: get('utm_term'), content: get('utm_content') });
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/** 값이 없는 칸은 뺀다 (덧붙일 때 기존 값을 undefined 로 덮지 않게) */
function compact(fields: AttributionFields): AttributionFields {
  return Object.fromEntries(Object.entries(fields).filter(([, v]) => v != null && v !== '')) as AttributionFields;
}

const idText = (v: unknown): string | undefined => (typeof v === 'number' || (typeof v === 'string' && v) ? String(v).slice(0, 40) : undefined);

type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{ status: number; json: () => Promise<unknown> }>;

/** 애플 광고 귀속 토큰 → 애플 API. 기록이 아직 없으면(404) 5초 뒤 다시, 세 번까지 */
export async function resolveAppleAdsToken(
  token: string,
  { fetchImpl = fetch as unknown as FetchLike, wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms)) }: { fetchImpl?: FetchLike; wait?: (ms: number) => Promise<void> } = {},
): Promise<AttributionOutcome> {
  for (let attempt = 0; attempt < APPLE_TRIES; attempt += 1) {
    if (attempt > 0) await wait(APPLE_RETRY_MS);
    let res: Awaited<ReturnType<FetchLike>>;
    try {
      res = await fetchImpl(APPLE_ADS_API, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: token });
    } catch {
      return { kind: 'retry' };
    }
    if (res.status === 404) continue;
    if (res.status !== 200) return { kind: 'retry' };
    const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    if (body?.attribution !== true) return { kind: 'none' };
    return {
      kind: 'found',
      fields: compact({ source: 'apple-ads', medium: 'search', campaign: idText(body.campaignId), content: idText(body.adGroupId), term: idText(body.keywordId) }),
    };
  }
  return { kind: 'retry' };
}

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** 이 기기에서 광고 유입인지 확인한다 (네이티브 모듈이 없는 빌드는 none) */
export async function lookupInstallAttribution(
  platform: string = Platform.OS,
  native: Pick<typeof Native, 'getInstallReferrer' | 'getAppleAdsToken'> = Native,
  resolveApple: (token: string) => Promise<AttributionOutcome> = resolveAppleAdsToken,
): Promise<AttributionOutcome> {
  if (platform === 'android') {
    try {
      const found = await native.getInstallReferrer();
      if (!found) return { kind: 'none' };
      const fields = parsePlayReferrer(found.referrer);
      return fields ? { kind: 'found', fields } : { kind: 'none' };
    } catch (error) {
      // 2 = 이 기기 Play 가 설치 경로를 지원하지 않음 (다시 해도 같다)
      return message(error).includes('referrer_unavailable:2') ? { kind: 'none' } : { kind: 'retry' };
    }
  }
  if (platform === 'ios') {
    let token: string | null;
    try {
      token = await native.getAppleAdsToken();
    } catch (error) {
      return message(error).includes('unsupported') ? { kind: 'none' } : { kind: 'retry' };
    }
    return token ? resolveApple(token) : { kind: 'none' };
  }
  return { kind: 'none' };
}

let running = false;

/** 처음 실행 뒤 한 번만 (잠깐의 오류면 다음 실행에 다시, 7일이 지나면 그만) — 실패해도 앱 동작에 영향 없음 */
export async function checkInstallAttribution(now = Date.now(), lookup: () => Promise<AttributionOutcome> = lookupInstallAttribution): Promise<void> {
  if (running || isDemoMode || Platform.OS === 'web') return;
  if (useAppStore.getState().attributionCheckedAt) return;
  running = true;
  try {
    const outcome = await lookup().catch((): AttributionOutcome => ({ kind: 'retry' }));
    const state = useAppStore.getState();
    const base = state.acquisition ?? launchAcquisition(now);
    if (outcome.kind === 'found') state.setAcquisition({ ...base, ...outcome.fields });
    if (outcome.kind !== 'retry' || base.at < now - ATTRIBUTION_GIVE_UP_MS) state.markAttributionChecked(now);
  } finally {
    running = false;
  }
}
