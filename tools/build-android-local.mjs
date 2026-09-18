// PC 에서 실행: node tools/build-android-local.mjs [--version-code 106] [--upload internal]
// GitHub Actions 없이 이 컴퓨터에서 서명된 AAB 를 만든다 (Actions 사용량·결제 한도와 무관).
// 필요한 것: wolha-tools/jdk-*, wolha-tools/android (SDK), wolha-secrets 의 업로드 키.
//   --upload <트랙>  : 빌드 후 Play 에 바로 올린다 (internal | alpha | beta | production)
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const argOf = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);
const secrets = process.env.MYLOVECOACH_SECRETS ?? join(homedir(), 'wolha-secrets');
const tools = process.env.WOLHA_TOOLS ?? join(homedir(), 'wolha-tools');

const javaHome = process.env.JAVA_HOME ?? readdirSync(tools).filter((d) => d.startsWith('jdk-')).map((d) => join(tools, d))[0];
const androidHome = process.env.ANDROID_HOME ?? join(tools, 'android');
for (const [label, p] of [['JDK', javaHome], ['Android SDK', androidHome]]) {
  if (!p || !existsSync(p)) {
    console.error(`${label} 를 찾지 못했습니다: ${p}`);
    process.exit(1);
  }
}

const entries = (file) =>
  Object.fromEntries(
    readFileSync(file, 'utf8')
      .split(/\r?\n/)
      .filter((l) => /^[A-Z_]+\s*=/.test(l.trim()))
      .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
  );

const jks = join(secrets, 'mylovecoach-upload.jks');
const jksPw = join(secrets, 'mylovecoach-keystore-password.txt');
if (!existsSync(jks) || !existsSync(jksPw)) {
  console.error(`업로드 키가 없습니다: ${jks} — 먼저 node tools/set-ci-secrets.mjs 를 실행하세요.`);
  process.exit(1);
}
const pw = entries(jksPw);
const apiUrlFile = join(secrets, 'mylovecoach-api-url.txt');
const apiUrl = process.env.EXPO_PUBLIC_API_URL ?? (existsSync(apiUrlFile) ? readFileSync(apiUrlFile, 'utf8').trim() : '');
const appTokenFile = join(secrets, 'mylovecoach-app-token.txt');
const appToken = existsSync(appTokenFile) ? entries(appTokenFile).EXPO_PUBLIC_API_TOKEN : '';
const versionCode = argOf('--version-code', String(Math.floor(Date.now() / 1000 / 60) % 2000000));

const env = {
  ...process.env,
  JAVA_HOME: javaHome,
  ANDROID_HOME: androidHome,
  ANDROID_SDK_ROOT: androidHome,
  EXPO_PUBLIC_API_URL: apiUrl,
  EXPO_PUBLIC_API_TOKEN: appToken,
  ANDROID_KEYSTORE_PATH: jks,
  ANDROID_KEYSTORE_PASSWORD: pw.STORE,
  ANDROID_KEY_ALIAS: pw.ALIAS || 'mylovecoach',
  ANDROID_KEY_PASSWORD: pw.KEY || pw.STORE,
  ANDROID_VERSION_CODE: versionCode,
};

const run = (label, cmd, cmdArgs, opts = {}) => {
  console.log(`\n▶ ${label}`);
  const r = spawnSync(cmd, cmdArgs, { cwd: repo, env, stdio: 'inherit', shell: true, windowsHide: true, ...opts });
  if (r.status !== 0) {
    console.error(`✗ ${label} 실패 (종료 코드 ${r.status})`);
    process.exit(1);
  }
};

console.log(`빌드 설정 · versionCode ${versionCode} · 서버 ${apiUrl || '(없음 — 개인 키 모드)'}`);
run('네이티브 프로젝트 생성 (expo prebuild)', 'npx', ['expo', 'prebuild', '--platform', 'android', '--no-install']);
run('release 서명 주입', 'node', ['tools/android-signing.mjs']);
const androidDir = join(repo, 'android');
const gradleArgs = ['bundleRelease', '--no-daemon', '--console=plain'];
// Windows 에서는 cmd 로 gradlew.bat 을 직접 부른다 (셸이 역슬래시를 먹는 문제 회피)
if (process.platform === 'win32') run('AAB 빌드 (Gradle)', 'cmd', ['/c', join(androidDir, 'gradlew.bat'), ...gradleArgs], { cwd: androidDir, shell: false });
else run('AAB 빌드 (Gradle)', './gradlew', gradleArgs, { cwd: androidDir });

const aab = join(repo, 'android', 'app', 'build', 'outputs', 'bundle', 'release', 'app-release.aab');
if (!existsSync(aab)) {
  console.error('AAB 가 생성되지 않았습니다.');
  process.exit(1);
}
// 디버그 키로 서명되면 Play 가 거부하므로 확인한다
const cert = spawnSync(join(javaHome, 'bin', 'keytool'), ['-printcert', '-jarfile', aab], { encoding: 'utf8', windowsHide: true });
if (/Android Debug/.test(cert.stdout ?? '')) {
  console.error('✗ 디버그 키로 서명됐습니다 (tools/android-signing.mjs 확인)');
  process.exit(1);
}
console.log(`\n✓ 빌드 완료: ${aab}`);
console.log(`  서명: ${(cert.stdout ?? '').split(/\r?\n/).find((l) => /소유자|Owner/.test(l))?.trim()}`);

const track = argOf('--upload');
if (track) run(`Play 업로드 (${track})`, 'node', ['tools/play-upload.mjs', aab, '--track', track, '--status', 'completed']);
