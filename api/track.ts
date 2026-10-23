/**
 * 이용 기록 API
 *   POST   /api/track — 앱이 보낸 이용 기록을 Supabase 에 저장합니다.
 *   DELETE /api/track { deviceId } — 그 기기의 서버 기록을 모두 지웁니다 (모든 데이터 삭제·만 14세 미만·예전 기록 지우기, 예전 앱의 동의 철회).
 *   DELETE /api/track { deviceId, scope: 'content' } — 그 기기의 코칭 내용(coach_log)만 지웁니다 (「코칭 내용 저장」 동의 철회).
 *     앱은 삭제가 끝날 때까지 지우는 범위의 기록을 새로 보내지 않으므로(lib/server-deletion) 시각 기준 없이 지운다.
 *
 * 저장 조건: 수집 기준의 판(consentVersion)이 2 이상인 앱만 저장합니다 — 3 은 처리방침에 알리고 만 14세 이상에게 수집하는 기본 이용 기록(1.0.4~),
 * 2 는 첫 화면 체크박스를 직접 눌러 동의한 예전 앱. 판 표시가 없는 예전 동의(미리 체크된 체크박스)는 받기만 하고 저장하지 않습니다(204).
 * 판 3 부터는 이름(별명)을 저장하지 않습니다(분석에 필요 없음 — 판 2 동의로 저장돼 있던 이름도 지움).
 * 만 14세 미만으로 입력한 이용자의 기록은 (예전 앱이 보낸 것도) 저장하지 않고, 남아 있던 기록도 지웁니다(법정대리인 동의를 받지 않으므로).
 * 메일로 처리 정지를 요청한 기기(ANALYTICS_OPTOUT_DEVICES)의 기록도 받기만 하고 저장하지 않습니다(204).
 * SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 없거나 ANALYTICS_ENABLED=1 이 아니어도 조용히 204 입니다.
 *
 * 남용 막기: 앱 토큰은 공개 번들에 들어 있어 사실상 누구나 부를 수 있으므로
 * 본문 16KB · 이벤트 60개 · props 는 원시값 8개(문자열 100자)까지 · IP 당 5분 60회(삭제는 따로 5분 10회)로 제한하고,
 * 하루 저장량(저장할 내용 크기, TRACK_DAILY_KB 기본 10,000KB)과 DB 전체 크기(400MB, take_quota)에 상한을 둬 무료 DB 가 차지 않게 합니다.
 * 시각은 최근 7일 안으로, 화면 체류는 30분, 세션은 6시간으로 자릅니다.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';

import { alertFunnel } from './_funnel-alert';
import { bodyTooLarge, clientIp, rateLimited, storedKb } from './_limits';
import { analyticsEnabled, BASIC_LOG_VERSION, consentVersionOk, DEVICE_ID, insert, optedOutDevice, patch, remove, rpc, supabaseReady } from './_supabase';

export const config = { maxDuration: 15 };

const MAX_BODY_BYTES = 16 * 1024;
const MAX_EVENTS = 60;
const RATE_MAX = 60;
const RATE_WINDOW_MS = 5 * 60 * 1000;
const DELETE_RATE_MAX = 10;
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_SCREEN_MS = 30 * 60 * 1000;
const MAX_SESSION_MS = 6 * 60 * 60 * 1000;
const MAX_PROP_KEYS = 8;
const MAX_PROP_STRING = 100;
/** 만 14세 미만은 저장하지 않는다 */
export const MIN_AGE = 14;
const SESSION_ID = /^[A-Za-z0-9_-]{1,64}$/;
const dailyKb = () => Number(process.env.TRACK_DAILY_KB) || 10_000;

const EventSchema = z.object({
  type: z.enum(['screen', 'event']),
  name: z.string().min(1).max(120),
  durationMs: z.number().optional(),
  props: z.unknown().optional(),
  at: z.number().optional(),
});

