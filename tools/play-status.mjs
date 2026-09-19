// 실행: node tools/play-status.mjs [--secrets <폴더>]
// Play Console 의 현재 상태를 읽기만 한다 — 트랙별 출시 버전·상태, 테스터 참여(옵트인) 링크.
// 스토어 링크에서 "항목을 찾을 수 없습니다" 가 나올 때 어느 트랙까지 올라가 있는지 확인하는 용도.
// 서비스 계정 키는 --secrets 폴더의 play-service-account.json 또는 환경변수 PLAY_SERVICE_ACCOUNT_JSON 에서 읽는다.
import { Buffer } from 'node:buffer';
import { createSign } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const PACKAGE = 'app.mylovecoach.android';
const args = process.argv.slice(2);
const argOf = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
const root = argOf('--secrets') ?? process.env.MYLOVECOACH_SECRETS ?? join(homedir(), 'wolha-secrets');
const BASE = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PACKAGE}`;

function serviceAccount() {
  const inline = process.env.PLAY_SERVICE_ACCOUNT_JSON;
  if (inline && inline.trim()) return JSON.parse(inline);
  const file = join(root, 'play-service-account.json');
  if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8'));
  throw new Error(`서비스 계정 키를 찾을 수 없습니다 (${file} 또는 PLAY_SERVICE_ACCOUNT_JSON)`);
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

const TRACK_LABEL = {
  internal: '내부 테스트',
  alpha: '비공개 테스트(알파)',
  beta: '공개 테스트(베타)',
  production: '프로덕션(정식 출시)',
};

// 출시 상태 → 사람이 읽는 말
const STATUS_LABEL = {
  completed: '배포됨',
  draft: '초안 (아직 배포 안 됨 — Play Console 에서 출시해야 함)',
  inProgress: '단계적 배포 중',
  halted: '중단됨',
};

async function main() {
  const token = await authorize();
  const call = async (method, url) => {
    const res = await fetch(url, { method, headers: { Authorization: `Bearer ${token}` } });
    const json = res.status === 204 ? {} : await res.json().catch(() => ({}));
    if (!res.ok) {
      const e = new Error(`${method} ${url.replace(/^https:\/\/[^/]+/, '').split('?')[0]} → ${res.status}: ${json.error?.message ?? ''}`);
      e.status = res.status;
      throw e;
    }
    return json;
  };

  const edit = await call('POST', `${BASE}/edits`);
  const E = `${BASE}/edits/${edit.id}`;
  try {
    const { tracks = [] } = await call('GET', `${E}/tracks`);
    const withReleases = tracks.filter((t) => (t.releases ?? []).some((r) => (r.versionCodes ?? []).length));

    console.log(`패키지: ${PACKAGE}\n`);
    if (!withReleases.length) {
      console.log('어느 트랙에도 출시된 빌드가 없습니다. AAB 는 올라갔어도 트랙에 배포되지 않은 상태입니다.');
    }
    for (const t of tracks) {
      const label = TRACK_LABEL[t.track] ?? t.track;
      const releases = t.releases ?? [];
      if (!releases.length) {
        console.log(`· ${label}: 출시 없음`);
        continue;
      }
      for (const r of releases) {
        const codes = (r.versionCodes ?? []).join(', ') || '없음';
        const status = STATUS_LABEL[r.status] ?? r.status;
        const fraction = r.userFraction != null ? ` · 사용자 ${Math.round(r.userFraction * 100)}%` : '';
        console.log(`· ${label}: versionCode ${codes} · ${status}${fraction}`);
      }
      // 테스터 목록(그룹)은 트랙에 따라 조회가 안 될 수 있다
      if (t.track !== 'production') {
        const testers = await call('GET', `${E}/testers/${t.track}`).catch(() => null);
        if (testers) {
          const groups = testers.googleGroups ?? [];
          console.log(`    테스터 그룹: ${groups.length ? groups.join(', ') : '없음 (Play Console 의 이메일 목록으로 관리 중일 수 있음)'}`);
        }
      }
    }

    const hasProduction = tracks.some((t) => t.track === 'production' && (t.releases ?? []).some((r) => r.status === 'completed' && (r.versionCodes ?? []).length));
    console.log('\n참여 링크');
    console.log(`· 내부 테스트: Play Console → 테스트 → 내부 테스트 → 테스터 탭의 "링크 복사" (https://play.google.com/apps/internaltest/... 형식)`);
    console.log(`· 비공개/공개 테스트: https://play.google.com/apps/testing/${PACKAGE}`);
    console.log(`· 일반 스토어 주소: https://play.google.com/store/apps/details?id=${PACKAGE} — ${hasProduction ? '정식 출시됨' : '정식 출시 전이라 참여하지 않은 사람에게는 "항목을 찾을 수 없습니다" 로 보입니다'}`);
  } finally {
    // 읽기만 했으므로 편집본을 지운다 (열어둔 채로 두면 다음 업로드가 충돌할 수 있음)
    await call('DELETE', E).catch(() => {});
  }
}

main().catch((e) => {
  console.error(`✗ ${e.message}`);
  process.exitCode = 1;
});
