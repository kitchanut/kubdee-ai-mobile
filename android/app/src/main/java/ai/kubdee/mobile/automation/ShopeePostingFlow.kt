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

internal fun KubdeeAccessibilityService.postShopeeVideos(payloadJson: String): JSONObject {
  val results = JSONArray()
  var postedCount = 0
  var successCount = 0
  var firstFailureMessage: String? = null
  var videos: List<ShopeePostingVideo> = emptyList()

  return try {
    clearStopShopeeAutomation()
    resetAutomationLog()
    beginAutomationForeground("กำลังโพสต์วิดีโอ Shopee")

    val payload = JSONObject(payloadJson)
    videos = parseShopeePostingVideos(payload.optJSONArray("videos") ?: JSONArray())
    configureAutomationStats("Shopee Post", "CLIP", videos.size)

    if (videos.isEmpty()) {
      return JSONObject().apply {
        put("success", false)
        put("error", "ไม่มีวิดีโอสำหรับโพสต์ Shopee")
        put("postedCount", 0)
        put("results", results)
      }
    }

    logShopeePostStep("เริ่มโพสต์ Shopee ${videos.size} คลิป")

    for ((index, video) in videos.withIndex()) {
      checkStopRequested()
      updateAutomationStats(currentCount = index + 1, totalCount = videos.size)
      try {
        logShopeePostStep("── คลิป ${index + 1}/${videos.size} ──")
        val preparedVideo = prepareShopeePostingVideoUri(video.fileUri, index)
        logShopeePostStep("เตรียมวิดีโอเข้าคลังมือถือแล้ว: ${preparedVideo.displayName}")

        runShopeeVideoPostingFlow(video, preparedVideo)

        postedCount += 1
        successCount += 1
        updateAutomationStats(successCount = successCount)
        results.put(JSONObject().apply {
          put("videoIndex", index)
          put("success", true)
        })
        logShopeePostStep("ส่งโพสต์คลิป ${index + 1} แล้ว")
        sleepStep(6000L)
      } catch (error: ShopeeAutomationStoppedException) {
        throw error
      } catch (error: Exception) {
        val message = error.message ?: "โพสต์ Shopee ไม่สำเร็จ"
        if (firstFailureMessage == null) {
          firstFailureMessage = "คลิป ${index + 1}: $message"
        }
        incrementAutomationFailedCount()
        results.put(JSONObject().apply {
          put("videoIndex", index)
          put("success", false)
          put("error", message)
        })
        logShopeePostStep("คลิป ${index + 1} ล้มเหลว: $message")
      }
    }

    logShopeePostStep("โพสต์ Shopee เสร็จ $postedCount/${videos.size} คลิป")
    JSONObject().apply {
      put("success", successCount > 0)
      put("postedCount", postedCount)
      put("successCount", successCount)
      if (successCount == 0) {
        put("error", firstFailureMessage ?: "Shopee posting ไม่สำเร็จทุกคลิป")
      }
      put("results", results)
    }
  } catch (error: ShopeeAutomationStoppedException) {
    logShopeePostStep("หยุดโพสต์ Shopee แล้ว ($postedCount/${videos.size})")
    JSONObject().apply {
      put("success", successCount > 0)
      put("postedCount", postedCount)
      put("successCount", successCount)
      put("results", results)
      put("stopped", true)
    }
  } catch (error: Exception) {
    val message = error.message ?: "Shopee posting ผิดพลาด"
    logShopeePostStep("Shopee posting ผิดพลาด: $message")
    JSONObject().apply {
      put("success", false)
      put("error", message)
      put("postedCount", postedCount)
      put("successCount", successCount)
      put("results", results)
    }
  } finally {
    endAutomationForeground()
    hideAutomationOverlay(2500L)
  }
}

internal fun KubdeeAccessibilityService.parseShopeePostingVideos(array: JSONArray): List<ShopeePostingVideo> {
  val output = mutableListOf<ShopeePostingVideo>()
  for (index in 0 until array.length()) {
    val item = array.optJSONObject(index) ?: continue
    val fileUri = item.optCleanString("fileUri")
      ?: item.optCleanString("filePath")
      ?: continue

    output.add(
      ShopeePostingVideo(
        fileUri = fileUri,
        productName = item.optCleanString("productName"),
        productId = item.optCleanString("productId"),
        productUrl = item.optCleanString("productUrl"),
        caption = item.optCleanString("caption"),
        hashtags = item.optCleanString("hashtags"),
        cta = item.optCleanString("cta"),
        galleryVideoId = item.optCleanString("galleryVideoId"),
        platform = item.optCleanString("platform")
      )
    )
  }
  return output
}

internal fun JSONObject.optCleanString(key: String): String? {
  if (!has(key) || isNull(key)) return null
  val value = optString(key, "").trim()
  return value.ifBlank { null }
}

internal fun KubdeeAccessibilityService.runShopeeVideoPostingFlow(video: ShopeePostingVideo, preparedVideo: PreparedShopeeVideo) {
  logShopeePostStep("รีเซ็ต Shopee เพื่อโพสต์วิดีโอ")
  if (!launchPackage(TARGET_PACKAGE_SHOPEE, resetTask = true)) {
    logShopeePostStep("เปิด Shopee จาก service ไม่สำเร็จ จะรอหน้าที่เปิดจากแอป")
  }
  if (!waitForPackageActive(TARGET_PACKAGE_SHOPEE, 12_000L)) {
    throw IllegalStateException("ยังไม่เห็นหน้าต่าง Shopee หลังเปิดแอป")
  }

  sleepStep(2500L)
  prepareShopeeNavigationSurface()

  if (!navigateShopeeVideoAccount()) {
    throw IllegalStateException("ไม่พบหน้า Shopee Video สำหรับโพสต์")
  }

  openShopeeVideoComposer()
  selectPreparedShopeeVideoFromGallery(preparedVideo)
  tapShopeeNext("ถัดไปจาก preview")
  sleepStep(3000L)
  tapShopeeNext("ถัดไปจาก editor")
  sleepStep(4000L)
  fillShopeePostingCaption(video)
  attachShopeePostingProductBestEffort(video)
  disableShopeeContentReusePermissionBestEffort()
  enableShopeeAiGeneratedLabelBestEffort()

  tapShopeePostButton()
}

internal fun KubdeeAccessibilityService.navigateShopeeVideoAccount(): Boolean {
  if (!goToShopeeMeTab()) return false
  sleepStep(1200L)

  logShopeePostStep("เปิด โปรแกรม Affiliate")
  if (!scrollUntilTapText(SHOPEE_AFFILIATE_TEXTS, maxAttempts = 8)) {
    logShopeePostStep("ไม่พบเมนู โปรแกรม Affiliate")
    return false
  }
  sleepStep(4000L)

  logShopeePostStep("ไปที่ บัญชีผู้ใช้")
  if (!tapShopeeAffiliateAccountTab()) {
    logShopeePostStep("ไม่พบเมนู บัญชีผู้ใช้")
    return false
  }
  sleepStep(2500L)

  logShopeePostStep("เปิด หน้าบัญชี Shopee Video")
  if (!scrollUntilTapText(SHOPEE_VIDEO_ACCOUNT_TEXTS, maxAttempts = 5)) {
    logShopeePostStep("ไม่พบ หน้าบัญชี Shopee Video")
    return false
  }
  sleepStep(4000L)
  return true
}

internal fun KubdeeAccessibilityService.openShopeeVideoComposer() {
  logShopeePostStep("กดปุ่ม โพสต์วิดีโอ")
  if (!tapShopeeVideoComposerButton()) {
    throw IllegalStateException("ไม่พบปุ่ม โพสต์วิดีโอ")
  }
  sleepStep(4000L)
  tapAndroidPermissionAllow()
}

internal fun KubdeeAccessibilityService.selectPreparedShopeeVideoFromGallery(preparedVideo: PreparedShopeeVideo) {
  logShopeePostStep("เปิดคลังภาพ")
  if (
    !clickByAnyText(
      listOf("คลังภาพ", "Gallery", "Albums"),
      exact = false,
      allowedPackageName = TARGET_PACKAGE_SHOPEE
    )
  ) {
    throw IllegalStateException("ไม่พบปุ่ม คลังภาพ")
  }
  sleepStep(3000L)
  tapAndroidPermissionAllow()

  logShopeePostStep("เลือกไฟล์ล่าสุดจากคลัง: ${preparedVideo.displayName}")
  if (!tapFirstShopeeGalleryMedia()) {
    throw IllegalStateException("ไม่พบไฟล์ล่าสุดจากคลัง (${preparedVideo.displayName})")
  }
  sleepStep(3000L)
}

internal fun KubdeeAccessibilityService.tapShopeeNext(label: String) {
  logShopeePostStep(label)
  if (!clickByAnyText(listOf("ถัดไป", "Next"), exact = false, allowedPackageName = TARGET_PACKAGE_SHOPEE)) {
    throw IllegalStateException("ไม่พบปุ่ม $label")
  }
  sleepStep(1500L)
}

