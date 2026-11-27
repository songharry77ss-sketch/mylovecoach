// PC 에서 실행: node tools/play-global.mjs [--listing [--default-en] [--screenshots <폴더>]] [--products] [--apply] [--langs ja,fr] [--secrets <폴더>] [--site <주소>]
// 세계 출시(「My Love Coach」)용 Google Play 설정. 등록 문구는 docs/store-listing/<언어>.json(언어마다 하나),
// 상품 영어 이름 표는 docs/STORE_LISTING_EN.md, 순서는 docs/GLOBAL_LAUNCH.md. 한국어(ko-KR) 등록 정보는 절대 건드리지 않는다.
//   --listing   : 있는 언어 파일마다(lib/store-listings.mjs 의 언어 표: en→en-US·en-GB·…, es→es-419·es-ES·es-US, he→iw-IL …)
//                 등록 정보(제목 = appName · 짧은 설명 · 전체 설명 = description, 이모지 그대로)를 edits API 로.
//                 파일이 없거나 검사(tools/i18n/check-listings.mjs 와 같은 규칙)에 걸린 언어는 건너뛰고 알려 준다.
//                 --default-en : 기본 언어를 en-US 로(edits.details) — 번역이 없는 기기 언어가 영어를 보게 된다
//                 --screenshots <폴더> : 그 폴더의 PNG(이름순)로 en-US 휴대전화 스크린샷만 바꾼다 (다른 언어는 기본 언어 그래픽을 씀)
//                 --apply 일 때만 저장(commit). 없으면 임시 edit 안에 넣어 Play 검사(validate)만 받고 edit 을 지운다 — 공개 정보는 안 바뀜
//                 출시 노트(언어별 새 소식)는 업로드 도구 몫 — lib/store-listings.mjs 의 playReleaseNotes() 를 쓴다
//   --products  : 일회성 상품·구독마다 en-US 이름·설명(문서 표)을 넣고, Play 가 지원하는 모든 지역에서 팔리게 한다.
//                 지역 가격은 KRW 가격을 monetization.convertRegionPrices 로 환산(계산만 하는 POST), KRW 는 그대로.
//                 평생권(mylovecoach.premium.lifetime, 판매 중단)은 지역을 건드리지 않고 영어 문구만.
//   --apply     : 실제로 바꾼다. 없으면 GET(+임시 edit·가격 환산 계산)만 하는 dry-run
//   --langs ja,fr : 그 앱 언어만 (없으면 있는 파일 전부)
// 앱 자체의 배포 국가는 Publishing API 로 바꿀 수 없다 → 끝에 Play Console 에서 할 일을 출력한다.
// 키 값은 출력하지 않는다. 이미 같은 값이면 보내지 않으므로 여러 번 실행해도 안전하다.
import { Buffer } from 'node:buffer';
import { createHash, createSign } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

import { appJson, checkLimits, checkUrls, EXCLUDED_PLAY, len, LIFETIME_ID, loadListingEn, pngSize, siteOf, withSite } from './lib/store-listing-en.mjs';
import { KO_LOCALES, langsOf, loadListings, PLAY_LOCALES, reportListings } from './lib/store-listings.mjs';

const args = process.argv.slice(2);
const argOf = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
const apply = args.includes('--apply');
const doListing = args.includes('--listing');
const doDefaultEn = args.includes('--default-en');
const doProducts = args.includes('--products');
const doShots = args.includes('--screenshots');
const shotsArg = argOf('--screenshots');
/** en-US 아이콘(512×512)·그래픽 이미지(1024×500) — 기본 언어가 en-US 가 되면 en-US 에 직접 있어야 한다 */
const iconArg = argOf('--icon');
const featureArg = argOf('--feature');
/** --usd day=1.99,daysale=0.99,weekly=5.99,year=19.99 — 요금제·구매 옵션 ID 별 달러 기준가. 한국(KR) 말고 모든 지역을 이 값의 환산 가격으로 맞춘다 */
const USD = Object.fromEntries(
  String(argOf('--usd') ?? '')
    .split(',')
    .map((x) => x.split('=').map((y) => y.trim()))
    .filter(([k, v]) => k && Number(v) > 0)
    .map(([k, v]) => [k, Number(v)]),
);
const usdMoney = (v) => ({ currencyCode: 'USD', units: String(Math.floor(v)), nanos: Math.round((v - Math.floor(v)) * 1e9) });

