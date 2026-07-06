package __PACKAGE_NAME__.automation

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

internal fun KubdeeAccessibilityService.launchPackage(packageName: String, resetTask: Boolean = false): Boolean {
  val launchIntent = packageManager.getLaunchIntentForPackage(packageName) ?: return false
  launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
  if (resetTask) {
    launchIntent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TASK)
    launchIntent.addFlags(Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED)
  } else {
    launchIntent.addFlags(Intent.FLAG_ACTIVITY_REORDER_TO_FRONT)
    launchIntent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP)
    launchIntent.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP)
  }
  return startActivityOnMainThread(launchIntent)
}

internal fun KubdeeAccessibilityService.launchKubdeeLibrary(): Boolean =
  startActivityOnMainThread(
    Intent(Intent.ACTION_VIEW, Uri.parse("kubdeeai://library")).apply {
      setPackage(packageName)
      addCategory(Intent.CATEGORY_BROWSABLE)
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP)
      addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP)
    }
  )

internal fun KubdeeAccessibilityService.launchKubdeeShopeePostList(): Boolean =
  startActivityOnMainThread(
    Intent(Intent.ACTION_VIEW, Uri.parse("kubdeeai://shopee")).apply {
      setPackage(packageName)
      addCategory(Intent.CATEGORY_BROWSABLE)
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP)
      addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP)
    }
  )

internal fun KubdeeAccessibilityService.closeShopeeBeforeFreshLaunch(packageName: String) {
  logStep("ปิด Shopee เดิมก่อนเริ่มงาน")
  performGlobalAction(AccessibilityService.GLOBAL_ACTION_HOME)
  sleepStep(550L)

  try {
    val activityManager = getSystemService(android.content.Context.ACTIVITY_SERVICE) as? ActivityManager
    activityManager?.killBackgroundProcesses(packageName)
    logStep("สั่งปิด process Shopee เดิมแล้ว")
  } catch (error: Exception) {
    Log.w(TAG, "Unable to kill Shopee background process", error)
    logStep("ปิด process Shopee เดิมไม่ได้ จะเปิดแบบ reset task")
  }

  sleepStep(850L)
}

internal fun KubdeeAccessibilityService.launchUrl(url: String, preferredPackage: String? = null): Boolean {
  val uri = Uri.parse(url)
  // When a specific browser is requested (Chrome) ALWAYS target it explicitly and NEVER fall
  // back to the system default browser. On this device the default is Samsung Internet, and the
  // old fallback made the background service open the WRONG browser, which then fought the
  // Chrome window and bounced the foreground back and forth. Do NOT gate on
  // getLaunchIntentForPackage(): in the :automation process it can return null even though
  // Chrome is installed and reachable via an explicit ACTION_VIEW intent. Also do NOT target
  // com.google.android.apps.chrome.Main: that alias is a translucent trampoline that closes
  // immediately when started from the background.
  if (!preferredPackage.isNullOrBlank()) {
    return startActivityOnMainThread(
      Intent(Intent.ACTION_VIEW, uri).apply {
        setPackage(preferredPackage)
        addCategory(Intent.CATEGORY_BROWSABLE)
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP)
      }
    )
  }
  return startActivityOnMainThread(
    Intent(Intent.ACTION_VIEW, uri).apply {
      addCategory(Intent.CATEGORY_BROWSABLE)
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP)
    }
  )
}

internal fun KubdeeAccessibilityService.startActivityOnMainThread(intent: Intent): Boolean {
  if (Looper.myLooper() == Looper.getMainLooper()) {
    return try {
      startActivity(intent)
      true
    } catch (_: Exception) {
      false
    }
  }

  var started = false
  val latch = CountDownLatch(1)
  mainHandler.post {
    started = try {
      startActivity(intent)
      true
    } catch (_: Exception) {
      false
    } finally {
      latch.countDown()
    }
  }
  return latch.await(2_000L, TimeUnit.MILLISECONDS) && started
}

