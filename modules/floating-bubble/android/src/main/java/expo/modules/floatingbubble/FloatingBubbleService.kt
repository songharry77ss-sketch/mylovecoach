package expo.modules.floatingbubble

import android.animation.Animator
import android.animation.AnimatorListenerAdapter
import android.animation.TimeInterpolator
import android.animation.ValueAnimator
import android.annotation.SuppressLint
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.content.pm.ServiceInfo
import android.content.res.Configuration
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.Point
import android.graphics.drawable.GradientDrawable
import android.hardware.display.DisplayManager
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.provider.Settings
import android.util.Log
import android.view.Display
import android.view.Gravity
import android.view.HapticFeedbackConstants
import android.view.MotionEvent
import android.view.VelocityTracker
import android.view.View
import android.view.ViewConfiguration
import android.view.ViewOutlineProvider
import android.view.WindowInsets
import android.view.WindowManager
import android.view.animation.AccelerateInterpolator
import android.view.animation.DecelerateInterpolator
import android.view.animation.OvershootInterpolator
import android.widget.FrameLayout
import android.widget.ImageView
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.roundToInt

/**
 * 다른 앱 위에 떠 있는 「연애코치 버블」을 띄우고 유지하는 포그라운드 서비스.
 *
 * - 짧게 탭: `mylovecoach://quick` 으로 앱을 연다
 * - 드래그: 손가락을 따라 움직이고, 놓으면 가까운 좌우 가장자리로 부드럽게 붙는다
 * - 드래그 중 화면 아래 ✕ 닫기 영역에 놓으면 서비스 종료
 * - 알림을 누르면 서비스 종료
 */
class FloatingBubbleService : Service() {

  /** 버블 창 왼쪽 위(x, y)가 움직일 수 있는 범위와 화면 크기 (모두 px) */
  private class Area(
    val width: Int,
    val height: Int,
    val insetLeft: Int,
    val insetRight: Int,
    val insetBottom: Int,
    val minX: Int,
    val maxX: Int,
    val minY: Int,
    val maxY: Int
  ) {
    fun yRatio(y: Int): Float =
      if (maxY > minY) ((y - minY).toFloat() / (maxY - minY)).coerceIn(0f, 1f) else 0f

    fun yFromRatio(ratio: Float): Int = minY + (ratio.coerceIn(0f, 1f) * (maxY - minY)).roundToInt()
  }

  private val handler = Handler(Looper.getMainLooper())
  private val reclampRunnable = Runnable { reclampToEdge() }
  private val prefs: SharedPreferences by lazy { getSharedPreferences(PREFS_NAME, MODE_PRIVATE) }

  // 창을 붙일 때 쓰는 컨텍스트 (안드로이드 11+ 는 오버레이 전용 창 컨텍스트)
  private var uiContext: Context? = null
  private var windowManager: WindowManager? = null
  private var density = 1f

  private var bubbleRoot: BubbleRootView? = null
  private var bubbleIcon: ImageView? = null
  private var bubbleParams: WindowManager.LayoutParams? = null
  private var closeRoot: FrameLayout? = null
  private var closeView: CloseTargetView? = null
  private var closeParams: WindowManager.LayoutParams? = null

  private var bubbleSize = 0
  private var bubbleWindowSize = 0
  private var closeWindowSize = 0
  private var touchSlop = 0
  private var magnetRadius = 0f
  private var flingVelocity = 0f

  // 마지막 위치 = 붙어 있는 쪽 + 세로 비율. 회전하거나 다시 켜도 같은 쪽·같은 높이 비율로 돌아온다.
  private var onRight = true
  private var yRatio = DEFAULT_Y_RATIO

  // 드래그 상태
  private var dragging = false
  private var inCloseZone = false
  private var dismissing = false
  private var downRawX = 0f
  private var downRawY = 0f
  private var dragStartX = 0
  private var dragStartY = 0
  private var gestureArea: Area? = null
  private var closeCenterX = 0
  private var closeCenterY = 0
  private var velocityTracker: VelocityTracker? = null
  private var moveAnimator: ValueAnimator? = null

  private var lastStartId = 0
  private var displayListenerRegistered = false

