/**
 * 회원 탈퇴 때 로그인 제공자와의 연결을 끊는다.
 *   카카오: 어드민 키로 「연결 끊기」(POST /v1/user/unlink) — 환경변수 KAKAO_ADMIN_KEY
 *   Apple : 탈퇴 직전에 받은 인증 코드를 토큰으로 바꾼 뒤, 그 토큰이 이 회원의 Apple ID 것일 때만 취소(/auth/revoke) — 환경변수
 *           APPLE_TEAM_ID · APPLE_KEY_ID · APPLE_PRIVATE_KEY(Sign in with Apple 키 .p8 내용) · APPLE_CLIENT_ID(기본 app.mylovecoach.ios)
 * 카카오는 키가 없으면 건너뛴다. Apple 은 취소 확인 전 데이터를 지우지 않도록 실패 원인을 돌려준다.
 */
import { sign } from 'node:crypto';

import type { AuthUser } from './_supabase';

export type UnlinkResult = 'ok' | 'skipped' | 'failed';
export type AppleRevokeResult = 'ok' | 'missing_code' | 'identity_unavailable' | 'unavailable' | 'mismatch' | 'failed';
export const APPLE_REVOKE_TIMEOUT_MS = 6000;

const APPLE_ORIGIN = 'https://appleid.apple.com';
const DEFAULT_APPLE_CLIENT_ID = 'app.mylovecoach.ios';

/** 로그인 계정에 붙은 카카오 회원번호 (없으면 null) */
export function kakaoUserId(user: AuthUser): string | null {
  const identity = user.identities?.find((i) => i.provider === 'kakao');
  if (!identity) return null;
  const data = identity.identity_data ?? {};
  const id = data.provider_id ?? data.sub ?? identity.id;
  return typeof id === 'string' || typeof id === 'number' ? String(id) : null;
}

/** 로그인 계정에 붙은 Apple 회원 ID(sub) (없으면 null) — 탈퇴 때 받은 코드가 이 계정의 Apple ID 것인지 확인한다 */
export function appleUserId(user: AuthUser): string | null {
  const identity = user.identities?.find((i) => i.provider === 'apple');
  if (!identity) return null;
  const data = identity.identity_data ?? {};
  const id = data.sub ?? data.provider_id ?? identity.id;
  return typeof id === 'string' && id ? id : null;
}

export async function unlinkKakao(kakaoId: string | null): Promise<UnlinkResult> {
  const adminKey = process.env.KAKAO_ADMIN_KEY;
  if (!adminKey || !kakaoId) return 'skipped';
  try {
    const res = await fetch('https://kapi.kakao.com/v1/user/unlink', {
      method: 'POST',
      headers: { Authorization: `KakaoAK ${adminKey}`, 'content-type': 'application/x-www-form-urlencoded;charset=utf-8' },
      body: new URLSearchParams({ target_id_type: 'user_id', target_id: kakaoId }).toString(),
    });
    return res.ok ? 'ok' : 'failed';
  } catch {
    return 'failed';
  }
}

const base64url = (value: Buffer | string) => Buffer.from(value).toString('base64url');

/** Apple 서버에 보낼 client_secret (ES256 JWT, 5분 유효). 키가 없으면 null */
export function appleClientSecret(nowSec = Math.floor(Date.now() / 1000)): string | null {
  const teamId = process.env.APPLE_TEAM_ID;
  const keyId = process.env.APPLE_KEY_ID;
  // 환경변수에 한 줄로 넣으면 줄바꿈이 \n 글자로 들어오므로 되돌린다
  const privateKey = process.env.APPLE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  if (!teamId || !keyId || !privateKey) return null;
  const header = base64url(JSON.stringify({ alg: 'ES256', kid: keyId }));
  const payload = base64url(
    JSON.stringify({
      iss: teamId,
      iat: nowSec,
      exp: nowSec + 300,
      aud: APPLE_ORIGIN,
      sub: process.env.APPLE_CLIENT_ID || DEFAULT_APPLE_CLIENT_ID,
    }),
  );
  const signature = sign('sha256', Buffer.from(`${header}.${payload}`), { key: privateKey, dsaEncoding: 'ieee-p1363' });
  return `${header}.${payload}.${base64url(signature)}`;
}

/** 토큰 응답의 id_token(JWT)에 담긴 Apple 회원 ID(sub). Apple 서버에서 바로 받은 값이라 서명은 확인하지 않는다 */
function idTokenSub(idToken: unknown): string | null {
  if (typeof idToken !== 'string') return null;
  try {
    const payload = JSON.parse(Buffer.from(idToken.split('.')[1] ?? '', 'base64url').toString()) as { sub?: unknown };
    return typeof payload.sub === 'string' ? payload.sub : null;
  } catch {
    return null;
  }
}

/**
 * 탈퇴 직전에 앱이 받은 Apple 인증 코드로 그 계정의 토큰을 취소한다 (앱과 Apple ID 의 연결 해제).
 * 기기의 Apple ID 가 가입 때와 다르면 다른 Apple ID 의 코드가 오므로, 토큰의 sub 가 이 회원의 Apple ID(expectedSub)와 같을 때만 취소한다.
 */
export async function revokeApple(authorizationCode: string | null, expectedSub: string | null): Promise<AppleRevokeResult> {
  if (!expectedSub) return 'identity_unavailable';
  if (!authorizationCode) return 'missing_code';
  let clientSecret: string | null;
  try {
    clientSecret = appleClientSecret();
  } catch {
    return 'unavailable'; // 키 형식이 잘못됨. 키 자체는 기록하지 않는다.
  }
  if (!clientSecret) return 'unavailable';
  const clientId = process.env.APPLE_CLIENT_ID || DEFAULT_APPLE_CLIENT_ID;
  // 코드 교환과 토큰 취소를 합쳐 제한한다. 시간 초과 결과를 성공으로 간주하거나 같은 코드를 자동 재전송하지 않는다.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), APPLE_REVOKE_TIMEOUT_MS);
  const form = (fields: Record<string, string>) => ({
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(fields).toString(),
    signal: controller.signal,
  });
  try {
    const tokenRes = await fetch(
      `${APPLE_ORIGIN}/auth/token`,
      form({ client_id: clientId, client_secret: clientSecret, code: authorizationCode, grant_type: 'authorization_code' }),
    );
    if (!tokenRes.ok) return 'failed';
    const tokens = (await tokenRes.json()) as { refresh_token?: string; access_token?: string; id_token?: string };
    const tokenSub = idTokenSub(tokens.id_token);
    if (!tokenSub) return 'identity_unavailable';
    // 다른 Apple ID 의 토큰을 취소하거나 현재 회원 데이터를 지우지 않는다.
    if (tokenSub !== expectedSub) return 'mismatch';
    const token = tokens.refresh_token ?? tokens.access_token;
    if (!token) return 'failed';
    const revokeRes = await fetch(
      `${APPLE_ORIGIN}/auth/revoke`,
      form({
        client_id: clientId,
        client_secret: clientSecret,
        token,
        token_type_hint: tokens.refresh_token ? 'refresh_token' : 'access_token',
      }),
    );
    return revokeRes.ok ? 'ok' : 'failed';
  } catch {
    return 'failed';
  } finally {
    clearTimeout(timeout);
  }
}
