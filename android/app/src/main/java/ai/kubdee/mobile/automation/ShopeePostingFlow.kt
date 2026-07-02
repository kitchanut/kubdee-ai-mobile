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

    logShopeePostStep("App v${ai.kubdee.mobile.BuildConfig.VERSION_NAME} เริ่มโพสต์ Shopee ${videos.size} คลิป")

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
        put("error", "Shopee posting ไม่สำเร็จทุกคลิป")
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
  if (
    !openShopeeMenuWithShortScroll(
      texts = SHOPEE_AFFILIATE_TEXTS,
      menuName = "โปรแกรม Affiliate",
      maxAttempts = 12,
      log = { message -> logShopeePostStep(message) },
      onTapped = {
        waitForShopeeAffiliateAccountTabReady(20_000L)
      }
    )
  ) {
    logShopeePostStep("ไม่พบเมนู โปรแกรม Affiliate")
    return false
  }

  logShopeePostStep("ไปที่ บัญชีผู้ใช้")
  if (!tapShopeeAffiliateAccountTab()) {
    logShopeePostStep("ไม่พบเมนู บัญชีผู้ใช้")
    return false
  }
  sleepStep(2500L)

  logShopeePostStep("เปิด หน้าบัญชี Shopee Video")
  if (
    !openShopeeMenuWithShortScroll(
      texts = SHOPEE_VIDEO_ACCOUNT_TEXTS,
      menuName = "หน้าบัญชี Shopee Video",
      maxAttempts = 8,
      log = { message -> logShopeePostStep(message) },
      onTapped = {
        sleepStep(4000L)
        true
      }
    )
  ) {
    logShopeePostStep("ไม่พบ หน้าบัญชี Shopee Video")
    return false
  }
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
      listOf(
        "แคปชั่น",
        "คำอธิบาย",
        "Caption",
        "Description",
        "Add caption",
        "Add caption to your photos",
        "Add caption to you photos"
      ),
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
    if (!tapShopeeAddProductButton()) {
      logShopeePostStep("ไม่พบปุ่มเพิ่มสินค้า ข้ามการแนบสินค้า")
      return
    }
    sleepStep(1800L)

    if (
      productUrl.isNotBlank() &&
      tapShopeeProductLinkEntryWithRetry()
    ) {
      sleepStep(1200L)
      val edit = findEditableNode(rootInActiveWindow, TARGET_PACKAGE_SHOPEE)
      if (edit != null) {
        clickNode(edit)
        sleepStep(400L)
        if (!setNodeText(edit, productUrl)) {
          logShopeePostStep("กรอกลิงก์สินค้าไม่สำเร็จ")
        }
        sleepStep(800L)
        if (tapShopeeProductLinkImportButton()) {
          sleepStep(2000L)
          tapShopeeProductSelectAll()
          sleepStep(700L)
          if (tapShopeeProductFinalAddButton()) {
            sleepStep(1800L)
            logShopeePostStep("แนบสินค้าด้วยลิงก์แล้ว")
            return
          }
        }
      }
      logShopeePostStep("แนบสินค้าด้วยลิงก์ไม่สำเร็จ จะกลับไปค้นหาด้วยชื่อสินค้า")
      performBack()
      sleepStep(900L)
    }

    if (productName.isNotBlank()) {
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
          sleepStep(1600L)
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

internal fun KubdeeAccessibilityService.normalizeShopeeProductUrl(value: String): String {
  val url = value.trim()
  if (url.isBlank()) return ""
  if (!url.startsWith("http://", ignoreCase = true) && !url.startsWith("https://", ignoreCase = true)) return ""
  return if (Regex("""(^https?://)?([^/]+\.)?shopee\.""", RegexOption.IGNORE_CASE).containsMatchIn(url)) url else ""
}

internal fun KubdeeAccessibilityService.tapShopeeAddProductButton(): Boolean {
  if (
    clickByAnyText(
      listOf("แตะเพื่อเพิ่มสินค้า", "Tap to add product"),
      exact = false,
      allowedPackageName = TARGET_PACKAGE_SHOPEE
    )
  ) {
    logShopeePostStep("กดแตะเพื่อเพิ่มสินค้าแล้ว")
    return true
  }

  for (root in shopeeWindowRoots()) {
    val textNodes = mutableListOf<TextNode>()
    collectTextNodes(root, textNodes, allowedPackageName = TARGET_PACKAGE_SHOPEE)
    val screen = screenBounds(root)
    val addProductLabel = textNodes
      .filter { node ->
        (
          node.text == "เพิ่มสินค้า" ||
            node.text.equals("Add product", ignoreCase = true)
          ) &&
          node.bounds.top > screen.top + (screen.height() * 0.20f).toInt() &&
          node.bounds.top < screen.top + (screen.height() * 0.60f).toInt()
      }
      .minByOrNull { it.bounds.top }
      ?: continue

    val candidates = mutableListOf<Pair<Rect, AccessibilityNodeInfo>>()
    collectClickableNodes(root, candidates)
    val rowAction = candidates
      .filter { (bounds, node) ->
        isAllowedPackageNode(node, TARGET_PACKAGE_SHOPEE) &&
          bounds.width() > 0 &&
          bounds.height() > 0 &&
          bounds.centerX() >= screen.left + (screen.width() * 0.52f).toInt() &&
          bounds.centerY() >= addProductLabel.bounds.top - dp(24) &&
          bounds.centerY() <= addProductLabel.bounds.bottom + dp(24)
      }
      .maxByOrNull { it.first.centerX() }

    if (rowAction != null && tapNodeCenter(rowAction.second)) {
      logShopeePostStep("กดปุ่มแตะเพื่อเพิ่มสินค้าในแถวเพิ่มสินค้าแล้ว")
      return true
    }

    val x = screen.right - dp(130)
    val y = addProductLabel.bounds.centerY()
    if (tapBlocking(x.toFloat(), y.toFloat(), timeoutMs = 1800L, durationMs = 80L)) {
      logShopeePostStep("กดตำแหน่งปุ่มแตะเพื่อเพิ่มสินค้าในแถวเพิ่มสินค้าแล้ว")
      return true
    }
  }

  return false
}

internal fun KubdeeAccessibilityService.tapShopeeProductLinkEntry(): Boolean {
  if (isShopeeProductLinkEntryScreen()) {
    logShopeePostStep("อยู่หน้าใส่ลิงก์สินค้าแล้ว")
    return true
  }

  if (isShopeeAddProductPickerScreen()) {
    if (tapShopeeProductLinkHeaderIcon()) {
      return true
    }
    logShopeePostStep("อยู่หน้าเพิ่มสินค้า แต่ยังหาไอคอนโซ่มุมขวาบนไม่เจอ")
    return false
  }

  if (
    clickByAnyText(
      listOf("กรอกลิงก์สินค้า", "ลิงก์สินค้า", "ลิงค์สินค้า", "Product link"),
      exact = false,
      allowedPackageName = TARGET_PACKAGE_SHOPEE
    )
  ) {
    logShopeePostStep("เปิดกรอกลิงก์สินค้าด้วยข้อความ")
    return true
  }

  for (root in shopeeWindowRoots()) {
    val screen = screenBounds(root)
    val target = findShopeeProductLinkNode(root, screen)
    if (target != null && tapShopeeLinkNodeCenterWithoutStopButton(target)) {
      logShopeePostStep("เปิดกรอกลิงก์สินค้าด้วย icon")
      return true
    }
  }

  if (tapShopeeProductLinkHeaderIcon()) {
    return true
  }

  logShopeePostStep("ไม่พบทางเข้าเมนูลิงก์สินค้า")
  return false
}

internal fun KubdeeAccessibilityService.tapShopeeProductLinkEntryWithRetry(attempts: Int = 3): Boolean {
  for (attempt in 1..attempts) {
    if (tapShopeeProductLinkEntry()) return true
    if (attempt < attempts) {
      logShopeePostStep("ยังไม่เจอทางเข้าเมนูลิงก์สินค้า รอหน้า Shopee โหลด (${attempt + 1}/$attempts)")
      sleepStep(900L)
    }
  }
  return false
}

internal fun KubdeeAccessibilityService.isShopeeProductLinkEntryScreen(): Boolean =
  containsAnyText(
    listOf("กรอกลิงก์สินค้า", "รองรับเฉพาะลิงก์สินค้า", "Product link"),
    contains = true,
    allowedPackageName = TARGET_PACKAGE_SHOPEE
  ) && findEditableNode(rootInActiveWindow, TARGET_PACKAGE_SHOPEE) != null

internal fun KubdeeAccessibilityService.isShopeeAddProductPickerScreen(): Boolean {
  for (root in shopeeWindowRoots()) {
    val textNodes = mutableListOf<TextNode>()
    collectTextNodes(root, textNodes, allowedPackageName = TARGET_PACKAGE_SHOPEE)
    val screen = screenBounds(root)
    val hasHeader = textNodes.any { node ->
      (
        node.text == "เพิ่มสินค้า" ||
          node.text.equals("Add product", ignoreCase = true)
        ) &&
        node.bounds.top <= screen.top + statusBarHeightPx() + dp(72)
    }
    if (!hasHeader) continue

    val hasPickerContent = textNodes.any { node ->
      node.text.contains("ค้นหาสินค้า") ||
        node.text.contains("ที่กดถูกใจ") ||
        node.text.contains("Affiliate", ignoreCase = true) ||
        node.text.contains("Liked", ignoreCase = true) ||
        node.text.contains("Product", ignoreCase = true)
    }
    if (hasPickerContent) return true
  }
  return false
}

internal fun KubdeeAccessibilityService.tapShopeeLinkNodeCenterWithoutStopButton(
  node: AccessibilityNodeInfo,
  durationMs: Long = 80L
): Boolean {
  val bounds = Rect()
  node.getBoundsInScreen(bounds)
  if (bounds.width() <= 0 || bounds.height() <= 0) return false
  return tapBlockingWithoutStopButton(bounds.centerX().toFloat(), bounds.centerY().toFloat(), durationMs = durationMs)
}

internal fun KubdeeAccessibilityService.tapShopeeProductLinkHeaderIcon(): Boolean {
  var sawAddProductScreen = false
  var successMessage: String? = null

  setAutomationFloatingUiVisibleBlocking(false)
  sleepStep(180L)
  try {
    for (root in shopeeWindowRoots()) {
      val screen = screenBounds(root)
      val isAddProductScreen = isShopeeAddProductPickerScreen()
      if (!isAddProductScreen) continue
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
            bounds.centerY() <= screen.top + statusBarHeightPx() + dp(72) &&
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
          break
        }
      }

      val headerImageAction = findShopeeTopRightHeaderImage(root, screen)
      if (headerImageAction != null) {
        val bounds = headerImageAction.first
        if (tapBlocking(bounds.centerX().toFloat(), bounds.centerY().toFloat(), durationMs = 80L)) {
          successMessage = "เปิดกรอกลิงก์สินค้าด้วยไอคอนขวาบน (${bounds.centerX()},${bounds.centerY()})"
          break
        }
      }
    }
  } finally {
    sleepStep(180L)
    setAutomationFloatingUiVisibleBlocking(true)
  }

  successMessage?.let { message ->
    logShopeePostStep(message)
    return true
  }

  logShopeePostStep(
    if (sawAddProductScreen) {
      "ไม่พบ node ไอคอนโซ่จาก UI บนหน้าเพิ่มสินค้า"
    } else {
      "ยังไม่ยืนยันหน้าเพิ่มสินค้า ตอนหาไอคอนโซ่"
    }
  )
  return false
}

