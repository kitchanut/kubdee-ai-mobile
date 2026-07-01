package ai.kubdee.mobile.automation

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.app.ActivityManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.ClipData
import android.content.ClipboardManager
import android.content.ContentValues
import android.content.ContentUris
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.Color
import android.net.Uri
import android.graphics.Path
import android.graphics.PixelFormat
import android.graphics.Rect
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.os.Handler
import android.os.Looper
import android.provider.MediaStore
import android.util.Base64
import android.util.Log
import android.view.Gravity
import android.view.WindowManager
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import android.webkit.CookieManager
import android.widget.Button
import android.widget.TextView
import ai.kubdee.mobile.R
import java.io.ByteArrayInputStream
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.io.FilterInputStream
import java.io.InputStream
import java.io.OutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import java.util.Locale
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import org.json.JSONArray
import org.json.JSONObject

internal fun KubdeeAccessibilityService.beginAutomationForeground(message: String) {
  try {
    val notification = buildAutomationNotification(message)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      startForeground(
        AUTOMATION_NOTIFICATION_ID,
        notification,
        ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC
      )
    } else {
      startForeground(AUTOMATION_NOTIFICATION_ID, notification)
    }
    automationForegroundActive = true
    Log.d(TAG, "Automation foreground started")
  } catch (error: Exception) {
    automationForegroundActive = false
    Log.w(TAG, "Unable to start automation foreground service", error)
  }
}

@Synchronized
internal fun KubdeeAccessibilityService.endAutomationForeground() {
  if (!automationForegroundActive) return
  try {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
      stopForeground(android.app.Service.STOP_FOREGROUND_REMOVE)
    } else {
      @Suppress("DEPRECATION")
      stopForeground(true)
    }
    Log.d(TAG, "Automation foreground stopped")
  } catch (error: Exception) {
    Log.w(TAG, "Unable to stop automation foreground service", error)
  } finally {
    automationForegroundActive = false
  }
}

internal fun KubdeeAccessibilityService.buildAutomationNotification(message: String): Notification {
  ensureAutomationNotificationChannel()
  val launchIntent = packageManager.getLaunchIntentForPackage(packageName)?.apply {
    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP)
  }
  val pendingFlags = PendingIntent.FLAG_UPDATE_CURRENT or
    (if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) PendingIntent.FLAG_IMMUTABLE else 0)
  val pendingIntent = launchIntent?.let {
    PendingIntent.getActivity(this, 0, it, pendingFlags)
  }
  val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
    Notification.Builder(this, AUTOMATION_NOTIFICATION_CHANNEL_ID)
  } else {
    @Suppress("DEPRECATION")
    Notification.Builder(this)
  }

  builder
    .setSmallIcon(R.mipmap.ic_launcher)
    .setContentTitle("Kubdee AI")
    .setContentText(message)
    .setOngoing(true)
    .setShowWhen(false)
    .setCategory(Notification.CATEGORY_SERVICE)

  pendingIntent?.let { builder.setContentIntent(it) }

  if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
    @Suppress("DEPRECATION")
    builder.setPriority(Notification.PRIORITY_LOW)
  }
  if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
    builder.setForegroundServiceBehavior(Notification.FOREGROUND_SERVICE_IMMEDIATE)
  }

  return builder.build()
}

internal fun KubdeeAccessibilityService.ensureAutomationNotificationChannel() {
  if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
  val manager = getSystemService(android.content.Context.NOTIFICATION_SERVICE) as NotificationManager
  val existing = manager.getNotificationChannel(AUTOMATION_NOTIFICATION_CHANNEL_ID)
  if (existing != null) return

  manager.createNotificationChannel(
    NotificationChannel(
      AUTOMATION_NOTIFICATION_CHANNEL_ID,
      "Kubdee AI Automation",
      NotificationManager.IMPORTANCE_LOW
    ).apply {
      description = "Kubdee AI automation status"
      setShowBadge(false)
    }
  )
}

internal fun KubdeeAccessibilityService.showAutomationOverlay(message: String) {
  mainHandler.post {
    if (KubdeeAccessibilityService.getInstance() !== this) return@post
    val textView = ensureAutomationOverlay() ?: return@post
    textView.text = latestAutomationLogText()
    textView.visibility = android.view.View.VISIBLE
    ensureAutomationStopButton()?.let { button ->
      button.text = "Stop"
      button.visibility = android.view.View.VISIBLE
    }
  }
}

internal fun KubdeeAccessibilityService.hideAutomationOverlay(delayMs: Long) {
  mainHandler.postDelayed({
    removeAutomationOverlay()
  }, delayMs)
}

