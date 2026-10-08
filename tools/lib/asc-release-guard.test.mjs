import assert from 'node:assert/strict';
import { test } from 'node:test';

import { assertReleaseTarget, findEditableVersion, findTargetBuild, linkAndVerifyBuild, readWhatsNew } from './asc-release-guard.mjs';

const version = (number = '1.0.2', state = 'PREPARE_FOR_SUBMISSION', id = 'target-version') => ({ id, attributes: { versionString: number, appStoreState: state } });
const build = (number = '122', state = 'VALID', expired = false, id = 'target-build') => ({ id, attributes: { version: number, processingState: state, expired } });

test('해당 앱 버전의 새 소식만 읽고 Play 문구·다른 섹션은 제외한다', () => {
  const markdown = '## 이번 버전의 새로운 기능 (1.0.2 초안)\r\n\r\n- 선택 가입 추가\r\n- 코칭 개선\r\n\r\n## Google Play 출시 노트\r\n```text\r\n다른 문구\r\n```';
  assert.equal(readWhatsNew(markdown, '1.0.2'), '· 선택 가입 추가\n· 코칭 개선');
});

test('다른 버전·빈 새 소식·내부 안내는 출시 문구로 사용하지 않는다', () => {
  assert.throws(() => readWhatsNew('## 이번 버전의 새로운 기능 (1.0.20 초안)\n- 다른 버전', '1.0.2'), /새 소식이 없어/);
  assert.throws(() => readWhatsNew('## 이번 버전의 새로운 기능 (1.0.2 초안)\n\n## 다음 항목', '1.0.2'), /bullet/);
  assert.throws(() => readWhatsNew('## 이번 버전의 새로운 기능 (1.0.2)\n내부 검토 메모', '1.0.2'), /bullet/);
});

test('앞에 있는 다른 편집 가능 버전 대신 app.json과 같은 버전만 고른다', () => {
  const wanted = version();
  assert.equal(findEditableVersion([version('1.0.1', 'DEVELOPER_REJECTED', 'old-version'), wanted], '1.0.2'), wanted);
});

for (const state of ['WAITING_FOR_REVIEW', 'IN_REVIEW', 'PENDING_DEVELOPER_RELEASE', 'READY_FOR_SALE']) {
  test(`같은 번호가 ${state}이면 다른 초안으로 대체하지 않고 중단한다`, () => {
    assert.throws(() => findEditableVersion([version('1.0.2', state), version('1.0.3', 'PREPARE_FOR_SUBMISSION', 'other')], '1.0.2'), /편집 가능/);
  });
}

test('원하는 번호가 없으면 다른 준비·심사 버전을 수정하지 않는다', () => {
  assert.throws(() => findEditableVersion([version('1.0.1', 'WAITING_FOR_REVIEW')], '1.0.2'), /기존 버전을 바꾸지 않고/);
  assert.throws(() => findEditableVersion([version('1.0.1', 'PREPARE_FOR_SUBMISSION')], '1.0.2'), /기존 버전을 바꾸지 않고/);
});

test('지난 버전이 모두 출시된 경우에만 새 버전을 만들 수 있다', () => {
  assert.equal(findEditableVersion([version('1.0.1', 'READY_FOR_SALE')], '1.0.2'), null);
  assert.equal(findEditableVersion([], '1.0.2'), null);
  assert.throws(() => findEditableVersion([version(), version('1.0.2', 'DEVELOPER_REJECTED', 'duplicate')], '1.0.2'), /여러 개/);
});

function buildListing(currentBuilds) {
  const calls = [];
  const getAll = async (path) => {
    calls.push(path);
    if (path.startsWith('/v1/preReleaseVersions?')) return [
      { id: 'old-train', attributes: { version: '1.0.1' } },
      { id: 'target-train', attributes: { version: '1.0.2' } },
    ];
    if (path.startsWith('/v1/preReleaseVersions/target-train/builds')) return currentBuilds;
    throw new Error('다른 앱 버전의 빌드를 조회하면 안 됩니다.');
  };
  return { getAll, calls, appId: 'app', versionString: '1.0.2' };
}

test('지정 빌드는 해당 앱 버전에서만 찾는다', async () => {
  const source = buildListing([build('122'), build('123')]);
  assert.equal((await findTargetBuild({ ...source, buildNumber: '122' })).build.attributes.version, '122');
  assert.equal((await findTargetBuild({ ...source, buildNumber: '121' })).build, null);
  assert.equal(source.calls.some((path) => path.includes('old-train')), false);
});

