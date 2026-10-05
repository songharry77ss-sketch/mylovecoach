/**
 * 관리자 API — 비밀번호(ADMIN_TOKEN)로 보호됩니다.
 *   GET  /api/admin?days=7&limit=50                          → 집계 + 최근 코칭 기록 + 팀원 명단
 *   GET  /api/admin?view=users&days=30                       → 이용자 목록 (유입·시작 방식·체류·코칭 수)
 *   GET  /api/admin?view=user&deviceId=…                     → 한 명의 화면별 체류·이동 경로·코칭 대화·버튼 기록
 *   POST /api/admin { action: 'team_add', deviceId, label } → 팀원 무제한 허용 (같은 기기면 이름만 바뀜)
 *   POST /api/admin { action: 'team_remove', deviceId }     → 허용 해제
 * 인증: Authorization: Bearer <ADMIN_TOKEN> 또는 ?token=<ADMIN_TOKEN>
 * 비밀번호가 짧아도 대입하기 어렵게, 시도를 기록해 같은 IP 15분 5번 · 전체 1시간 20번을 넘으면 잠시 막습니다
 * (맞는 비밀번호로 들어오면 그 IP 의 기록은 지움).
 * 환경변수: ADMIN_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ANALYTICS_ENABLED(이용 기록 저장 여부, 표시용)
 */
import { createHash, timingSafeEqual } from 'node:crypto';

import type { VercelRequest, VercelResponse } from '@vercel/node';

import { analyticsEnabled, DEVICE_ID, insert, query, remove, rpc, select, supabaseReady } from './_supabase';

export const config = { maxDuration: 30 };

const IP_WINDOW_MS = 15 * 60 * 1000;
const IP_MAX_FAILS = 5;
const ALL_WINDOW_MS = 60 * 60 * 1000;
const ALL_MAX_FAILS = 20;

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

interface TeamRow {
  device_id: string;
  label: string | null;
  created_at: string;
}

function clientIp(req: VercelRequest): string {
  const fwd = req.headers['x-forwarded-for'];
  const first = (Array.isArray(fwd) ? fwd[0] : (fwd ?? '')).split(',')[0]?.trim();
  const real = req.headers['x-real-ip'];
  return (first || (typeof real === 'string' ? real : '') || 'unknown').slice(0, 64);
}

const digest = (s: string) => createHash('sha256').update(s).digest();
const sameSecret = (a: string, b: string) => timingSafeEqual(digest(a), digest(b));

/**
 * 이번 시도를 먼저 기록한 뒤 최근 시도 수를 센다 (한꺼번에 여러 요청을 보내도 함께 세어지도록).
 * 맞는 비밀번호로 들어오면 그 IP 의 기록은 지운다. 기록을 못 읽으면 'unavailable' (스키마 미적용 등)
 */
async function loginGate(ip: string, now: number): Promise<'ok' | 'locked' | 'unavailable'> {
  await insert('admin_auth_fail', { ip });
  const since = (ms: number) => encodeURIComponent(new Date(now - ms).toISOString());
  const [byIp, all] = await Promise.all([
    query<{ id: number }>('admin_auth_fail', `select=id&ip=eq.${encodeURIComponent(ip)}&created_at=gte.${since(IP_WINDOW_MS)}&limit=${IP_MAX_FAILS + 1}`),
    query<{ id: number }>('admin_auth_fail', `select=id&created_at=gte.${since(ALL_WINDOW_MS)}&limit=${ALL_MAX_FAILS + 1}`),
  ]);
  if (!byIp || !all) return 'unavailable';
  return byIp.length > IP_MAX_FAILS || all.length > ALL_MAX_FAILS ? 'locked' : 'ok';
}

const listTeam = () => select<TeamRow>('team_member', 'select=device_id,label,created_at&order=created_at.desc&limit=200');

function parseBody(req: VercelRequest): Record<string, unknown> {
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body || '{}');
    } catch {
      return {};
    }
  }
  return (req.body as Record<string, unknown>) ?? {};
}

