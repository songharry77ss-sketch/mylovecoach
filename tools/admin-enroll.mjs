// PC 에서 실행: node tools/admin-enroll.mjs [--print]
// 관리자 페이지를 「이 브라우저」에 등록하는 링크(…/admin.html#enroll=<열쇠>)를 기본 브라우저로 연다.
// 열린 페이지가 열쇠를 브라우저 저장소에 넣고 주소에서 지운다. 그다음부터 이 브라우저에서만 비밀번호가 통한다.
// 열쇠는 wolha-secrets/mylovecoach-admin-token.txt 의 ADMIN_DEVICE_SECRET (set-analytics-env.mjs 가 만든다).
// 기본으로는 열쇠를 화면에 출력하지 않는다. 다른 기기(휴대폰 등)에서 등록하려면 --print 로 링크를 보고 그 기기에서 연다.
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

const SITE = process.env.MYLOVECOACH_SITE ?? 'https://mylovecoach.vercel.app';
const root = process.env.MYLOVECOACH_SECRETS ?? join(homedir(), 'wolha-secrets');
const file = join(root, 'mylovecoach-admin-token.txt');
if (!existsSync(file)) {
  console.error(`${file} 이 없습니다. 먼저 node tools/set-analytics-env.mjs 를 실행하세요.`);
  process.exit(1);
}
const line = readFileSync(file, 'utf8')
  .split(/\r?\n/)
  .find((l) => l.trim().startsWith('ADMIN_DEVICE_SECRET='));
const secret = line?.slice(line.indexOf('=') + 1).trim();
if (!secret) {
  console.error('ADMIN_DEVICE_SECRET 이 없습니다. node tools/set-analytics-env.mjs 를 실행해 만들고 배포하세요.');
  process.exit(1);
}
const url = `${SITE}/admin.html#enroll=${secret}`;

if (process.argv.includes('--print')) {
  console.log(url);
} else {
  const opener = process.platform === 'win32' ? ['cmd', ['/c', 'start', '""', url]] : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
  spawn(opener[0], opener[1], { stdio: 'ignore', detached: true, windowsVerbatimArguments: process.platform === 'win32' }).unref();
  console.log('관리자 등록 링크를 기본 브라우저로 열었어요. 열린 페이지에 「이 브라우저는 관리자 기기로 등록돼 있어요」가 보이면 끝입니다.');
}
