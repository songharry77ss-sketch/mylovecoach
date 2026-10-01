// 실행: node tools/play-closed-test.mjs [--version-code 114] [--dry-run] [--secrets <폴더>]
// 내부 테스트에 올라가 있는 빌드를 비공개 테스트(alpha) 트랙에 올린다.
//
// 앱이 아직 「앱 초안」(한 번도 게시 안 됨)이면 API 로는 초안(draft) 출시까지만 만들 수 있다.
// 그 경우 Play Console → 테스트 및 출시 → 비공개 테스트 에서
// 「테스터 지정 → 버전 검토 → 출시 시작」을 눌러야 실제로 시작된다 (첫 게시는 화면에서만 가능).
// 앱이 이미 게시된 상태면 바로 출시(completed)한다.
//
// --dry-run : 실제로 반영하지 않고 edits:validate 로 검증만 한다
import { Buffer } from 'node:buffer';
import { createSign } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const PACKAGE = 'app.mylovecoach.android';
const TRACK = 'alpha';
const args = process.argv.slice(2);
const argOf = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
const dryRun = args.includes('--dry-run');
const root = argOf('--secrets') ?? process.env.MYLOVECOACH_SECRETS ?? join(homedir(), 'wolha-secrets');
const BASE = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PACKAGE}`;

function serviceAccount() {
  const inline = process.env.PLAY_SERVICE_ACCOUNT_JSON;
  if (inline && inline.trim()) return JSON.parse(inline);
  const file = join(root, 'play-service-account.json');
  if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8'));
  throw new Error(`서비스 계정 키를 찾을 수 없습니다 (${file} 또는 PLAY_SERVICE_ACCOUNT_JSON)`);
}

async function token() {
  const sa = serviceAccount();
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/androidpublisher', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3000 })}`;
  const sig = createSign('RSA-SHA256').update(unsigned).sign(sa.private_key, 'base64url');
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${sig}` }),
  }).then((r) => r.json());
  if (!res.access_token) throw new Error(`인증 실패: ${JSON.stringify(res).slice(0, 200)}`);
  return res.access_token;
}

async function main() {
  const tok = await token();
  const call = async (method, path, body) => {
    const r = await fetch(BASE + path, { method, headers: { authorization: `Bearer ${tok}`, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    const text = await r.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { /* 빈 응답 */ }
    return { ok: r.ok, status: r.status, json, message: json?.error?.message ?? text.slice(0, 200) };
  };

  const edit = (await call('POST', '/edits')).json;
  const internal = (await call('GET', `/edits/${edit.id}/tracks/internal`)).json;
  const wanted = argOf('--version-code');
  const versionCodes = wanted ? [wanted] : (internal?.releases?.[0]?.versionCodes ?? []);
  if (!versionCodes.length) {
    console.log('내부 테스트에 올라간 빌드가 없습니다. 먼저 android.yml 로 내부 테스트에 올려주세요.');
    process.exitCode = 2;
    return;
  }
  console.log(`비공개 테스트에 올릴 빌드: versionCode ${versionCodes.join(', ')}`);

  // 먼저 바로 출시(completed)를 시도하고, 앱 초안이라 거부되면 초안(draft)으로 만든다
  let status = 'completed';
  for (const attempt of ['completed', 'draft']) {
    status = attempt;
    const set = await call('PUT', `/edits/${edit.id}/tracks/${TRACK}`, { track: TRACK, releases: [{ name: '1.0.0', versionCodes, status }] });
    if (!set.ok) throw new Error(`트랙 설정 실패: ${set.message}`);
    const val = await call('POST', `/edits/${edit.id}:validate`);
    if (val.ok) break;
    if (attempt === 'completed' && /draft app/i.test(val.message)) {
      console.log('· 앱이 아직 「앱 초안」이라 API 로는 초안 출시까지만 만들 수 있습니다');
      continue;
    }
    await call('DELETE', `/edits/${edit.id}`);
    throw new Error(`검증 실패: ${val.message}`);
  }

  if (dryRun) {
    await call('DELETE', `/edits/${edit.id}`);
    console.log(`검증 통과 — 실제로는 ${status === 'draft' ? '초안으로' : '바로 출시로'} 반영됩니다 (--dry-run 이라 반영하지 않음)`);
    return;
  }

  const commit = await call('POST', `/edits/${edit.id}:commit`);
  if (!commit.ok) throw new Error(`반영 실패: ${commit.message}`);

  if (status === 'draft') {
    console.log('\n✓ 비공개 테스트 초안을 만들었습니다.');
    console.log('남은 일 (Play Console 화면, 첫 게시는 화면에서만 가능):');
    console.log('  1. 테스트 및 출시 → 테스트 → 비공개 테스트 → 테스터 탭에서 이메일 목록 선택');
    console.log('  2. 출시 탭 → 버전 수정 → 버전 검토 → 출시 시작');
    console.log('  3. 게시 개요 → 검토를 위해 변경사항 전송');
  } else {
    console.log('\n✓ 비공개 테스트에 출시했습니다. 테스터는 아래 링크로 참여합니다:');
    console.log(`  https://play.google.com/apps/testing/${PACKAGE}`);
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
