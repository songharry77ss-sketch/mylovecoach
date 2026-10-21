import { skipIntroForPath } from '@/lib/intro-paths';

describe('로고 인트로 없이 바로 여는 첫 화면', () => {
  it('KKTI 입구(공유 링크로 들어오는 곳)는 인트로를 건너뛴다', () => {
    for (const path of ['/kkti', '/kkti/result']) expect(skipIntroForPath(path)).toBe(true);
  });

  it('빠른 코칭·로그인 콜백도 건너뛴다', () => {
    for (const path of ['/quick', '/quick/abc', '/auth/callback']) expect(skipIntroForPath(path)).toBe(true);
  });

  it('홈·코칭 화면은 인트로를 보여 준다 (이름이 비슷한 경로도)', () => {
    for (const path of ['/', '/start', '/crush/abc', '/kktix', '/quickly', '/auth/callbackx', null, undefined, '']) {
      expect(skipIntroForPath(path)).toBe(false);
    }
  });
});
