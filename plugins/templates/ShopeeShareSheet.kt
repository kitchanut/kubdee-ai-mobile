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
internal fun KubdeeAccessibilityService.copyShopeeProductUrlFromDetail(): String? =
    copyShopeeProductUrlFromShareSheet(openIfNeeded = true)

internal fun KubdeeAccessibilityService.copyShopeeProductUrlFromCurrentShareSheet(): String? =
    copyShopeeProductUrlFromShareSheet(openIfNeeded = false)

internal fun KubdeeAccessibilityService.copyShopeeProductUrlFromShareSheet(openIfNeeded: Boolean): String? {
    val clipboard = getSystemService(android.content.Context.CLIPBOARD_SERVICE) as? ClipboardManager ?: run {
      logStep("อ่าน clipboard ไม่ได้ ข้ามลิงก์สินค้า")
      return null
  }
  val marker = "kubdee-empty-${System.currentTimeMillis()}"
  val previous = readClipboardText(clipboard)
  var markerSet = false
  try {
    clipboard.setPrimaryClip(ClipData.newPlainText("kubdee-marker", marker))
    markerSet = true
  } catch (error: Exception) {
    Log.w(TAG, "Unable to seed clipboard before Shopee share", error)
    // Clipboard write may be blocked by OEM policy; reading after copy still works on many devices.
  }

    try {
      if (openIfNeeded) {
        logStep("กำลังเปิดแผงแชร์สินค้า")
        if (!openShopeeShareSheet()) {
          logStep("เปิดแผ่นแชร์สินค้าไม่สำเร็จ ข้ามลิงก์")
          return null
        }
      } else if (!isShopeeShareSheetVisible()) {
        logStep("ยังไม่เห็นแผงแชร์สินค้า ข้ามลิงก์")
        return null
      }

      logStep("ตรวจ clipboard หลังเปิดแชร์ก่อนกดคัดลอก")
    val sharedUrl = waitForShopeeClipboardUrl(
      clipboard = clipboard,
      marker = marker,
      markerSet = markerSet,
      previous = previous,
      timeoutMs = 1_500L
    )
    if (sharedUrl != null) {
      logStep("ได้ลิงก์จากการเปิดแชร์ ไม่ต้องกดคัดลอก")
      return resolveShopeeUrl(sharedUrl).ifBlank { sharedUrl }
    }
    logStep("ยังไม่เจอลิงก์จากแผงแชร์ จะกดคัดลอกลิงก์")

    repeat(2) { attempt ->
      checkStopRequested()

        if (!isShopeeShareSheetVisible()) {
          if (!openIfNeeded) {
            logStep("แผงแชร์ปิดอยู่ ข้ามลิงก์")
            return null
          }
          logStep("แผงแชร์ปิดอยู่ กำลังเปิดใหม่ก่อนคัดลอกลิงก์")
          if (!openShopeeShareSheet()) return null
        }

      logStep("กำลังกดคัดลอกลิงก์สินค้า (${attempt + 1}/2)")
      if (!tapShopeeCopyLink()) {
        if (attempt == 0) {
          logStep("ยังไม่พบปุ่มคัดลอกลิงก์ ลองค้นหาอีกครั้ง")
          sleepStep(700L)
          return@repeat
        }
        logStep("กดคัดลอกลิงก์ไม่สำเร็จ ข้ามลิงก์")
        return null
      }

      logStep("กดคัดลอกลิงก์แล้ว รอ clipboard อัปเดต")
      val url = waitForShopeeClipboardUrl(
        clipboard = clipboard,
        marker = marker,
        markerSet = markerSet,
        previous = previous,
        timeoutMs = 7_000L
      )
      if (url != null) {
        return resolveShopeeUrl(url).ifBlank { url }
      }

      if (attempt == 0) {
        logStep("ยังอ่านลิงก์จาก clipboard ไม่ได้ ลองคัดลอกอีกครั้ง")
        sleepStep(700L)
      }
    }
  } catch (error: ShopeeAutomationStoppedException) {
    throw error
  } catch (error: Exception) {
    Log.w(TAG, "Unable to copy Shopee product URL", error)
    logStep("คัดลอกลิงก์สินค้าไม่สำเร็จ ข้ามลิงก์")
  }
  logStep("คัดลอกลิงก์แล้ว แต่อ่านลิงก์จาก clipboard ไม่ได้")
  return null
}