test('최신 빌드가 처리 중이면 이전 유효 빌드로 대신하지 않는다', async () => {
  const result = await findTargetBuild(buildListing([build('122'), build('123', 'PROCESSING')]));
  assert.equal(result.target.attributes.version, '123');
  assert.equal(result.build, null);
});

test('만료되거나 중복된 빌드는 고르지 않는다', async () => {
  assert.equal((await findTargetBuild({ ...buildListing([build('122', 'VALID', true)]), buildNumber: '122' })).build, null);
  await assert.rejects(findTargetBuild({ ...buildListing([build(), build('122', 'VALID', false, 'duplicate')]), buildNumber: '122' }), /여러 개/);
});

function releaseApi(options = {}) {
  const calls = [];
  const api = async (method, path) => {
    calls.push({ method, path });
    if (method === 'PATCH') {
      if (options.patchFails) throw new Error('시험용 연결 실패');
      return {};
    }
    if (path === '/v1/appStoreVersions/target-version') return { data: options.version ?? version() };
    if (path === '/v1/appStoreVersions/target-version/build') return { data: options.linked ?? build() };
    if (path === '/v1/builds/target-build/preReleaseVersion') return { data: options.train ?? { attributes: { version: '1.0.2', platform: 'IOS' } } };
    throw new Error('예상하지 않은 시험 API 경로');
  };
  return { api, calls, versionId: 'target-version', versionString: '1.0.2', build: build() };
}

test('빌드 연결 실패는 삼키지 않으며 이후 제출로 넘어가지 않는다', async () => {
  const target = releaseApi({ patchFails: true });
  let submitted = false;
  await assert.rejects(async () => { await linkAndVerifyBuild(target); submitted = true; }, /연결 실패/);
  assert.equal(submitted, false);
  assert.equal(target.calls.filter((call) => call.method === 'PATCH').length, 1);
  assert.equal(target.calls.some((call) => call.method === 'GET' && call.path.endsWith('/build')), false);
});

test('다른 버전 또는 유효 빌드가 없으면 연결 요청부터 하지 않는다', async () => {
  const wrongVersion = releaseApi({ version: version('1.0.1') });
  await assert.rejects(linkAndVerifyBuild(wrongVersion), /편집 가능/);
  const missingBuild = { ...releaseApi(), build: null };
  await assert.rejects(linkAndVerifyBuild(missingBuild), /유효 빌드/);
  assert.equal([...wrongVersion.calls, ...missingBuild.calls].some((call) => call.method === 'PATCH'), false);
});

for (const [label, linked] of [
  ['옛 빌드 ID', build('121', 'VALID', false, 'old-build')],
  ['다른 빌드 번호', build('121')],
  ['처리 상태 변경', build('122', 'PROCESSING')],
  ['만료된 빌드', build('122', 'VALID', true)],
]) {
  test(`연결 API 성공 뒤에도 ${label}이면 제출을 허용하지 않는다`, async () => {
    const target = releaseApi({ linked });
    let submitted = false;
    await assert.rejects(async () => { await linkAndVerifyBuild(target); submitted = true; }, /연결된 빌드/);
    assert.equal(submitted, false);
  });
}

for (const train of [{ attributes: { version: '1.0.1', platform: 'IOS' } }, { attributes: { version: '1.0.2', platform: 'MAC_OS' } }]) {
  test(`다시 읽은 빌드 train ${train.attributes.version}/${train.attributes.platform} 불일치를 막는다`, async () => {
    await assert.rejects(linkAndVerifyBuild(releaseApi({ train })), /앱 버전·플랫폼/);
  });
}

test('연결이 성공해도 제출 직전 대상이 바뀌면 다시 중단한다', async () => {
  const options = {};
  const target = releaseApi(options);
  await linkAndVerifyBuild(target);
  options.linked = build('121', 'VALID', false, 'old-build');
  let submitted = false;
  await assert.rejects(async () => { await assertReleaseTarget(target); submitted = true; }, /연결된 빌드/);
  assert.equal(submitted, false);
});

test('대상 버전·빌드·train이 모두 일치하면 연결 및 제출 전 검사를 통과한다', async () => {
  const target = releaseApi();
  await linkAndVerifyBuild(target);
  await assertReleaseTarget(target);
  assert.equal(target.calls.filter((call) => call.method === 'PATCH').length, 1);
});