const HELP = `사용법: node tools/play-global.mjs <할 일> [--apply]
  --listing                 언어 파일(docs/store-listing/<언어>.json)마다 등록 정보(제목·짧은 설명·전체 설명) — ko-KR 은 그대로
  --listing --default-en    기본 언어도 en-US 로 (번역 없는 기기 언어가 영어를 보게)
  --listing --screenshots <폴더>  en-US 휴대전화 스크린샷도 그 폴더의 PNG(이름순)로 바꾼다 (en-US 에만)
  --products                상품 en-US 이름·설명 + 모든 지역 판매(KRW 환산 가격)
  --products --usd day=1.99,weekly=5.99  그 요금제·구매 옵션은 한국 말고 모든 지역을 달러 기준가의 환산 가격으로 (한국 가격은 그대로)
  --apply                   실제로 바꾼다 (없으면 dry-run — 저장하지 않음)
  --langs ja,fr             그 앱 언어만 (없으면 있는 파일 전부)
  --secrets <폴더>           열쇠 폴더 (기본 ~/wolha-secrets) · --site <주소> 사이트 주소
앱 배포 국가는 Play Console 에서 (끝에 안내 출력). 순서·주의: docs/GLOBAL_LAUNCH.md`;

const PACKAGE = appJson().android.package;
const VERSION = appJson().version;
const root = argOf('--secrets') ?? process.env.MYLOVECOACH_SECRETS ?? join(homedir(), 'wolha-secrets');
const SITE = siteOf(args, root);
const LANGS = (() => {
  try {
    return langsOf(args);
  } catch (e) {
    console.error(e.message);
    process.exit(1); // 아직 네트워크를 쓰기 전이라 바로 끝내도 된다
  }
})();
// 상품 이름은 영어 한 벌 (기본 언어가 en-US 가 되면 번역 없는 기기도 이 이름을 본다)
const LOCALES = ['en-US'];
const EN = loadListingEn(VERSION);
const SAMPLE = ['US', 'GB', 'JP', 'DE', 'BR'];
const BASE = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PACKAGE}`;
const UPLOAD = `https://androidpublisher.googleapis.com/upload/androidpublisher/v3/applications/${PACKAGE}`;
const LATENCY = 'PRODUCT_UPDATE_LATENCY_TOLERANCE_LATENCY_SENSITIVE';
const mark = apply ? '✓' : '·';
const norm = (v) => String(v ?? '').replace(/\r\n/g, '\n').trimEnd();
const preview = (ids, n = 6) => (ids.length ? `${ids.slice(0, n).join(', ')}${ids.length > n ? ` 외 ${ids.length - n}곳` : ''}` : '없음');
const fmt = (m) => (m ? `${m.currencyCode} ${(Number(m.units ?? 0) + (m.nanos ?? 0) / 1e9).toFixed(2).replace(/\.00$/, '')}` : '가격 없음');
let accessToken = '';

async function authorize() {
  const sa = JSON.parse(readFileSync(join(root, 'play-service-account.json'), 'utf8'));
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/androidpublisher', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3000 })}`;
  const assertion = `${unsigned}.${createSign('RSA-SHA256').update(unsigned).sign(sa.private_key).toString('base64url')}`;
  const res = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }) });
  const json = await res.json();
  if (!json.access_token) throw new Error(`서비스 계정 인증 실패: ${json.error_description ?? json.error}`);
  accessToken = json.access_token;
}

async function call(method, url, body, contentType = 'application/json') {
  const res = await fetch(url, { method, headers: { Authorization: `Bearer ${accessToken}`, ...(body ? { 'content-type': contentType } : {}) }, body: body == null ? undefined : contentType === 'application/json' ? JSON.stringify(body) : body });
  const json = res.status === 204 ? {} : await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = new Error(`${method} ${url.replace(/^https:\/\/[^/]+/, '').split('?')[0]} → ${res.status}: ${json.error?.message ?? ''}`);
    e.status = res.status;
    throw e;
  }
  return json;
}

async function listAll(url, key) {
  const out = [];
  let token;
  do {
    const page = await call('GET', `${url}${token ? `&pageToken=${encodeURIComponent(token)}` : ''}`);
    out.push(...(page[key] ?? []));
    token = page.nextPageToken;
  } while (token);
  return out;
}

/** 앱 배포 국가(프로덕션 트랙) — 읽기만 된다. 임시 edit 안에서 읽는다 */
async function readCountries(E) {
  return call('GET', `${E}/countryAvailability/production`).then(
    (ca) => ({ codes: (ca.countries ?? []).map((c) => c.countryCode), restOfWorld: ca.restOfWorld === true }),
    (e) => ({ error: e.message }),
  );
}

