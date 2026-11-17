/**
 * 홍보 추적 링크 — 커뮤니티·채널마다 다른 코드를 붙여 「어디서 몇 명이 눌렀고, 몇 명이 앱을 열었나」를 센다.
 *
 *   GET /go/코드        → (vercel.json) /api/kkti-card?route=go&c=코드
 *     누른 기기에 맞는 곳으로 보낸다(302):
 *       · 안드로이드 → Play 스토어 (referrer 에 utm_source=go-코드 → Play Console 「획득 보고서 > UTM」에 잡힌다)
 *       · 아이폰·아이패드 → App Store (ct=코드, PROMO_APPLE_PT 가 있으면 pt 까지 → App Store Connect 「앱 분석 > 캠페인」)
 *       · 그 밖(컴퓨터 등) → 웹 앱 /?utm_source=go-코드 (웹 앱이 처음 연 곳으로 저장 → app_user.source)
 *     세는 것: 날짜별 횟수 표(usage_quota, kind = 'go:코드:기기')의 숫자만 1 올린다. 기기는 a(안드로이드)·i(iOS)·w(그 밖).
 *     누가 눌렀는지(IP·기기 ID·쿠키)는 남기지 않는다. 링크 미리보기 수집기(카톡·페북 등)는 세지 않고 웹 앱으로 보낸다(미리보기는 앱 소개 카드).
 *
 *   GET /api/go-stats   → (vercel.json) /api/kkti-card?route=go-stats
 *     최근 7일(usage_quota 보관 기간)의 코드별 클릭 수와, 최근 30일 이 링크로 들어와 앱을 연 사람 수(app_user.source = go-코드)를 준다.
 *     숫자만 있고 개인 정보가 없어 공개로 둔다 — 추적판(아티팩트)이 바로 읽고, 매일 GitHub Actions 가 social-queue 가지에 쌓아 7일보다 오래 남긴다.
 *
 * 남용 막기: 클릭은 IP 당 5분 30회, 코드·기기마다 하루 5만 회까지. 통계는 IP 당 5분 60회.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';

import { ANDROID_PACKAGE } from '../src/lib/billing/plans';
import { clientIp, rateLimited } from './_limits';
import { rpc, query, supabaseReady } from './_supabase';

export const GO_CODE = /^[a-z0-9][a-z0-9-]{1,39}$/;
export const GO_PREFIX = 'go:';
/** 앱·Play·웹에 남기는 utm_source 값 — app_user.source 에서 홍보 링크로 온 사람만 고를 수 있게 앞에 go- 를 붙인다 */
export const goSource = (code: string) => `go-${code}`;
export const APP_STORE_ID = '6813404855';

const CLICK_RATE_MAX = 30;
const STATS_RATE_MAX = 60;
const RATE_WINDOW_MS = 5 * 60 * 1000;
const DAILY_LIMIT = 50_000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** 링크 미리보기를 만드는 수집기 — 사람이 아니라 세지 않는다 (vercel.json 의 미리보기 rewrites 와 같은 목록 + 검색 로봇) */
export const PREVIEW_BOT =
  /facebookexternalhit|Facebot|meta-externalagent|kakaotalk-scrap|Twitterbot|Slackbot|Discordbot|TelegramBot|WhatsApp|LinkedInBot|line-poker|Yeti|Googlebot|bingbot|Daumoa|bot\b|crawler|spider/i;

export type GoDevice = 'a' | 'i' | 'w';

export function goDevice(userAgent: string): GoDevice {
  if (/Android/i.test(userAgent)) return 'a';
  if (/iPhone|iPad|iPod/i.test(userAgent)) return 'i';
  return 'w';
}

const first = (value: unknown): string => (Array.isArray(value) ? String(value[0] ?? '') : typeof value === 'string' ? value : '');

