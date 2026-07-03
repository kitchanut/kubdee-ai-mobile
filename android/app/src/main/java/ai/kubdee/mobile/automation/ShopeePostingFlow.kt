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
import android.graphics.Bitmap
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
import android.view.Display
import android.view.WindowManager
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import android.view.accessibility.AccessibilityWindowInfo
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
    setAutomationFloatingUiSuppressedBlocking(false)
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
    setAutomationFloatingUiSuppressedBlocking(false)
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
  attachShopeePostingProductStrict(video)
  settleShopeePostingSurfaceAfterProductAttach()
  disableShopeeContentReusePermissionStrict()
  enableShopeeAiGeneratedLabelStrict()

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
  dismissShopeeKeyboardIfVisible("หลังกรอกแคปชั่น")
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

    if (productUrl.isNotBlank()) {
      if (!tapShopeeProductLinkEntryWithRetry()) {
        logShopeePostStep("แนบสินค้าด้วยลิงก์ไม่สำเร็จ: เปิดหน้าใส่ลิงก์ไม่ได้ จะไม่กรอกช่องค้นหา")
        performBack()
        sleepStep(900L)
        return
      }

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
      logShopeePostStep("แนบสินค้าด้วยลิงก์ไม่สำเร็จ จะไม่กรอกช่องค้นหา")
      performBack()
      sleepStep(900L)
      return
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

internal fun KubdeeAccessibilityService.attachShopeePostingProductStrict(video: ShopeePostingVideo) {
  val productUrl = normalizeShopeePostingProductUrl(video.productUrl.orEmpty())
  val productName = video.productName?.trim().orEmpty()
  if (productUrl.isBlank() && productName.isBlank()) {
    logShopeePostStep("ไม่มีข้อมูลสินค้า ข้ามการแนบสินค้า")
    return
  }

  logShopeePostStep("แนบสินค้า Shopee")
  dismissShopeeKeyboardIfVisible("ก่อนแนบสินค้า")
  if (!tapShopeeAddProductButton()) {
    throw IllegalStateException("ไม่พบปุ่มเพิ่มสินค้า")
  }
  sleepStep(1800L)

  if (productUrl.isNotBlank()) {
    logShopeePostStep("ใช้ลิงก์สินค้า: ${productUrl.take(96)}${if (productUrl.length > 96) "..." else ""}")
    if (!tapShopeeProductLinkEntryWithRetry()) {
      logShopeePostStep("เปิดหน้าใส่ลิงก์สินค้าไม่ได้ หยุดโพสต์เพื่อ debug หน้าเพิ่มสินค้า")
      throw IllegalStateException("เปิดหน้าใส่ลิงก์สินค้าไม่ได้")
    }

    val edit = findEditableNode(rootInActiveWindow, TARGET_PACKAGE_SHOPEE)
      ?: throw IllegalStateException("ไม่พบช่องกรอกลิงก์สินค้า")
    clickNode(edit)
    sleepStep(400L)
    if (!setNodeText(edit, productUrl)) {
      throw IllegalStateException("กรอกลิงก์สินค้าไม่สำเร็จ")
    }
    sleepStep(800L)
    dismissShopeeKeyboardIfVisible("หลังกรอกลิงก์สินค้า")

    if (!tapShopeeProductLinkImportButton()) {
      throw IllegalStateException("ไม่พบปุ่มนำเข้าลิงก์สินค้า")
    }
    if (!waitForShopeeProductLinkResult(45_000L)) {
      logShopeePostStep("รอ Shopee นำเข้าสินค้าจากลิงก์ครบเวลาแล้ว จะลอง fallback ด้วยชื่อสินค้า")
    }

    if (!tapShopeeProductSelectAll()) {
      logShopeePostStep("ไม่พบเลือกทั้งหมดหลังเพิ่มลิงก์ ลองเพิ่มสินค้าจากผลลัพธ์โดยตรง")
      if (!tapShopeeProductFinalAddButton(productName)) {
        if (attachShopeePostingProductBySearch(productName)) {
          return
        }
        throw IllegalStateException("เลือกสินค้าจากลิงก์ไม่สำเร็จ")
      }
      sleepStep(1800L)
      logShopeePostStep("แนบสินค้าด้วยลิงก์แล้ว")
      return
    }

    sleepStep(700L)
    dismissShopeeKeyboardIfVisible("ก่อนยืนยันเพิ่มสินค้า")

    if (!tapShopeeProductFinalAddButton(productName)) {
      if (attachShopeePostingProductBySearch(productName)) {
        return
      }
      throw IllegalStateException("กดยืนยันเพิ่มสินค้าไม่สำเร็จ")
    }
    sleepStep(1800L)
    logShopeePostStep("แนบสินค้าด้วยลิงก์แล้ว")
    return
  }

  if (attachShopeePostingProductBySearch(productName)) {
    return
  }

  throw IllegalStateException("แนบสินค้าด้วยชื่อสินค้าไม่สำเร็จ")
}

internal fun KubdeeAccessibilityService.settleShopeePostingSurfaceAfterProductAttach() {
  logShopeePostStep("รอหน้าโพสต์นิ่งหลังเพิ่มสินค้า ก่อนตั้งค่า toggle")
  sleepStep(2500L)
  clearShopeePostingCaptionFocusBeforeToggles()
  logShopeePostingVisualToggleSummary("ก่อนตั้งค่า toggle")
  sleepStep(700L)
}

internal fun KubdeeAccessibilityService.clearShopeePostingCaptionFocusBeforeToggles() {
  dismissShopeeKeyboardIfVisible("ก่อนตั้งค่า toggle")

  val root = rootInActiveWindow
  val edit = findEditableNode(root, TARGET_PACKAGE_SHOPEE)
  if (edit != null) {
    val bounds = Rect()
    edit.getBoundsInScreen(bounds)
    val cleared = edit.performAction(AccessibilityNodeInfo.ACTION_CLEAR_FOCUS)
    logShopeePostStep(
      "ออกจากช่องแคปชั่นก่อนตั้งค่า toggle " +
        "(clearFocus=${if (cleared) "yes" else "no"}, focus=${if (edit.isFocused) "yes" else "no"}, " +
        "bounds=${bounds.left},${bounds.top}-${bounds.right},${bounds.bottom})"
    )
    sleepStep(500L)
  } else {
    logShopeePostStep("ไม่พบช่องแคปชั่นที่ต้อง clear focus ก่อนตั้งค่า toggle")
  }

  if (tapShopeePostingNeutralArea()) {
    logShopeePostStep("แตะพื้นที่ว่างหน้าโพสต์เพื่อปิด focus แคปชั่นแล้ว")
  } else {
    logShopeePostStep("แตะพื้นที่ว่างหน้าโพสต์ไม่สำเร็จ จะตั้งค่า toggle ต่อ")
  }
  sleepStep(900L)
}

internal fun KubdeeAccessibilityService.tapShopeePostingNeutralArea(): Boolean {
  val root = rootInActiveWindow ?: return false
  val screen = screenBounds(root)
  val textNodes = mutableListOf<TextNode>()
  collectTextNodes(root, textNodes, allowedPackageName = TARGET_PACKAGE_SHOPEE)

  val firstToggleLabel = textNodes
    .filter { node ->
      node.node.isVisibleToUser &&
        (
          node.text.contains("อนุญาต", ignoreCase = true) ||
            node.text.contains("นำเนื้อหา", ignoreCase = true) ||
            node.text.contains("เผยแพร่ต่อ", ignoreCase = true) ||
            node.text.contains("Duet", ignoreCase = true)
          ) &&
        node.bounds.top >= screen.top + (screen.height() * 0.35f).toInt()
    }
    .minByOrNull { it.bounds.top }

  val tapX = screen.left + (screen.width() * 0.42f)
  val preferredY = firstToggleLabel?.let { it.bounds.top - dp(36) }
    ?: (screen.top + (screen.height() * 0.49f).toInt())
  val tapY = preferredY.coerceIn(
    screen.top + statusBarHeightPx() + dp(160),
    screen.bottom - dp(360)
  )

  logShopeePostStep(
    "แตะพื้นที่ว่างก่อน toggle ที่ ${tapX.toInt()},$tapY" +
      (firstToggleLabel?.let { " อ้างอิง label '${it.text.take(24)}'" } ?: "")
  )
  return tapBlockingWithoutStopButton(
    tapX,
    tapY.toFloat(),
    timeoutMs = 1800L,
    durationMs = 80L
  )
}

internal fun KubdeeAccessibilityService.logShopeePostingVisualToggleSummary(reason: String) {
  val toggles = detectShopeePostingVisualToggles()
  if (toggles.isEmpty()) {
    logShopeePostStep("สถานะ toggle ($reason): ตรวจจากภาพไม่พบ toggle")
    return
  }
  val summary = toggles
    .take(4)
    .mapIndexed { index, target ->
      "${index + 1}:${target.state.name.lowercase(Locale.ROOT)}@${target.bounds.centerX()},${target.bounds.centerY()}"
    }
    .joinToString(" ")
  logShopeePostStep("สถานะ toggle ($reason): พบ ${toggles.size} อัน $summary")
}

internal fun KubdeeAccessibilityService.attachShopeePostingProductBySearch(productName: String): Boolean {
  if (productName.isBlank()) return false

  logShopeePostStep("ลองแนบสินค้าด้วยการค้นหาชื่อสินค้า")
  dismissShopeeKeyboardIfVisible("ก่อนค้นหาสินค้า")
  if (!isShopeeAddProductPickerScreen()) {
    if (!tapShopeeAddProductButton()) {
      logShopeePostStep("กลับไปหน้าเพิ่มสินค้าเพื่อค้นหาไม่ได้")
      return false
    }
    sleepStep(1600L)
  }

  selectShopeeProductSearchScope()

  clickByAnyText(
    listOf("กดถูกใจ", "ถูกใจ", "Liked", "ค้นหา", "Search"),
    exact = false,
    allowedPackageName = TARGET_PACKAGE_SHOPEE
  )
  sleepStep(800L)

  for (query in shopeeProductSearchQueries(productName)) {
    val edit = findEditableNode(rootInActiveWindow, TARGET_PACKAGE_SHOPEE)
      ?: run {
        logShopeePostStep("ไม่พบช่องค้นหาสินค้า")
        return false
      }
    clickNode(edit)
    sleepStep(350L)
    setNodeText(edit, query)
    pressImeEnterOn(edit)
    logShopeePostStep("ค้นหาสินค้า: ${query.take(48)}${if (query.length > 48) "..." else ""}")
    sleepStep(3500L)

    if (containsAnyText(listOf("ไม่พบผลการค้นหา", "No results"), contains = true, allowedPackageName = TARGET_PACKAGE_SHOPEE)) {
      logShopeePostStep("ไม่พบผลลัพธ์สำหรับคำค้นนี้")
      continue
    }

    if (!tapShopeeSearchResultAddButton()) {
      logShopeePostStep("ยังไม่พบปุ่มเพิ่มในผลการค้นหา")
      continue
    }

    sleepStep(1800L)
    if (
      clickByAnyText(
        listOf("เสร็จสิ้น", "เสร็จ", "Done"),
        exact = false,
        allowedPackageName = TARGET_PACKAGE_SHOPEE
      )
    ) {
      sleepStep(1600L)
    } else {
      sleepStep(1800L)
    }

    logShopeePostStep("แนบสินค้าด้วยชื่อสินค้าแล้ว")
    return true
  }

  logShopeePostStep("ค้นหาสินค้าแล้วไม่พบรายการที่เพิ่มได้")
  return false
}

internal fun KubdeeAccessibilityService.selectShopeeProductSearchScope() {
  if (
    clickByAnyText(
      listOf("Affiliate", "ทั้งหมด", "All"),
      exact = true,
      allowedPackageName = TARGET_PACKAGE_SHOPEE
    )
  ) {
    logShopeePostStep("เลือกขอบเขตค้นหาสินค้า Affiliate/ทั้งหมด")
    sleepStep(900L)
  }
}

internal fun shopeeProductSearchQueries(productName: String): List<String> {
  val cleaned = productName
    .replace(Regex("""^\s*\d+\s+"""), "")
    .replace(Regex("""#\S+"""), " ")
    .replace(Regex("""\s+"""), " ")
    .trim()
  if (cleaned.isBlank()) return emptyList()

  val words = cleaned.split(Regex("""\s+""")).filter { it.isNotBlank() }
  val latinWords = Regex("""[A-Za-z0-9][A-Za-z0-9&+.\-]*""")
    .findAll(cleaned)
    .map { it.value }
    .filter { it.length >= 2 }
    .toList()

  return listOfNotNull(
    cleaned.take(80),
    words.take(5).joinToString(" ").takeIf { it.length >= 4 },
    latinWords.take(4).joinToString(" ").takeIf { it.length >= 4 },
    latinWords.take(2).joinToString(" ").takeIf { it.length >= 4 }
  ).map { it.trim() }.filter { it.isNotBlank() }.distinct()
}

internal fun KubdeeAccessibilityService.tapShopeeSearchResultAddButton(): Boolean {
  for (root in shopeeWindowRoots()) {
    val screen = screenBounds(root)
    val textNodes = mutableListOf<TextNode>()
    collectTextNodes(root, textNodes, allowedPackageName = TARGET_PACKAGE_SHOPEE)
    val addButton = textNodes
      .filter { node ->
        val text = node.text.trim()
        val lower = text.lowercase(Locale.ROOT)
        (
          text == "เพิ่ม" ||
            lower == "add" ||
            text == "เลือก" ||
            lower == "select"
          ) &&
          node.node.isVisibleToUser &&
          node.bounds.centerY() >= screen.top + statusBarHeightPx() + dp(220) &&
          node.bounds.centerY() <= screen.bottom - dp(80)
      }
      .sortedWith(compareByDescending<TextNode> { it.bounds.right }.thenBy { it.bounds.top })
      .firstOrNull()

    if (addButton != null && clickNode(addButton.node)) {
      logShopeePostStep("กดเพิ่มสินค้าจากผลการค้นหาแล้ว")
      return true
    }
  }
  return false
}

internal fun KubdeeAccessibilityService.normalizeShopeeProductUrl(value: String): String {
  val url = value.trim()
  if (url.isBlank()) return ""
  if (!url.startsWith("http://", ignoreCase = true) && !url.startsWith("https://", ignoreCase = true)) return ""
  return if (Regex("""(^https?://)?([^/]+\.)?shopee\.""", RegexOption.IGNORE_CASE).containsMatchIn(url)) url else ""
}

internal fun KubdeeAccessibilityService.dismissShopeeKeyboardIfVisible(reason: String) {
  val keyboardVisible = windows.any { window ->
    window.type == AccessibilityWindowInfo.TYPE_INPUT_METHOD
  }
  if (!keyboardVisible) return

  logShopeePostStep("ปิดคีย์บอร์ด ($reason)")
  performBack()
  sleepStep(900L)
}

internal fun KubdeeAccessibilityService.normalizeShopeePostingProductUrl(value: String): String {
  val url = normalizeShopeeProductUrl(value)
  if (url.isBlank()) return ""

  val resolvedUrl = if (url.contains("s.shopee", ignoreCase = true)) {
    val resolved = resolveShopeeUrl(url)
    if (resolved.isNotBlank() && !resolved.equals(url, ignoreCase = true)) {
      logShopeePostStep("อ่านปลายทาง short link สำเร็จ")
      resolved
    } else {
      logShopeePostStep("อ่านปลายทาง short link ไม่สำเร็จ จะใช้ลิงก์เดิม")
      url
    }
  } else {
    url
  }
  val productId = extractShopeeProductIdFromResolvedUrl(resolvedUrl)
    ?: extractShopeeProductIdFromUrl(url)
  val parts = productId?.split(":").orEmpty()
  if (parts.size == 3 && parts[1].all(Char::isDigit) && parts[2].all(Char::isDigit)) {
    logShopeePostStep("ตรวจพบรหัสสินค้า Shopee: ${parts[1]}/${parts[2]}")
  }
  return url
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
    if (waitForShopeeProductLinkEntryScreen(1800L)) {
      logShopeePostStep("เปิดกรอกลิงก์สินค้าด้วยข้อความ")
      return true
    }
    logShopeePostStep("กดข้อความลิงก์สินค้าแล้ว แต่หน้าใส่ลิงก์ยังไม่เปิด")
  }

  for (root in shopeeWindowRoots()) {
    val screen = screenBounds(root)
    val target = findShopeeProductLinkNode(root, screen)
    if (target != null) {
      val clickResult = clickShopeeHeaderLinkCandidate(screen, target)
      if (clickResult == ShopeeHeaderLinkClickResult.Opened) {
        logShopeePostStep("เปิดกรอกลิงก์สินค้าด้วย icon")
        return true
      }
      if (clickResult == ShopeeHeaderLinkClickResult.NotOpened) {
        logShopeePostStep("กด icon ลิงก์สินค้าแล้ว แต่หน้าใส่ลิงก์ยังไม่เปิด")
      } else {
        logShopeePostStep("พบ icon ลิงก์สินค้า แต่ไม่มี clickable parent ใน header")
      }
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

internal fun KubdeeAccessibilityService.waitForShopeeProductLinkEntryScreen(timeoutMs: Long): Boolean {
  val start = System.currentTimeMillis()
  while (System.currentTimeMillis() - start < timeoutMs) {
    checkStopRequested()
    if (isShopeeProductLinkEntryScreen()) return true
    Thread.sleep(180L)
  }
  return isShopeeProductLinkEntryScreen()
}

internal fun KubdeeAccessibilityService.isShopeeProductLinkEntryScreen(): Boolean {
  for (root in shopeeWindowRoots()) {
    val textNodes = mutableListOf<TextNode>()
    collectTextNodes(root, textNodes, allowedPackageName = TARGET_PACKAGE_SHOPEE)
    val hasEntryText = textNodes.any { node ->
      node.text.contains("กรอกลิงก์สินค้า") ||
        node.text.contains("รองรับเฉพาะลิงก์สินค้า") ||
        node.text.contains("Product link", ignoreCase = true)
    }
    if (hasEntryText && findEditableNode(root, TARGET_PACKAGE_SHOPEE) != null) return true
  }
  return false
}

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
  return clickNode(node)
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
        val clickResult = clickShopeeHeaderLinkCandidate(screen, linkAction.second)
        if (clickResult == ShopeeHeaderLinkClickResult.Opened) {
          successMessage = "เปิดกรอกลิงก์สินค้าด้วยไอคอนโซ่ที่ตรวจเจอ"
          break
        }
        if (clickResult == ShopeeHeaderLinkClickResult.NotOpened) {
          logShopeePostStep("กดไอคอนโซ่ที่ตรวจเจอแล้ว แต่หน้าใส่ลิงก์ยังไม่เปิด (${bounds.flattenToString()})")
        } else if (clickResult == ShopeeHeaderLinkClickResult.NoClickableNode) {
          logShopeePostStep("พบไอคอนโซ่ แต่ไม่มี clickable parent ใน header (${bounds.flattenToString()})")
        }
      }

      val headerImageAction = findShopeeTopRightHeaderImage(root, screen)
      if (headerImageAction != null) {
        val bounds = headerImageAction.first
        val clickResult = clickShopeeHeaderLinkCandidate(screen, headerImageAction.second)
        if (clickResult == ShopeeHeaderLinkClickResult.Opened) {
          successMessage = "เปิดกรอกลิงก์สินค้าด้วยไอคอนขวาบน"
          break
        }
        if (clickResult == ShopeeHeaderLinkClickResult.NotOpened) {
          logShopeePostStep("กดไอคอนขวาบนแล้ว แต่หน้าใส่ลิงก์ยังไม่เปิด (${bounds.flattenToString()})")
        } else if (clickResult == ShopeeHeaderLinkClickResult.NoClickableNode) {
          logShopeePostStep("พบไอคอนขวาบน แต่ไม่มี clickable parent ใน header (${bounds.flattenToString()})")
        }
      }

      if (tapShopeeProductLinkHeaderIconByTitleAnchor(root, screen)) {
        successMessage = "เปิดกรอกลิงก์สินค้าด้วยตำแหน่งไอคอนบน header"
        break
      }
    }
  } finally {
    sleepStep(180L)
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

internal fun KubdeeAccessibilityService.tapShopeeProductLinkHeaderIconByTitleAnchor(
  root: AccessibilityNodeInfo,
  screen: Rect
): Boolean {
  val textNodes = mutableListOf<TextNode>()
  collectTextNodes(root, textNodes, allowedPackageName = TARGET_PACKAGE_SHOPEE)
  val title = textNodes
    .filter { node ->
      (
        node.text == "เพิ่มสินค้า" ||
          node.text.equals("Add product", ignoreCase = true)
        ) &&
        node.bounds.top <= screen.top + statusBarHeightPx() + dp(72)
    }
    .minByOrNull { it.bounds.top }
    ?: return false

  val headerHeight = title.bounds.height().coerceIn(dp(32), dp(64))
  val tapX = screen.right - (headerHeight * 1.25f)
  val tapY = title.bounds.centerY().toFloat()
  logShopeePostStep("ไม่พบ node ไอคอนโซ่ ใช้ header anchor จาก '${title.text}'")

  if (!tapBlockingWithoutStopButton(tapX, tapY, timeoutMs = 1800L, durationMs = 80L)) {
    return false
  }
  return if (waitForShopeeProductLinkEntryScreen(2500L)) {
    true
  } else {
    logShopeePostStep("แตะไอคอนโซ่จาก header anchor แล้ว แต่หน้าใส่ลิงก์ยังไม่เปิด")
    false
  }
}

internal enum class ShopeeHeaderLinkClickResult {
  NoClickableNode,
  NotOpened,
  Opened
}

internal fun KubdeeAccessibilityService.clickShopeeHeaderLinkCandidate(
  screen: Rect,
  node: AccessibilityNodeInfo
): ShopeeHeaderLinkClickResult {
  val clickable = findShopeeHeaderClickableNode(node, screen) ?: return ShopeeHeaderLinkClickResult.NoClickableNode
  val clicked = clickable.performAction(AccessibilityNodeInfo.ACTION_CLICK)
  if (!clicked) return ShopeeHeaderLinkClickResult.NoClickableNode
  return if (waitForShopeeProductLinkEntryScreen(2500L)) {
    ShopeeHeaderLinkClickResult.Opened
  } else {
    ShopeeHeaderLinkClickResult.NotOpened
  }
}

internal fun KubdeeAccessibilityService.findShopeeHeaderClickableNode(
  node: AccessibilityNodeInfo?,
  screen: Rect
): AccessibilityNodeInfo? {
  var current = node
  val headerTop = screen.top + statusBarHeightPx() - dp(8)
  val headerBottom = screen.top + statusBarHeightPx() + dp(96)
  while (current != null) {
    val bounds = Rect()
    current.getBoundsInScreen(bounds)
    val isHeaderSized =
      bounds.width() > 0 &&
        bounds.height() > 0 &&
        bounds.centerY() in headerTop..headerBottom &&
        bounds.centerX() >= screen.left + (screen.width() * 0.50f).toInt() &&
        bounds.width() <= (screen.width() * 0.45f).toInt() &&
        bounds.height() <= dp(120)
    if (current.isClickable && isAllowedPackageNode(current, TARGET_PACKAGE_SHOPEE) && isHeaderSized) {
      return current
    }
    current = current.parent
  }
  return null
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
      (
        className.contains("imageview") ||
          className.contains("button") ||
          className.endsWith("view") ||
          className.contains("textview")
        ) &&
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
      listOf("นำเข้า", "Import", "เพิ่ม", "Add", "ตกลง", "OK", "ยืนยัน", "Confirm"),
      exact = true,
      allowedPackageName = TARGET_PACKAGE_SHOPEE
    )
  ) {
    logShopeePostStep("กดนำเข้าลิงก์สินค้าแล้ว")
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
      logShopeePostStep("กดนำเข้าลิงก์สินค้าด้วยปุ่มล่าง")
      return true
    }
  }
  return false
}

