// PC 에서 실행: node tools/play-setup.mjs [--listing] [--products] [--email you@example.com] [--site https://...] [--secrets <폴더>]
// Play Console 에 앱을 만들고 첫 AAB 를 (화면에서) 한 번 올린 뒤에 쓸 수 있다 — 그 전에는 API 가 「Package not found」를 돌려준다.
//   --listing  : 스토어 등록 정보(제목·설명), 아이콘·그래픽 이미지·휴대전화 스크린샷, 연락처
//   --products : 인앱 상품 — 주간 구독 mylovecoach.premium.weekly(기본 요금제 weekly, ₩9,900) + 일회성 mylovecoach.premium.lifetime(₩29,800)
//   옵션이 없으면 둘 다 실행. 여러 번 실행해도 안전하다. 서비스 계정에 이 앱 권한이 있어야 한다 (Play Console → 사용자 및 권한).
// API 로 안 되는 것(화면 작업): 앱 만들기, 첫 AAB 업로드, 앱 콘텐츠 선언(개인정보처리방침·광고·콘텐츠 등급·타겟층·데이터 보안), 가격(무료)·국가.
import { Buffer } from 'node:buffer';
import { createSign } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PACKAGE = 'app.mylovecoach.android';
const LANG = 'ko-KR';
const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const argOf = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
const root = argOf('--secrets') ?? process.env.MYLOVECOACH_SECRETS ?? join(homedir(), 'wolha-secrets');
const SITE = (argOf('--site') ?? (existsSync(join(root, 'mylovecoach-api-url.txt')) ? readFileSync(join(root, 'mylovecoach-api-url.txt'), 'utf8').trim() : 'https://mylovecoach.vercel.app')).replace(/\/+$/, '');
const doListing = args.includes('--listing') || !args.includes('--products');
const doProducts = args.includes('--products') || !args.includes('--listing');

const listingMd = readFileSync(join(repo, 'docs', 'STORE_LISTING.md'), 'utf8');
const field = (label) => (listingMd.match(new RegExp(`\\*\\*${label}[^*]*\\*\\*:\\s*(.+)`)) ?? [])[1]?.trim();
const section = (title) => (listingMd.match(new RegExp(`## ${title}[^\\n]*\\n([\\s\\S]*?)(?=\\n## |$)`)) ?? [])[1]?.trim() ?? '';

const BASE = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PACKAGE}`;
const UPLOAD = `https://androidpublisher.googleapis.com/upload/androidpublisher/v3/applications/${PACKAGE}`;
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
  return sa.client_email;
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
const step = async (label, fn) => {
  try {
    const out = await fn();
    console.log(`✓ ${label}${out ? ` — ${out}` : ''}`);
    return true;
  } catch (e) {
    console.log(`✗ ${label} — ${e.message}`);
    return false;
  }
};

async function listing() {
  const edit = await call('POST', `${BASE}/edits`, {});
  const E = `${BASE}/edits/${edit.id}`;
  const description = section('전체 설명').replaceAll('https://mylovecoach.vercel.app', SITE);
  let ok = await step('제목·짧은 설명·전체 설명', () =>
    call('PUT', `${E}/listings/${LANG}`, { language: LANG, title: field('앱 이름') ?? '나만의 연애코치', shortDescription: field('짧은 설명') ?? '', fullDescription: description }).then(() => `${description.length}자`),
  );
  const email = argOf('--email');
  ok =
    (await step('연락처·기본 언어', async () => {
      const cur = await call('GET', `${E}/details`).catch(() => ({}));
      const contactEmail = email ?? cur.contactEmail;
      if (!contactEmail) throw new Error('연락처 이메일이 없습니다 → --email 로 지정 (스토어에 공개되는 주소)');
      await call('PUT', `${E}/details`, { defaultLanguage: LANG, contactEmail, contactWebsite: SITE });
      return contactEmail === cur.contactEmail ? '기존 이메일 유지' : '이메일 설정';
    })) && ok;

  const images = [
    ['icon', [join(repo, 'docs', 'store-assets', 'play-icon-512.png')]],
    ['featureGraphic', [join(repo, 'docs', 'store-assets', 'feature-graphic-1024x500.png')]],
    ['phoneScreenshots', readdirSync(join(repo, 'docs', 'store-assets', 'play-framed')).filter((f) => /\.png$/i.test(f)).sort().map((f) => join(repo, 'docs', 'store-assets', 'play-framed', f))],
  ];
  for (const [type, files] of images) {
    ok =
      (await step(`이미지: ${type}`, async () => {
        await call('DELETE', `${E}/listings/${LANG}/${type}`);
        for (const f of files) await call('POST', `${UPLOAD}/edits/${edit.id}/listings/${LANG}/${type}?uploadType=media`, readFileSync(f), 'image/png');
        return `${files.length}장`;
      })) && ok;
  }
  if (!ok) {
    await call('DELETE', E).catch(() => {});
    console.log('일부 단계가 실패해 변경 사항을 저장하지 않았습니다.');
    return;
  }
  await step('변경 사항 저장', () => call('POST', `${E}:commit`).then(() => 'Play Console 의 「기본 스토어 등록정보」에 반영됨'));
}