  private val displayListener = object : DisplayManager.DisplayListener {
    override fun onDisplayAdded(displayId: Int) = Unit
    override fun onDisplayRemoved(displayId: Int) = Unit
    override fun onDisplayChanged(displayId: Int) {
      if (displayId == Display.DEFAULT_DISPLAY) scheduleReclamp()
    }
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    lastStartId = startId
    if (intent?.action == ACTION_STOP) {
      isActive = false
      // startId 를 넘겨야, 그 사이에 들어온 새 start 요청이 있을 때 서비스를 내리지 않는다
      stopSelf(startId)
      return START_NOT_STICKY
    }
    if (intent == null) {
      return restartAfterProcessDeath(startId)
    }
    // startForegroundService() 로 시작됐으면 바로 startForeground() 를 불러야 한다 (늦으면 앱이 죽는다).
    // 그래서 권한 확인보다 먼저 포그라운드로 올리고, 실패하면 그 뒤에 내린다.
    if (!enterForeground() || !Settings.canDrawOverlays(this) || !safeShowBubble()) {
      isActive = false
      stopSelf(startId)
      return START_NOT_STICKY
    }
    isActive = true
    return START_STICKY
  }

  /**
   * 시스템이 프로세스를 정리한 뒤 START_STICKY 로 다시 살린 경우 (intent == null).
   * 안드로이드 15+ 는 오버레이 창이 보이는 상태여야 백그라운드에서 포그라운드 서비스를 시작할 수 있어
   * 창을 먼저 띄우고, 실패하면 잠시 뒤 한 번 더 시도한다.
   */
  private fun restartAfterProcessDeath(startId: Int): Int {
    if (!Settings.canDrawOverlays(this) || !safeShowBubble()) {
      isActive = false
      stopSelf(startId)
      return START_NOT_STICKY
    }
    isActive = true
    if (!enterForeground()) {
      handler.postDelayed({
        if (!enterForeground()) {
          isActive = false
          stopSelf(startId)
        }
      }, FOREGROUND_RETRY_DELAY_MS)
    }
    return START_STICKY
  }

  override fun onConfigurationChanged(newConfig: Configuration) {
    super.onConfigurationChanged(newConfig)
    scheduleReclamp()
  }

  override fun onDestroy() {
    isActive = false
    handler.removeCallbacksAndMessages(null)
    moveAnimator?.cancel()
    moveAnimator = null
    bubbleIcon?.animate()?.cancel()
    closeView?.animate()?.cancel()
    recycleVelocityTracker()
    if (displayListenerRegistered) {
      getSystemService(DisplayManager::class.java)?.unregisterDisplayListener(displayListener)
      displayListenerRegistered = false
    }
    removeWindow(bubbleRoot)
    removeWindow(closeRoot)
    bubbleRoot = null
    bubbleIcon = null
    bubbleParams = null
    closeRoot = null
    closeView = null
    closeParams = null
    try {
      stopForeground(STOP_FOREGROUND_REMOVE)
    } catch (e: Exception) {
      Log.w(TAG, "포그라운드 알림을 내리지 못했습니다", e)
    }
    super.onDestroy()
  }

  // ───────────────────────────── 포그라운드 알림 ─────────────────────────────

