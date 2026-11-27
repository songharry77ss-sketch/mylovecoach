// 언어별 스토어 문구(docs/store-listing/<언어>.json)를 읽고 검사한다. 인증·네트워크 없음.
// asc-global.mjs · play-global.mjs 가 쓰고, 출시 스크립트는 playReleaseNotes() 로 언어별 「새 소식」을 받아 Play 출시 노트에 넣을 수 있다.
// 한국어(ko·ko-KR)는 docs/STORE_LISTING.md 가 원본이라 여기서 다루지 않는다 — 어떤 도구도 이 표로 한국어를 건드리지 않는다.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { len, repo } from './store-listing-en.mjs';

export const LISTING_DIR = join(repo, 'docs', 'store-listing');

/** 앱 언어 → App Store Connect 로캘 */
export const ASC_LOCALES = {
  en: ['en-US', 'en-GB', 'en-AU', 'en-CA'],
  ja: ['ja'],
  'zh-Hans': ['zh-Hans'],
  'zh-Hant': ['zh-Hant'],
  es: ['es-ES', 'es-MX'],
  pt: ['pt-BR', 'pt-PT'],
  fr: ['fr-FR', 'fr-CA'],
  de: ['de-DE'],
  it: ['it'],
  ru: ['ru'],
  tr: ['tr'],
  id: ['id'],
  vi: ['vi'],
  th: ['th'],
  ar: ['ar-SA'],
  hi: ['hi'],
  pl: ['pl'],
  nl: ['nl-NL'],
  sv: ['sv'],
  da: ['da'],
  nb: ['no'],
  fi: ['fi'],
  cs: ['cs'],
  sk: ['sk'],
  hu: ['hu'],
  ro: ['ro'],
  uk: ['uk'],
  el: ['el'],
  he: ['he'],
  hr: ['hr'],
  ms: ['ms'],
  ca: ['ca'],
};

/** 앱 언어 → Google Play 등록 정보 언어 코드 (히브리어는 Play 가 옛 코드 iw-IL 을 쓴다) */
export const PLAY_LOCALES = {
  en: ['en-US', 'en-GB', 'en-AU', 'en-CA', 'en-IN', 'en-SG', 'en-ZA'],
  ja: ['ja-JP'],
  'zh-Hans': ['zh-CN'],
  'zh-Hant': ['zh-TW', 'zh-HK'],
  es: ['es-419', 'es-ES', 'es-US'],
  pt: ['pt-BR', 'pt-PT'],
  fr: ['fr-FR', 'fr-CA'],
  de: ['de-DE'],
  it: ['it-IT'],
  ru: ['ru-RU'],
  tr: ['tr-TR'],
  id: ['id'],
  vi: ['vi'],
  th: ['th'],
  ar: ['ar'],
  hi: ['hi-IN'],
  pl: ['pl-PL'],
  nl: ['nl-NL'],
  sv: ['sv-SE'],
  da: ['da-DK'],
  nb: ['no-NO'],
  fi: ['fi-FI'],
  cs: ['cs-CZ'],
  sk: ['sk'],
  hu: ['hu-HU'],
  ro: ['ro'],
  uk: ['uk'],
  el: ['el-GR'],
  he: ['iw-IL'],
  hr: ['hr'],
  ms: ['ms'],
  ca: ['ca'],
};

export const LANGS = Object.keys(ASC_LOCALES);
/** 절대 건드리지 않는 한국어 로캘 */
export const KO_LOCALES = new Set(['ko', 'ko-KR']);

// tools/i18n/check-listings.mjs 와 같은 규칙 — 한쪽을 바꾸면 다른 쪽도 맞춘다
export const LIMITS = { appName: 30, subtitle: 30, shortDescription: 80, keywords: 100, promotionalText: 170, description: 4000, whatsNew: 4000 };
const BANNED = /\b(tinder|hinge|bumble|whatsapp|chatgpt|instagram|snapchat|kakao|line app|telegram|grindr|badoo)\b/i;