internal fun KubdeeAccessibilityService.fillShopeePostingCaption(video: ShopeePostingVideo) {
  val fullText = listOfNotNull(
    video.caption?.trim()?.ifBlank { null } ?: video.productName?.trim()?.ifBlank { null },
    video.cta?.trim()?.ifBlank { null },
    formatShopeeHashtagText(video.hashtags)
  ).joinToString(" ").trim()

  if (fullText.isBlank()) {
    logShopeePostStep("ไม่มีแคปชั่น/แฮชแท็ก ข้ามการกรอก")
    return
  }

  logShopeePostStep("กรอกแคปชั่น")
  val firstEditable = findEditableNode(rootInActiveWindow, TARGET_PACKAGE_SHOPEE)
  if (firstEditable == null) {
    clickByAnyText(
      listOf("แคปชั่น", "คำอธิบาย", "Caption", "Description"),
      exact = false,
      allowedPackageName = TARGET_PACKAGE_SHOPEE
    )
    sleepStep(800L)
  }

  val edit = findEditableNode(rootInActiveWindow, TARGET_PACKAGE_SHOPEE)
    ?: throw IllegalStateException("ไม่พบช่องกรอกแคปชั่น")

  clickNode(edit)
  sleepStep(450L)
  if (!setNodeText(edit, fullText)) {
    throw IllegalStateException("กรอกแคปชั่นไม่สำเร็จ")
  }
  sleepStep(800L)
  clickByAnyText(listOf("ตกลง", "Done"), exact = false, allowedPackageName = TARGET_PACKAGE_SHOPEE)
  sleepStep(800L)
}

internal fun KubdeeAccessibilityService.attachShopeePostingProductBestEffort(video: ShopeePostingVideo) {
  val productUrl = normalizeShopeeProductUrl(video.productUrl.orEmpty())
  val productName = video.productName?.trim().orEmpty()
  if (productUrl.isBlank() && productName.isBlank()) {
    logShopeePostStep("ไม่มีข้อมูลสินค้า ข้ามการแนบสินค้า")
    return
  }

  try {
    logShopeePostStep("แนบสินค้า Shopee")
    if (!tapShopeeAddProductEntry()) {
      logShopeePostStep("ไม่พบปุ่มเพิ่มสินค้า ข้ามการแนบสินค้า")
      return
    }
    sleepStep(1800L)

    if (
      productUrl.isNotBlank() &&
      tapShopeeProductLinkEntry()
    ) {
      sleepStep(1000L)
      if (fillAndAttachShopeeProductLink(productUrl)) {
        logShopeePostStep("แนบสินค้าด้วยลิงก์แล้ว")
        return
      }
      logShopeePostStep("แนบสินค้าด้วยลิงก์ไม่สำเร็จ จะกลับไปค้นหาด้วยชื่อสินค้า")
      prepareShopeeAddProductPickerAfterLinkFailure()
    }

    if (productName.isNotBlank() && ensureShopeeAddProductPickerOpenForSearch()) {
      clickByAnyText(
        listOf("กดถูกใจ", "ถูกใจ", "Liked", "ค้นหา", "Search"),
        exact = false,
        allowedPackageName = TARGET_PACKAGE_SHOPEE
      )
      sleepStep(800L)
      val edit = findEditableNode(rootInActiveWindow, TARGET_PACKAGE_SHOPEE)
      if (edit != null) {
        clickNode(edit)
        sleepStep(400L)
        setNodeText(edit, productName)
        pressImeEnterOn(edit)
        sleepStep(2600L)
        if (
          clickByAnyText(
            listOf("เพิ่ม", "Add", "เลือก", "Select"),
            exact = false,
            allowedPackageName = TARGET_PACKAGE_SHOPEE
          )
        ) {
          sleepStep(1800L)
          clickByAnyText(
            listOf("เสร็จสิ้น", "เสร็จ", "Done"),
            exact = false,
            allowedPackageName = TARGET_PACKAGE_SHOPEE
          )
          if (!waitForShopeePostingEditorVisible(maxAttempts = 6, delayMs = 900L)) {
            logShopeePostStep("แนบสินค้าด้วยชื่อสินค้าแล้ว แต่ยังไม่กลับ editor -> กดกลับหนึ่งครั้ง")
            performBack()
            waitForShopeePostingEditorVisible(maxAttempts = 4, delayMs = 700L)
          }
          logShopeePostStep("แนบสินค้าด้วยชื่อสินค้าแล้ว")
          return
        }
      }
    }

    logShopeePostStep("แนบสินค้าไม่สำเร็จ จะโพสต์ต่อโดยไม่แนบสินค้า")
    performBack()
    sleepStep(800L)
  } catch (error: Exception) {
    logShopeePostStep("แนบสินค้าไม่สำเร็จ: ${error.message ?: "unknown"}")
    performBack()
    sleepStep(800L)
  }
}

internal fun KubdeeAccessibilityService.tapShopeeAddProductEntry(): Boolean {
  if (tapShopeeAddProductPrimaryText()) {
    sleepStep(1100L)
    if (isShopeeAddProductMenuOpen() || !isShopeeAddProductPrimaryTextVisible()) {
      logShopeePostStep("เมนูเพิ่มสินค้าเปิดแล้ว")
      return true
    }
    logShopeePostStep("กดตรง 'แตะเพื่อเพิ่มสินค้า' แล้วเมนูยังไม่เปิด -> ใช้ fallback แถวเพิ่มสินค้า")
  }

  val fallbackTapPoints = withAutomationFloatingUiHiddenForShopeeTap {
    findShopeeAddProductFallbackTapPoints()
  }
  for ((safeX, safeY) in fallbackTapPoints) {
    val tapped = withAutomationFloatingUiHiddenForShopeeTap {
      tapBlocking(safeX.toFloat(), safeY.toFloat(), durationMs = 90L)
    }
    if (tapped) {
      logShopeePostStep("กดเพิ่มสินค้าที่ $safeX,$safeY (fallback แถวเพิ่มสินค้า)")
      sleepStep(1100L)
      if (isShopeeAddProductMenuOpen()) {
        logShopeePostStep("เมนูเพิ่มสินค้าเปิดแล้ว")
        return true
      }
      logShopeePostStep("กด fallback แล้วเมนูยังไม่เปิด")
    }
  }

  logShopeePostStep("ไม่พบทางเข้าเมนูเพิ่มสินค้า")
  return false
}

internal fun KubdeeAccessibilityService.findShopeeAddProductFallbackTapPoints(): List<Pair<Int, Int>> {
  val output = mutableListOf<Pair<Int, Int>>()
  for (root in shopeeWindowRoots()) {
    val screen = screenBounds(root)
    val textNodes = mutableListOf<TextNode>()
    collectTextNodes(root, textNodes, allowedPackageName = TARGET_PACKAGE_SHOPEE)
    val candidate = findShopeeAddProductTextNode(textNodes, screen) ?: continue
    val rowBounds = estimateShopeeAddProductRowBounds(candidate, textNodes, screen)
    val tapPoints = listOf(
      rowBounds.centerX() to rowBounds.centerY(),
      (rowBounds.right - maxOf(dp(40), screen.width() / 18)) to rowBounds.centerY(),
      maxOf(candidate.bounds.centerX(), rowBounds.left + rowBounds.width() / 4) to rowBounds.centerY()
    ).distinct()

    for ((x, y) in tapPoints) {
      val safeX = x.coerceIn(screen.left + dp(12), screen.right - dp(12))
      val safeY = y.coerceIn(screen.top + dp(12), screen.bottom - dp(12))
      output.add(safeX to safeY)
    }
  }
  return output.distinct()
}

internal fun KubdeeAccessibilityService.tapShopeeAddProductPrimaryText(): Boolean {
  var tapPoint: Pair<Int, Int>? = null
  val tapped = withAutomationFloatingUiHiddenForShopeeTap {
    for (root in shopeeWindowRoots()) {
      val screen = screenBounds(root)
      val textNodes = mutableListOf<TextNode>()
      collectTextNodes(root, textNodes, allowedPackageName = TARGET_PACKAGE_SHOPEE)
      val target = findShopeeAddProductPrimaryTextNode(textNodes, screen) ?: continue
      val safeX = target.bounds.centerX().coerceIn(screen.left + dp(12), screen.right - dp(12))
      val safeY = target.bounds.centerY().coerceIn(screen.top + dp(12), screen.bottom - dp(12))
      if (tapBlocking(safeX.toFloat(), safeY.toFloat(), durationMs = 90L)) {
        tapPoint = safeX to safeY
        return@withAutomationFloatingUiHiddenForShopeeTap true
      }
    }
    false
  }
  if (tapped) {
    val (safeX, safeY) = tapPoint ?: (0 to 0)
    logShopeePostStep("กดตรง 'แตะเพื่อเพิ่มสินค้า' ที่ $safeX,$safeY")
  }
  return tapped
}

internal fun KubdeeAccessibilityService.isShopeeAddProductPrimaryTextVisible(): Boolean {
  for (root in shopeeWindowRoots()) {
    val screen = screenBounds(root)
    val textNodes = mutableListOf<TextNode>()
    collectTextNodes(root, textNodes, allowedPackageName = TARGET_PACKAGE_SHOPEE)
    if (findShopeeAddProductPrimaryTextNode(textNodes, screen) != null) return true
  }
  return false
}

internal fun KubdeeAccessibilityService.findShopeeAddProductPrimaryTextNode(
  textNodes: List<TextNode>,
  screen: Rect
): TextNode? =
  textNodes
    .filter { node ->
      val text = cleanNodeText(node.text)
      val lower = text.lowercase(Locale.ROOT)
      (
        text.contains("แตะเพื่อเพิ่มสินค้า", ignoreCase = true) ||
          lower.contains("tap to add product")
        ) &&
        node.bounds.top >= screen.top + (screen.height() * 0.18f).toInt() &&
        node.bounds.bottom <= screen.bottom - (screen.height() * 0.16f).toInt()
    }
    .sortedWith(compareByDescending<TextNode> { it.bounds.left }.thenBy { it.bounds.top })
    .firstOrNull()

