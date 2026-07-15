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

internal fun KubdeeAccessibilityService.collectClickableNodes(node: AccessibilityNodeInfo?, output: MutableList<Pair<Rect, AccessibilityNodeInfo>>) {
  if (node == null) return
  if (node.isClickable) {
    val bounds = Rect()
    node.getBoundsInScreen(bounds)
    if (bounds.width() > 0 && bounds.height() > 0) {
      output.add(Rect(bounds) to node)
    }
  }

  for (index in 0 until node.childCount) {
    collectClickableNodes(node.getChild(index), output)
  }
}

internal fun KubdeeAccessibilityService.collectVisibleImageViewNodes(
  node: AccessibilityNodeInfo?,
  output: MutableList<Pair<Rect, AccessibilityNodeInfo>>,
  allowedPackageName: String? = null
) {
  if (node == null) return
  if (
    node.isVisibleToUser &&
    (allowedPackageName == null || node.packageName?.toString() == allowedPackageName) &&
    node.className?.toString() == "android.widget.ImageView"
  ) {
    val bounds = Rect()
    node.getBoundsInScreen(bounds)
    if (bounds.width() > 0 && bounds.height() > 0) {
      output.add(Rect(bounds) to node)
    }
  }

  for (index in 0 until node.childCount) {
    collectVisibleImageViewNodes(node.getChild(index), output, allowedPackageName)
  }
}

// Android ตั้ง contentDescription เป็น "คำอธิบายทั้งก้อน" ของโหนด ไม่ใช่ข้อความส่วนต่อจาก text
// การเอามาต่อกันจึงทำให้ badge ตัวเลขบนการ์ด (text="0") ไปเกาะหน้าชื่อสินค้าที่อยู่ใน
// contentDescription กลายเป็น "0 CIVAGO..." ตั้งแต่ต้นทาง และป้ายที่ตั้งซ้ำสองฝั่งกลายเป็น
// "ถัดไป ถัดไป" จนตัวกรองแบบเทียบเป๊ะพลาด — เลือกฝั่งที่ยาวกว่า (ฝั่งสั้นมักเป็น badge/ป้ายย่อ)
internal fun KubdeeAccessibilityService.readNodeText(node: AccessibilityNodeInfo): String {
  val text = node.text?.toString()?.trim().orEmpty()
  val description = node.contentDescription?.toString()?.trim().orEmpty()
  return when {
    text.isBlank() -> description
    description.isBlank() -> text
    description.length > text.length -> description
    else -> text
  }
}

internal fun KubdeeAccessibilityService.cleanNodeText(value: String): String =
  value.replace(Regex("""\s+"""), " ").trim()

internal fun KubdeeAccessibilityService.clickShopeeLikedMenu(): Boolean {
  val root = rootInActiveWindow ?: return false
  val screen = screenBounds(root)
  val textNodes = mutableListOf<TextNode>()
  collectTextNodes(root, textNodes, allowedPackageName = TARGET_PACKAGE_SHOPEE)

  val candidates = textNodes
    .filter { node ->
      node.node.isVisibleToUser &&
        SHOPEE_LIKED_TEXTS.any { node.text.contains(it, ignoreCase = true) } &&
        node.bounds.top > screen.top + (screen.height() * 0.08f).toInt() &&
        node.bounds.bottom < screen.bottom - (screen.height() * 0.12f).toInt()
    }
    .sortedWith(compareBy<TextNode> { it.bounds.top }.thenBy { it.bounds.left })

  for (candidate in candidates) {
    if (clickNode(candidate.node)) return true

    val tapBounds = menuTapBounds(candidate.node, candidate.bounds, screen)
    if (tapBlocking(tapBounds.centerX().toFloat(), tapBounds.centerY().toFloat())) {
      return true
    }
  }

  return false
}

internal fun KubdeeAccessibilityService.menuTapBounds(node: AccessibilityNodeInfo, fallback: Rect, screen: Rect): Rect {
  var current: AccessibilityNodeInfo? = node
  var best = Rect(fallback)
  while (current != null) {
    val bounds = Rect()
    current.getBoundsInScreen(bounds)
    val width = bounds.width()
    val height = bounds.height()
    if (
      bounds.top >= screen.top &&
      bounds.bottom <= screen.bottom &&
      width >= fallback.width() &&
      height in fallback.height()..(screen.height() * 0.18f).toInt()
    ) {
      best = Rect(bounds)
    }
    if (height > screen.height() * 0.4f || width >= screen.width()) break
    current = current.parent
  }
  return best
}

