// 실행: node tools/asc-submit.mjs [--submit] [--resubmit] [--secrets <폴더>]
// App Store 심사 제출 스크립트. 등록 정보·스크린샷은 건드리지 않는다.
//
// ⚠️ 기본은 「상태 보고만」 한다. 실제로 심사에 내려면 반드시 --submit 을 붙인다.
//    (예전에는 기본이 제출이라, 상태를 보려고 돌린 실행이나 감시 루프가 철회 직후의 낡은 빌드를
//     그대로 다시 제출한 사고가 있었다. 상태만 볼 때는 tools/asc-status.mjs 를 쓴다)
// --resubmit : 일부러 심사에서 뺀 버전(DEVELOPER_REJECTED)도 다시 낸다 (--submit 과 함께)
//
// 「앱이 수집하는 개인정보」 설문은 API 가 없어 화면에서만 게시할 수 있다.
// app-store-autosubmit.yml 이 --submit 으로 주기 실행하면, 설문을 게시하는 순간 다음 실행에서 제출된다.
//
// 종료 코드: 0 = 제출됨·이미 진행 중·사용자 작업 대기(정상), 1 = 예상 못 한 오류
// 결과 한 줄은 GITHUB_OUTPUT 의 state 로도 내보낸다:
//   ready(제출 가능, --submit 없음) | submitted | in_review | released | rejected | withdrawn | waiting_privacy | waiting_build | blocked | none
import { appendFileSync } from 'node:fs';

import { createAscClient, secretsRoot } from './lib/asc-api.mjs';
import { isTestOnlyBuild } from './lib/test-builds.mjs';

const args = process.argv.slice(2);
const { api, getAll, findApp } = createAscClient(secretsRoot(args));

// 처음 내는 버전만 자동으로 제출한다.
// 우리가 일부러 심사에서 뺀 버전(DEVELOPER_REJECTED)은 뺀 이유가 있으므로(빌드 교체·인앱결제 추가 등)
// --resubmit 을 명시했을 때만 다시 낸다. 그렇지 않으면 철회 직후 낡은 빌드가 그대로 다시 제출된다.
// READY_FOR_REVIEW 는 「심사 초안에 담겼지만 아직 안 낸」 상태다
const EDITABLE = ['PREPARE_FOR_SUBMISSION', 'READY_FOR_REVIEW', ...(args.includes('--resubmit') ? ['DEVELOPER_REJECTED'] : [])];
const WITHDRAWN = 'DEVELOPER_REJECTED';
// 애플이 거절한 버전은 고치지 않고 다시 내면 같은 사유로 또 거절된다 — 사람이 사유를 보고 고쳐야 한다
const REJECTED = ['REJECTED', 'METADATA_REJECTED', 'INVALID_BINARY'];
const IN_PROGRESS = ['WAITING_FOR_REVIEW', 'IN_REVIEW', 'PENDING_APPLE_RELEASE', 'PENDING_DEVELOPER_RELEASE', 'PROCESSING_FOR_APP_STORE', 'WAITING_FOR_EXPORT_COMPLIANCE'];
const RELEASED = ['READY_FOR_SALE', 'READY_FOR_DISTRIBUTION'];

const STATE_KO = {
  PREPARE_FOR_SUBMISSION: '제출 준비 중',
  READY_FOR_REVIEW: '심사 초안에 담김(미제출)',
  WAITING_FOR_REVIEW: '심사 대기',
  IN_REVIEW: '심사 중',
  PENDING_APPLE_RELEASE: '승인됨 · 애플 출시 처리 중',
  PENDING_DEVELOPER_RELEASE: '승인됨 · 출시 버튼 대기',
  PROCESSING_FOR_APP_STORE: '승인됨 · 앱스토어 반영 중',
  READY_FOR_SALE: '앱스토어 판매 중',
  READY_FOR_DISTRIBUTION: '앱스토어 판매 중',
  REJECTED: '심사 거절',
  METADATA_REJECTED: '등록 정보 거절',
  DEVELOPER_REJECTED: '제출 취소함',
  INVALID_BINARY: '빌드 오류',
};

function finish(state, message) {
  console.log(message);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `state=${state}\nmessage=${message.replace(/\n/g, ' ')}\n`);
}

