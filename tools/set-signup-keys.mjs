// PC 에서 실행: node tools/set-signup-keys.mjs [--p8 <AuthKey_키ID.p8 경로>] [--kakao] [--dry-run]
// 회원 탈퇴 때 Apple 토큰 취소·카카오 연결 끊기(가입 브랜치 api/_unlink.ts)에 쓰는 키를 Vercel 환경변수로 올린다.
// 올리기 전에 Apple·카카오 서버에 물어 맞는 키인지 확인하고, 틀리면 올리지 않는다. 값은 출력하지 않는다.
//   Apple : --p8 로 Sign in with Apple 키 파일(AuthKey_<키ID>.p8)을 준다. 키 ID 는 파일 이름에서 읽는다.
//           팀 ID 는 wolha-secrets/apns-key.txt 의 TEAM_ID= (set-ci-secrets.mjs 와 같은 파일).
//           .p8 은 한 번만 내려받을 수 있으므로 wolha-secrets/mylovecoach-siwa-AuthKey_<키ID>.p8 로 복사해 둔다.
//   카카오: --kakao 를 주면 wolha-secrets/mylovecoach-kakao.txt 의 KAKAO_ADMIN_KEY=… 를 올린다.
//   → APPLE_TEAM_ID · APPLE_KEY_ID · APPLE_PRIVATE_KEY · KAKAO_ADMIN_KEY (production·preview). 반영은 다음 배포부터.
// --dry-run 이면 확인만 하고 올리지 않는다.
import { createPrivateKey, sign } from 'node:crypto';
import { copyFileSync, existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join, resolve } from 'node:path';

const PROJECT = 'prj_M3jScp9DK3yX9g2PyhEYRqJG6IzN';
const TEAM = 'team_d3dSGNKWhyYaOchYtUvaraRu';
const APPLE_CLIENT_ID = 'app.mylovecoach.ios';
// 이 계정의 다른 앱(월하)용 Sign in with Apple 키 — 연애코치 앱 ID 와 묶여 있지 않아 쓸 수 없다
const OTHER_APP_KEYS = new Set(['AJ962XQS37']);

const args = process.argv.slice(2);
const argOf = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const dryRun = args.includes('--dry-run');
const root = process.env.MYLOVECOACH_SECRETS ?? join(homedir(), 'wolha-secrets');
const entries = (file) =>
  Object.fromEntries(
    readFileSync(file, 'utf8')
      .split(/\r?\n/)
      .filter((l) => /^[A-Z_]+\s*=/.test(l.trim()))
      .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
  );
const fail = (message) => {
  console.error(`✗ ${message}`);
  process.exit(1);
};

const values = {};

// ── Apple ────────────────────────────────────────────────────────────
const p8Arg = argOf('--p8');
if (p8Arg) {
  const p8Path = resolve(p8Arg);
  if (!existsSync(p8Path)) fail(`키 파일이 없습니다: ${p8Path}`);
  const keyId = basename(p8Path).match(/^AuthKey_([A-Z0-9]{10})\.p8$/)?.[1];
  if (!keyId) fail('파일 이름이 AuthKey_<키ID 10자리>.p8 형식이어야 합니다 (Apple 에서 내려받은 이름 그대로).');
  if (OTHER_APP_KEYS.has(keyId)) fail(`${keyId} 는 월하용 키입니다. 연애코치(app.mylovecoach.ios)를 Primary App ID 로 고른 새 키를 쓰세요.`);
  const pem = readFileSync(p8Path, 'utf8').trim();
  let key;
  try {
    key = createPrivateKey(pem);
  } catch {
    fail('키 파일을 읽지 못했습니다 (.p8 개인 키가 아님).');
  }
  if (key.asymmetricKeyType !== 'ec' || key.asymmetricKeyDetails?.namedCurve !== 'prime256v1') fail('Apple 키(EC P-256)가 아닙니다.');
  const apnsFile = join(root, 'apns-key.txt');
  const teamId = existsSync(apnsFile) ? entries(apnsFile).TEAM_ID : argOf('--team');
  if (!/^[A-Z0-9]{10}$/.test(teamId ?? '')) fail('팀 ID 를 찾지 못했습니다 (wolha-secrets/apns-key.txt 의 TEAM_ID= 또는 --team).');
  // 서명이 되는지만 확인한다. Apple 은 진짜 인증 코드 없이는 키가 맞는지 알려 주지 않는다
  // (가짜 코드는 키와 상관없이 invalid_grant, /auth/revoke 는 가짜 키에도 200 — 2026-10-07 확인).
  sign('sha256', Buffer.from('check'), { key, dsaEncoding: 'ieee-p1363' });
  console.log(`✓ Apple 키 파일 ${keyId} (P-256, 앱 ${APPLE_CLIENT_ID})`);
  console.log('  키가 이 앱의 Sign in with Apple 키인지는 1.1 테스트 빌드에서 Apple 계정으로 가입·탈퇴해 확인하세요 (서버 기록에 apple=failed 가 없어야 함).');
  values.APPLE_TEAM_ID = teamId;
  values.APPLE_KEY_ID = keyId;
  values.APPLE_PRIVATE_KEY = pem;

  const kept = join(root, `mylovecoach-siwa-AuthKey_${keyId}.p8`);
  if (!existsSync(kept) && !dryRun) {
    copyFileSync(p8Path, kept);
    console.log(`  키 파일을 비밀 폴더에 보관: ${kept}`);
  }
}