internal fun KubdeeAccessibilityService.clickByAnyText(
  texts: List<String>,
  exact: Boolean,
  allowedPackageName: String? = null
): Boolean {
  val root = rootInActiveWindow ?: return false
  val node = findVisibleMatchingNode(root, texts, exact = exact, includeResourceId = false, allowedPackageName = allowedPackageName)
    ?: findMatchingNode(root, texts, exact = exact, includeResourceId = false, allowedPackageName = allowedPackageName)
    ?: return false
  return clickNode(node)
}

internal fun KubdeeAccessibilityService.clickByResourceHint(hints: List<String>, allowedPackageName: String? = null): Boolean {
  val root = rootInActiveWindow ?: return false
  val node = findMatchingNode(
    root,
    hints,
    exact = false,
    includeResourceId = true,
    allowedPackageName = allowedPackageName
  ) ?: return false
  return clickNode(node)
}

internal fun KubdeeAccessibilityService.containsAnyText(
  texts: List<String>,
  contains: Boolean,
  allowedPackageName: String? = null
): Boolean {
  val root = rootInActiveWindow ?: return false
  return findMatchingNode(
    root,
    texts,
    exact = !contains,
    includeResourceId = false,
    allowedPackageName = allowedPackageName
  ) != null
}

internal fun KubdeeAccessibilityService.findMatchingNode(
  node: AccessibilityNodeInfo?,
  needles: List<String>,
  exact: Boolean,
  includeResourceId: Boolean,
  allowedPackageName: String? = null
): AccessibilityNodeInfo? {
  if (node == null) return null
  if (nodeMatches(node, needles, exact, includeResourceId, allowedPackageName)) return node

  for (index in 0 until node.childCount) {
    val found = findMatchingNode(node.getChild(index), needles, exact, includeResourceId, allowedPackageName)
    if (found != null) return found
  }

  return null
}

internal fun KubdeeAccessibilityService.findVisibleMatchingNode(
  node: AccessibilityNodeInfo?,
  needles: List<String>,
  exact: Boolean,
  includeResourceId: Boolean,
  allowedPackageName: String? = null
): AccessibilityNodeInfo? {
  if (node == null) return null
  if (
    nodeMatches(node, needles, exact, includeResourceId, allowedPackageName) &&
    isNodeVisibleOnScreen(node)
  ) {
    return node
  }

  for (index in 0 until node.childCount) {
    val found = findVisibleMatchingNode(node.getChild(index), needles, exact, includeResourceId, allowedPackageName)
    if (found != null) return found
  }

  return null
}

internal fun KubdeeAccessibilityService.isNodeVisibleOnScreen(node: AccessibilityNodeInfo): Boolean {
  if (!node.isVisibleToUser) return false
  val bounds = Rect()
  node.getBoundsInScreen(bounds)
  if (bounds.width() <= 0 || bounds.height() <= 0) return false
  val screen = displayBounds()
  return Rect.intersects(screen, bounds)
}

internal fun KubdeeAccessibilityService.nodeMatches(
  node: AccessibilityNodeInfo,
  needles: List<String>,
  exact: Boolean,
  includeResourceId: Boolean,
  allowedPackageName: String? = null
): Boolean {
  if (!isAllowedPackageNode(node, allowedPackageName)) return false

  val values = mutableListOf<String>()
  node.text?.toString()?.let(values::add)
  node.contentDescription?.toString()?.let(values::add)
  if (includeResourceId) {
    node.viewIdResourceName?.let(values::add)
  }

  return values.any { value ->
    val normalized = cleanNodeText(value)
    needles.any { needle ->
      if (exact) normalized.equals(needle, ignoreCase = true)
      else normalized.contains(needle, ignoreCase = true)
    }
  }
}

internal fun KubdeeAccessibilityService.isAllowedPackageNode(node: AccessibilityNodeInfo, allowedPackageName: String?): Boolean =
  allowedPackageName == null || node.packageName?.toString() == allowedPackageName

