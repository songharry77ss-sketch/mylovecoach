// PC 에서 실행: node tools/set-ci-secrets.mjs [--api-url https://...] [--secrets <폴더>]
// 월하 출시 때 쓴 열쇠 폴더(기본 %USERPROFILE%\wolha-secrets)를 읽어 이 저장소의 GitHub Actions 시크릿을 등록한다.
// 값은 gh 의 stdin 으로만 전달하고 절대 출력하지 않는다. 없는 파일은 만들 수 있는 것(iOS 인증서 개인키, Android 업로드 키)만 새로 만든다.
//
// 읽는 파일:
//   asc-key.p8, asc-key.txt(ISSUER_ID=, KEY_ID=)          → ASC_KEY_ID / ASC_ISSUER_ID / ASC_KEY_P8_BASE64 (월하와 동일)
//   apns-key.txt(TEAM_ID=)                                → APPLE_TEAM_ID
//   *.p12 + 같은 이름-password.txt 또는 p12-password.txt   → IOS_DISTRIBUTION_P12_BASE64 / IOS_DISTRIBUTION_P12_PASSWORD (있으면)
//   mylovecoach-ios-cert-key.pem                          → IOS_CERT_PRIVATE_KEY_BASE64 (p12 가 없으면 자동 생성)
//   mylovecoach-upload.jks + mylovecoach-keystore-password.txt → ANDROID_* (없으면 keytool 로 생성)
//   play-service-account.json                              → PLAY_SERVICE_ACCOUNT_JSON (선택)
//   mylovecoach-api-url.txt 또는 --api-url                 → 변수 EXPO_PUBLIC_API_URL
//   vercel-token.txt(VERCEL_TOKEN=)                        → VERCEL_TOKEN (vercel.yml 이 웹+API 자동 배포)
//   gemini-api-key.txt(GEMINI_API_KEY=) 또는 --gemini-key   → GEMINI_API_KEY (서버용)
import { existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createPrivateKey, generateKeyPairSync, randomBytes, createSign } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const REPO = 'songharry77ss-sketch/mylovecoach';
const BUNDLE_ID = 'app.mylovecoach.ios';
const args = process.argv.slice(2);
const argOf = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const root = argOf('--secrets') ?? process.env.MYLOVECOACH_SECRETS ?? process.env.WOLHA_SECRETS ?? join(homedir(), 'wolha-secrets');
if (!existsSync(root)) {
  console.error(`열쇠 폴더가 없습니다: ${root}  (--secrets <폴더> 로 지정)`);
  process.exit(1);
}
const entries = (file) =>
  Object.fromEntries(
    readFileSync(file, 'utf8')
      .split(/\r?\n/)
      .filter((l) => /^[A-Z_]+\s*=/.test(l.trim()))
      .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
  );
const has = (name) => existsSync(join(root, name));
const secrets = {};
const variables = {};
const notes = [];

// ---- Apple (App Store Connect API 키, 팀 ID) — 월하와 같은 파일
if (has('asc-key.p8') && has('asc-key.txt')) {
  const asc = entries(join(root, 'asc-key.txt'));
  const p8 = readFileSync(join(root, 'asc-key.p8'));
  try {
    const key = createPrivateKey(p8);
    if (key.asymmetricKeyType !== 'ec') throw new Error();
  } catch {
    console.error('asc-key.p8: 유효한 ES256 개인키가 아닙니다');
    process.exit(1);
  }
  if (!/^[A-Z0-9]{10}$/.test(asc.KEY_ID ?? '') || !/^[0-9a-f-]{36}$/i.test(asc.ISSUER_ID ?? '')) {
    console.error('asc-key.txt 에 KEY_ID=, ISSUER_ID= 가 올바르게 있어야 합니다');
    process.exit(1);
  }
  Object.assign(secrets, { ASC_KEY_ID: asc.KEY_ID, ASC_ISSUER_ID: asc.ISSUER_ID, ASC_KEY_P8_BASE64: p8.toString('base64') });
} else {
  notes.push('없음: asc-key.p8 / asc-key.txt → iOS 빌드 불가 (App Store Connect → 사용자 및 액세스 → 통합 → API 키)');
}
if (has('apns-key.txt') && /^[A-Z0-9]{10}$/.test(entries(join(root, 'apns-key.txt')).TEAM_ID ?? '')) {
  secrets.APPLE_TEAM_ID = entries(join(root, 'apns-key.txt')).TEAM_ID;
} else {
  notes.push('없음: apns-key.txt 의 TEAM_ID= → iOS 빌드 불가 (developer.apple.com → Membership 의 Team ID)');
}

