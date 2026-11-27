// PC 에서 실행: node tools/asc-global.mjs [--listing] [--primary-en] [--screenshots <폴더>] [--iap] [--availability [--confirm-live]] [--apply] [--langs ja,fr] [--secrets <폴더>] [--site <주소>]
// 세계 출시(「My Love Coach」)용 App Store Connect 설정. 등록 문구는 docs/store-listing/<언어>.json(언어마다 하나),
// 상품 영어 이름 표는 docs/STORE_LISTING_EN.md, 순서는 docs/GLOBAL_LAUNCH.md. 한국어(ko) 현지화는 절대 건드리지 않는다.
//   --listing      : 있는 언어 파일마다(lib/store-listings.mjs 의 로캘 표: en→en-US·en-GB·en-AU·en-CA, es→es-ES·es-MX …)
//                    편집 중인(PREPARE_FOR_SUBMISSION) 앱 정보에 이름·부제·개인정보 URL(/en/privacy.html),
//                    편집 중인 앱 버전(app.json 버전, 없으면 --apply 때 만든다)에 설명(이모지 제거)·키워드·홍보 문구·지원 URL(/en/support.html)·새 소식.
//                    파일이 없거나 검사(tools/i18n/check-listings.mjs 와 같은 규칙)에 걸린 언어는 건너뛰고 알려 준다
//   --primary-en   : 앱 기본 언어(primaryLocale)를 en-US 로 — 현지화가 없는 스토어 언어와 스크린샷이 없는 로캘이 영어를 쓰게 된다
//   --screenshots <폴더> : 그 폴더의 PNG(이름순)를 en-US 6.7" iPhone 스크린샷(APP_IPHONE_67)으로 — en-US 에만 올린다
//                    (ko 를 뺀 다른 로캘은 기본 언어의 스크린샷을 쓰므로 --primary-en 과 함께)
//   --iap          : 모든 인앱결제·구독에 en-US 이름·설명(문서 표), 판매 지역은 중국 본토만 뺀 전체 + 새 지역 자동.
//                    평생권(mylovecoach.premium.lifetime, 판매 중단)은 영어 이름만 넣고 판매 지역은 그대로 둔다.
//                    가격: 인앱결제는 KOR 기준 가격 일정 → Apple 자동 환산(가격 없는 지역만 알려 줌),
//                          구독은 지역마다 가격이 따로라 KOR 지금 가격의 환산 가격대(equalizations)로 빈 지역 가격을 만든다
//   --availability : 앱 판매 국가를 중국 본토만 뺀 전체 + 새 지역 자동으로 (asc-listing.mjs 의 「대한민국만」과 반대).
//                    공개 중인 앱에 바로 반영되므로 --apply 에는 --confirm-live 가 꼭 있어야 하고, 영어판이 출시된 뒤에만 쓴다
//   --apply        : 실제로 바꾼다. 없으면 GET 으로 지금 상태를 읽고 바꿀 내용만 보여 준다(dry-run)
//   --langs ja,fr  : 그 앱 언어만 (없으면 있는 파일 전부)
// 키 값은 출력하지 않는다. 이미 같은 값이면 건너뛰므로 여러 번 실행해도 안전하다.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { createAscClient, secretsRoot } from './lib/asc-api.mjs';
import { assertEditableVersion, findEditableVersion } from './lib/asc-release-guard.mjs';
import { appJson, checkLimits, checkUrls, EUROPE_ASC, EXCLUDED_ASC, len, LIFETIME_ID, loadListingEn, pngSize, siteOf, stripEmoji, withSite } from './lib/store-listing-en.mjs';
import { ASC_LOCALES, KO_LOCALES, langsOf, loadListings, reportListings } from './lib/store-listings.mjs';

const args = process.argv.slice(2);
const argOf = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
const apply = args.includes('--apply');
const confirmLive = args.includes('--confirm-live');
const doListing = args.includes('--listing');
const doPrimary = args.includes('--primary-en');
const doShots = args.includes('--screenshots');
const shotsArg = argOf('--screenshots');
const doIap = args.includes('--iap');
const doAvail = args.includes('--availability');
/** 유럽(EU·EEA·영국·스위스)은 앱 판매를 미룬다 — 상품 판매 지역은 그대로 */
const holdEurope = args.includes('--hold-europe');

const HELP = `사용법: node tools/asc-global.mjs <할 일> [--apply]
  --listing              언어 파일(docs/store-listing/<언어>.json)마다 이름·부제·개인정보 URL(앱 정보) + 설명·키워드·홍보 문구·지원 URL·새 소식(앱 버전) — ko 는 그대로
  --primary-en           앱 기본 언어를 en-US 로 (현지화·스크린샷이 없는 곳이 영어를 쓰게)
  --screenshots <폴더>    en-US 6.7" iPhone 스크린샷을 그 폴더의 PNG(이름순)로 바꾼다 (en-US 에만)
  --iap                  인앱결제·구독 en-US 이름·설명 + 판매 지역(중국 본토 제외 전체) + 구독 지역별 가격
  --availability         앱 판매 국가를 중국 본토 제외 전체로 — 공개 앱에 바로 반영, --apply 에는 --confirm-live 필요 (영어판 출시 뒤에만)
  --apply                실제로 바꾼다 (없으면 GET 만 하는 dry-run)
  --langs ja,fr          그 앱 언어만 (없으면 있는 파일 전부)
  --secrets <폴더>        열쇠 폴더 (기본 ~/wolha-secrets) · --site <주소> 사이트 주소
순서·주의: docs/GLOBAL_LAUNCH.md`;