internal fun KubdeeAccessibilityService.findShopeeTopRightHeaderImage(
  node: AccessibilityNodeInfo?,
  screen: Rect
): Pair<Rect, AccessibilityNodeInfo>? {
  if (node == null || !isAllowedPackageNode(node, TARGET_PACKAGE_SHOPEE)) return null

  var best: Pair<Rect, AccessibilityNodeInfo>? = null
  if (node.isVisibleToUser) {
    val bounds = Rect()
    node.getBoundsInScreen(bounds)
    val className = node.className?.toString().orEmpty().lowercase(Locale.ROOT)
    val headerTop = screen.top + statusBarHeightPx() - dp(8)
    val headerBottom = screen.top + statusBarHeightPx() + dp(88)
    val minIconSize = dp(12)
    val maxIconSize = dp(96)
    val isTopRightHeaderImage =
      className.contains("imageview") &&
        bounds.width() in minIconSize..maxIconSize &&
        bounds.height() in minIconSize..maxIconSize &&
        bounds.centerX() >= screen.right - dp(96) &&
        bounds.centerY() in headerTop..headerBottom

    if (isTopRightHeaderImage) {
      best = Rect(bounds) to node
    }
  }

  for (index in 0 until node.childCount) {
    val childBest = findShopeeTopRightHeaderImage(node.getChild(index), screen)
    if (childBest != null) {
      best = listOfNotNull(best, childBest).maxByOrNull { it.first.centerX() }
    }
  }

  return best
}