async function products() {
  const weekly = 'mylovecoach.premium.weekly';
  await step(`구독 ${weekly} (₩9,900 / 주)`, async () => {
    const exists = await call('GET', `${BASE}/subscriptions/${weekly}`).catch((e) => (e.status === 404 ? null : Promise.reject(e)));
    if (!exists)
      await call('POST', `${BASE}/subscriptions?productId=${weekly}&regionsVersion.version=2022/02`, {
        packageName: PACKAGE,
        productId: weekly,
        listings: [{ languageCode: LANG, title: '주간 프리미엄', description: '횟수 제한 없는 AI 연애 코칭 (매주 자동 갱신)', benefits: ['코칭 무제한', '다른 답장 더 보기 무제한'] }],
        basePlans: [
          {
            basePlanId: 'weekly',
            autoRenewingBasePlanType: { billingPeriodDuration: 'P1W', gracePeriodDuration: 'P3D', resubscribeState: 'RESUBSCRIBE_STATE_ACTIVE', prorationMode: 'SUBSCRIPTION_PRORATION_MODE_CHARGE_ON_NEXT_BILLING_DATE', legacyCompatible: true },
            regionalConfigs: [{ regionCode: 'KR', newSubscriberAvailability: true, price: { currencyCode: 'KRW', units: '9900' } }],
          },
        ],
      });
    const cur = exists ?? (await call('GET', `${BASE}/subscriptions/${weekly}`));
    const plan = (cur.basePlans ?? []).find((b) => b.basePlanId === 'weekly');
    if (plan?.state !== 'ACTIVE') await call('POST', `${BASE}/subscriptions/${weekly}/basePlans/weekly:activate`, {});
    return exists ? '이미 있음 · 활성 확인' : '생성 · 활성화';
  });

  const lifetime = 'mylovecoach.premium.lifetime';
  await step(`일회성 상품 ${lifetime} (₩29,800)`, async () => {
    const exists = await call('GET', `${BASE}/inappproducts/${lifetime}`).catch((e) => (e.status === 404 ? null : Promise.reject(e)));
    const body = {
      packageName: PACKAGE,
      sku: lifetime,
      status: 'active',
      purchaseType: 'managedUser',
      defaultLanguage: LANG,
      defaultPrice: { priceMicros: '29800000000', currency: 'KRW' },
      listings: { [LANG]: { title: '평생 프리미엄', description: '한 번 결제로 횟수 제한 없는 AI 연애 코칭' } },
    };
    if (exists) await call('PUT', `${BASE}/inappproducts/${lifetime}?autoConvertMissingPrices=true`, body);
    else await call('POST', `${BASE}/inappproducts?autoConvertMissingPrices=true`, body);
    return exists ? '갱신' : '생성';
  });
}

async function main() {
  const who = await authorize();
  const probe = await call('POST', `${BASE}/edits`, {}).catch((e) => e);
  if (probe instanceof Error) {
    console.log(probe.status === 404 ? `아직 Play 에 ${PACKAGE} 패키지가 없습니다. Play Console 에서 앱을 만들고 내부 테스트에 첫 AAB 를 올린 뒤 다시 실행하세요.` : `Play API 접근 실패: ${probe.message}\n→ Play Console → 사용자 및 권한에서 서비스 계정(${who})에 이 앱 권한을 주세요.`);
    process.exitCode = 2;
    return;
  }
  await call('DELETE', `${BASE}/edits/${probe.id}`).catch(() => {});
  if (doListing) await listing();
  if (doProducts) await products();
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
