// PC 에서 실행: node tools/asc-listing.mjs [--submit] [--build <번호>] [--wait <분>] [--retry <분>] [--secrets <폴더>] [--site https://mylovecoach.vercel.app]
// App Store Connect 에 앱 레코드(번들 ID app.mylovecoach.ios)가 만들어진 뒤, 등록 정보를 API 로 한 번에 채운다.
//   이름·부제·개인정보 URL·카테고리 / 설명·키워드·지원 URL / 6.7" 스크린샷 / 연령 등급 / 심사 연락처·메모 / 무료 가격 / 한국 출시
//   --submit : --build 로 지정한 빌드만 같은 앱 버전에 연결·재확인한 뒤 심사에 제출
//              처음 내는 구독·평생권이 심사 묶음에 없으면 제출하지 않는다(웹 화면에서 골라야 함). 상품 없이 내려면 --without-products
// API 로 안 되는 것(화면에서만 가능): 앱 레코드 생성, 「앱이 수집하는 개인정보」(App Privacy) 설문.
// 값(키)은 출력하지 않는다. 같은 값을 다시 넣어도 안전하게 여러 번 실행할 수 있다.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { BUNDLE_ID, createAscClient, MISSING_PRODUCTS_HELP, missingProducts, secretsRoot, step } from './lib/asc-api.mjs';
import { assertEditableVersion, assertReleaseTarget, findEditableVersion, findTargetBuild, linkAndVerifyBuild, readWhatsNew } from './lib/asc-release-guard.mjs';

const LOCALE = 'ko';
const TERRITORY_KR = 'KOR';
const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
// 버전 번호는 app.json 이 원본 — 빌드에 박히는 번호와 App Store 버전이 같아야 빌드를 연결할 수 있다
const VERSION = JSON.parse(readFileSync(join(repo, 'app.json'), 'utf8')).expo.version;
const args = process.argv.slice(2);
const argOf = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
const root = secretsRoot(args);
const SITE = (argOf('--site') ?? (existsSync(join(root, 'mylovecoach-api-url.txt')) ? readFileSync(join(root, 'mylovecoach-api-url.txt'), 'utf8').trim() : 'https://mylovecoach.vercel.app')).replace(/\/+$/, '');
const { api, getAll, uploadAsset, findApp } = createAscClient(root);