internal fun KubdeeAccessibilityService.tapShopeeProductSelectAll(): Boolean {
  val start = System.currentTimeMillis()
  while (System.currentTimeMillis() - start < 12_000L) {
    checkStopRequested()
    if (isShopeeProductLinkEntryScreen() && !hasShopeeProductLinkImportResult()) {
      sleepStep(500L)
      continue
    }

    for (root in shopeeWindowRoots()) {
      val screen = screenBounds(root)
      val textNodes = mutableListOf<TextNode>()
      collectTextNodes(root, textNodes, allowedPackageName = TARGET_PACKAGE_SHOPEE)
      val selectAll = textNodes
        .filter { node ->
          (
            node.text.contains("เลือกทั้งหมด") ||
              node.text.contains("Select all", ignoreCase = true)
            ) &&
            node.node.isVisibleToUser &&
            node.bounds.width() > 0 &&
            node.bounds.height() > 0 &&
            node.bounds.centerY() >= screen.top + statusBarHeightPx() + dp(72)
        }
        .minByOrNull { it.bounds.top }

      if (selectAll != null) {
        val tapX = (selectAll.bounds.left - dp(38)).coerceAtLeast(screen.left + dp(32))
        val tapY = selectAll.bounds.centerY()
        if (tapBlockingWithoutStopButton(tapX.toFloat(), tapY.toFloat(), timeoutMs = 1800L, durationMs = 80L)) {
          sleepStep(700L)
          logShopeePostStep("เลือกสินค้าทั้งหมดจากลิงก์ด้วย checkbox แล้ว")
          return true
        }
        if (clickNode(selectAll.node)) {
          sleepStep(700L)
          logShopeePostStep("เลือกสินค้าทั้งหมดจากลิงก์แล้ว")
          return true
        }
      }
    }
    sleepStep(500L)
  }

  logShopeePostStep("ไม่พบปุ่มเลือกทั้งหมดหลังเพิ่มลิงก์สินค้า")
  return false
}