  private fun enterForeground(): Boolean {
    return try {
      val notification = buildNotification()
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
        startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
      } else {
        startForeground(NOTIFICATION_ID, notification)
      }
      true
    } catch (e: Exception) {
      // 안드로이드 12+ 백그라운드 시작 제한(ForegroundServiceStartNotAllowedException) 등
      Log.w(TAG, "포그라운드 서비스로 전환하지 못했습니다", e)
      false
    }
  }

  private fun buildNotification(): Notification {
    ensureNotificationChannel()
    // 알림을 누르면 버블을 끈다
    val stopIntent = Intent(this, FloatingBubbleService::class.java).setAction(ACTION_STOP)
    val contentIntent = PendingIntent.getService(
      this,
      0,
      stopIntent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
    return newNotificationBuilder()
      .setSmallIcon(R.drawable.floating_bubble_ic_notification)
      .setContentTitle(NOTIFICATION_TITLE)
      .setContentText(NOTIFICATION_TEXT)
      .setContentIntent(contentIntent)
      .setOngoing(true)
      .setShowWhen(false)
      .setOnlyAlertOnce(true)
      .setCategory(Notification.CATEGORY_SERVICE)
      .setColor(NOTIFICATION_COLOR)
      .build()
  }

  @Suppress("DEPRECATION")
  private fun newNotificationBuilder(): Notification.Builder =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      Notification.Builder(this, CHANNEL_ID)
    } else {
      Notification.Builder(this).setPriority(Notification.PRIORITY_LOW)
    }

  private fun ensureNotificationChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = getSystemService(NotificationManager::class.java) ?: return
    if (manager.getNotificationChannel(CHANNEL_ID) != null) return
    val channel = NotificationChannel(CHANNEL_ID, CHANNEL_NAME, NotificationManager.IMPORTANCE_LOW).apply {
      description = CHANNEL_DESCRIPTION
      setShowBadge(false)
    }
    manager.createNotificationChannel(channel)
  }

  // ───────────────────────────── 창 만들기 ─────────────────────────────

  private fun safeShowBubble(): Boolean =
    try {
      showBubble()
      true
    } catch (e: Exception) {
      // 권한이 막 꺼졌거나 제조사 추가 권한(팝업 표시 등)에 막힌 경우
      Log.w(TAG, "버블 창을 띄우지 못했습니다", e)
      false
    }

  private fun showBubble() {
    if (bubbleRoot != null) {
      // 중복 start: 창을 새로 만들지 않는다. 닫히던 중이었다면 다시 보이게만 한다.
      restoreBubbleAppearance()
      return
    }
    // 앞선 시도가 중간에 실패해 닫기 영역 창만 남았을 수 있다
    removeWindow(closeRoot)
    closeRoot = null
    closeView = null
    closeParams = null

    val context = createOverlayContext()
    val wm = context.getSystemService(WindowManager::class.java)
      ?: throw IllegalStateException("WindowManager 를 가져오지 못했습니다")
    uiContext = context
    windowManager = wm
    density = context.resources.displayMetrics.density
    bubbleSize = dp(BUBBLE_DP)
    bubbleWindowSize = bubbleSize + dp(SHADOW_PAD_DP) * 2
    closeWindowSize = dp(CLOSE_WINDOW_DP)
    touchSlop = ViewConfiguration.get(context).scaledTouchSlop
    magnetRadius = MAGNET_RADIUS_DP * density
    flingVelocity = FLING_DP_PER_SEC * density

    onRight = prefs.getBoolean(KEY_ON_RIGHT, true)
    yRatio = prefs.getFloat(KEY_Y_RATIO, DEFAULT_Y_RATIO)

    // 닫기 영역 창을 먼저 붙여야 z 순서상 버블 창 아래에 깔린다. 평소에는 GONE 이라 터치에 영향이 없다.
    addCloseTargetWindow(context, wm)
    addBubbleWindow(context, wm)

    if (!displayListenerRegistered) {
      getSystemService(DisplayManager::class.java)?.let {
        it.registerDisplayListener(displayListener, handler)
        displayListenerRegistered = true
      }
    }
  }

  private fun createOverlayContext(): Context {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      try {
        val display = getSystemService(DisplayManager::class.java)?.getDisplay(Display.DEFAULT_DISPLAY)
        if (display != null) {
          // 안드로이드 11+ 에서 서비스가 창을 띄울 때 권장되는 방식 (화면 크기·회전 정보가 정확하다)
          return createDisplayContext(display).createWindowContext(overlayWindowType(), null)
        }
      } catch (e: Exception) {
        Log.w(TAG, "창 컨텍스트를 만들지 못해 서비스 컨텍스트를 씁니다", e)
      }
    }
    return this
  }

  @SuppressLint("ClickableViewAccessibility")
  private fun addBubbleWindow(context: Context, wm: WindowManager) {
    val root = BubbleRootView(context) { scheduleReclamp() }
    val icon = ImageView(context).apply {
      layoutParams = FrameLayout.LayoutParams(bubbleSize, bubbleSize, Gravity.CENTER)
      background = GradientDrawable().apply {
        setShape(GradientDrawable.OVAL)
        setColor(Color.WHITE)
      }
      // 원형 외곽선 → 원형 그림자 + 원형 자르기
      outlineProvider = ViewOutlineProvider.BACKGROUND
      clipToOutline = true
      elevation = BUBBLE_ELEVATION_DP * density
      scaleType = ImageView.ScaleType.CENTER_CROP
      val bitmap = loadCircularAppIcon(context, bubbleSize)
      if (bitmap != null) {
        setImageBitmap(bitmap)
      } else {
        setImageDrawable(context.applicationInfo.loadIcon(context.packageManager))
      }
      importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
    }
    root.addView(icon)
    root.contentDescription = BUBBLE_DESCRIPTION
    root.isClickable = true
    // 탭과 접근성(톡백) 클릭 모두 여기로 온다
    root.setOnClickListener { openApp() }
    root.setOnTouchListener { view, event -> onBubbleTouch(view, event) }

    val area = currentArea()
    val params = overlayParams(bubbleWindowSize, touchable = true).apply {
      x = if (onRight) area.maxX else area.minX
      y = area.yFromRatio(yRatio)
    }
    // 처음 나타날 때 살짝 튀어나오는 효과
    icon.scaleX = 0.6f
    icon.scaleY = 0.6f
    icon.alpha = 0f
    wm.addView(root, params)
    bubbleRoot = root
    bubbleIcon = icon
    bubbleParams = params
    icon.animate()
      .scaleX(1f)
      .scaleY(1f)
      .alpha(1f)
      .setDuration(APPEAR_DURATION_MS)
      .setInterpolator(OvershootInterpolator(1.6f))
      .start()
  }

  private fun addCloseTargetWindow(context: Context, wm: WindowManager) {
    val root = FrameLayout(context).apply { visibility = View.GONE }
    val target = CloseTargetView(context).apply {
      layoutParams = FrameLayout.LayoutParams(
        FrameLayout.LayoutParams.MATCH_PARENT,
        FrameLayout.LayoutParams.MATCH_PARENT
      )
    }
    root.addView(target)
    // 닫기 영역은 터치를 받지 않는다 (손가락은 계속 버블 창이 잡고 있다)
    val params = overlayParams(closeWindowSize, touchable = false)
    wm.addView(root, params)
    closeRoot = root
    closeView = target
    closeParams = params
  }

  private fun overlayParams(size: Int, touchable: Boolean): WindowManager.LayoutParams {
    var flags = WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
      WindowManager.LayoutParams.FLAG_HARDWARE_ACCELERATED
    if (!touchable) flags = flags or WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE
    // 안드로이드 10 이하: 상태 표시줄까지 포함한 화면 기준 좌표를 쓴다 (11+ 는 아래 fitInsetsTypes = 0 이 같은 역할)
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
      flags = flags or WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN
    }
    // FLAG_LAYOUT_NO_LIMITS 는 쓰지 않는다 → 계산이 어긋나도 시스템이 창을 화면 안으로 밀어 넣는다
    return WindowManager.LayoutParams(size, size, overlayWindowType(), flags, PixelFormat.TRANSLUCENT).apply {
      gravity = Gravity.TOP or Gravity.LEFT
      title = "FloatingBubble"
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
        // 시스템 바를 피해 자동으로 밀어 넣지 않게 → x, y 가 화면 전체 기준이 되고 안전 영역은 직접 계산한다
        fitInsetsTypes = 0
        layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_ALWAYS
      }
    }
  }

  @Suppress("DEPRECATION")
  private fun overlayWindowType(): Int =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
    } else {
      WindowManager.LayoutParams.TYPE_PHONE
    }

  private fun removeWindow(view: View?) {
    if (view == null) return
    try {
      windowManager?.removeViewImmediate(view)
    } catch (e: Exception) {
      // 이미 떼어진 창이면 무시
    }
  }

  // ───────────────────────────── 화면 영역 계산 ─────────────────────────────

  private fun currentArea(): Area {
    val wm = windowManager
    var width: Int
    var height: Int
    var left = 0
    var top: Int
    var right = 0
    var bottom = 0
    if (wm != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      val metrics = wm.currentWindowMetrics
      width = metrics.bounds.width()
      height = metrics.bounds.height()
      // 시스템 바·노치는 보이든 숨었든 피한다 (전체 화면 영상 위에서도 같은 자리)
      val insets = metrics.windowInsets.getInsetsIgnoringVisibility(
        WindowInsets.Type.systemBars() or WindowInsets.Type.displayCutout()
      )
      left = insets.left
      top = insets.top
      right = insets.right
      bottom = insets.bottom
    } else {
      val size = legacyDisplaySize()
      width = size.x
      height = size.y
      top = statusBarHeight()
    }
    if (width <= 0 || height <= 0) {
      val metrics = resources.displayMetrics
      width = metrics.widthPixels
      height = metrics.heightPixels
    }
    val margin = dp(EDGE_MARGIN_DP)
    val minX = left
    val maxX = max(minX, width - right - bubbleWindowSize)
    val minY = top + margin
    val maxY = max(minY, height - bottom - bubbleWindowSize - margin)
    return Area(width, height, left, right, bottom, minX, maxX, minY, maxY)
  }

  /** 안드로이드 10 이하: 내비게이션 바를 뺀 앱 영역 크기 */
  @Suppress("DEPRECATION")
  private fun legacyDisplaySize(): Point {
    val size = Point()
    val wm = windowManager ?: getSystemService(WindowManager::class.java)
    wm?.defaultDisplay?.getSize(size)
    return size
  }

  @SuppressLint("DiscouragedApi", "InternalInsetResource")
  private fun statusBarHeight(): Int {
    val id = resources.getIdentifier("status_bar_height", "dimen", "android")
    return if (id > 0) resources.getDimensionPixelSize(id) else dp(24f)
  }

  private fun dp(value: Float): Int = (value * density).roundToInt()

  // ───────────────────────────── 터치·드래그 ─────────────────────────────

  private fun onBubbleTouch(view: View, event: MotionEvent): Boolean {
    if (dismissing) return true
    when (event.actionMasked) {
      MotionEvent.ACTION_DOWN -> {
        val params = bubbleParams ?: return false
        moveAnimator?.cancel()
        handler.removeCallbacks(reclampRunnable)
        gestureArea = currentArea()
        downRawX = event.rawX
        downRawY = event.rawY
        dragStartX = params.x
        dragStartY = params.y
        dragging = false
        inCloseZone = false
        recycleVelocityTracker()
        velocityTracker = VelocityTracker.obtain().also { trackVelocity(it, event) }
        pressIcon(true)
      }
      MotionEvent.ACTION_MOVE -> {
        velocityTracker?.let { trackVelocity(it, event) }
        val dx = event.rawX - downRawX
        val dy = event.rawY - downRawY
        if (!dragging && hypot(dx, dy) > touchSlop) {
          dragging = true
          pressIcon(false)
          view.performHapticFeedback(dragStartFeedback())
          showCloseTarget()
        }
        if (dragging) dragTo(dragStartX + dx.roundToInt(), dragStartY + dy.roundToInt())
      }
      MotionEvent.ACTION_UP -> {
        pressIcon(false)
        if (dragging) {
          val velocityX = velocityTracker?.let {
            it.computeCurrentVelocity(1000)
            it.xVelocity
          } ?: 0f
          endDrag(velocityX, cancelled = false)
        } else {
          // 거의 움직이지 않았으면 탭 → 앱 열기 (setOnClickListener)
          view.performClick()
        }
        recycleVelocityTracker()
      }
      MotionEvent.ACTION_CANCEL -> {
        pressIcon(false)
        if (dragging) endDrag(0f, cancelled = true)
        recycleVelocityTracker()
      }
    }
    return true
  }

  /** 창이 손가락을 따라 움직이므로 창 기준 좌표 대신 화면 좌표로 속도를 잰다 */
  private fun trackVelocity(tracker: VelocityTracker, event: MotionEvent) {
    val copy = MotionEvent.obtain(event)
    copy.offsetLocation(event.rawX - event.x, event.rawY - event.y)
    tracker.addMovement(copy)
    copy.recycle()
  }

  private fun recycleVelocityTracker() {
    velocityTracker?.recycle()
    velocityTracker = null
  }

  private fun dragTo(fingerX: Int, fingerY: Int) {
    val area = gestureArea ?: return
    val x = fingerX.coerceIn(area.minX, area.maxX)
    val y = fingerY.coerceIn(area.minY, area.maxY)
    val half = bubbleWindowSize / 2
    val near = closeRoot?.visibility == View.VISIBLE &&
      hypot((x + half - closeCenterX).toFloat(), (y + half - closeCenterY).toFloat()) < magnetRadius
    if (near != inCloseZone) {
      inCloseZone = near
      closeView?.setActive(near)
      if (near) {
        bubbleRoot?.performHapticFeedback(HapticFeedbackConstants.LONG_PRESS)
        // 닫기 영역 한가운데로 빨려 들어가듯 붙인다
        animateBubbleTo(closeCenterX - half, closeCenterY - half, MAGNET_DURATION_MS, DecelerateInterpolator())
      } else {
        moveAnimator?.cancel()
      }
    }
    if (!near) moveBubble(x, y)
  }

  private fun endDrag(velocityX: Float, cancelled: Boolean) {
    dragging = false
    val dismiss = inCloseZone && !cancelled
    inCloseZone = false
    hideCloseTarget()
    if (dismiss) dismissFromCloseTarget() else snapToEdge(velocityX)
  }

  /** 가까운(또는 세게 던진 쪽) 좌우 가장자리로 붙이고 위치를 저장한다 */
  private fun snapToEdge(velocityX: Float) {
    val params = bubbleParams ?: return
    val area = currentArea()
    val centerX = params.x + bubbleWindowSize / 2f
    val toRight = when {
      velocityX > flingVelocity -> true
      velocityX < -flingVelocity -> false
      else -> centerX > (area.insetLeft + area.width - area.insetRight) / 2f
    }
    val targetX = if (toRight) area.maxX else area.minX
    val targetY = params.y.coerceIn(area.minY, area.maxY)
    onRight = toRight
    yRatio = area.yRatio(targetY)
    savePosition()
    animateBubbleTo(targetX, targetY, SNAP_DURATION_MS, DecelerateInterpolator(1.6f))
  }

  private fun dismissFromCloseTarget() {
    dismissing = true
    isActive = false
    val icon = bubbleIcon
    if (icon == null) {
      stopSelf(lastStartId)
      return
    }
    icon.animate()
      .scaleX(0f)
      .scaleY(0f)
      .alpha(0f)
      .setDuration(DISMISS_DURATION_MS)
      .setInterpolator(AccelerateInterpolator())
      .withEndAction { stopSelf(lastStartId) }
      .start()
  }

  /** 닫히는 도중에 다시 start 가 들어온 경우 버블을 원래대로 되돌린다 */
  private fun restoreBubbleAppearance() {
    if (!dismissing) return
    dismissing = false
    bubbleIcon?.let {
      it.animate().cancel()
      it.scaleX = 1f
      it.scaleY = 1f
      it.alpha = 1f
    }
    reclampToEdge()
  }

  private fun pressIcon(pressed: Boolean) {
    val icon = bubbleIcon ?: return
    val scale = if (pressed) PRESSED_SCALE else 1f
    icon.animate()
      .scaleX(scale)
      .scaleY(scale)
      .setDuration(PRESS_DURATION_MS)
      .setInterpolator(DecelerateInterpolator())
      .start()
  }

  private fun dragStartFeedback(): Int =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      HapticFeedbackConstants.GESTURE_START
    } else {
      HapticFeedbackConstants.VIRTUAL_KEY
    }

  // ───────────────────────────── 닫기 영역 ─────────────────────────────

  private fun showCloseTarget() {
    val root = closeRoot ?: return
    val target = closeView ?: return
    val params = closeParams ?: return
    val area = gestureArea ?: currentArea()
    // 화면 아래 가운데 (내비게이션 바 위)
    params.x = (area.insetLeft + area.width - area.insetRight - closeWindowSize) / 2
    params.y = area.height - area.insetBottom - dp(CLOSE_BOTTOM_MARGIN_DP) - closeWindowSize
    closeCenterX = params.x + closeWindowSize / 2
    closeCenterY = params.y + closeWindowSize / 2
    try {
      windowManager?.updateViewLayout(root, params)
    } catch (e: Exception) {
      Log.w(TAG, "닫기 영역 위치를 옮기지 못했습니다", e)
      return
    }
    target.animate().cancel()
    target.setActive(false, animate = false)
    target.alpha = 0f
    target.translationY = CLOSE_ENTER_OFFSET_DP * density
    root.visibility = View.VISIBLE
    target.animate()
      .alpha(1f)
      .translationY(0f)
      .setDuration(CLOSE_SHOW_DURATION_MS)
      .setInterpolator(DecelerateInterpolator())
      .start()
  }

  private fun hideCloseTarget() {
    val root = closeRoot ?: return
    val target = closeView ?: return
    if (root.visibility != View.VISIBLE) return
    target.animate().cancel()
    target.animate()
      .alpha(0f)
      .translationY(CLOSE_ENTER_OFFSET_DP * density)
      .setDuration(CLOSE_HIDE_DURATION_MS)
      .setInterpolator(AccelerateInterpolator())
      .withEndAction {
        // 그 사이 새 드래그가 시작됐으면 그대로 둔다
        if (!dragging) {
          root.visibility = View.GONE
          target.setActive(false, animate = false)
        }
      }
      .start()
  }

  // ───────────────────────────── 이동·애니메이션 ─────────────────────────────

  private fun moveBubble(x: Int, y: Int) {
    val params = bubbleParams ?: return
    val root = bubbleRoot ?: return
    if (params.x == x && params.y == y) return
    params.x = x
    params.y = y
    try {
      windowManager?.updateViewLayout(root, params)
    } catch (e: Exception) {
      Log.w(TAG, "버블 위치를 옮기지 못했습니다", e)
    }
  }

  private fun animateBubbleTo(x: Int, y: Int, durationMs: Long, easing: TimeInterpolator) {
    val params = bubbleParams ?: return
    moveAnimator?.cancel()
    val fromX = params.x
    val fromY = params.y
    if (fromX == x && fromY == y) return
    moveAnimator = ValueAnimator.ofFloat(0f, 1f).apply {
      duration = durationMs
      interpolator = easing
      addUpdateListener {
        val t = it.animatedValue as Float
        moveBubble(fromX + ((x - fromX) * t).roundToInt(), fromY + ((y - fromY) * t).roundToInt())
      }
      addListener(object : AnimatorListenerAdapter() {
        override fun onAnimationEnd(animation: Animator) {
          if (moveAnimator === animation) moveAnimator = null
        }
      })
      start()
    }
  }

  /** 회전·화면 크기 변화 뒤 버블을 같은 쪽 가장자리·같은 높이 비율로 다시 놓는다 (화면 밖으로 나가지 않게) */
  private fun reclampToEdge() {
    if (dragging || dismissing || bubbleParams == null) return
    if (moveAnimator != null) {
      // 붙는 애니메이션이 끝난 뒤 다시 확인
      scheduleReclamp()
      return
    }
    val area = currentArea()
    moveBubble(if (onRight) area.maxX else area.minX, area.yFromRatio(yRatio))
  }

  private fun scheduleReclamp() {
    handler.removeCallbacks(reclampRunnable)
    handler.postDelayed(reclampRunnable, RECLAMP_DELAY_MS)
  }

  private fun savePosition() {
    prefs.edit()
      .putBoolean(KEY_ON_RIGHT, onRight)
      .putFloat(KEY_Y_RATIO, yRatio)
      .apply()
  }

  // ───────────────────────────── 앱 열기 ─────────────────────────────

  private fun openApp() {
    if (dismissing) return
    val intent = Intent(Intent.ACTION_VIEW, Uri.parse(QUICK_URL)).apply {
      setPackage(packageName)
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }
    try {
      startActivity(intent)
    } catch (e: Exception) {
      Log.w(TAG, "빠른 코치 화면을 열지 못해 앱 첫 화면을 엽니다", e)
      try {
        packageManager.getLaunchIntentForPackage(packageName)?.let {
          it.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
          startActivity(it)
        }
      } catch (inner: Exception) {
        Log.w(TAG, "앱을 열지 못했습니다", inner)
      }
    }
  }

  companion object {
    /** 알림을 누르거나 앱이 stop() 을 부를 때 쓰는 종료 액션 */
    const val ACTION_STOP = "expo.modules.floatingbubble.action.STOP"

    private const val TAG = "FloatingBubble"
    private const val QUICK_URL = "mylovecoach://quick"

    private const val CHANNEL_ID = "floating_bubble"
    private const val CHANNEL_NAME = "플로팅 버블"
    private const val CHANNEL_DESCRIPTION = "다른 앱 위에 연애코치 버블이 떠 있는 동안 보이는 알림이에요"
    private const val NOTIFICATION_ID = 4207
    private const val NOTIFICATION_TITLE = "연애코치 버블이 켜져 있어요"
    private const val NOTIFICATION_TEXT = "탭하면 버블을 꺼요"
    private const val NOTIFICATION_COLOR = 0xFF3DA0F2.toInt()
    private const val BUBBLE_DESCRIPTION = "연애코치 열기"

    private const val PREFS_NAME = "expo.modules.floatingbubble"
    private const val KEY_ON_RIGHT = "onRight"
    private const val KEY_Y_RATIO = "yRatio"
    private const val DEFAULT_Y_RATIO = 0.35f

    // 크기 (dp)
    private const val BUBBLE_DP = 56f
    private const val SHADOW_PAD_DP = 10f // 그림자가 창 밖으로 잘리지 않게 둘레에 두는 여백
    private const val BUBBLE_ELEVATION_DP = 4f
    private const val EDGE_MARGIN_DP = 8f
    private const val CLOSE_WINDOW_DP = 120f
    private const val CLOSE_BOTTOM_MARGIN_DP = 24f
    private const val CLOSE_ENTER_OFFSET_DP = 24f
    private const val MAGNET_RADIUS_DP = 72f
    private const val FLING_DP_PER_SEC = 900f
    private const val PRESSED_SCALE = 0.9f

    // 시간 (ms)
    private const val APPEAR_DURATION_MS = 220L
    private const val PRESS_DURATION_MS = 120L
    private const val SNAP_DURATION_MS = 280L
    private const val MAGNET_DURATION_MS = 120L
    private const val DISMISS_DURATION_MS = 180L
    private const val CLOSE_SHOW_DURATION_MS = 180L
    private const val CLOSE_HIDE_DURATION_MS = 160L
    private const val RECLAMP_DELAY_MS = 250L
    private const val FOREGROUND_RETRY_DELAY_MS = 600L

    /** 서비스가 켜져 있거나 막 켜지는 중이면 true (JS 의 isRunning) */
    @Volatile
    var isActive: Boolean = false
      private set

    /** 권한이 없으면 false. 있으면 포그라운드 서비스를 시작하고 true. */
    fun start(context: Context): Boolean {
      if (!Settings.canDrawOverlays(context)) return false
      val intent = Intent(context, FloatingBubbleService::class.java)
      // 서비스 쪽 onStartCommand 가 먼저 돌아도 값이 뒤집히지 않도록 시작 전에 켠다
      isActive = true
      return try {
        val component = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
          context.startForegroundService(intent)
        } else {
          context.startService(intent)
        }
        if (component == null) isActive = false
        component != null
      } catch (e: Exception) {
        // 안드로이드 12+ 백그라운드 시작 제한(ForegroundServiceStartNotAllowedException) 등
        Log.w(TAG, "버블 서비스를 시작하지 못했습니다", e)
        isActive = false
        false
      }
    }

    fun stop(context: Context) {
      val wasActive = isActive
      isActive = false
      val serviceIntent = Intent(context, FloatingBubbleService::class.java)
      if (!wasActive) {
        // 상태가 어긋났을 때를 대비해 내려 둔다 (떠 있지 않으면 아무 일도 없다)
        context.stopService(serviceIntent)
        return
      }
      try {
        // 앞선 start 요청 뒤에 순서대로 처리되므로, startForeground() 전에 서비스가 내려가 앱이 죽는 경쟁을 피한다
        context.startService(Intent(serviceIntent).setAction(ACTION_STOP))
      } catch (e: Exception) {
        // 앱이 백그라운드라 startService 가 막힌 경우 — 이미 포그라운드 상태이므로 바로 내려도 안전하다
        context.stopService(serviceIntent)
      }
    }
  }
}