internal fun KubdeeAccessibilityService.readClipboardText(clipboard: ClipboardManager): String {
  return try {
    val clip = clipboard.primaryClip ?: return ""
    if (clip.itemCount <= 0) return ""
    clip.getItemAt(0)?.coerceToText(this)?.toString().orEmpty()
  } catch (error: Exception) {
    Log.w(TAG, "Unable to read clipboard", error)
    ""
  }
}

internal fun KubdeeAccessibilityService.waitForShopeeClipboardUrl(
  clipboard: ClipboardManager,
  marker: String,
  markerSet: Boolean,
  previous: String,
  timeoutMs: Long
): String? {
  val start = System.currentTimeMillis()
  var nextLogAt = start + 2_000L
  var bridgeIndex = 0
  val bridgeReadDelays = listOf(700L, 2_200L, 4_200L)

  while (System.currentTimeMillis() - start < timeoutMs) {
    checkStopRequested()

    val direct = readClipboardText(clipboard)
    val directUrl = extractShopeeUrlFromClipboard(direct, marker, markerSet, previous)
    if (directUrl != null) return directUrl

    val elapsed = System.currentTimeMillis() - start
    if (bridgeIndex < bridgeReadDelays.size && elapsed >= bridgeReadDelays[bridgeIndex]) {
      val bridged = readClipboardTextWithForegroundBridge("shopee-copy-${start}-$bridgeIndex")
      val bridgedUrl = extractShopeeUrlFromClipboard(bridged, marker, markerSet, previous)
      if (bridgedUrl != null) return bridgedUrl
      bridgeIndex += 1
    }

    val now = System.currentTimeMillis()
    if (timeoutMs >= 2_000L && now >= nextLogAt) {
      logStep("กำลังรอ clipboard อัปเดต ${((now - start) / 1000.0).formatOneDecimal()}/${(timeoutMs / 1000.0).formatOneDecimal()} วิ")
      nextLogAt = now + 2_000L
    }
    sleepStep(250L)
  }

  if (!markerSet && previous.isNotBlank() && readClipboardText(clipboard) == previous) {
    logStep("คัดลอกลิงก์แล้ว แต่ clipboard ยังไม่เปลี่ยน")
  }
  return null
}

internal fun KubdeeAccessibilityService.readClipboardTextWithForegroundBridge(requestId: String): String {
  val resultFile = File(filesDir, KubdeeClipboardBridgeActivity.RESULT_FILE_NAME)
  try {
    val intent = Intent(this, KubdeeClipboardBridgeActivity::class.java).apply {
      addFlags(
        Intent.FLAG_ACTIVITY_NEW_TASK or
          Intent.FLAG_ACTIVITY_MULTIPLE_TASK or
          Intent.FLAG_ACTIVITY_NO_ANIMATION or
          Intent.FLAG_ACTIVITY_EXCLUDE_FROM_RECENTS or
          Intent.FLAG_ACTIVITY_NO_HISTORY
      )
      putExtra(KubdeeClipboardBridgeActivity.EXTRA_REQUEST_ID, requestId)
    }
    startActivity(intent)
  } catch (error: Exception) {
    Log.w(TAG, "Unable to start clipboard bridge activity", error)
    return ""
  }

  val deadline = System.currentTimeMillis() + 1_700L
  while (System.currentTimeMillis() < deadline) {
    checkStopRequested()
    val result = readClipboardBridgeResult(resultFile, requestId)
    if (result != null) return result
    sleepStep(120L)
  }
  return ""
}

internal fun KubdeeAccessibilityService.readClipboardBridgeResult(resultFile: File, requestId: String): String? {
  return try {
    if (!resultFile.exists()) return null
    val payload = JSONObject(resultFile.readText())
    if (payload.optString("requestId") != requestId) return null
    payload.optString("text", "")
  } catch (error: Exception) {
    Log.w(TAG, "Unable to read clipboard bridge result", error)
    null
  }
}

