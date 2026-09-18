// 웹 빌드(dist) 에 약관·개인정보 처리방침 정적 페이지를 함께 넣는다. (Vercel 한 프로젝트로 앱+API+약관 서비스)
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
mkdirSync('dist', { recursive: true });
for (const f of ['privacy.html', 'terms.html', 'admin.html', 'icon.png']) {
  if (existsSync(`site/${f}`)) copyFileSync(`site/${f}`, `dist/${f}`);
}
console.log('site pages copied into dist/');
