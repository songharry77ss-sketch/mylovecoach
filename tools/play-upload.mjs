// PC 에서 실행: node tools/play-upload.mjs <AAB 경로> [--track internal|alpha|beta|production] [--status draft|completed] [--secrets <폴더>]
// Play Developer API 로 AAB 를 올리고 트랙에 배포한다 (GitHub Actions 없이 PC 에서 바로). 서비스 계정에 앱 권한이 있어야 한다.
import { Buffer } from 'node:buffer';
import { createSign } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';

const PACKAGE = 'app.mylovecoach.android';
const args = process.argv.slice(2);
const argOf = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);
const file = args.find((a) => /\.aab$/i.test(a));
if (!file) {
  console.error('사용법: node tools/play-upload.mjs <파일.aab> [--track internal] [--status completed]');
  process.exit(1);
}
const track = argOf('--track', 'internal');
const status = argOf('--status', 'completed');
const root = argOf('--secrets') ?? process.env.MYLOVECOACH_SECRETS ?? join(homedir(), 'wolha-secrets');
const BASE = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PACKAGE}`;
const UPLOAD = `https://androidpublisher.googleapis.com/upload/androidpublisher/v3/applications/${PACKAGE}`;

async function authorize() {
  const sa = JSON.parse(readFileSync(join(root, 'play-service-account.json'), 'utf8'));
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/androidpublisher', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3000 })}`;
  const assertion = `${unsigned}.${createSign('RSA-SHA256').update(unsigned).sign(sa.private_key).toString('base64url')}`;
  const json = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }) }).then((r) => r.json());
  if (!json.access_token) throw new Error(`서비스 계정 인증 실패: ${json.error_description ?? json.error}`);
  return json.access_token;
}

async function main() {
  const token = await authorize();
  const call = async (method, url, body, contentType = 'application/json') => {
    const res = await fetch(url, { method, headers: { Authorization: `Bearer ${token}`, ...(body ? { 'content-type': contentType } : {}) }, body: body == null ? undefined : contentType === 'application/json' ? JSON.stringify(body) : body });
    const json = res.status === 204 ? {} : await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`${method} ${url.replace(/^https:\/\/[^/]+/, '').split('?')[0]} → ${res.status}: ${json.error?.message ?? ''}`);
    return json;
  };
  const edit = await call('POST', `${BASE}/edits`, {});
  const E = `${BASE}/edits/${edit.id}`;
  try {
    const size = statSync(file).size;
    console.log(`업로드: ${basename(file)} (${(size / 1048576).toFixed(1)} MB) → ${track} 트랙 (${status})`);
    const bundle = await call('POST', `${UPLOAD}/edits/${edit.id}/bundles?uploadType=media`, readFileSync(file), 'application/octet-stream');
    console.log(`✓ 번들 등록: versionCode ${bundle.versionCode}`);
    await call('PUT', `${E}/tracks/${track}`, { track, releases: [{ name: `${bundle.versionCode}`, versionCodes: [String(bundle.versionCode)], status }] });
    console.log(`✓ 트랙 설정: ${track} · ${status}`);
    await call('POST', `${E}:commit`);
    console.log('✓ 저장 완료 — Play Console → 테스트 → 내부 테스트에서 확인');
  } catch (e) {
    await call('DELETE', E).catch(() => {});
    throw e;
  }
}
main().catch((e) => {
  console.error(`✗ ${e.message}`);
  process.exitCode = 1;
});
