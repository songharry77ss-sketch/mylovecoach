// CI 전용: expo prebuild 로 생성된 android/app/build.gradle 에 release 서명 설정과 versionCode 를 주입한다.
// 환경변수: ANDROID_KEYSTORE_PATH, ANDROID_KEYSTORE_PASSWORD, ANDROID_KEY_ALIAS, ANDROID_KEY_PASSWORD, ANDROID_VERSION_CODE(선택)
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const gradle = 'android/app/build.gradle';
if (!existsSync(gradle)) {
  console.error(`${gradle} 이 없습니다. 먼저 npx expo prebuild --platform android 를 실행하세요.`);
  process.exit(1);
}
const required = ['ANDROID_KEYSTORE_PATH', 'ANDROID_KEYSTORE_PASSWORD', 'ANDROID_KEY_ALIAS', 'ANDROID_KEY_PASSWORD'];
for (const name of required) {
  if (!process.env[name]) {
    console.error(`환경변수 누락: ${name}`);
    process.exit(1);
  }
}
let src = readFileSync(gradle, 'utf8');

const releaseConfig = `
        release {
            storeFile file(System.getenv("ANDROID_KEYSTORE_PATH"))
            storePassword System.getenv("ANDROID_KEYSTORE_PASSWORD")
            keyAlias System.getenv("ANDROID_KEY_ALIAS")
            keyPassword System.getenv("ANDROID_KEY_PASSWORD")
        }`;
if (!src.includes('storeFile file(System.getenv("ANDROID_KEYSTORE_PATH"))')) {
  src = src.replace(/signingConfigs\s*\{/, (m) => `${m}${releaseConfig}`);
}
// buildTypes.release 의 debug 서명을 release 서명으로 교체 (prebuild 기본값은 debug 키)
src = src.replace(/(buildTypes\s*\{[\s\S]*?release\s*\{[\s\S]*?)signingConfig signingConfigs\.debug/, '$1signingConfig signingConfigs.release');

const versionCode = process.env.ANDROID_VERSION_CODE;
if (versionCode && /^\d+$/.test(versionCode)) {
  src = src.replace(/versionCode\s+\d+/, `versionCode ${versionCode}`);
}
writeFileSync(gradle, src);
console.log(`release 서명 주입 완료${versionCode ? ` · versionCode ${versionCode}` : ''}`);
