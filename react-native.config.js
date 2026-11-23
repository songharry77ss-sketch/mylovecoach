/**
 * 네이티브 모듈 연결 예외.
 * - Google 앱 안 로그인(@react-native-google-signin)은 안드로이드에서만 쓴다(src/lib/google-native.android.ts).
 *   아이폰은 Apple 로그인과 브라우저 Google 로그인을 쓰므로 iOS 에는 연결하지 않는다(URL 스킴 설정 없이 빌드가 깨지지 않게).
 */
module.exports = {
  dependencies: {
    '@react-native-google-signin/google-signin': {
      platforms: { ios: null },
    },
  },
};