// ───────────── 1) 등록 정보 ─────────────
function loadShots() {
  const dir = resolve(shotsArg);
  if (!existsSync(dir)) {
    console.log(`· 스크린샷 폴더가 없어 건너뜀: ${dir}`);
    return null;
  }
  const files = readdirSync(dir).filter((f) => /\.png$/i.test(f)).sort();
  if (!files.length) {
    console.log(`· PNG 가 없어 스크린샷은 건너뜀: ${dir}`);
    return null;
  }
  if (files.length < 2 || files.length > 8) throw new Error(`휴대전화 스크린샷은 2~8장 (${files.length}장)`);
  const shots = files.map((f) => {
    const buf = readFileSync(join(dir, f));
    return { f, buf, sha256: createHash('sha256').update(buf).digest('hex'), size: pngSize(buf) };
  });
  // Play 규칙: 한 변 320~3840px, 긴 변이 짧은 변의 2배 이하
  const bad = shots.filter(({ size: s }) => !s || Math.min(s.width, s.height) < 320 || Math.max(s.width, s.height) > 3840 || Math.max(s.width, s.height) > 2 * Math.min(s.width, s.height));
  if (bad.length) throw new Error(`Play 스크린샷 크기 규칙(한 변 320~3840px, 긴 변 ≤ 짧은 변×2)에 안 맞는 파일: ${bad.map((x) => `${x.f}(${x.size ? `${x.size.width}×${x.size.height}` : 'PNG 아님'})`).join(', ')}`);
  console.log(`· 올릴 스크린샷 ${shots.length}장 — ${dir}`);
  return shots;
}

async function replaceShots(E, editId, locale, shots) {
  const cur = (await call('GET', `${E}/listings/${locale}/phoneScreenshots`).catch((e) => (e.status === 404 ? {} : Promise.reject(e)))).images ?? [];
  if (cur.length === shots.length && cur.every((img, i) => (img.sha256 ?? '').toLowerCase() === shots[i].sha256)) {
    console.log(`  = ${locale} 휴대전화 스크린샷: 이미 같은 ${cur.length}장`);
    return false;
  }
  console.log(`  ${mark} ${locale} 휴대전화 스크린샷: 지금 ${cur.length}장 → ${shots.length}장${apply ? '' : ' 예정 (dry-run 은 올리지 않음)'}`);
  if (!apply) return false;
  await call('DELETE', `${E}/listings/${locale}/phoneScreenshots`);
  for (const s of shots) await call('POST', `${UPLOAD}/edits/${editId}/listings/${locale}/phoneScreenshots?uploadType=media`, s.buf, 'image/png');
  return true;
}

/** edits.validate — dry-run 은 실패를 알리고 이어 가고, --apply 는 멈춘다 */
async function validate(E, label) {
  try {
    await call('POST', `${E}:validate`);
    console.log(`✓ Play 검사(edits.validate) 통과 — ${label}`);
    return true;
  } catch (e) {
    if (apply) throw e;
    console.log(`✗ Play 검사(edits.validate) 실패 — ${label}: ${e.message}`);
    process.exitCode = 1;
    return false;
  }
}