internal fun KubdeeAccessibilityService.waitForShopeeProductLinkResult(timeoutMs: Long): Boolean {
  val start = System.currentTimeMillis()
  var loggedEntryWait = false
  var lastProgressLogAt = 0L
  while (System.currentTimeMillis() - start < timeoutMs) {
    checkStopRequested()

    if (hasShopeeProductLinkImportResult()) {
      logShopeePostStep("รายการสินค้าจากลิงก์พร้อมในหน้าเดิมแล้ว")
      return true
    }

    if (isShopeeProductLinkEntryScreen() && !loggedEntryWait) {
      logShopeePostStep("ยังอยู่หน้าใส่ลิงก์สินค้า รอรายการสินค้าขึ้นในหน้าเดิม")
      loggedEntryWait = true
    }

    if (
      containsAnyText(
        listOf("ไม่พบ", "ไม่รองรับ", "ไม่ถูกต้อง", "Invalid", "not found", "unsupported"),
        contains = true,
        allowedPackageName = TARGET_PACKAGE_SHOPEE
      )
    ) {
      logShopeePostStep("Shopee แจ้งว่าไม่พบ/ไม่รองรับลิงก์สินค้า")
      return false
    }

    val now = System.currentTimeMillis()
    if (now - lastProgressLogAt >= 5_000L) {
      val elapsed = ((now - start) / 1000L).coerceAtLeast(0L)
      logShopeePostStep("รอ Shopee นำเข้าสินค้าจากลิงก์... ${elapsed}s/${timeoutMs / 1000L}s")
      lastProgressLogAt = now
    }
    sleepStep(700L)
  }
  return false
}

