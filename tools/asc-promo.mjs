// PC 에서 실행: node tools/asc-promo.mjs [--apply] [--secrets <폴더>]
// App Store 「홍보 문구」(170자)를 docs/STORE_LISTING.md 의 「홍보 문구」 칸 그대로 지금 공개된 버전에 넣는다.
// 홍보 문구는 심사 없이 바로 바뀌는 칸이라 새 버전을 내지 않아도 된다. 이름·부제·키워드는 다음 버전(asc-listing.mjs)에서만 바뀐다.
// 기본은 연습(지금 값과 새 값만 보여 줌). --apply 일 때만 바꾼다. 키 값은 출력하지 않는다.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createAscClient, secretsRoot } from './lib/asc-api.mjs';

const LOCALE = 'ko';
const LIMIT = 170;
const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const apply = args.includes('--apply');

const listingMd = readFileSync(join(repo, 'docs', 'STORE_LISTING.md'), 'utf8').replace(/\r\n/g, '\n');
const promo = (listingMd.match(/\*\*홍보 문구[^*]*\*\*:\s*(.+)/) ?? [])[1]?.trim();

async function main() {
  if (!promo) throw new Error('docs/STORE_LISTING.md 에 「홍보 문구」 칸이 없어요.');
  if ([...promo].length > LIMIT) throw new Error(`홍보 문구가 너무 길어요 (${[...promo].length}/${LIMIT}자).`);

  const { api, findApp } = createAscClient(secretsRoot(args));
  const app = await findApp();
  if (!app) throw new Error('App Store 앱을 찾지 못했어요.');
  const versions = await api('GET', `/v1/apps/${app.id}/appStoreVersions?filter[platform]=IOS&limit=20`);
  const live = versions.data.find((v) => v.attributes.appStoreState === 'READY_FOR_SALE' || v.attributes.appVersionState === 'READY_FOR_DISTRIBUTION');
  if (!live) throw new Error('지금 공개된 버전(READY_FOR_SALE)이 없어요.');
  const locs = await api('GET', `/v1/appStoreVersions/${live.id}/appStoreVersionLocalizations`);
  const loc = locs.data.find((l) => l.attributes.locale === LOCALE);
  if (!loc) throw new Error(`${live.attributes.versionString} 에 한국어(${LOCALE}) 설명이 없어요.`);

  const before = loc.attributes.promotionalText ?? '';
  console.log(`공개 버전: ${live.attributes.versionString}`);
  console.log(`지금: ${before || '(비어 있음)'}`);
  console.log(`새로: ${promo} (${[...promo].length}/${LIMIT}자)`);
  if (before === promo) return console.log('이미 같아요. 바꿀 것 없음.');
  if (!apply) return console.log('연습이라 바꾸지 않았어요. 넣으려면 --apply');

  await api('PATCH', `/v1/appStoreVersionLocalizations/${loc.id}`, { data: { type: 'appStoreVersionLocalizations', id: loc.id, attributes: { promotionalText: promo } } });
  const after = (await api('GET', `/v1/appStoreVersionLocalizations/${loc.id}`)).data.attributes.promotionalText;
  if (after !== promo) throw new Error('넣은 뒤 다시 읽은 값이 달라요.');
  console.log('홍보 문구를 바꿨어요 (스토어 페이지에는 몇 분~몇 시간 뒤 보임).');
}

main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1; // Windows 에서 fetch 직후 process.exit() 는 libuv 단언 오류를 낸다
});