internal fun KubdeeAccessibilityService.isShopeeAddProductMenuOpen(): Boolean {
  val markers = listOf(
    "กรอกลิงก์สินค้า",
    "ลิงก์สินค้า",
    "ลิงค์สินค้า",
    "Product link",
    "กดถูกใจ",
    "สินค้าที่ถูกใจ",
    "Liked",
    "ค้นหา",
    "Search"
  )
  for (root in shopeeWindowRoots()) {
    val textNodes = mutableListOf<TextNode>()
    collectTextNodes(root, textNodes, allowedPackageName = TARGET_PACKAGE_SHOPEE)
    if (
      textNodes.any { node ->
        val text = cleanNodeText(node.text)
        markers.any { marker -> text.contains(marker, ignoreCase = true) }
      }
    ) {
      return true
    }
  }
  return false
}

internal fun KubdeeAccessibilityService.findShopeeAddProductTextNode(
  textNodes: List<TextNode>,
  screen: Rect
): TextNode? =
  textNodes
    .filter { node ->
      val text = cleanNodeText(node.text)
      val lower = text.lowercase(Locale.ROOT)
      (
        text.contains("แตะเพื่อเพิ่มสินค้า", ignoreCase = true) ||
          text.equals("เพิ่มสินค้า", ignoreCase = true) ||
          lower.contains("tap to add product") ||
          lower.contains("add product")
        ) &&
        node.bounds.top >= screen.top + (screen.height() * 0.18f).toInt() &&
        node.bounds.bottom <= screen.bottom - (screen.height() * 0.16f).toInt()
    }
    .sortedWith(
      compareByDescending<TextNode> {
        if (it.text.contains("แตะเพื่อเพิ่มสินค้า", ignoreCase = true) ||
          it.text.lowercase(Locale.ROOT).contains("tap to add product")
        ) 1 else 0
      }.thenBy { it.bounds.top }.thenByDescending { it.bounds.left }
    )
    .firstOrNull()

internal fun KubdeeAccessibilityService.estimateShopeeAddProductRowBounds(
  anchor: TextNode,
  textNodes: List<TextNode>,
  screen: Rect
): Rect {
  val rowTop = (anchor.bounds.top - maxOf(dp(24), screen.height() / 48)).coerceAtLeast(screen.top)
  val rowBottom = (anchor.bounds.bottom + maxOf(dp(24), screen.height() / 42)).coerceAtMost(screen.bottom)
  val sameRow = textNodes.filter { node ->
    node.bounds.centerY() in rowTop..rowBottom &&
      node.bounds.left >= screen.left &&
      node.bounds.right <= screen.right
  }
  val left = sameRow.minOfOrNull { it.bounds.left } ?: anchor.bounds.left
  val right = sameRow.maxOfOrNull { it.bounds.right } ?: anchor.bounds.right
  return Rect(
    maxOf(screen.left + dp(12), left - dp(24)),
    rowTop,
    minOf(screen.right - dp(12), maxOf(right + dp(48), screen.right - dp(24))),
    rowBottom
  )
}

internal fun KubdeeAccessibilityService.normalizeShopeeProductUrl(value: String): String {
  val url = value.trim()
  if (url.isBlank()) return ""
  if (!url.startsWith("http://", ignoreCase = true) && !url.startsWith("https://", ignoreCase = true)) return ""
  return if (Regex("""(^https?://)?([^/]+\.)?shopee\.""", RegexOption.IGNORE_CASE).containsMatchIn(url)) url else ""
}

internal fun KubdeeAccessibilityService.fillAndAttachShopeeProductLink(productUrl: String): Boolean {
  logShopeePostStep("กรอกลิงก์สินค้า: เริ่ม (${shortShopeeUrlForLog(productUrl)})")
  var lastInputDebug = ""

  if (!waitForShopeeProductLinkInputScreen()) {
    logShopeePostStep("กรอกลิงก์สินค้า: ยังไม่อยู่หน้ากรอกลิงก์ (${
      shopeeProductLinkInputDebugSnapshot()
    })")
    return false
  }

  repeat(4) { index ->
    val attempt = index + 1
    sleepStep(if (attempt == 1) 300L else 700L)
    if (isShopeePostingEditorVisible()) {
      lastInputDebug = shopeeProductLinkInputDebugSnapshot()
      logShopeePostStep("กรอกลิงก์สินค้า: เจอหน้า editor แทนช่องลิงก์ หยุดกันกรอกผิดช่อง ($lastInputDebug)")
      return false
    }

    var visibleLinkNode = findShopeeProductLinkVisibleNodeInInput(productUrl)
    val edit = findShopeeProductLinkEditableNode()
    if (edit == null) {
      if (visibleLinkNode != null) {
        logShopeePostStep(
          "กรอกลิงก์สินค้า: ไม่พบ editable แต่เห็นลิงก์ในช่องแล้ว -> กดนำเข้า (${visibleLinkNode.bounds.flattenToString()})"
        )
        sleepStep(1000L)
        if (!clickShopeeProductLinkImportButton(visibleLinkNode.bounds)) {
          logShopeePostStep("กรอกลิงก์สินค้า: ไม่พบปุ่มนำเข้า (${shopeeProductLinkActionDebugSnapshot()})")
          return@repeat
        }
        if (waitAndChooseShopeeProductLinkResult(productUrl)) {
          return true
        }
        logShopeePostStep("กรอกลิงก์สินค้า: กดนำเข้าแล้ว แต่ยังไม่พบปุ่มเลือกสินค้า")
        return@repeat
      }
      lastInputDebug = shopeeProductLinkInputDebugSnapshot()
      logShopeePostStep("กรอกลิงก์สินค้า: ยังไม่พบช่องกรอก (ครั้ง $attempt/4, $lastInputDebug)")
      return@repeat
    }

    val bounds = Rect()
    edit.getBoundsInScreen(bounds)
    clickNode(edit)
    sleepStep(250L)
    val setOk = setNodeText(edit, productUrl)
    sleepStep(450L)
    visibleLinkNode = findShopeeProductLinkVisibleNodeInInput(productUrl)
    var linkVerified = visibleLinkNode != null || edit.text?.toString()?.contains(productUrl) == true
    logShopeePostStep(
      "กรอกลิงก์สินค้า: setText=${if (setOk) "ok" else "fail"} verify=${if (linkVerified) "ok" else "pending"} bounds=${bounds.flattenToString()}"
    )

    if (!linkVerified) {
      val pasteOk = pasteShopeeProductLinkInto(edit, productUrl)
      sleepStep(500L)
      visibleLinkNode = findShopeeProductLinkVisibleNodeInInput(productUrl)
      val pastedText = visibleLinkNode != null || edit.text?.toString()?.contains(productUrl) == true
      logShopeePostStep("กรอกลิงก์สินค้า: paste=${if (pasteOk) "ok" else "fail"} verify=${if (pastedText) "ok" else "pending"}")
      linkVerified = pastedText
    }

    if (!linkVerified) {
      logShopeePostStep("กรอกลิงก์สินค้า: ยังยืนยันไม่ได้ว่าลิงก์อยู่ในช่อง ไม่กดนำเข้า")
      return@repeat
    }

    logShopeePostStep("กรอกลิงก์สินค้า: เห็นลิงก์ในช่องแล้ว รอ 1.8 วิ ก่อนกดนำเข้า")
    sleepStep(1800L)

    if (!clickShopeeProductLinkImportButton(bounds)) {
      logShopeePostStep("กรอกลิงก์สินค้า: ไม่พบปุ่มนำเข้า (${shopeeProductLinkActionDebugSnapshot()})")
      return@repeat
    }

    if (waitAndChooseShopeeProductLinkResult(productUrl)) {
      return true
    }
    logShopeePostStep("กรอกลิงก์สินค้า: ยืนยันลิงก์แล้ว แต่ยังไม่พบปุ่มเลือกสินค้า")
  }

  if (lastInputDebug.isNotBlank()) {
    logShopeePostStep("กรอกลิงก์สินค้า: ล้มเหลว ($lastInputDebug)")
  }
  return false
}

internal fun KubdeeAccessibilityService.waitForShopeeProductLinkInputScreen(): Boolean {
  repeat(6) { index ->
    if (isShopeeProductLinkInputScreen()) return true
    if (isShopeePostingEditorVisible()) return false
    sleepStep(if (index == 0) 350L else 500L)
  }
  return false
}

internal fun KubdeeAccessibilityService.waitAndChooseShopeeProductLinkResult(productUrl: String): Boolean {
  repeat(10) { index ->
    sleepStep(if (index == 0) 1200L else 700L)

    if (isShopeePostingEditorVisible()) {
      if (isShopeeProductLinkTextVisible(productUrl)) {
        logShopeePostStep("กรอกลิงก์สินค้า: URL กลับไปอยู่หน้า editor ยังไม่ใช่การแนบสินค้า")
        return false
      }
      if (isShopeePostingProductAttachedVisible()) {
        logShopeePostStep("กรอกลิงก์สินค้า: กลับ editor และพบข้อมูลสินค้าแล้ว")
        return true
      }
      return false
    }

    if (clickShopeeProductLinkSelectAllButton()) {
      sleepStep(900L)
      if (clickShopeeProductLinkAddSelectedButton()) {
        sleepStep(1800L)
        if (waitForShopeePostingEditorVisible(maxAttempts = 5, delayMs = 700L)) {
          logShopeePostStep("กรอกลิงก์สินค้า: กลับ editor หลังเพิ่มสินค้าจากลิงก์")
          return true
        }
        if (!isShopeeProductLinkTextVisible(productUrl)) return true
        logShopeePostStep("กรอกลิงก์สินค้า: กดเพิ่มแล้วแต่ยังไม่กลับ editor")
        return false
      }
      logShopeePostStep("กรอกลิงก์สินค้า: เลือกทั้งหมดแล้ว แต่ไม่พบปุ่มเพิ่ม")
      return@repeat
    }
  }
  return false
}

