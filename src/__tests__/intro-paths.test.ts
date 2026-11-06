import { entryRoute, homeRoute, skipIntroForPath } from '@/lib/intro-paths';

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

describe('앱을 처음 화면으로 열 때 갈 곳 (사용법 안내)', () => {
  const V = 'sendit-1.1';
  it('처음 설치는 사용법 안내 → (동의·나에 대해) 순서로', () => {
    expect(entryRoute({ started: false, onboardingSeen: false, guideSeen: null }, V)).toBe('/welcome');
  });

  it('센딧 전 판(또는 예전 판 안내)을 쓰던 사람은 이번 판 안내를 볼 때까지 「새로워졌어요」 안내로', () => {
    expect(entryRoute({ started: true, onboardingSeen: true, guideSeen: 'before-sendit' }, V)).toBe('/welcome?from=update');
    expect(entryRoute({ started: false, onboardingSeen: true, guideSeen: 'before-sendit' }, V)).toBe('/welcome?from=update');
    expect(entryRoute({ started: true, onboardingSeen: true, guideSeen: 'old' }, V)).toBe('/welcome?from=update');
  });

  it('센딧 판에서 링크로 먼저 시작한 사람(guideSeen 없음)은 처음 설치용 표지로 — 소개를 본 것으로 읽혀도', () => {
    expect(entryRoute({ started: true, onboardingSeen: false, guideSeen: null }, V)).toBe('/welcome?from=intro');
    expect(entryRoute({ started: true, onboardingSeen: true, guideSeen: null }, V)).toBe('/welcome?from=intro');
  });

  it('이번 판 안내를 봤으면 시작한 사람은 홈, 아직이면 첫 캡처 화면', () => {
    expect(entryRoute({ started: true, onboardingSeen: true, guideSeen: V }, V)).toBe('/(tabs)');
    expect(entryRoute({ started: false, onboardingSeen: true, guideSeen: V }, V)).toBe('/start');
    expect(homeRoute(true)).toBe('/(tabs)');
    expect(homeRoute(false)).toBe('/start');
  });
});
