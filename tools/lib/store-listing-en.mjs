// docs/STORE_LISTING_EN.md(영어판 스토어 문구 원본)를 읽는다. 인증·네트워크 없음 — asc-global.mjs, play-global.mjs 가 쓴다.
import { Buffer } from 'node:buffer';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const repo = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
/** 문서에는 기본 주소로 적혀 있다 — 실제 배포 주소로 바꿔 넣는다 (asc-listing.mjs 와 같음) */
export const DOC_SITE = 'https://mylovecoach.vercel.app';
/** 세계 출시에서 빼는 지역 — 중국 본토(생성형 AI 앱은 당국 허가 필요). App Store 지역 코드 / Play 지역 코드 */
export const EXCLUDED_ASC = ['CHN'];
export const EXCLUDED_PLAY = ['CN'];

/** 유럽(EU 27 + EEA + 영국 + 스위스) — GDPR 대리인·DSA 판매자 공개가 정해질 때까지 앱 판매를 미룬다 (--hold-europe, 2026-11-27 기본안) */
export const EUROPE_ASC = ['AUT', 'BEL', 'BGR', 'HRV', 'CYP', 'CZE', 'DNK', 'EST', 'FIN', 'FRA', 'DEU', 'GRC', 'HUN', 'IRL', 'ITA', 'LVA', 'LTU', 'LUX', 'MLT', 'NLD', 'POL', 'PRT', 'ROU', 'SVK', 'SVN', 'ESP', 'SWE', 'ISL', 'LIE', 'NOR', 'GBR', 'CHE'];
export const EUROPE_PLAY = ['AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE', 'IS', 'LI', 'NO', 'GB', 'CH'];
/** 판매 중단 상품 — 영어 이름만 넣고 판매 지역·가격은 건드리지 않는다 (tools/lifetime-stop.mjs) */
export const LIFETIME_ID = 'mylovecoach.premium.lifetime';

export const len = (s) => [...(s ?? '')].length;
export const appJson = () => JSON.parse(readFileSync(join(repo, 'app.json'), 'utf8')).expo;

export function siteOf(args, secretsDir) {
  const i = args.indexOf('--site');
  const file = join(secretsDir, 'mylovecoach-api-url.txt');
  const site = (i >= 0 ? args[i + 1] : undefined) ?? (existsSync(file) ? readFileSync(file, 'utf8').trim() : DOC_SITE);
  return site.replace(/\/+$/, '');
}
export const withSite = (text, site) => (text ?? '').replaceAll(DOC_SITE, site);