internal fun KubdeeAccessibilityService.extractShopeeUrlFromClipboard(
  text: String,
  marker: String,
  markerSet: Boolean,
  previous: String
): String? {
  val prepared = text.replace("\\/", "/").trim()
  if (prepared.isBlank() || prepared == marker) return null
  if (!markerSet && previous.isNotBlank() && prepared == previous) return null

  URL_REGEX.findAll(prepared).forEach { match ->
    val url = match.value.trimEnd(')', '.', ',', ';', ']', '}', '>', '"', '\'')
    if (url.contains("shopee.", ignoreCase = true)) {
      return Uri.decode(url)
    }
  }
  return null
}

internal fun KubdeeAccessibilityService.openShopeeShareSheet(): Boolean {
  try {
    if (isShopeeShareSheetVisible()) return true

    repeat(2) {
      checkStopRequested()
      if (clickShopeeShareToEarnButton() || clickTopShopeeShareButton()) {
        val start = System.currentTimeMillis()
        while (System.currentTimeMillis() - start < 6_000L) {
          checkStopRequested()
          if (isShopeeShareSheetVisible()) return true
          sleepStep(300L)
        }
      }
    }
  } catch (error: ShopeeAutomationStoppedException) {
    throw error
  } catch (error: Exception) {
    Log.w(TAG, "Unable to open Shopee share sheet", error)
  }
  return false
}

internal fun KubdeeAccessibilityService.isShopeeShareSheetVisible(): Boolean {
    return try {
      val root = rootInActiveWindow ?: return false
      val textNodes = mutableListOf<TextNode>()
      collectTextNodes(root, textNodes)
    val texts = textNodes.map { it.text.lowercase(Locale.ROOT) }
    val joined = texts.joinToString(" ")
    if (joined.contains("แชร์เพื่อรับค่าคอมมิชชั่น") || joined.contains("แชร์เพื่อรับ")) return true
    if (joined.contains("คัดลอกลิงก์") || joined.contains("คัดลอกลิงค์") || joined.contains("copy link")) return true

    val shareTargetHits = listOf("line", "messenger", "whatsapp", "facebook", "telegram", "instagram", "twitter", "messages")
      .count { keyword -> texts.any { text -> text.contains(keyword) } }
    shareTargetHits >= 2
  } catch (error: Exception) {
    Log.w(TAG, "Unable to inspect Shopee share sheet", error)
      false
    }
  }

internal fun KubdeeAccessibilityService.waitForShopeeShareSheetVisible(timeoutMs: Long): Boolean {
    val start = System.currentTimeMillis()
    while (System.currentTimeMillis() - start < timeoutMs) {
      checkStopRequested()
      if (isShopeeShareSheetVisible()) return true
      sleepStep(300L)
    }
    return false
  }

internal fun KubdeeAccessibilityService.closeShopeeShareSheet(): Boolean {
    if (!isShopeeShareSheetVisible()) return true
    if (tapShopeeShareDrawerClose()) {
      sleepStep(650L)
      return true
    }
    logStep("ปิดแผ่นแชร์ด้วยปุ่ม back")
    val closed = performBack()
    sleepStep(850L)
    return closed || !isShopeeShareSheetVisible()
  }

internal fun KubdeeAccessibilityService.tapShopeeShareDrawerClose(): Boolean {
    val root = rootInActiveWindow ?: return false
    val screen = screenBounds(root)
    val candidates = mutableListOf<Rect>()

    fun visit(node: AccessibilityNodeInfo?, depth: Int = 0) {
      if (node == null || depth > 56) return
      if (node.isVisibleToUser && node.packageName?.toString() == TARGET_PACKAGE_SHOPEE) {
        val bounds = Rect()
        node.getBoundsInScreen(bounds)
        val resourceId = node.viewIdResourceName.orEmpty().lowercase(Locale.ROOT)
        if (
          resourceId.contains("sharedrawer_close") &&
          bounds.width() > 0 &&
          bounds.height() > 0 &&
          bounds.centerX() > screen.centerX() &&
          bounds.top > screen.top + (screen.height() * 0.40f).toInt()
        ) {
          candidates += findSmallClickableAncestorBounds(node, bounds, screen)
        }
      }
      for (index in 0 until node.childCount) {
        visit(node.getChild(index), depth + 1)
      }
    }

    visit(root)
    val bounds = candidates.sortedWith(compareBy<Rect> { it.top }.thenByDescending { it.left }).firstOrNull()
      ?: return false
    logStep("ปิดแผ่นแชร์สินค้า")
    return tapBlocking(bounds.centerX().toFloat(), bounds.centerY().toFloat(), timeoutMs = 1800L, durationMs = 90L)
  }

