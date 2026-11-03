// 실행: node tools/social-token.mjs <instagram|threads> <새 토큰을 쓸 파일>
// 장기 토큰(60일)을 연장한다. 환경변수 IG_ACCESS_TOKEN / THREADS_ACCESS_TOKEN 을 읽고, 새 토큰은 화면에 찍지 않고 파일에만 쓴다.
// 예약 실행(social-token.yml)이 매주 부르고, 저장소 시크릿 갱신용 토큰(SOCIAL_SECRETS_PAT)이 있으면 그 파일로 시크릿을 바꾼다.
import { writeFileSync } from 'node:fs';

import { refreshToken } from './lib/meta-publish.mjs';

const [channel, file] = process.argv.slice(2);
if (!['instagram', 'threads'].includes(channel) || !file) throw new Error('사용법: node tools/social-token.mjs <instagram|threads> <파일>');
const current = channel === 'instagram' ? process.env.IG_ACCESS_TOKEN : process.env.THREADS_ACCESS_TOKEN;
if (!current) {
  console.log(`${channel} 토큰 없음 — 건너뜀`);
  process.exit(0);
}
const next = await refreshToken(channel, current);
writeFileSync(file, next.token, { mode: 0o600 });
console.log(`${channel} 토큰 연장됨 — ${next.expiresInDays}일 남음 · ${next.token === current ? '같은 토큰' : '새 토큰(시크릿 갱신 필요)'}`);