internal fun KubdeeAccessibilityService.hasShopeeProductLinkImportResult(): Boolean {
  for (root in shopeeWindowRoots()) {
    val screen = screenBounds(root)
    val textNodes = mutableListOf<TextNode>()
    collectTextNodes(root, textNodes, allowedPackageName = TARGET_PACKAGE_SHOPEE)
    val hasImportLoading = textNodes.any { node ->
      val text = node.text.trim()
      (
        text.contains("กำลังนำเข้า") ||
          text.contains("กำลังโหลด") ||
          text.contains("Loading", ignoreCase = true) ||
          text.contains("Importing", ignoreCase = true)
        ) &&
        node.node.isVisibleToUser
    }
    if (hasImportLoading) return false

    val hasSelectAll = textNodes.any { node ->
      (
        node.text.contains("เลือกทั้งหมด") ||
          node.text.contains("Select all", ignoreCase = true)
        ) &&
        node.node.isVisibleToUser &&
        node.bounds.centerY() >= screen.top + statusBarHeightPx() + dp(72)
    }
    val hasBottomConfirm = textNodes.any { node ->
      val text = node.text.trim()
      val lower = text.lowercase(Locale.ROOT)
      val looksLikeConfirm =
        text.contains("เพิ่ม") ||
          lower.contains("add") ||
          text.contains("เลือก") ||
          lower.contains("select") ||
          text.contains("เสร็จ") ||
          lower.contains("done")
      looksLikeConfirm &&
        node.node.isVisibleToUser &&
        node.bounds.centerY() >= screen.bottom - dp(190) &&
        node.bounds.centerY() <= screen.bottom - dp(24) &&
        node.bounds.centerX() >= screen.left + (screen.width() * 0.35f).toInt()
    }

    if (hasSelectAll && hasBottomConfirm) return true
  }
  return false
}

