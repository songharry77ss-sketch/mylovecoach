/**
 * 회원(카카오·Google·Apple 로그인) API — Authorization: Bearer <Supabase 로그인 토큰>
 *   POST   /api/member { deviceId, nickname? } → 회원을 만들거나 갱신하고 이 기기와 잇는다.
 *                                              처음이면 가입 보너스(회원당·기기당 한 번) → { new, bonus, member }
 *   DELETE /api/member { appleAuthorizationCode?, appleManualRevocationAcknowledged? } → 회원 탈퇴.
 *             Apple 자동 취소를 확인하거나, 수동 연결 해제 안내를 확인한 본인의 명시적 요청일 때만 데이터를 지운다.
 *             카카오는 연결 해제를 시도한다. Google 외부 연결은 자동 해제하지 않는다.
 * 환경변수: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, COACH_APP_TOKEN(선택, 앱 토큰 검사),
 *          KAKAO_ADMIN_KEY · APPLE_TEAM_ID · APPLE_KEY_ID · APPLE_PRIVATE_KEY (선택, 탈퇴 때 연결 끊기 — _unlink.ts)
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';

import { authUser, deleteAuthUser, DEVICE_ID, rpc, supabaseReady } from './_supabase';
import { appleUserId, kakaoUserId, revokeApple, unlinkKakao } from './_unlink';

export const config = { maxDuration: 30 };

function parseBody(req: VercelRequest): Record<string, unknown> {
  let body: unknown = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body || '{}');
    } catch {
      return {};
    }
  }
  return body && typeof body === 'object' && !Array.isArray(body) ? body as Record<string, unknown> : {};
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
    const body = parseBody(req);
    // 마지막 로그인 회사만 보지 않는다. Google 등으로 로그인했어도 Apple identity 가 연결돼 있으면 같은 절차를 따른다.
    const appleId = appleUserId(user);
    const providers = (user.app_metadata as { providers?: unknown } | undefined)?.providers;
    const hasApple = user.app_metadata?.provider === 'apple' || user.identities?.some((identity) => identity.provider === 'apple') || (Array.isArray(providers) && providers.includes('apple'));
    let appleRevocation: 'revoked' | 'manual' | 'not_applicable' = 'not_applicable';
    if (hasApple) {
      // TN3194: 토큰을 확보할 수 없어도 계정 삭제 권리를 막지 않는다. 수동 해제 안내를 명시적으로 확인한 요청만 별도로 허용한다.
      if (body.appleManualRevocationAcknowledged === true) {
        appleRevocation = 'manual';
      } else {
        const rawCode = body.appleAuthorizationCode;
        const appleCode = typeof rawCode === 'string' && rawCode.trim().length <= 2000 ? rawCode.trim() || null : null;
        const apple = await revokeApple(appleCode, appleId);
        if (apple !== 'ok') {
          const failures = {
            missing_code: ['apple_code_required', 'Apple 확인 정보를 받지 못했어요. 다시 확인하거나 수동 연결 해제 안내를 확인한 뒤 탈퇴해주세요.'],
            identity_unavailable: ['apple_identity_unavailable', '가입한 Apple 계정을 확인하지 못했어요. 다시 시도하거나 수동 연결 해제 안내를 확인해주세요.'],
            unavailable: ['apple_revocation_unavailable', '지금은 Apple 연결을 자동 해제할 수 없어요. 잠시 후 다시 시도하거나 수동 연결 해제 안내를 확인해주세요.'],
            mismatch: ['apple_account_mismatch', '가입할 때 사용한 Apple 계정과 달라요. 같은 계정으로 다시 확인하거나 수동 연결 해제 안내를 확인해주세요.'],
            failed: ['apple_revocation_failed', 'Apple 연결 해제를 확인하지 못해 탈퇴를 중단했어요. 다시 시도하거나 수동 연결 해제 안내를 확인해주세요.'],
          } as const;
          const [code, error] = failures[apple];
          res.status(apple === 'missing_code' || apple === 'mismatch' ? 409 : 502).json({ code, error });
          return;
        }
        appleRevocation = 'revoked';
      }
    }
    // 데이터베이스 정리가 끝난 뒤에만 로그인 계정을 지운다. 먼저 지우면 실패했을 때 다시 시도할 수 없다
    // (member_delete 는 여러 번 실행해도 안전)
    const cleared = await rpc('member_delete', { p_user: user.id });
    if (cleared !== null) {
      // 기존 카카오 탈퇴 동작은 유지한다. Apple 은 위에서 이미 성공·수동 안내 확인 여부를 확정했다.
      const kakao = await unlinkKakao(kakaoUserId(user));
      if (kakao === 'failed') console.warn('[member] 카카오 연결 끊기 실패');
    }
    const removed = cleared !== null && (await deleteAuthUser(user.id));
    if (!removed) {
      res.status(502).json({ error: '탈퇴를 마치지 못했어요. 잠시 후 다시 시도해주세요.' });
      return;
    }
    res.status(200).json({ deleted: true, appleRevocation });
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