internal fun KubdeeAccessibilityService.findShopeeProductLinkEditableNode(): AccessibilityNodeInfo? {
  val candidates = mutableListOf<Pair<Rect, AccessibilityNodeInfo>>()
  for (root in shopeeWindowRoots()) {
    val screen = screenBounds(root)
    if (!isShopeeProductLinkInputScreenRoot(root, screen)) continue
    var visited = 0
    collectShopeeProductLinkEditableNodes(root, screen, candidates) {
      visited += 1
      visited <= 700
    }
  }

  return candidates
    .filter { (bounds, _) -> bounds.width() > 0 && bounds.height() > 0 }
    .maxWithOrNull(
      compareBy<Pair<Rect, AccessibilityNodeInfo>> { (_, node) -> if (node.isFocused) 1 else 0 }
        .thenBy { (bounds, _) -> bounds.width() }
        .thenByDescending { (bounds, _) -> bounds.top }
    )
    ?.second
}

internal fun KubdeeAccessibilityService.collectShopeeProductLinkEditableNodes(
  node: AccessibilityNodeInfo?,
  screen: Rect,
  output: MutableList<Pair<Rect, AccessibilityNodeInfo>>,
  shouldContinue: () -> Boolean
) {
  if (node == null || !shouldContinue()) return
  if (
    node.isVisibleToUser &&
    node.isEditable &&
    !isBlockedEditableNode(node) &&
    isAllowedPackageNode(node, TARGET_PACKAGE_SHOPEE)
  ) {
    val bounds = Rect()
    node.getBoundsInScreen(bounds)
    if (
      bounds.width() >= screen.width() / 3 &&
      bounds.height() >= dp(24) &&
      bounds.top >= screen.top + statusBarHeightPx() &&
      bounds.bottom <= screen.bottom - dp(80)
    ) {
      output += Rect(bounds) to node
    }
  }

  for (index in 0 until node.childCount) {
    collectShopeeProductLinkEditableNodes(node.getChild(index), screen, output, shouldContinue)
  }
}

internal fun KubdeeAccessibilityService.pasteShopeeProductLinkInto(
  edit: AccessibilityNodeInfo,
  productUrl: String
): Boolean {
  val clipboard = getSystemService(ClipboardManager::class.java) ?: return false
  return try {
    clipboard.setPrimaryClip(ClipData.newPlainText("kubdee-shopee-product-url", productUrl))
    clickNode(edit)
    sleepStep(180L)
    edit.performAction(AccessibilityNodeInfo.ACTION_PASTE)
  } catch (_: Exception) {
    false
  }
}

internal fun KubdeeAccessibilityService.clickShopeeProductLinkActionButton(
  texts: List<String>,
  phase: String
): Boolean {
  for (root in shopeeWindowRoots()) {
    val screen = screenBounds(root)
    val isEditor = isShopeePostingEditorRoot(root, screen)
    if (isEditor) continue
    val candidates = mutableListOf<TextNode>()
    var visited = 0
    collectShopeeProductLinkActionCandidates(root, screen, texts, candidates) {
      visited += 1
      visited <= 900
    }
    val target = candidates
      .filter { candidate ->
        candidate.bounds.centerY() >= screen.top + statusBarHeightPx() + dp(96)
      }
      .sortedWith(
        compareByDescending<TextNode> { if (findClickableNode(it.node) != null) 1 else 0 }
          .thenByDescending { it.bounds.bottom }
          .thenByDescending { it.bounds.right }
      )
      .firstOrNull()
      ?: continue

    if (clickNode(target.node)) {
      logShopeePostStep("กรอกลิงก์สินค้า: กดปุ่ม$phase '${target.text}' ที่ ${target.bounds.centerX()},${target.bounds.centerY()}")
      return true
    }
  }
  return false
}

internal fun KubdeeAccessibilityService.clickShopeeProductLinkImportButton(inputBounds: Rect): Boolean {
  if (clickShopeeProductLinkActionButton(listOf("นำเข้า", "Import"), "นำเข้าลิงก์")) {
    return true
  }

  val tapped = withAutomationFloatingUiHiddenForShopeeTap {
    for (root in shopeeWindowRoots()) {
      val screen = screenBounds(root)
      if (!isShopeeProductLinkInputScreenRoot(root, screen)) continue
      val x = inputBounds.centerX().coerceIn(screen.left + dp(24), screen.right - dp(24))
      val y = (inputBounds.bottom + maxOf(dp(36), screen.height() / 16))
        .coerceIn(inputBounds.bottom + dp(18), screen.bottom - maxOf(dp(180), screen.height() / 4))
      if (tapBlocking(x.toFloat(), y.toFloat(), durationMs = 90L)) {
        logShopeePostStep("กรอกลิงก์สินค้า: กดปุ่มนำเข้าจากตำแหน่งใต้ช่องลิงก์ ($x,$y)")
        return@withAutomationFloatingUiHiddenForShopeeTap true
      }
    }
    false
  }
  return tapped
}

internal fun KubdeeAccessibilityService.clickShopeeProductLinkSelectAllButton(): Boolean {
  if (clickShopeeProductLinkActionButton(listOf("เลือกทั้งหมด", "Select all"), "เลือกทั้งหมด")) {
    return true
  }

  val tapped = withAutomationFloatingUiHiddenForShopeeTap {
    for (root in shopeeWindowRoots()) {
      val screen = screenBounds(root)
      if (isShopeePostingEditorRoot(root, screen)) continue
      val textNodes = mutableListOf<TextNode>()
      collectTextNodes(root, textNodes, allowedPackageName = TARGET_PACKAGE_SHOPEE)
      val listHeader = textNodes.firstOrNull { node ->
        val text = cleanNodeText(node.text)
        text.contains("รายการสินค้า", ignoreCase = true) ||
          text.contains("Product list", ignoreCase = true)
      }
      if (listHeader != null) {
        val x = (listHeader.bounds.left + dp(18)).coerceIn(screen.left + dp(16), screen.right - dp(16))
        val y = (listHeader.bounds.bottom + dp(38)).coerceIn(listHeader.bounds.bottom + dp(16), screen.bottom - dp(120))
        if (tapBlocking(x.toFloat(), y.toFloat(), durationMs = 90L)) {
          logShopeePostStep("กรอกลิงก์สินค้า: กดเลือกทั้งหมดจากตำแหน่งใต้หัวรายการ ($x,$y)")
          return@withAutomationFloatingUiHiddenForShopeeTap true
        }
      }
    }
    false
  }
  return tapped
}

internal fun KubdeeAccessibilityService.clickShopeeProductLinkAddSelectedButton(): Boolean {
  if (clickShopeeProductLinkAddSelectedTextButton()) {
    return true
  }

  for (root in shopeeWindowRoots()) {
    val screen = screenBounds(root)
    if (isShopeePostingEditorRoot(root, screen)) continue
    val x = (screen.right - maxOf(dp(72), screen.width() / 8)).coerceIn(screen.left + dp(24), screen.right - dp(24))
    val y = (screen.bottom - maxOf(dp(56), screen.height() / 18)).coerceIn(screen.top + dp(120), screen.bottom - dp(24))
    if (tapBlocking(x.toFloat(), y.toFloat(), durationMs = 90L)) {
      logShopeePostStep("กรอกลิงก์สินค้า: กดเพิ่มจากปุ่มมุมขวาล่าง ($x,$y)")
      return true
    }
  }
  return false
}

internal fun KubdeeAccessibilityService.clickShopeeProductLinkAddSelectedTextButton(): Boolean {
  for (root in shopeeWindowRoots()) {
    val screen = screenBounds(root)
    if (isShopeePostingEditorRoot(root, screen)) continue
    val textNodes = mutableListOf<TextNode>()
    collectTextNodes(root, textNodes, allowedPackageName = TARGET_PACKAGE_SHOPEE)
    val target = textNodes
      .filter { node ->
        isShopeeProductLinkAddSelectedText(node.text) &&
          node.bounds.centerY() >= screen.top + (screen.height() * 0.45f).toInt()
      }
      .sortedWith(
        compareByDescending<TextNode> { if (findClickableNode(it.node) != null) 1 else 0 }
          .thenByDescending { it.bounds.bottom }
          .thenByDescending { it.bounds.right }
      )
      .firstOrNull()
      ?: continue

    if (clickNode(target.node)) {
      logShopeePostStep("กรอกลิงก์สินค้า: กดปุ่มเพิ่มสินค้าจากลิงก์ '${target.text}' ที่ ${target.bounds.centerX()},${target.bounds.centerY()}")
      return true
    }
  }
  return false
}

internal fun isShopeeProductLinkAddSelectedText(text: String): Boolean {
  val compact = text.trim().replace(" ", "")
  if (compact.isBlank()) return false
  return compact == "เพิ่ม" ||
    compact.startsWith("เพิ่ม(") ||
    compact.startsWith("เพิ่มสินค้า") ||
    compact == "Add" ||
    compact.startsWith("Add(") ||
    compact.startsWith("Addproduct", ignoreCase = true)
}

