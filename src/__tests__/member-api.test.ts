/**
 * api/member.ts DELETE(회원 탈퇴) — 데이터베이스 정리 → 카카오·Apple 연결 끊기 → 로그인 계정 삭제 순서.
 * Supabase·카카오·Apple 은 fetch 를 가짜로 바꿔 어떤 요청이 나가는지만 본다.
 */
import { generateKeyPairSync, verify } from 'node:crypto';

import handler from '../../api/member';
import { appleClientSecret, kakaoUserId } from '../../api/_unlink';

interface FakeRes {
  statusCode: number;
  body?: { error?: string; deleted?: boolean } & Record<string, unknown>;
  setHeader: () => FakeRes;
  status: (code: number) => FakeRes;
  json: (body: FakeRes['body']) => FakeRes;
  end: () => FakeRes;
}

function fakeRes(): FakeRes {
  const res = { statusCode: 200 } as FakeRes;
  res.setHeader = () => res;
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (body) => {
    res.body = body;
    return res;
  };
  res.end = () => res;
  return res;
}

const USER_ID = '11111111-2222-3333-4444-555555555555';
const kakaoUser = {
  id: USER_ID,
  app_metadata: { provider: 'kakao' },
  identities: [{ provider: 'kakao', id: '4200001', identity_data: { sub: '4200001', provider_id: '4200001' } }],
};
const appleUser = { id: USER_ID, app_metadata: { provider: 'apple' }, identities: [{ provider: 'apple', id: '001234.abc', identity_data: {} }] };

const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const PRIVATE_PEM = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();

const calls: { url: string; method: string; body?: string; headers?: Record<string, string> }[] = [];
let user: object = kakaoUser;
let memberDeleteOk = true;

function deleteReq(body?: unknown) {
  return { method: 'DELETE', body, query: {}, headers: { authorization: 'Bearer user-token' } } as never;
}

beforeEach(() => {
  calls.length = 0;
  user = kakaoUser;
  memberDeleteOk = true;
  process.env.SUPABASE_URL = 'https://db.example';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
  delete process.env.COACH_APP_TOKEN;
  delete process.env.KAKAO_ADMIN_KEY;
  delete process.env.APPLE_TEAM_ID;
  delete process.env.APPLE_KEY_ID;
  delete process.env.APPLE_PRIVATE_KEY;
  delete process.env.APPLE_CLIENT_ID;
  global.fetch = jest.fn(async (url: string, init: { method?: string; body?: string; headers?: Record<string, string> } = {}) => {
    const u = String(url);
    const method = init.method ?? 'GET';
    calls.push({ url: u, method, body: init.body, headers: init.headers });
    const reply = (ok: boolean, json: unknown = {}, status = ok ? 200 : 500) => ({
      ok,
      status,
      text: async () => (json === undefined ? '' : JSON.stringify(json)),
      json: async () => json,
    });
    if (u.endsWith('/auth/v1/user')) return reply(true, user);
    if (u.endsWith('/rest/v1/rpc/member_delete')) return memberDeleteOk ? reply(true, undefined, 204) : reply(false, { message: 'boom' });
    if (u.startsWith('https://appleid.apple.com/auth/token')) return reply(true, { refresh_token: 'apple-refresh' });
    return reply(true, undefined);
  }) as unknown as typeof fetch;
});

const deletedAuthUser = () => calls.some((c) => c.method === 'DELETE' && c.url.includes(`/auth/v1/admin/users/${USER_ID}`));