internal fun KubdeeAccessibilityService.containsNodeFromPackage(node: AccessibilityNodeInfo?, packageName: String): Boolean {
  if (node == null) return false
  if (node.packageName?.toString() == packageName) return true
  for (index in 0 until node.childCount) {
    if (containsNodeFromPackage(node.getChild(index), packageName)) return true
  }
  return false
}

internal fun KubdeeAccessibilityService.findNode(
  node: AccessibilityNodeInfo?,
  predicate: (AccessibilityNodeInfo) -> Boolean
): AccessibilityNodeInfo? {
  if (node == null) return null
  if (predicate(node)) return node
  for (index in 0 until node.childCount) {
    val found = findNode(node.getChild(index), predicate)
    if (found != null) return found
  }
  return null
}

internal fun KubdeeAccessibilityService.clickNode(
  node: AccessibilityNodeInfo,
  tapEventKey: String? = null
): Boolean {
  val clickable = findClickableNode(node)
  if (clickable != null) {
    showAutomationTapIndicatorForNodeClick(clickable, tapEventKey)
  }
  if (clickable?.performAction(AccessibilityNodeInfo.ACTION_CLICK) == true) {
    return true
  }

  return tapNodeCenter(node, tapEventKey = tapEventKey)
}

internal fun KubdeeAccessibilityService.tapNodeCenter(
  node: AccessibilityNodeInfo,
  durationMs: Long = 80L,
  tapEventKey: String? = null
): Boolean {
  val bounds = Rect()
  node.getBoundsInScreen(bounds)
  if (bounds.width() <= 0 || bounds.height() <= 0) return false
  return tapBlocking(
    bounds.centerX().toFloat(),
    bounds.centerY().toFloat(),
    durationMs = durationMs,
    tapEventKey = tapEventKey
  )
}

internal fun KubdeeAccessibilityService.scrollFirstScrollableForward(allowedPackageName: String? = null): Boolean {
  val root = rootInActiveWindow ?: return false
  val node = findBestScrollableNode(root, allowedPackageName) ?: return false
  return node.performAction(AccessibilityNodeInfo.ACTION_SCROLL_FORWARD)
}

internal fun KubdeeAccessibilityService.scrollFirstScrollableBackward(allowedPackageName: String? = null): Boolean {
  val root = rootInActiveWindow ?: return false
  val node = findBestScrollableNode(root, allowedPackageName) ?: return false
  return node.performAction(AccessibilityNodeInfo.ACTION_SCROLL_BACKWARD)
}

internal fun KubdeeAccessibilityService.findBestScrollableNode(
  node: AccessibilityNodeInfo?,
  allowedPackageName: String? = null
): AccessibilityNodeInfo? {
  val candidates = mutableListOf<Pair<Int, AccessibilityNodeInfo>>()
  collectScrollableNodes(node, candidates, allowedPackageName)
  return candidates.maxByOrNull { it.first }?.second
}

