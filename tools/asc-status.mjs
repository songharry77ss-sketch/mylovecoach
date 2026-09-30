// 실행: node tools/asc-status.mjs [--secrets <폴더>]
// App Store Connect / TestFlight 의 현재 상태를 읽기만 한다 (변경 없음).
// 빌드별 처리·베타 심사 상태, 테스트 그룹, 공개 초대 링크를 한 번에 보여 준다.
// 「아이폰에서 지금 설치 되나?」를 확인하는 용도.
import { createAscClient, secretsRoot } from './lib/asc-api.mjs';

const args = process.argv.slice(2);
const { api, getAll, findApp } = createAscClient(secretsRoot(args));

async function main() {
  const app = await findApp();
  if (!app) {
    console.log('App Store Connect 에 앱이 없습니다.');
    process.exitCode = 2;
    return;
  }
  console.log(`앱: ${app.attributes.name} (${app.attributes.bundleId})\n`);

  // 빌드 — 처리 중인 것까지 보려면 preReleaseVersions 로 조회해야 한다
  const versions = await getAll(`/v1/preReleaseVersions?filter[app]=${app.id}&filter[platform]=IOS&limit=10`);
  const builds = [];
  for (const v of versions) builds.push(...(await getAll(`/v1/preReleaseVersions/${v.id}/builds?limit=20`)));
  builds.sort((x, y) => Number(y.attributes.version) - Number(x.attributes.version));

  console.log('빌드 (최신순)');
  let installable = null;
  for (const b of builds.slice(0, 6)) {
    const sub = await api('GET', `/v1/builds/${b.id}/betaAppReviewSubmission`).catch(() => null);
    const review = sub?.data?.attributes?.betaReviewState ?? '미제출';
    const expired = b.attributes.expired ? ' · 만료됨' : '';
    if (!installable && review === 'APPROVED' && b.attributes.processingState === 'VALID' && !b.attributes.expired) installable = b.attributes.version;
    console.log(`  · ${b.attributes.version} — 처리 ${b.attributes.processingState} · 베타 심사 ${review}${expired}`);
  }
  if (!builds.length) console.log('  (없음)');

  console.log('\n테스트 그룹');
  const groups = await getAll(`/v1/apps/${app.id}/betaGroups?limit=100`);
  for (const g of groups) {
    const a = g.attributes;
    const gb = await getAll(`/v1/betaGroups/${g.id}/builds?limit=20`).catch(() => []);
    const testers = await getAll(`/v1/betaGroups/${g.id}/betaTesters?limit=200`).catch(() => []);
    console.log(`  · ${a.name} (${a.isInternalGroup ? '내부' : '외부'}) — 테스터 ${testers.length}명 · 빌드 ${gb.map((b) => b.attributes.version).join(', ') || '없음'}`);
    if (!a.isInternalGroup) {
      console.log(`      공개 초대 링크: ${a.publicLinkEnabled ? a.publicLink : '꺼짐'}${a.publicLinkEnabled && a.publicLinkLimitEnabled ? ` (최대 ${a.publicLinkLimit}명)` : ''}`);
    }
  }

  console.log('\n지금 아이폰에서 설치 가능한 빌드:', installable ?? '없음 — 베타 심사 승인된 빌드가 필요합니다');
  const external = groups.find((g) => !g.attributes.isInternalGroup && g.attributes.publicLinkEnabled);
  if (installable && external) console.log('테스터에게 줄 링크:', external.attributes.publicLink);
}

main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