const VERSION = appJson().version;
const root = secretsRoot(args);
const SITE = siteOf(args, root);
const LANGS = (() => {
  try {
    return langsOf(args);
  } catch (e) {
    console.error(e.message);
    process.exit(1); // 아직 네트워크를 쓰기 전이라 바로 끝내도 된다
  }
})();
// 상품 이름은 영어 한 벌 (기본 언어가 en-US 가 되면 다른 언어 기기도 이 이름을 본다)
const IAP_LOCALES = ['en-US'];
const EN = loadListingEn(VERSION);
// 영어판 법률 문서 — 한국어가 아닌 모든 로캘이 같은 주소를 쓴다
const PRIVACY_URL = `${SITE}/en/privacy.html`;
const SUPPORT_URL = `${SITE}/en/support.html`;
const SAMPLE = ['USA', 'GBR', 'JPN', 'DEU', 'BRA'];
const TODAY = new Date().toISOString().slice(0, 10);
// 6.7"/6.9" 칸(APP_IPHONE_67)이 받는 크기
const SIZES_67 = new Set(['1290x2796', '2796x1290', '1320x2868', '2868x1320', '1260x2736', '2736x1260']);
const INFO_EDITABLE = new Set(['PREPARE_FOR_SUBMISSION', 'READY_FOR_REVIEW', 'DEVELOPER_REJECTED', 'REJECTED', 'METADATA_REJECTED']);
const FINISHED = new Set(['READY_FOR_SALE', 'READY_FOR_DISTRIBUTION', 'REPLACED_WITH_NEW_VERSION', 'REMOVED_FROM_SALE', 'DEVELOPER_REMOVED_FROM_SALE']);
const LIVE = new Set(['READY_FOR_SALE', 'READY_FOR_DISTRIBUTION']);
const stateOf = (v) => v.attributes.appStoreState ?? v.attributes.appVersionState ?? v.attributes.state;

// API 클라이언트·지역 목록은 실행할 때 채운다 (도움말만 볼 때는 열쇠를 읽지 않는다)
let api, getAll, uploadAsset, findApp;
let currency = new Map();
let WANT = new Set();
const rel = (type, id) => ({ data: { type, id } });
const mark = apply ? '✓' : '·';
const get404 = (path) => api('GET', path).catch((e) => (e.status === 404 ? null : Promise.reject(e)));
const norm = (v) => String(v ?? '').replace(/\r\n/g, '\n').trimEnd();
const preview = (ids, n = 5) => {
  const list = [...ids];
  return list.length ? `${list.slice(0, n).join(', ')}${list.length > n ? ` 외 ${list.length - n}곳` : ''}` : '없음';
};

/** 페이지를 끝까지 따라가며 data·included 를 함께 모은다 (asc-api 의 getAll 은 data 만 모음) */
async function pages(path) {
  const data = [];
  const included = [];
  for (let next = path; next; ) {
    const page = await api('GET', next);
    data.push(...(page.data ?? []));
    included.push(...(page.included ?? []));
    next = page.links?.next;
  }
  return { data, included };
}

/** 가격 목록에서 지역마다 오늘 적용 중인 가격 하나를 고른다 (예약된 미래 가격·끝난 가격 제외) */
function currentPrices({ data, included }, pointType) {
  const points = new Map(included.filter((x) => x.type === pointType).map((x) => [x.id, x.attributes]));
  const out = new Map();
  for (const p of data) {
    const t = p.relationships?.territory?.data?.id;
    const pointId = p.relationships?.[pointType === 'subscriptionPricePoints' ? 'subscriptionPricePoint' : 'inAppPurchasePricePoint']?.data?.id;
    if (!t || !pointId) continue;
    const { startDate, endDate } = p.attributes ?? {};
    if ((startDate && startDate > TODAY) || (endDate && endDate <= TODAY)) continue;
    const prev = out.get(t);
    if (prev && (prev.startDate ?? '') > (startDate ?? '')) continue;
    out.set(t, { startDate, pointId, customerPrice: points.get(pointId)?.customerPrice });
  }
  return out;
}
const money = (t, p) => (p?.customerPrice != null ? `${currency.get(t) ?? ''} ${p.customerPrice}${p.planned ? '*' : ''}`.trim() : '가격 없음');

/**
 * 현지화 하나를 문서 값과 비교하고(--apply 면) 넣는다. 같은 값이면 아무것도 보내지 않는다.
 * show 에 적은 칸은 값을 그대로, 나머지는 글자 수만 보여 준다. all 을 주면 목록을 다시 읽지 않는다(로캘이 많을 때).
 */
async function upsertLocalization({ label, list, all, type, parent, locale, want, show = [], tally }) {
  if (KO_LOCALES.has(locale)) throw new Error(`${locale} 는 한국어 원본이라 건드리지 않는다`);
  const cur = (all ?? (await getAll(list))).find((l) => l.attributes.locale === locale);
  const describe = (k, v) => (show.includes(k) ? `"${v ?? ''}"` : `${len(norm(v))}자`);
  const changed = Object.keys(want).filter((k) => norm(cur?.attributes?.[k]) !== norm(want[k]));
  const state = cur?.attributes?.state ? ` (상태 ${cur.attributes.state})` : '';
  if (tally) tally[cur ? (changed.length ? 'change' : 'same') : 'add']++;
  if (cur && !changed.length) {
    console.log(`  = ${label}: 이미 같음${state}`);
    return cur;
  }
  if (!cur) console.log(`  ${mark} ${label}: 없음 → 새로 넣음${apply ? '' : ' 예정'} — ${Object.keys(want).map((k) => `${k} ${describe(k, want[k])}`).join(' · ')}`);
  else console.log(`  ${mark} ${label}: 바꿈${apply ? '' : ' 예정'}${state} — ${changed.map((k) => `${k} ${describe(k, cur.attributes[k])} → ${describe(k, want[k])}`).join(' · ')}`);
  if (!apply) return cur ?? null;
  if (cur) {
    const attributes = Object.fromEntries(changed.map((k) => [k, want[k]]));
    return (await api('PATCH', `/v1/${type}/${cur.id}`, { data: { type, id: cur.id, attributes } })).data;
  }
  return (await api('POST', `/v1/${type}`, { data: { type, attributes: { locale, ...want }, relationships: parent } })).data;
}

// ───────────── 1) 등록 정보 ─────────────
/**
 * 편집 중인 앱 버전·앱 정보와 그 현지화 목록. create 면(--listing --apply) 버전이 없을 때 app.json 버전으로 만든다.
 * 다른 버전이 심사 중이면 멈춘다 (asc-listing.mjs 와 같은 보호) — dry-run 은 알리고 나머지 확인은 이어 간다.
 */
