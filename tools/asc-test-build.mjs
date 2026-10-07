// TestFlight 전용 무제한 테스트 빌드를 테스터에게 내보낸다 — ios.yml 을 free_unlimited 로 돌리면 업로드 뒤에 자동으로 실행된다.
// PC 에서 실행: node tools/asc-test-build.mjs --build 118 [--group "테스터"] [--wait 45] [--secrets <폴더>]
//
// 하는 일 (이 빌드 하나만 건드린다 — 베타 앱 설명·심사 정보·다른 빌드는 그대로)
//   1. 빌드 처리가 끝날 때까지 기다린다 (--wait 분, 기본 45)
//   2. 「테스트할 내용」에 TestFlight 전용 표시를 단다 → asc-listing.mjs · asc-submit.mjs 가 이 빌드를 App Store 버전에 붙이거나 제출하지 않는다
//   3. 외부 테스트 그룹에 연결하고 베타 심사에 낸다 (승인되면 그룹 테스터에게 새 빌드 알림)
import { createAscClient, secretsRoot, step } from './lib/asc-api.mjs';
import { TEST_BUILD_MARKER } from './lib/test-builds.mjs';

const args = process.argv.slice(2);
const argOf = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);
const { api, getAll, findApp } = createAscClient(secretsRoot(args));

const BUILD = argOf('--build');
const GROUP = argOf('--group', '테스터');
const WAIT_MIN = Number(argOf('--wait', '45')) || 0;
const NOTES = `${TEST_BUILD_MARKER}\n횟수 제한·결제 화면 없이 모든 기능을 써 볼 수 있는 테스트 버전이에요. 코칭 답장이 자연스러운지, 불편한 점은 없는지 알려주세요.`;

async function findBuild(appId) {
  const versions = await getAll(`/v1/preReleaseVersions?filter[app]=${appId}&filter[platform]=IOS&limit=10`);
  for (const v of versions) {
    const hit = (await getAll(`/v1/preReleaseVersions/${v.id}/builds?limit=50`)).find((b) => b.attributes.version === String(BUILD));
    if (hit) return hit;
  }
  return null;
}

async function main() {
  if (!BUILD) {
    console.log('--build <빌드 번호> 가 필요합니다');
    process.exitCode = 2;
    return;
  }
  const app = await findApp();
  if (!app) throw new Error('App Store Connect 에 앱이 없습니다');

  // 1) 처리 완료 대기 — 처리 중인 빌드는 목록에 늦게 나타나므로 같은 방식으로 다시 찾는다
  const deadline = Date.now() + WAIT_MIN * 60_000;
  let build = null;
  for (;;) {
    build = await findBuild(app.id);
    if (build?.attributes.processingState === 'VALID') break;
    if (build && ['FAILED', 'INVALID'].includes(build.attributes.processingState)) throw new Error(`빌드 ${BUILD} 처리 실패: ${build.attributes.processingState}`);
    if (Date.now() >= deadline) throw new Error(`빌드 ${BUILD} 가 ${WAIT_MIN}분 안에 처리되지 않았습니다 (${build ? build.attributes.processingState : '목록에 없음'}) — 나중에 이 도구를 다시 실행하세요`);
    console.log(`  · 빌드 ${BUILD} 처리 대기 중 (${build ? build.attributes.processingState : '아직 목록에 없음'}) …`);
    await new Promise((r) => setTimeout(r, 30_000));
  }

  // 2) TestFlight 전용 표시 — 테스터가 보는 「테스트할 내용」 첫 줄
  await step(`빌드 ${BUILD} 에 TestFlight 전용 표시`, async () => {
    const locs = await getAll(`/v1/builds/${build.id}/betaBuildLocalizations?limit=50`);
    const ko = locs.find((l) => l.attributes.locale === 'ko');
    if (ko) await api('PATCH', `/v1/betaBuildLocalizations/${ko.id}`, { data: { type: 'betaBuildLocalizations', id: ko.id, attributes: { whatsNew: NOTES } } });
    else
      await api('POST', '/v1/betaBuildLocalizations', {
        data: { type: 'betaBuildLocalizations', attributes: { locale: 'ko', whatsNew: NOTES }, relationships: { build: { data: { type: 'builds', id: build.id } } } },
      });
    // 다른 언어 안내가 있으면 거기에도 같은 표시를 단다 (도구는 어느 언어든 표시가 있으면 거부한다)
    for (const l of locs.filter((x) => x.attributes.locale !== 'ko' && !(x.attributes.whatsNew ?? '').includes(TEST_BUILD_MARKER))) {
      await api('PATCH', `/v1/betaBuildLocalizations/${l.id}`, { data: { type: 'betaBuildLocalizations', id: l.id, attributes: { whatsNew: `${TEST_BUILD_MARKER}\n${l.attributes.whatsNew ?? ''}`.trim() } } });
    }
    return '「테스트할 내용」 첫 줄';
  });

  // 3) 외부 그룹에 연결 + 베타 심사
  const group = (await getAll(`/v1/apps/${app.id}/betaGroups?limit=100`)).find((g) => g.attributes.name === GROUP);
  if (!group) throw new Error(`테스트 그룹 「${GROUP}」 이 없습니다`);
  await step(`빌드 ${BUILD} 를 「${GROUP}」 에 연결`, async () => {
    const inGroup = await getAll(`/v1/builds/${build.id}/betaGroups?limit=50`).catch(() => []);
    if (inGroup.some((g) => g.id === group.id)) return '이미 연결됨';
    await api('POST', `/v1/builds/${build.id}/relationships/betaGroups`, { data: [{ type: 'betaGroups', id: group.id }] });
    return group.attributes.isInternalGroup ? '내부 그룹 — 바로 설치 가능' : '외부 그룹 — 베타 심사 통과 뒤 설치 가능';
  });
  if (!group.attributes.isInternalGroup) {
    await step(`빌드 ${BUILD} 베타 심사 제출`, async () => {
      const cur = await api('GET', `/v1/builds/${build.id}/betaAppReviewSubmission`).catch(() => null);
      if (cur?.data) return `이미 제출됨 (${cur.data.attributes.betaReviewState})`;
      try {
        const res = await api('POST', '/v1/betaAppReviewSubmissions', { data: { type: 'betaAppReviewSubmissions', relationships: { build: { data: { type: 'builds', id: build.id } } } } });
        return `${res.data.attributes.betaReviewState} — 승인되면 테스터가 새 빌드를 받습니다`;
      } catch (e) {
        if (/same train is already in beta review/i.test(e.message)) return '같은 버전의 다른 빌드가 심사 중 — 그 빌드가 끝난 뒤 다시 실행하세요';
        throw e;
      }
    });
  }
  const detail = await api('GET', `/v1/builds/${build.id}/buildBetaDetail`).catch(() => null);
  console.log(`\n빌드 ${BUILD}: 외부 테스트 ${detail?.data?.attributes?.externalBuildState ?? '?'} · 「${GROUP}」`);
}

main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
