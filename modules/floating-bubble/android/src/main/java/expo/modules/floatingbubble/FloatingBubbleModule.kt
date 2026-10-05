package expo.modules.floatingbubble

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.Settings
import android.util.Log
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * JS 에서 `FloatingBubble` 이라는 이름으로 부르는 모듈.
 * 실제 버블(창·드래그·알림)은 [FloatingBubbleService] 가 맡고, 여기서는 권한 확인과 켜고 끄기만 한다.
 */
class FloatingBubbleModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("FloatingBubble")

    // 「다른 앱 위에 표시」 권한이 켜져 있는지
    Function<Boolean>("canDrawOverlays") {
      Settings.canDrawOverlays(context)
    }

    // 「다른 앱 위에 표시」 설정 화면을 연다
    Function<Unit>("openOverlaySettings") {
      openOverlaySettings(context)
    }

    // 권한이 없으면 false. 있으면 포그라운드 서비스를 시작하고 true.
    Function<Boolean>("start") {
      FloatingBubbleService.start(context)
    }

    Function<Unit>("stop") {
      FloatingBubbleService.stop(context)
    }

    Function<Boolean>("isRunning") {
      FloatingBubbleService.isActive
    }
  }

  private fun openOverlaySettings(context: Context) {
    val packageUri = Uri.parse("package:${context.packageName}")
    // 안드로이드 11 이상은 package: 를 무시하고 「다른 앱 위에 표시」 앱 목록을 연다 (OS 동작)
    val overlayIntent = Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, packageUri)
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    try {
      context.startActivity(overlayIntent)
    } catch (e: Exception) {
      // 안드로이드 Go 처럼 이 화면이 없는 기기가 있다 → 앱 정보 화면으로 대신 연다
      Log.w(TAG, "다른 앱 위에 표시 설정 화면을 열지 못해 앱 정보 화면을 엽니다", e)
      try {
        context.startActivity(
          Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, packageUri)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        )
      } catch (inner: Exception) {
        Log.w(TAG, "앱 정보 화면도 열지 못했습니다", inner)
      }
    }
  }

  private companion object {
    const val TAG = "FloatingBubble"
  }
}
