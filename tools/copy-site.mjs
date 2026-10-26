// 웹 빌드(dist) 에 정적 페이지(site/)를 함께 넣고, 검색·미리보기용 머리말과 본문을 만든다. (Vercel 한 프로젝트로 앱+API+약관 서비스)
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { appVariants, staticPages } from './seo-pages.mjs';

mkdirSync('dist', { recursive: true });
// site/ 의 파일을 모두 넣는다 (robots.txt, 검색 등록 확인 파일 포함).
// site/index.html 은 예전 소개 페이지라 앱 화면(dist/index.html)을 덮지 않게 뺀다.
const OLD_LANDING = path.resolve('site/index.html');
cpSync('site', 'dist', { recursive: true, filter: (src) => path.resolve(src) !== OLD_LANDING });
console.log('site pages copied into dist/');

// 앱 화면은 Expo 가 만든 정적 파일 하나라 → 주소별로 머리말·본문만 바꾼 사본을 만든다 (vercel.json rewrites 가 고른다)
// (KKTI 주소는 미리보기 수집기가 오면 vercel.json 이 api/kkti-card 로 넘겨 유형·궁합 카드를 보여 준다)
if (existsSync('dist/index.html')) {
  for (const [file, html] of Object.entries(appVariants(readFileSync('dist/index.html', 'utf8')))) writeFileSync(`dist/${file}`, html);
  console.log('app shells written: index.html, kkti.html, kkti-result.html');
}

for (const [file, content] of Object.entries(staticPages())) {
  mkdirSync(path.dirname(`dist/${file}`), { recursive: true });
  writeFileSync(`dist/${file}`, content);
}
console.log('seo pages written: /kkti/types, /kkti/type/*, sitemap.xml');

// /kkti · /kkti/result 자리에 정적 파일이 생기면 rewrites 보다 먼저 나가 카톡 미리보기 규칙이 죽는다
for (const p of ['dist/kkti/index.html', 'dist/kkti/result', 'dist/kkti/result.html', 'dist/k']) {
  if (existsSync(p)) throw new Error(`${p} 가 있으면 안 됩니다 — KKTI 미리보기 수집기 규칙(vercel.json)이 가려집니다`);
}
