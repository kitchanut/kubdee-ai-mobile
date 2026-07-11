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
import android.media.MediaMetadataRetriever
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

internal fun KubdeeAccessibilityService.prepareShopeeNavigationSurface() {
  repeat(3) { attempt ->
    if (!waitForPackageActive(TARGET_PACKAGE_SHOPEE, 1_000L)) {
      logShopeePostStep("ดึง Shopee กลับมาหลังออกจากหน้าค้าง (${attempt + 1}/3)")
      if (!launchPackage(TARGET_PACKAGE_SHOPEE, resetTask = true)) {
        logShopeePostStep("เปิด Shopee จาก service ไม่สำเร็จ จะรอหน้าที่เปิดอยู่")
      }
      if (!waitForPackageActive(TARGET_PACKAGE_SHOPEE, 8_000L)) {
        throw IllegalStateException("ยังไม่เห็นหน้าต่าง Shopee หลังดึงกลับจากหน้าค้าง")
      }
      sleepStep(2500L)
    }

    dismissShopeeBlockingPopups()
    recoverShopeePostingSurfaceBeforeNavigation()

    if (waitForPackageActive(TARGET_PACKAGE_SHOPEE, 1_000L)) {
      dismissShopeeBlockingPopups()
      return
    }
  }

  throw IllegalStateException("Shopee หลุด foreground หลังออกจากหน้าค้าง")
}

internal fun KubdeeAccessibilityService.recoverShopeePostingSurfaceBeforeNavigation() {
  repeat(5) { attempt ->
    dismissShopeeBlockingPopups()
    if (isShopeeMePageVisible() || isShopeeMainNavigationVisible()) return
    if (!isShopeePostingSurfaceVisible()) return

    logShopeePostStep("ออกจากหน้า Shopee ที่ค้างก่อนเริ่มโพสต์ (${attempt + 1}/5)")
    if (!performBack()) return
    sleepStep(1200L)
    clickByAnyText(
      SHOPEE_LEAVE_POST_CONFIRM_TEXTS,
      exact = false,
      allowedPackageName = TARGET_PACKAGE_SHOPEE
    )
    sleepStep(900L)
  }
}

internal fun KubdeeAccessibilityService.isShopeePostingSurfaceVisible(): Boolean {
  val roots = shopeeWindowRoots()
  if (roots.isEmpty()) return false

  return roots.any { root ->
    val textNodes = mutableListOf<TextNode>()
    collectTextNodes(root, textNodes, allowedPackageName = TARGET_PACKAGE_SHOPEE)
    val shopeeTextNodes = textNodes
    val hasPostingText = shopeeTextNodes.any { node ->
      SHOPEE_POSTING_SURFACE_TEXTS.any { needle ->
        node.text.contains(needle, ignoreCase = true)
      }
    }
    val hasPostingResource = findMatchingNode(
      node = root,
      needles = SHOPEE_POSTING_SURFACE_RESOURCE_HINTS,
      exact = false,
      includeResourceId = true,
      allowedPackageName = TARGET_PACKAGE_SHOPEE
    ) != null

    val isSparseShopeeMediaSurface = shopeeTextNodes.size <= 2 && hasPostingResource
    isSparseShopeeMediaSurface || (hasPostingText && hasPostingResource)
  }
}

internal fun KubdeeAccessibilityService.isShopeeMainNavigationVisible(): Boolean =
  shopeeWindowRoots().any { root ->
    findVisibleMatchingNode(
      node = root,
      needles = listOf("ฉัน", "Me"),
      exact = true,
      includeResourceId = false,
      allowedPackageName = TARGET_PACKAGE_SHOPEE
    ) != null ||
      findMatchingNode(
        node = root,
        needles = listOf("tab_bar_button_me", "me_tab", "tab_me"),
        exact = false,
        includeResourceId = true,
        allowedPackageName = TARGET_PACKAGE_SHOPEE
      ) != null
  }