internal fun KubdeeAccessibilityService.findShopeeShareDrawerImageUrl(): String? {
    val root = rootInActiveWindow ?: return null
    val screen = screenBounds(root)
    val imageNodes = mutableListOf<ShopeeImageNode>()
    collectShopeeImageNodes(root, imageNodes, allowedPackageName = TARGET_PACKAGE_SHOPEE)
    return imageNodes
      .filter { image ->
        image.bounds.top >= screen.top + (screen.height() * 0.08f).toInt() &&
          image.bounds.bottom <= screen.top + (screen.height() * 0.55f).toInt() &&
          image.bounds.width() >= screen.width() * 0.20f &&
          image.bounds.height() >= screen.width() * 0.20f
      }
      .minByOrNull { image -> image.bounds.top + kotlin.math.abs(image.bounds.centerX() - screen.centerX()) }
      ?.imageUrl
  }

internal fun KubdeeAccessibilityService.downloadFirstShopeeShareImage(startedAtMs: Long): String? {
    if (!isShopeeShareSheetVisible()) {
      logStep("รูปสินค้า: ยังไม่เห็นแผงแชร์ จึงดาวน์โหลดรูปไม่ได้")
      return null
    }
    val tappedDownload = try {
      setAutomationFloatingUiSuppressedBlocking(true)
      sleepStep(160L)
      tapShopeeShareFirstImageDownloadButton()
    } finally {
      setAutomationFloatingUiSuppressedBlocking(false)
    }
    if (!tappedDownload) {
      logStep("รูปสินค้า: หา resource id ปุ่มดาวน์โหลดไม่เจอ -> ใช้ URL จากแผงแชร์/การ์ดแทน")
      return null
    }

    logStep("รูปสินค้า: กดดาวน์โหลดรูปแรกแล้ว รอไฟล์รูป")
    val imageUri = waitForLatestShopeeDownloadedImage(startedAtMs, timeoutMs = 10_000L)
    if (imageUri != null) {
      logStep("รูปสินค้า: โหลดรูปแรกสำเร็จ")
    } else {
      logStep("รูปสินค้า: ดาวน์โหลดแล้วแต่ยังไม่พบไฟล์ใน MediaStore -> ใช้ URL จากแผงแชร์/การ์ดแทน")
    }
    return imageUri
  }

internal fun KubdeeAccessibilityService.tapShopeeShareFirstImageDownloadButton(): Boolean {
    val root = rootInActiveWindow ?: return false
    val screen = screenBounds(root)
    val candidates = mutableListOf<Rect>()

    fun visit(node: AccessibilityNodeInfo?, depth: Int = 0) {
      if (node == null || depth > 56) return
      if (node.isVisibleToUser && node.packageName?.toString() == TARGET_PACKAGE_SHOPEE) {
        val bounds = Rect()
        node.getBoundsInScreen(bounds)
        val resourceId = node.viewIdResourceName.orEmpty().lowercase(Locale.ROOT)
        val isFirstImageDownload = resourceId.contains("sharedrawer_downloadpng_img_1") ||
          (
            resourceId.contains("sharedrawer_download") &&
              bounds.top <= screen.top + (screen.height() * 0.24f).toInt() &&
              bounds.centerX() >= screen.centerX()
          )
        if (
          isFirstImageDownload &&
          bounds.width() > 0 &&
          bounds.height() > 0 &&
          bounds.top >= screen.top + (screen.height() * 0.08f).toInt() &&
          bounds.bottom <= screen.top + (screen.height() * 0.40f).toInt()
        ) {
          candidates += findSmallClickableAncestorBounds(node, bounds, screen)
        }
      }
      for (index in 0 until node.childCount) {
        visit(node.getChild(index), depth + 1)
      }
    }

    visit(root)
    val bounds = candidates.sortedWith(compareBy<Rect> { it.top }.thenByDescending { it.left }).firstOrNull()
    if (bounds != null) {
      logStep("กดดาวน์โหลดรูปแรกที่ ${bounds.centerX()},${bounds.centerY()}")
      return tapBlocking(bounds.centerX().toFloat(), bounds.centerY().toFloat(), timeoutMs = 2200L, durationMs = 90L)
    }

    // Fallback for Shopee builds whose share sheet shows a single "ดาวน์โหลดรูปภาพทั้งหมด" button
    // (download-all) instead of a per-image download icon with a resource id — match it by text.
    val downloadByText = findShopeeShareDownloadImagesButtonByText(root, screen)
    if (downloadByText != null) {
      logStep("กดปุ่มดาวน์โหลดรูปภาพ (ปุ่มข้อความ) ที่ ${downloadByText.centerX()},${downloadByText.centerY()}")
      return tapBlocking(downloadByText.centerX().toFloat(), downloadByText.centerY().toFloat(), timeoutMs = 2200L, durationMs = 90L)
    }
    return false
  }