// ── 카카오 ───────────────────────────────────────────────────────────
if (args.includes('--kakao')) {
  const kakaoFile = join(root, 'mylovecoach-kakao.txt');
  if (!existsSync(kakaoFile)) fail(`${kakaoFile} 에 KAKAO_ADMIN_KEY=… 한 줄을 넣어 주세요 (카카오 디벨로퍼스 → 앱 → 앱 키 → Admin 키).`);
  const adminKey = entries(kakaoFile).KAKAO_ADMIN_KEY;
  if (!adminKey) fail(`${kakaoFile} 에 KAKAO_ADMIN_KEY= 줄이 없습니다.`);
  // 읽기 전용 호출로 확인: 앱 사용자 번호 목록 (Admin 키가 맞으면 200)
  const res = await fetch('https://kapi.kakao.com/v1/user/ids?limit=1', { headers: { Authorization: `KakaoAK ${adminKey}` } });
  if (!res.ok) fail(`카카오가 Admin 키를 거부했습니다 (HTTP ${res.status}). 「Admin 키」인지(REST API 키 아님) 확인하세요.`);
  console.log('✓ 카카오 Admin 키 확인');
  values.KAKAO_ADMIN_KEY = adminKey;
}

if (!Object.keys(values).length) {
  console.log('올릴 키가 없습니다. --p8 <AuthKey_키ID.p8> 또는 --kakao 를 주세요.');
  process.exit(0);
}
if (dryRun) {
  console.log(`\n확인만 했습니다 (--dry-run). 올릴 항목: ${Object.keys(values).join(', ')}`);
  process.exit(0);
}

// ── Vercel 환경변수 ──────────────────────────────────────────────────
const vercelFile = ['mylovecoach-vercel-token.txt', 'vercel-token.txt'].map((f) => join(root, f)).find(existsSync);
if (!vercelFile) fail('Vercel 토큰 파일이 없습니다 (mylovecoach-vercel-token.txt)');
const vercelToken = entries(vercelFile).VERCEL_TOKEN ?? readFileSync(vercelFile, 'utf8').trim();
const headers = { Authorization: `Bearer ${vercelToken}`, 'content-type': 'application/json' };
const api = async (method, path, body) => {
  const res = await fetch(`https://api.vercel.com${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  return { ok: res.ok, status: res.status, json: await res.json().catch(() => ({})) };
};
const current = await api('GET', `/v9/projects/${PROJECT}/env?teamId=${TEAM}`);
if (!current.ok) fail(`Vercel 환경변수 목록을 읽지 못했습니다 (HTTP ${current.status}).`);
for (const [keyName, value] of Object.entries(values)) {
  for (const e of (current.json.envs ?? []).filter((e) => e.key === keyName)) await api('DELETE', `/v9/projects/${PROJECT}/env/${e.id}?teamId=${TEAM}`);
  const r = await api('POST', `/v10/projects/${PROJECT}/env?teamId=${TEAM}&upsert=true`, {
    key: keyName,
    value,
    type: 'encrypted',
    target: ['production', 'preview'],
  });
  console.log(`${r.ok ? '✓' : '✗'} ${keyName} ${r.ok ? '등록' : `실패 (${r.status}) ${r.json?.error?.message ?? ''}`}`);
}
console.log('\n다음 배포부터 반영됩니다 (가입 기능은 1.1 배포 때 함께).');