internal fun KubdeeAccessibilityService.tapShopeeAffiliateAccountTab(): Boolean {
  if (clickByAnyText(SHOPEE_ACCOUNT_TEXTS, exact = false, allowedPackageName = TARGET_PACKAGE_SHOPEE)) return true

  for (root in shopeeWindowRoots()) {
    val screen = screenBounds(root)
    val textNodes = mutableListOf<TextNode>()
    collectTextNodes(root, textNodes, allowedPackageName = TARGET_PACKAGE_SHOPEE)
    val candidates = textNodes
      .filter { candidate ->
        SHOPEE_ACCOUNT_TEXTS.any { needle -> candidate.text.contains(needle, ignoreCase = true) } &&
          candidate.bounds.top >= screen.top + (screen.height() * 0.78f).toInt()
      }
      .sortedWith(compareByDescending<TextNode> { it.bounds.left }.thenByDescending { it.bounds.top })

    for (candidate in candidates) {
      val tapBounds = bottomNavTapBounds(candidate.node, candidate.bounds, screen)
      if (tapBlocking(tapBounds.centerX().toFloat(), tapBounds.centerY().toFloat())) return true
      if (clickNode(candidate.node)) return true
    }
  }

  val display = displayBounds()
  return tapBlocking(
    display.left + display.width() * 0.875f,
    display.bottom - display.height() * 0.08f,
    durationMs = 120L
  )
}

internal fun KubdeeAccessibilityService.bottomNavTapBounds(node: AccessibilityNodeInfo, fallback: Rect, screen: Rect): Rect {
  var current: AccessibilityNodeInfo? = node
  var best = Rect(fallback)
  while (current != null) {
    val bounds = Rect()
    current.getBoundsInScreen(bounds)
    val isBottomNavCandidate =
      bounds.width() >= fallback.width() &&
        bounds.height() >= fallback.height() &&
        bounds.top >= screen.top + (screen.height() * 0.78f).toInt() &&
        bounds.bottom <= screen.bottom &&
        bounds.width() <= screen.width() * 0.28f &&
        bounds.height() <= screen.height() * 0.16f
    if (isBottomNavCandidate) {
      best = Rect(bounds)
    }
    current = current.parent
  }
  return best
}

internal fun KubdeeAccessibilityService.scrollUntilTapText(texts: List<String>, maxAttempts: Int): Boolean {
  repeat(maxAttempts) {
    dismissShopeeBlockingPopups()
    if (clickByAnyText(texts, exact = false, allowedPackageName = TARGET_PACKAGE_SHOPEE)) return true
    if (!scrollFirstScrollableForward(allowedPackageName = TARGET_PACKAGE_SHOPEE)) {
      swipeUpByScreen()
    }
    sleepStep(900L)
  }
  return clickByAnyText(texts, exact = false, allowedPackageName = TARGET_PACKAGE_SHOPEE)
}

internal fun KubdeeAccessibilityService.tapAndroidPermissionAllow(): Boolean =
  clickByAnyText(
    listOf("อนุญาตทั้งหมด", "อนุญาต", "Allow all", "Allow", "While using the app", "ขณะใช้แอป"),
    exact = false
  )

// ยอมให้เวลาบน label เพี้ยนจากการปัดเศษของ Shopee ได้เล็กน้อย
private const val SHOPEE_GALLERY_DURATION_TOLERANCE_SECONDS = 2L

private val SHOPEE_GALLERY_DURATION_LABEL_REGEX = Regex("""\b(\d{1,2}):([0-5]\d)\b""")