async function listing() {
  console.log('\n[스토어 등록 정보 — docs/store-listing/<언어>.json · ko-KR 은 건드리지 않음]');
  const ok = reportListings(loadListings(LANGS), PLAY_LOCALES);
  const items = ok.flatMap((r) =>
    PLAY_LOCALES[r.lang]
      .filter((l) => !KO_LOCALES.has(l))
      .map((language) => ({ lang: r.lang, language, want: { title: r.data.appName, shortDescription: r.data.shortDescription, fullDescription: withSite(r.data.description, SITE) } })),
  );
  if (!items.length && !doDefaultEn && !doShots) throw new Error('쓸 수 있는 언어 파일이 없다 (docs/store-listing/*.json)');
  await checkUrls([...new Set(items.flatMap((x) => x.want.fullDescription.match(/https:\/\/[^\s)]+/g) ?? []))]);
  const shots = doShots ? loadShots() : null;

  const edit = await call('POST', `${BASE}/edits`, {});
  const E = `${BASE}/edits/${edit.id}`;
  let committed = false;
  try {
    const details = await call('GET', `${E}/details`);
    const { listings = [] } = await call('GET', `${E}/listings`);
    console.log(`· 기본 언어 ${details.defaultLanguage} · 지금 등록 정보 언어 ${listings.map((l) => l.language).join(', ') || '없음'}`);
    if (!doDefaultEn && details.defaultLanguage !== 'en-US') console.log(`  ⚠ 기본 언어가 ${details.defaultLanguage} — 번역이 없는 기기 언어에는 이 등록 정보가 보인다 (--default-en)`);
    const countries = await readCountries(E);
    let changed = false;
    const tally = { same: 0, add: 0, change: 0, failed: 0 };
    for (const { language, want } of items) {
      const cur = listings.find((l) => l.language === language);
      const diff = Object.keys(want).filter((k) => norm(cur?.[k]) !== norm(want[k]));
      if (cur && !diff.length) {
        tally.same++;
        console.log(`  = ${language}: 이미 같음`);
        continue;
      }
      console.log(
        `  ${mark} ${language}: ${cur ? `바꿈 — ${diff.map((k) => `${k} ${len(cur[k])}→${len(want[k])}자`).join(' · ')}` : `새로 — 제목 "${want.title}" · 짧은 설명 ${len(want.shortDescription)}자 · 전체 설명 ${len(want.fullDescription)}자`}${apply ? '' : ' 예정'}`,
      );
      // dry-run 에서도 임시 edit 안에는 넣어 본다 — Play 가 직접 검사하게. 저장(commit)은 --apply 때만
      try {
        await call('PUT', `${E}/listings/${language}`, { language, ...want, ...(cur?.video ? { video: cur.video } : {}) });
        tally[cur ? 'change' : 'add']++;
        changed = true;
      } catch (e) {
        if (apply) throw e;
        tally.failed++;
        process.exitCode = 1;
        console.log(`  ✗ ${language}: Play 가 거절 — ${e.message}`);
      }
    }
    if (items.length) console.log(`  ${mark} 언어 ${items.length}개 — 새로 ${tally.add} · 바꿈 ${tally.change} · 같음 ${tally.same}${tally.failed ? ` · 거절 ${tally.failed}` : ''}${apply ? '' : ' (예정)'}`);

    const defaultAfter = doDefaultEn ? 'en-US' : details.defaultLanguage;
    if (shots) {
      console.log(`  · 스크린샷은 en-US 에만 — ko-KR 은 그대로, 다른 언어는 기본 언어(${defaultAfter}) 그래픽을 쓴다${defaultAfter === 'en-US' ? '' : ' → 영어 스크린샷이 보이려면 --default-en 도'}`);
      changed = (await replaceShots(E, edit.id, 'en-US', shots)) || changed;
    } else if (!doShots) console.log('  · 스크린샷을 안 주면 모든 언어에 기본 언어(지금 한국어) 그래픽이 보인다 — --screenshots <폴더> (en-US 에만 올림)');
    // en-US 아이콘·그래픽 이미지 (--icon · --feature)
    for (const [type, file, label] of [['icon', iconArg, '아이콘'], ['featureGraphic', featureArg, '그래픽 이미지']]) {
      if (!file) continue;
      const buf = readFileSync(resolve(file));
      const sha = createHash('sha256').update(buf).digest('hex');
      const cur = (await call('GET', `${E}/listings/en-US/${type}`).catch(() => ({}))).images ?? [];
      if (cur.length === 1 && (cur[0].sha256 ?? '').toLowerCase() === sha) {
        console.log(`  = en-US ${label}: 이미 같음`);
        continue;
      }
      console.log(`  ${mark} en-US ${label}: 지금 ${cur.length}장 → ${file}${apply ? '' : ' 예정'}`);
      if (apply) {
        await call('DELETE', `${E}/listings/en-US/${type}`).catch(() => {});
        await call('POST', `${UPLOAD}/edits/${edit.id}/listings/en-US/${type}?uploadType=media`, buf, 'image/png');
        changed = true;
      }
    }
    await validate(E, '등록 정보');

    if (doDefaultEn) {
      console.log('\n[기본 언어 (edits.details)]');
      if (details.defaultLanguage === 'en-US') console.log('  = 이미 en-US');
      else {
        console.log(`  ${mark} ${details.defaultLanguage} → en-US${apply ? '' : ' 예정 (임시 edit 안에서만 바꿔 검사)'} — 번역이 없는 기기 언어가 영어를 보게 된다. ko-KR 등록 정보는 그대로`);
        const hasEn = listings.some((l) => l.language === 'en-US') || (items.some((x) => x.language === 'en-US') && !tally.failed);
        if (!hasEn) {
          if (apply) throw new Error('en-US 등록 정보가 없어 기본 언어를 바꾸지 않았다 — en.json 을 먼저');
          console.log('  ⚠ en-US 등록 정보가 없다 — en.json 이 있어야 바꿀 수 있다');
        }
        // 기본 언어가 되면 그래픽을 다른 언어에서 빌려 올 수 없다 — en-US 에 직접 있어야 한다
        const count = async (type) => ((await call('GET', `${E}/listings/en-US/${type}`).catch(() => ({}))).images ?? []).length;
        const g = { icon: await count('icon'), featureGraphic: await count('featureGraphic'), phoneScreenshots: await count('phoneScreenshots') };
        const planned = shots && !apply ? ` (dry-run 이라 아직 안 올림 — --apply 면 ${shots.length}장)` : '';
        const full = g.icon >= 1 && g.featureGraphic >= 1 && (g.phoneScreenshots >= 2 || (shots && !apply));
        console.log(`  ${full ? '✓' : '⚠'} en-US 그래픽: 아이콘 ${g.icon} · 그래픽 이미지 ${g.featureGraphic} · 휴대전화 스크린샷 ${g.phoneScreenshots}${planned}${full ? '' : ' — 기본 언어가 되면 en-US 에 직접 있어야 한다 (Play Console 에서 아이콘·그래픽 이미지 추가, 스크린샷은 --screenshots)'}`);
        // Play 는 모든 인앱 상품(판매 중단 포함)에 새 기본 언어 번역이 있어야 기본 언어를 바꿔 준다 (2026-11-27 validate 403 으로 확인)
        const noEn = [];
        for (const s of await listAll(`${BASE}/subscriptions?pageSize=100&showArchived=true`, 'subscriptions')) if (!(s.listings ?? []).some((l) => l.languageCode === 'en-US')) noEn.push(`${s.productId}${s.archived ? '(보관)' : ''}`);
        for (const o of await listAll(`${BASE}/oneTimeProducts?pageSize=100`, 'oneTimeProducts')) if (!(o.listings ?? []).some((l) => l.languageCode === 'en-US')) noEn.push(o.productId);
        console.log(
          `  ${noEn.length ? '⚠' : '✓'} 상품 en-US 번역: ${noEn.length ? `없는 것 ${noEn.length}개 (${noEn.join(', ')}) — Play 는 모든 인앱 상품(판매 중단 포함)에 en-US 번역이 있어야 기본 언어를 바꿔 준다 → --products --apply 먼저 (평생권은 STORE_LISTING_EN.md 표에 영어 설명 필요)` : '모두 있음'}`,
        );
        if (hasEn) {
          await call('PATCH', `${E}/details`, { defaultLanguage: 'en-US' });
          changed = true;
          await validate(E, '기본 언어 en-US');
        }
      }
    }

    if (!apply) console.log('· 임시 edit 을 지움 — 저장하지 않음');
    else if (!changed) console.log('= 바뀐 것이 없어 저장하지 않음');
    else {
      await call('POST', `${E}:commit`);
      committed = true;
      console.log('✓ 저장(commit) — Play Console 「스토어 등록정보」에 반영 (등록 정보 변경은 Google 검토를 거칠 수 있다)');
    }
    return countries;
  } finally {
    if (!committed) await call('DELETE', E).catch(() => {});
  }
}