async function editableTarget(app, versions, create) {
  console.log('\n[편집 대상]');
  let version = null;
  try {
    version = findEditableVersion(versions, VERSION);
  } catch (e) {
    if (apply) throw e;
    console.log(`  ✗ ${e.message} (app.json 버전 ${VERSION} — 영어판 빌드 버전으로 올린 뒤, 심사 중인 버전이 끝나면 다시)`);
    process.exitCode = 1;
    version = false;
  }
  if (version === null && !(apply && create)) console.log(`  · 앱 버전 ${VERSION} 이 아직 없음 → --listing --apply 때 새로 만든다 (편집용 앱 정보도 그때 생긴다)`);
  if (version === null && apply && create) {
    version = (await api('POST', '/v1/appStoreVersions', { data: { type: 'appStoreVersions', attributes: { platform: 'IOS', versionString: VERSION }, relationships: { app: rel('apps', app.id) } } })).data;
    assertEditableVersion(version, VERSION);
    console.log(`  ✓ 앱 버전 ${VERSION} 만듦`);
  } else if (version) console.log(`  ✓ 대상 버전 ${VERSION} (${stateOf(version)})`);

  // 편집 중인 앱 정보 — 이름·부제는 새 버전과 함께 심사를 받아야 바뀐다
  const infos = (await api('GET', `/v1/apps/${app.id}/appInfos`)).data;
  const info = infos.find((i) => INFO_EDITABLE.has(stateOf(i))) ?? null;
  if (!info) {
    const locs = infos[0] ? (await getAll(`/v1/appInfos/${infos[0].id}/appInfoLocalizations?limit=50`)).map((l) => l.attributes.locale) : [];
    const msg = `편집 가능한 앱 정보가 없음 (지금 ${infos.map(stateOf).join(', ')} · 로캘 ${locs.join(', ') || '없음'})`;
    if (apply && create) throw new Error(`${msg} — 새 앱 버전이 있어야 이름·부제를 바꿀 수 있다`);
    console.log(`  · ${msg} — 새 버전이 생기면 함께 생긴다`);
  }
  const target = { version: version || null, info, infoLocs: [], verLocs: [] };
  await refreshTarget(target);
  console.log(`  · 지금 로캘 — 앱 정보: ${target.infoLocs.map((l) => l.attributes.locale).join(', ') || '(편집 중인 것 없음)'} · 버전: ${target.verLocs.map((l) => l.attributes.locale).join(', ') || '(편집 중인 것 없음)'}`);
  return target;
}

async function refreshTarget(target) {
  target.infoLocs = target.info ? await getAll(`/v1/appInfos/${target.info.id}/appInfoLocalizations?limit=200`) : [];
  target.verLocs = target.version ? await getAll(`/v1/appStoreVersions/${target.version.id}/appStoreVersionLocalizations?limit=200`) : [];
}
const hasLocale = (list, locale) => list.some((l) => l.attributes.locale === locale);

// ───────────── 1) 등록 정보 (모든 언어) ─────────────
async function listing(target) {
  console.log('\n[등록 정보 — docs/store-listing/<언어>.json · ko 는 건드리지 않음]');
  const ok = reportListings(loadListings(LANGS), ASC_LOCALES);
  if (!ok.length) throw new Error('쓸 수 있는 언어 파일이 없다 (docs/store-listing/*.json)');
  // App Store 는 설명에 이모지를 못 쓴다 — 뺀 값으로 한도를 다시 본다 (언어 파일 검사는 이모지 포함 길이)
  const items = [];
  for (const r of ok) {
    const description = stripEmoji(withSite(r.data.description, SITE));
    if (len(description) > 4000) {
      console.log(`  ✗ ${r.lang}: 이모지 뺀 설명 ${len(description)}자 > 4000 — 건너뜀`);
      process.exitCode = 1;
      continue;
    }
    for (const locale of ASC_LOCALES[r.lang].filter((l) => !KO_LOCALES.has(l))) items.push({ lang: r.lang, locale, d: r.data, description });
  }
  const terms = [...new Set(items.flatMap((x) => x.description.match(/https:\/\/\S+\/terms\.html/g) ?? []))];
  await checkUrls([PRIVACY_URL, SUPPORT_URL, ...terms]);
  if (!target.info && !target.version) {
    console.log(`  · 편집 중인 앱 정보·버전이 없어 비교만 건너뜀 — 넣을 로캘 ${items.length}개: ${items.map((x) => x.locale).join(', ')}`);
    return;
  }

  const tally = { same: 0, add: 0, change: 0 };
  for (const { locale, d, description } of items) {
    if (target.info)
      await upsertLocalization({
        label: `앱 정보 ${locale}`,
        all: target.infoLocs,
        type: 'appInfoLocalizations',
        parent: { appInfo: rel('appInfos', target.info.id) },
        locale,
        want: { name: d.appName, subtitle: d.subtitle, privacyPolicyUrl: PRIVACY_URL },
        show: ['name', 'subtitle'],
        tally,
      });
    // 앱 정보에 새 로캘을 넣으면 Apple 이 편집 중인 버전에도 같은 로캘(빈 칸)을 자동으로 만든다 — 다시 읽어 그것을 고친다 (2026-11-28, 안 그러면 409)
    if (apply && target.version && !hasLocale(target.verLocs, locale))
      target.verLocs = await getAll(`/v1/appStoreVersions/${target.version.id}/appStoreVersionLocalizations?limit=200`);
    if (target.version)
      await upsertLocalization({
        label: `버전 ${VERSION} ${locale}`,
        all: target.verLocs,
        type: 'appStoreVersionLocalizations',
        parent: { appStoreVersion: rel('appStoreVersions', target.version.id) },
        locale,
        want: { description, keywords: d.keywords, promotionalText: d.promotionalText, supportUrl: SUPPORT_URL, ...(VERSION !== '1.0.0' ? { whatsNew: d.whatsNew } : {}) },
        tally,
      });
  }
  console.log(`  ${mark} 로캘 ${items.length}개 — 새로 ${tally.add} · 바꿈 ${tally.change} · 같음 ${tally.same}${apply ? '' : ' (예정)'}`);
  if (apply) await refreshTarget(target);
}

