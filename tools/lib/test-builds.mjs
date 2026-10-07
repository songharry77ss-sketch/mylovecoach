// TestFlight 전용(무제한) 테스트 빌드 표시.
// ios.yml 을 free_unlimited 로 돌리면 앱이 횟수 제한·결제 화면 없이 만들어진다(EXPO_PUBLIC_FREE_UNLIMITED=1).
// 이런 빌드가 App Store 버전에 붙어 출시되면 모든 이용자가 공짜로 무제한이 되므로,
// TestFlight 「테스트할 내용(What to Test)」 첫 줄에 아래 표시를 달고 App Store 연결·제출 도구가 표시가 있는 빌드를 거부한다.

export const TEST_BUILD_MARKER = '⚠️ TestFlight 전용 무제한 테스트 빌드 — App Store 제출 금지';

/** TestFlight 전용 표시가 달린 빌드인지 (어느 언어 안내든 표시가 있으면 true) */
export async function isTestOnlyBuild(getAll, buildId) {
  const notes = await getAll(`/v1/builds/${buildId}/betaBuildLocalizations?limit=50`);
  return notes.some((n) => (n.attributes.whatsNew ?? '').includes(TEST_BUILD_MARKER));
}