// Some Shopee versions render the share-sheet image download as a single text button
// ("ดาวน์โหลดรูปภาพทั้งหมด") with no per-image resource id. Locate it by text as a fallback.
internal fun KubdeeAccessibilityService.findShopeeShareDownloadImagesButtonByText(root: AccessibilityNodeInfo, screen: Rect): Rect? {
    val textNodes = mutableListOf<TextNode>()
    collectTextNodes(root, textNodes, allowedPackageName = TARGET_PACKAGE_SHOPEE)
    val match = textNodes.firstOrNull { node ->
      node.node.isVisibleToUser &&
        node.text.contains("ดาวน์โหลด", ignoreCase = true) &&
        (
          node.text.contains("รูป", ignoreCase = true) ||
            node.text.contains("ภาพ", ignoreCase = true) ||
            node.text.contains("image", ignoreCase = true)
        )
    } ?: return null
    return findSmallClickableAncestorBounds(match.node, match.bounds, screen)
  }

internal fun KubdeeAccessibilityService.waitForLatestShopeeDownloadedImage(startedAtMs: Long, timeoutMs: Long): String? {
    val start = System.currentTimeMillis()
    var lastLog = 0L
    while (System.currentTimeMillis() - start < timeoutMs) {
      checkStopRequested()
      val imageUri = findLatestShopeeDownloadedImage(startedAtMs)
      if (imageUri != null) return imageUri

      val now = System.currentTimeMillis()
      if (now - lastLog > 2_000L) {
        logStep("กำลังรอไฟล์รูปจาก Shopee ${((now - start) / 1000.0).formatOneDecimal()} วิ")
        lastLog = now
      }
      sleepStep(350L)
    }
    return null
  }

internal fun KubdeeAccessibilityService.findLatestShopeeDownloadedImage(sinceMs: Long): String? {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return null
    val projection = arrayOf(
      MediaStore.MediaColumns._ID,
      MediaStore.MediaColumns.DISPLAY_NAME,
      MediaStore.MediaColumns.MIME_TYPE,
      MediaStore.MediaColumns.SIZE,
      MediaStore.MediaColumns.DATE_ADDED
    )
    val sinceSeconds = ((sinceMs / 1000L) - 1L).coerceAtLeast(0L)
    val selection =
      "${MediaStore.MediaColumns.DATE_ADDED} >= ? AND (" +
        "${MediaStore.MediaColumns.MIME_TYPE} LIKE ? OR " +
        "${MediaStore.MediaColumns.DISPLAY_NAME} LIKE ? OR " +
        "${MediaStore.MediaColumns.DISPLAY_NAME} LIKE ? OR " +
        "${MediaStore.MediaColumns.DISPLAY_NAME} LIKE ? OR " +
        "${MediaStore.MediaColumns.DISPLAY_NAME} LIKE ?)"
    val selectionArgs = arrayOf(
      sinceSeconds.toString(),
      "image/%",
      "%.png",
      "%.jpg",
      "%.jpeg",
      "%.webp"
    )
    val sortOrder = "${MediaStore.MediaColumns.DATE_ADDED} DESC"

    return try {
      val collections = listOf(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, MediaStore.Downloads.EXTERNAL_CONTENT_URI)
      var bestUri: String? = null
      var bestDateAdded = 0L
      for (collection in collections) {
        contentResolver.query(collection, projection, selection, selectionArgs, sortOrder)?.use { cursor ->
          while (cursor.moveToNext()) {
            val sizeBytes = cursor.getLong(cursor.getColumnIndexOrThrow(MediaStore.MediaColumns.SIZE))
            if (sizeBytes <= 0L) continue
            val dateAdded = cursor.getLong(cursor.getColumnIndexOrThrow(MediaStore.MediaColumns.DATE_ADDED))
            if (dateAdded >= bestDateAdded) {
              val id = cursor.getLong(cursor.getColumnIndexOrThrow(MediaStore.MediaColumns._ID))
              bestUri = ContentUris.withAppendedId(collection, id).toString()
              bestDateAdded = dateAdded
            }
            break
          }
        }
      }
      bestUri
    } catch (error: Exception) {
      Log.w(TAG, "Unable to find latest Shopee downloaded image", error)
      null
    }
	    }

