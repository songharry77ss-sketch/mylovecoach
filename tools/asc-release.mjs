// 실행: node tools/asc-release.mjs [--manual | --after-approval] [--withdraw] [--secrets <폴더>]
// App Store 버전의 심사 상태와 「버전 출시」 방식(승인 즉시 자동 출시 / 수동 출시)을 보여 주고, 옵션을 주면 바꾼다.
// 심사에 낸 빌드가 출시되면 안 되는 경우(예: 116 에는 AI 분석 동의가 없음) --manual 로 승인돼도 출시되지 않게 막는다.
// --withdraw : 심사 대기·심사 중인 제출을 취소한다(「심사에서 제거」). 버전은 DEVELOPER_REJECTED 가 되어
//              빌드를 바꾼 뒤 node tools/asc-listing.mjs --build <번호> --submit 으로 다시 낸다.
//              승인돼 「출시 버튼 대기」(PENDING_DEVELOPER_RELEASE)인 버전은 API 로 못 빼고(404) 웹 화면에서 빼야 한다 — 방법을 안내만 한다.
import { createAscClient, secretsRoot } from './lib/asc-api.mjs';

const args = process.argv.slice(2);
const { api, getAll, findApp } = createAscClient(secretsRoot(args));
const want = args.includes('--manual') ? 'MANUAL' : args.includes('--after-approval') ? 'AFTER_APPROVAL' : null;

async function main() {
  const app = await findApp();
  if (!app) throw new Error('App Store Connect 에 앱이 없습니다.');
  if (args.includes('--withdraw')) {
    const subs = await getAll(`/v1/reviewSubmissions?filter[app]=${app.id}&filter[platform]=IOS&filter[state]=WAITING_FOR_REVIEW,IN_REVIEW&limit=10`);
    if (!subs.length) console.log('취소할 심사 제출이 없습니다.');
    for (const s of subs) {
      await api('PATCH', `/v1/reviewSubmissions/${s.id}`, { data: { type: 'reviewSubmissions', id: s.id, attributes: { canceled: true } } });
      console.log(`심사 제출 ${s.id.slice(0, 8)}… (${s.attributes.state}) 을 취소했습니다.`);
    }
    // 승인돼 출시 버튼을 기다리는 버전(PENDING_DEVELOPER_RELEASE)은 API 로 뺄 수 없다 — 끝난(COMPLETE) 묶음의 항목을
    // removed 로 고치려 하면 404 (2026-10-08 확인). 웹 화면에서만 뺄 수 있다
    const pending = (await getAll(`/v1/apps/${app.id}/appStoreVersions?filter[platform]=IOS&limit=10`)).filter((v) => v.attributes.appStoreState === 'PENDING_DEVELOPER_RELEASE');
    for (const v of pending)
      console.log(
        `버전 ${v.attributes.versionString} 은 승인돼 출시 버튼을 기다리는 중이라 API 로 뺄 수 없습니다 — App Store Connect 웹 → 앱 → 버전 페이지 위 안내의 「심사에서 이 버전 제거」 → 제거. ` +
          '그 뒤 node tools/asc-listing.mjs --build <번호> --submit (심사는 처음부터 다시 받습니다)',
      );
    // 취소는 비동기로 처리된다 — 버전 상태가 바뀔 때까지 잠깐 기다린다
    for (let i = 0; subs.length && i < 12; i += 1) {
      const vs = await getAll(`/v1/apps/${app.id}/appStoreVersions?filter[platform]=IOS&limit=10`);
      if (!vs.some((v) => ['WAITING_FOR_REVIEW', 'IN_REVIEW'].includes(v.attributes.appStoreState))) break;
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
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