internal fun KubdeeAccessibilityService.tapFirstShopeeGalleryMedia(expectedDurationSeconds: Long? = null): Boolean {
  val candidates = mutableListOf<Pair<Rect, AccessibilityNodeInfo>>()
  val durationLabels = mutableListOf<Pair<Rect, Long>>()
  val roots = shopeeWindowRoots()
  for (root in roots) {
    val screen = screenBounds(root)
    collectShopeeGalleryMediaCandidates(root, screen, candidates)
    if (candidates.isEmpty()) {
      collectShopeeGalleryTileCandidates(root, screen, candidates)
    }
    collectShopeeGalleryDurationLabels(root, durationLabels)
  }
  logShopeePostStep("พบ media candidate ${candidates.size} รายการในคลัง (label เวลา ${durationLabels.size} จุด)")

  val ordered = candidates
    .sortedWith(compareBy<Pair<Rect, AccessibilityNodeInfo>> { it.first.top }.thenBy { it.first.left })

  // tile แรกสุดไม่จำเป็นต้องเป็นไฟล์ที่เพิ่งเตรียม (มีสื่อใหม่กว่าแทรก/ลำดับ picker ไม่ตรง DATE_ADDED ได้)
  // จึงจับคู่ความยาวคลิปกับ label เวลาที่ทับอยู่บน tile ก่อน แล้วค่อย fallback เป็น tile แรกแบบเดิม
  if (expectedDurationSeconds != null && expectedDurationSeconds > 0) {
    val matched = ordered.firstOrNull { (bounds, _) ->
      durationLabels.any { (labelBounds, labelSeconds) ->
        bounds.contains(labelBounds.centerX(), labelBounds.centerY()) &&
          Math.abs(labelSeconds - expectedDurationSeconds) <= SHOPEE_GALLERY_DURATION_TOLERANCE_SECONDS
      }
    }
    if (matched != null) {
      logShopeePostStep(
        "พบ tile ที่ความยาวตรงกับคลิปที่เตรียม (~$expectedDurationSeconds วิ) แตะที่ ${matched.first.centerX()},${matched.first.centerY()}"
      )
      return tapBlocking(matched.first.centerX().toFloat(), matched.first.centerY().toFloat())
    }
    logShopeePostStep(
      "ไม่พบ tile ที่ความยาวตรงกับคลิปที่เตรียม (~$expectedDurationSeconds วิ) จะแตะ tile แรกแทน — ถ้าคลิปที่โพสต์ไม่ตรง กด 'รายงานปัญหา' ให้ทีมตรวจ"
    )
  }

  val candidate = ordered.firstOrNull()
  if (candidate != null) {
    return tapBlocking(candidate.first.centerX().toFloat(), candidate.first.centerY().toFloat())
  }

  val screen = roots.firstOrNull()?.let(::screenBounds) ?: displayBounds()
  return tapBlocking(
    screen.left + screen.width() * 0.125f,
    screen.top + screen.height() * 0.195f,
    durationMs = 120L
  )
}

// เก็บ TextView label เวลา (mm:ss) ที่ทับอยู่บน tile วิดีโอในคลังของ Shopee
internal fun KubdeeAccessibilityService.collectShopeeGalleryDurationLabels(
  node: AccessibilityNodeInfo?,
  output: MutableList<Pair<Rect, Long>>
) {
  if (node == null) return
  if (node.isVisibleToUser) {
    val text = listOfNotNull(node.text?.toString(), node.contentDescription?.toString()).joinToString(" ")
    val match = SHOPEE_GALLERY_DURATION_LABEL_REGEX.find(text)
    if (match != null) {
      val minutes = match.groupValues[1].toLongOrNull()
      val seconds = match.groupValues[2].toLongOrNull()
      if (minutes != null && seconds != null) {
        val bounds = Rect()
        node.getBoundsInScreen(bounds)
        output.add(Rect(bounds) to (minutes * 60L + seconds))
      }
    }
  }

  for (index in 0 until node.childCount) {
    collectShopeeGalleryDurationLabels(node.getChild(index), output)
  }
}