internal fun KubdeeAccessibilityService.clickShopeeShareToEarnButton(): Boolean {
    val root = rootInActiveWindow ?: return false
    val screen = try {
      screenBounds(root)
    } catch (error: Exception) {
      Log.w(TAG, "Unable to read Shopee screen bounds for share-to-earn button", error)
      return false
    }
    val textNodes = mutableListOf<TextNode>()
    collectTextNodes(root, textNodes, allowedPackageName = TARGET_PACKAGE_SHOPEE)
    val bottomStart = screen.top + (screen.height() * 0.72f).toInt()
    val candidate = textNodes
      .filter { node ->
        node.node.isVisibleToUser &&
          node.bounds.top >= bottomStart &&
          (
            node.text.contains("แชร์เพื่อสร้างรายได้", ignoreCase = true) ||
              node.text.contains("share to earn", ignoreCase = true)
          )
      }
      .maxByOrNull { it.bounds.bottom }
      ?: return false

    val tapBounds = Rect(
      (candidate.bounds.left - 18).coerceAtLeast(screen.left),
      (candidate.bounds.top - 18).coerceAtLeast(screen.top),
      (candidate.bounds.right + 18).coerceAtMost(screen.right),
      (candidate.bounds.bottom + 18).coerceAtMost(screen.bottom)
    )
    logStep("กดปุ่มแชร์เพื่อสร้างรายได้ที่พิกัด ${tapBounds.centerX()},${tapBounds.centerY()}")
    return tapBlockingWithoutStopButton(tapBounds.centerX().toFloat(), tapBounds.centerY().toFloat())
  }

	  internal fun KubdeeAccessibilityService.clickTopShopeeShareButton(): Boolean {
	      val root = rootInActiveWindow ?: return false
	    val screen = try {
    screenBounds(root)
  } catch (error: Exception) {
    Log.w(TAG, "Unable to read Shopee screen bounds for share button", error)
    return false
  }
  val iconCandidates = mutableListOf<Rect>()
  val namedCandidates = mutableListOf<Rect>()

  try {
    collectShopeeShareActionCandidates(root, screen, iconCandidates, namedCandidates)
  } catch (error: Exception) {
    Log.w(TAG, "Unable to collect Shopee share candidates", error)
  }

  val icon = iconCandidates.sortedWith(compareBy<Rect> { it.left }.thenBy { it.top }).firstOrNull()
  if (icon != null) {
    logStep("กดปุ่มแชร์จาก top action bar ที่พิกัด ${icon.centerX()},${icon.centerY()}")
    return tapBlockingWithoutStopButton(icon.centerX().toFloat(), icon.centerY().toFloat())
  }

  val named = namedCandidates.sortedWith(compareBy<Rect> { it.top }.thenBy { it.left }).firstOrNull()
  if (named != null) {
    logStep("กดปุ่มแชร์จาก label ที่พิกัด ${named.centerX()},${named.centerY()}")
    return tapBlockingWithoutStopButton(named.centerX().toFloat(), named.centerY().toFloat())
  }

  Log.w(TAG, "No Shopee share button candidate found")
  return false
}

