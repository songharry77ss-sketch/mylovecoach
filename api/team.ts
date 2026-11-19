/**
 * GET /api/team (머리글 x-device-id) — 관리자 페이지에서 무제한을 허용한 팀원 기기인지 알려줍니다.
 * 기기 ID 를 주소(쿼리)에 실으면 요청 기록에 남으므로 새 앱은 머리글로 보낸다. ?deviceId= 는 예전 앱용.
 * 응답: { ready, team, label?, until? } — ready=false 면 명단을 읽지 못한 것이라 앱은 저장된 상태를 그대로 둡니다.
 * 끝나는 시각(expires_at)이 지난 기기는 팀원이 아니라고 답한다 (until: 끝나는 시각, 무기한이면 없음).
 *
 * POST /api/team { coupon } — 쿠폰 코드 확인 (_coupon.ts). 기기 ID 는 받지 않는다.
 * 응답: 200 { ok: true, code, days } · 404 없는 코드 · 410 끝난 코드 · 429 너무 자주 (코드 맞히기 막기). 지급은 앱이 이 기기에 한다.
 * 서버 함수 수 한도(Vercel 12개) 때문에 따로 만들지 않고 「무제한 권한을 묻는 곳」인 여기에 둔다.
 * 환경변수: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, COACH_APP_TOKEN(선택, 앱 토큰 검사)
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';

import { checkCoupon } from './_coupon';
import { clientIp, rateLimited } from './_limits';
import { DEVICE_ID, query } from './_supabase';

export const config = { maxDuration: 10 };

/** 한 곳(IP)에서 10분에 10번까지만 쿠폰을 확인한다 */
const COUPON_TRIES = 10;
const COUPON_WINDOW_MS = 10 * 60 * 1000;

const COUPON_ERRORS = {
  empty: [400, '쿠폰 코드를 입력해주세요.'],
  unknown: [404, '없는 쿠폰 코드예요. 철자를 확인해주세요.'],
  expired: [410, '기간이 끝난 쿠폰이에요.'],
} as const;

function couponOf(req: VercelRequest): unknown {
  let body: unknown = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body || '{}');
    } catch {
      return '';
    }
  }
  return body && typeof body === 'object' ? (body as { coupon?: unknown }).coupon : '';
}

function redeem(req: VercelRequest, res: VercelResponse) {
  if (rateLimited('coupon', clientIp(req), COUPON_TRIES, COUPON_WINDOW_MS)) {
    res.status(429).json({ ok: false, error: '쿠폰을 너무 자주 입력했어요. 10분 뒤에 다시 시도해주세요.' });
    return;
  }
  const result = checkCoupon(couponOf(req));
  if (!result.ok) {
    const [status, error] = COUPON_ERRORS[result.reason];
    res.status(status).json({ ok: false, error });
    return;
  }
  res.status(200).json({ ok: true, code: result.code, days: result.days });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('cache-control', 'no-store');
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.status(405).json({ error: 'GET·POST만 지원합니다.' });
    return;
  }
  const expectedToken = process.env.COACH_APP_TOKEN;
  if (expectedToken && req.headers['x-app-token'] !== expectedToken) {
    res.status(401).end();
    return;
  }
  if (req.method === 'POST') {
    redeem(req, res);
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