internal fun KubdeeAccessibilityService.collectShopeeGalleryMediaCandidates(
  node: AccessibilityNodeInfo?,
  screen: Rect,
  output: MutableList<Pair<Rect, AccessibilityNodeInfo>>
) {
  if (node == null) return
  if (node.isVisibleToUser) {
    val bounds = Rect()
    node.getBoundsInScreen(bounds)
    val className = node.className?.toString().orEmpty()
    val width = bounds.width()
    val height = bounds.height()
    val text = listOfNotNull(node.text?.toString(), node.contentDescription?.toString())
      .joinToString(" ")
    val looksLikeMediaClass = className.contains("ImageView", ignoreCase = true) ||
      className.contains("TextureView", ignoreCase = true)
    val looksLikeVideoLabel = Regex("""\b\d{1,2}:\d{2}\b""").containsMatchIn(text) ||
      text.contains("video", ignoreCase = true) ||
      text.contains("วิดีโอ", ignoreCase = true)
    val ratio = if (height > 0) width.toFloat() / height.toFloat() else 0f
    val looksLikeMedia = looksLikeMediaClass || looksLikeVideoLabel || node.isCheckable

    if (
      looksLikeMedia &&
        width >= screen.width() * 0.16f &&
        height >= screen.height() * 0.08f &&
        width <= screen.width() * 0.45f &&
        height <= screen.height() * 0.35f &&
        ratio in 0.55f..1.85f &&
        bounds.top >= screen.top + (screen.height() * 0.14f).toInt() &&
        bounds.bottom <= screen.bottom - (screen.height() * 0.08f).toInt()
    ) {
      output.add(Rect(bounds) to node)
    }
  }

  for (index in 0 until node.childCount) {
    collectShopeeGalleryMediaCandidates(node.getChild(index), screen, output)
  }
}

internal fun KubdeeAccessibilityService.collectShopeeGalleryTileCandidates(
  node: AccessibilityNodeInfo?,
  screen: Rect,
  output: MutableList<Pair<Rect, AccessibilityNodeInfo>>
) {
  if (node == null) return
  if (node.packageName?.toString() == TARGET_PACKAGE_SHOPEE && node.isVisibleToUser && node.isClickable) {
    val bounds = Rect()
    node.getBoundsInScreen(bounds)
    val width = bounds.width()
    val height = bounds.height()
    val ratio = if (height > 0) width.toFloat() / height.toFloat() else 0f
    if (
      width >= screen.width() * 0.16f &&
        width <= screen.width() * 0.34f &&
        height >= screen.height() * 0.075f &&
        height <= screen.height() * 0.18f &&
        ratio in 0.72f..1.35f &&
        bounds.top >= screen.top + (screen.height() * 0.12f).toInt() &&
        bounds.bottom <= screen.bottom - (screen.height() * 0.075f).toInt()
    ) {
      output.add(Rect(bounds) to node)
    }
  }

  for (index in 0 until node.childCount) {
    collectShopeeGalleryTileCandidates(node.getChild(index), screen, output)
  }
}

internal fun KubdeeAccessibilityService.prepareShopeePostingVideoUri(source: String, index: Int): PreparedShopeeVideo {
  val sourceUri = Uri.parse(source)
  val mimeType = normalizeShopeeVideoMimeType(
    if (sourceUri.scheme == "content") contentResolver.getType(sourceUri) else null
  )
  val nowSeconds = System.currentTimeMillis() / 1000L
  val fileName = "kubdee-shopee-${System.currentTimeMillis()}-$index.${extensionForShopeeVideoMimeType(mimeType)}"
  val values = ContentValues().apply {
    put(MediaStore.MediaColumns.DISPLAY_NAME, fileName)
    put(MediaStore.MediaColumns.MIME_TYPE, mimeType)
    put(MediaStore.MediaColumns.RELATIVE_PATH, "${Environment.DIRECTORY_MOVIES}/Kubdee")
    put(MediaStore.MediaColumns.DATE_ADDED, nowSeconds)
    put(MediaStore.MediaColumns.DATE_MODIFIED, nowSeconds)
    put(MediaStore.MediaColumns.IS_PENDING, 1)
  }
  val targetUri = contentResolver.insert(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, values)
    ?: throw IllegalStateException("สร้างไฟล์วิดีโอสำหรับ Shopee ไม่สำเร็จ")

  try {
    openShopeeSourceInputStream(source, sourceUri).use { input ->
      val output = contentResolver.openOutputStream(targetUri)
        ?: throw IllegalStateException("เปิดปลายทางวิดีโอไม่สำเร็จ")
      output.use {
        input.copyTo(it)
      }
    }
    contentResolver.update(
      targetUri,
      ContentValues().apply { put(MediaStore.MediaColumns.IS_PENDING, 0) },
      null,
      null
    )
    waitForPreparedShopeeVideoIndexed(fileName, 5_000L)
    return PreparedShopeeVideo(targetUri, fileName, readShopeeVideoDurationSeconds(targetUri))
  } catch (error: Exception) {
    contentResolver.delete(targetUri, null, null)
    throw friendlyShopeePostingVideoSourceError(error)
  }
}