// ───────────── 1-2) 기본 언어 ─────────────
async function primaryEn(app, target, plannedEn) {
  console.log('\n[기본 언어 (primaryLocale)]');
  const cur = app.attributes.primaryLocale;
  if (cur === 'en-US') {
    console.log('  = 이미 en-US');
    return;
  }
  console.log(`  ${mark} ${cur} → en-US${apply ? '' : ' 예정'} — 현지화가 없는 스토어 언어와 스크린샷이 없는 로캘이 영어(en-US)를 쓰게 된다. ko 등록 정보·스크린샷은 그대로`);
  const hasEn = !!(target?.info && target?.version && hasLocale(target.infoLocs, 'en-US') && hasLocale(target.verLocs, 'en-US'));
  if (hasEn) console.log('  ✓ 편집 중인 앱 정보·버전에 en-US 있음');
  else if (plannedEn) console.log('  · 편집 중인 앱 정보·버전에 en-US 가 아직 없음 — 같은 명령의 --listing --apply 가 먼저 만든다');
  else console.log('  ⚠ 편집 중인 앱 정보·버전에 en-US 가 없음 — --listing --apply 를 먼저 (기본 언어의 등록 정보가 있어야 바꿀 수 있다)');
  if (!apply) return;
  if (!hasEn) throw new Error('편집 중인 앱 정보·버전에 en-US 가 없어 기본 언어를 바꾸지 않았다');
  await api('PATCH', `/v1/apps/${app.id}`, { data: { type: 'apps', id: app.id, attributes: { primaryLocale: 'en-US' } } });
  const after = (await api('GET', `/v1/apps/${app.id}`)).data.attributes.primaryLocale;
  if (after !== 'en-US') throw new Error(`바꾼 뒤 다시 읽은 기본 언어가 ${after}`);
  app.attributes.primaryLocale = after;
  console.log(`  ✓ 기본 언어 확인: ${after}`);
}

// ───────────── 2) 스크린샷 ─────────────
async function screenshots(app, target) {
  console.log('\n[스크린샷 6.7" — en-US 에만]');
  console.log(
    `  · ko 는 그대로, 다른 로캘은 스크린샷이 없으면 기본 언어(지금 ${app.attributes.primaryLocale})의 것을 쓴다${app.attributes.primaryLocale === 'en-US' ? '' : ' — 영어 스크린샷이 보이려면 --primary-en 도 해야 한다'}`,
  );
  const dir = resolve(shotsArg);
  if (!existsSync(dir)) {
    console.log(`· 폴더가 없어 건너뜀: ${dir}`);
    return;
  }
  const files = readdirSync(dir).filter((f) => /\.png$/i.test(f)).sort();
  if (!files.length) {
    console.log(`· PNG 가 없어 건너뜀: ${dir}`);
    return;
  }
  if (files.length > 10) throw new Error(`스크린샷은 10장까지 (${files.length}장)`);
  const local = files.map((f) => {
    const buf = readFileSync(join(dir, f));
    return { f, buf, md5: createHash('md5').update(buf).digest('hex'), size: pngSize(buf) };
  });
  const bad = local.filter((x) => !x.size || !SIZES_67.has(`${x.size.width}x${x.size.height}`));
  if (bad.length) throw new Error(`6.7" 크기가 아닌 파일 — ${bad.map((x) => `${x.f}(${x.size ? `${x.size.width}×${x.size.height}` : 'PNG 아님'})`).join(', ')} · 1290×2796 또는 1320×2868 PNG 여야 한다`);
  console.log(`· 올릴 파일 ${files.length}장 — ${dir}`);
  // --shots-all: 기본 언어를 en-US 로 못 바꿀 때(이미 출시된 버전에 영어 스크린샷이 없음) 한국어 말고 모든 로캘에 영어 스크린샷을 직접 올린다
  const shotLocales = args.includes('--shots-all') ? (target?.verLocs ?? []).map((l) => l.attributes.locale).filter((l) => l !== 'ko') : ['en-US'];
  for (const locale of shotLocales) {
    const vloc = (target?.verLocs ?? []).find((l) => l.attributes.locale === locale);
    if (!vloc) {
      const msg = `${locale}: 편집 중인 버전에 이 로캘 현지화가 아직 없음 — --listing 과 같이 --apply 하면 만든 뒤 올린다`;
      if (apply) throw new Error(msg);
      console.log(`  · ${msg}`);
      continue;
    }
    const sets = await getAll(`/v1/appStoreVersionLocalizations/${vloc.id}/appScreenshotSets?limit=50`);
    let set = sets.find((s) => s.attributes.screenshotDisplayType === 'APP_IPHONE_67');
    const existing = set ? await getAll(`/v1/appScreenshotSets/${set.id}/appScreenshots?limit=50`) : [];
    const same =
      existing.length === local.length &&
      existing.every((s, i) => s.attributes.fileName === local[i].f && s.attributes.sourceFileChecksum === local[i].md5 && s.attributes.assetDeliveryState?.state !== 'FAILED');
    if (same) {
      console.log(`  = ${locale}: 이미 같은 ${existing.length}장`);
      continue;
    }
    console.log(`  ${mark} ${locale}: 지금 ${existing.length}장 → 지우고 ${local.length}장 올림${apply ? '' : ' 예정'}`);
    if (!apply) continue;
    if (!set) set = (await api('POST', '/v1/appScreenshotSets', { data: { type: 'appScreenshotSets', attributes: { screenshotDisplayType: 'APP_IPHONE_67' }, relationships: { appStoreVersionLocalization: rel('appStoreVersionLocalizations', vloc.id) } } })).data;
    for (const s of existing) await api('DELETE', `/v1/appScreenshots/${s.id}`);
    for (const x of local) {
      const shot = (await api('POST', '/v1/appScreenshots', { data: { type: 'appScreenshots', attributes: { fileName: x.f, fileSize: x.buf.length }, relationships: { appScreenshotSet: rel('appScreenshotSets', set.id) } } })).data;
      await uploadAsset('appScreenshots', shot, x.buf);
    }
    console.log(`  ✓ ${locale}: ${local.length}장 올림 (처리는 몇 분 걸린다 — App Store Connect 에서 확인)`);
  }
}

// ───────────── 3) 인앱결제·구독 ─────────────
async function availabilityOf(path, type) {
  const a = await get404(path);
  if (!a?.data) return { exists: false, set: new Set(), newT: false };
  const t = await getAll(`/v1/${type}/${a.data.id}/availableTerritories?limit=200`);
  return { exists: true, set: new Set(t.map((x) => x.id)), newT: a.data.attributes?.availableInNewTerritories === true };
}