internal fun KubdeeAccessibilityService.activeWindowPackageName(): String =
  rootInActiveWindow?.packageName?.toString().orEmpty()

internal fun KubdeeAccessibilityService.waitForPackageActive(packageName: String, timeoutMs: Long): Boolean {
  val start = System.currentTimeMillis()
  while (System.currentTimeMillis() - start < timeoutMs) {
    checkStopRequested()
    if (activeWindowPackageName() == packageName) return true
    sleepStep(250L)
  }
  return activeWindowPackageName() == packageName
}

internal fun KubdeeAccessibilityService.promptSetting(
  settings: JSONObject?,
  key: String,
  customKey: String? = null,
  fallback: String = ""
): String {
  val value = settings?.optString(key, "").orEmpty().trim()
  val customValue = customKey?.let { settings?.optString(it, "").orEmpty().trim() }.orEmpty()
  return when {
    value == "custom" && customValue.isNotBlank() -> customValue
    value.isNotBlank() && value != "auto" && value != "custom" -> value
    customValue.isNotBlank() -> customValue
    else -> fallback
  }
}

internal fun KubdeeAccessibilityService.promptSettingValue(settings: JSONObject?, key: String, fallback: String): String =
  settings?.optString(key, fallback).orEmpty().trim().ifBlank { fallback }

internal fun KubdeeAccessibilityService.imageCharacterInstruction(settings: JSONObject?): String {
  val mode = promptSettingValue(settings, "characterMode", "auto")
  val description = settings?.optString("characterDescription", "").orEmpty().trim()
  return when {
    mode == "none" -> "ตัวละคร: ไม่มีคนในภาพ ให้โฟกัสสินค้าเท่านั้น"
    mode == "description" && description.isNotBlank() -> "ตัวละคร: $description"
    mode == "description" -> "ตัวละคร: มีคนรีวิวสินค้าแบบธรรมชาติ"
    else -> "ตัวละคร: ออโต้ เลือกคน/มือ/องค์ประกอบให้เหมาะกับสินค้า"
  }
}

internal fun KubdeeAccessibilityService.imageSceneInstruction(settings: JSONObject?): String {
  val mode = promptSettingValue(settings, "sceneMode", "auto")
  val description = settings?.optString("sceneDescription", "").orEmpty().trim()
  return when {
    mode == "none" -> "ฉากหลัก: ไม่มีฉากซับซ้อน ใช้พื้นหลังสะอาด"
    mode == "description" && description.isNotBlank() -> "ฉากหลัก: $description"
    mode == "description" -> "ฉากหลัก: ฉากใช้งานจริงที่เหมาะกับสินค้า"
    else -> "ฉากหลัก: ออโต้ เลือกฉากที่ช่วยขายสินค้า"
  }
}

internal fun KubdeeAccessibilityService.productDisplayInstruction(settings: JSONObject?): String =
  when (promptSettingValue(settings, "productDisplayMode", "auto")) {
    "wear" -> "การโชว์สินค้า: ให้ตัวละครสวม ใส่ หรือใช้สินค้าตามประเภทรายการ"
    "hold" -> "การโชว์สินค้า: ให้ถือสินค้าเด่นชัดในมือ"
    "use" -> "การโชว์สินค้า: แสดงการใช้งานจริงของสินค้า"
    "display" -> "การโชว์สินค้า: วางสินค้าเด่นบนฉากแบบ product display"
    else -> "การโชว์สินค้า: ออโต้ เลือกวิธีนำเสนอที่ขายดีที่สุด"
  }

internal fun KubdeeAccessibilityService.videoCharacterInstruction(settings: JSONObject?): String =
  when (promptSettingValue(settings, "characterMode", "fromImage")) {
    "none" -> "ตัวละครวิดีโอ: ไม่มีคนในวิดีโอ โฟกัสสินค้าและ movement"
    else -> "ตัวละครวิดีโอ: ใช้ตัวละคร/มือ/สินค้าให้ต่อเนื่องจากรูปอ้างอิง"
  }