internal fun KubdeeAccessibilityService.collectScrollableNodes(
  node: AccessibilityNodeInfo?,
  output: MutableList<Pair<Int, AccessibilityNodeInfo>>,
  allowedPackageName: String?
) {
  if (node == null) return
  if (node.isScrollable && isAllowedPackageNode(node, allowedPackageName)) {
    val bounds = Rect()
    node.getBoundsInScreen(bounds)
    val screen = screenBounds(rootInActiveWindow)
    if (bounds.width() > 0 && bounds.height() > 0 && Rect.intersects(screen, bounds)) {
      val visibleHeight = (minOf(bounds.bottom, screen.bottom) - maxOf(bounds.top, screen.top)).coerceAtLeast(0)
      val visibleWidth = (minOf(bounds.right, screen.right) - maxOf(bounds.left, screen.left)).coerceAtLeast(0)
      val className = node.className?.toString().orEmpty().lowercase(Locale.ROOT)
      val resourceId = node.viewIdResourceName.orEmpty().lowercase(Locale.ROOT)
      val verticalScore = (visibleHeight - visibleWidth / 2).coerceAtLeast(0)
      val areaScore = (visibleHeight * visibleWidth) / 10_000
      val startsNearContentTop = if (bounds.top <= screen.top + (screen.height() * 0.32f).toInt()) 600 else 0
      val reachesBottomContent = if (bounds.bottom >= screen.bottom - (screen.height() * 0.18f).toInt()) 600 else 0
      val avoidsBottomNavOnly = if (bounds.height() >= screen.height() * 0.35f) 900 else -900
      val contentListReward = if (
        className.contains("recyclerview") ||
        className.contains("scrollview") ||
        resourceId.contains("main_view")
      ) 2_500 else 0
      val horizontalPagerPenalty = if (className.contains("viewpager")) -4_000 else 0
      val navigationPenalty = if (
        resourceId.contains("tab") ||
        resourceId.contains("navigation") ||
        bounds.top >= screen.bottom - (screen.height() * 0.24f).toInt()
      ) -4_000 else 0
      output.add(
        (
          verticalScore +
            areaScore +
            startsNearContentTop +
            reachesBottomContent +
            avoidsBottomNavOnly +
            contentListReward +
            horizontalPagerPenalty +
            navigationPenalty
        ) to node
      )
    }
  }
  for (index in 0 until node.childCount) {
    collectScrollableNodes(node.getChild(index), output, allowedPackageName)
  }
}

internal fun KubdeeAccessibilityService.swipeUpByScreen(
  durationMs: Long = 520L,
  startFraction: Float = 0.78f,
  endFraction: Float = 0.35f
): Boolean {
  val bounds = screenBounds(rootInActiveWindow)
  val x = bounds.centerX().toFloat()
  val startY = bounds.top + bounds.height() * startFraction
  val endY = bounds.top + bounds.height() * endFraction
  return swipeBlocking(x, startY, x, endY, durationMs)
}

internal fun KubdeeAccessibilityService.swipeDownByScreen(): Boolean {
  val bounds = screenBounds(rootInActiveWindow)
  val x = bounds.centerX().toFloat()
  val startY = bounds.top + bounds.height() * 0.35f
  val endY = bounds.top + bounds.height() * 0.78f
  return swipeBlocking(x, startY, x, endY, 520L)
}

internal fun KubdeeAccessibilityService.screenBounds(root: AccessibilityNodeInfo?): Rect {
  val bounds = Rect()
  root?.getBoundsInScreen(bounds)
  if (bounds.width() > 0 && bounds.height() > 0) {
    return bounds
  }

  val metrics = resources.displayMetrics
  return Rect(0, 0, metrics.widthPixels, metrics.heightPixels)
}

internal fun KubdeeAccessibilityService.displayBounds(): Rect {
  val metrics = resources.displayMetrics
  return Rect(0, 0, metrics.widthPixels, metrics.heightPixels)
}

internal fun KubdeeAccessibilityService.dismissShopeeBlockingPopups(): Boolean =
  clickByAnyText(
    listOf("ปิด", "Close", "ตกลง", "OK", "ข้าม", "Skip", "ไว้ทีหลัง", "Later", "Not now"),
    exact = true
  )

// Close a full-screen Shopee promo popup (e.g. seasonal 7.7 sale) whose only close control is an
// X icon with no text/content-desc. Target a small, roughly-square, unlabeled clickable in the
// upper-right — where promo close buttons sit — avoiding the action bar (very top) and the left.
// More aggressive than the text-based dismiss, so callers should use it only when navigation is stuck.
internal fun KubdeeAccessibilityService.dismissShopeePromoPopupByIcon(): Boolean {
  val root = rootInActiveWindow ?: return false
  val screen = screenBounds(root)
  val minSize = (screen.width() * 0.045f).toInt()
  val maxSize = (screen.width() * 0.14f).toInt()
  val topLimit = screen.top + (screen.height() * 0.08f).toInt()
  val bottomLimit = screen.top + (screen.height() * 0.34f).toInt()
  val leftLimit = screen.left + (screen.width() * 0.72f).toInt()
  var best: Rect? = null
  fun visit(node: AccessibilityNodeInfo?, depth: Int = 0) {
    if (node == null || depth > 60) return
    if (node.isVisibleToUser && node.isClickable && node.packageName?.toString() == TARGET_PACKAGE_SHOPEE) {
      val bounds = Rect()
      node.getBoundsInScreen(bounds)
      val width = bounds.width()
      val height = bounds.height()
      val label = (node.text?.toString().orEmpty() + " " + node.contentDescription?.toString().orEmpty()).trim()
      val squareish = width in minSize..maxSize && height in minSize..maxSize &&
        kotlin.math.abs(width - height) <= (maxOf(width, height) * 0.4f).toInt()
      val inZone = bounds.centerY() in topLimit..bottomLimit && bounds.centerX() >= leftLimit
      if (squareish && inZone && label.isEmpty()) {
        val current = best
        if (current == null || bounds.top < current.top) best = Rect(bounds)
      }
    }
    for (index in 0 until node.childCount) visit(node.getChild(index), depth + 1)
  }
  visit(root)
  val target = best ?: return false
  logStep("ปิด popup โปรโมชั่น (ไอคอน X มุมขวาบน) ที่ ${target.centerX()},${target.centerY()}")
  return tapBlocking(target.centerX().toFloat(), target.centerY().toFloat(), timeoutMs = 1800L, durationMs = 90L)
}