/** 기기에 맞는 도착 주소 */
export function goDestination(code: string, device: GoDevice, applePt = process.env.PROMO_APPLE_PT ?? ''): string {
  const utm = `utm_source=${goSource(code)}&utm_medium=community&utm_campaign=promo`;
  if (device === 'a') return `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE}&referrer=${encodeURIComponent(utm)}`;
  if (device === 'i') {
    const pt = /^\d{4,12}$/.test(applePt) ? `&pt=${applePt}` : '';
    return `https://apps.apple.com/kr/app/id${APP_STORE_ID}?ct=${encodeURIComponent(code)}${pt}&mt=8`;
  }
  return `/?${utm}`;
}

export async function goHandler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('cache-control', 'no-store');
  res.setHeader('x-robots-tag', 'noindex');
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.status(405).json({ error: 'GET만 지원합니다.' });
    return;
  }
  const code = first(req.query.c).toLowerCase();
  const ua = String(req.headers['user-agent'] ?? '');
  if (!GO_CODE.test(code)) {
    res.setHeader('location', '/');
    res.status(302).end();
    return;
  }
  if (PREVIEW_BOT.test(ua) || req.method === 'HEAD') {
    res.setHeader('location', goDestination(code, 'w'));
    res.status(302).end();
    return;
  }
  const device = goDevice(ua);
  if (supabaseReady() && !rateLimited('go', clientIp(req), CLICK_RATE_MAX, RATE_WINDOW_MS)) {
    await rpc('take_quota', { p_kind: `${GO_PREFIX}${code}:${device}`, p_units: 1, p_limit: DAILY_LIMIT });
  }
  res.setHeader('location', goDestination(code, device));
  res.status(302).end();
}

export interface GoClickRow {
  day: string;
  code: string;
  device: GoDevice;
  count: number;
}

/** usage_quota 의 kind('go:코드:기기')를 코드·기기로 푼다. 모양이 다르면 버린다 */
export function parseGoRows(rows: { day: string; kind: string; units: number }[]): GoClickRow[] {
  const out: GoClickRow[] = [];
  for (const row of rows) {
    const m = /^go:([a-z0-9][a-z0-9-]{1,39}):([aiw])$/.exec(row.kind);
    if (m) out.push({ day: row.day, code: m[1], device: m[2] as GoDevice, count: Number(row.units) || 0 });
  }
  return out;
}

export async function goStatsHandler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('cache-control', 'public, max-age=60');
  res.setHeader('access-control-allow-origin', '*');
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.status(405).json({ error: 'GET만 지원합니다.' });
    return;
  }
  if (rateLimited('go-stats', clientIp(req), STATS_RATE_MAX, RATE_WINDOW_MS)) {
    res.status(429).end();
    return;
  }
  if (!supabaseReady()) {
    res.status(200).json({ clicks: [], opens: [], ready: false, generatedAt: new Date().toISOString() });
    return;
  }
  const since = new Date(Date.now() - 30 * DAY_MS).toISOString();
  const [clickRows, openRows] = await Promise.all([
    query<{ day: string; kind: string; units: number }>('usage_quota', 'select=day,kind,units&kind=like.go:*&order=day.desc&limit=2000'),
    query<{ source: string; platform: string | null; first_seen_at: string }>(
      'app_user',
      `select=source,platform,first_seen_at&source=like.go-*&first_seen_at=gte.${encodeURIComponent(since)}&limit=5000`,
    ),
  ]);
  // 앱을 연 사람은 날짜·코드·기기별 숫자로만 묶어 내보낸다 (기기 ID 등은 처음부터 읽지 않는다)
  const opens = new Map<string, { day: string; code: string; platform: string; count: number }>();
  for (const row of openRows ?? []) {
    const code = String(row.source).slice(3);
    if (!GO_CODE.test(code)) continue;
    const day = new Date(new Date(row.first_seen_at).getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const platform = row.platform ?? 'web';
    const key = `${day}|${code}|${platform}`;
    const cur = opens.get(key) ?? { day, code, platform, count: 0 };
    cur.count += 1;
    opens.set(key, cur);
  }
  res.status(200).json({
    clicks: parseGoRows(clickRows ?? []),
    opens: [...opens.values()],
    ready: clickRows !== null,
    generatedAt: new Date().toISOString(),
  });
}
