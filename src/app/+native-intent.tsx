/**
 * 앱 밖에서 들어온 주소를 어느 화면으로 열지 정한다 (expo-router).
 * 카카오·Google 로그인에서 돌아오는 주소(auth/callback)는 앱이 켜져 있으면 로그인 창(openAuthSessionAsync)이 받아 처리하므로
 * 화면을 따로 열지 않는다 — 열면 콜백 화면이 화면 순서를 바꿔 버린다(안드로이드).
 * 로그인 도중 앱이 꺼졌다가 이 주소로 다시 켜진 경우(initial)에는 콜백 화면이 로그인을 마무리한다.
 */
export function redirectSystemPath({ path, initial }: { path: string; initial: boolean }) {
  if (!initial && path.includes('auth/callback')) return null;
  return path;
}