/** 판매 지역을 target 으로 (새 지역 자동 켬). 이미 같으면 보내지 않는다 */
async function setAvailability({ type, parentKey, parentId, parentType, path, current, target }) {
  const add = [...target].filter((t) => !current.set.has(t));
  const remove = [...current.set].filter((t) => !target.has(t));
  if (!add.length && !remove.length && current.newT) {
    console.log(`  = 판매 지역: 이미 ${target.size}곳 · 새 지역 자동`);
    return current;
  }
  console.log(
    `  ${mark} 판매 지역: 지금 ${current.set.size}곳(${preview(current.set)}) · 새 지역 자동 ${current.newT ? '켬' : '꺼짐'} → ${target.size}곳 · 새 지역 자동 켬 (+${add.length}${remove.length ? ` / −${remove.join(',')}` : ''})${apply ? '' : ' 예정'}`,
  );
  if (!apply) return current;
  await api('POST', `/v1/${type}`, {
    data: { type, attributes: { availableInNewTerritories: true }, relationships: { [parentKey]: rel(parentType, parentId), availableTerritories: { data: [...target].map((id) => ({ type: 'territories', id })) } } },
  }).catch((e) => {
    if (e.status !== 409) throw e;
  });
  const after = await availabilityOf(path, type);
  const missing = [...target].filter((t) => !after.set.has(t));
  if (missing.length || !after.newT) throw new Error(`판매 지역이 기대와 다름 — 빠진 곳 ${preview(missing)} · 새 지역 자동 ${after.newT ? '켬' : '꺼짐'}`);
  console.log(`  ✓ 판매 지역 확인: ${after.set.size}곳 · 새 지역 자동 켬`);
  return after;
}

async function productText(kind, id, text) {
  if (!text) {
    console.log('  ⚠ STORE_LISTING_EN.md 표에 없는 상품 — 영어 이름을 넣지 않음 (표에 추가한 뒤 다시 실행)');
    return;
  }
  if (!text.description) console.log(`  · 표의 설명 칸이 영어가 아니라 메모라 이름만 넣음: ${text.note || '(빈칸)'}`);
  const want = { name: text.name, ...(text.description ? { description: text.description } : {}) };
  for (const locale of IAP_LOCALES)
    await upsertLocalization(
      kind === 'sub'
        ? { label: `이름·설명 ${locale}`, list: `/v1/subscriptions/${id}/subscriptionLocalizations?limit=50`, type: 'subscriptionLocalizations', parent: { subscription: rel('subscriptions', id) }, locale, want, show: ['name', 'description'] }
        : { label: `이름·설명 ${locale}`, list: `/v2/inAppPurchases/${id}/inAppPurchaseLocalizations?limit=50`, type: 'inAppPurchaseLocalizations', parent: { inAppPurchaseV2: rel('inAppPurchases', id) }, locale, want, show: ['name', 'description'] },
    );
}

async function inApp(iap, text) {
  const a = iap.attributes;
  const row = { pid: a.productId, kind: a.inAppPurchaseType, state: a.state, prices: new Map(), area: '' };
  console.log(`\n· ${a.productId} — ${a.inAppPurchaseType} · ${a.state}`);
  await productText('iap', iap.id, text);

  const path = `/v2/inAppPurchases/${iap.id}/inAppPurchaseAvailability`;
  let avail = await availabilityOf(path, 'inAppPurchaseAvailabilities');
  if (a.productId === LIFETIME_ID) {
    console.log(`  · 판매 지역·가격: 건드리지 않음 (판매 중단 — 이미 산 사람 복원용) · 지금 ${avail.set.size}곳`);
    row.area = `${avail.set.size}곳 (그대로)`;
  } else {
    const before = avail.set.size;
    avail = await setAvailability({ type: 'inAppPurchaseAvailabilities', parentKey: 'inAppPurchase', parentType: 'inAppPurchases', parentId: iap.id, path, current: avail, target: WANT });
    row.area = apply ? `${avail.set.size}곳` : `${before}곳 → ${WANT.size}곳`;
  }

  // 가격 일정: 기준 지역 KOR 이면 다른 지역은 Apple 이 환산(automaticPrices)
  const sched = await get404(`/v2/inAppPurchases/${iap.id}/iapPriceSchedule?include=baseTerritory`);
  if (!sched?.data) {
    console.log('  ⚠ 가격 일정이 없음 — tools/asc-iap.mjs 로 한국 가격부터 정한다');
    return row;
  }
  const base = sched.data.relationships?.baseTerritory?.data?.id;
  console.log(`  ${base === 'KOR' ? '✓' : '⚠'} 가격 기준 지역 ${base ?? '?'}${base === 'KOR' ? ' — 다른 지역은 Apple 자동 환산' : ' — KOR 이 아님 (이 도구는 바꾸지 않는다, App Store Connect 에서 확인)'}`);
  const manual = currentPrices(await pages(`/v1/inAppPurchasePriceSchedules/${sched.data.id}/manualPrices?include=inAppPurchasePricePoint,territory&limit=200`), 'inAppPurchasePricePoints');
  const auto = currentPrices(await pages(`/v1/inAppPurchasePriceSchedules/${sched.data.id}/automaticPrices?include=inAppPurchasePricePoint,territory&limit=200`), 'inAppPurchasePricePoints');
  row.prices = new Map([...auto, ...manual]);
  console.log(`  · 한국 ${money('KOR', row.prices.get('KOR'))} · 가격이 있는 지역 ${row.prices.size}곳 (직접 ${manual.size} · 자동 ${auto.size})`);
  if (a.productId !== LIFETIME_ID) {
    const noPrice = [...WANT].filter((t) => !row.prices.has(t));
    if (noPrice.length) console.log(`  ⚠ 판매 지역인데 가격이 없는 곳 ${noPrice.length}곳: ${preview(noPrice, 12)}${apply ? ' — 방금 넓혔다면 Apple 환산이 몇 분 걸릴 수 있다, 다시 실행해 확인' : ''}`);
    else console.log(`  ✓ 판매할 ${WANT.size}곳 모두 가격 있음`);
  }
  return row;
}