const BodySchema = z.object({
  deviceId: z.string().regex(DEVICE_ID),
  sessionId: z.string().regex(SESSION_ID),
  /** 수집 기준의 판 — 3 기본 이용 기록(1.0.4~), 2 예전 앱의 직접 체크 동의, 없으면 예전 미리 체크 방식 */
  consentVersion: z.number().int().nullable().optional(),
  platform: z.string().max(16).optional(),
  appVersion: z.string().max(32).optional(),
  user: z
    .object({
      name: z.string().max(60).optional().nullable(),
      gender: z.string().max(16).optional().nullable(),
      age: z.number().int().min(0).max(120).optional().nullable(),
      mbti: z.string().max(8).optional().nullable(),
      defaultTone: z.string().max(24).optional().nullable(),
    })
    .nullable()
    .optional(),
  premiumPlan: z.string().max(24).nullable().optional(),
  /** 처음 앱을 연 곳 (웹 광고 링크의 utm_*·이전 사이트, 앱은 설치 경로) */
  acquisition: z
    .object({
      channel: z.string().max(16).optional(),
      source: z.string().max(80).optional(),
      medium: z.string().max(80).optional(),
      campaign: z.string().max(80).optional(),
      referrer: z.string().max(120).optional(),
      landing: z.string().max(120).optional(),
      at: z.number().int().optional(),
    })
    .nullable()
    .optional(),
  crushCount: z.number().int().min(0).max(9999).optional(),
  sessionStartedAt: z.number().optional(),
  sessionDurationMs: z.number().optional(),
  endSession: z.boolean().optional(),
  events: z.array(EventSchema).max(MAX_EVENTS).default([]),
});

/** props 는 짧은 원시값만 남긴다 (중첩 객체·긴 문자열로 저장소를 채우지 못하게) */
export function cleanProps(input: unknown): Record<string, string | number | boolean | null> | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const out: Record<string, string | number | boolean | null> = {};
  for (const [rawKey, value] of Object.entries(input as Record<string, unknown>).slice(0, MAX_PROP_KEYS)) {
    const key = rawKey.slice(0, 40);
    if (value === null || typeof value === 'boolean') out[key] = value;
    else if (typeof value === 'number') {
      if (Number.isFinite(value)) out[key] = value;
    } else if (typeof value === 'string') out[key] = value.slice(0, MAX_PROP_STRING);
  }
  return Object.keys(out).length ? out : null;
}

/** 앱이 보낸 시각이 최근 7일 ~ 10분 뒤 안이면 그대로, 아니면 서버 시각 */
export function clampAt(ms: number | undefined, nowMs: number): number {
  return typeof ms === 'number' && Number.isFinite(ms) && ms > nowMs - 7 * DAY_MS && ms < nowMs + 10 * 60 * 1000 ? ms : nowMs;
}

const clampDuration = (ms: number | undefined, max: number): number | null =>
  typeof ms === 'number' && Number.isFinite(ms) ? Math.round(Math.min(Math.max(ms, 0), max)) : null;

