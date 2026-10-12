import fs from 'node:fs';
import path from 'node:path';

import { subscriptionStoreName } from '@/lib/billing/plans';

/**
 * App Store 심사 2.3.10 — 아이폰 앱 화면에 다른 플랫폼(Google Play) 이름이 보이면 거절된다 (1.0.3, 2026-10-12).
 * 화면 코드에 Google Play 글자가 새로 들어오면 여기서 막는다. 기기별로 가르는 정해진 곳만 허용한다
 */
const SRC = path.join(__dirname, '..');
const PATTERN = /Google ?Play|구글 ?플레이|플레이 ?스토어|Play ?스토어/;
/** [파일, 그 줄에 들어 있어야 하는 글자] — 아이폰에서는 보이지 않는 줄 */
const ALLOWED: [string, string][] = [
  ['app/paywall.tsx', "Platform.OS === 'ios'"], // 아이폰이면 App Store
  ['app/(tabs)/my.tsx', 'Google Play 구독 관리'], // 웹에서만 보이는 줄 (Platform.OS === 'web' 안)
  ['lib/billing/plans.ts', "os === 'android'"], // subscriptionStoreName
];

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === '__tests__' ? [] : sourceFiles(full);
    return /\.(tsx?|json)$/.test(e.name) ? [full] : [];
  });
}

describe('스토어 이름 — 아이폰 앱에 Google Play 를 적지 않는다', () => {
  it('구독 취소 안내의 스토어 이름은 기기별', () => {
    expect(subscriptionStoreName('ios')).toBe('App Store');
    expect(subscriptionStoreName('android')).toBe('Google Play');
    expect(subscriptionStoreName('web')).toBe('App Store 또는 Google Play');
  });

  it('화면 코드의 Google Play 글자는 기기별로 가르는 정해진 곳에만 있다 (주석 제외)', () => {
    const hits = sourceFiles(SRC).flatMap((file) => {
      const rel = path.relative(SRC, file).replace(/\\/g, '/');
      return fs
        .readFileSync(file, 'utf8')
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => PATTERN.test(line) && !/^(\/\/|\*|\/\*)/.test(line))
        .map((line) => ({ rel, line }));
    });
    const unexpected = hits.filter(({ rel, line }) => !ALLOWED.some(([f, mark]) => rel === f && line.includes(mark)));
    expect(unexpected).toEqual([]);
  });
});
