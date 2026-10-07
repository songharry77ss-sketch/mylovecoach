// TestFlight 전용 무제한 테스트 빌드를 테스터에게 내보낸다 — ios.yml 을 free_unlimited 로 돌리면 업로드 뒤에 자동으로 실행된다.
// PC 에서 실행: node tools/asc-test-build.mjs --build 118 [--group "테스터"] [--wait 45] [--secrets <폴더>]
//
// 하는 일 (이 빌드 하나만 건드린다 — 베타 앱 설명·심사 정보·다른 빌드는 그대로)
//   1. 빌드 처리가 끝날 때까지 기다린다 (--wait 분, 기본 45)
//   2. 「테스트할 내용」 끝에 TestFlight 전용 태그를 달고, 다시 읽어 태그가 붙은 것을 확인한다 — 확인 못 하면 여기서 실패로 멈춘다(배포하지 않음)
//   3. 외부 테스트 그룹(기본 「테스터」)과 내부 테스트 그룹에 연결하고, 외부 그룹을 위해 베타 심사에 낸다
// 어느 단계든 실패하면 종료 코드 1 (ios.yml 실행도 실패로 보인다)
import { createAscClient, secretsRoot, step } from './lib/asc-api.mjs';
import { TEST_BUILD_NOTES, TEST_BUILD_TAG, isTestOnlyBuild } from './lib/test-builds.mjs';

const args = process.argv.slice(2);
const argOf = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);
const { api, getAll, findApp } = createAscClient(secretsRoot(args));

const BUILD = argOf('--build');
const GROUP = argOf('--group', '테스터');
const WAIT_MIN = Number(argOf('--wait', '45')) || 0;

async function findBuild(appId) {
  const versions = await getAll(`/v1/preReleaseVersions?filter[app]=${appId}&filter[platform]=IOS&limit=10`);
  for (const v of versions) {
    const hit = (await getAll(`/v1/preReleaseVersions/${v.id}/builds?limit=50`)).find((b) => b.attributes.version === String(BUILD));
    if (hit) return hit;
  }
  return null;
}

/** 「테스트할 내용」에 태그 달기 (한국어 안내는 통째로, 다른 언어 안내는 앞에 태그만) */
async function writeTag(buildId) {
  const locs = await getAll(`/v1/builds/${buildId}/betaBuildLocalizations?limit=50`);
  const ko = locs.find((l) => l.attributes.locale === 'ko');
  if (ko) await api('PATCH', `/v1/betaBuildLocalizations/${ko.id}`, { data: { type: 'betaBuildLocalizations', id: ko.id, attributes: { whatsNew: TEST_BUILD_NOTES } } });
  else
    await api('POST', '/v1/betaBuildLocalizations', {
      data: { type: 'betaBuildLocalizations', attributes: { locale: 'ko', whatsNew: TEST_BUILD_NOTES }, relationships: { build: { data: { type: 'builds', id: buildId } } } },
    });
  for (const l of locs.filter((x) => x.attributes.locale !== 'ko' && !(x.attributes.whatsNew ?? '').includes(TEST_BUILD_TAG))) {
    await api('PATCH', `/v1/betaBuildLocalizations/${l.id}`, { data: { type: 'betaBuildLocalizations', id: l.id, attributes: { whatsNew: `${l.attributes.whatsNew ?? ''}\n\n${TEST_BUILD_TAG}`.trim() } } });
  }
}