/** App Store 는 설명에 이모지를 허용하지 않으므로 지운다 (Play 는 그대로) — asc-listing.mjs 와 같은 규칙 */
export function stripEmoji(text) {
  return text
    .replace(/[🀀-🫿☀-➿️←-⇿⬀-⯿•]/gu, '')
    .replace(/[ \t]+$/gm, '')
    .replace(/^[ \t]+/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** 표 칸이 영어 문구가 아니라 메모(한글·괄호)이면 문구가 없는 것으로 본다 — 예: 평생권 「(판매 중단 — …)」 */
const isNote = (s) => !s || /[가-힣]/.test(s) || /^\(.*\)$/.test(s);

export function parseListingEn(markdown, versionString) {
  const md = markdown.replace(/\r\n/g, '\n');
  const field = (label) => (md.match(new RegExp(`\\*\\*${label}[^*]*\\*\\*:\\s*(.+)`)) ?? [])[1]?.trim() ?? '';
  const section = (title) => (md.match(new RegExp(`\\n## ${title}[^\\n]*\\n([\\s\\S]*?)(?=\\n## |$)`)) ?? [])[1]?.trim() ?? '';

  // 「## What's new (버전)」 — 앱 버전과 같은 제목만 쓴다. 없으면 null (새 소식 없이 넣는다)
  const escaped = versionString.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const head = new RegExp(`^## What's new \\(${escaped}\\)[ \\t]*$`, 'm').exec(md);
  let whatsNew = null;
  if (head) {
    const tail = md.slice(head.index + head[0].length);
    const end = tail.search(/^## /m);
    whatsNew = (end < 0 ? tail : tail.slice(0, end)).trim() || null;
  }

  // 「## 인앱결제 상품 영어 표시」 표: | `상품 ID` | 이름 | 설명 |  ·  | 구독 그룹 `프리미엄` | Premium | |
  const products = [];
  let group = null;
  for (const line of section('인앱결제 상품 영어 표시').split('\n')) {
    if (!line.trim().startsWith('|')) continue;
    const cells = line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
    const id = (cells[0].match(/`([^`]+)`/) ?? [])[1];
    if (!id) continue; // 머리줄·구분줄
    if (cells[0].includes('구독 그룹')) group = { reference: id, name: cells[1] ?? '' };
    else products.push({ productId: id, name: cells[1] ?? '', description: isNote(cells[2]) ? '' : cells[2], note: isNote(cells[2]) ? (cells[2] ?? '') : '' });
  }

  return {
    name: field('App name'),
    subtitle: field('Subtitle'),
    shortDescription: field('Short description'),
    keywords: field('Keywords'),
    promotionalText: field('Promotional text'),
    privacyPolicyUrl: field('Privacy policy URL'),
    supportUrl: field('Support URL'),
    fullDescription: section('Full description'),
    whatsNew,
    products,
    group,
  };
}

export function loadListingEn(versionString) {
  return parseListingEn(readFileSync(join(repo, 'docs', 'STORE_LISTING_EN.md'), 'utf8'), versionString);
}

/**
 * 길이 한도 검사. rows: [이름, 값, 한도, { bytes?, optional? }] — 넘거나 비면 모두 모아 한 번에 멈춘다.
 * 한도를 넘긴 문구를 스토어가 잘라 넣거나 거부하기 전에 문서를 고치게 하려는 것.
 */
export function checkLimits(where, rows) {
  const bad = [];
  for (const [label, value, max, opt = {}] of rows) {
    if (!value) {
      if (!opt.optional) bad.push(`${label}: 비어 있음`);
      continue;
    }
    const n = opt.bytes ? Buffer.byteLength(value, 'utf8') : len(value);
    if (n > max) bad.push(`${label}: ${n}${opt.bytes ? '바이트' : '자'} > ${max}`);
  }
  if (bad.length) throw new Error(`${where} — STORE_LISTING_EN.md 를 고쳐야 합니다: ${bad.join(' · ')}`);
}

/**
 * --apply 면 한도 초과에서 바로 멈추고, dry-run 이면 ✗ 로 크게 알린 뒤(종료 코드 1) 나머지 확인은 이어 간다.
 * 돌려주는 값: 한도 안이면 true
 */
export function limitsOk(apply, where, rows) {
  try {
    checkLimits(where, rows);
    return true;
  } catch (e) {
    if (apply) throw e;
    console.log(`✗ ${e.message}`);
    process.exitCode = 1;
    return false;
  }
}

/** 공개 주소가 실제로 열리는지(GET) — 심사는 열리지 않는 개인정보 처리방침 주소를 거절한다 */
export async function checkUrls(urls) {
  for (const url of [...new Set(urls.filter(Boolean))]) {
    const status = await fetch(url, { redirect: 'follow' }).then((r) => r.status, (e) => e.message);
    console.log(`  ${status === 200 ? '✓' : '⚠'} ${url} → ${status}${status === 200 ? '' : ' (영어 사이트 배포 뒤 다시 확인 — 심사 제출 전에 열려야 함)'}`);
  }
}

/** PNG 머리에서 가로·세로를 읽는다 */
export function pngSize(buf) {
  if (buf.length < 24 || buf.readUInt32BE(0) !== 0x89504e47) return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

/** 쉼표로 받은 영어 로캘 목록 — 허용 목록 밖이면 멈춘다 */
export function localesOf(args, allowed) {
  const i = args.indexOf('--locales');
  const list = ((i >= 0 ? args[i + 1] : undefined) ?? 'en-US').split(',').map((s) => s.trim()).filter(Boolean);
  const bad = list.filter((l) => !allowed.includes(l));
  if (!list.length || bad.length) throw new Error(`--locales 는 ${allowed.join(', ')} 중에서 고릅니다 (받은 값: ${bad.join(', ') || '없음'})`);
  return [...new Set(list)];
}