internal fun KubdeeAccessibilityService.tapBlocking(
  x: Float,
  y: Float,
  timeoutMs: Long = 2500,
  durationMs: Long = 80L,
  showTapIndicator: Boolean = shouldShowAutomationTapIndicator(),
  tapEventKey: String? = null
): Boolean {
  if (showTapIndicator) {
    showAutomationTapIndicatorBeforeTap(x, y, eventKey = tapEventKey)
  }
  var completed = false
  val latch = CountDownLatch(1)
  dispatchLineGesture(x, y, x, y, durationMs) { success ->
    completed = success
    latch.countDown()
  }

  return latch.await(timeoutMs, TimeUnit.MILLISECONDS) && completed
}

internal fun KubdeeAccessibilityService.longPressBlocking(x: Float, y: Float, timeoutMs: Long = 3200): Boolean {
  var completed = false
  val latch = CountDownLatch(1)
  dispatchLineGesture(x, y, x, y, 700L) { success ->
    completed = success
    latch.countDown()
  }

  return latch.await(timeoutMs, TimeUnit.MILLISECONDS) && completed
}

internal fun KubdeeAccessibilityService.swipeBlocking(
  startX: Float,
  startY: Float,
  endX: Float,
  endY: Float,
  durationMs: Long,
  timeoutMs: Long = durationMs + 2500
): Boolean {
  var completed = false
  val latch = CountDownLatch(1)
  swipe(startX, startY, endX, endY, durationMs) { success ->
    completed = success
    latch.countDown()
  }

  return latch.await(timeoutMs, TimeUnit.MILLISECONDS) && completed
}

internal fun KubdeeAccessibilityService.logStep(message: String) {
  Log.d(TAG, "Shopee runner: $message")
  noteAutomationTapIndicatorLogEvent(message)
  addAutomationLogLine(message)
  when (automationLogKindForThread.get() ?: activeShopeeAutomationLogKind ?: ShopeeAutomationLogKind.IMPORT) {
    ShopeeAutomationLogKind.POST -> KubdeeAutomationIpc.sendShopeePostLog(this, message)
    ShopeeAutomationLogKind.CONVERT -> KubdeeAutomationIpc.sendShopeeConvertLog(this, message)
    ShopeeAutomationLogKind.IMPORT -> KubdeeAutomationIpc.sendShopeeImportLog(this, message)
  }
  showAutomationOverlay(message)
}

internal fun KubdeeAccessibilityService.logShopeePostStep(message: String) {
  Log.d(TAG, "Shopee post runner: $message")
  noteAutomationTapIndicatorLogEvent(message)
  addAutomationLogLine(message)
  KubdeeAutomationIpc.sendShopeePostLog(this, message)
  showAutomationOverlay(message)
}

internal fun KubdeeAccessibilityService.sleepStep(ms: Long) {
  val endAt = System.currentTimeMillis() + ms
  while (System.currentTimeMillis() < endAt) {
    checkStopRequested()
    try {
      Thread.sleep(minOf(250L, endAt - System.currentTimeMillis()).coerceAtLeast(1L))
    } catch (error: InterruptedException) {
      Thread.currentThread().interrupt()
      throw error
    }
  }
}

internal fun KubdeeAccessibilityService.checkStopRequested() {
  if (stopRequested) {
    throw ShopeeAutomationStoppedException()
  }
}

internal fun KubdeeAccessibilityService.resetAutomationLog() {
  synchronized(automationLogLines) {
    automationLogLines.clear()
  }
  synchronized(automationStatsLock) {
    automationStartedAtMs = System.currentTimeMillis()
    automationTaskLabel = "Automation"
    automationUnitLabel = "STEP"
    automationCurrentCount = 0
    automationTotalCount = 0
    automationSuccessCount = 0
    automationFailedCount = 0
    automationRound = 0
    automationTotalRounds = 0
    automationStatusLabel = "RUNNING"
  }
}

