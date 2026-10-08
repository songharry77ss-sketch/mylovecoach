// 인증정보를 읽지 않는 제출 대상 검증. API 호출은 실행 쪽에서 전달한다.
const EDITABLE = new Set(['PREPARE_FOR_SUBMISSION', 'READY_FOR_REVIEW', 'DEVELOPER_REJECTED', 'REJECTED', 'METADATA_REJECTED', 'INVALID_BINARY']);
const FINISHED = new Set(['READY_FOR_SALE', 'READY_FOR_DISTRIBUTION', 'REPLACED_WITH_NEW_VERSION', 'REMOVED_FROM_SALE', 'DEVELOPER_REMOVED_FROM_SALE']);
const stateOf = (version) => version?.attributes?.appStoreState ?? version?.attributes?.appVersionState;

/** 앱 버전과 같은 제목의 새 소식만 읽는다. 다음 섹션·내부 주의사항을 스토어 문구에 섞지 않는다. */
export function readWhatsNew(markdown, versionString) {
  const escaped = versionString.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const heading = new RegExp(`^## 이번 버전의 새로운 기능 \\(${escaped}(?: 초안)?\\)[ \\t]*\\r?$`, 'm').exec(markdown);
  if (!heading) throw new Error(`STORE_LISTING.md에 버전 ${versionString}의 새 소식이 없어 중단합니다.`);
  const tail = markdown.slice(heading.index + heading[0].length);
  const end = tail.search(/^## /m);
  const lines = (end < 0 ? tail : tail.slice(0, end)).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length || lines.some((line) => !/^- \S/.test(line))) throw new Error('새 소식에는 비어 있지 않은 bullet 문구만 넣어야 합니다.');
  return lines.map((line) => `· ${line.slice(2)}`).join('\n');
}

export function assertEditableVersion(version, wantedVersion) {
  if (!version?.id || version.attributes?.versionString !== wantedVersion || !EDITABLE.has(stateOf(version))) {
    throw new Error(`대상 버전 ${wantedVersion}이 일치하는 편집 가능 상태가 아니므로 중단합니다.`);
  }
  return version;
}

/** 같은 번호가 없고 다른 준비·심사 버전도 없을 때만 새 버전 생성을 허용한다. */
export function findEditableVersion(versions, wantedVersion) {
  const matching = versions.filter((version) => version.attributes?.versionString === wantedVersion);
  if (matching.length > 1) throw new Error(`대상 버전 ${wantedVersion}이 여러 개라 중단합니다.`);
  if (matching.length === 1) return assertEditableVersion(matching[0], wantedVersion);
  if (versions.some((version) => !FINISHED.has(stateOf(version)))) {
    throw new Error(`대상 버전 ${wantedVersion}은 없고 다른 버전이 준비·심사·출시 대기 중입니다. 기존 버전을 바꾸지 않고 중단합니다.`);
  }
  return null;
}

/** 다른 앱 버전의 빌드와, 처리 중인 최신 빌드 대신 과거 빌드를 고르는 일을 막는다. */
export async function findTargetBuild({ getAll, appId, versionString, buildNumber }) {
  const trains = await getAll(`/v1/preReleaseVersions?filter[app]=${appId}&filter[platform]=IOS&limit=100`);
  const builds = [];
  for (const train of trains.filter((item) => item.attributes?.version === versionString)) {
    builds.push(...await getAll(`/v1/preReleaseVersions/${train.id}/builds?limit=100`));
  }
  builds.sort((a, b) => Number(b.attributes.version) - Number(a.attributes.version));
  const matching = buildNumber ? builds.filter((item) => item.attributes.version === buildNumber) : builds.slice(0, 1);
  if (matching.length > 1) throw new Error(`버전 ${versionString}의 빌드 ${buildNumber}가 여러 개라 중단합니다.`);
  const target = matching[0];
  const build = target?.attributes?.processingState === 'VALID' && target.attributes.expired === false ? target : null;
  return { builds, target, build };
}

/** 연결 직후와 제출 직전에 서버에서 다시 읽어, 옛 빌드나 다른 버전을 제출하지 않는다. */
export async function assertReleaseTarget({ api, versionId, versionString, build }) {
  const version = (await api('GET', `/v1/appStoreVersions/${versionId}`)).data;
  assertEditableVersion(version, versionString);
  if (version.id !== versionId) throw new Error('다시 조회한 버전 ID가 달라 중단합니다.');
  const linked = (await api('GET', `/v1/appStoreVersions/${versionId}/build`)).data;
  if (!build?.id || !linked?.id || linked.id !== build.id || linked.attributes?.version !== build.attributes?.version || linked.attributes.processingState !== 'VALID' || linked.attributes.expired !== false) {
    throw new Error('연결된 빌드가 지정한 유효 빌드와 일치하지 않아 중단합니다.');
  }
  const train = (await api('GET', `/v1/builds/${linked.id}/preReleaseVersion`)).data;
  if (train?.attributes?.version !== versionString || train.attributes.platform !== 'IOS') {
    throw new Error('연결된 빌드의 앱 버전·플랫폼이 제출 대상과 달라 중단합니다.');
  }
}

export async function linkAndVerifyBuild(target) {
  const { api, versionId, versionString, build } = target;
  assertEditableVersion((await api('GET', `/v1/appStoreVersions/${versionId}`)).data, versionString);
  if (!build?.id || build.attributes?.processingState !== 'VALID' || build.attributes.expired !== false) throw new Error('연결할 유효 빌드가 없어 중단합니다.');
  await api('PATCH', `/v1/appStoreVersions/${versionId}/relationships/build`, { data: { type: 'builds', id: build.id } });
  await assertReleaseTarget(target);
}