function parseBody(req: VercelRequest): unknown {
  if (typeof req.body !== 'string') return req.body;
  try {
    return JSON.parse(req.body || '{}');
  } catch {
    return null;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('cache-control', 'no-store');
  if (req.method !== 'POST' && req.method !== 'DELETE') {
    res.status(405).json({ error: 'POST·DELETE만 지원합니다.' });
    return;
  }
  const expectedToken = process.env.COACH_APP_TOKEN;
  if (expectedToken && req.headers['x-app-token'] !== expectedToken) {
    res.status(401).end();
    return;
  }
  if (bodyTooLarge(req, MAX_BODY_BYTES)) {
    res.status(413).json({ error: '요청이 너무 커요.' });
    return;
  }
  // 삭제 요청은 이용 기록과 따로 센다 (공용 와이파이에서 이용 기록이 많아도 철회 삭제가 막히지 않게)
  const deleting = req.method === 'DELETE';
  if (deleting ? rateLimited('track-delete', clientIp(req), DELETE_RATE_MAX, RATE_WINDOW_MS) : rateLimited('track', clientIp(req), RATE_MAX, RATE_WINDOW_MS)) {
    res.status(429).json({ error: '잠시 후 다시 보내 주세요.' });
    return;
  }

  if (deleting) {
    const body = parseBody(req) as { deviceId?: unknown; scope?: unknown } | null;
    const deviceId = body?.deviceId;
    if (typeof deviceId !== 'string' || !DEVICE_ID.test(deviceId)) {
      res.status(400).json({ error: '기기 ID 형식이 올바르지 않아요.' });
      return;
    }
    // 수집을 꺼 둔 상태(ANALYTICS_ENABLED 꺼짐)여도 이미 저장된 기록은 지운다
    if (!supabaseReady()) {
      res.status(204).end();
      return;
    }
    if (body?.scope === 'content') {
      // 코칭 내용 저장 철회 — 코칭 기록, 코칭 성공 이벤트에 실렸던 호감 온도, 예전 앱의 선택 동의(판 2)로 저장돼 있던 이름(별명)을 지운다.
      // 화면·버튼 같은 기본 이용 기록은 남는다. delete_device_content(supabase/consent_v3.sql)가 아직 없는 DB 면 예전처럼 표를 직접 지운다
      if ((await rpc('delete_device_content', { p_device: deviceId })) !== null) {
        res.status(204).end();
        return;
      }
      const device = `device_id=eq.${encodeURIComponent(deviceId)}`;
      const [logs, name] = await Promise.all([remove('coach_log', device), patch('app_user', device, { name: null })]);
      res.status(logs && name ? 204 : 502).end();
      return;
    }
    const done = await rpc('delete_device', { p_device: deviceId });
    res.status(done === null ? 502 : 204).end();
    return;
  }

  if (!analyticsEnabled()) {
    res.status(204).end();
    return;
  }

  const parsed = BodySchema.safeParse(parseBody(req));
  if (!parsed.success) {
    res.status(400).json({ error: '형식이 올바르지 않아요.' });
    return;
  }
  const b = parsed.data;
  // 만 14세 미만으로 입력했으면 저장하지 않고, 그 전에 쌓인 기록도 지운다 (동의 판이 없는 예전 앱이 보낸 것도)
  if (b.user?.age != null && b.user.age < MIN_AGE) {
    await rpc('delete_device', { p_device: b.deviceId });
    res.status(204).end();
    return;
  }
  if (!consentVersionOk(b.consentVersion) || optedOutDevice(b.deviceId)) {
    res.status(204).end();
    return;
  }
  // 판 3(기본 이용 기록)부터는 이름(별명)을 받지 않는다. 예전 앱의 선택 동의(판 2)는 동의받은 대로 저장한다
  const basicOnly = Number(b.consentVersion) >= BASIC_LOG_VERSION;
  const name = basicOnly ? null : (b.user?.name ?? null);

  const nowMs = Date.now();
  const now = new Date(nowMs).toISOString();
  const iso = (ms?: number) => new Date(clampAt(ms, nowMs)).toISOString();
  const userFilter = `device_id=eq.${encodeURIComponent(b.deviceId)}`;
  const acq = b.acquisition;
  const source = acq ? acq.source || acq.referrer || acq.channel || null : null;
  const screenRows = b.events
    .filter((e) => e.type === 'screen')
    .map((e) => ({
      device_id: b.deviceId,
      session_id: toUuid(b.sessionId),
      screen: e.name,
      duration_ms: clampDuration(e.durationMs, MAX_SCREEN_MS),
      created_at: iso(e.at),
    }));
  const eventRows = b.events
    .filter((e) => e.type === 'event')
    .map((e) => ({
      device_id: b.deviceId,
      session_id: toUuid(b.sessionId),
      name: e.name,
      props: cleanProps(e.props),
      created_at: iso(e.at),
    }));

  // 하루 저장량 상한(저장할 내용의 크기)·DB 전체 크기 상한 — 넘으면 저장하지 않는다 (상한 함수를 못 부르면 그대로 저장)
  const allowed = await rpc<boolean>('take_quota', {
    p_kind: 'track',
    p_units: storedKb([b.user, acq, screenRows, eventRows]) + 1,
    p_limit: dailyKb(),
  });
  if (allowed === false) {
    res.status(204).end();
    return;
  }

  // 응답을 먼저 돌려주지 않고 기다린다 (서버리스는 응답 후 작업이 중단될 수 있음)
  await Promise.all([
    // 처음 보는 기기면 만들고(처음 접속 시각·유입 경로는 이때만 기록), 이미 있으면 최근 상태만 고친다
    insert(
      'app_user',
      {
        device_id: b.deviceId,
        name,
        gender: b.user?.gender ?? null,
        age: b.user?.age ?? null,
        mbti: b.user?.mbti ?? null,
        default_tone: b.user?.defaultTone ?? null,
        platform: b.platform ?? null,
        app_version: b.appVersion ?? null,
        premium_plan: b.premiumPlan ?? null,
        crush_count: b.crushCount ?? 0,
        source,
        source_detail: acq ?? null,
        first_seen_at: now,
        last_seen_at: now,
      },
      { ignoreDuplicates: true },
    ).then(async (ok) => {
      if (!ok) return false;
      // 유입 경로를 모으기 전에 만들어진 이용자는 처음 한 번만 채운다 — 수집 1년이 지나 파기한 경로를 다시 채우지 않게 1년 안의 이용자만
      const yearAgo = encodeURIComponent(new Date(nowMs - 365 * DAY_MS).toISOString());
      if (source) await patch('app_user', `${userFilter}&source=is.null&first_seen_at=gte.${yearAgo}`, { source, source_detail: acq });
      return patch('app_user', userFilter, {
        last_seen_at: now,
        // 판 3 이 되면 예전 동의로 저장돼 있던 이름도 지운다 (지금 안내하는 수집 항목에 이름이 없으므로)
        ...(basicOnly ? { name: null } : name ? { name } : {}),
        ...(b.user ? { gender: b.user.gender ?? null, age: b.user.age ?? null, mbti: b.user.mbti ?? null, default_tone: b.user.defaultTone ?? null } : {}),
        ...(b.platform ? { platform: b.platform } : {}),
        ...(b.appVersion ? { app_version: b.appVersion } : {}),
        premium_plan: b.premiumPlan ?? null,
        crush_count: b.crushCount ?? 0,
      });
    }),

    insert(
      'app_session',
      {
        id: toUuid(b.sessionId),
        device_id: b.deviceId,
        platform: b.platform ?? null,
        app_version: b.appVersion ?? null,
        started_at: iso(b.sessionStartedAt),
        ...(b.endSession ? { ended_at: now, duration_ms: clampDuration(b.sessionDurationMs, MAX_SESSION_MS) } : {}),
      },
      { upsert: true },
    ),

    insert('screen_view', screenRows),

    insert('app_event', eventRows),
  ]);

  // 결제 화면 열림·결제 진행을 운영자 텔레그램으로 (저장한 기록만 · 텔레그램 미설정이면 아무것도 안 함 · 실패해도 응답은 그대로)
  await alertFunnel(b.deviceId, eventRows, { platform: b.platform ?? null, appVersion: b.appVersion ?? null, premiumPlan: b.premiumPlan ?? null, source });

  res.status(204).end();
}

/** 앱이 만든 임의 ID 를 UUID 형식으로 맞춘다 (Postgres uuid 컬럼용) */
function toUuid(id: string): string {
  const hex = Array.from(id)
    .map((c) => c.charCodeAt(0).toString(16).padStart(2, '0'))
    .join('')
    .padEnd(32, '0')
    .slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}