internal fun KubdeeAccessibilityService.tapShopeeProductLinkImportButton(): Boolean {
  if (
    clickByAnyText(
      listOf("เพิ่ม", "Add", "ตกลง", "OK", "ยืนยัน", "Confirm"),
      exact = true,
      allowedPackageName = TARGET_PACKAGE_SHOPEE
    )
  ) {
    logShopeePostStep("กดเพิ่มลิงก์สินค้าแล้ว")
    return true
  }

  val root = rootInActiveWindow ?: return false
  val screen = screenBounds(root)
  if (
    containsAnyText(
      listOf("กรอกลิงก์สินค้า", "ลิงก์สินค้า", "Product link"),
      contains = true,
      allowedPackageName = TARGET_PACKAGE_SHOPEE
    )
  ) {
    val x = screen.left + screen.width() * 0.65f
    val y = screen.bottom - dp(68).toFloat()
    if (tapBlocking(x, y, timeoutMs = 1800L, durationMs = 80L)) {
      logShopeePostStep("กดเพิ่มลิงก์สินค้าด้วยปุ่มล่าง")
      return true
    }
  }
  return false
}

internal fun KubdeeAccessibilityService.tapShopeeProductSelectAll(): Boolean {
  if (
    clickByAnyText(
      listOf("เลือกทั้งหมด", "Select all"),
      exact = false,
      allowedPackageName = TARGET_PACKAGE_SHOPEE
    )
  ) {
    logShopeePostStep("เลือกสินค้าทั้งหมดจากลิงก์แล้ว")
    return true
  }
  logShopeePostStep("ไม่พบปุ่มเลือกทั้งหมดหลังเพิ่มลิงก์สินค้า")
  return false
}