internal fun KubdeeAccessibilityService.tapShopeeProductFinalAddButton(productName: String = ""): Boolean {
  val start = System.currentTimeMillis()
  var lastLogAt = 0L
  while (System.currentTimeMillis() - start < 12_000L) {
    checkStopRequested()
    if (tapShopeeProductFinalAddButtonOnce(productName)) return true

    val now = System.currentTimeMillis()
    if (now - lastLogAt >= 4_000L) {
      logShopeePostStep("รอปุ่มเพิ่มสินค้าหลังเลือกทั้งหมด...")
      lastLogAt = now
    }
    sleepStep(700L)
  }
  return false
}

internal fun KubdeeAccessibilityService.tapShopeeProductFinalAddButtonOnce(productName: String = ""): Boolean {
  if (isShopeeProductLinkEntryScreen() && !hasShopeeProductLinkImportResult()) return false

  for (root in shopeeWindowRoots()) {
    val screen = screenBounds(root)
    val textNodes = mutableListOf<TextNode>()
    collectTextNodes(root, textNodes, allowedPackageName = TARGET_PACKAGE_SHOPEE)
    val bottomAction = textNodes
      .filter { node ->
        val text = node.text.trim()
        val lower = text.lowercase(Locale.ROOT)
        val looksLikeConfirm =
          text.contains("เพิ่ม") ||
            lower.contains("add") ||
            text.contains("เลือก") ||
            lower.contains("select") ||
            text.contains("เสร็จ") ||
            lower.contains("done")
        looksLikeConfirm &&
          node.bounds.width() > 0 &&
          node.bounds.height() > 0 &&
          node.bounds.centerY() >= screen.bottom - dp(190) &&
          node.bounds.centerY() <= screen.bottom - dp(24) &&
          node.bounds.centerX() >= screen.left + (screen.width() * 0.35f).toInt()
      }
      .maxByOrNull { it.bounds.centerX() }

    if (bottomAction != null) {
      if (tapBlockingWithoutStopButton(
          bottomAction.bounds.centerX().toFloat(),
          bottomAction.bounds.centerY().toFloat(),
          timeoutMs = 1800L,
          durationMs = 80L
        )
      ) {
        logShopeePostStep("กดยืนยันเพิ่มสินค้าจากปุ่มล่างแล้ว")
        return true
      }
    }
  }

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
  val shortProductName = productName.take(24).takeIf { it.length >= 8 }
  if (
    containsAnyText(
      listOfNotNull("รายการสินค้า", "เลือกทั้งหมด", "No products", "ไม่มีสินค้า", shortProductName),
      contains = true,
      allowedPackageName = TARGET_PACKAGE_SHOPEE
    )
  ) {
    val x = screen.left + screen.width() * 0.65f
    val y = screen.bottom - dp(68).toFloat()
    if (tapBlockingWithoutStopButton(x, y, timeoutMs = 1800L, durationMs = 80L)) {
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
      if (setShopeePostingVisualToggleBySlot(
          slot = ShopeePostingToggleSlot.ReusePermission,
          desiredOn = false,
          logName = "reuse/เผยแพร่ต่อ"
        )
      ) {
        return
      }
      logShopeePostStep("ไม่พบ toggle reuse/เผยแพร่ต่อ ข้ามขั้นตอนนี้")
      return
    }

    if (!target.node.isCheckable) {
      if (setShopeePostingVisualToggleBySlot(
          slot = ShopeePostingToggleSlot.ReusePermission,
          desiredOn = false,
          logName = "reuse/เผยแพร่ต่อ"
        )
      ) {
        return
      }
      logShopeePostStep("toggle reuse/เผยแพร่ต่อไม่มีสถานะชัดเจน ข้ามเพื่อไม่พลิกค่าผิด")
      return
    }

    if (!target.node.isChecked) {
      logShopeePostStep("reuse/เผยแพร่ต่อปิดอยู่แล้ว")
      return
    }

    if (!clickShopeeToggleTarget(target, desiredOn = false)) {
      logShopeePostStep("กด toggle reuse/เผยแพร่ต่อไม่สำเร็จ ข้ามขั้นตอนนี้")
      return
    }
    sleepStep(800L)
    if (verifyShopeePostingToggleState(ShopeePostingToggleSlot.ReusePermission, desiredOn = false, logName = "reuse/เผยแพร่ต่อ")) {
      logShopeePostStep("ปิด reuse/เผยแพร่ต่อสำเร็จ")
    } else {
      logShopeePostStep("กดปิด reuse/เผยแพร่ต่อแล้ว แต่ยืนยันสถานะไม่ได้")
    }
  } catch (error: Exception) {
    logShopeePostStep("ปิด reuse/เผยแพร่ต่อไม่สำเร็จ: ${error.message ?: "unknown"}")
  }
}

