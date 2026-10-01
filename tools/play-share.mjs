// 실행: node tools/play-share.mjs <파일.aab> [--secrets <폴더>]
// Play 내부 앱 공유(internal app sharing)에 AAB 를 올리고, 플레이스토어로 바로 열리는 설치 링크를 받는다.
// 트랙·테스터 목록과 상관없이 링크만 있으면 설치할 수 있다 (받는 쪽 폰에서 내부 앱 공유를 켜야 함).
// 서비스 계정 키는 --secrets 폴더의 play-service-account.json 또는 환경변수 PLAY_SERVICE_ACCOUNT_JSON 에서 읽는다.
import { Buffer } from 'node:buffer';
import { createSign } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';

const PACKAGE = 'app.mylovecoach.android';
const args = process.argv.slice(2);
const argOf = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
const file = args.find((a) => /\.aab$/i.test(a));
const root = argOf('--secrets') ?? process.env.MYLOVECOACH_SECRETS ?? join(homedir(), 'wolha-secrets');

function serviceAccount() {
  const inline = process.env.PLAY_SERVICE_ACCOUNT_JSON;
  if (inline && inline.trim()) return JSON.parse(inline);
  const path = join(root, 'play-service-account.json');
  if (existsSync(path)) return JSON.parse(readFileSync(path, 'utf8'));
  throw new Error(`서비스 계정 키를 찾을 수 없습니다 (${path} 또는 PLAY_SERVICE_ACCOUNT_JSON)`);
}

async function authorize() {
  const sa = serviceAccount();
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/androidpublisher',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3000,
  })}`;
  const assertion = `${unsigned}.${createSign('RSA-SHA256').update(unsigned).sign(sa.private_key).toString('base64url')}`;
  const json = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  }).then((r) => r.json());
  if (!json.access_token) throw new Error(`서비스 계정 인증 실패: ${json.error_description ?? json.error}`);
  return json.access_token;
}

async function main() {
  if (!file) {
    console.error('사용법: node tools/play-share.mjs <파일.aab>');
    process.exitCode = 1;
    return;
  }
  const token = await authorize();
  const size = statSync(file).size;
  console.log(`내부 앱 공유 업로드: ${basename(file)} (${(size / 1048576).toFixed(1)} MB)`);
  const res = await fetch(
    `https://androidpublisher.googleapis.com/upload/androidpublisher/v3/applications/internalappsharing/${PACKAGE}/artifacts/bundle?uploadType=media`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/octet-stream' },
      body: readFileSync(file),
    },
  );
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = json.error?.message ?? '알 수 없는 오류';
    if (/NOT_PUBLISHED/.test(msg)) {
      throw new Error(
        '앱이 아직 「앱 초안」 상태라 내부 앱 공유를 쓸 수 없습니다. ' +
          'Play Console 대시보드의 앱 설정 체크리스트(앱 콘텐츠 선언)를 끝낸 뒤 다시 실행하세요.',
      );
    }
    throw new Error(`업로드 실패 (${res.status}): ${msg}`);
  }
  console.log(`✓ 설치 링크: ${json.downloadUrl}`);
  console.log('');
  console.log('받는 사람 폰에서 처음 한 번만:');
  console.log('  플레이스토어 → 프로필 → 설정 → 정보 → 「Play 스토어 버전」을 7번 눌러 개발자 모드 켜기');
  console.log('  → 설정 → 일반 → 「내부 앱 공유」 켜기 → 위 링크 열기 → 설치');
}

main().catch((e) => {
  console.error(`✗ ${e.message}`);
  process.exitCode = 1;
});