async function subscription(sub, text) {
  const a = sub.attributes;
  const row = { pid: a.productId, kind: `구독 ${a.subscriptionPeriod}`, state: a.state, prices: new Map(), area: '' };
  console.log(`\n· ${a.productId} — 자동 갱신 구독 ${a.subscriptionPeriod} · ${a.state}`);
  await productText('sub', sub.id, text);

  const pricePath = `/v1/subscriptions/${sub.id}/prices?include=subscriptionPricePoint,territory&limit=200`;
  let prices = currentPrices(await pages(pricePath), 'subscriptionPricePoints');
  const kor = prices.get('KOR');
  if (!kor) {
    console.log('  ⚠ 한국 가격이 없어 가격·판매 지역을 건너뜀 (tools/asc-iap.mjs 로 먼저)');
    return row;
  }
  console.log(`  · 한국 ${money('KOR', kor)} · 가격이 있는 지역 ${prices.size}곳`);

  // 구독은 지역마다 가격을 따로 둔다 → 가격 없는 지역에 KOR 가격의 환산 가격대를 만든다 (새 지역이라 기존 구독자 가격 보존은 해당 없음)
  const need = [...WANT].filter((t) => !prices.has(t));
  const eq = new Map();
  if (need.length) {
    const res = await pages(`/v1/subscriptionPricePoints/${kor.pointId}/equalizations?include=territory&limit=200`);
    for (const p of res.data) {
      const t = p.relationships?.territory?.data?.id;
      if (t) eq.set(t, { pointId: p.id, customerPrice: p.attributes.customerPrice, planned: true });
    }
  }
  const noPoint = need.filter((t) => !eq.has(t));
  if (!need.length) console.log(`  = 가격: 판매할 ${WANT.size}곳 모두 있음`);
  else console.log(`  ${mark} 가격: 빈 ${need.length}곳 중 ${need.length - noPoint.length}곳에 KOR 환산 가격${apply ? '' : ' 만들 예정'}${noPoint.length ? ` · 환산 가격대 없음 ${preview(noPoint, 12)}` : ''}`);
  if (apply && need.length) {
    let done = 0;
    const failed = [];
    for (const t of need) {
      const p = eq.get(t);
      if (!p) continue;
      try {
        await api('POST', '/v1/subscriptionPrices', {
          data: { type: 'subscriptionPrices', attributes: { startDate: null, preserveCurrentPrice: false }, relationships: { subscription: rel('subscriptions', sub.id), subscriptionPricePoint: rel('subscriptionPricePoints', p.pointId), territory: rel('territories', t) } },
        });
        done++;
        if (done % 25 === 0) console.log(`    … ${done}/${need.length - noPoint.length}`);
      } catch (e) {
        failed.push(`${t}(${e.message.split(': ').pop()})`);
      }
    }
    console.log(`  ✓ 가격 ${done}곳 만듦${failed.length ? ` · 실패 ${failed.length}곳: ${failed.slice(0, 5).join(', ')}` : ''}`);
    if (failed.length) process.exitCode = 1;
    prices = currentPrices(await pages(pricePath), 'subscriptionPricePoints');
  }
  row.prices = apply ? prices : new Map([...eq, ...prices]);

  // 판매 지역은 가격이 있는(또는 만들 수 있는) 곳만 연다 — 가격 없는 지역을 열지 않는다
  const target = new Set([...WANT].filter((t) => row.prices.has(t)));
  const path = `/v1/subscriptions/${sub.id}/subscriptionAvailability`;
  const before = await availabilityOf(path, 'subscriptionAvailabilities');
  const after = await setAvailability({ type: 'subscriptionAvailabilities', parentKey: 'subscription', parentType: 'subscriptions', parentId: sub.id, path, current: before, target });
  row.area = apply ? `${after.set.size}곳` : `${before.set.size}곳 → ${target.size}곳`;
  return row;
}

async function iap(app) {
  console.log(`\n[인앱결제·구독 — ${IAP_LOCALES.join(', ')} · 목표 판매 지역 ${WANT.size}곳 (중국 본토 제외)]`);
  for (const p of EN.products) checkLimits(`상품 ${p.productId}`, [['이름', p.name, 30], ['설명', p.description, 45, { optional: true }]]);
  if (EN.group) checkLimits('구독 그룹', [['이름', EN.group.name, 75]]);
  const table = new Map(EN.products.map((p) => [p.productId, p]));
  const rows = [];
  const seen = new Set();
  const guard = async (pid, fn) => {
    seen.add(pid);
    try {
      rows.push(await fn());
    } catch (e) {
      console.log(`  ✗ ${pid} — ${e.message}`);
      rows.push({ pid, error: e.message, prices: new Map() });
      process.exitCode = 1;
    }
  };

  for (const g of await getAll(`/v1/apps/${app.id}/subscriptionGroups?limit=50`)) {
    console.log(`\n· 구독 그룹 「${g.attributes.referenceName}」`);
    if (EN.group?.reference === g.attributes.referenceName) {
      for (const locale of IAP_LOCALES)
        await upsertLocalization({
          label: `그룹 이름 ${locale}`,
          list: `/v1/subscriptionGroups/${g.id}/subscriptionGroupLocalizations?limit=50`,
          type: 'subscriptionGroupLocalizations',
          parent: { subscriptionGroup: rel('subscriptionGroups', g.id) },
          locale,
          want: { name: EN.group.name },
          show: ['name'],
        });
    } else console.log('  ⚠ STORE_LISTING_EN.md 표에 이 그룹의 영어 이름이 없어 건너뜀');
    for (const s of await getAll(`/v1/subscriptionGroups/${g.id}/subscriptions?limit=50`)) await guard(s.attributes.productId, () => subscription(s, table.get(s.attributes.productId)));
  }
  for (const i of await getAll(`/v1/apps/${app.id}/inAppPurchasesV2?limit=200`)) await guard(i.attributes.productId, () => inApp(i, table.get(i.attributes.productId)));
  const absent = EN.products.filter((p) => !seen.has(p.productId)).map((p) => p.productId);
  if (absent.length) console.log(`\n⚠ 표에는 있는데 App Store 에 없는 상품: ${absent.join(', ')}`);

  console.log(`\n[가격 예시 — ${SAMPLE.join(' · ')}]${apply ? '' : ' (* = 적용하면 생길 환산 가격)'}`);
  for (const r of rows) {
    if (r.error) {
      console.log(`· ${r.pid}: 실패 — ${r.error}`);
      continue;
    }
    console.log(`· ${r.pid} (${r.kind} · ${r.state}) 판매 지역 ${r.area} — ${['KOR', ...SAMPLE].map((t) => `${t} ${money(t, r.prices.get(t))}`).join(' · ')}`);
  }
  console.log('  ※ 이미 승인된 상품에 영어 이름을 더하면 그 현지화는 심사를 거친다 — 새 앱 버전 제출 때 「앱 내 구입 및 구독」에서 함께 확인');
}

