// PC 에서 실행: node tools/play-promote.mjs --version-code 143 [--track production] [--apply] [--secrets <폴더>]
// 이미 Play 에 올라간 번들(내부 테스트 등)을 다른 트랙(기본 프로덕션)에 출시한다 — 번들을 다시 올리지 않는다 (2026-11-27 세계 출시).
// 출시 노트: 한국어(ko-KR)는 docs/STORE_LISTING.md 「이번 버전의 새로운 기능 (app.json 버전)」, 세계판 언어는 docs/store-listing/<언어>.json 의 whatsNew.
// ⚠ 이 앱은 저장(commit)하면 대기 중인 변경(콘솔의 국가 설정·등록 정보 포함)이 바로 구글 검토로 넘어간다. --apply 없으면 검사(validate)만.
import { createSign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { playRelease, playReleaseNotes } from './lib/play-release.mjs';
import { playReleaseNotes as globalReleaseNotes } from './lib/store-listings.mjs';

const PACKAGE = 'app.mylovecoach.android';
const args = process.argv.slice(2);
const argOf = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);
const versionCode = Number(argOf('--version-code'));
const track = argOf('--track', 'production');
const apply = args.includes('--apply');
if (!Number.isInteger(versionCode) || versionCode <= 0) {
  console.error('사용법: node tools/play-promote.mjs --version-code <번호> [--track production] [--apply]');
  process.exit(1);
}
const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const appVersion = JSON.parse(readFileSync(join(repo, 'app.json'), 'utf8')).expo.version;
const global = globalReleaseNotes();
if (global.skipped.length) console.log(`⚠ 출시 노트를 뺀 언어: ${global.skipped.join(' / ')}`);
const notes = [...playReleaseNotes(readFileSync(join(repo, 'docs', 'STORE_LISTING.md'), 'utf8'), appVersion), ...global.notes];
const root = argOf('--secrets') ?? process.env.MYLOVECOACH_SECRETS ?? join(homedir(), 'wolha-secrets');
const BASE = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PACKAGE}`;

async function token() {
  const sa = JSON.parse(readFileSync(join(root, 'play-service-account.json'), 'utf8'));
  const now = Math.floor(Date.now() / 1000);
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/androidpublisher', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 600 })}`;
  const sig = createSign('RSA-SHA256').update(unsigned).sign(sa.private_key, 'base64url');
  const res = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${unsigned}.${sig}` });
  const j = await res.json();
  if (!j.access_token) throw new Error('Play 인증 실패');
  return j.access_token;
}
const tok = await token();
async function call(method, url, body) {
  const res = await fetch(url, { method, headers: { authorization: `Bearer ${tok}`, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${url.replace(BASE, '')} → ${res.status}: ${text.slice(0, 400)}`);
  return text ? JSON.parse(text) : {};
}

const edit = await call('POST', `${BASE}/edits`, {});
const E = `${BASE}/edits/${edit.id}`;
let done = false;
try {
  const bundles = (await call('GET', `${E}/bundles`)).bundles ?? [];
  if (!bundles.some((b) => b.versionCode === versionCode)) throw new Error(`versionCode ${versionCode} 번들이 Play 에 없다 — 먼저 android.yml 로 올린다`);
  const cur = await call('GET', `${E}/tracks/${track}`).catch(() => ({ releases: [] }));
  console.log(`· ${track} 지금: ${(cur.releases ?? []).map((r) => `${r.name} ${r.status}`).join(' / ') || '없음'}`);
  const release = playRelease({ versionCode, versionString: appVersion, status: 'completed', notes });
  console.log(`· 새 출시: ${release.name} · completed · 출시 노트 ${notes.length}개 언어`);
  await call('PUT', `${E}/tracks/${track}`, { track, releases: [release] });
  await call('POST', `${E}:validate`);
  console.log('✓ Play 검사(validate) 통과');
  if (!apply) {
    console.log('확인만 했다 — 실제로 출시하려면 --apply (대기 중인 변경 전체가 구글 검토로 넘어간다)');
  } else {
    await call('POST', `${E}:commit`);
    done = true;
    console.log(`✓ ${track} 출시 저장 — 구글 검토로 넘어감`);
  }
} finally {
  if (!done) await call('DELETE', E).catch(() => {});
}