async function main() {
  const app = await findApp();
  if (!app) return finish('none', 'App Store Connect 에 앱이 없습니다.');

  const versions = await getAll(`/v1/apps/${app.id}/appStoreVersions?filter[platform]=IOS&limit=10`);
  const stateOf = (v) => v.attributes.appStoreState ?? v.attributes.appVersionState;
  const summary = versions.map((v) => `${v.attributes.versionString}: ${STATE_KO[stateOf(v)] ?? stateOf(v)}`).join(', ');
  console.log(`앱: ${app.attributes.name} · 버전 ${summary || '없음'}`);

  const rejected = versions.find((v) => REJECTED.includes(stateOf(v)));
  if (rejected) {
    process.exitCode = 1; // 실패로 끝내 알림이 가게 한다
    return finish(
      'rejected',
      `버전 ${rejected.attributes.versionString} — ${STATE_KO[stateOf(rejected)]}. 자동으로 다시 내지 않습니다. App Store Connect → 앱 심사(Resolution Center)에서 사유를 확인하고 고친 뒤 제출하세요.`,
    );
  }

  const editable = versions.find((v) => EDITABLE.includes(stateOf(v)));
  if (!editable) {
    const busy = versions.find((v) => IN_PROGRESS.includes(stateOf(v)));
    if (busy) return finish('in_review', `버전 ${busy.attributes.versionString} — ${STATE_KO[stateOf(busy)]}. 할 일 없음.`);
    const live = versions.find((v) => RELEASED.includes(stateOf(v)));
    if (live) return finish('released', `버전 ${live.attributes.versionString} — 앱스토어에 출시돼 판매 중입니다.`);
    const withdrawn = versions.find((v) => stateOf(v) === WITHDRAWN);
    if (withdrawn)
      return finish(
        'withdrawn',
        `버전 ${withdrawn.attributes.versionString} — 일부러 심사에서 뺀 상태라 자동으로 다시 내지 않습니다. 새 빌드·인앱결제 연결을 마친 뒤 --resubmit 으로 제출하세요.`,
      );
    return finish('none', '제출할 수 있는 버전이 없습니다.');
  }

  // 버전에 연결된 빌드가 있어야 제출할 수 있다. 빌드 연결은 app-store.yml 이 맡는다.
  const build = await api('GET', `/v1/appStoreVersions/${editable.id}/build`).catch(() => null);
  if (!build?.data) return finish('waiting_build', `버전 ${editable.attributes.versionString} 에 빌드가 연결돼 있지 않습니다 — app-store.yml 로 빌드를 연결하세요.`);
  console.log(`제출할 버전: ${editable.attributes.versionString} · 빌드 ${build.data.attributes.version}`);

  // TestFlight 전용 무제한 테스트 빌드(ios.yml free_unlimited)는 App Store 에 내지 않는다 — 출시되면 모든 이용자가 결제 없이 무제한이 된다.
  // 표시를 확인하지 못하면(네트워크 오류 등) 안전하게 멈춘다
  const testOnly = await isTestOnlyBuild(getAll, build.data.id).catch(() => null);
  if (testOnly !== false)
    return finish(
      'blocked',
      testOnly
        ? `빌드 ${build.data.attributes.version} 은 TestFlight 전용 무제한 테스트 빌드라 App Store 에 낼 수 없습니다 — 일반 빌드(ios.yml, free_unlimited 끔)를 버전에 연결하세요.`
        : `빌드 ${build.data.attributes.version} 의 TestFlight 안내를 읽지 못해 멈춥니다 (무제한 테스트 빌드인지 확인 필요) — 잠시 뒤 다시 실행하세요.`,
    );

  // 여기서부터는 App Store 에 실제로 변화를 만든다 — 명시적으로 --submit 을 준 경우에만
  if (!args.includes('--submit'))
    return finish('ready', `버전 ${editable.attributes.versionString}(빌드 ${build.data.attributes.version}) 이 제출 가능 상태입니다. 실제로 내려면 --submit 을 붙여 실행하세요.`);

  // 심사 묶음: 아직 안 낸 것이 있으면 그걸 쓰고, 없으면 새로 만든다
  const open = await api('GET', `/v1/reviewSubmissions?filter[app]=${app.id}&filter[state]=READY_FOR_REVIEW,UNRESOLVED_ISSUES&filter[platform]=IOS`);
  const sub =
    open.data[0] ??
    (await api('POST', '/v1/reviewSubmissions', { data: { type: 'reviewSubmissions', attributes: { platform: 'IOS' }, relationships: { app: { data: { type: 'apps', id: app.id } } } } })).data;

  try {
    await api('POST', '/v1/reviewSubmissionItems', {
      data: {
        type: 'reviewSubmissionItems',
        relationships: { reviewSubmission: { data: { type: 'reviewSubmissions', id: sub.id } }, appStoreVersion: { data: { type: 'appStoreVersions', id: editable.id } } },
      },
    });
  } catch (e) {
    if (e.status !== 409) throw e;
    const items = await getAll(`/v1/reviewSubmissions/${sub.id}/items?include=appStoreVersion&limit=50`).catch(() => []);
    const already = items.some((it) => it.relationships?.appStoreVersion?.data?.id === editable.id);
    if (!already) {
      // 화면에서만 할 수 있는 항목이 남아 있다. 실패가 아니라 「사용자 작업 대기」다.
      if (/data usages/i.test(e.message))
        return finish('waiting_privacy', 'App Store Connect 의 「앱이 수집하는 개인정보」 설문이 아직 게시되지 않았습니다. 게시하면 다음 확인 때 자동으로 제출됩니다. (docs/APP_PRIVACY.md)');
      // 설문 말고 다른 이유로 막혔으면 사람이 봐야 하므로 실패로 끝내 알림이 가게 한다
      process.exitCode = 1;
      return finish('blocked', `심사 묶음에 넣지 못했습니다 — ${e.message}`);
    }
  }

  await api('PATCH', `/v1/reviewSubmissions/${sub.id}`, { data: { type: 'reviewSubmissions', id: sub.id, attributes: { submitted: true } } });
  finish('submitted', `버전 ${editable.attributes.versionString} 을 심사에 제출했습니다. 보통 1~2일 안에 결과가 나오고, 승인되면 자동으로 출시됩니다.`);
}

main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
