package expo.modules.installattribution

import android.os.Handler
import android.os.Looper
import com.android.installreferrer.api.InstallReferrerClient
import com.android.installreferrer.api.InstallReferrerStateListener
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.concurrent.atomic.AtomicBoolean

/**
 * JS 에서 `InstallAttribution` 으로 부르는 모듈 (안드로이드).
 * Play 설치 경로(install referrer)와 클릭·설치 시각만 읽는다 — 광고 ID·기기 정보는 읽지 않고, 네이티브에서 저장·전송·로그하지 않는다.
 * 구글 광고로 설치했으면 경로에 gclid 가, /go 홍보 링크로 왔으면 utm_source=go-코드 가 들어 있다. 해석은 JS(src/lib/install-attribution.ts)가 한다.
 */
class InstallAttributionModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("InstallAttribution")

    AsyncFunction("getInstallReferrer") { promise: Promise ->
      val context = appContext.reactContext
      if (context == null) {
        promise.reject("ERR_REFERRER", "referrer_failed", null)
        return@AsyncFunction
      }
      val client = try {
        InstallReferrerClient.newBuilder(context).build()
      } catch (e: Exception) {
        promise.reject("ERR_REFERRER", "referrer_failed", null)
        return@AsyncFunction
      }
      val done = AtomicBoolean(false)
      val handler = Handler(Looper.getMainLooper())
      // 한 번만 끝내고 연결을 닫는다 (시간 초과·끊김·응답이 겹쳐도)
      fun finish(block: () -> Unit) {
        if (!done.compareAndSet(false, true)) return
        handler.removeCallbacksAndMessages(null)
        try {
          client.endConnection()
        } catch (_: Exception) {
          // 이미 끊겼다
        }
        block()
      }
      handler.postDelayed({ finish { promise.reject("ERR_REFERRER", "referrer_timeout", null) } }, TIMEOUT_MS)
      try {
        client.startConnection(object : InstallReferrerStateListener {
          override fun onInstallReferrerSetupFinished(responseCode: Int) {
            if (responseCode != InstallReferrerClient.InstallReferrerResponse.OK) {
              // 2 = 이 기기 Play 가 지원하지 않음 (다시 해도 같다) · 그 밖은 잠깐의 오류
              finish { promise.reject("ERR_REFERRER", "referrer_unavailable:$responseCode", null) }
              return
            }
            try {
              val details = client.installReferrer
              val result = mapOf(
                "referrer" to (details.installReferrer ?: ""),
                "clickTs" to details.referrerClickTimestampSeconds,
                "installTs" to details.installBeginTimestampSeconds,
              )
              finish { promise.resolve(result) }
            } catch (_: Exception) {
              finish { promise.reject("ERR_REFERRER", "referrer_failed", null) }
            }
          }

          override fun onInstallReferrerServiceDisconnected() {
            finish { promise.reject("ERR_REFERRER", "referrer_unavailable:-1", null) }
          }
        })
      } catch (_: Exception) {
        finish { promise.reject("ERR_REFERRER", "referrer_failed", null) }
      }
    }
  }

  companion object {
    private const val TIMEOUT_MS = 8_000L
  }
}