internal fun KubdeeAccessibilityService.tapBlockingWithoutStopButton(
  x: Float,
  y: Float,
  timeoutMs: Long = 2500L,
  durationMs: Long = 80L,
  tapEventKey: String? = null
): Boolean {
  setAutomationStopButtonVisibleBlocking(false)
  sleepStep(120L)
  return try {
    tapBlocking(x, y, timeoutMs = timeoutMs, durationMs = durationMs, tapEventKey = tapEventKey)
  } finally {
    sleepStep(260L)
    setAutomationStopButtonVisibleBlocking(true)
  }
}

internal fun KubdeeAccessibilityService.collectShopeeShareActionCandidates(
  node: AccessibilityNodeInfo?,
  screen: Rect,
  iconCandidates: MutableList<Rect>,
  namedCandidates: MutableList<Rect>,
  depth: Int = 0
) {
  if (node == null || depth > 48) return
  val childCount = try {
    node.childCount
  } catch (_: Exception) {
    0
  }

  try {
    val bounds = Rect()
    node.getBoundsInScreen(bounds)
    val resourceId = node.viewIdResourceName.orEmpty()
    val raw = "${readNodeText(node)} $resourceId".lowercase(Locale.ROOT)
    val isShopeeNode = node.packageName?.toString() == TARGET_PACKAGE_SHOPEE
    val visible = node.isVisibleToUser
    val isTopActionIcon = visible &&
      bounds.top >= screen.top + screen.height() * 0.035f &&
      bounds.bottom <= screen.top + screen.height() * 0.14f &&
      bounds.left >= screen.left + screen.width() * 0.45f &&
      bounds.width() in 36..maxOf(120, (screen.width() * 0.18f).toInt()) &&
      bounds.height() in 36..maxOf(120, (screen.height() * 0.10f).toInt())

    if (
      isShopeeNode &&
      isTopActionIcon &&
      resourceId.endsWith("buttonActionBarIconItem", ignoreCase = true)
    ) {
      iconCandidates.add(Rect(bounds))
    } else if (
      isShopeeNode &&
      visible &&
      (raw.contains("share") || raw.contains("แชร์")) &&
      bounds.bottom <= screen.top + screen.height() * 0.28f &&
      bounds.right >= screen.left + screen.width() * 0.45f
    ) {
      namedCandidates.add(Rect(bounds))
    }
  } catch (_: Exception) {
    // Shopee may replace the current window while we traverse the tree.
  }

  for (index in 0 until childCount) {
    val child = try {
      node.getChild(index)
    } catch (_: Exception) {
      null
    }
    collectShopeeShareActionCandidates(child, screen, iconCandidates, namedCandidates, depth + 1)
  }
}

internal fun KubdeeAccessibilityService.findShopeeCopyLinkTapPoint(): ShopeeCopyLinkTapPoint? {
  return try {
    val root = rootInActiveWindow ?: return null
    val screen = screenBounds(root)
    val candidates = mutableListOf<ShopeeCopyLinkTapPoint>()

    fun visit(node: AccessibilityNodeInfo?, depth: Int = 0) {
      if (node == null || depth > 56) return
      val childCount = try {
        node.childCount
      } catch (_: Exception) {
        0
      }

      try {
        val bounds = Rect()
        node.getBoundsInScreen(bounds)
        val cleanText = cleanNodeText(readNodeText(node))
        val resourceId = node.viewIdResourceName.orEmpty()
        val raw = "$cleanText $resourceId".lowercase(Locale.ROOT).trim()
        val compact = raw.replace(Regex("""\s+"""), "")
        val isCopyLink =
          raw.contains("copy link") ||
            compact.contains("copylink") ||
            raw.contains("คัดลอกลิงก์") ||
            raw.contains("คัดลอกลิงค์") ||
            (raw.contains("คัดลอก") && (raw.contains("ลิงก์") || raw.contains("ลิงค์"))) ||
            (raw.contains("copy") && (raw.contains("link") || raw.contains("clipboard")))

        if (
          isCopyLink &&
          node.isVisibleToUser &&
          bounds.width() > 0 &&
          bounds.height() > 0 &&
          bounds.top >= screen.top + screen.height() * 0.35f &&
          Rect.intersects(displayBounds(), bounds)
        ) {
          val priority = if (
            raw.contains("คัดลอกลิงก์") ||
            raw.contains("คัดลอกลิงค์") ||
            raw.contains("copy link")
          ) 0 else 1
          val source = cleanText.ifBlank { resourceId.ifBlank { "copy-link-node" } }.take(36)
          candidates += ShopeeCopyLinkTapPoint(Rect(bounds), priority, source)
        }
      } catch (_: Exception) {
        // Ignore stale nodes while Android is animating the share sheet.
      }

      for (index in 0 until childCount) {
        val child = try {
          node.getChild(index)
        } catch (_: Exception) {
          null
        }
        visit(child, depth + 1)
      }
    }

    visit(root)
    candidates.sortedWith(
      compareBy<ShopeeCopyLinkTapPoint> { it.priority }
        .thenBy { it.bounds.top }
        .thenBy { it.bounds.left }
    ).firstOrNull()
  } catch (error: Exception) {
    Log.w(TAG, "Unable to find Shopee copy-link tap point", error)
    null
  }
}