internal fun KubdeeAccessibilityService.disableShopeeContentReusePermissionStrict() {
  logShopeePostStep("ปิดการอนุญาต reuse/เผยแพร่ต่อ")
  val target = findShopeeContentReuseToggleTarget()
  if (target == null) {
    if (setShopeePostingVisualToggleBySlot(
        slot = ShopeePostingToggleSlot.ReusePermission,
        desiredOn = false,
        logName = "reuse/เผยแพร่ต่อ"
      )
    ) {
      return
    }
    if (tapShopeePostingToggleByLabel(
        listOf("นำเนื้อหาไปใช้ซ้ำ", "เผยแพร่ต่อ", "Duet", "ตัดต่อ", "sticker"),
        "reuse/เผยแพร่ต่อ",
        desiredOn = false
      )
    ) {
      sleepStep(900L)
      if (!verifyShopeePostingToggleState(ShopeePostingToggleSlot.ReusePermission, desiredOn = false, logName = "reuse/เผยแพร่ต่อ")) {
        throw IllegalStateException("กดปิด reuse/เผยแพร่ต่อแล้ว แต่ยืนยันสถานะไม่ได้")
      }
      logShopeePostStep("ปิด reuse/เผยแพร่ต่อสำเร็จ")
      return
    }
    throw IllegalStateException("ไม่พบ toggle reuse/เผยแพร่ต่อ")
  }

  if (!target.node.isCheckable) {
    if (setShopeePostingVisualToggleBySlot(
        slot = ShopeePostingToggleSlot.ReusePermission,
        desiredOn = false,
        logName = "reuse/เผยแพร่ต่อ"
      )
    ) {
      return
    }
    if (tapShopeePostingToggleByLabel(
        listOf("นำเนื้อหาไปใช้ซ้ำ", "เผยแพร่ต่อ", "Duet", "ตัดต่อ", "sticker"),
        "reuse/เผยแพร่ต่อ",
        desiredOn = false
      )
    ) {
      sleepStep(900L)
      if (!verifyShopeePostingToggleState(ShopeePostingToggleSlot.ReusePermission, desiredOn = false, logName = "reuse/เผยแพร่ต่อ")) {
        throw IllegalStateException("กดปิด reuse/เผยแพร่ต่อแล้ว แต่ยืนยันสถานะไม่ได้")
      }
      logShopeePostStep("ปิด reuse/เผยแพร่ต่อสำเร็จ")
      return
    }
    throw IllegalStateException("toggle reuse/เผยแพร่ต่อไม่มีสถานะชัดเจน")
  }

  if (!target.node.isChecked) {
    logShopeePostStep("reuse/เผยแพร่ต่อปิดอยู่แล้ว")
    return
  }

  if (!clickShopeeToggleTarget(target, desiredOn = false)) {
    throw IllegalStateException("กด toggle reuse/เผยแพร่ต่อไม่สำเร็จ")
  }
  sleepStep(800L)
  if (!verifyShopeePostingToggleState(ShopeePostingToggleSlot.ReusePermission, desiredOn = false, logName = "reuse/เผยแพร่ต่อ")) {
    throw IllegalStateException("กดปิด reuse/เผยแพร่ต่อแล้ว แต่ยืนยันสถานะไม่ได้")
  }
  logShopeePostStep("ปิด reuse/เผยแพร่ต่อสำเร็จ")
}

internal fun KubdeeAccessibilityService.enableShopeeAiGeneratedLabelBestEffort() {
  try {
    logShopeePostStep("เปิดป้ายกำกับ AI")
    val target = findShopeeAiGeneratedLabelToggleTarget()
    if (target == null) {
      if (setShopeePostingVisualToggleBySlot(
          slot = ShopeePostingToggleSlot.AiGeneratedLabel,
          desiredOn = true,
          logName = "ป้ายกำกับ AI"
        )
      ) {
        return
      }
      logShopeePostStep("ไม่พบ toggle ป้ายกำกับ AI ข้ามขั้นตอนนี้")
      return
    }

    if (!target.node.isCheckable) {
      if (setShopeePostingVisualToggleBySlot(
          slot = ShopeePostingToggleSlot.AiGeneratedLabel,
          desiredOn = true,
          logName = "ป้ายกำกับ AI"
        )
      ) {
        return
      }
      logShopeePostStep("toggle ป้ายกำกับ AI ไม่มีสถานะชัดเจน ข้ามเพื่อไม่พลิกค่าผิด")
      return
    }

    if (target.node.isChecked) {
      logShopeePostStep("ป้ายกำกับ AI เปิดอยู่แล้ว")
      return
    }

    if (!clickShopeeToggleTarget(target, desiredOn = true)) {
      logShopeePostStep("กด toggle ป้ายกำกับ AI ไม่สำเร็จ ข้ามขั้นตอนนี้")
      return
    }
    sleepStep(800L)
    if (verifyShopeePostingToggleState(ShopeePostingToggleSlot.AiGeneratedLabel, desiredOn = true, logName = "ป้ายกำกับ AI")) {
      logShopeePostStep("เปิดป้ายกำกับ AI สำเร็จ")
    } else {
      logShopeePostStep("กดเปิดป้ายกำกับ AI แล้ว แต่ยืนยันสถานะไม่ได้")
    }
  } catch (error: Exception) {
    logShopeePostStep("เปิดป้ายกำกับ AI ไม่สำเร็จ: ${error.message ?: "unknown"}")
  }
}

internal fun KubdeeAccessibilityService.enableShopeeAiGeneratedLabelStrict() {
  logShopeePostStep("เปิดป้ายกำกับ AI")
  if (setShopeePostingVisualToggleBySlot(
      slot = ShopeePostingToggleSlot.AiGeneratedLabel,
      desiredOn = true,
      logName = "ป้ายกำกับ AI"
    )
  ) {
    return
  }

  val target = findShopeeAiGeneratedLabelToggleTarget()
  if (target == null) {
    if (tapShopeePostingToggleByLabel(
        listOf("ป้ายกำกับ AI", "เนื้อหาที่สร้างโดย AI", "สร้างโดย AI", "AI"),
        "ป้ายกำกับ AI",
        desiredOn = true
      )
    ) {
      sleepStep(900L)
      if (!verifyShopeePostingToggleState(ShopeePostingToggleSlot.AiGeneratedLabel, desiredOn = true, logName = "ป้ายกำกับ AI")) {
        throw IllegalStateException("กดเปิดป้ายกำกับ AI แล้ว แต่ยืนยันสถานะไม่ได้")
      }
      logShopeePostStep("เปิดป้ายกำกับ AI สำเร็จ")
      return
    }
    throw IllegalStateException("ไม่พบ toggle ป้ายกำกับ AI")
  }

  if (!target.node.isCheckable) {
    if (tapShopeePostingToggleByLabel(
        listOf("ป้ายกำกับ AI", "เนื้อหาที่สร้างโดย AI", "สร้างโดย AI", "AI"),
        "ป้ายกำกับ AI",
        desiredOn = true
      )
    ) {
      sleepStep(900L)
      if (!verifyShopeePostingToggleState(ShopeePostingToggleSlot.AiGeneratedLabel, desiredOn = true, logName = "ป้ายกำกับ AI")) {
        throw IllegalStateException("กดเปิดป้ายกำกับ AI แล้ว แต่ยืนยันสถานะไม่ได้")
      }
      logShopeePostStep("เปิดป้ายกำกับ AI สำเร็จ")
      return
    }
    throw IllegalStateException("toggle ป้ายกำกับ AI ไม่มีสถานะชัดเจน")
  }

  if (target.node.isChecked) {
    logShopeePostStep("ป้ายกำกับ AI เปิดอยู่แล้ว")
    return
  }

  if (!clickShopeeToggleTarget(target, desiredOn = true)) {
    throw IllegalStateException("กด toggle ป้ายกำกับ AI ไม่สำเร็จ")
  }
  sleepStep(800L)
  if (!verifyShopeePostingToggleState(ShopeePostingToggleSlot.AiGeneratedLabel, desiredOn = true, logName = "ป้ายกำกับ AI")) {
    throw IllegalStateException("กดเปิดป้ายกำกับ AI แล้ว แต่ยืนยันสถานะไม่ได้")
  }
  logShopeePostStep("เปิดป้ายกำกับ AI สำเร็จ")
}

internal enum class ShopeePostingToggleSlot {
  ReusePermission,
  SaveToPhone,
  AiGeneratedLabel
}

internal enum class ShopeeVisualToggleState {
  On,
  Off,
  Unknown
}

internal data class ShopeeVisualToggleTarget(
  val bounds: Rect,
  val state: ShopeeVisualToggleState,
  val greenPixels: Int,
  val greyPixels: Int
)

