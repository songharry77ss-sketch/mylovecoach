package expo.modules.floatingbubble

import android.animation.ArgbEvaluator
import android.animation.ValueAnimator
import android.content.Context
import android.content.res.Configuration
import android.graphics.Bitmap
import android.graphics.BitmapShader
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Rect
import android.graphics.Shader
import android.graphics.drawable.AdaptiveIconDrawable
import android.os.Build
import android.view.View
import android.view.animation.DecelerateInterpolator
import android.widget.FrameLayout

/** 버블 창의 루트 뷰. 창 설정(회전·화면 크기)이 바뀌면 알려 준다. */
internal class BubbleRootView(
  context: Context,
  private val onConfigChanged: () -> Unit
) : FrameLayout(context) {
  override fun onConfigurationChanged(newConfig: Configuration) {
    super.onConfigurationChanged(newConfig)
    onConfigChanged()
  }
}

/** 드래그하는 동안 화면 아래 가운데에 뜨는 ✕ 「닫기 영역」. 버블이 가까이 오면 커지고 붉어진다. */
internal class CloseTargetView(context: Context) : View(context) {
  private val density = resources.displayMetrics.density
  private val baseRadius = 30f * density
  private val crossArm = 8f * density
  private val colorEvaluator = ArgbEvaluator()

  private val fillPaint = Paint(Paint.ANTI_ALIAS_FLAG)
  private val ringPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
    style = Paint.Style.STROKE
    strokeWidth = 1.5f * density
    color = RING_COLOR
  }
  private val crossPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
    style = Paint.Style.STROKE
    strokeWidth = 2.5f * density
    strokeCap = Paint.Cap.ROUND
    color = Color.WHITE
  }

  // 0 = 기본, 1 = 버블이 올라와 있음
  private var activeFraction = 0f
  private var animator: ValueAnimator? = null

  var active = false
    private set

  fun setActive(value: Boolean, animate: Boolean = true) {
    val target = if (value) 1f else 0f
    if (!animate) {
      animator?.cancel()
      animator = null
      active = value
      activeFraction = target
      invalidate()
      return
    }
    if (active == value) return
    active = value
    animator?.cancel()
    animator = ValueAnimator.ofFloat(activeFraction, target).apply {
      duration = 160L
      interpolator = DecelerateInterpolator()
      addUpdateListener {
        activeFraction = it.animatedValue as Float
        invalidate()
      }
      start()
    }
  }

  override fun onDetachedFromWindow() {
    animator?.cancel()
    animator = null
    super.onDetachedFromWindow()
  }

  override fun onDraw(canvas: Canvas) {
    super.onDraw(canvas)
    val cx = width / 2f
    val cy = height / 2f
    val radius = baseRadius * (1f + 0.22f * activeFraction)
    fillPaint.color = colorEvaluator.evaluate(activeFraction, IDLE_COLOR, ACTIVE_COLOR) as Int
    canvas.drawCircle(cx, cy, radius, fillPaint)
    canvas.drawCircle(cx, cy, radius, ringPaint)
    val arm = crossArm * (1f + 0.12f * activeFraction)
    canvas.drawLine(cx - arm, cy - arm, cx + arm, cy + arm, crossPaint)
    canvas.drawLine(cx - arm, cy + arm, cx + arm, cy - arm, crossPaint)
  }

  private companion object {
    // 반투명 짙은 회색 → 버블이 올라오면 분홍빛 빨강
    const val IDLE_COLOR = 0xB3242A33.toInt()
    const val ACTIVE_COLOR = 0xE6EF4B6C.toInt()
    const val RING_COLOR = 0x59FFFFFF
  }
}

/**
 * 앱 런처 아이콘을 지름 [sizePx] 의 원형 비트맵으로 그린다.
 * 적응형 아이콘은 기기마다 다른 마스크(물방울·둥근 사각형 등) 대신 직접 원으로 자른다.
 */
internal fun loadCircularAppIcon(context: Context, sizePx: Int): Bitmap? {
  if (sizePx <= 0) return null
  return try {
    val icon = context.packageManager.getApplicationIcon(context.packageName)
    val square = Bitmap.createBitmap(sizePx, sizePx, Bitmap.Config.ARGB_8888)
    val squareCanvas = Canvas(square)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && icon is AdaptiveIconDrawable) {
      // 적응형 아이콘 레이어(108dp)는 보이는 영역(가운데 72dp)보다 사방으로 25% 더 크다
      val inset = sizePx / 4
      val layerBounds = Rect(-inset, -inset, sizePx + inset, sizePx + inset)
      icon.background?.let {
        it.bounds = layerBounds
        it.draw(squareCanvas)
      }
      icon.foreground?.let {
        it.bounds = layerBounds
        it.draw(squareCanvas)
      }
    } else {
      icon.setBounds(0, 0, sizePx, sizePx)
      icon.draw(squareCanvas)
    }
    // 가장자리가 매끄럽도록 셰이더 + 안티앨리어싱으로 원을 칠한다
    val round = Bitmap.createBitmap(sizePx, sizePx, Bitmap.Config.ARGB_8888)
    val paint = Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG).apply {
      shader = BitmapShader(square, Shader.TileMode.CLAMP, Shader.TileMode.CLAMP)
    }
    Canvas(round).drawCircle(sizePx / 2f, sizePx / 2f, sizePx / 2f, paint)
    square.recycle()
    round
  } catch (e: Exception) {
    null
  }
}
