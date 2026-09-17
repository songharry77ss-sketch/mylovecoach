// PC 에서 실행: node tools/asc-listing.mjs [--submit] [--secrets <폴더>] [--site https://mylovecoach.vercel.app]
// App Store Connect 에 앱 레코드(번들 ID app.mylovecoach.ios)가 만들어진 뒤, 등록 정보를 API 로 한 번에 채운다.
//   이름·부제·개인정보 URL·카테고리 / 설명·키워드·지원 URL / 6.7" 스크린샷 / 연령 등급 / 심사 연락처·메모 / 무료 가격 / 한국 출시
//   --submit : 처리 완료된 최신 빌드를 버전에 연결하고 심사에 제출
// API 로 안 되는 것(화면에서만 가능): 앱 레코드 생성, 「앱이 수집하는 개인정보」(App Privacy) 설문.
// 값(키)은 출력하지 않는다. 같은 값을 다시 넣어도 안전하게 여러 번 실행할 수 있다.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { BUNDLE_ID, createAscClient, secretsRoot, step } from './lib/asc-api.mjs';

const LOCALE = 'ko';
const VERSION = '1.0.0';
const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const argOf = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
const root = secretsRoot(args);
const SITE = (argOf('--site') ?? (existsSync(join(root, 'mylovecoach-api-url.txt')) ? readFileSync(join(root, 'mylovecoach-api-url.txt'), 'utf8').trim() : 'https://mylovecoach.vercel.app')).replace(/\/+$/, '');
const { api, uploadAsset, findApp } = createAscClient(root);

// ---- 등록 문구: docs/STORE_LISTING.md 에서 읽는다 (문서가 원본)
const listingMd = readFileSync(join(repo, 'docs', 'STORE_LISTING.md'), 'utf8');
const field = (label) => (listingMd.match(new RegExp(`\\*\\*${label}[^*]*\\*\\*:\\s*(.+)`)) ?? [])[1]?.trim();
const section = (title) => (listingMd.match(new RegExp(`## ${title}[^\\n]*\\n([\\s\\S]*?)(?=\\n## |$)`)) ?? [])[1]?.trim() ?? '';
const LISTING = {
  name: field('앱 이름') ?? '나만의 연애코치',
  subtitle: field('부제') ?? '',
  keywords: field('키워드') ?? '',
  // 문서에는 기본 주소로 적혀 있으므로 실제 배포 주소로 바꿔 넣는다
  description: section('전체 설명').replaceAll('https://mylovecoach.vercel.app', SITE),
  reviewNotes: section('심사 메모').replace(/^- /gm, '• '),
};