// ───────────── 2) 상품 ─────────────
/** listings 배열에 영어 문구를 넣은 사본과 바뀐 언어 목록 (한국어 등 다른 언어·혜택 문구는 그대로) */
function withListings(listings, text) {
  const next = structuredClone(listings ?? []);
  const changes = [];
  for (const languageCode of LOCALES) {
    const want = { title: text.name, ...(text.description ? { description: text.description } : {}) };
    const cur = next.find((l) => l.languageCode === languageCode);
    if (cur && cur.title === want.title && (cur.description ?? '') === (want.description ?? '')) continue;
    if (cur) Object.assign(cur, want);
    else next.push({ languageCode, ...want });
    changes.push(`${languageCode} ${cur ? '바꿈' : '새로'}`);
  }
  return { next, changes };
}

async function products() {
  console.log(`\n[인앱 상품 — ${LOCALES.join(', ')} · Play 가 지원하는 모든 지역 · KRW 는 그대로]`);
  for (const p of EN.products) checkLimits(`상품 ${p.productId}`, [['이름', p.name, 55], ['설명', p.description, 80, { optional: true }]]);
  const table = new Map(EN.products.map((p) => [p.productId, p]));
  const conversions = new Map();
  /** KRW 가격 하나를 모든 지역 가격으로 환산 (계산만 — 아무것도 바꾸지 않는 POST) */
  const convert = (price) => {
    const key = `${price.currencyCode}:${price.units}:${price.nanos ?? 0}`;
    if (!conversions.has(key)) conversions.set(key, call('POST', `${BASE}/pricing:convertRegionPrices`, { price: { currencyCode: price.currencyCode, units: String(price.units ?? '0'), nanos: price.nanos ?? 0 } }));
    return conversions.get(key);
  };
  /** 지역 설정 배열에 빠진 지역을 환산 가격으로 더한다 */
  const addRegions = (configs, conv, make) => {
    const have = new Set(configs.map((c) => c.regionCode));
    const added = [];
    for (const [code, cp] of Object.entries(conv.convertedRegionPrices ?? {})) {
      if (have.has(code) || EXCLUDED_PLAY.includes(code) || !cp?.price) continue;
      configs.push(make(code, cp.price));
      added.push(code);
    }
    return added;
  };
  /** 달러 기준가 환산값으로 KR 말고 모든 지역 가격을 맞춘다 — 바뀐 지역 수 */
  const reprice = (configs, conv, make) => {
    let changed = 0;
    for (const [code, cp] of Object.entries(conv.convertedRegionPrices ?? {})) {
      if (code === 'KR' || EXCLUDED_PLAY.includes(code) || !cp?.price) continue;
      const cur = configs.find((c) => c.regionCode === code);
      if (!cur) {
        configs.push(make(code, cp.price));
        changed++;
      } else if (fmt(cur.price) !== fmt(cp.price)) {
        cur.price = cp.price;
        changed++;
      }
    }
    return changed;
  };
  const samples = (configs, added) => new Map(SAMPLE.map((r) => [r, configs.find((c) => c.regionCode === r)?.price ? { price: configs.find((c) => c.regionCode === r).price, planned: !apply && added.includes(r) } : null]));

  const rows = [];
  const seen = new Set();
  const guard = async (pid, fn) => {
    seen.add(pid);
    try {
      rows.push(await fn());
    } catch (e) {
      console.log(`  ✗ ${pid} — ${e.message}`);
      rows.push({ pid, error: e.message });
      process.exitCode = 1;
    }
  };

  // 구독 (주간 구독·1년권 선불 요금제)
  for (const sub of (await listAll(`${BASE}/subscriptions?pageSize=100`, 'subscriptions')).filter((s) => !s.archived))
    await guard(sub.productId, async () => {
      const pid = sub.productId;
      const text = table.get(pid);
      console.log(`\n· ${pid} — 구독 · 기본 요금제 ${(sub.basePlans ?? []).map((b) => `${b.basePlanId}:${b.state}`).join(', ')}`);
      const next = structuredClone(sub);
      const mask = new Set();
      let version = null;
      const row = { pid, kind: '구독', area: [], samples: new Map() };
      if (!text) console.log('  ⚠ STORE_LISTING_EN.md 표에 없는 상품 — 영어 문구를 넣지 않음');
      else {
        const { next: l, changes } = withListings(sub.listings, text);
        if (changes.length) {
          next.listings = l;
          mask.add('listings');
        }
        console.log(changes.length ? `  ${mark} 영어 이름·설명 "${text.name}": ${changes.join(', ')}${apply ? '' : ' 예정'}` : '  = 영어 이름·설명: 이미 같음');
      }
      if (pid === LIFETIME_ID) console.log('  · 판매 지역: 건드리지 않음 (판매 중단)');
      else
        for (const plan of next.basePlans ?? []) {
          const configs = (plan.regionalConfigs ??= []);
          const kr = configs.find((c) => c.regionCode === 'KR');
          if (plan.state !== 'ACTIVE' || !kr?.price) {
            console.log(`  · 요금제 ${plan.basePlanId}: ${plan.state}${kr?.price ? '' : ' · KR 가격 없음'} — 건드리지 않음`);
            continue;
          }
          const usd = USD[plan.basePlanId];
          const conv = await convert(usd ? usdMoney(usd) : kr.price);
          version = conv.regionVersion?.version ?? version;
          const before = configs.length;
          const added = addRegions(configs, conv, (regionCode, price) => ({ regionCode, newSubscriberAvailability: true, price }));
          const repriced = usd ? reprice(configs, conv, (regionCode, price) => ({ regionCode, newSubscriberAvailability: true, price })) : 0;
          if (repriced) {
            mask.add('basePlans');
            console.log(`  ${mark} 요금제 ${plan.basePlanId}: 달러 기준 USD ${usd} 로 ${repriced}곳 가격 맞춤 (KR 그대로)${apply ? '' : ' 예정'}`);
          }
          const other = conv.convertedOtherRegionsPrice;
          const newRegions = !!other && plan.otherRegionsConfig?.newSubscriberAvailability !== true;
          if (newRegions || (usd && other)) plan.otherRegionsConfig = { usdPrice: other.usdPrice, eurPrice: other.eurPrice, newSubscriberAvailability: true };
          if (added.length || newRegions) mask.add('basePlans');
          console.log(`  ${added.length || newRegions ? mark : '='} 요금제 ${plan.basePlanId}: KR ${fmt(kr.price)} · 지역 ${before}곳 → ${configs.length}곳${added.length ? ` (+${added.length})` : ''}${newRegions ? ' · 새 지역 자동 켬' : ''}${added.length || newRegions ? (apply ? '' : ' 예정') : ' 이미 같음'}`);
          row.area.push(`${plan.basePlanId} ${apply ? configs.length : `${before}→${configs.length}`}곳`);
          if (!row.samples.size) row.samples = samples(configs, added);
        }
      if (apply && mask.size) {
        const v = version ?? sub.regionsVersion?.version ?? '2022/02';
        await call('PATCH', `${BASE}/subscriptions/${pid}?updateMask=${[...mask].join(',')}&regionsVersion.version=${encodeURIComponent(v)}&latencyTolerance=${LATENCY}`, next);
        const after = await call('GET', `${BASE}/subscriptions/${pid}`);
        console.log(`  ✓ 저장 확인 — ${(after.basePlans ?? []).map((b) => `${b.basePlanId} ${b.regionalConfigs?.length ?? 0}곳`).join(', ')} · 언어 ${(after.listings ?? []).map((l) => l.languageCode).join(', ')}`);
      }
      return row;
    });

  // 일회성 상품 (하루 이용권·특가·횟수권·평생권)
  for (const otp of await listAll(`${BASE}/oneTimeProducts?pageSize=100`, 'oneTimeProducts'))
    await guard(otp.productId, async () => {
      const pid = otp.productId;
      const text = table.get(pid);
      console.log(`\n· ${pid} — 일회성 · 구매 옵션 ${(otp.purchaseOptions ?? []).map((o) => `${o.purchaseOptionId}:${o.state}`).join(', ')}`);
      const next = structuredClone(otp);
      const mask = new Set();
      let version = null;
      const row = { pid, kind: '일회성', area: [], samples: new Map() };
      if (!text) console.log('  ⚠ STORE_LISTING_EN.md 표에 없는 상품 — 영어 문구를 넣지 않음');
      else if (!text.description) console.log(`  ⚠ 표의 설명 칸이 영어가 아니라 메모(${text.note || '빈칸'}) — Play 일회성 상품은 설명이 꼭 있어야 해서 영어 문구를 건너뜀 (표에 영어 설명을 채우면 다시 실행)`);
      else {
        const { next: l, changes } = withListings(otp.listings, text);
        if (changes.length) {
          next.listings = l;
          mask.add('listings');
        }
        console.log(changes.length ? `  ${mark} 영어 이름·설명 "${text.name}": ${changes.join(', ')}${apply ? '' : ' 예정'}` : '  = 영어 이름·설명: 이미 같음');
      }
      if (pid === LIFETIME_ID) console.log('  · 판매 지역·가격: 건드리지 않음 (판매 중단 — 이미 산 사람 복원용)');
      else
        for (const opt of next.purchaseOptions ?? []) {
          const configs = (opt.regionalPricingAndAvailabilityConfigs ??= []);
          const kr = configs.find((c) => c.regionCode === 'KR');
          if (opt.state !== 'ACTIVE' || !kr?.price) {
            console.log(`  · 구매 옵션 ${opt.purchaseOptionId}: ${opt.state}${kr?.price ? '' : ' · KR 가격 없음'} — 건드리지 않음`);
            continue;
          }
          const usd = USD[opt.purchaseOptionId];
          const conv = await convert(usd ? usdMoney(usd) : kr.price);
          version = conv.regionVersion?.version ?? version;
          const before = configs.length;
          const added = addRegions(configs, conv, (regionCode, price) => ({ regionCode, price, availability: 'AVAILABLE' }));
          const repriced = usd ? reprice(configs, conv, (regionCode, price) => ({ regionCode, price, availability: 'AVAILABLE' })) : 0;
          if (repriced) {
            mask.add('purchaseOptions');
            console.log(`  ${mark} 구매 옵션 ${opt.purchaseOptionId}: 달러 기준 USD ${usd} 로 ${repriced}곳 가격 맞춤 (KR 그대로)${apply ? '' : ' 예정'}`);
          }
          const other = conv.convertedOtherRegionsPrice;
          const newRegions = !!other && opt.newRegionsConfig?.availability !== 'AVAILABLE';
          if (newRegions || (usd && other)) opt.newRegionsConfig = { usdPrice: other.usdPrice, eurPrice: other.eurPrice, availability: 'AVAILABLE' };
          if (added.length || newRegions) mask.add('purchaseOptions');
          console.log(`  ${added.length || newRegions ? mark : '='} 구매 옵션 ${opt.purchaseOptionId}: KR ${fmt(kr.price)} · 지역 ${before}곳 → ${configs.length}곳${added.length ? ` (+${added.length})` : ''}${newRegions ? ' · 새 지역 자동 켬' : ''}${added.length || newRegions ? (apply ? '' : ' 예정') : ' 이미 같음'}`);
          row.area.push(`${opt.purchaseOptionId} ${apply ? configs.length : `${before}→${configs.length}`}곳`);
          if (!row.samples.size) row.samples = samples(configs, added);
        }
      if (apply && mask.size) {
        const v = version ?? otp.regionsVersion?.version ?? '2022/02';
        await call('POST', `${BASE}/oneTimeProducts:batchUpdate`, { requests: [{ oneTimeProduct: next, updateMask: [...mask].join(','), regionsVersion: { version: v }, latencyTolerance: LATENCY }] });
        const after = await call('GET', `${BASE}/oneTimeProducts/${pid}`);
        console.log(`  ✓ 저장 확인 — ${(after.purchaseOptions ?? []).map((o) => `${o.purchaseOptionId}:${o.state} ${o.regionalPricingAndAvailabilityConfigs?.length ?? 0}곳`).join(', ')} · 언어 ${(after.listings ?? []).map((l) => l.languageCode).join(', ')}`);
      }
      return row;
    });

  const absent = EN.products.filter((p) => !seen.has(p.productId)).map((p) => p.productId);
  if (absent.length) console.log(`\n⚠ 표에는 있는데 Play 에 없는 상품: ${absent.join(', ')}`);
  const versions = [...new Set((await Promise.all(conversions.values())).map((c) => c.regionVersion?.version).filter(Boolean))];
  console.log(`\n[가격 예시 — ${SAMPLE.join(' · ')}]${apply ? '' : ' (* = 적용하면 생길 환산 가격)'} · 환산 기준 지역 버전 ${versions.join(', ') || '?'}`);
  for (const r of rows) {
    if (r.error) console.log(`· ${r.pid}: 실패 — ${r.error}`);
    else if (!r.samples.size) console.log(`· ${r.pid} (${r.kind}) — 지역 그대로`);
    else console.log(`· ${r.pid} (${r.kind}) ${r.area.join(', ')} — ${SAMPLE.map((c) => `${c} ${r.samples.get(c) ? `${fmt(r.samples.get(c).price)}${r.samples.get(c).planned ? '*' : ''}` : '없음'}`).join(' · ')}`);
  }
  console.log('  ※ 구독 혜택 쿠폰·무료 체험 같은 제안(offer)은 지역을 따로 갖는다 — 새 지역에는 기본 요금제 가격만 적용된다');
}

