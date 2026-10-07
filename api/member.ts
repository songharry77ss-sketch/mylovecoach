/**
 * 회원(카카오·Apple 로그인) API — Authorization: Bearer <Supabase 로그인 토큰>
 *   POST   /api/member { deviceId, nickname? } → 회원을 만들거나 갱신하고 이 기기와 잇는다.
 *                                              처음이면 가입 보너스(회원당·기기당 한 번) → { new, bonus, member }
 *   DELETE /api/member { appleAuthorizationCode? } → 회원 탈퇴: 회원 기록·이용 기록을 지우고, 카카오·Apple 연결을 끊은 뒤
 *                                              로그인 계정을 지운다
 * 환경변수: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, COACH_APP_TOKEN(선택, 앱 토큰 검사),
 *          KAKAO_ADMIN_KEY · APPLE_TEAM_ID · APPLE_KEY_ID · APPLE_PRIVATE_KEY (선택, 탈퇴 때 연결 끊기 — _unlink.ts)
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';

import { authUser, deleteAuthUser, DEVICE_ID, rpc, supabaseReady } from './_supabase';
import { kakaoUserId, revokeApple, unlinkKakao } from './_unlink';

export const config = { maxDuration: 15 };

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

const clean = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('cache-control', 'no-store');
  if (req.method !== 'POST' && req.method !== 'DELETE') {
    res.status(405).json({ error: 'POST·DELETE만 지원합니다.' });
    return;
  }
  const expectedToken = process.env.COACH_APP_TOKEN;
  if (expectedToken && req.headers['x-app-token'] !== expectedToken) {
    res.status(401).json({ error: '앱 인증에 실패했어요.' });
    return;
  }
  if (!supabaseReady()) {
    res.status(503).json({ error: '지금은 가입할 수 없어요. 잠시 후 다시 시도해주세요.' });
    return;
  }
  const header = req.headers.authorization ?? '';
  const user = header.startsWith('Bearer ') ? await authUser(header.slice(7)) : null;
  if (!user) {
    res.status(401).json({ error: '로그인 정보가 만료됐어요. 다시 로그인해주세요.' });
    return;
  }

  if (req.method === 'DELETE') {
    // 데이터베이스 정리가 끝난 뒤에만 로그인 계정을 지운다. 먼저 지우면 실패했을 때 다시 시도할 수 없다
    // (member_delete 는 여러 번 실행해도 안전)
    const cleared = await rpc('member_delete', { p_user: user.id });
    if (cleared !== null) {
      // 로그인 제공자와의 연결 끊기 — 실패해도 탈퇴는 계속한다 (결과는 서버 기록에만)
      const appleCode = clean(parseBody(req).appleAuthorizationCode, 2000);
      const [kakao, apple] = await Promise.all([unlinkKakao(kakaoUserId(user)), revokeApple(appleCode)]);
      if (kakao === 'failed' || apple === 'failed') console.warn(`[member] 연결 끊기 kakao=${kakao} apple=${apple}`);
    }
    const removed = cleared !== null && (await deleteAuthUser(user.id));
    if (!removed) {
      res.status(502).json({ error: '탈퇴를 마치지 못했어요. 잠시 후 다시 시도해주세요.' });
      return;
    }
    res.status(200).json({ deleted: true });
    return;
  }

  const body = parseBody(req);
  const deviceId = typeof body.deviceId === 'string' && DEVICE_ID.test(body.deviceId) ? body.deviceId : null;
  const meta = user.user_metadata ?? {};
  const nickname = clean(meta.name ?? meta.full_name ?? meta.nickname ?? meta.preferred_username, 40) ?? clean(body.nickname, 40);
  const provider = clean(user.app_metadata?.provider, 16) ?? 'unknown';
  const linked = await rpc<{ new: boolean; bonus: boolean; provider: string; nickname: string | null; created_at: string }>('member_link', {
    p_user: user.id,
    p_provider: provider,
    p_nickname: nickname,
    p_email: clean(user.email, 120),
    p_device: deviceId,
  });
  if (!linked) {
    res.status(502).json({ error: '가입을 마치지 못했어요. 잠시 후 다시 시도해주세요.' });
    return;
  }
  res.status(200).json({
    new: linked.new,
    bonus: linked.bonus,
    member: { provider: linked.provider, nickname: linked.nickname, created_at: linked.created_at },
  });
}
