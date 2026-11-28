// 세계판 검색 페이지(tools/seo-global.mjs) 검사 — node --test tools/seo-global.test.mjs
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { Buffer } from 'node:buffer';
import { test } from 'node:test';

import { GLOBAL_PATHS, LANDING_LANGS, SITE, globalPages, guidePath, guideTexts, guideWords, hreflangLinks, landingPath, listingBlocks, listingOf } from './seo-global.mjs';
import { GUIDES_EN } from './seo-guides-en.mjs';
import { SITE as KO_SITE, appVariants, staticPages } from './seo-pages.mjs';

const pages = globalPages();
const root = new URL('../', import.meta.url);
const vercel = JSON.parse(readFileSync(new URL('vercel.json', root), 'utf8'));
const unescape = (s) => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

test('두 생성기의 사이트 주소가 같다', () => {
  assert.equal(SITE, KO_SITE);
});

test('영어 가이드: 12편 이상, 600~1000 단어, 예시·FAQ 충분, 제목·설명 길이', () => {
  assert.ok(GUIDES_EN.length >= 12);
  assert.equal(new Set(GUIDES_EN.map((g) => g.slug)).size, GUIDES_EN.length, 'slug 중복');
  for (const g of GUIDES_EN) {
    const words = guideWords(g);
    assert.ok(words >= 600 && words <= 1000, `${g.slug}: ${words} 단어`);
    assert.match(g.slug, /^[a-z0-9-]+$/);
    assert.ok(g.title.length <= 60, `${g.slug}: 제목 ${g.title.length}자`);
    assert.ok(g.description.length >= 100 && g.description.length <= 165, `${g.slug}: 설명 ${g.description.length}자`);
    const examples = g.sections.flatMap((s) => s.body.filter((b) => b.ex).flatMap((b) => b.ex));
    assert.ok(examples.length >= 4, `${g.slug}: 예시 ${examples.length}개`);
    for (const x of examples) assert.ok(x.tone && x.text && x.why, `${g.slug}: 예시 칸 빠짐`);
    assert.ok(g.faq.length >= 3, `${g.slug}: FAQ ${g.faq.length}개`);
    assert.ok(g.q && g.q.length <= 200, `${g.slug}: 웹 입력칸 문장`);
  }
});

test('영어 가이드: 지어낸 수치(%)가 없고, 글 안 링크는 있는 가이드로 간다', () => {
  const slugs = new Set(GUIDES_EN.map((g) => g.slug));
  for (const g of GUIDES_EN) {
    const text = guideTexts(g).join('\n');
    assert.doesNotMatch(text, /\d\s?%|percent/i, `${g.slug}: 퍼센트 수치`);
    assert.doesNotMatch(text, /studies show|research shows|statistic/i, `${g.slug}: 근거 없는 연구 인용`);
    for (const [, href] of text.matchAll(/\]\((\/[^)]+)\)/g)) {
      const m = href.match(/^\/en\/guide\/([a-z0-9-]+)$/);
      assert.ok(m && slugs.has(m[1]) && m[1] !== g.slug, `${g.slug}: 잘못된 링크 ${href}`);
    }
  }
});

test('랜딩: 언어마다 canonical·hreflang 묶음(x-default 포함)·html lang', () => {
  const links = hreflangLinks();
  assert.deepEqual(
    links.map((l) => l.match(/hreflang="([^"]+)"/)[1]),
    ['ko', ...LANDING_LANGS, 'x-default'],
  );
  for (const lang of LANDING_LANGS) {
    const html = pages[`${lang}/index.html`];
    assert.ok(html, `${lang} 랜딩 없음`);
    assert.ok(html.includes(`<link rel="canonical" href="${SITE}${landingPath(lang)}">`));
    for (const l of links) assert.ok(html.includes(l), `${lang}: ${l} 빠짐`);
    assert.match(html, new RegExp(`<html lang="${lang}(-[A-Z]{2})?">`));
    assert.equal((html.match(/<h1>/g) ?? []).length, 1);
  }
});

test('랜딩: 기능 설명은 스토어 문구를 그대로 쓴다', () => {
  for (const lang of LANDING_LANGS) {
    const listing = listingOf(lang);
    const text = unescape(pages[`${lang}/index.html`].replace(/<[^>]+>/g, '\n'));
    const { intro, rest } = listingBlocks(listing.description);
    const lines = [...intro, ...rest.flatMap((b) => (b.head ? [b.head, ...b.lines] : b.lines))]
      .filter((l) => !/CRAVING/.test(l) || l.length > 20)
      .map((l) => l.replace(/^•\s+/, ''));
    for (const line of lines) {
      const plain = line.replace(/https:\/\/\S+/g, '').trim();
      assert.ok(text.includes(plain), `${lang}: 스토어 문구 빠짐 — ${plain.slice(0, 40)}`);
    }
    assert.ok(pages[`${lang}/index.html`].includes(`<title>${listing.appName.replace(/&/g, '&amp;')} · ${listing.subtitle.replace(/&/g, '&amp;')}</title>`));
  }
});

