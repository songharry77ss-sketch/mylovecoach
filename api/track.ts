/**
 * POST /api/track — 앱이 보낸 이용 기록을 Supabase 에 저장합니다.
 * 「서비스 개선을 위한 이용 기록 수집」에 동의한 이용자의 앱만 호출합니다.
 * 환경변수 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 없으면 조용히 204 를 돌려줍니다.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';

import { insert, patch, supabaseReady } from './_supabase';

export const config = { maxDuration: 15 };

const EventSchema = z.object({
  type: z.enum(['screen', 'event']),
  name: z.string().min(1).max(120),
  durationMs: z.number().int().nonnegative().max(86_400_000).optional(),
  props: z.record(z.string(), z.unknown()).optional(),
  at: z.number().int().optional(),
});

const BodySchema = z.object({
  deviceId: z.string().min(6).max(64),
  sessionId: z.string().min(1).max(64),
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
  crushCount: z.number().int().min(0).max(9999).optional(),
  sessionStartedAt: z.number().int().optional(),
  sessionDurationMs: z.number().int().nonnegative().optional(),
  endSession: z.boolean().optional(),
  events: z.array(EventSchema).max(120).default([]),
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('cache-control', 'no-store');
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'POST만 지원합니다.' });
    return;
  }
  const expectedToken = process.env.COACH_APP_TOKEN;
  if (expectedToken && req.headers['x-app-token'] !== expectedToken) {
    res.status(401).end();
    return;
  }
  if (!supabaseReady()) {
    res.status(204).end();
    return;
  }

  const parsed = BodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: '형식이 올바르지 않아요.' });
    return;
  }
  const b = parsed.data;
  const now = new Date().toISOString();
  const iso = (ms?: number) => (ms ? new Date(ms).toISOString() : now);

  // 응답을 먼저 돌려주지 않고 기다린다 (서버리스는 응답 후 작업이 중단될 수 있음)
  await Promise.all([
    insert(
      'app_user',
      {
        device_id: b.deviceId,
        name: b.user?.name ?? null,
        gender: b.user?.gender ?? null,
        age: b.user?.age ?? null,
        mbti: b.user?.mbti ?? null,
        default_tone: b.user?.defaultTone ?? null,
        platform: b.platform ?? null,
        app_version: b.appVersion ?? null,
        premium_plan: b.premiumPlan ?? null,
        crush_count: b.crushCount ?? 0,
        first_seen_at: now,
        last_seen_at: now,
      },
      { upsert: true },
    ).then((ok) =>
      ok
        ? patch('app_user', `device_id=eq.${encodeURIComponent(b.deviceId)}`, {
            last_seen_at: now,
            ...(b.user?.name ? { name: b.user.name } : {}),
            premium_plan: b.premiumPlan ?? null,
            crush_count: b.crushCount ?? 0,
          })
        : false,
    ),

    insert(
      'app_session',
      {
        id: toUuid(b.sessionId),
        device_id: b.deviceId,
        platform: b.platform ?? null,
        app_version: b.appVersion ?? null,
        started_at: iso(b.sessionStartedAt),
        ...(b.endSession ? { ended_at: now, duration_ms: b.sessionDurationMs ?? null } : {}),
      },
      { upsert: true },
    ),

    insert(
      'screen_view',
      b.events
        .filter((e) => e.type === 'screen')
        .map((e) => ({
          device_id: b.deviceId,
          session_id: toUuid(b.sessionId),
          screen: e.name,
          duration_ms: e.durationMs ?? null,
          created_at: iso(e.at),
        })),
    ),

    insert(
      'app_event',
      b.events
        .filter((e) => e.type === 'event')
        .map((e) => ({
          device_id: b.deviceId,
          session_id: toUuid(b.sessionId),
          name: e.name,
          props: e.props ?? null,
          created_at: iso(e.at),
        })),
    ),
  ]);

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
