/** 이 경로이거나 그 아래 경로인지 */
const opensAt = (path: string | null | undefined, root: string) => path === root || path?.startsWith(`${root}/`) === true;

/**
 * 앱을 열 때 로고 인트로 없이 바로 보여 줄 첫 화면.
 * - 빠른 코칭·로그인 콜백: 기다리게 하거나 OAuth 복귀 화면을 가리지 않는다.
 * - KKTI: 공유 링크로 처음 들어오는 사람(썸 상대 포함)의 입구라 센딧 로고로 막지 않는다.
 */
export function skipIntroForPath(path: string | null | undefined): boolean {
  return opensAt(path, '/quick') || opensAt(path, '/kkti') || path === '/auth/callback';
}

/** 앱을 처음 화면('/')으로 열 때 보낼 곳을 정하는 데 쓰는 이용자 상태 */
export interface EntryState {
  /** 프로필이나 채팅방이 있다 (한 번이라도 시작했다) */
  started: boolean;
  /** 처음 실행 안내를 끝냈거나 건너뛰었다 */
  onboardingSeen: boolean;
  /** 마지막으로 본 사용법 안내의 판 (app-store 의 guideSeen) */
  guideSeen: string | null;
}

export type EntryRoute = '/welcome' | '/welcome?from=update' | '/start' | '/(tabs)';

/** 사용법 안내를 다 본 기존 이용자가 갈 곳 — 시작한 사람은 홈, 아직이면 첫 캡처 화면 */
export const homeRoute = (started: boolean): '/start' | '/(tabs)' => (started ? '/(tabs)' : '/start');

/**
 * 앱을 처음 화면('/')으로 열 때 보낼 곳 (app/index.tsx).
 * - 처음 설치: 사용법 안내(`/welcome`) → 이용약관 동의 → 나에 대해 → 첫 캡처
 * - 업데이트한 기존 이용자(안내의 판이 바뀜): 「새로워졌어요」 사용법 한 번(`/welcome?from=update`) → 원래 가던 곳
 * - 그 밖: 시작한 사람은 홈, 아직이면 첫 캡처 화면
 * 링크(딥링크·로그인 복귀·KKTI 공유·검색 가이드의 /start?q=)로 열면 그 화면이 바로 열리고 여기를 거치지 않는다 —
 * 그래서 안내가 링크를 막지 않고, 안내의 판이 그대로 남아 다음에 앱을 처음 화면으로 열 때 보여 준다.
 */
export function entryRoute(s: EntryState, guideVersion: string): EntryRoute {
  if (!s.started && !s.onboardingSeen) return '/welcome';
  if (s.guideSeen !== guideVersion) return '/welcome?from=update';
  return homeRoute(s.started);
}