internal fun KubdeeAccessibilityService.tapShopeeProductFinalAddButton(): Boolean {
  if (
    clickByAnyText(
      listOf("เพิ่ม", "Add", "เลือก", "Select", "เสร็จ", "Done"),
      exact = true,
      allowedPackageName = TARGET_PACKAGE_SHOPEE
    )
  ) {
    logShopeePostStep("กดยืนยันเพิ่มสินค้าแล้ว")
    return true
  }

  val root = rootInActiveWindow ?: return false
  val screen = screenBounds(root)
  if (
    containsAnyText(
      listOf("รายการสินค้า", "เลือกทั้งหมด", "No products", "ไม่มีสินค้า"),
      contains = true,
      allowedPackageName = TARGET_PACKAGE_SHOPEE
    )
  ) {
    val x = screen.left + screen.width() * 0.65f
    val y = screen.bottom - dp(68).toFloat()
    if (tapBlocking(x, y, timeoutMs = 1800L, durationMs = 80L)) {
      logShopeePostStep("กดยืนยันเพิ่มสินค้าด้วยปุ่มล่าง")
      return true
    }
  }
  return false
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

internal fun KubdeeAccessibilityService.tapShopeePostButton() {
  logShopeePostStep("กดโพสต์")
  if (!clickByAnyText(listOf("โพสต์", "Post"), exact = true, allowedPackageName = TARGET_PACKAGE_SHOPEE)) {
    throw IllegalStateException("ไม่พบปุ่มโพสต์")
  }
  logShopeePostStep("กดโพสต์แล้ว รอ Shopee รับคำสั่ง")
  sleepStep(2000L)
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
        "ระบุว่าเป็นเนื้อหาที่สร้างโดย ai" in textKey ||
        "เนื้อหาที่สร้างโดย ai" in textKey ||
        "สร้างโดย ai" in textKey ||
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
