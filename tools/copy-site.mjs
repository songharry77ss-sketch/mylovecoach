// 웹 빌드(dist) 에 약관·개인정보 처리방침 정적 페이지를 함께 넣는다. (Vercel 한 프로젝트로 앱+API+약관 서비스)
// 그리고 앱 화면(dist/index.html)의 머리말에 링크 미리보기 태그와 아이폰 앱 설치 배너를 넣는다.
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
mkdirSync('dist', { recursive: true });
for (const f of ['privacy.html', 'terms.html', 'support.html', 'delete-data.html', 'admin.html', 'icon.png', 'og.png']) {
  if (existsSync(`site/${f}`)) copyFileSync(`site/${f}`, `dist/${f}`);
}
console.log('site pages copied into dist/');

// 앱 화면은 정적 파일 하나라 어느 주소로 열어도 같은 머리말이 나간다 → 앱 전체의 기본 미리보기를 넣는다.
// (KKTI 주소는 미리보기 수집기가 오면 vercel.json 이 api/kkti-share 로 넘겨 유형·궁합 카드를 보여 준다)
const SITE = (process.env.SITE_URL || 'https://mylovecoach.vercel.app').replace(/\/+$/, '');
const IOS_APP_ID = '6813404855';
const MARK = '<!-- mylovecoach:head -->';
const TITLE = '나만의 연애코치 · 캡처 한 장이면 답장이 나와요';
const DESCRIPTION = '대화 캡처를 올리면 상대에게 딱 맞는 답장 3개와 호감 온도를 알려주는 AI 연애 코치';

function injectHead(html) {
  if (html.includes(MARK)) return html;
  const tags = [
    MARK,
    `<meta name="description" content="${DESCRIPTION}">`,
    '<meta property="og:type" content="website">',
    '<meta property="og:site_name" content="나만의 연애코치">',
    '<meta property="og:locale" content="ko_KR">',
    `<meta property="og:title" content="${TITLE}">`,
    `<meta property="og:description" content="${DESCRIPTION}">`,
    `<meta property="og:image" content="${SITE}/og.png">`,
    '<meta property="og:image:width" content="1024">',
    '<meta property="og:image:height" content="500">',
    '<meta name="twitter:card" content="summary_large_image">',
    // 아이폰 사파리의 앱 설치 배너. KKTI 화면(/k, /kkti)에서는 띄우지 않는다 — 테스트 링크를 받은 사람에게 앱 이름을 내밀지 않게.
    // 머리말을 읽는 도중에 써 넣어야 사파리가 처음부터 있던 태그로 본다
    `<script>if(!/^\\/(k|kkti)(\\/|$)/.test(location.pathname))document.write('<meta name="apple-itunes-app" content="app-id=${IOS_APP_ID}">');</script>`,
  ];
  if (!html.includes('</head>')) throw new Error('dist/index.html 에 </head> 가 없습니다 (머리말을 넣을 곳을 찾지 못함)');
  return html.replace('<html lang="en">', '<html lang="ko">').replace('</head>', `${tags.join('\n')}\n</head>`);
}

if (existsSync('dist/index.html')) {
  writeFileSync('dist/index.html', injectHead(readFileSync('dist/index.html', 'utf8')));
  console.log('head tags injected into dist/index.html');
}