internal fun KubdeeAccessibilityService.readShopeeVideoDurationSeconds(uri: Uri): Long? {
  val retriever = MediaMetadataRetriever()
  return try {
    retriever.setDataSource(this, uri)
    retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)
      ?.toLongOrNull()
      ?.takeIf { it > 0L }
      ?.let { (it + 500L) / 1000L }
  } catch (_: Exception) {
    null
  } finally {
    try {
      retriever.release()
    } catch (_: Exception) {
      // best-effort
    }
  }
}

internal fun friendlyShopeePostingVideoSourceError(error: Exception): IllegalStateException {
  val raw = error.message?.trim().orEmpty()
  val reason = when {
    raw.contains("No item at content://media", ignoreCase = true) ->
      "เปิดไฟล์วิดีโอไม่ได้ ไฟล์อาจถูกลบหรือสิทธิ์หมดอายุ กรุณาลบคลิปนี้ออกแล้วเพิ่มวิดีโอใหม่"
    raw.contains("FileNotFoundException", ignoreCase = true) ->
      "เปิดไฟล์วิดีโอไม่ได้ ไฟล์อาจถูกลบหรือย้ายที่ กรุณาลบคลิปนี้ออกแล้วเพิ่มวิดีโอใหม่"
    raw.isNotBlank() -> raw
    else -> "เปิดไฟล์วิดีโอต้นทางไม่สำเร็จ กรุณาลบคลิปนี้ออกแล้วเพิ่มวิดีโอใหม่"
  }
  return IllegalStateException(reason, error)
}

internal fun KubdeeAccessibilityService.waitForPreparedShopeeVideoIndexed(displayName: String, timeoutMs: Long): Boolean {
  val start = System.currentTimeMillis()
  val projection = arrayOf(MediaStore.MediaColumns._ID)
  while (System.currentTimeMillis() - start < timeoutMs) {
    checkStopRequested()
    contentResolver.query(
      MediaStore.Video.Media.EXTERNAL_CONTENT_URI,
      projection,
      "${MediaStore.MediaColumns.DISPLAY_NAME}=?",
      arrayOf(displayName),
      "${MediaStore.MediaColumns.DATE_ADDED} DESC"
    )?.use { cursor ->
      if (cursor.moveToFirst()) {
        return true
      }
    }
    Thread.sleep(300L)
  }
  logShopeePostStep("ยังไม่ยืนยันไฟล์ใน MediaStore: $displayName")
  return false
}

internal fun KubdeeAccessibilityService.openShopeeSourceInputStream(source: String, sourceUri: Uri): InputStream {
  return when (sourceUri.scheme?.lowercase(Locale.ROOT)) {
    "content" -> contentResolver.openInputStream(sourceUri)
    "file" -> FileInputStream(File(sourceUri.path.orEmpty()))
    "http", "https" -> openRemoteShopeeVideoStream(source)
    "data" -> openDataUrlInputStream(source)
    null, "" -> FileInputStream(File(source))
    else -> contentResolver.openInputStream(sourceUri)
  } ?: throw IllegalStateException("เปิดไฟล์วิดีโอต้นทางไม่สำเร็จ")
}

