// 번역 사전 검사 — node tools/i18n/check-dicts.mjs [언어 …] (없으면 모든 사전)
// 빠진 문장 · 자리표 불일치 · 빈 번역 · 한글 섞임 · 원본에 없는 열쇠 · 영어 그대로 남은 비율(경고)
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const source = JSON.parse(readFileSync(join(root, 'src', 'i18n', 'source-en.json'), 'utf8'));
const dictDir = join(root, 'src', 'i18n', 'dict');
const langs = process.argv.slice(2).length ? process.argv.slice(2) : readdirSync(dictDir).filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, ''));
const HANGUL = /[가-힣ㄱ-ㆎ]/;
const holes = (s) => (s.match(/\{\d+\}/g) ?? []).sort().join(',');

let failed = 0;
for (const lang of langs) {
  const file = join(dictDir, `${lang}.json`);
  if (!existsSync(file)) {
    console.log(`✗ ${lang}: 파일 없음`);
    failed++;
    continue;
  }
  let dict;
  try {
    dict = JSON.parse(readFileSync(file, 'utf8').replace(/^﻿/, ''));
  } catch (e) {
    console.log(`✗ ${lang}: JSON 오류 ${e.message}`);
    failed++;
    continue;
  }
  const problems = [];
  const missing = source.filter((k) => !(k in dict));
  if (missing.length) problems.push(`빠진 문장 ${missing.length}개 (예: ${JSON.stringify(missing[0]).slice(0, 60)})`);
  const extra = Object.keys(dict).filter((k) => !source.includes(k));
  if (extra.length) problems.push(`원본에 없는 열쇠 ${extra.length}개 (예: ${JSON.stringify(extra[0]).slice(0, 60)})`);
  const empty = source.filter((k) => k in dict && !String(dict[k] ?? '').trim());
  if (empty.length) problems.push(`빈 번역 ${empty.length}개`);
  const badHoles = source.filter((k) => k in dict && holes(k) !== holes(String(dict[k])));
  if (badHoles.length) problems.push(`자리표 불일치 ${badHoles.length}개 (예: ${JSON.stringify(badHoles[0]).slice(0, 60)})`);
  const hangul = source.filter((k) => k in dict && HANGUL.test(String(dict[k])));
  if (hangul.length) problems.push(`한글 섞임 ${hangul.length}개`);
  const same = source.filter((k) => dict[k] === k && /[a-z]{3,}\s+[a-z]{3,}/i.test(k)).length;
  const sameRate = source.length ? same / source.length : 0;
  if (problems.length) {
    console.log(`✗ ${lang}: ${problems.join(' · ')}`);
    failed++;
  } else {
    console.log(`✓ ${lang}: ${Object.keys(dict).length}개${sameRate > 0.05 ? ` · ⚠ 영어 그대로 ${(sameRate * 100).toFixed(0)}%` : ''}`);
  }
}
if (failed) process.exit(1);