internal fun KubdeeAccessibilityService.shopeePostingToggleTapX(bounds: Rect, desiredOn: Boolean? = null): Float {
  val safeLeft = bounds.left + 1
  val safeRight = maxOf(safeLeft, bounds.right - 1)
  val tapX = when (desiredOn) {
    true -> bounds.right - dp(8)
    false -> bounds.left + dp(8)
    null -> bounds.centerX()
  }
  return tapX.coerceIn(safeLeft, safeRight).toFloat()
}

internal fun KubdeeAccessibilityService.shopeePostingToggleFallbackTapX(screen: Rect, desiredOn: Boolean?): Float {
  val tapX = when (desiredOn) {
    true -> screen.right - dp(48)
    false -> screen.right - dp(96)
    null -> screen.right - dp(72)
  }
  return tapX.coerceIn(screen.left + 1, screen.right - 1).toFloat()
}

internal fun shopeePostingToggleDirectionLabel(desiredOn: Boolean): String {
  return if (desiredOn) "ฝั่งขวา/เปิด" else "ฝั่งซ้าย/ปิด"
}

internal fun KubdeeAccessibilityService.setShopeePostingVisualToggleBySlot(
  slot: ShopeePostingToggleSlot,
  desiredOn: Boolean,
  logName: String
): Boolean {
  val toggles = detectShopeePostingVisualToggles()
  if (toggles.isEmpty()) {
    logShopeePostStep("หา toggle $logName จากภาพหน้าจอไม่เจอ")
    return false
  }

  val target = shopeePostingVisualToggleForSlot(toggles, slot)
  if (target == null) {
    logShopeePostStep("หา toggle $logName จากภาพไม่ครบ: พบ ${toggles.size} อัน")
    return false
  }

  val expected = if (desiredOn) ShopeeVisualToggleState.On else ShopeeVisualToggleState.Off
  logShopeePostStep(
    "ตรวจ toggle $logName จากภาพ: ${target.state.name.lowercase(Locale.ROOT)} " +
      "ที่ ${target.bounds.centerX()},${target.bounds.centerY()} (พบ ${toggles.size} อัน)"
  )
  if (target.state == expected) {
    logShopeePostStep("$logName อยู่สถานะที่ต้องการแล้ว")
    return true
  }
  if (target.state == ShopeeVisualToggleState.Unknown) {
    logShopeePostStep("สถานะ toggle $logName จากภาพไม่ชัด จะลองกดตามตำแหน่งสวิตช์")
  }

  val tapX = shopeePostingToggleTapX(target.bounds, desiredOn)
  logShopeePostStep(
    "แตะ toggle $logName จากภาพ ${shopeePostingToggleDirectionLabel(desiredOn)} " +
      "ที่ ${tapX.toInt()},${target.bounds.centerY()}"
  )
  if (!tapBlockingWithoutStopButton(
      tapX,
      target.bounds.centerY().toFloat(),
      timeoutMs = 1800L,
      durationMs = 80L
    )
  ) {
    logShopeePostStep("กด toggle $logName จากภาพไม่สำเร็จ")
    return false
  }

  sleepStep(900L)
  if (!verifyShopeePostingToggleState(slot, desiredOn, logName)) {
    throw IllegalStateException("กด${if (desiredOn) "เปิด" else "ปิด"} $logName จากภาพแล้ว แต่ยืนยันสถานะไม่ได้")
  }
  logShopeePostStep("${if (desiredOn) "เปิด" else "ปิด"} $logName จากภาพหน้าจอสำเร็จ")
  return true
}

internal fun shopeePostingVisualToggleForSlot(
  toggles: List<ShopeeVisualToggleTarget>,
  slot: ShopeePostingToggleSlot
): ShopeeVisualToggleTarget? {
  if (toggles.isEmpty()) return null
  val slotIndex = when (slot) {
    ShopeePostingToggleSlot.ReusePermission -> 0
    ShopeePostingToggleSlot.SaveToPhone -> 1
    ShopeePostingToggleSlot.AiGeneratedLabel -> if (toggles.size >= 3) 2 else toggles.lastIndex
  }
  return toggles.getOrNull(slotIndex)
}

internal fun KubdeeAccessibilityService.verifyShopeePostingToggleState(
  slot: ShopeePostingToggleSlot,
  desiredOn: Boolean,
  logName: String,
  timeoutMs: Long = 4_000L
): Boolean {
  val expected = if (desiredOn) ShopeeVisualToggleState.On else ShopeeVisualToggleState.Off
  val deadline = System.currentTimeMillis() + timeoutMs
  var lastState = ShopeeVisualToggleState.Unknown
  var lastCount = 0

  while (System.currentTimeMillis() <= deadline) {
    val toggles = detectShopeePostingVisualToggles()
    lastCount = toggles.size
    val target = shopeePostingVisualToggleForSlot(toggles, slot)
    if (target != null) {
      lastState = target.state
      logShopeePostStep(
        "ยืนยัน toggle $logName: ${target.state.name.lowercase(Locale.ROOT)} " +
          "ที่ ${target.bounds.centerX()},${target.bounds.centerY()} (พบ ${toggles.size} อัน)"
      )
      if (target.state == expected) return true
    }

    val nodeChecked = readShopeePostingNodeToggleState(slot)
    if (nodeChecked == desiredOn) {
      logShopeePostStep("ยืนยัน toggle $logName จาก node แล้ว")
      return true
    }

    sleepStep(450L)
  }

  logShopeePostStep(
    "ยืนยัน toggle $logName ไม่ผ่าน: ต้องการ ${expected.name.lowercase(Locale.ROOT)} " +
      "แต่ล่าสุด ${lastState.name.lowercase(Locale.ROOT)} (พบ $lastCount อัน)"
  )
  return false
}

internal fun KubdeeAccessibilityService.readShopeePostingNodeToggleState(slot: ShopeePostingToggleSlot): Boolean? {
  val target = when (slot) {
    ShopeePostingToggleSlot.ReusePermission -> findShopeeContentReuseToggleTarget()
    ShopeePostingToggleSlot.AiGeneratedLabel -> findShopeeAiGeneratedLabelToggleTarget()
    ShopeePostingToggleSlot.SaveToPhone -> null
  } ?: return null
  return if (target.node.isCheckable) target.node.isChecked else null
}

internal fun KubdeeAccessibilityService.detectShopeePostingVisualToggles(): List<ShopeeVisualToggleTarget> {
  val bitmap = captureScreenBitmapBlocking() ?: return emptyList()
  return try {
    scanShopeePostingVisualToggles(bitmap)
  } finally {
    bitmap.recycle()
  }
}