// ---- 등록 문구: docs/STORE_LISTING.md 에서 읽는다 (문서가 원본)
const listingMd = readFileSync(join(repo, 'docs', 'STORE_LISTING.md'), 'utf8');
const WHATS_NEW = readWhatsNew(listingMd, VERSION);
const field = (label) => (listingMd.match(new RegExp(`\\*\\*${label}[^*]*\\*\\*:\\s*(.+)`)) ?? [])[1]?.trim();
const section = (title) => (listingMd.match(new RegExp(`## ${title}[^\\n]*\\n([\\s\\S]*?)(?=\\n## |$)`)) ?? [])[1]?.trim() ?? '';
/** App Store 는 설명에 이모지를 허용하지 않으므로 지운다 (Play 는 그대로 사용) */
function stripEmoji(text) {
  return text
    .replace(/[🀀-🫿☀-➿️←-⇿⬀-⯿•]/gu, '')
    .replace(/[ \t]+$/gm, '')
    .replace(/^[ \t]+/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const LISTING = {
  name: field('앱 이름') ?? '나만의 연애코치',
  subtitle: field('부제') ?? '',
  keywords: field('키워드') ?? '',
  // 문서에는 기본 주소로 적혀 있으므로 실제 배포 주소로 바꿔 넣는다
  description: stripEmoji(section('전체 설명').replaceAll('https://mylovecoach.vercel.app', SITE)),
  reviewNotes: section('심사 메모').replace(/^- /gm, '• '),
};

async function main() {
  const wanted = argOf('--build');
  if (args.includes('--submit') && !wanted) throw new Error('심사 제출에는 --build <검증한 빌드 번호>가 필요합니다.');
  if (wanted !== undefined && !/^[1-9][0-9]*$/.test(wanted)) throw new Error('빌드 번호는 양의 정수여야 합니다.');
  const app = await findApp();
  if (!app) {
    console.log(`앱 레코드가 아직 없습니다. App Store Connect → 앱 → + → 신규 앱 에서 번들 ID ${BUNDLE_ID} 로 만든 뒤 다시 실행하세요.`);
    process.exitCode = 2; // Windows 에서 fetch 직후 process.exit() 는 libuv 단언 오류를 내므로 exitCode 만 설정
    return;
  }
  console.log(`앱: ${app.attributes.name} (id ${app.id}) · 사이트 ${SITE}`);

  // 다른 버전이 심사 중이면 등록 정보도 바꾸기 전에 멈춘다. 최신·첫 초안으로 대체하지 않는다.
  const versions = await getAll(`/v1/apps/${app.id}/appStoreVersions?filter[platform]=IOS&limit=100`);
  let version = findEditableVersion(versions, VERSION);
  if (!version) {
    version = (await api('POST', '/v1/appStoreVersions', { data: { type: 'appStoreVersions', attributes: { platform: 'IOS', versionString: VERSION }, relationships: { app: { data: { type: 'apps', id: app.id } } } } })).data;
    assertEditableVersion(version, VERSION);
  }
  console.log(`✓ 대상 버전 ${VERSION} 확인`);

  // 1) 앱 정보: 이름·부제·개인정보 URL·카테고리·콘텐츠 권리
  const infos = await api('GET', `/v1/apps/${app.id}/appInfos`);
  const info = infos.data.find((i) => !['READY_FOR_SALE', 'READY_FOR_DISTRIBUTION'].includes(i.attributes.appStoreState ?? i.attributes.state)) ?? infos.data[0];
  await step('이름·부제·개인정보 처리방침 URL', async () => {
    const locs = await api('GET', `/v1/appInfos/${info.id}/appInfoLocalizations`);
    const attrs = { name: LISTING.name, subtitle: LISTING.subtitle, privacyPolicyUrl: `${SITE}/privacy.html` };
    const loc = locs.data.find((l) => l.attributes.locale === LOCALE);
    if (loc) await api('PATCH', `/v1/appInfoLocalizations/${loc.id}`, { data: { type: 'appInfoLocalizations', id: loc.id, attributes: attrs } });
    else await api('POST', '/v1/appInfoLocalizations', { data: { type: 'appInfoLocalizations', attributes: { locale: LOCALE, ...attrs }, relationships: { appInfo: { data: { type: 'appInfos', id: info.id } } } } });
    return LISTING.name;
  });
  await step('카테고리 (라이프스타일 / 소셜 네트워킹)', () =>
    api('PATCH', `/v1/appInfos/${info.id}`, {
      data: {
        type: 'appInfos',
        id: info.id,
        relationships: {
          primaryCategory: { data: { type: 'appCategories', id: 'LIFESTYLE' } },
          secondaryCategory: { data: { type: 'appCategories', id: 'SOCIAL_NETWORKING' } },
        },
      },
    }).then(() => ''),
  );
  await step('콘텐츠 권리 (타사 콘텐츠 없음)', () =>
    api('PATCH', `/v1/apps/${app.id}`, { data: { type: 'apps', id: app.id, attributes: { contentRightsDeclaration: 'DOES_NOT_USE_THIRD_PARTY_CONTENT' } } }).then(() => ''),
  );

  // 2) 연령 등급: 사실대로 — 연애/플러팅 조언이라 「성인/선정적 주제: 가끔/약함」만 해당, 나머지는 없음
  await step('연령 등급 설문', async () => {
    const decl = await api('GET', `/v1/appInfos/${info.id}/ageRatingDeclaration`);
    const present = Object.keys(decl.data.attributes ?? {});
    const ENUMS = ['alcoholTobaccoOrDrugUseOrReferences', 'contests', 'gamblingSimulated', 'gunsOrOtherWeapons', 'horrorOrFearThemes', 'matureOrSuggestiveThemes', 'medicalOrTreatmentInformation', 'profanityOrCrudeHumor', 'sexualContentGraphicAndNudity', 'sexualContentOrNudity', 'violenceCartoonOrFantasy', 'violenceRealistic', 'violenceRealisticProlongedGraphicOrSadistic'];
    const BOOLS = ['gambling', 'unrestrictedWebAccess', 'lootBox', 'advertising', 'ageAssurance', 'healthOrWellnessTopics', 'messagingAndChat', 'parentalControls', 'userGeneratedContent', 'seventeenPlus'];
    let attributes = {};
    for (const k of ENUMS) if (present.includes(k)) attributes[k] = k === 'matureOrSuggestiveThemes' ? 'INFREQUENT_OR_MILD' : 'NONE';
    for (const k of BOOLS) if (present.includes(k)) attributes[k] = false;
    // Apple 이 속성 구성을 바꾸면 거부된 항목만 빼고 다시 시도한다
    for (let i = 0; i < 6; i++) {
      try {
        await api('PATCH', `/v1/ageRatingDeclarations/${decl.data.id}`, { data: { type: 'ageRatingDeclarations', id: decl.data.id, attributes } });
        return `${Object.keys(attributes).length}개 항목`;
      } catch (e) {
        const bad = e.errors.map((x) => (x.source?.pointer ?? '').split('/').pop()).filter((k) => k && k in attributes);
        if (!bad.length) throw e;
        for (const k of bad) delete attributes[k];
      }
    }
    throw new Error('속성 구성이 예상과 달라 설정하지 못했습니다');
  });

  // 3) 버전(app.json) + 한국어 설명
  // 출시 방식(releaseType)은 현재 설정을 보존한다. 따로 확인·결정하지 않고 바꾸지 않는다.
  await api('PATCH', `/v1/appStoreVersions/${version.id}`, { data: { type: 'appStoreVersions', id: version.id, attributes: { copyright: `${new Date().getFullYear()} mylovecoach` } } });

  let vloc;
  await step('설명·키워드·지원 URL', async () => {
    const locs = await api('GET', `/v1/appStoreVersions/${version.id}/appStoreVersionLocalizations`);
    const attrs = { description: LISTING.description, keywords: LISTING.keywords, supportUrl: `${SITE}/support.html`, marketingUrl: SITE, promotionalText: '대화 캡처 한 장이면 지금 상황에 딱 맞는 답장 3개와 호감 온도를 알려드려요.' };
    if (VERSION !== '1.0.0') attrs.whatsNew = WHATS_NEW;
    vloc = locs.data.find((l) => l.attributes.locale === LOCALE);
    if (vloc) await api('PATCH', `/v1/appStoreVersionLocalizations/${vloc.id}`, { data: { type: 'appStoreVersionLocalizations', id: vloc.id, attributes: attrs } });
    else vloc = (await api('POST', '/v1/appStoreVersionLocalizations', { data: { type: 'appStoreVersionLocalizations', attributes: { locale: LOCALE, ...attrs }, relationships: { appStoreVersion: { data: { type: 'appStoreVersions', id: version.id } } } } })).data;
    return `${LISTING.description.length}자`;
  });

  // 4) 스크린샷 (6.7", 1290×2796)
  if (vloc)
    await step('스크린샷 6.7"', async () => {
      // 카피가 들어간 홍보용 이미지(scripts/make-store-shots.py)가 있으면 그것을 쓴다
      const framed = join(repo, 'docs', 'store-assets', 'ios-6.7-framed');
      const dir = existsSync(framed) ? framed : join(repo, 'docs', 'store-assets', 'ios-6.7');
      const files = readdirSync(dir).filter((f) => /\.png$/i.test(f)).sort();
      const sets = await api('GET', `/v1/appStoreVersionLocalizations/${vloc.id}/appScreenshotSets`);
      let set = sets.data.find((s) => s.attributes.screenshotDisplayType === 'APP_IPHONE_67');
      if (!set) set = (await api('POST', '/v1/appScreenshotSets', { data: { type: 'appScreenshotSets', attributes: { screenshotDisplayType: 'APP_IPHONE_67' }, relationships: { appStoreVersionLocalization: { data: { type: 'appStoreVersionLocalizations', id: vloc.id } } } } })).data;
      const existing = await api('GET', `/v1/appScreenshotSets/${set.id}/appScreenshots`);
      // --replace-screenshots: 화면이 바뀌었을 때 기존 것을 지우고 다시 올린다
      if (args.includes('--replace-screenshots')) for (const s of existing.data) await api('DELETE', `/v1/appScreenshots/${s.id}`);
      const keep = args.includes('--replace-screenshots') ? [] : existing.data;
      const done = new Set(keep.filter((s) => s.attributes.assetDeliveryState?.state !== 'FAILED').map((s) => s.attributes.fileName));
      for (const s of keep.filter((x) => x.attributes.assetDeliveryState?.state === 'FAILED')) await api('DELETE', `/v1/appScreenshots/${s.id}`);
      let uploaded = 0;
      for (const f of files) {
        if (done.has(f)) continue;
        const buf = readFileSync(join(dir, f));
        const shot = (await api('POST', '/v1/appScreenshots', { data: { type: 'appScreenshots', attributes: { fileName: f, fileSize: buf.length }, relationships: { appScreenshotSet: { data: { type: 'appScreenshotSets', id: set.id } } } } })).data;
        await uploadAsset('appScreenshots', shot, buf);
        uploaded++;
      }
      return `새로 ${uploaded}장, 기존 ${done.size}장`;
    });

  // 5) 심사 정보: 연락처는 같은 개발자 계정의 기존 앱(월하)에서 가져온다
  await step('심사 연락처·메모', async () => {
    let contact = {};
    const others = await api('GET', '/v1/apps?limit=50');
    for (const o of others.data.filter((x) => x.id !== app.id)) {
      const vs = await api('GET', `/v1/apps/${o.id}/appStoreVersions?limit=3`).catch(() => ({ data: [] }));
      for (const v of vs.data) {
        const d = await api('GET', `/v1/appStoreVersions/${v.id}/appStoreReviewDetail`).catch(() => null);
        const a = d?.data?.attributes;
        if (a?.contactEmail && a?.contactPhone) {
          contact = { contactFirstName: a.contactFirstName, contactLastName: a.contactLastName, contactPhone: a.contactPhone, contactEmail: a.contactEmail };
          break;
        }
      }
      if (contact.contactEmail) break;
    }
    // 콘솔에 정한 심사 계정 필요 여부·접근 정보는 덮어쓰지 않는다.
    const attrs = { ...contact, notes: LISTING.reviewNotes };
    const cur = await api('GET', `/v1/appStoreVersions/${version.id}/appStoreReviewDetail`).catch(() => null);
    if (cur?.data) await api('PATCH', `/v1/appStoreReviewDetails/${cur.data.id}`, { data: { type: 'appStoreReviewDetails', id: cur.data.id, attributes: attrs } });
    else await api('POST', '/v1/appStoreReviewDetails', { data: { type: 'appStoreReviewDetails', attributes: attrs, relationships: { appStoreVersion: { data: { type: 'appStoreVersions', id: version.id } } } } });
    return contact.contactEmail ? '연락처: 기존 앱에서 복사' : '연락처 없음 → App Store Connect 에서 직접 입력 필요';
  });

  // 6) 가격(무료) + 출시 국가(대한민국). EU 는 DSA 판매자 신고가 필요해 처음엔 한국만 연다.
  await step('가격: 무료', async () => {
    const pts = await api('GET', `/v1/apps/${app.id}/appPricePoints?filter[territory]=KOR&limit=200`);
    const free = pts.data.find((p) => Number(p.attributes.customerPrice) === 0);
    if (!free) throw new Error('무료 가격 포인트를 찾지 못했습니다');
    await api('POST', '/v1/appPriceSchedules', {
      data: {
        type: 'appPriceSchedules',
        relationships: { app: { data: { type: 'apps', id: app.id } }, baseTerritory: { data: { type: 'territories', id: 'KOR' } }, manualPrices: { data: [{ type: 'appPrices', id: '${price1}' }] } },
      },
      included: [{ type: 'appPrices', id: '${price1}', attributes: { startDate: null }, relationships: { appPricePoint: { data: { type: 'appPricePoints', id: free.id } } } }],
    });
    return '';
  });
  await step('출시 국가: 대한민국만', async () => {
    const has = await api('GET', `/v1/apps/${app.id}/appAvailabilityV2`).catch(() => null);
    if (has?.data) return '이미 설정됨';
    // Apple 은 일부 지역만 보내면 거부하므로 전체 지역을 보내되 대한민국만 판매로 둔다
    const territories = await getAll('/v1/territories?limit=200');
    // inline 생성이므로 id 는 실제 코드가 아니라 임시(local) id 여야 한다
    const localId = (i) => '${' + 'terr' + i + '}';
    const included = territories.map((t, i) => ({
      type: 'territoryAvailabilities',
      id: localId(i),
      attributes: { available: t.id === TERRITORY_KR },
      relationships: { territory: { data: { type: 'territories', id: t.id } } },
    }));
    await api('POST', '/v2/appAvailabilities', {
      data: {
        type: 'appAvailabilities',
        attributes: { availableInNewTerritories: false },
        relationships: {
          app: { data: { type: 'apps', id: app.id } },
          territoryAvailabilities: { data: included.map((i) => ({ type: i.type, id: i.id })) },
        },
      },
      included,
    });
    return `${territories.length}개 지역 중 대한민국만 판매`;
  });

  // 7) 빌드 연결 + 심사 제출
  // /v1/builds 목록에는 처리 중(PROCESSING) 빌드가 나오지 않는다. 그대로 최신을 고르면
  // 방금 올린 빌드 대신 이전 빌드가 제출될 수 있으므로, --build 로 번호를 지정하면 그 빌드만 쓴다.
  // --wait <분> 을 주면 그 빌드가 업로드·처리(VALID)될 때까지 1분마다 다시 확인한다.
  const waitMin = Number(argOf('--wait') ?? '0') || 0;
  const deadline = Date.now() + waitMin * 60_000;
  let allBuilds = [];
  let target;
  let build = null;
  for (;;) {
    ({ builds: allBuilds, target, build } = await findTargetBuild({ getAll, appId: app.id, versionString: VERSION, buildNumber: wanted }));
    if (build || Date.now() >= deadline) break;
    console.log(`  · 빌드 ${wanted ?? '최신'} 대기 중 (${target ? target.attributes.processingState : '아직 업로드 안 됨'}) …`);
    await new Promise((r) => setTimeout(r, 60_000));
  }
  console.log(`빌드: ${allBuilds.map((b) => `${b.attributes.version}(${b.attributes.processingState})`).join(', ') || '없음 (ios.yml 로 TestFlight 업로드 필요)'}`);
  if (!build) {
    throw new Error(
      wanted
        ? `빌드 ${wanted} 이 ${target ? `아직 ${target.attributes.processingState} 상태` : '목록에 없음'} — 처리 완료 후 다시 실행하세요`
        : `버전 ${VERSION}의 최신 빌드가 없거나 처리 완료되지 않아 연결하지 않았습니다`,
    );
  }
  const releaseTarget = { api, versionId: version.id, versionString: VERSION, build };
  await linkAndVerifyBuild(releaseTarget);
  console.log(`✓ 버전 ${VERSION}에 빌드 ${build.attributes.version} 연결·재확인`);
  if (args.includes('--submit')) {
    // --retry <분> : 화면에서만 할 수 있는 항목(개인정보 설문 등)이 아직이면 2분마다 다시 시도한다.
    // 사용자가 설문을 게시하는 순간 바로 제출되게 하려는 것.
    const retryMin = Number(argOf('--retry') ?? '0') || 0;
    const retryUntil = Date.now() + retryMin * 60_000;
    for (;;) {
      const ok = await submitOnce();
      if (ok) break;
      if (Date.now() >= retryUntil) throw new Error('심사 제출을 완료하지 못했습니다. 위 실패 항목을 해결한 뒤 다시 실행하세요.');
      console.log('  · 2분 뒤 다시 제출해 봅니다 (App Store Connect 화면에서 빠진 항목을 채우면 자동으로 통과)');
      await new Promise((r) => setTimeout(r, 120_000));
    }
    return;
  }
  console.log('심사 제출은 --submit 을 붙여 실행. 그 전에 App Store Connect → 앱이 수집하는 개인정보(App Privacy) 설문을 화면에서 완료해야 합니다.');

  async function submitOnce() {
    // 재시도 사이 다른 세션이 빌드·버전을 바꿨다면 더 시도하지 않는다.
    await assertReleaseTarget(releaseTarget);
    return step('심사 제출', async () => {
      const open = await api('GET', `/v1/reviewSubmissions?filter[app]=${app.id}&filter[state]=READY_FOR_REVIEW,UNRESOLVED_ISSUES&filter[platform]=IOS`);
      const sub = open.data[0] ?? (await api('POST', '/v1/reviewSubmissions', { data: { type: 'reviewSubmissions', attributes: { platform: 'IOS' }, relationships: { app: { data: { type: 'apps', id: app.id } } } } })).data;
      // 버전이 이미 이 묶음에 들어 있으면 409 가 나는데, 그때만 넘어간다.
      // 그 밖의 409 는 버전이 제출 가능한 상태가 아니라는 뜻이므로 사유를 그대로 보여준다.
      await api('POST', '/v1/reviewSubmissionItems', { data: { type: 'reviewSubmissionItems', relationships: { reviewSubmission: { data: { type: 'reviewSubmissions', id: sub.id } }, appStoreVersion: { data: { type: 'appStoreVersions', id: version.id } } } } }).catch(async (e) => {
        if (e.status !== 409) throw e;
        const items = await getAll(`/v1/reviewSubmissions/${sub.id}/items?include=appStoreVersion&limit=50`).catch(() => []);
        const already = items.some((it) => it.relationships?.appStoreVersion?.data?.id === version.id);
        if (!already) throw new Error(`버전을 심사 묶음에 넣지 못했습니다 — ${e.message}`);
      });
      const missing = args.includes('--without-products') ? [] : await missingProducts({ getAll, appId: app.id, submissionId: sub.id });
      if (missing.length) throw new Error(`심사 묶음에 상품이 빠져 있어 제출하지 않았습니다 (${missing.join(', ')}). ${MISSING_PRODUCTS_HELP}`);
      await assertReleaseTarget(releaseTarget);
      await api('PATCH', `/v1/reviewSubmissions/${sub.id}`, { data: { type: 'reviewSubmissions', id: sub.id, attributes: { submitted: true } } });
      return '제출 완료 (보통 1~2일 내 결과 · 출시 방식은 그대로 — node tools/asc-release.mjs 로 확인)';
    });
  }
}
main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
