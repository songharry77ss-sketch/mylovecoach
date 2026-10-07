// 실행: node tools/asc-release.mjs [--manual | --after-approval] [--secrets <폴더>]
// App Store 버전의 심사 상태와 「버전 출시」 방식(승인 즉시 자동 출시 / 수동 출시)을 보여 주고, 옵션을 주면 바꾼다.
// 심사에 낸 빌드가 출시되면 안 되는 경우(예: 116 에는 AI 분석 동의가 없음) --manual 로 승인돼도 출시되지 않게 막는다.
import { createAscClient, secretsRoot } from './lib/asc-api.mjs';

const args = process.argv.slice(2);
const { api, getAll, findApp } = createAscClient(secretsRoot(args));
const want = args.includes('--manual') ? 'MANUAL' : args.includes('--after-approval') ? 'AFTER_APPROVAL' : null;

async function main() {
  const app = await findApp();
  if (!app) throw new Error('App Store Connect 에 앱이 없습니다.');
  const versions = await getAll(`/v1/apps/${app.id}/appStoreVersions?filter[platform]=IOS&limit=10`);
  const live = versions.filter((v) => v.attributes.appStoreState !== 'READY_FOR_SALE' && v.attributes.appStoreState !== 'REPLACED_WITH_NEW_VERSION');
  if (!live.length) {
    console.log('심사 중이거나 준비 중인 버전이 없습니다.');
    return;
  }
  for (const v of live) {
    const build = await api('GET', `/v1/appStoreVersions/${v.id}/build`).catch(() => null);
    const a = v.attributes;
    console.log(`버전 ${a.versionString} — 상태 ${a.appStoreState} · 출시 방식 ${a.releaseType} · 빌드 ${build?.data?.attributes?.version ?? '없음'}`);
    if (want && a.releaseType !== want) {
      await api('PATCH', `/v1/appStoreVersions/${v.id}`, { data: { type: 'appStoreVersions', id: v.id, attributes: { releaseType: want } } });
      const after = await api('GET', `/v1/appStoreVersions/${v.id}`);
      console.log(`  → 출시 방식을 ${after.data.attributes.releaseType} 로 바꿨습니다.`);
    }
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