internal fun KubdeeAccessibilityService.isShopeeProductLinkTextVisibleInInput(productUrl: String): Boolean {
  return findShopeeProductLinkVisibleNodeInInput(productUrl) != null
}

internal fun KubdeeAccessibilityService.findShopeeProductLinkVisibleNodeInInput(productUrl: String): TextNode? {
  val candidates = mutableListOf<TextNode>()
  for (root in shopeeWindowRoots()) {
    val screen = screenBounds(root)
    if (!isShopeeProductLinkInputScreenRoot(root, screen)) continue
    val textNodes = mutableListOf<TextNode>()
    collectTextNodes(root, textNodes, allowedPackageName = TARGET_PACKAGE_SHOPEE)
    candidates += textNodes.filter { node ->
      node.bounds.width() > 0 &&
        node.bounds.height() > 0 &&
        node.bounds.top >= screen.top + statusBarHeightPx() &&
        node.bounds.bottom <= screen.bottom &&
        looksLikeShopeeProductLinkText(node.text, productUrl)
    }
  }
  return candidates
    .sortedWith(
      compareByDescending<TextNode> { it.bounds.width() }
        .thenBy { it.bounds.top }
    )
    .firstOrNull()
}

internal fun KubdeeAccessibilityService.isShopeeProductLinkTextVisible(productUrl: String): Boolean {
  for (root in shopeeWindowRoots()) {
    var visited = 0
    if (
      containsShopeeProductLinkText(root, productUrl) {
        visited += 1
        visited <= 900
      }
    ) return true
  }
  return false
}

internal fun KubdeeAccessibilityService.shopeeProductLinkInputDebugSnapshot(): String {
  val parts = mutableListOf<String>()
  for (root in shopeeWindowRoots()) {
    val samples = mutableListOf<String>()
    var visited = 0
    collectShopeeProductLinkTextSamples(root, samples) {
      visited += 1
      visited <= 180 && samples.size < 5
    }
    val sample = samples.joinToString("/")
    if (sample.isNotBlank()) parts += sample
  }
  return "text=${parts.firstOrNull().orEmpty()}"
}

internal fun KubdeeAccessibilityService.shopeeProductLinkActionDebugSnapshot(): String {
  val parts = mutableListOf<String>()
  for (root in shopeeWindowRoots()) {
    val screen = screenBounds(root)
    if (!isShopeeProductLinkInputScreenRoot(root, screen)) continue
    val candidates = mutableListOf<TextNode>()
    var visited = 0
    collectShopeeProductLinkActionSamples(root, screen, candidates) {
      visited += 1
      visited <= 500 && candidates.size < 8
    }
    val sample = candidates.joinToString(" | ") { candidate ->
      "${candidate.text}:${candidate.bounds.flattenToString()}"
    }
    if (sample.isNotBlank()) parts += sample
  }
  return "actions=${parts.firstOrNull().orEmpty()}"
}

internal fun KubdeeAccessibilityService.isShopeeProductLinkInputScreen(): Boolean {
  for (root in shopeeWindowRoots()) {
    val screen = screenBounds(root)
    if (isShopeeProductLinkInputScreenRoot(root, screen)) return true
  }
  return false
}

internal fun KubdeeAccessibilityService.isShopeeProductLinkInputScreenRoot(
  root: AccessibilityNodeInfo?,
  screen: Rect
): Boolean {
  if (root == null || isShopeePostingEditorRoot(root, screen)) return false

  val textNodes = mutableListOf<TextNode>()
  collectTextNodes(root, textNodes, allowedPackageName = TARGET_PACKAGE_SHOPEE)
  val texts = textNodes.map { cleanNodeText(it.text) }
  val strongLinkMarker = texts.any { text ->
    text.contains("กรอกลิงก์สินค้า", ignoreCase = true) ||
      text.contains("กรอกลิงค์สินค้า", ignoreCase = true) ||
      text.contains("ใส่ลิงก์สินค้า", ignoreCase = true) ||
      text.contains("ใส่ลิงค์สินค้า", ignoreCase = true) ||
      text.contains("วางลิงก์สินค้า", ignoreCase = true) ||
      text.contains("วางลิงค์สินค้า", ignoreCase = true) ||
      text.contains("Product link", ignoreCase = true) ||
      text.contains("Paste product", ignoreCase = true) ||
      text.contains("Enter product", ignoreCase = true)
  }
  if (!strongLinkMarker) return false

  val hasEditorMarker = texts.any { text ->
    text.contains("เพิ่มแคปชั่น", ignoreCase = true) ||
      text.contains("เลือกภาพปก", ignoreCase = true) ||
      text.contains("แฮชแท็ก", ignoreCase = true) ||
      text.equals("โพสต์", ignoreCase = true) ||
      text.equals("Post", ignoreCase = true)
  }
  return !hasEditorMarker
}

internal fun KubdeeAccessibilityService.isShopeePostingEditorVisible(): Boolean {
  for (root in shopeeWindowRoots()) {
    val screen = screenBounds(root)
    if (isShopeePostingEditorRoot(root, screen)) return true
  }
  return false
}

internal fun KubdeeAccessibilityService.waitForShopeePostingEditorVisible(
  maxAttempts: Int = 6,
  delayMs: Long = 700L
): Boolean {
  repeat(maxAttempts) { index ->
    if (isShopeePostingEditorVisible()) return true
    sleepStep(if (index == 0) 250L else delayMs)
  }
  return false
}

internal fun KubdeeAccessibilityService.isShopeePostingEditorRoot(
  root: AccessibilityNodeInfo?,
  screen: Rect
): Boolean {
  val textNodes = mutableListOf<TextNode>()
  collectTextNodes(root, textNodes, allowedPackageName = TARGET_PACKAGE_SHOPEE)
  var markerCount = 0
  for (node in textNodes) {
    val text = cleanNodeText(node.text)
    if (
      text.contains("เพิ่มแคปชั่น", ignoreCase = true) ||
      text.contains("เลือกภาพปก", ignoreCase = true) ||
      text.contains("แฮชแท็ก", ignoreCase = true) ||
      text.contains("อนุญาตให้นำเนื้อหา", ignoreCase = true) ||
      text.contains("บันทึกลงในโทรศัพท์", ignoreCase = true) ||
      text.contains("Add caption", ignoreCase = true) ||
      text.contains("Cover", ignoreCase = true) ||
      text.contains("Hashtag", ignoreCase = true)
    ) {
      markerCount += 1
    }
  }
  return markerCount >= 2
}

internal fun KubdeeAccessibilityService.isShopeePostingProductAttachedVisible(): Boolean {
  for (root in shopeeWindowRoots()) {
    val screen = screenBounds(root)
    if (!isShopeePostingEditorRoot(root, screen)) continue
    val textNodes = mutableListOf<TextNode>()
    collectTextNodes(root, textNodes, allowedPackageName = TARGET_PACKAGE_SHOPEE)
    if (
      textNodes.any { node ->
        val text = cleanNodeText(node.text)
        (
          text.contains("สินค้า", ignoreCase = true) ||
            text.contains("Product", ignoreCase = true)
          ) &&
          !text.contains("แตะเพื่อเพิ่มสินค้า", ignoreCase = true) &&
          !text.equals("เพิ่มสินค้า", ignoreCase = true) &&
          node.bounds.top >= screen.top + (screen.height() * 0.16f).toInt() &&
          node.bounds.bottom <= screen.bottom - (screen.height() * 0.20f).toInt()
      }
    ) return true
  }
  return false
}

internal fun KubdeeAccessibilityService.prepareShopeeAddProductPickerAfterLinkFailure(): Boolean {
  if (isShopeeProductLinkInputScreen()) {
    performBack()
    sleepStep(900L)
  }
  return ensureShopeeAddProductPickerOpenForSearch()
}

internal fun KubdeeAccessibilityService.ensureShopeeAddProductPickerOpenForSearch(): Boolean {
  if (isShopeeAddProductPickerScreen()) return true
  if (isShopeePostingEditorVisible()) {
    logShopeePostStep("กลับมา editor แล้ว เปิดเมนูเพิ่มสินค้าอีกครั้งเพื่อค้นหาจากชื่อ")
    return tapShopeeAddProductEntry()
  }
  performBack()
  sleepStep(700L)
  if (isShopeeAddProductPickerScreen()) return true
  if (isShopeePostingEditorVisible()) {
    logShopeePostStep("กลับมา editor หลัง back เปิดเมนูเพิ่มสินค้าอีกครั้ง")
    return tapShopeeAddProductEntry()
  }
  return false
}

internal fun KubdeeAccessibilityService.collectShopeeProductLinkActionCandidates(
  node: AccessibilityNodeInfo?,
  screen: Rect,
  texts: List<String>,
  output: MutableList<TextNode>,
  shouldContinue: () -> Boolean
) {
  if (node == null || !shouldContinue()) return
  if (node.isVisibleToUser && isAllowedPackageNode(node, TARGET_PACKAGE_SHOPEE)) {
    val text = cleanNodeText(readNodeText(node))
    if (texts.any { text.equals(it, ignoreCase = true) }) {
      val bounds = Rect()
      node.getBoundsInScreen(bounds)
      if (
        bounds.width() > 0 &&
        bounds.height() > 0 &&
        bounds.top >= screen.top + statusBarHeightPx() &&
        bounds.bottom <= screen.bottom
      ) {
        output += TextNode(text, Rect(bounds), node)
      }
    }
  }

  for (index in 0 until node.childCount) {
    collectShopeeProductLinkActionCandidates(node.getChild(index), screen, texts, output, shouldContinue)
  }
}