internal fun KubdeeAccessibilityService.tapShopeeCopyLink(): Boolean {
  try {
    if (!isShopeeShareSheetVisible()) return false

    val tapPoint = findShopeeCopyLinkTapPoint()
    if (tapPoint != null) {
      val bounds = tapPoint.bounds
      logStep("กดคัดลอกลิงก์จากแผงแชร์ที่พิกัด ${bounds.centerX()},${bounds.centerY()} (${tapPoint.source})")
      return tapBlocking(bounds.centerX().toFloat(), bounds.centerY().toFloat())
    }

    if (
      clickByAnyText(
        listOf("คัดลอกลิงก์", "คัดลอกลิงค์", "Copy Link", "Copy link"),
        exact = false,
        allowedPackageName = TARGET_PACKAGE_SHOPEE
      )
    ) {
      logStep("กดคัดลอกลิงก์ด้วย text fallback")
      return true
    }

    if (clickByResourceHint(listOf("copy", "clipboard", "link"), allowedPackageName = TARGET_PACKAGE_SHOPEE)) {
      logStep("กดคัดลอกลิงก์ด้วย resource fallback")
      return true
    }
  } catch (error: ShopeeAutomationStoppedException) {
    throw error
  } catch (error: Exception) {
    Log.w(TAG, "Unable to tap Shopee copy-link action", error)
  }

  return false
}

internal fun KubdeeAccessibilityService.returnToShopeeLikedList(): Boolean {
  repeat(6) { attempt ->
    checkStopRequested()
    if (isShopeeShareSheetVisible()) {
      logStep("ปิดแผ่นแชร์สินค้า")
      if (!performBack()) {
        tapShopeeTopBackFallback()
      }
      sleepStep(1200L)
      return@repeat
    }
    if (isShopeeImportListVisible()) {
      if (attempt > 0) logStep("กลับหน้ารายการถูกใจแล้ว")
      return true
    }
    val actionLabel = if (isShopeeProductDetailVisible()) "กดกลับจากหน้า detail" else "กด back กลับหน้ารายการถูกใจ"
    logStep("$actionLabel (${attempt + 1}/6)")
    val backed = performBack()
    sleepStep(700L)
    if (!isShopeeImportListVisible() && (isShopeeProductDetailVisible() || !backed)) {
      tapShopeeTopBackFallback()
    }
    sleepStep(900L)
  }
  val returned = isShopeeImportListVisible()
  if (!returned) {
    logStep("ยังกลับหน้ารายการถูกใจไม่ได้")
    logStep("ลองกลับผ่านเมนู ฉัน > สิ่งที่ฉันถูกใจ")
    if (goToShopeeMeTab() && openShopeeLikedList()) {
      logStep("กลับหน้ารายการถูกใจผ่านเมนู ฉัน สำเร็จ")
      return true
    }
  }
  return returned
}

internal fun KubdeeAccessibilityService.isShopeeImportListVisible(): Boolean =
  isShopeeLikedListVisible() || isShopeePartnerLikedViewVisible() || isShopeeAffiliateOfferPageVisible()
