// PC 에서 실행: node tools/set-analytics-env.mjs [--deploy] [--admin-password <새 비밀번호>] [--new-device-secret] [--analytics on|off]
// wolha-secrets 의 Supabase·관리자 비밀번호를 Vercel 환경변수로 올린다. 값은 출력하지 않는다.
//   mylovecoach-supabase.txt     : SUPABASE_URL=… / SUPABASE_SERVICE_ROLE_KEY=…
//   mylovecoach-admin-token.txt  : ADMIN_TOKEN=…        (없으면 새로 만든다. --admin-password 를 주면 그 값으로 바꾼다)
//                                  ADMIN_DEVICE_SECRET=… (관리자 브라우저 등록 열쇠, 없으면 새로 만든다.
//                                                         --new-device-secret 이면 새로 만들어 기존 등록 브라우저를 모두 끊는다)
//   mylovecoach-vercel-token.txt : VERCEL_TOKEN=…
// --analytics on 이면 ANALYTICS_ENABLED=1 (이용 기록 저장), off 면 0. 안 주면 그대로 둔다.
// 브라우저 등록은 tools/admin-enroll.mjs.
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const PROJECT = 'prj_M3jScp9DK3yX9g2PyhEYRqJG6IzN';
const TEAM = 'team_d3dSGNKWhyYaOchYtUvaraRu';
const SCOPE = 'harrys-projects-a44d021e';

const args = process.argv.slice(2);
const root = args.includes('--secrets') ? args[args.indexOf('--secrets') + 1] : (process.env.MYLOVECOACH_SECRETS ?? join(homedir(), 'wolha-secrets'));
const entries = (file) =>
  Object.fromEntries(
    readFileSync(file, 'utf8')
      .split(/\r?\n/)
      .filter((l) => /^[A-Z_]+\s*=/.test(l.trim()))
      .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
  );

const vercelFile = ['mylovecoach-vercel-token.txt', 'vercel-token.txt'].map((f) => join(root, f)).find(existsSync);
if (!vercelFile) {
  console.error('Vercel 토큰 파일이 없습니다 (mylovecoach-vercel-token.txt)');
  process.exit(1);
}
const vercelToken = entries(vercelFile).VERCEL_TOKEN ?? readFileSync(vercelFile, 'utf8').trim();

const adminFile = join(root, 'mylovecoach-admin-token.txt');
const newPassword = args.includes('--admin-password') ? String(args[args.indexOf('--admin-password') + 1] ?? '').trim() : '';
if (args.includes('--admin-password') && !newPassword) {
  console.error('--admin-password 뒤에 새 비밀번호를 적어 주세요.');
  process.exit(1);
}
// 비밀번호와 기기 열쇠는 같은 파일에 두 줄로 둔다 (한쪽을 바꿔도 다른 쪽은 그대로)
const adminNow = existsSync(adminFile) ? entries(adminFile) : {};
const adminToken = newPassword || adminNow.ADMIN_TOKEN || randomBytes(12).toString('base64url');
const freshDevice = args.includes('--new-device-secret') || !adminNow.ADMIN_DEVICE_SECRET;
const deviceSecret = freshDevice ? randomBytes(32).toString('base64url') : adminNow.ADMIN_DEVICE_SECRET;
if (newPassword || freshDevice || !adminNow.ADMIN_TOKEN) {
  writeFileSync(adminFile, `ADMIN_TOKEN=${adminToken}\nADMIN_DEVICE_SECRET=${deviceSecret}\n`, { mode: 0o600 });
  if (newPassword) console.log(`관리자 비밀번호 변경: ${adminFile}`);
  if (!adminNow.ADMIN_TOKEN) console.log(`관리자 비밀번호 생성: ${adminFile}`);
  if (freshDevice) console.log(`관리자 기기 열쇠 ${adminNow.ADMIN_DEVICE_SECRET ? '교체' : '생성'}: 배포 뒤 node tools/admin-enroll.mjs 로 브라우저를 등록하세요`);
}

const values = { ADMIN_TOKEN: adminToken, ADMIN_DEVICE_SECRET: deviceSecret };
if (args.includes('--analytics')) {
  const mode = args[args.indexOf('--analytics') + 1];
  if (mode !== 'on' && mode !== 'off') {
    console.error('--analytics 뒤에는 on 또는 off 를 적어 주세요.');
    process.exit(1);
  }
  values.ANALYTICS_ENABLED = mode === 'on' ? '1' : '0';
}
const supaFile = join(root, 'mylovecoach-supabase.txt');
if (existsSync(supaFile)) {
  const s = entries(supaFile);
  if (s.SUPABASE_URL && s.SUPABASE_SERVICE_ROLE_KEY) {
    values.SUPABASE_URL = s.SUPABASE_URL.replace(/\/+$/, '');
    values.SUPABASE_SERVICE_ROLE_KEY = s.SUPABASE_SERVICE_ROLE_KEY;
  } else {
    console.log(`· ${supaFile} 에 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 두 줄이 모두 있어야 합니다.`);
  }
} else {
  console.log(`· ${supaFile} 이 없어 Supabase 는 건너뜁니다 (docs/ANALYTICS_SETUP.md 1단계 참고).`);
}

const headers = { Authorization: `Bearer ${vercelToken}`, 'content-type': 'application/json' };
const api = async (method, path, body) => {
  const res = await fetch(`https://api.vercel.com${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  return { ok: res.ok, status: res.status, json: await res.json().catch(() => ({})) };
};

const current = await api('GET', `/v9/projects/${PROJECT}/env?teamId=${TEAM}`);
for (const [key, value] of Object.entries(values)) {
  if (!value) continue;
  for (const e of (current.json.envs ?? []).filter((e) => e.key === key)) await api('DELETE', `/v9/projects/${PROJECT}/env/${e.id}?teamId=${TEAM}`);
  const r = await api('POST', `/v10/projects/${PROJECT}/env?teamId=${TEAM}&upsert=true`, {
    key,
    value,
    type: 'encrypted',
    target: ['production', 'preview'],
  });
  console.log(`${r.ok ? '✓' : '✗'} ${key} ${r.ok ? '등록' : `실패 (${r.status}) ${r.json?.error?.message ?? ''}`}`);
}

if (args.includes('--deploy')) {
  console.log('\n▶ 프로덕션 재배포');
  const r = spawnSync('npx', ['vercel@latest', 'deploy', '--prod', '--yes', '--scope', SCOPE, '--token', vercelToken], {
    stdio: 'inherit',
    shell: true,
    windowsHide: true,
  });
  process.exitCode = r.status ?? 0;
} else {
  console.log('\n환경변수만 등록했습니다. 반영하려면 --deploy 를 붙여 다시 실행하세요.');
}