async function main() {
  const app = await findApp();
  if (!app) {
    console.log(`앱 레코드가 아직 없습니다. App Store Connect → 앱 → + → 신규 앱 에서 번들 ID ${BUNDLE_ID} 로 만든 뒤 다시 실행하세요.`);
    process.exitCode = 2; // Windows 에서 fetch 직후 process.exit() 는 libuv 단언 오류를 내므로 exitCode 만 설정
    return;
  }
  console.log(`앱: ${app.attributes.name} (id ${app.id}) · 사이트 ${SITE}`);

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

  // 3) 버전 1.0.0 + 한국어 설명
  let version;
  await step(`버전 ${VERSION}`, async () => {
    const vs = await api('GET', `/v1/apps/${app.id}/appStoreVersions?filter[platform]=IOS`);
    version = vs.data.find((v) => ['PREPARE_FOR_SUBMISSION', 'DEVELOPER_REJECTED', 'REJECTED', 'METADATA_REJECTED', 'INVALID_BINARY'].includes(v.attributes.appStoreState ?? v.attributes.appVersionState));
    if (!version && vs.data.length === 0)
      version = (await api('POST', '/v1/appStoreVersions', { data: { type: 'appStoreVersions', attributes: { platform: 'IOS', versionString: VERSION }, relationships: { app: { data: { type: 'apps', id: app.id } } } } })).data;
    if (!version) throw new Error(`편집 가능한 버전이 없습니다 (현재 상태: ${vs.data.map((v) => v.attributes.appStoreState).join(', ')})`);
    await api('PATCH', `/v1/appStoreVersions/${version.id}`, { data: { type: 'appStoreVersions', id: version.id, attributes: { copyright: `${new Date().getFullYear()} mylovecoach`, releaseType: 'AFTER_APPROVAL' } } });
    return `${version.attributes.versionString} (${version.attributes.appStoreState ?? ''})`;
  });
  if (!version) return;

  let vloc;
  await step('설명·키워드·지원 URL', async () => {
    const locs = await api('GET', `/v1/appStoreVersions/${version.id}/appStoreVersionLocalizations`);
    const attrs = { description: LISTING.description, keywords: LISTING.keywords, supportUrl: SITE, marketingUrl: SITE, promotionalText: '대화 캡처 한 장이면 지금 상황에 딱 맞는 답장 3개와 호감 온도를 알려드려요.' };
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
      const done = new Set(existing.data.filter((s) => s.attributes.assetDeliveryState?.state !== 'FAILED').map((s) => s.attributes.fileName));
      for (const s of existing.data.filter((x) => x.attributes.assetDeliveryState?.state === 'FAILED')) await api('DELETE', `/v1/appScreenshots/${s.id}`);
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
    const attrs = { ...contact, demoAccountRequired: false, notes: LISTING.reviewNotes };
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
  await step('출시 국가: 대한민국', async () => {
    const has = await api('GET', `/v1/apps/${app.id}/appAvailabilityV2`).catch(() => null);
    if (has?.data) return '이미 설정됨';
    await api('POST', '/v2/appAvailabilities', {
      data: {
        type: 'appAvailabilities',
        attributes: { availableInNewTerritories: false },
        relationships: { app: { data: { type: 'apps', id: app.id } }, territoryAvailabilities: { data: [{ type: 'territoryAvailabilities', id: '${kor}' }] } },
      },
      included: [{ type: 'territoryAvailabilities', id: '${kor}', attributes: { available: true }, relationships: { territory: { data: { type: 'territories', id: 'KOR' } } } }],
    });
    return '';
  });

  // 7) 빌드 연결 + 심사 제출
  const builds = await api('GET', `/v1/builds?filter[app]=${app.id}&sort=-uploadedDate&limit=5`);
  const build = builds.data.find((b) => b.attributes.processingState === 'VALID' && !b.attributes.expired);
  console.log(`빌드: ${builds.data.map((b) => `${b.attributes.version}(${b.attributes.processingState})`).join(', ') || '없음 (ios.yml 로 TestFlight 업로드 필요)'}`);
  if (build)
    await step(`버전에 빌드 ${build.attributes.version} 연결`, () =>
      api('PATCH', `/v1/appStoreVersions/${version.id}/relationships/build`, { data: { type: 'builds', id: build.id } }).then(() => ''),
    );
  if (args.includes('--submit')) {
    if (!build) return console.log('제출 보류: 처리 완료된 빌드가 없습니다');
    await step('심사 제출', async () => {
      const open = await api('GET', `/v1/reviewSubmissions?filter[app]=${app.id}&filter[state]=READY_FOR_REVIEW,UNRESOLVED_ISSUES&filter[platform]=IOS`);
      const sub = open.data[0] ?? (await api('POST', '/v1/reviewSubmissions', { data: { type: 'reviewSubmissions', attributes: { platform: 'IOS' }, relationships: { app: { data: { type: 'apps', id: app.id } } } } })).data;
      await api('POST', '/v1/reviewSubmissionItems', { data: { type: 'reviewSubmissionItems', relationships: { reviewSubmission: { data: { type: 'reviewSubmissions', id: sub.id } }, appStoreVersion: { data: { type: 'appStoreVersions', id: version.id } } } } }).catch((e) => {
        if (e.status !== 409) throw e;
      });
      await api('PATCH', `/v1/reviewSubmissions/${sub.id}`, { data: { type: 'reviewSubmissions', id: sub.id, attributes: { submitted: true } } });
      return '제출 완료 (보통 1~2일 내 결과)';
    });
  } else console.log('심사 제출은 --submit 을 붙여 실행. 그 전에 App Store Connect → 앱이 수집하는 개인정보(App Privacy) 설문을 화면에서 완료해야 합니다.');
}
main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