// ───────────── 4) 앱 판매 국가 ─────────────
const STATUS_HELP = {
  TRADER_STATUS_NOT_PROVIDED: 'EU 판매자(DSA) 신고 전 — App Store Connect 웹 → 비즈니스 → 디지털 서비스법(DSA) 판매자 상태를 먼저',
  TRADER_STATUS_VERIFICATION_FAILED: 'EU 판매자(DSA) 확인 실패 — App Store Connect 웹에서 다시 제출',
  TRADER_STATUS_VERIFICATION_STATUS_MISSING: 'EU 판매자(DSA) 확인 대기',
  BRAZIL_REQUIRED_TAX_ID: '브라질 세금 번호 필요 — 계약·세금 정보',
  ICP_NUMBER_MISSING: '중국 ICP 등록번호 없음 (중국은 처음부터 뺀다)',
  ICP_NUMBER_INVALID: '중국 ICP 등록번호 오류 (중국은 처음부터 뺀다)',
  MISSING_RATING: '연령 등급 없음',
  CANNOT_SELL_RESTRICTED_RATING: '연령 등급 때문에 판매 불가',
};

async function availability(app, versions, territories) {
  console.log('\n[앱 판매 국가 — 중국 본토 제외 전체 · 새 지역 자동]');
  console.log('⚠ 공개 중인 앱에 바로 반영된다. 영어판(en-US 등록 정보가 있는 버전)이 승인·출시된 뒤에만 --apply --confirm-live 로 실행한다.');
  const avail = await get404(`/v1/apps/${app.id}/appAvailabilityV2`);
  if (!avail?.data) throw new Error('앱 판매 국가 설정이 아직 없음 — tools/asc-listing.mjs 로 처음 설정부터');
  const read = async () =>
    (await pages(`/v2/appAvailabilities/${avail.data.id}/territoryAvailabilities?include=territory&limit=200`)).data.map((ta) => ({
      id: ta.id,
      territory: ta.relationships?.territory?.data?.id,
      available: ta.attributes?.available === true,
      statuses: ta.attributes?.contentStatuses ?? [],
    }));
  const rows = await read();
  const open = rows.filter((r) => r.available).map((r) => r.territory);
  // 앱 판매 지역 — --hold-europe 면 유럽을 뺀다 (상품 지역 WANT 는 그대로)
  const APP_WANT = holdEurope ? new Set([...WANT].filter((t) => !EUROPE_ASC.includes(t))) : WANT;
  if (holdEurope) console.log(`· 유럽 ${EUROPE_ASC.length}곳은 미룸 (--hold-europe) — GDPR 대리인·DSA 판매자 공개가 정해지면 이 옵션 없이 다시`);
  const toOpen = rows.filter((r) => !r.available && APP_WANT.has(r.territory)).map((r) => r.territory);
  const toClose = rows.filter((r) => r.available && !APP_WANT.has(r.territory)).map((r) => r.territory);
  console.log(`· 지금 판매 ${open.length}곳 (${preview(open)}) · 새 지역 자동 ${avail.data.attributes?.availableInNewTerritories ? '켬' : '꺼짐'}`);
  console.log(`${mark} 바꿀 내용: +${toOpen.length}곳${toClose.length ? ` / −${toClose.join(',')}` : ''} · 새 지역 자동 켬${apply ? '' : ' (예정)'}`);

  // 지역별 판매 가능 상태 — EU DSA 처럼 화면에서 먼저 풀어야 하는 것
  const tally = new Map();
  for (const r of rows.filter((x) => APP_WANT.has(x.territory)))
    for (const s of r.statuses) {
      if (/^(AVAILABLE|PROCESSING_TO_)/.test(s)) continue;
      // 고르지 않아 안 파는 지역은 그냥 「CANNOT_SELL」 — 판매를 켜면 바뀐다 (2026-11-27 확인: 미선택 174곳 모두 이 값)
      if (s === 'CANNOT_SELL' && !r.available) continue;
      tally.set(s, [...(tally.get(s) ?? []), r.territory]);
    }
  if (!tally.size) console.log('✓ 지역별 판매 제약 표시 없음 — 단, 안 파는 지역은 「CANNOT_SELL」만 보여 EU DSA 같은 제약은 판매를 켠 뒤에야 나타난다 (적용 뒤 다시 실행해 확인)');
  for (const [s, ts] of tally) console.log(`⚠ ${s} ${ts.length}곳 (${preview(ts, 8)})${STATUS_HELP[s] ? ` — ${STATUS_HELP[s]}` : s.startsWith('CANNOT_SELL_') ? ' — 연령 등급·콘텐츠 때문에 판매 불가' : ''}`);

  // 미리 확인: 공개 버전에 en-US 가 있는가, 상품이 먼저 세계 판매로 열렸는가
  const live = versions.filter((v) => LIVE.has(stateOf(v))).sort((x, y) => String(y.attributes.createdDate).localeCompare(String(x.attributes.createdDate)))[0];
  const liveLocales = live ? (await getAll(`/v1/appStoreVersions/${live.id}/appStoreVersionLocalizations?limit=50`)).map((l) => l.attributes.locale) : [];
  const enLive = liveLocales.includes('en-US');
  console.log(`${enLive ? '✓' : '✗'} 공개 버전 ${live?.attributes.versionString ?? '없음'} 로캘: ${liveLocales.join(', ') || '없음'}${enLive ? '' : ' — 영어판이 아직 공개 전'}`);
  let ready = 0;
  let total = 0;
  for (const g of await getAll(`/v1/apps/${app.id}/subscriptionGroups?limit=50`))
    for (const s of await getAll(`/v1/subscriptionGroups/${g.id}/subscriptions?limit=50`)) {
      total++;
      if ((await availabilityOf(`/v1/subscriptions/${s.id}/subscriptionAvailability`, 'subscriptionAvailabilities')).set.has('USA')) ready++;
    }
  for (const i of await getAll(`/v1/apps/${app.id}/inAppPurchasesV2?limit=200`)) {
    if (i.attributes.productId === LIFETIME_ID) continue;
    total++;
    if ((await availabilityOf(`/v2/inAppPurchases/${i.id}/inAppPurchaseAvailability`, 'inAppPurchaseAvailabilities')).set.has('USA')) ready++;
  }
  console.log(`${ready === total ? '✓' : '⚠'} 판매 중인 상품 ${total}개 중 ${ready}개가 미국에서 살 수 있음${ready === total ? '' : ' — --iap --apply 를 먼저 (안 하면 해외 이용자가 결제 화면에서 상품을 못 받는다)'}`);

  if (!apply) return;
  if (!enLive) throw new Error('공개 버전에 en-US 등록 정보가 없어 판매 국가를 넓히지 않았다 — 영어판이 출시된 뒤 다시 실행');
  const localId = (i) => '${' + 'terr' + i + '}';
  const included = territories.map((t, i) => ({ type: 'territoryAvailabilities', id: localId(i), attributes: { available: APP_WANT.has(t.id) }, relationships: { territory: rel('territories', t.id) } }));
  try {
    await api('POST', '/v2/appAvailabilities', {
      data: { type: 'appAvailabilities', attributes: { availableInNewTerritories: true }, relationships: { app: rel('apps', app.id), territoryAvailabilities: { data: included.map((x) => ({ type: x.type, id: x.id })) } } },
      included,
    });
    console.log('✓ 판매 국가 설정을 한 번에 바꿈 (새 지역 자동 켬)');
  } catch (e) {
    if (e.status !== 409) throw e;
    // 이미 있는 설정은 다시 만들 수 없을 때: 지역마다 고친다. 「새 지역 자동」은 이 경로로는 못 바꾼다
    console.log(`· 한 번에 바꾸기 거절(409) → 지역마다 고친다 — ${e.message}`);
    let done = 0;
    for (const r of rows.filter((x) => x.available !== APP_WANT.has(x.territory))) {
      await api('PATCH', `/v1/territoryAvailabilities/${r.id}`, { data: { type: 'territoryAvailabilities', id: r.id, attributes: { available: APP_WANT.has(r.territory) } } });
      done++;
    }
    console.log(`✓ ${done}곳 고침 · ⚠ 「새 국가 또는 지역에서 자동으로 사용 가능」은 App Store Connect 웹 → 가격 및 사용 가능 여부에서 직접 켠다`);
  }
  const after = await read();
  console.log(`✓ 확인: 판매 ${after.filter((r) => r.available).length}곳 · 중국 본토 ${after.find((r) => r.territory === 'CHN')?.available ? '판매 중(!)' : '제외'}`);
}

