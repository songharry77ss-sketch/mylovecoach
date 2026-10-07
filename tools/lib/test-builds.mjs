// TestFlight 전용(무제한) 테스트 빌드 표시.
// ios.yml 을 free_unlimited 로 돌리면 앱이 횟수 제한·결제 화면 없이 만들어진다(EXPO_PUBLIC_FREE_UNLIMITED=1).
// 이런 빌드는 App Store 버전에 붙이지 않도록 TestFlight 「테스트할 내용(What to Test)」 끝에 아래 태그를 달고,
// App Store 연결·제출 도구(asc-listing.mjs · asc-submit.mjs)가 태그가 있는 빌드를 거부한다.
// 앱도 iOS 에서는 TestFlight(샌드박스) 설치일 때만 무제한을 켜므로(src/lib/billing/test-install.ts), 태그가 지워져도 App Store 이용자에게 무제한이 켜지지는 않는다.

/** 도구가 찾는 태그 (ASCII — 화면에서 문구를 고쳐도 이 태그만 남기면 된다) */
export const TEST_BUILD_TAG = '[TESTFLIGHT-ONLY]';

/** 테스터가 보는 「테스트할 내용」 — 테스터 입장의 안내 + 끝에 태그 */
export const TEST_BUILD_NOTES = `테스트 기간 동안 횟수 제한 없이 모든 기능을 써 볼 수 있는 버전이에요. 코칭 답장이 자연스러운지, 불편한 점은 없는지 알려주세요.\n\n${TEST_BUILD_TAG} App Store 제출용이 아닌 테스트 빌드`;

/** TestFlight 전용 태그가 달린 빌드인지 (어느 언어 안내든 태그가 있으면 true). 읽기에 실패하면 예외 — 부르는 쪽이 멈출지 정한다 */
export async function isTestOnlyBuild(getAll, buildId) {
  const notes = await getAll(`/v1/builds/${buildId}/betaBuildLocalizations?limit=50`);
  return notes.some((n) => (n.attributes.whatsNew ?? '').includes(TEST_BUILD_TAG));
}
