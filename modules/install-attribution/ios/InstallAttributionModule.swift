import AdServices
import ExpoModulesCore

/**
 JS 에서 `InstallAttribution` 으로 부르는 모듈 (iOS).
 애플 광고(Apple Ads) 설치 귀속 토큰만 만든다 — 광고 ID(IDFA)·추적 허용(ATT) 동의가 필요 없고, 네이티브에서 토큰을 저장·로그·전송하지 않는다.
 JS(src/lib/install-attribution.ts)가 토큰을 애플 귀속 API 로 보내 캠페인·광고그룹·키워드 번호를 받는다 (토큰 수명 24시간).

 거절 메시지: "token_unavailable:unsupported"(이 기기·OS 는 다시 해도 같다) · "token_unavailable:<오류 번호>"(다음 실행에 다시)
 AsyncFunction 은 모듈 큐(메인 스레드가 아님)에서 돌아서, 동기 호출인 attributionToken() 이 화면을 막지 않는다.
 */
public class InstallAttributionModule: Module {
  public func definition() -> ModuleDefinition {
    Name("InstallAttribution")

    AsyncFunction("getAppleAdsToken") { (promise: Promise) in
      do {
        let token = try AAAttribution.attributionToken()
        promise.resolve(token)
      } catch let error as AAAttributionError {
        if error.code == .platformNotSupported {
          promise.reject("ERR_TOKEN", "token_unavailable:unsupported")
        } else {
          promise.reject("ERR_TOKEN", "token_unavailable:\(error.errorCode)")
        }
      } catch {
        promise.reject("ERR_TOKEN", "token_unavailable:\((error as NSError).code)")
      }
    }
  }
}