// ---- iOS 배포 인증서: 기존 p12 가 있으면 재사용, 없으면 새 인증서용 개인키 생성
const p12 = readdirSync(root).filter((f) => /\.p12$/i.test(f)).sort((a, b) => (/dist/i.test(b) ? 1 : 0) - (/dist/i.test(a) ? 1 : 0))[0];
if (p12) {
  const base = p12.replace(/\.p12$/i, '');
  const pwFile = [`${base}-password.txt`, 'p12-password.txt', 'ios-cert-password.txt'].map((f) => join(root, f)).find(existsSync);
  if (pwFile) {
    const raw = readFileSync(pwFile, 'utf8');
    const pw = (entries(pwFile).PASSWORD ?? raw).trim();
    secrets.IOS_DISTRIBUTION_P12_BASE64 = readFileSync(join(root, p12)).toString('base64');
    secrets.IOS_DISTRIBUTION_P12_PASSWORD = pw;
    console.log(`iOS 인증서: ${p12} 재사용`);
  } else {
    notes.push(`${p12} 는 있는데 비밀번호 파일(${base}-password.txt)이 없어 건너뜀`);
  }
}
if (!secrets.IOS_DISTRIBUTION_P12_BASE64) {
  const pem = join(root, 'mylovecoach-ios-cert-key.pem');
  if (!existsSync(pem)) {
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    writeFileSync(pem, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
    console.log(`iOS 인증서 개인키 생성: ${pem} (CI 가 이 키로 Apple Distribution 인증서를 만듭니다 — 백업하세요)`);
  }
  secrets.IOS_CERT_PRIVATE_KEY_BASE64 = readFileSync(pem).toString('base64');
}

// ---- Android 업로드 키 (없으면 생성)
const jks = join(root, 'mylovecoach-upload.jks');
const jksPw = join(root, 'mylovecoach-keystore-password.txt');
if (!existsSync(jks)) {
  const tools = process.env.WOLHA_TOOLS ?? join(homedir(), 'wolha-tools');
  const javaHome =
    process.env.JAVA_HOME || (existsSync(tools) ? readdirSync(tools).filter((d) => d.startsWith('jdk-')).map((d) => join(tools, d))[0] : undefined);
  const keytool = javaHome ? join(javaHome, 'bin', 'keytool') : 'keytool';
  const pw = randomBytes(18).toString('base64url');
  const r = spawnSync(
    keytool,
    ['-genkeypair', '-v', '-keystore', jks, '-alias', 'mylovecoach', '-keyalg', 'RSA', '-keysize', '2048', '-validity', '10000', '-storepass', pw, '-keypass', pw, '-dname', 'CN=mylovecoach, O=mylovecoach, C=KR'],
    { stdio: ['ignore', 'ignore', 'inherit'], windowsHide: true },
  );
  if (r.status !== 0) {
    notes.push('Android 업로드 키 생성 실패: keytool 을 찾지 못했거나 오류 (JAVA_HOME 또는 wolha-tools/jdk-* 확인)');
  } else {
    writeFileSync(jksPw, `STORE=${pw}\nKEY=${pw}\nALIAS=mylovecoach\n`, { mode: 0o600 });
    console.log(`Android 업로드 키 생성: ${jks} + ${jksPw} (분실하면 앱 업데이트 불가 — USB 백업 필수)`);
  }
}
if (existsSync(jks) && existsSync(jksPw)) {
  const pw = entries(jksPw);
  Object.assign(secrets, {
    ANDROID_KEYSTORE_BASE64: readFileSync(jks).toString('base64'),
    ANDROID_KEYSTORE_PASSWORD: pw.STORE,
    ANDROID_KEY_ALIAS: pw.ALIAS || 'mylovecoach',
    ANDROID_KEY_PASSWORD: pw.KEY || pw.STORE,
  });
}

// ---- Play 서비스 계정 (선택) — Play Console 에서 이 앱에 권한을 줘야 동작
if (has('play-service-account.json')) {
  secrets.PLAY_SERVICE_ACCOUNT_JSON = readFileSync(join(root, 'play-service-account.json'), 'utf8');
} else {
  notes.push('없음: play-service-account.json → AAB 는 CI 산출물로 받아 콘솔에 수동 업로드');
}

// ---- 코치 서버 주소 (Vercel 배포 후)
const apiUrl = argOf('--api-url') ?? (has('mylovecoach-api-url.txt') ? readFileSync(join(root, 'mylovecoach-api-url.txt'), 'utf8').trim() : '');
if (/^https:\/\/\S+$/.test(apiUrl)) variables.EXPO_PUBLIC_API_URL = apiUrl.replace(/\/+$/, '');
else notes.push('EXPO_PUBLIC_API_URL 미설정 → --api-url https://... 로 지정 (Vercel 배포 주소). 없으면 앱은 개인 API 키 모드로만 동작');

// ---- Vercel 자동 배포용 (선택)
if (has('vercel-token.txt')) {
  const t = entries(join(root, 'vercel-token.txt')).VERCEL_TOKEN ?? readFileSync(join(root, 'vercel-token.txt'), 'utf8').trim();
  if (t) secrets.VERCEL_TOKEN = t;
} else notes.push('없음: vercel-token.txt → Vercel 배포는 대시보드에서 수동 (또는 vercel.com/account/tokens 발급 후 VERCEL_TOKEN=… 저장)');
const geminiKey = argOf('--gemini-key') ?? (has('gemini-api-key.txt') ? (entries(join(root, 'gemini-api-key.txt')).GEMINI_API_KEY ?? readFileSync(join(root, 'gemini-api-key.txt'), 'utf8').trim()) : '');
if (geminiKey) secrets.GEMINI_API_KEY = geminiKey;
else notes.push('없음: gemini-api-key.txt / --gemini-key → 서버 자동 배포 시 필요 (AI Studio 키)');

// ---- App Store Connect 에 번들 ID 등록 (앱을 만들려면 먼저 있어야 함)
async function registerBundleId() {
  if (!secrets.ASC_KEY_ID) return;
  const now = Math.floor(Date.now() / 1000);
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const unsigned = `${b64({ alg: 'ES256', kid: secrets.ASC_KEY_ID, typ: 'JWT' })}.${b64({ iss: secrets.ASC_ISSUER_ID, iat: now, exp: now + 1200, aud: 'appstoreconnect-v1' })}`;
  const sig = createSign('SHA256').update(unsigned).sign({ key: readFileSync(join(root, 'asc-key.p8')), dsaEncoding: 'ieee-p1363' }).toString('base64url');
  const jwt = `${unsigned}.${sig}`;
  const api = 'https://api.appstoreconnect.apple.com/v1/bundleIds';
  const headers = { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' };
  const list = await fetch(`${api}?filter[identifier]=${encodeURIComponent(BUNDLE_ID)}`, { headers });
  const listed = await list.json().catch(() => ({}));
  if (!list.ok) {
    notes.push(`번들 ID 조회 실패 (${list.status}): ${JSON.stringify(listed.errors?.[0]?.detail ?? '')}`);
    return;
  }
  if ((listed.data ?? []).some((d) => d.attributes?.identifier === BUNDLE_ID)) {
    console.log(`번들 ID 등록돼 있음: ${BUNDLE_ID}`);
    return;
  }
  const res = await fetch(api, { method: 'POST', headers, body: JSON.stringify({ data: { type: 'bundleIds', attributes: { identifier: BUNDLE_ID, name: 'mylovecoach', platform: 'IOS' } } }) });
  const body = await res.json().catch(() => ({}));
  if (res.ok) console.log(`번들 ID 등록 완료: ${BUNDLE_ID} → 이제 App Store Connect 에서 새 앱을 만들 때 선택할 수 있습니다`);
  else notes.push(`번들 ID 등록 실패 (${res.status}): ${JSON.stringify(body.errors?.[0]?.detail ?? '')} — developer.apple.com 에서 수동 등록`);
}

// ---- GitHub 에 등록
function gh(cmdArgs, input) {
  const r = spawnSync('gh', cmdArgs, { input, encoding: 'utf8', windowsHide: true });
  return !r.error && r.status === 0;
}
async function main() {
  if (!args.includes('--skip-bundle-id')) await registerBundleId();
  let ok = 0;
  for (const [name, value] of Object.entries(secrets)) {
    if (gh(['secret', 'set', name, '--repo', REPO], value)) {
      console.log(`시크릿 등록: ${name}`);
      ok++;
    } else console.error(`시크릿 등록 실패: ${name} (gh auth login · 저장소 권한 확인)`);
  }
  for (const [name, value] of Object.entries(variables)) {
    if (gh(['variable', 'set', name, '--repo', REPO, '--body', value])) console.log(`변수 등록: ${name} = ${value}`);
    else console.error(`변수 등록 실패: ${name}`);
  }
  console.log(`\n등록된 시크릿 ${ok}개.`);
  for (const n of notes) console.log(`· ${n}`);
  const iosReady = ['ASC_KEY_ID', 'ASC_ISSUER_ID', 'ASC_KEY_P8_BASE64', 'APPLE_TEAM_ID'].every((k) => secrets[k]) && (secrets.IOS_DISTRIBUTION_P12_BASE64 || secrets.IOS_CERT_PRIVATE_KEY_BASE64);
  const androidReady = Boolean(secrets.ANDROID_KEYSTORE_BASE64);
  console.log(`\niOS 빌드 준비: ${iosReady ? '완료 → gh workflow run ios.yml --repo ' + REPO : '미완료'}`);
  console.log(`Android 빌드 준비: ${androidReady ? '완료 → gh workflow run android.yml --repo ' + REPO : '미완료'}`);
}
main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