internal fun KubdeeAccessibilityService.configureAutomationStats(
  taskLabel: String,
  unitLabel: String,
  totalCount: Int = 0,
  totalRounds: Int = 0
) {
  updateAutomationStats(
    taskLabel = taskLabel,
    unitLabel = unitLabel,
    totalCount = totalCount,
    totalRounds = totalRounds,
    statusLabel = "RUNNING"
  )
}

internal fun KubdeeAccessibilityService.updateAutomationStats(
  taskLabel: String? = null,
  unitLabel: String? = null,
  currentCount: Int? = null,
  totalCount: Int? = null,
  successCount: Int? = null,
  failedCount: Int? = null,
  round: Int? = null,
  totalRounds: Int? = null,
  statusLabel: String? = null
) {
  synchronized(automationStatsLock) {
    if (automationStartedAtMs == 0L) {
      automationStartedAtMs = System.currentTimeMillis()
    }
    taskLabel?.let { automationTaskLabel = it }
    unitLabel?.let { automationUnitLabel = it }
    currentCount?.let { automationCurrentCount = it.coerceAtLeast(0) }
    totalCount?.let { automationTotalCount = it.coerceAtLeast(0) }
    successCount?.let { automationSuccessCount = it.coerceAtLeast(0) }
    failedCount?.let { automationFailedCount = it.coerceAtLeast(0) }
    round?.let { automationRound = it.coerceAtLeast(0) }
    totalRounds?.let { automationTotalRounds = it.coerceAtLeast(0) }
    statusLabel?.let { automationStatusLabel = it }
  }
}

internal fun KubdeeAccessibilityService.incrementAutomationFailedCount() {
  synchronized(automationStatsLock) {
    automationFailedCount += 1
  }
}

internal fun KubdeeAccessibilityService.addAutomationLogLine(message: String) {
  val stamp = java.text.SimpleDateFormat("HH:mm:ss", Locale.ROOT).format(java.util.Date())
  synchronized(automationLogLines) {
    automationLogLines.add("$stamp $message")
    while (automationLogLines.size > 40) {
      automationLogLines.removeAt(0)
    }
  }
}

internal fun KubdeeAccessibilityService.latestAutomationLogText(): String {
  val (lines, logCount) = synchronized(automationLogLines) {
    automationLogLines.takeLast(14) to automationLogLines.size
  }
  return buildString {
    append("Kubdee AI\n")
    append(automationStatsText(logCount))
    if (lines.isNotEmpty()) {
      append("\n")
      append(lines.joinToString("\n"))
    }
  }
}

internal fun KubdeeAccessibilityService.automationStatsText(logCount: Int): String {
  val (
    startedAt,
    taskLabel,
    unitLabel,
    currentCount,
    totalCount,
    successCount,
    failedCount,
    round,
    totalRounds,
    statusLabel
  ) = synchronized(automationStatsLock) {
    AutomationStatsSnapshot(
      startedAt = automationStartedAtMs,
      taskLabel = automationTaskLabel,
      unitLabel = automationUnitLabel,
      currentCount = automationCurrentCount,
      totalCount = automationTotalCount,
      successCount = automationSuccessCount,
      failedCount = automationFailedCount,
      round = automationRound,
      totalRounds = automationTotalRounds,
      statusLabel = automationStatusLabel
    )
  }
  val start = if (startedAt > 0L) startedAt else System.currentTimeMillis()
  val elapsedSeconds = ((System.currentTimeMillis() - start) / 1000L).coerceAtLeast(0L)
  val elapsed = "%02d:%02d".format(Locale.ROOT, elapsedSeconds / 60L, elapsedSeconds % 60L)
  val progressText = if (totalCount > 0) {
    "$unitLabel ${currentCount.coerceAtMost(totalCount)}/$totalCount"
  } else {
    "$unitLabel $currentCount"
  }
  val roundText = if (totalRounds > 0) "ROUND ${round.coerceAtMost(totalRounds)}/$totalRounds" else null
  val outcomeText = if (successCount > 0 || failedCount > 0) "OK $successCount  FAIL $failedCount" else null

  return listOfNotNull(
    "$statusLabel | $elapsed | LOG ${logCount.toString().padStart(2, '0')}",
    listOfNotNull(taskLabel, progressText, roundText).joinToString(" | "),
    outcomeText
  ).joinToString("\n")
}

