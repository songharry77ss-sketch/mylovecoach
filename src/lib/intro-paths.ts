/** 이 경로이거나 그 아래 경로인지 */
const opensAt = (path: string | null | undefined, root: string) => path === root || path?.startsWith(`${root}/`) === true;

/**
 * 앱을 열 때 로고 인트로 없이 바로 보여 줄 첫 화면.
 * - 빠른 코칭·로그인 콜백: 기다리게 하거나 OAuth 복귀 화면을 가리지 않는다.
 * - KKTI: 공유 링크로 처음 들어오는 사람(썸 상대 포함)의 입구라 연애코치 로고로 막지 않는다.
 */
export function skipIntroForPath(path: string | null | undefined): boolean {
  return opensAt(path, '/quick') || opensAt(path, '/kkti') || path === '/auth/callback';
}