internal fun KubdeeAccessibilityService.captureScreenBitmapBlocking(): Bitmap? {
  if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
    logShopeePostStep("เครื่อง Android ต่ำกว่า 11 อ่านภาพหน้าจอเพื่อหา toggle ไม่ได้")
    return null
  }

  val latch = CountDownLatch(1)
  var bitmap: Bitmap? = null
  var failureCode: Int? = null
  try {
    takeScreenshot(
      Display.DEFAULT_DISPLAY,
      { runnable -> Handler(Looper.getMainLooper()).post(runnable) },
      object : AccessibilityService.TakeScreenshotCallback {
        override fun onSuccess(screenshot: AccessibilityService.ScreenshotResult) {
          try {
            val wrapped = Bitmap.wrapHardwareBuffer(screenshot.hardwareBuffer, screenshot.colorSpace)
            bitmap = wrapped?.copy(Bitmap.Config.ARGB_8888, false)
            screenshot.hardwareBuffer.close()
          } catch (error: Exception) {
            Log.w("KubdeeAccessibility", "Screenshot wrap failed", error)
          } finally {
            latch.countDown()
          }
        }

        override fun onFailure(errorCode: Int) {
          failureCode = errorCode
          latch.countDown()
        }
      }
    )
  } catch (error: Exception) {
    logShopeePostStep("อ่านภาพหน้าจอเพื่อหา toggle ไม่สำเร็จ: ${error.message ?: "unknown"}")
    return null
  }

  if (!latch.await(1800L, TimeUnit.MILLISECONDS)) {
    logShopeePostStep("อ่านภาพหน้าจอเพื่อหา toggle หมดเวลา")
    return null
  }
  if (failureCode != null) {
    logShopeePostStep("อ่านภาพหน้าจอเพื่อหา toggle ล้มเหลว code=$failureCode")
  }
  return bitmap
}

internal fun scanShopeePostingVisualToggles(bitmap: Bitmap): List<ShopeeVisualToggleTarget> {
  val width = bitmap.width
  val height = bitmap.height
  if (width <= 0 || height <= 0) return emptyList()

  val xStart = (width * 0.78f).toInt().coerceIn(0, width - 1)
  val xEnd = (width * 0.98f).toInt().coerceIn(xStart + 1, width)
  val yStart = 0
  val yEnd = height
  val rowCounts = IntArray(yEnd - yStart)

  for (y in yStart until yEnd) {
    var count = 0
    var x = xStart
    while (x < xEnd) {
      val color = bitmap.getPixel(x, y)
      if (isShopeeSwitchPixel(color)) count += 1
      x += 2
    }
    rowCounts[y - yStart] = count
  }

  val minRowPixels = maxOf(10, ((xEnd - xStart) * 0.10f).toInt())
  val segments = mutableListOf<IntRange>()
  var segmentStart = -1
  for (index in rowCounts.indices) {
    if (rowCounts[index] >= minRowPixels) {
      if (segmentStart < 0) segmentStart = index
    } else if (segmentStart >= 0) {
      if (index - segmentStart >= 12) segments.add(segmentStart until index)
      segmentStart = -1
    }
  }
  if (segmentStart >= 0 && rowCounts.size - segmentStart >= 12) {
    segments.add(segmentStart until rowCounts.size)
  }

  return segments.mapNotNull { range ->
    buildShopeeVisualToggleTarget(bitmap, xStart, xEnd, yStart + range.first, yStart + range.last)
  }
    .filter { target ->
      target.bounds.width() in (width * 0.05f).toInt()..(width * 0.22f).toInt() &&
        target.bounds.height() in (height * 0.012f).toInt()..(height * 0.08f).toInt() &&
        target.bounds.width() >= target.bounds.height() * 1.35f
    }
    .sortedBy { it.bounds.centerY() }
    .distinctBy { it.bounds.centerY() / 24 }
}

internal fun buildShopeeVisualToggleTarget(
  bitmap: Bitmap,
  xStart: Int,
  xEnd: Int,
  yStart: Int,
  yEnd: Int
): ShopeeVisualToggleTarget? {
  var left = xEnd
  var top = yEnd
  var right = xStart
  var bottom = yStart
  var green = 0
  var grey = 0

  for (y in yStart..yEnd) {
    for (x in xStart until xEnd) {
      val color = bitmap.getPixel(x, y)
      val isGreen = isShopeeSwitchGreen(color)
      val isGrey = isShopeeSwitchGrey(color)
      if (!isGreen && !isGrey) continue
      if (isGreen) green += 1 else grey += 1
      left = minOf(left, x)
      right = maxOf(right, x)
      top = minOf(top, y)
      bottom = maxOf(bottom, y)
    }
  }

  if (left >= right || top >= bottom) return null
  val state = when {
    green > 140 && green > grey * 0.35f -> ShopeeVisualToggleState.On
    grey > 140 -> ShopeeVisualToggleState.Off
    else -> ShopeeVisualToggleState.Unknown
  }
  return ShopeeVisualToggleTarget(Rect(left, top, right, bottom), state, green, grey)
}

internal fun isShopeeSwitchPixel(color: Int): Boolean =
  isShopeeSwitchGreen(color) || isShopeeSwitchGrey(color)

internal fun isShopeeSwitchGreen(color: Int): Boolean {
  val red = Color.red(color)
  val green = Color.green(color)
  val blue = Color.blue(color)
  return green >= 145 && red <= 95 && blue <= 150 && green - red >= 70
}

internal fun isShopeeSwitchGrey(color: Int): Boolean {
  val red = Color.red(color)
  val green = Color.green(color)
  val blue = Color.blue(color)
  val max = maxOf(red, green, blue)
  val min = minOf(red, green, blue)
  val avg = (red + green + blue) / 3
  return avg in 170..244 && max - min <= 28
}

internal fun KubdeeAccessibilityService.tapShopeePostingToggleByLabel(
  labels: List<String>,
  logName: String,
  desiredOn: Boolean? = null
): Boolean {
  for (root in shopeeWindowRoots()) {
    val screen = screenBounds(root)
    val textNodes = mutableListOf<TextNode>()
    collectTextNodes(root, textNodes, allowedPackageName = TARGET_PACKAGE_SHOPEE)
    val label = textNodes
      .filter { node ->
        node.node.isVisibleToUser &&
          labels.any { needle -> node.text.contains(needle, ignoreCase = true) } &&
          node.bounds.centerY() >= screen.top + (screen.height() * 0.18f).toInt() &&
          node.bounds.centerY() <= screen.bottom - dp(170)
      }
      .minByOrNull { it.bounds.top }
      ?: continue

    val tapX = shopeePostingToggleFallbackTapX(screen, desiredOn)
    val tapY = label.bounds.centerY().toFloat()
    logShopeePostStep(
      "แตะ toggle $logName จาก label '${label.text.take(28)}'" +
        desiredOn?.let { " ${shopeePostingToggleDirectionLabel(it)}" }.orEmpty()
    )
    val visualTarget = detectShopeePostingVisualToggles()
      .filter { toggle -> kotlin.math.abs(toggle.bounds.centerY() - label.bounds.centerY()) <= dp(90) }
      .minByOrNull { toggle -> kotlin.math.abs(toggle.bounds.centerY() - label.bounds.centerY()) }
    val finalTapX = visualTarget?.let { shopeePostingToggleTapX(it.bounds, desiredOn) } ?: tapX
    val finalTapY = visualTarget?.bounds?.centerY()?.toFloat() ?: tapY
    if (tapBlockingWithoutStopButton(finalTapX, finalTapY, timeoutMs = 1800L, durationMs = 80L)) {
      return true
    }
  }
  return false
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

internal fun KubdeeAccessibilityService.clickShopeeToggleTarget(target: ShopeeToggleTarget, desiredOn: Boolean? = null): Boolean {
  if (clickNode(target.node)) return true
  return tapBlockingWithoutStopButton(
    shopeePostingToggleTapX(target.bounds, desiredOn),
    target.bounds.centerY().toFloat()
  )
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
