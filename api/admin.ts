/**
 * GET /api/admin?days=7 — 관리자 대시보드용 집계 + 최근 코칭 기록.
 * 인증: Authorization: Bearer <ADMIN_TOKEN> 또는 ?token=<ADMIN_TOKEN>
 * 환경변수: ADMIN_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';

import { rpc, select, supabaseReady } from './_supabase';

export const config = { maxDuration: 30 };

interface CoachRow {
  created_at: string;
  crush_alias: string | null;
  crush_mbti: string | null;
  relationship: string | null;
  tone: string | null;
  question: string | null;
  has_image: boolean | null;
  temperature: string | null;
  interest_score: number | null;
  summary: string | null;
  device_id: string | null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('cache-control', 'no-store');

  const expected = process.env.ADMIN_TOKEN;
  if (!expected) {
    res.status(500).json({ error: 'ADMIN_TOKEN 환경변수가 설정되지 않았어요.' });
    return;
  }
  const header = req.headers.authorization ?? '';
  const provided = header.startsWith('Bearer ') ? header.slice(7) : String(req.query.token ?? '');
  if (provided !== expected) {
    res.status(401).json({ error: '관리자 비밀번호가 올바르지 않아요.' });
    return;
  }
  if (!supabaseReady()) {
    res.status(503).json({ error: 'Supabase 가 아직 연결되지 않았어요. SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 를 설정해주세요.' });
    return;
  }

  const days = Math.min(Math.max(Number(req.query.days ?? 7) || 7, 1), 90);
  const limit = Math.min(Math.max(Number(req.query.limit ?? 50) || 50, 1), 200);

  const [stats, logs] = await Promise.all([
    rpc<Record<string, unknown>>('admin_stats', { p_days: days }),
    select<CoachRow>(
      'coach_log',
      `select=created_at,crush_alias,crush_mbti,relationship,tone,question,has_image,temperature,interest_score,summary,device_id&order=created_at.desc&limit=${limit}`,
    ),
  ]);

  if (!stats) {
    res.status(502).json({ error: '집계를 가져오지 못했어요. supabase/schema.sql 을 실행했는지 확인해주세요.' });
    return;
  }

  res.status(200).json({ stats, logs, generatedAt: new Date().toISOString() });
}