describe('DELETE /api/member (회원 탈퇴)', () => {
  it('데이터베이스 정리(member_delete)가 실패하면 로그인 계정을 지우지 않고 502 — 다시 시도할 수 있다', async () => {
    memberDeleteOk = false;
    const res = fakeRes();
    await handler(deleteReq(), res as never);
    expect(res.statusCode).toBe(502);
    expect(deletedAuthUser()).toBe(false);
  });

  it('키가 없으면 연결 끊기는 건너뛰고 탈퇴는 마친다', async () => {
    const res = fakeRes();
    await handler(deleteReq(), res as never);
    expect(res.statusCode).toBe(200);
    expect(res.body?.deleted).toBe(true);
    expect(calls.some((c) => c.url.includes('kapi.kakao.com') || c.url.includes('appleid.apple.com'))).toBe(false);
    expect(deletedAuthUser()).toBe(true);
  });

  it('카카오 회원: 어드민 키로 그 회원번호의 연결을 끊은 뒤 로그인 계정을 지운다', async () => {
    process.env.KAKAO_ADMIN_KEY = 'kakao-admin';
    const res = fakeRes();
    await handler(deleteReq(), res as never);
    expect(res.statusCode).toBe(200);
    const unlinkIndex = calls.findIndex((c) => c.url === 'https://kapi.kakao.com/v1/user/unlink');
    const authDeleteIndex = calls.findIndex((c) => c.method === 'DELETE' && c.url.includes('/auth/v1/admin/users/'));
    expect(unlinkIndex).toBeGreaterThan(-1);
    expect(unlinkIndex).toBeLessThan(authDeleteIndex);
    const unlink = calls[unlinkIndex];
    expect(unlink.headers?.Authorization).toBe('KakaoAK kakao-admin');
    expect(Object.fromEntries(new URLSearchParams(unlink.body))).toEqual({ target_id_type: 'user_id', target_id: '4200001' });
  });

  it('Apple 회원: 탈퇴 직전 코드를 토큰으로 바꿔 취소한 뒤 로그인 계정을 지운다', async () => {
    user = appleUser;
    process.env.APPLE_TEAM_ID = 'TEAM123456';
    process.env.APPLE_KEY_ID = 'KEY1234567';
    process.env.APPLE_PRIVATE_KEY = PRIVATE_PEM.replace(/\n/g, '\\n'); // 한 줄로 넣은 환경변수
    const res = fakeRes();
    await handler(deleteReq({ appleAuthorizationCode: 'apple-code' }), res as never);
    expect(res.statusCode).toBe(200);
    const token = calls.find((c) => c.url === 'https://appleid.apple.com/auth/token');
    const revoke = calls.find((c) => c.url === 'https://appleid.apple.com/auth/revoke');
    expect(Object.fromEntries(new URLSearchParams(token?.body))).toMatchObject({
      client_id: 'app.mylovecoach.ios',
      code: 'apple-code',
      grant_type: 'authorization_code',
    });
    expect(Object.fromEntries(new URLSearchParams(revoke?.body))).toMatchObject({
      client_id: 'app.mylovecoach.ios',
      token: 'apple-refresh',
      token_type_hint: 'refresh_token',
    });
    expect(calls.indexOf(revoke!)).toBeLessThan(calls.findIndex((c) => c.method === 'DELETE' && c.url.includes('/auth/v1/admin/users/')));
    expect(deletedAuthUser()).toBe(true);
  });

  it('연결 끊기가 실패해도 탈퇴는 마친다', async () => {
    process.env.KAKAO_ADMIN_KEY = 'kakao-admin';
    const base = global.fetch as jest.Mock;
    const original = base.getMockImplementation()!;
    base.mockImplementation(async (url: string, init: never) => {
      if (String(url).includes('kapi.kakao.com')) throw new Error('network');
      return original(url, init);
    });
    const res = fakeRes();
    await handler(deleteReq(), res as never);
    expect(res.statusCode).toBe(200);
    expect(deletedAuthUser()).toBe(true);
  });
});

describe('연결 끊기 도우미', () => {
  it('카카오 회원번호는 identity_data.provider_id → sub → id 순으로 찾는다', () => {
    expect(kakaoUserId(kakaoUser)).toBe('4200001');
    expect(kakaoUserId({ id: 'x', identities: [{ provider: 'kakao', id: '77' }] })).toBe('77');
    expect(kakaoUserId(appleUser)).toBeNull();
  });

  it('Apple client_secret 은 ES256 으로 서명되고 팀·키·앱 ID 를 담는다', () => {
    process.env.APPLE_TEAM_ID = 'TEAM123456';
    process.env.APPLE_KEY_ID = 'KEY1234567';
    process.env.APPLE_PRIVATE_KEY = PRIVATE_PEM;
    const jwt = appleClientSecret(1_800_000_000)!;
    const [h, p, s] = jwt.split('.');
    expect(JSON.parse(Buffer.from(h, 'base64url').toString())).toEqual({ alg: 'ES256', kid: 'KEY1234567' });
    expect(JSON.parse(Buffer.from(p, 'base64url').toString())).toEqual({
      iss: 'TEAM123456',
      iat: 1_800_000_000,
      exp: 1_800_000_300,
      aud: 'https://appleid.apple.com',
      sub: 'app.mylovecoach.ios',
    });
    const valid = verify('sha256', Buffer.from(`${h}.${p}`), { key: publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(s, 'base64url'));
    expect(valid).toBe(true);
  });

  it('Apple 키가 없으면 null', () => {
    expect(appleClientSecret()).toBeNull();
  });
});