internal fun KubdeeAccessibilityService.collectShopeeProductLinkActionSamples(
  node: AccessibilityNodeInfo?,
  screen: Rect,
  output: MutableList<TextNode>,
  shouldContinue: () -> Boolean
) {
  if (node == null || !shouldContinue()) return
  if (node.isVisibleToUser && isAllowedPackageNode(node, TARGET_PACKAGE_SHOPEE)) {
    val text = cleanNodeText(readNodeText(node))
    val bounds = Rect()
    node.getBoundsInScreen(bounds)
    if (
      text.isNotBlank() &&
      bounds.width() > 0 &&
      bounds.height() > 0 &&
      bounds.top >= screen.top + statusBarHeightPx() &&
      bounds.bottom <= screen.bottom
    ) {
      output += TextNode(text.take(18), Rect(bounds), node)
    }
  }

  for (index in 0 until node.childCount) {
    collectShopeeProductLinkActionSamples(node.getChild(index), screen, output, shouldContinue)
  }
}

internal fun KubdeeAccessibilityService.containsShopeeProductLinkText(
  node: AccessibilityNodeInfo?,
  productUrl: String,
  shouldContinue: () -> Boolean
): Boolean {
  if (node == null || !shouldContinue()) return false
  if (
    node.isVisibleToUser &&
    isAllowedPackageNode(node, TARGET_PACKAGE_SHOPEE) &&
    looksLikeShopeeProductLinkText(readNodeText(node), productUrl)
  ) {
    return true
  }

  for (index in 0 until node.childCount) {
    if (containsShopeeProductLinkText(node.getChild(index), productUrl, shouldContinue)) return true
  }
  return false
}

internal fun KubdeeAccessibilityService.collectShopeeProductLinkTextSamples(
  node: AccessibilityNodeInfo?,
  output: MutableList<String>,
  shouldContinue: () -> Boolean
) {
  if (node == null || !shouldContinue()) return
  if (node.isVisibleToUser && isAllowedPackageNode(node, TARGET_PACKAGE_SHOPEE)) {
    val text = cleanNodeText(readNodeText(node))
    if (text.isNotBlank()) output += text
  }

  for (index in 0 until node.childCount) {
    collectShopeeProductLinkTextSamples(node.getChild(index), output, shouldContinue)
  }
}

internal fun looksLikeShopeeProductLinkText(text: String, productUrl: String): Boolean {
  val clean = text.trim()
  if (clean.isBlank()) return false
  if (productUrl.isNotBlank() && clean.contains(productUrl, ignoreCase = true)) return true
  val hasShopeeHost =
    clean.contains("shopee.", ignoreCase = true) ||
      clean.contains("s.shopee", ignoreCase = true) ||
      clean.contains("shp.ee", ignoreCase = true)
  if (!hasShopeeHost) return false
  return clean.contains("http://", ignoreCase = true) ||
    clean.contains("https://", ignoreCase = true) ||
    clean.contains("www.", ignoreCase = true) ||
    clean.contains("s.shopee", ignoreCase = true) ||
    clean.contains("shp.ee", ignoreCase = true)
}

internal fun shortShopeeUrlForLog(productUrl: String): String {
  val host = runCatching { Uri.parse(productUrl).host.orEmpty() }.getOrDefault("")
  return "${host.ifBlank { "url" }} len=${productUrl.length}"
}

internal fun KubdeeAccessibilityService.tapShopeeProductLinkEntry(): Boolean {
  val clickedByText = withAutomationFloatingUiHiddenForShopeeTap {
    clickByAnyText(
      listOf("กรอกลิงก์สินค้า", "ลิงก์สินค้า", "ลิงค์สินค้า", "Product link", "Link"),
      exact = false,
      allowedPackageName = TARGET_PACKAGE_SHOPEE
    )
  }
  if (clickedByText) {
    logShopeePostStep("เปิดกรอกลิงก์สินค้าด้วยข้อความ")
    return true
  }

  if (tapShopeeProductLinkHeaderIcon()) {
    return true
  }

  var iconPoint: Pair<Int, Int>? = null
  val tappedByNode = withAutomationFloatingUiHiddenForShopeeTap {
    for (root in shopeeWindowRoots()) {
      val screen = screenBounds(root)
      val target = findShopeeProductLinkNode(root, screen) ?: continue
      val bounds = Rect()
      target.getBoundsInScreen(bounds)
      if (tapNodeCenter(target)) {
        iconPoint = bounds.centerX() to bounds.centerY()
        return@withAutomationFloatingUiHiddenForShopeeTap true
      }
    }
    false
  }
  if (tappedByNode) {
    val (x, y) = iconPoint ?: (0 to 0)
    logShopeePostStep("เปิดกรอกลิงก์สินค้าด้วย icon ($x,$y)")
    return true
  }

  logShopeePostStep("ไม่พบทางเข้าเมนูลิงก์สินค้า")
  return false
}

internal fun KubdeeAccessibilityService.tapShopeeProductLinkHeaderIcon(): Boolean {
  var sawAddProductScreen = false
  var successMessage: String? = null

  withAutomationFloatingUiHiddenForShopeeTap {
    for (root in shopeeWindowRoots()) {
      val screen = screenBounds(root)
      if (!isShopeeAddProductPickerScreenRoot(root, screen)) continue
      sawAddProductScreen = true

      val candidates = mutableListOf<Pair<Rect, AccessibilityNodeInfo>>()
      collectClickableNodes(root, candidates)
      val linkAction = candidates
        .filter { (bounds, node) ->
          val raw = listOfNotNull(
            node.text?.toString(),
            node.contentDescription?.toString(),
            node.viewIdResourceName
          ).joinToString(" ").lowercase(Locale.ROOT)
          isAllowedPackageNode(node, TARGET_PACKAGE_SHOPEE) &&
            bounds.width() > 0 &&
            bounds.height() > 0 &&
            bounds.centerX() >= screen.left + (screen.width() * 0.58f).toInt() &&
            bounds.centerY() >= screen.top + statusBarHeightPx() &&
            bounds.centerY() <= screen.top + statusBarHeightPx() + dp(88) &&
            (
              "link" in raw ||
                "url" in raw ||
                "chain" in raw ||
                "ลิงก์" in raw ||
                "ลิงค์" in raw
              )
        }
        .maxByOrNull { it.first.centerX() }

      if (linkAction != null) {
        val bounds = linkAction.first
        if (tapBlocking(bounds.centerX().toFloat(), bounds.centerY().toFloat(), durationMs = 80L)) {
          successMessage = "เปิดกรอกลิงก์สินค้าด้วยไอคอนโซ่ที่ตรวจเจอ (${bounds.centerX()},${bounds.centerY()})"
          return@withAutomationFloatingUiHiddenForShopeeTap
        }
      }

      val headerIconAction = findShopeeTopRightHeaderIcon(root, screen)
      if (headerIconAction != null) {
        val (bounds, node) = headerIconAction
        val className = node.className?.toString()?.substringAfterLast('.') ?: "node"
        if (tapBlocking(bounds.centerX().toFloat(), bounds.centerY().toFloat(), durationMs = 80L)) {
          successMessage = "เปิดกรอกลิงก์สินค้าด้วย $className ไอคอนโซ่ (${bounds.centerX()},${bounds.centerY()})"
          return@withAutomationFloatingUiHiddenForShopeeTap
        }
      }

      val estimatedHeaderIconPoint = estimateShopeeProductLinkHeaderIconPoint(root, screen)
      if (estimatedHeaderIconPoint != null) {
        val (x, y) = estimatedHeaderIconPoint
        if (tapBlocking(x.toFloat(), y.toFloat(), durationMs = 80L)) {
          successMessage = "เปิดกรอกลิงก์สินค้าด้วยตำแหน่งไอคอนโซ่จาก header bounds ($x,$y)"
          return@withAutomationFloatingUiHiddenForShopeeTap
        }
      }
    }
  }

  successMessage?.let { message ->
    logShopeePostStep(message)
    return true
  }

  if (sawAddProductScreen) {
    logShopeePostStep("ไม่พบ node ไอคอนโซ่บน header หน้าเพิ่มสินค้า")
  }
  return false
}

internal fun KubdeeAccessibilityService.isShopeeAddProductPickerScreen(): Boolean {
  for (root in shopeeWindowRoots()) {
    val screen = screenBounds(root)
    if (isShopeeAddProductPickerScreenRoot(root, screen)) return true
  }
  return false
}

internal fun KubdeeAccessibilityService.isShopeeAddProductPickerScreenRoot(
  root: AccessibilityNodeInfo?,
  screen: Rect
): Boolean {
  val textNodes = mutableListOf<TextNode>()
  collectTextNodes(root, textNodes, allowedPackageName = TARGET_PACKAGE_SHOPEE)
  val hasHeader = textNodes.any { node ->
    (
      node.text == "เพิ่มสินค้า" ||
        node.text.equals("Add product", ignoreCase = true)
      ) &&
      node.bounds.top <= screen.top + statusBarHeightPx() + dp(88)
  }
  if (!hasHeader) return false

  return textNodes.any { node ->
    node.text.contains("ค้นหาสินค้า") ||
      node.text.contains("ที่กดถูกใจ") ||
      node.text.contains("Affiliate", ignoreCase = true) ||
      node.text.contains("Liked", ignoreCase = true) ||
      node.text.contains("Product", ignoreCase = true) ||
      node.text.contains("ลิงก์สินค้า", ignoreCase = true)
  }
}