internal fun KubdeeAccessibilityService.openRemoteShopeeVideoStream(sourceUrl: String): InputStream {
  val cookie = try {
    val manager = CookieManager.getInstance()
    manager.getCookie(sourceUrl)
      ?: manager.getCookie("https://labs.google")
      ?: manager.getCookie("https://labs.google/fx/tools/flow")
  } catch (_: Exception) {
    null
  }
  logShopeePostStep(if (cookie.isNullOrBlank()) "ดาวน์โหลดวิดีโอ: ไม่พบ WebView cookie" else "ดาวน์โหลดวิดีโอ: พบ WebView cookie")
  val connection = (URL(sourceUrl).openConnection() as HttpURLConnection).apply {
    instanceFollowRedirects = true
    connectTimeout = 20_000
    readTimeout = 60_000
    requestMethod = "GET"
    setRequestProperty("User-Agent", "Mozilla/5.0 (Linux; Android) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36")
    setRequestProperty("Accept", "video/*,*/*;q=0.8")
    setRequestProperty("Accept-Language", "th-TH,th;q=0.9,en;q=0.8")
    if (!cookie.isNullOrBlank()) {
      setRequestProperty("Cookie", cookie)
    }
  }
  try {
    val status = connection.responseCode
    if (status !in 200..299) {
      throw IllegalStateException("ดาวน์โหลดวิดีโอไม่สำเร็จ HTTP $status")
    }
    return object : FilterInputStream(connection.inputStream) {
      override fun close() {
        try {
          super.close()
        } finally {
          connection.disconnect()
        }
      }
    }
  } catch (error: Exception) {
    connection.disconnect()
    throw error
  }
}

internal fun KubdeeAccessibilityService.openDataUrlInputStream(dataUrl: String): InputStream {
  val payload = dataUrl.substringAfter(',', missingDelimiterValue = "")
  if (payload.isBlank()) {
    throw IllegalStateException("data URL วิดีโอไม่ถูกต้อง")
  }
  val decoded = Base64.decode(payload, Base64.DEFAULT)
  return ByteArrayInputStream(decoded)
}

internal fun KubdeeAccessibilityService.normalizeShopeeVideoMimeType(value: String?): String =
  if (!value.isNullOrBlank() && value.startsWith("video/", ignoreCase = true)) value else "video/mp4"

internal fun KubdeeAccessibilityService.extensionForShopeeVideoMimeType(mimeType: String): String =
  when (mimeType.lowercase(Locale.ROOT)) {
    "video/quicktime" -> "mov"
    "video/webm" -> "webm"
    "video/3gpp" -> "3gp"
    else -> "mp4"
  }

internal fun KubdeeAccessibilityService.formatShopeeHashtagText(value: String?): String {
  val raw = value?.trim().orEmpty()
  if (raw.isBlank()) return ""
  val seen = mutableSetOf<String>()
  return raw
    .split(Regex("""[\s,，、]+"""))
    .map { it.trim().trimStart('#', '＃').trim() }
    .filter { it.isNotBlank() }
    .filter { seen.add(it.lowercase(Locale.ROOT)) }
    .joinToString(" ") { "#${it.take(40)}" }
}

internal fun KubdeeAccessibilityService.dispatchLineGesture(
  startX: Float,
  startY: Float,
  endX: Float,
  endY: Float,
  durationMs: Long,
  onResult: (Boolean) -> Unit
) {
  if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N) {
    onResult(false)
    return
  }

  val path = Path().apply {
    moveTo(startX, startY)
    if (startX != endX || startY != endY) {
      lineTo(endX, endY)
    }
  }
  val stroke = GestureDescription.StrokeDescription(path, 0, durationMs.coerceAtLeast(1))
  val gesture = GestureDescription.Builder().addStroke(stroke).build()

  dispatchGesture(
    gesture,
    object : AccessibilityService.GestureResultCallback() {
      override fun onCompleted(gestureDescription: GestureDescription?) {
        onResult(true)
      }

      override fun onCancelled(gestureDescription: GestureDescription?) {
        onResult(false)
      }
    },
    null
  )
}