async function main() {
  if (!BUILD) throw new Error('--build <빌드 번호> 가 필요합니다');
  const app = await findApp();
  if (!app) throw new Error('App Store Connect 에 앱이 없습니다');

  // 1) 처리 완료 대기 — 처리 중인 빌드는 목록에 늦게 나타나므로 같은 방식으로 다시 찾는다
  const deadline = Date.now() + WAIT_MIN * 60_000;
  let build = null;
  for (;;) {
    build = await findBuild(app.id);
    if (build?.attributes.processingState === 'VALID') break;
    if (build && ['FAILED', 'INVALID'].includes(build.attributes.processingState)) throw new Error(`빌드 ${BUILD} 처리 실패: ${build.attributes.processingState}`);
    if (Date.now() >= deadline) throw new Error(`빌드 ${BUILD} 가 ${WAIT_MIN}분 안에 처리되지 않았습니다 (${build ? build.attributes.processingState : '목록에 없음'}) — 처리가 끝나면 이 도구를 다시 실행하세요`);
    console.log(`  · 빌드 ${BUILD} 처리 대기 중 (${build ? build.attributes.processingState : '아직 목록에 없음'}) …`);
    await new Promise((r) => setTimeout(r, 30_000));
  }

  // 2) TestFlight 전용 태그 — 다시 읽어 확인될 때까지는 어느 그룹에도 내보내지 않는다
  await writeTag(build.id);
  if ((await isTestOnlyBuild(getAll, build.id)) !== true) throw new Error(`빌드 ${BUILD} 에 TestFlight 전용 태그가 확인되지 않아 배포하지 않습니다 — 다시 실행하세요`);
  console.log(`✓ 빌드 ${BUILD} 에 TestFlight 전용 태그 ${TEST_BUILD_TAG} 확인`);

  // 3) 그룹 연결 + 베타 심사 — 실패를 모아 끝에 종료 코드로 알린다
  const failures = [];
  const groups = await getAll(`/v1/apps/${app.id}/betaGroups?limit=100`);
  const external = groups.find((g) => g.attributes.name === GROUP);
  if (!external) throw new Error(`테스트 그룹 「${GROUP}」 이 없습니다`);
  const targets = [external, ...groups.filter((g) => g.attributes.isInternalGroup && g.id !== external.id)];
  const inGroup = await getAll(`/v1/builds/${build.id}/betaGroups?limit=50`).catch(() => []);
  for (const g of targets) {
    const ok = await step(`빌드 ${BUILD} 를 「${g.attributes.name}」 에 연결`, async () => {
      if (inGroup.some((x) => x.id === g.id)) return '이미 연결됨';
      await api('POST', `/v1/builds/${build.id}/relationships/betaGroups`, { data: [{ type: 'betaGroups', id: g.id }] });
      return g.attributes.isInternalGroup ? '내부 그룹 — 바로 설치 가능' : '외부 그룹 — 베타 심사 통과 뒤 설치 가능';
    });
    if (ok === false) failures.push(`「${g.attributes.name}」 연결`);
  }
  if (!external.attributes.isInternalGroup) {
    const ok = await step(`빌드 ${BUILD} 베타 심사 제출`, async () => {
      const cur = await api('GET', `/v1/builds/${build.id}/betaAppReviewSubmission`).catch(() => null);
      if (cur?.data) return `이미 제출됨 (${cur.data.attributes.betaReviewState})`;
      const res = await api('POST', '/v1/betaAppReviewSubmissions', { data: { type: 'betaAppReviewSubmissions', relationships: { build: { data: { type: 'builds', id: build.id } } } } });
      return `${res.data.attributes.betaReviewState} — 승인되면 테스터가 새 빌드를 받습니다`;
    });
    if (ok === false) failures.push('베타 심사 제출 (같은 버전의 다른 빌드가 심사 중이면 그 빌드가 끝난 뒤 다시 실행)');
  }
  const detail = await api('GET', `/v1/builds/${build.id}/buildBetaDetail`).catch(() => null);
  const state = detail?.data?.attributes?.externalBuildState ?? '?';
  console.log(`\n빌드 ${BUILD}: 외부 테스트 ${state}`);
  if (process.env.GITHUB_OUTPUT) {
    const { appendFileSync } = await import('node:fs');
    appendFileSync(process.env.GITHUB_OUTPUT, `external_state=${state}\nfailures=${failures.join(' / ')}\n`);
  }
  if (failures.length) {
    console.error(`실패: ${failures.join(' / ')}`);
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
