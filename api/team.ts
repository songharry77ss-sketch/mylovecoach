/**
 * GET /api/team (머리글 x-device-id) — 관리자 페이지에서 무제한을 허용한 팀원 기기인지 알려줍니다.
 * 기기 ID 를 주소(쿼리)에 실으면 요청 기록에 남으므로 새 앱은 머리글로 보낸다. ?deviceId= 는 예전 앱용.
 * 응답: { ready, team, label?, until? } — ready=false 면 명단을 읽지 못한 것이라 앱은 저장된 상태를 그대로 둡니다.
 * 끝나는 시각(expires_at)이 지난 기기는 팀원이 아니라고 답한다 (until: 끝나는 시각, 무기한이면 없음).
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
  const header = req.headers['x-device-id'];
  const deviceId = String((typeof header === 'string' && header) || req.query.deviceId || '');
  if (!DEVICE_ID.test(deviceId)) {
    res.status(400).json({ error: '기기 ID 형식이 올바르지 않아요.' });
    return;
  }

  const now = encodeURIComponent(new Date().toISOString());
  const rows = await query<{ label: string | null; expires_at: string | null }>(
    'team_member',
    `select=label,expires_at&device_id=eq.${encodeURIComponent(deviceId)}&or=(expires_at.is.null,expires_at.gt.${now})&limit=1`,
  );
  if (!rows) {
    res.status(200).json({ ready: false, team: false });
    return;
  }
  const row = rows[0];
  res.status(200).json({ ready: true, team: Boolean(row), ...(row ? { label: row.label || '팀원', ...(row.expires_at ? { until: row.expires_at } : {}) } : {}) });
}