/** 언어 파일 하나 — { lang, ok, missing, problems, data } */
export function loadListing(lang) {
  const file = join(LISTING_DIR, `${lang}.json`);
  if (!existsSync(file)) return { lang, ok: false, missing: true, problems: ['파일 없음'] };
  let data;
  try {
    data = JSON.parse(readFileSync(file, 'utf8').replace(/^﻿/, ''));
  } catch (e) {
    return { lang, ok: false, problems: [`JSON 오류 ${e.message}`] };
  }
  const problems = [];
  for (const [k, max] of Object.entries(LIMITS)) {
    if (!String(data[k] ?? '').trim()) problems.push(`${k} 비었음`);
    else if (len(data[k]) > max) problems.push(`${k} ${len(data[k])}자 > ${max}`);
  }
  if (data.appName && !String(data.appName).startsWith('My Love Coach')) problems.push('appName 이 My Love Coach 로 시작하지 않음');
  if (/[가-힣]/.test(JSON.stringify(data))) problems.push('한글 섞임');
  if (data.keywords && /,\s/.test(data.keywords)) problems.push('keywords 쉼표 뒤 띄어쓰기');
  if (BANNED.test(`${data.appName} ${data.subtitle} ${data.keywords}`)) problems.push('이름·부제·키워드에 다른 앱 이름');
  // 윈도우에서 만든 파일이면 줄바꿈이 CRLF 일 수 있다 — 스토어에는 LF 로
  for (const k of Object.keys(LIMITS)) if (typeof data[k] === 'string') data[k] = data[k].replace(/\r\n/g, '\n').trim();
  return { lang, ok: !problems.length, problems, data };
}

/** --langs ja,fr 처럼 고른 언어 (없으면 전부). 모르는 언어면 멈춘다 */
export function langsOf(args) {
  const i = args.indexOf('--langs');
  if (i < 0) return LANGS;
  const list = String(args[i + 1] ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const bad = list.filter((l) => !LANGS.includes(l));
  if (!list.length || bad.length) throw new Error(`--langs 는 ${LANGS.join(', ')} 중에서 고른다 (받은 값: ${bad.join(', ') || '없음'})`);
  return list;
}

export const loadListings = (langs = LANGS) => langs.map(loadListing);

/** 언어 파일 상태를 한 줄씩 보여 주고 쓸 수 있는 것만 돌려준다 */
export function reportListings(results, localeMap) {
  const ok = results.filter((r) => r.ok);
  const missing = results.filter((r) => r.missing).map((r) => r.lang);
  for (const r of results.filter((x) => !x.ok && !x.missing)) console.log(`  ✗ ${r.lang}: 건너뜀 — ${r.problems.join(' · ')}`);
  console.log(`  · 언어 파일 ${ok.length}개 사용 (${ok.map((r) => `${r.lang}→${localeMap[r.lang].join('/')}`).join(', ') || '없음'})`);
  if (missing.length) console.log(`  · 아직 파일 없음 ${missing.length}개: ${missing.join(', ')} — 파일이 생기면 다시 실행`);
  return ok;
}

/**
 * 출시 스크립트용: 언어별 「새 소식」을 Play 출시 노트 모양([{ language, text }])으로. Play 는 언어마다 500자까지.
 * 한국어(ko-KR) 노트는 lib/play-release.mjs 의 playReleaseNotes() 로 따로 만들어 앞에 붙인다.
 */
export function playReleaseNotes({ langs = LANGS, max = 500 } = {}) {
  const notes = [];
  const skipped = [];
  for (const r of loadListings(langs)) {
    if (!r.ok) {
      if (!r.missing) skipped.push(`${r.lang}: ${r.problems.join(' · ')}`);
      continue;
    }
    if (len(r.data.whatsNew) > max) {
      skipped.push(`${r.lang}: 새 소식 ${len(r.data.whatsNew)}자 > ${max}`);
      continue;
    }
    for (const language of PLAY_LOCALES[r.lang]) notes.push({ language, text: r.data.whatsNew });
  }
  return { notes, skipped };
}

/** App Store 쪽도 같은 모양으로 — 로캘별 「새 소식」 */
export function ascWhatsNew({ langs = LANGS } = {}) {
  const out = new Map();
  for (const r of loadListings(langs)) if (r.ok) for (const locale of ASC_LOCALES[r.lang]) out.set(locale, r.data.whatsNew);
  return out;
}