internal fun KubdeeAccessibilityService.findClickableNode(node: AccessibilityNodeInfo?): AccessibilityNodeInfo? {
  var current = node
  while (current != null) {
    if (current.isClickable) {
      return current
    }
    current = current.parent
  }
  return null
}

internal fun KubdeeAccessibilityService.findEditableNode(
  node: AccessibilityNodeInfo?,
  allowedPackageName: String? = null
): AccessibilityNodeInfo? {
  if (node == null) return null
  if (node.isEditable && !isBlockedEditableNode(node) && isAllowedPackageNode(node, allowedPackageName)) return node

  for (index in 0 until node.childCount) {
    val found = findEditableNode(node.getChild(index), allowedPackageName)
    if (found != null) return found
  }

  return null
}

internal fun KubdeeAccessibilityService.accessibilityWindowRoots(): List<AccessibilityNodeInfo> {
  val roots = mutableListOf<AccessibilityNodeInfo>()
  rootInActiveWindow?.let { roots += it }
  try {
    windows.orEmpty().forEach { window ->
      window.root?.let { roots += it }
    }
  } catch (_: Exception) {
    // Some Android builds can throw while windows are changing; rootInActiveWindow remains the fallback.
  }
  return roots.distinctBy { root ->
    val bounds = Rect()
    root.getBoundsInScreen(bounds)
    "${root.packageName}:${bounds.flattenToString()}:${root.childCount}"
  }
}

internal fun KubdeeAccessibilityService.shopeeWindowRoots(): List<AccessibilityNodeInfo> =
  accessibilityWindowRoots()
    .filter { root -> containsNodeFromPackage(root, TARGET_PACKAGE_SHOPEE) }
    .ifEmpty {
      rootInActiveWindow
        ?.takeIf { root -> containsNodeFromPackage(root, TARGET_PACKAGE_SHOPEE) }
        ?.let { listOf(it) }
        ?: emptyList()
    }

internal fun KubdeeAccessibilityService.collectEditableNodes(
  node: AccessibilityNodeInfo?,
  allowedPackageName: String?,
  output: MutableList<Pair<Rect, AccessibilityNodeInfo>>
) {
  if (node == null) return
  if (
    node.isEditable &&
    !isBlockedEditableNode(node) &&
    isAllowedPackageNode(node, allowedPackageName)
  ) {
    val bounds = Rect()
    node.getBoundsInScreen(bounds)
    output += bounds to node
  }

  for (index in 0 until node.childCount) {
    collectEditableNodes(node.getChild(index), allowedPackageName, output)
  }
}

internal fun KubdeeAccessibilityService.isBlockedEditableNode(node: AccessibilityNodeInfo): Boolean {
  val resourceId = node.viewIdResourceName.orEmpty().lowercase(Locale.ROOT)
  if (
    resourceId.contains("com.android.chrome:id/url_bar") ||
    resourceId.contains("com.android.chrome:id/search_box_text") ||
    resourceId.contains("omnibox")
  ) {
    return true
  }

  val text = cleanNodeText(readNodeText(node))
  val bounds = Rect()
  node.getBoundsInScreen(bounds)
  val screen = screenBounds(rootInActiveWindow)
  return bounds.top <= screen.top + (screen.height() * 0.24f).toInt() &&
    (
      text.startsWith("http://", ignoreCase = true) ||
        text.startsWith("https://", ignoreCase = true) ||
        resourceId.contains("location")
    )
}