// Serialize the visible Shopee accessibility tree (resource-id / class / text / content-desc /
// bounds / clickable) — the exact structure the scraper reads. Used to diagnose device- or
// Shopee-version-specific scrape failures remotely (which resource-ids exist, where the share/
// download buttons are, etc.).
internal fun KubdeeAccessibilityService.dumpShopeeAccessibilityTree(maxNodes: Int = 500): String {
  val root = rootInActiveWindow ?: return "(no active window)\n"
  val screen = screenBounds(root)
  val sb = StringBuilder()
  sb.append("screen=${screen.width()}x${screen.height()}\n")
  var count = 0
  fun visit(node: AccessibilityNodeInfo?, depth: Int) {
    if (node == null || count >= maxNodes) return
    if (node.packageName?.toString() == TARGET_PACKAGE_SHOPEE && node.isVisibleToUser) {
      val bounds = Rect()
      node.getBoundsInScreen(bounds)
      val rid = node.viewIdResourceName?.substringAfterLast('/').orEmpty()
      val cls = node.className?.toString()?.substringAfterLast('.').orEmpty()
      val txt = node.text?.toString()?.replace(Regex("""\s+"""), " ")?.take(40).orEmpty()
      val desc = node.contentDescription?.toString()?.replace(Regex("""\s+"""), " ")?.take(40).orEmpty()
      if (rid.isNotEmpty() || txt.isNotEmpty() || desc.isNotEmpty() || node.isClickable) {
        sb.append("  ".repeat(depth.coerceIn(0, 8)))
        sb.append(cls)
        if (rid.isNotEmpty()) sb.append(" #$rid")
        if (node.isClickable) sb.append(" [clk]")
        if (txt.isNotEmpty()) sb.append(" t=\"$txt\"")
        if (desc.isNotEmpty()) sb.append(" d=\"$desc\"")
        sb.append(" @${bounds.left},${bounds.top},${bounds.right},${bounds.bottom}\n")
        count += 1
      }
    }
    for (index in 0 until node.childCount) visit(node.getChild(index), depth + 1)
  }
  visit(root, 0)
  if (count >= maxNodes) sb.append("... (truncated at $maxNodes nodes)\n")
  return sb.toString()
}

// Write a scrape-failure diagnostic (device/version context + tree) to the app files dir. The JS
// side reads it after the import and forwards it to Sentry, so we can diagnose remotely without
// physical access. filesDir is shared between the :automation and main processes (same app/UID).
internal fun KubdeeAccessibilityService.writeShopeeScrapeDiagnostic(mode: String) {
  try {
    val header = buildString {
      append("mode=$mode\n")
      append("shopee=${shopeeAppVersionLabel(TARGET_PACKAGE_SHOPEE)}\n")
      append("device=${android.os.Build.MANUFACTURER} ${android.os.Build.MODEL} (Android ${android.os.Build.VERSION.RELEASE})\n")
      append("---\n")
    }
    java.io.File(filesDir, "shopee-diagnostic-latest.txt").writeText(header + dumpShopeeAccessibilityTree())
    logStep("บันทึกข้อมูลวินิจฉัยหน้าจอ (จะส่งให้ทีมอัตโนมัติเมื่อจบงาน)")
  } catch (error: Exception) {
    Log.w(TAG, "Unable to write scrape diagnostic", error)
  }
}