internal fun KubdeeAccessibilityService.findShopeeProductLinkNode(
  node: AccessibilityNodeInfo?,
  screen: Rect
): AccessibilityNodeInfo? {
  if (node == null || !isAllowedPackageNode(node, TARGET_PACKAGE_SHOPEE)) return null
  if (node.isVisibleToUser) {
    val bounds = Rect()
    node.getBoundsInScreen(bounds)
    val raw = listOfNotNull(
      node.text?.toString(),
      node.contentDescription?.toString(),
      node.viewIdResourceName
    ).joinToString(" ").lowercase(Locale.ROOT)
    val looksLikeLink =
      "link" in raw ||
        "url" in raw ||
        "chain" in raw ||
        "ลิงก์" in raw ||
        "ลิงค์" in raw
    if (
      looksLikeLink &&
        bounds.width() > 0 &&
        bounds.height() > 0 &&
        bounds.left >= screen.left + (screen.width() * 0.5f).toInt() &&
        bounds.top <= screen.top + (screen.height() * 0.24f).toInt()
    ) {
      return node
    }
  }

  for (index in 0 until node.childCount) {
    val found = findShopeeProductLinkNode(node.getChild(index), screen)
    if (found != null) return found
  }
  return null
}

internal fun KubdeeAccessibilityService.findShopeeTopRightHeaderIcon(
  node: AccessibilityNodeInfo?,
  screen: Rect
): Pair<Rect, AccessibilityNodeInfo>? {
  val titleBounds = findShopeeAddProductHeaderTitleBounds(node, screen)
  val candidates = mutableListOf<Pair<Rect, AccessibilityNodeInfo>>()
  collectShopeeTopRightHeaderIconCandidates(node, screen, titleBounds, candidates)
  if (candidates.isEmpty()) {
    val debugNodes = mutableListOf<String>()
    collectShopeeHeaderDebugNodes(node, screen, titleBounds, debugNodes)
    logShopeePostStep(
      "หาไอคอนโซ่: ไม่พบ candidate header ขวาบน (title=${titleBounds?.flattenToString() ?: "-"}, nodes=${debugNodes.take(6).joinToString(" | ")})"
    )
  }
  return candidates.maxWithOrNull(
    compareBy<Pair<Rect, AccessibilityNodeInfo>> { (_, candidate) ->
      val className = candidate.className?.toString().orEmpty().lowercase(Locale.ROOT)
      if (className.contains("imageview")) 1 else 0
    }.thenBy { it.first.centerX() }
  )
}

internal fun KubdeeAccessibilityService.findShopeeAddProductHeaderTitleBounds(
  node: AccessibilityNodeInfo?,
  screen: Rect
): Rect? {
  if (node == null) return null

  if (node.isVisibleToUser && isAllowedPackageNode(node, TARGET_PACKAGE_SHOPEE)) {
    val bounds = Rect()
    node.getBoundsInScreen(bounds)
    val text = node.text?.toString().orEmpty()
    val isHeaderTitle =
      (text == "เพิ่มสินค้า" || text.equals("Add product", ignoreCase = true)) &&
        bounds.width() > 0 &&
        bounds.height() > 0 &&
        bounds.top <= screen.top + statusBarHeightPx() + dp(96)

    if (isHeaderTitle) {
      return Rect(bounds)
    }
  }

  for (index in 0 until node.childCount) {
    val childTitle = findShopeeAddProductHeaderTitleBounds(node.getChild(index), screen)
    if (childTitle != null) return childTitle
  }

  return null
}

internal fun KubdeeAccessibilityService.estimateShopeeProductLinkHeaderIconPoint(
  node: AccessibilityNodeInfo?,
  screen: Rect
): Pair<Int, Int>? {
  val titleBounds = findShopeeAddProductHeaderTitleBounds(node, screen) ?: return null
  val iconSize = titleBounds.height().coerceAtLeast(maxOf(24, screen.width() / 30))
  val minX = titleBounds.right + maxOf(6, iconSize / 8)
  val maxX = screen.right - maxOf(8, iconSize / 4)
  if (minX > maxX) return null

  val x = (titleBounds.right + iconSize / 2).coerceIn(minX, maxX)
  val y = titleBounds.centerY().coerceIn(titleBounds.top, titleBounds.bottom)
  return x to y
}

internal fun KubdeeAccessibilityService.collectShopeeTopRightHeaderIconCandidates(
  node: AccessibilityNodeInfo?,
  screen: Rect,
  titleBounds: Rect?,
  output: MutableList<Pair<Rect, AccessibilityNodeInfo>>
) {
  if (node == null) return

  val packageName = node.packageName?.toString().orEmpty()
  if (node.isVisibleToUser && (packageName.isBlank() || packageName == TARGET_PACKAGE_SHOPEE)) {
    val bounds = Rect()
    node.getBoundsInScreen(bounds)
    val className = node.className?.toString().orEmpty().lowercase(Locale.ROOT)
    val raw = listOfNotNull(
      node.text?.toString(),
      node.contentDescription?.toString(),
      node.viewIdResourceName
    ).joinToString(" ").trim()
    val headerPadding = titleBounds?.height()?.coerceAtLeast(12) ?: maxOf(24, screen.height() / 80)
    val headerTop = titleBounds?.let { it.top - headerPadding }
      ?: (screen.top + statusBarHeightPx() - maxOf(8, screen.height() / 240))
    val headerBottom = titleBounds?.let { it.bottom + headerPadding }
      ?: (screen.top + statusBarHeightPx() + maxOf(96, screen.height() / 10))
    val rightAreaStart = titleBounds?.let { title ->
      (title.right - headerPadding).coerceAtLeast(screen.left + (screen.width() * 0.52f).toInt())
    } ?: (screen.left + (screen.width() * 0.62f).toInt())
    val minIconSizePx = maxOf(14, screen.width() / 48)
    val maxIconSizePx = maxOf(72, screen.width() / 5)
    val isTopRightHeaderImage =
      (
        className.contains("imageview") ||
          className == "android.view.view" ||
          className.contains("button")
        ) &&
        raw.isBlank() &&
        bounds.width() in minIconSizePx..maxIconSizePx &&
        bounds.height() in minIconSizePx..maxIconSizePx &&
        bounds.centerX() >= rightAreaStart &&
        bounds.centerY() in headerTop..headerBottom

    if (isTopRightHeaderImage) {
      output.add(Rect(bounds) to node)
    }
  }

  for (index in 0 until node.childCount) {
    collectShopeeTopRightHeaderIconCandidates(node.getChild(index), screen, titleBounds, output)
  }
}

internal fun KubdeeAccessibilityService.collectShopeeHeaderDebugNodes(
  node: AccessibilityNodeInfo?,
  screen: Rect,
  titleBounds: Rect?,
  output: MutableList<String>
) {
  if (node == null || output.size >= 12) return

  val packageName = node.packageName?.toString().orEmpty()
  if (node.isVisibleToUser && (packageName.isBlank() || packageName == TARGET_PACKAGE_SHOPEE)) {
    val bounds = Rect()
    node.getBoundsInScreen(bounds)
    val headerPadding = titleBounds?.height()?.coerceAtLeast(12) ?: maxOf(24, screen.height() / 80)
    val headerTop = titleBounds?.let { it.top - headerPadding }
      ?: (screen.top + statusBarHeightPx() - maxOf(8, screen.height() / 240))
    val headerBottom = titleBounds?.let { it.bottom + headerPadding }
      ?: (screen.top + statusBarHeightPx() + maxOf(96, screen.height() / 10))
    if (bounds.centerX() >= screen.left + (screen.width() * 0.45f).toInt() && bounds.centerY() in headerTop..headerBottom) {
      val className = node.className?.toString()?.substringAfterLast('.') ?: "node"
      val raw = listOfNotNull(node.text?.toString(), node.contentDescription?.toString(), node.viewIdResourceName)
        .joinToString("/")
        .take(24)
      output.add("$className:${bounds.flattenToString()}:${raw.ifBlank { "-" }}")
    }
  }

  for (index in 0 until node.childCount) {
    collectShopeeHeaderDebugNodes(node.getChild(index), screen, titleBounds, output)
  }
}

internal fun KubdeeAccessibilityService.tapShopeePostButton() {
  logShopeePostStep("กดโพสต์")
  if (!waitForShopeePostingEditorVisible(maxAttempts = 4, delayMs = 700L)) {
    performBack()
    waitForShopeePostingEditorVisible(maxAttempts = 4, delayMs = 700L)
  }

  if (
    !clickByAnyText(listOf("โพสต์", "Post"), exact = true, allowedPackageName = TARGET_PACKAGE_SHOPEE) &&
    !tapShopeeBottomPostButtonFallback()
  ) {
    throw IllegalStateException("ไม่พบปุ่มโพสต์")
  }
  logShopeePostStep("กดโพสต์แล้ว รอ Shopee รับคำสั่ง")
  sleepStep(2000L)
}

internal fun KubdeeAccessibilityService.tapShopeeBottomPostButtonFallback(): Boolean {
  val tapped = withAutomationFloatingUiHiddenForShopeeTap {
    for (root in shopeeWindowRoots()) {
      val screen = screenBounds(root)
      if (!isShopeePostingEditorRoot(root, screen)) continue
      val x = screen.centerX().coerceIn(screen.left + dp(24), screen.right - dp(24))
      val y = (screen.bottom - maxOf(dp(64), screen.height() / 18)).coerceIn(screen.top + dp(80), screen.bottom - dp(24))
      if (tapBlocking(x.toFloat(), y.toFloat(), durationMs = 90L)) {
        logShopeePostStep("กดโพสต์ด้วย fallback ปุ่มล่าง ($x,$y)")
        return@withAutomationFloatingUiHiddenForShopeeTap true
      }
    }
    false
  }
  return tapped
}