async function main() {
  if (!doListing && !doPrimary && !doShots && !doIap && !doAvail) {
    console.log(HELP);
    return;
  }
  if (args.includes('--locales')) throw new Error('--locales 는 없어졌다 — 로캘은 언어 파일마다 정해진다 (고르려면 --langs ja,fr)');
  if (doShots && (!shotsArg || shotsArg.startsWith('--'))) throw new Error('--screenshots 뒤에 PNG 폴더를 적는다 (예: --screenshots docs/store-assets/ios-6.7-en)');
  // 공개 앱 판매 국가는 실수로 바꾸지 않도록 다른 일보다 먼저 막는다
  if (doAvail && apply && !confirmLive) {
    console.log('✗ 아무것도 바꾸지 않았다 — 앱 판매 국가는 공개 중인 앱에 바로 반영되므로 --apply 에 --confirm-live 를 함께 줘야 한다.');
    console.log('  영어판이 승인·출시된 뒤에만 실행한다 (docs/GLOBAL_LAUNCH.md). 지금 상태만 보려면 --apply 없이 --availability.');
    process.exitCode = 1;
    return;
  }
  ({ api, getAll, uploadAsset, findApp } = createAscClient(root));
  console.log(`${apply ? '실제로 바꾼다 (--apply)' : '확인만 한다 (dry-run — GET 만, 아무것도 바꾸지 않음)'} · app.json 버전 ${VERSION} · 언어 ${LANGS.length === 32 ? '전부' : LANGS.join(', ')} · 사이트 ${SITE}`);
  const app = await findApp();
  if (!app) {
    console.log('앱 레코드를 찾지 못했다 (번들 ID app.mylovecoach.ios).');
    process.exitCode = 2;
    return;
  }
  console.log(`앱: ${app.attributes.name} (id ${app.id}) · 기본 언어 ${app.attributes.primaryLocale}`);
  const versions = await getAll(`/v1/apps/${app.id}/appStoreVersions?filter[platform]=IOS&limit=100`);
  const newestLive = versions.filter((x) => LIVE.has(stateOf(x))).sort((x, y) => String(y.attributes.createdDate).localeCompare(String(x.attributes.createdDate)))[0];
  for (const v of versions.filter((x) => !FINISHED.has(stateOf(x)) || x === newestLive)) {
    const locs = await getAll(`/v1/appStoreVersions/${v.id}/appStoreVersionLocalizations?limit=50`);
    console.log(`· 버전 ${v.attributes.versionString} ${stateOf(v)} — 로캘 ${locs.map((l) => l.attributes.locale).join(', ') || '없음'}`);
  }
  const territories = await getAll('/v1/territories?limit=200');
  currency = new Map(territories.map((t) => [t.id, t.attributes.currency]));
  WANT = new Set(territories.map((t) => t.id).filter((id) => !EXCLUDED_ASC.includes(id)));

  const run = async (label, fn) => {
    try {
      return await fn();
    } catch (e) {
      console.log(`✗ ${label} — ${e.message}`);
      process.exitCode = 1;
      return undefined;
    }
  };
  // 순서: 모든 언어 등록 정보 → 기본 언어 en-US (en-US 가 먼저 있어야 함) → en-US 스크린샷
  let target = null;
  if (doListing || doPrimary || doShots) target = (await run('편집 대상', () => editableTarget(app, versions, doListing))) ?? null;
  if (doListing && target) await run('등록 정보', () => listing(target));
  if (doPrimary) await run('기본 언어', () => primaryEn(app, target, doListing && loadListings(['en'])[0].ok && LANGS.includes('en')));
  if (doShots && target) await run('스크린샷', () => screenshots(app, target));
  if (doIap) await run('인앱결제·구독', () => iap(app));
  if (doAvail) await run('앱 판매 국가', () => availability(app, versions, territories));
  if (!apply) console.log('\n확인만 했다. 실제로 바꾸려면 같은 명령에 --apply (앱 판매 국가는 --apply --confirm-live, 영어판 출시 뒤에만).');
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