test('스토어 버튼: Play(설치 경로 referrer)·App Store 둘 다, 기기 판별 스크립트', () => {
  for (const [file, html] of Object.entries(pages)) {
    assert.match(html, /class="store store-play" href="https:\/\/play\.google\.com\/store\/apps\/details\?id=app\.mylovecoach\.android&amp;referrer=utm_source%3Dseo%26/, file);
    assert.ok(html.includes('class="store store-ios" href="https://apps.apple.com/app/id6813404855"'), file);
    assert.ok(html.includes('"is-android"') && html.includes('"is-ios"'), file);
  }
});

test('한국어 홈 머리말에 같은 hreflang 묶음이 들어간다', () => {
  const expo = '<!DOCTYPE html><html lang="en"><head><title>x</title></head><body><noscript>js</noscript><div id="root"></div></body></html>';
  const { 'index.html': home, 'kkti.html': kkti } = appVariants(expo);
  for (const l of hreflangLinks()) assert.ok(home.includes(l), l);
  assert.ok(!kkti.includes('hreflang'), 'KKTI 화면에는 넣지 않는다');
});

test('sitemap.xml: 새 주소가 한 번씩, 형식이 맞다', () => {
  const files = staticPages();
  const xml = files['sitemap.xml'];
  assert.match(xml, /^<\?xml version="1.0" encoding="UTF-8"\?>\n<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">\n/);
  assert.ok(xml.trimEnd().endsWith('</urlset>'));
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  assert.equal(new Set(locs).size, locs.length, 'sitemap 중복');
  assert.equal((xml.match(/<url>/g) ?? []).length, locs.length);
  for (const p of GLOBAL_PATHS) assert.ok(locs.includes(`${SITE}${p}`), `sitemap 에 ${p} 없음`);
  for (const p of Object.keys(pages)) assert.equal(files[p], pages[p], `staticPages 에 ${p} 없음`);
  for (const p of ['/en/support.html', '/en/privacy.html', '/en/terms.html']) assert.ok(existsSync(new URL(`site${p}`, root)), p);
});

/** vercel.json source → 정규식 (이 저장소에서 쓰는 :name, :name(정규식), 맨 정규식 묶음만) */
const sourceRe = (source) => new RegExp(`^${source.replace(/:(\w+)(\(([^)]*)\))?/g, (_, name, __, re) => `(?<${name}>${re ?? '[^/]+'})`)}$`);
function rewrite(path) {
  for (const r of vercel.rewrites) {
    if (r.has) continue;
    const m = path.match(sourceRe(r.source));
    if (m) return r.destination.replace(/:(\w+)/g, (_, n) => m.groups?.[n] ?? `:${n}`);
  }
  return null;
}

test('vercel.json: 세계판 주소가 앱 화면 넘기기보다 먼저 제 파일로 간다', () => {
  const cases = [
    ...LANDING_LANGS.flatMap((l) => [[`/${l}`, `${l}/index.html`], [`/${l}/`, `${l}/index.html`]]),
    ['/en/guide', 'en/guide/index.html'],
    ...GUIDES_EN.map((g) => [guidePath(g), `en/guide/${g.slug}/index.html`]),
  ];
  for (const [path, file] of cases) {
    assert.equal(rewrite(path), `/${file}`, path);
    assert.ok(pages[file], `${file} 가 만들어지지 않음`);
  }
  // 기존 주소는 그대로
  assert.equal(rewrite('/en/privacy'), '/en/privacy.html');
  assert.equal(rewrite('/guide/read-no-reply'), '/guide/read-no-reply/index.html');
  assert.equal(rewrite('/start'), '/index.html');
});

test('세계판 페이지 안의 사이트 링크는 모두 있는 곳으로 간다', () => {
  const generated = new Set(Object.keys(pages).map((f) => `/${f.replace(/index\.html$/, '')}`));
  const ok = (href) => {
    const p = href.split(/[?#]/)[0];
    if (['/', '/start', '/favicon.ico'].includes(p)) return true;
    if (generated.has(p) || generated.has(`${p}/`)) return true;
    return existsSync(new URL(`site${p}`, root));
  };
  for (const [file, html] of Object.entries(pages)) {
    for (const [, href] of html.matchAll(/(?:href|src)="(\/[^"]*)"/g)) assert.ok(ok(unescape(href)), `${file}: ${href}`);
  }
});

test('가볍게: 페이지마다 스크립트는 기기 판별 한 줄 + JSON-LD 뿐, 그림은 지연 로딩', () => {
  for (const [file, html] of Object.entries(pages)) {
    const scripts = [...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)];
    for (const [, attrs, body] of scripts) {
      if (attrs.includes('application/ld+json')) {
        assert.doesNotThrow(() => JSON.parse(body), file);
        continue;
      }
      assert.ok(body.length < 300, `${file}: 스크립트 ${body.length}자`);
    }
    for (const [img] of html.matchAll(/<img [^>]+>/g)) assert.match(img, /loading="lazy"/, file);
    assert.ok(Buffer.byteLength(html) < 60_000, `${file}: ${Buffer.byteLength(html)}바이트`);
  }
});
