// 스토어 등록 문구 번역 검사 — node tools/i18n/check-listings.mjs [언어 …] (없으면 모든 파일)
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'docs', 'store-listing');
const LIMITS = { appName: 30, subtitle: 30, shortDescription: 80, keywords: 100, promotionalText: 170, description: 4000, whatsNew: 4000 };
const BANNED = /\b(tinder|hinge|bumble|whatsapp|chatgpt|instagram|snapchat|kakao|line app|telegram|grindr|badoo)\b/i;
const len = (s) => [...String(s ?? '')].length;
const langs = process.argv.slice(2).length ? process.argv.slice(2) : readdirSync(dir).filter((f) => f.endsWith('.json') && f !== 'en.json').map((f) => f.replace(/\.json$/, ''));

let failed = 0;
for (const lang of langs) {
  const file = join(dir, `${lang}.json`);
  if (!existsSync(file)) {
    console.log(`✗ ${lang}: 파일 없음`);
    failed++;
    continue;
  }
  let j;
  try {
    j = JSON.parse(readFileSync(file, 'utf8').replace(/^﻿/, ''));
  } catch (e) {
    console.log(`✗ ${lang}: JSON 오류 ${e.message}`);
    failed++;
    continue;
  }
  const p = [];
  for (const [k, max] of Object.entries(LIMITS)) {
    if (!String(j[k] ?? '').trim()) p.push(`${k} 비었음`);
    else if (len(j[k]) > max) p.push(`${k} ${len(j[k])}자 > ${max}`);
  }
  if (j.appName && !String(j.appName).startsWith('My Love Coach')) p.push('appName 이 My Love Coach 로 시작하지 않음');
  if (/[가-힣]/.test(JSON.stringify(j))) p.push('한글 섞임');
  if (j.keywords && /,\s/.test(j.keywords)) p.push('keywords 쉼표 뒤 띄어쓰기');
  if (BANNED.test(`${j.appName} ${j.subtitle} ${j.keywords}`)) p.push('이름·부제·키워드에 다른 앱 이름');
  if (p.length) {
    console.log(`✗ ${lang}: ${p.join(' · ')}`);
    failed++;
  } else console.log(`✓ ${lang}: ${j.appName} | ${j.subtitle}`);
}
if (failed) process.exit(1);
