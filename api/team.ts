/**
 * GET /api/team?deviceId=… — 관리자 페이지에서 무제한을 허용한 팀원 기기인지 알려줍니다.
 * 응답: { ready, team, label? } — ready=false 면 명단을 읽지 못한 것이라 앱은 저장된 상태를 그대로 둡니다.
 * 환경변수: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, COACH_APP_TOKEN(선택, 앱 토큰 검사)
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';

import { DEVICE_ID, query } from './_supabase';

export const config = { maxDuration: 10 };

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
  const deviceId = String(req.query.deviceId ?? '');
  if (!DEVICE_ID.test(deviceId)) {
    res.status(400).json({ error: '기기 ID 형식이 올바르지 않아요.' });
    return;
  }

  const rows = await query<{ label: string | null }>('team_member', `select=label&device_id=eq.${encodeURIComponent(deviceId)}&limit=1`);
  if (!rows) {
    res.status(200).json({ ready: false, team: false });
    return;
  }
  res.status(200).json({ ready: true, team: rows.length > 0, ...(rows[0] ? { label: rows[0].label || '팀원' } : {}) });
}