internal fun KubdeeAccessibilityService.disableShopeeContentReusePermissionBestEffort() {
  try {
    logShopeePostStep("ปิดการอนุญาต reuse/เผยแพร่ต่อ")
    val target = findShopeeContentReuseToggleTarget()
    if (target == null) {
      logShopeePostStep("ไม่พบ toggle reuse/เผยแพร่ต่อ ข้ามขั้นตอนนี้")
      return
    }

    if (!target.node.isCheckable) {
      logShopeePostStep("toggle reuse/เผยแพร่ต่อไม่มีสถานะชัดเจน ข้ามเพื่อไม่พลิกค่าผิด")
      return
    }

    if (!target.node.isChecked) {
      logShopeePostStep("reuse/เผยแพร่ต่อปิดอยู่แล้ว")
      return
    }

    if (!clickShopeeToggleTarget(target)) {
      logShopeePostStep("กด toggle reuse/เผยแพร่ต่อไม่สำเร็จ ข้ามขั้นตอนนี้")
      return
    }
    sleepStep(800L)
    logShopeePostStep("ส่งคำสั่งปิด reuse/เผยแพร่ต่อแล้ว")
  } catch (error: Exception) {
    logShopeePostStep("ปิด reuse/เผยแพร่ต่อไม่สำเร็จ: ${error.message ?: "unknown"}")
  }
}

internal fun KubdeeAccessibilityService.enableShopeeAiGeneratedLabelBestEffort() {
  try {
    logShopeePostStep("เปิดป้ายกำกับ AI")
    val target = findShopeeAiGeneratedLabelToggleTarget()
    if (target == null) {
      logShopeePostStep("ไม่พบ toggle ป้ายกำกับ AI ข้ามขั้นตอนนี้")
      return
    }

    if (!target.node.isCheckable) {
      logShopeePostStep("toggle ป้ายกำกับ AI ไม่มีสถานะชัดเจน ข้ามเพื่อไม่พลิกค่าผิด")
      return
    }

    if (target.node.isChecked) {
      logShopeePostStep("ป้ายกำกับ AI เปิดอยู่แล้ว")
      return
    }

    if (!clickShopeeToggleTarget(target)) {
      logShopeePostStep("กด toggle ป้ายกำกับ AI ไม่สำเร็จ ข้ามขั้นตอนนี้")
      return
    }
    sleepStep(800L)
    logShopeePostStep("ส่งคำสั่งเปิดป้ายกำกับ AI แล้ว")
  } catch (error: Exception) {
    logShopeePostStep("เปิดป้ายกำกับ AI ไม่สำเร็จ: ${error.message ?: "unknown"}")
  }
}

internal fun KubdeeAccessibilityService.findShopeeContentReuseToggleTarget(): ShopeeToggleTarget? {
  for (root in shopeeWindowRoots()) {
    val screen = screenBounds(root)
    val labels = mutableListOf<Rect>()
    val toggles = mutableListOf<ShopeeToggleTarget>()
    collectShopeePostingToggleCandidates(root, screen, labels, toggles) { textKey, _, _ ->
      "นำเนื้อหาไปใช้ซ้ำ" in textKey ||
        "เผยแพร่ต่อ" in textKey ||
        ("duet" in textKey && "ตัดต่อ" in textKey) ||
        ("duet" in textKey && "sticker" in textKey) ||
        ("reuse" in textKey && "content" in textKey)
    }
    findNearbyShopeeToggle(labels, toggles, screen)?.let { return it }
  }
  return null
}

internal fun KubdeeAccessibilityService.findShopeeAiGeneratedLabelToggleTarget(): ShopeeToggleTarget? {
  for (root in shopeeWindowRoots()) {
    val screen = screenBounds(root)
    val labels = mutableListOf<Rect>()
    val panels = mutableListOf<Rect>()
    val toggles = mutableListOf<ShopeeToggleTarget>()
    collectShopeePostingToggleCandidates(root, screen, labels, toggles) { textKey, resourceId, bounds ->
      if (resourceId.endsWith("ai_generated_label_panel")) {
        panels.add(Rect(bounds))
      }
      resourceId.endsWith("tv_ai_generated_title") ||
        resourceId.endsWith("tv_ai_generated_desc") ||
        "ป้ายกำกับ ai" in textKey ||
        "เนื้อหาที่สร้างขึ้น" in textKey ||
        ("ai" in textKey && "เนื้อหา" in textKey)
    }

    toggles
      .filter { it.resourceId.endsWith("ai_generated_toggle") }
      .minWithOrNull(compareBy<ShopeeToggleTarget> { it.bounds.top }.thenBy { it.bounds.left })
      ?.let { return it }

    for (panel in panels) {
      toggles
        .filter { toggle ->
          toggle.bounds.left >= panel.left &&
            toggle.bounds.right <= panel.right &&
            toggle.bounds.top >= panel.top &&
            toggle.bounds.bottom <= panel.bottom
        }
        .minWithOrNull(compareBy<ShopeeToggleTarget> { it.bounds.top }.thenBy { it.bounds.left })
        ?.let { return it }
    }

    findNearbyShopeeToggle(labels, toggles, screen)?.let { return it }
  }
  return null
}

internal fun KubdeeAccessibilityService.collectShopeePostingToggleCandidates(
  node: AccessibilityNodeInfo?,
  screen: Rect,
  labelBounds: MutableList<Rect>,
  toggles: MutableList<ShopeeToggleTarget>,
  isLabel: (textKey: String, resourceId: String, bounds: Rect) -> Boolean
) {
  if (node == null || !isAllowedPackageNode(node, TARGET_PACKAGE_SHOPEE)) return
  if (node.isVisibleToUser) {
    val bounds = Rect()
    node.getBoundsInScreen(bounds)
    if (bounds.width() > 0 && bounds.height() > 0) {
      val resourceId = node.viewIdResourceName.orEmpty().lowercase(Locale.ROOT)
      val className = node.className?.toString().orEmpty().lowercase(Locale.ROOT)
      val textKey = cleanNodeText(readNodeText(node)).lowercase(Locale.ROOT)

      if (isLabel(textKey, resourceId, bounds)) {
        labelBounds.add(Rect(bounds))
      }

      val looksToggleLike = node.isCheckable &&
        (
          resourceId.endsWith("toggle") ||
            resourceId.contains("toggle") ||
            className.contains("switch")
        )
      if (
        looksToggleLike &&
          bounds.left >= screen.left + (screen.width() * 0.5f).toInt() &&
          bounds.top >= screen.top + (screen.height() * 0.05f).toInt() &&
          bounds.top <= screen.top + (screen.height() * 0.82f).toInt()
      ) {
        toggles.add(ShopeeToggleTarget(node, Rect(bounds), resourceId))
      }
    }
  }

  for (index in 0 until node.childCount) {
    collectShopeePostingToggleCandidates(node.getChild(index), screen, labelBounds, toggles, isLabel)
  }
}

internal fun KubdeeAccessibilityService.findNearbyShopeeToggle(
  labels: List<Rect>,
  toggles: List<ShopeeToggleTarget>,
  screen: Rect
): ShopeeToggleTarget? {
  for (label in labels) {
    val nearby = toggles
      .filter { toggle ->
        toggle.bounds.left >= maxOf(screen.left + (screen.width() * 0.5f).toInt(), label.right - dp(24)) &&
          toggle.bounds.top <= label.bottom + dp(120) &&
          toggle.bounds.bottom >= label.top - dp(24)
      }
      .minWithOrNull(
        compareBy<ShopeeToggleTarget> {
          kotlin.math.abs(toggleCenterY(it.bounds) - toggleCenterY(label))
        }.thenBy { it.bounds.top }
      )
    if (nearby != null) return nearby
  }
  return null
}

internal fun KubdeeAccessibilityService.clickShopeeToggleTarget(target: ShopeeToggleTarget): Boolean {
  if (clickNode(target.node)) return true
  return tapBlocking(target.bounds.centerX().toFloat(), target.bounds.centerY().toFloat())
}

internal fun KubdeeAccessibilityService.toggleCenterY(bounds: Rect): Int = (bounds.top + bounds.bottom) / 2

internal fun KubdeeAccessibilityService.tapShopeeVideoComposerButton(): Boolean {
  if (clickByAnyText(SHOPEE_VIDEO_COMPOSER_TEXTS, exact = false, allowedPackageName = TARGET_PACKAGE_SHOPEE)) return true

  val root = rootInActiveWindow ?: return false
  val screen = screenBounds(root)
  val textNodes = mutableListOf<TextNode>()
  collectTextNodes(root, textNodes, allowedPackageName = TARGET_PACKAGE_SHOPEE)
  val candidate = textNodes
    .filter { node ->
      SHOPEE_VIDEO_COMPOSER_TEXTS.any { needle -> node.text.contains(needle, ignoreCase = true) } &&
        node.bounds.top >= screen.top + (screen.height() * 0.55f).toInt()
    }
    .sortedByDescending { it.bounds.top }
    .firstOrNull()
    ?: return false
  return tapBlocking(candidate.bounds.centerX().toFloat(), candidate.bounds.centerY().toFloat())
}