async function handleAction(req: VercelRequest, res: VercelResponse) {
  const body = parseBody(req);
  const deviceId = String(body.deviceId ?? '').trim();
  if (!DEVICE_ID.test(deviceId)) {
    res.status(400).json({ error: '기기 ID 형식이 올바르지 않아요. 앱 「마이 → 내 기기 ID」를 눌러 복사한 값을 그대로 넣어 주세요.' });
    return;
  }
  let ok: boolean;
  if (body.action === 'team_add') {
    const label = String(body.label ?? '').trim().slice(0, 40) || '팀원';
    ok = await insert('team_member', { device_id: deviceId, label }, { upsert: true });
  } else if (body.action === 'team_remove') {
    ok = await remove('team_member', `device_id=eq.${encodeURIComponent(deviceId)}`);
  } else {
    res.status(400).json({ error: '알 수 없는 작업이에요.' });
    return;
  }
  if (!ok) {
    res.status(502).json({ error: '저장하지 못했어요. supabase/schema.sql 을 다시 실행했는지 확인해주세요.' });
    return;
  }
  res.status(200).json({ team: await listTeam() });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('cache-control', 'no-store');

  const expected = process.env.ADMIN_TOKEN;
  if (!expected) {
    res.status(500).json({ error: 'ADMIN_TOKEN 환경변수가 설정되지 않았어요.' });
    return;
  }
  // 틀린 시도를 세려면 데이터베이스가 있어야 하므로, 연결 전에는 비밀번호 확인 자체를 하지 않는다
  if (!supabaseReady()) {
    res.status(503).json({ error: 'Supabase 가 아직 연결되지 않았어요. SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 를 설정해주세요.' });
    return;
  }

  const ip = clientIp(req);
  const gate = await loginGate(ip, Date.now());
  if (gate === 'unavailable') {
    res.status(503).json({ error: '로그인 기록 표를 읽지 못했어요. supabase/schema.sql 을 다시 실행해주세요.' });
    return;
  }
  if (gate === 'locked') {
    res.status(429).json({ error: '비밀번호를 여러 번 틀려 잠시 잠겼어요. 15분~1시간 뒤에 다시 시도해주세요.' });
    return;
  }

  const header = req.headers.authorization ?? '';
  const provided = header.startsWith('Bearer ') ? header.slice(7) : String(req.query.token ?? '');
  if (!sameSecret(provided, expected)) {
    res.status(401).json({ error: '관리자 비밀번호가 올바르지 않아요.' });
    return;
  }
  await remove('admin_auth_fail', `ip=eq.${encodeURIComponent(ip)}`);

  if (req.method === 'POST') {
    await handleAction(req, res);
    return;
  }
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'GET·POST만 지원합니다.' });
    return;
  }

  const days = Math.min(Math.max(Number(req.query.days ?? 7) || 7, 1), 90);
  const limit = Math.min(Math.max(Number(req.query.limit ?? 50) || 50, 1), 200);
  const view = String(req.query.view ?? '');

  if (view === 'users') {
    const users = await rpc<unknown[]>('admin_users', { p_days: days, p_limit: 300 });
    if (!users) {
      res.status(502).json({ error: '이용자 목록을 가져오지 못했어요. supabase/schema.sql 을 다시 실행해주세요.' });
      return;
    }
    res.status(200).json({ users, generatedAt: new Date().toISOString() });
    return;
  }
  if (view === 'user') {
    const deviceId = String(req.query.deviceId ?? '');
    if (!DEVICE_ID.test(deviceId)) {
      res.status(400).json({ error: '기기 ID 형식이 올바르지 않아요.' });
      return;
    }
    const detail = await rpc<Record<string, unknown>>('admin_user', { p_device: deviceId });
    if (!detail) {
      res.status(502).json({ error: '이용자 정보를 가져오지 못했어요. supabase/schema.sql 을 다시 실행해주세요.' });
      return;
    }
    res.status(200).json({ ...detail, generatedAt: new Date().toISOString() });
    return;
  }

  const [stats, logs, team] = await Promise.all([
    rpc<Record<string, unknown>>('admin_stats', { p_days: days }),
    select<CoachRow>(
      'coach_log',
      `select=created_at,crush_alias,crush_mbti,relationship,tone,question,has_image,temperature,interest_score,summary,device_id&order=created_at.desc&limit=${limit}`,
    ),
    listTeam(),
  ]);

  if (!stats) {
    res.status(502).json({ error: '집계를 가져오지 못했어요. supabase/schema.sql 을 실행했는지 확인해주세요.' });
    return;
  }

  res.status(200).json({ stats, logs, team, analytics: analyticsEnabled(), generatedAt: new Date().toISOString() });
}