internal fun KubdeeAccessibilityService.removeAutomationOverlay() {
  mainHandler.post {
    overlayView?.let { view ->
      try {
        automationWindowManager.removeView(view)
      } catch (_: Exception) {
        // Overlay may already be detached by Android when the service stops.
      }
    }
    overlayView = null
    overlayStopButton?.let { view ->
      try {
        automationWindowManager.removeView(view)
      } catch (_: Exception) {
        // Overlay may already be detached by Android when the service stops.
      }
    }
    overlayStopButton = null
  }
}

internal fun KubdeeAccessibilityService.setAutomationStopButtonVisibleBlocking(visible: Boolean) {
  val latch = CountDownLatch(1)
  try {
    mainHandler.post {
      try {
        overlayStopButton?.visibility = if (visible) android.view.View.VISIBLE else android.view.View.GONE
      } finally {
        latch.countDown()
      }
    }
    latch.await(500L, TimeUnit.MILLISECONDS)
  } catch (error: Exception) {
    Log.w(TAG, "Unable to update automation stop button visibility", error)
  }
}

internal fun KubdeeAccessibilityService.ensureAutomationOverlay(): TextView? {
  if (automationOverlayUnavailable) return null
  overlayView?.let { return it }

  val textView = TextView(this).apply {
    setTextColor(Color.WHITE)
    textSize = 11f
    typeface = Typeface.MONOSPACE
    maxLines = 18
    setLineSpacing(1.0f, 1.08f)
    setPadding(dp(12), dp(10), dp(12), dp(10))
    background = GradientDrawable().apply {
      setColor(Color.argb(230, 17, 24, 39))
      cornerRadius = dp(14).toFloat()
      setStroke(dp(1), Color.argb(80, 255, 255, 255))
    }
  }

  val metrics = resources.displayMetrics
  val params = WindowManager.LayoutParams(
    (metrics.widthPixels - dp(28)).coerceAtLeast(dp(260)),
    WindowManager.LayoutParams.WRAP_CONTENT,
    WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY,
    WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
      WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE or
      WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
    PixelFormat.TRANSLUCENT
  ).apply {
    gravity = Gravity.TOP or Gravity.CENTER_HORIZONTAL
    x = 0
    y = automationOverlayTopOffset()
  }

  try {
    automationWindowManager.addView(textView, params)
    overlayView = textView
  } catch (error: Exception) {
    Log.w(TAG, "Unable to show automation overlay", error)
    automationOverlayUnavailable = true
    overlayView = null
    return null
  }
  return textView
}

internal fun KubdeeAccessibilityService.ensureAutomationStopButton(): Button? {
  if (automationOverlayUnavailable) return null
  overlayStopButton?.let { return it }

  val button = Button(this).apply {
    text = "Stop"
    textSize = 11f
    typeface = Typeface.DEFAULT_BOLD
    isAllCaps = false
    includeFontPadding = false
    minHeight = 0
    minWidth = 0
    minimumHeight = 0
    minimumWidth = 0
    setTextColor(Color.WHITE)
    setPadding(dp(10), 0, dp(10), 0)
    background = GradientDrawable().apply {
      setColor(Color.rgb(220, 38, 38))
      cornerRadius = dp(999).toFloat()
      setStroke(dp(1), Color.argb(150, 255, 255, 255))
    }
    setOnClickListener {
      requestStopShopeeAutomation()
    }
  }

  val params = WindowManager.LayoutParams(
    dp(92),
    dp(32),
    WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY,
    WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
      WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
    PixelFormat.TRANSLUCENT
  ).apply {
    gravity = Gravity.TOP or Gravity.END
    x = dp(28)
    y = automationOverlayTopOffset() + dp(10)
  }

  try {
    automationWindowManager.addView(button, params)
    overlayStopButton = button
  } catch (error: Exception) {
    Log.w(TAG, "Unable to show automation stop button", error)
    overlayStopButton = null
    return null
  }

  return button
}

internal val KubdeeAccessibilityService.automationWindowManager: WindowManager
  get() = getSystemService(android.content.Context.WINDOW_SERVICE) as WindowManager

internal fun KubdeeAccessibilityService.automationOverlayTopOffset(): Int = statusBarHeightPx() + dp(8)

internal fun KubdeeAccessibilityService.statusBarHeightPx(): Int {
  val resourceId = resources.getIdentifier("status_bar_height", "dimen", "android")
  return if (resourceId > 0) resources.getDimensionPixelSize(resourceId) else dp(24)
}

internal fun KubdeeAccessibilityService.dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()

internal fun KubdeeAccessibilityService.performBack(): Boolean = performGlobalAction(AccessibilityService.GLOBAL_ACTION_BACK)