function countryHelp(countries) {
  console.log('\n[앱 배포 국가 — Publishing API 로는 못 바꾼다 · Play Console 에서 직접]');
  if (countries?.error) console.log(`  지금: 읽지 못함 — ${countries.error}`);
  else if (countries) console.log(`  지금 프로덕션: ${countries.codes.length}곳 (${preview(countries.codes)})${countries.restOfWorld ? ' · 나머지 지역 포함' : ''}`);
  console.log('  1) Play Console → 앱 → 테스트 및 출시 → 프로덕션 → 「국가/지역」 탭');
  console.log('  2) 「국가/지역 추가」 → 전체 선택 → 추가 (뺄 곳 없음 — 중국 본토는 Google Play 가 없어 목록에 없다)');
  console.log('  3) 「게시 개요」에서 변경 사항을 검토로 보낸다');
  console.log('  ※ 먼저 영어 등록 정보(--listing --apply)·상품 지역(--products --apply)을 끝낸 뒤에 연다');
}

async function main() {
  if (!doListing && !doProducts) {
    console.log(HELP);
    return;
  }
  if ((doShots || doDefaultEn) && !doListing) throw new Error('--screenshots·--default-en 은 --listing 과 함께 쓴다');
  if (args.includes('--locales')) throw new Error('--locales 는 없어졌다 — 언어는 언어 파일마다 정해진다 (고르려면 --langs ja,fr)');
  if (doShots && (!shotsArg || shotsArg.startsWith('--'))) throw new Error('--screenshots 뒤에 PNG 폴더를 적는다');
  console.log(`${apply ? '실제로 바꾼다 (--apply)' : '확인만 한다 (dry-run — 저장하지 않음)'} · ${PACKAGE} · 언어 ${LANGS.length === 32 ? '전부' : LANGS.join(', ')} · 사이트 ${SITE}`);
  await authorize();
  let countries = null;
  if (doListing)
    countries = await listing().catch((e) => {
      console.log(`✗ 등록 정보 — ${e.message}`);
      process.exitCode = 1;
      return null;
    });
  else {
    // 배포 국가만 읽으려고 임시 edit 을 열고 바로 지운다
    const edit = await call('POST', `${BASE}/edits`, {});
    countries = await readCountries(`${BASE}/edits/${edit.id}`);
    await call('DELETE', `${BASE}/edits/${edit.id}`).catch(() => {});
  }
  if (doProducts)
    await products().catch((e) => {
      console.log(`✗ 상품 — ${e.message}`);
      process.exitCode = 1;
    });
  countryHelp(countries);
  if (!apply) console.log('\n확인만 했다. 실제로 바꾸려면 같은 명령에 --apply.');
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