// Manual "report problem" diagnostic (user-triggered after Stop): the full run log + current-screen
// tree + a screenshot, so we can debug any issue on any device. Written to the shared files dir;
// the JS side picks them up in the report modal when the app returns to the foreground.
// onDone fires (on the main executor) once the screenshot has been written or given up on.
internal fun KubdeeAccessibilityService.writeShopeeReportDiagnostic(onDone: (() -> Unit)? = null) {
  try {
    val header = buildString {
      append("type=manual-report\n")
      append("shopee=${shopeeAppVersionLabel(TARGET_PACKAGE_SHOPEE)}\n")
      append("device=${android.os.Build.MANUFACTURER} ${android.os.Build.MODEL} (Android ${android.os.Build.VERSION.RELEASE})\n")
      append("--- LOG ---\n")
      append(fullAutomationLogText())
      append("\n--- TREE ---\n")
    }
    java.io.File(filesDir, "shopee-diagnostic-latest.txt").writeText(header + dumpShopeeAccessibilityTree())
  } catch (error: Exception) {
    Log.w(TAG, "Unable to write report diagnostic", error)
  }
  takeAutomationScreenshotToFile(onDone)
}

// The user's description typed on the overlay panel. Its EXISTENCE is also the "ready" marker:
// the JS side only forwards a manual report once this file appears (i.e. the user tapped ส่ง),
// so a flush can't race the user while they are still typing.
internal fun KubdeeAccessibilityService.writeShopeeReportDescription(description: String) {
  try {
    java.io.File(filesDir, "shopee-diagnostic-desc.txt").writeText(description)
  } catch (error: Exception) {
    Log.w(TAG, "Unable to write report description", error)
  }
}

// Cancel path: throw away a captured-but-unsent report (panel dismissed / user left mid-typing).
internal fun KubdeeAccessibilityService.deleteShopeeReportDiagnosticFiles() {
  for (name in listOf(
    "shopee-diagnostic-latest.txt",
    "shopee-diagnostic-screenshot.jpg",
    "shopee-diagnostic-desc.txt"
  )) {
    try {
      java.io.File(filesDir, name).delete()
    } catch (_: Exception) {
      // best-effort
    }
  }
}

// Capture a downscaled screenshot of the current screen to the files dir (best-effort; API 30+).
// onDone always fires exactly once — success, failure, or unsupported device.
internal fun KubdeeAccessibilityService.takeAutomationScreenshotToFile(onDone: (() -> Unit)? = null) {
  if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
    onDone?.invoke()
    return
  }
  try {
    takeScreenshot(
      android.view.Display.DEFAULT_DISPLAY,
      mainExecutor,
      object : AccessibilityService.TakeScreenshotCallback {
        override fun onSuccess(result: AccessibilityService.ScreenshotResult) {
          try {
            val buffer = result.hardwareBuffer
            val bitmap = android.graphics.Bitmap.wrapHardwareBuffer(buffer, result.colorSpace)
            buffer.close()
            if (bitmap != null) {
              val scaled = if (bitmap.width > 800) {
                val ratio = 800f / bitmap.width
                android.graphics.Bitmap.createScaledBitmap(bitmap, 800, (bitmap.height * ratio).toInt(), true)
              } else {
                bitmap
              }
              java.io.File(filesDir, "shopee-diagnostic-screenshot.jpg").outputStream().use { out ->
                scaled.compress(android.graphics.Bitmap.CompressFormat.JPEG, 55, out)
              }
            }
          } catch (error: Exception) {
            Log.w(TAG, "Unable to save automation screenshot", error)
          } finally {
            onDone?.invoke()
          }
        }

        override fun onFailure(errorCode: Int) {
          Log.w(TAG, "takeScreenshot failed: $errorCode")
          onDone?.invoke()
        }
      }
    )
  } catch (error: Exception) {
    Log.w(TAG, "takeScreenshot error", error)
    onDone?.invoke()
  }
}
