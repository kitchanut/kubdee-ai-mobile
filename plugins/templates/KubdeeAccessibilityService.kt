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
import __PACKAGE_NAME__.R
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

data class ShopeeLikedProduct(
  val name: String,
  val price: String?,
  val stock: Int?,
  val productUrl: String?,
  val externalProductId: String?,
  val imageUrl: String?,
  val status: String,
  val scrapedAt: Long
)

data class ShopeePostingVideo(
  val fileUri: String,
  val productName: String?,
  val productId: String?,
  val productUrl: String?,
  val caption: String?,
  val hashtags: String?,
  val cta: String?,
  val galleryVideoId: String?,
  val platform: String?
)

data class PreparedShopeeVideo(
  val uri: Uri,
  val displayName: String
)

class KubdeeAccessibilityService : AccessibilityService() {
  private val mainHandler = Handler(Looper.getMainLooper())
  private var overlayView: TextView? = null
  private var overlayStopButton: Button? = null
  private var automationOverlayUnavailable = false
  private val automationLogLines = mutableListOf<String>()
  private val automationStatsLock = Any()
  private var automationForegroundActive = false
  private var automationStartedAtMs = 0L
  private var automationTaskLabel = "Automation"
  private var automationUnitLabel = "STEP"
  private var automationCurrentCount = 0
  private var automationTotalCount = 0
  private var automationSuccessCount = 0
  private var automationFailedCount = 0
  private var automationRound = 0
  private var automationTotalRounds = 0
  private var automationStatusLabel = "RUNNING"

  @Volatile
  private var stopRequested = false

  @Volatile
  private var shopeeImportThread: Thread? = null

  @Volatile
  private var shopeePostThread: Thread? = null

  companion object {
    private const val TAG = "KubdeeAccessibility"
    private const val AUTOMATION_NOTIFICATION_CHANNEL_ID = "kubdee_automation"
    private const val AUTOMATION_NOTIFICATION_ID = 2401
    private const val TARGET_PACKAGE_SHOPEE = "com.shopee.th"
    private const val COPY_SHOPEE_PRODUCT_URL_DURING_IMPORT = true
    private val SHOPEE_LIKED_TEXTS = listOf(
      "สิ่งที่ฉันถูกใจ",
      "รายการถูกใจ",
      "สิ่งที่ถูกใจ",
      "ถูกใจ",
      "Liked",
      "Likes",
      "My Likes",
      "My liked items"
    )
    private val SHOPEE_AFFILIATE_TEXTS = listOf(
      "โปรแกรม Affiliate",
      "Shopee Affiliate",
      "Affiliate Program",
      "Affiliate"
    )
    private val SHOPEE_ACCOUNT_TEXTS = listOf("บัญชีผู้ใช้", "บัญชี", "Account")
    private val SHOPEE_VIDEO_ACCOUNT_TEXTS = listOf(
      "หน้าบัญชี Shopee Video",
      "Shopee Video",
      "Video Account",
      "บัญชี Shopee Video"
    )
    private val SHOPEE_VIDEO_COMPOSER_TEXTS = listOf(
      "โพสต์วิดีโอ",
      "โพสวิดีโอ",
      "Post Video",
      "Click to post video"
    )
    private val SHOPEE_POSTING_SURFACE_TEXTS = listOf(
      "ถัดไป",
      "Next",
      "คลังภาพ",
      "Gallery",
      "Albums",
      "แคปชั่น",
      "Caption",
      "แตะเพื่อเพิ่มสินค้า",
      "เพิ่มสินค้า",
      "Tap to add product",
      "โพสต์",
      "Post"
    )
    private val SHOPEE_POSTING_SURFACE_RESOURCE_HINTS = listOf(
      "view_pager",
      "tool_container",
      "bottom_container",
      "rl_pick_media_title",
      "tv_pick_next",
      "tv_publish",
      "publish",
      "gallery",
      "media",
      "post"
    )
    private val SHOPEE_LEAVE_POST_CONFIRM_TEXTS = listOf(
      "ออก",
      "ละทิ้ง",
      "ไม่บันทึก",
      "ยืนยัน",
      "ตกลง",
      "Leave",
      "Discard",
      "Confirm",
      "OK"
    )
    private val SHOPEE_RECOMMENDATION_TEXTS = listOf(
      "คุณอาจจะชอบ",
      "คณอาจจะชอบ",
      "ชอบสิ่งนี้",
      "you may also like",
      "you might also like",
      "recommended for you"
    )
    private val SHOPEE_PRODUCT_DETAIL_MARKERS = listOf(
      "ซื้อเลย",
      "ซื้อโดยใช้โค้ด",
      "เพิ่มไปยังรถเข็น",
      "เพิ่มลงรถเข็น",
      "แชทเลย",
      "แชร์เพื่อรับ",
      "ค่าคอมมิชชั่น",
      "คัดลอกลิงก์",
      "คัดลอกลิงค์",
      "โค้ดแชร์สินค้า",
      "บันทึกรูปภาพ",
      "คะแนนสินค้า",
      "รายละเอียดสินค้า",
      "ตัวเลือกสินค้า",
      "ค้นหารีวิว",
      "Buy Now",
      "Add to Cart",
      "Copy Link",
      "Copy link",
      "Product Ratings",
      "Product Details"
    )
    private val PRICE_REGEX = Regex("""(?:฿|B)\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)""")
    private val PRICE_NUMBER_REGEX = Regex("""^[0-9][0-9,]*(?:\.[0-9]{1,2})?$""")
    private val STOCK_REGEX = Regex("""(?:ขายแล้ว|stock|สต็อก|คงเหลือ)\s*([0-9,]+)|([0-9,]+)\s*(?:ชิ้น|sold)""", RegexOption.IGNORE_CASE)
    private val URL_REGEX = Regex("""https?://[^\s]+""", RegexOption.IGNORE_CASE)

    @Volatile
    private var currentService: KubdeeAccessibilityService? = null

    @Volatile
    private var pendingShopeeImportCommand: PendingShopeeImportCommand? = null

    @Volatile
    private var pendingShopeePostCommand: PendingShopeePostCommand? = null

    @Volatile
    private var pendingShopeeStopRequested = false

    fun getInstance(): KubdeeAccessibilityService? = currentService

    fun isRunning(): Boolean = currentService != null

    fun dispatchShopeeImportStart(maxItems: Int, runId: String, profileLocalId: String?): Boolean {
      pendingShopeeStopRequested = false
      val service = currentService
      if (service != null) {
        service.startShopeeImportAsync(maxItems, runId, profileLocalId)
        return true
      }

      pendingShopeeImportCommand = PendingShopeeImportCommand(maxItems, runId, profileLocalId)
      return false
    }

    fun dispatchShopeePostStart(payloadJson: String, runId: String): Boolean {
      pendingShopeeStopRequested = false
      val service = currentService
      if (service != null) {
        service.startShopeePostAsync(payloadJson, runId)
        return true
      }

      pendingShopeePostCommand = PendingShopeePostCommand(payloadJson, runId)
      return false
    }

    fun dispatchShopeeStop(): Boolean {
      pendingShopeeImportCommand = null
      pendingShopeePostCommand = null
      val service = currentService
      if (service != null) {
        service.requestStopShopeeAutomation()
        return true
      }

      pendingShopeeStopRequested = true
      return false
    }

    private fun takePendingShopeeImportCommand(): PendingShopeeImportCommand? {
      val command = pendingShopeeImportCommand
      pendingShopeeImportCommand = null
      return command
    }

    private fun takePendingShopeePostCommand(): PendingShopeePostCommand? {
      val command = pendingShopeePostCommand
      pendingShopeePostCommand = null
      return command
    }

    private data class PendingShopeeImportCommand(
      val maxItems: Int,
      val runId: String,
      val profileLocalId: String?
    )

    private data class PendingShopeePostCommand(
      val payloadJson: String,
      val runId: String
    )
  }

  override fun onServiceConnected() {
    super.onServiceConnected()
    currentService = this
    automationOverlayUnavailable = false
    if (pendingShopeeStopRequested) {
      pendingShopeeStopRequested = false
      requestStopShopeeAutomation()
    }
    takePendingShopeeImportCommand()?.let { command ->
      startShopeeImportAsync(command.maxItems, command.runId, command.profileLocalId)
    }
    takePendingShopeePostCommand()?.let { command ->
      startShopeePostAsync(command.payloadJson, command.runId)
    }
  }

  override fun onAccessibilityEvent(event: AccessibilityEvent?) {
    // Event handling will be wired to deterministic Shopee scripts in the runner layer.
  }

  override fun onInterrupt() = Unit

  override fun onDestroy() {
    if (currentService === this) {
      currentService = null
    }
    removeAutomationOverlay()
    super.onDestroy()
  }

  override fun onUnbind(intent: android.content.Intent?): Boolean {
    if (currentService === this) {
      currentService = null
    }
    return super.onUnbind(intent)
  }

  fun tap(x: Float, y: Float, onResult: (Boolean) -> Unit) {
    dispatchLineGesture(x, y, x, y, 80, onResult)
  }

  fun swipe(startX: Float, startY: Float, endX: Float, endY: Float, durationMs: Long, onResult: (Boolean) -> Unit) {
    dispatchLineGesture(startX, startY, endX, endY, durationMs, onResult)
  }

  fun clickByText(text: String): Boolean {
    val root = rootInActiveWindow ?: return false
    val node = root
      .findAccessibilityNodeInfosByText(text)
      .firstNotNullOfOrNull { findClickableNode(it) }
      ?: return false

    return node.performAction(AccessibilityNodeInfo.ACTION_CLICK)
  }

  fun inputText(text: String): Boolean {
    val root = rootInActiveWindow ?: return false
    val focused = root.findFocus(AccessibilityNodeInfo.FOCUS_INPUT)
    val target = when {
      focused?.isEditable == true && !isBlockedEditableNode(focused) -> focused
      else -> findEditableNode(root)
    } ?: return false

    return setNodeText(target, text)
  }

  private fun setNodeText(target: AccessibilityNodeInfo, text: String): Boolean {
    val args = Bundle().apply {
      putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, text)
    }

    return target.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args)
  }

  fun pressImeEnter(): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) return false

    val root = rootInActiveWindow ?: return false
    val focused = root.findFocus(AccessibilityNodeInfo.FOCUS_INPUT)
    val target = when {
      focused != null -> focused
      else -> findEditableNode(root)
    } ?: return false

    return target.performAction(AccessibilityNodeInfo.AccessibilityAction.ACTION_IME_ENTER.id)
  }

  private fun pressImeEnterOn(target: AccessibilityNodeInfo): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) return false
    return target.performAction(AccessibilityNodeInfo.AccessibilityAction.ACTION_IME_ENTER.id)
  }

  fun requestStopShopeeAutomation() {
    stopRequested = true
    updateAutomationStats(statusLabel = "STOPPING")
    logStep("กำลังหยุดงาน Shopee...")
  }

  fun clearStopShopeeAutomation() {
    stopRequested = false
  }

  private fun startShopeeImportAsync(maxItems: Int, runId: String, profileLocalId: String?) {
    val runningThread = shopeeImportThread
    if (runningThread?.isAlive == true) {
      KubdeeAutomationIpc.sendShopeeImportFinished(
        this,
        runId,
        emptyList(),
        error = "Shopee import กำลังทำงานอยู่แล้ว",
        profileLocalId = profileLocalId
      )
      return
    }

    val thread = Thread {
      var importedCount = 0
      var errorMessage: String? = null
      try {
        val normalizedMaxItems = if (maxItems <= 0) 0 else maxItems
        importedCount = importShopeeLikedProducts(
          TARGET_PACKAGE_SHOPEE,
          normalizedMaxItems,
          profileLocalId
        )
      } catch (error: Exception) {
        errorMessage = error.message ?: "Shopee import failed"
        Log.e(TAG, "Shopee import runner failed", error)
      } finally {
        val shouldReturnToKubdee = errorMessage == null
        if (shouldReturnToKubdee) {
          logStep("กลับไป Kubdee AI เพื่อเปิดคลังสินค้า (${importedCount} รายการ)")
        }
        KubdeeAutomationIpc.sendShopeeImportFinished(
          this,
          runId,
          emptyList(),
          error = errorMessage,
          stopped = stopRequested,
          profileLocalId = profileLocalId
        )
        if (shouldReturnToKubdee) {
          mainHandler.postDelayed({ launchKubdeeLibrary() }, 250L)
        }
        if (shopeeImportThread === Thread.currentThread()) {
          shopeeImportThread = null
        }
      }
    }.also { worker ->
      worker.name = "KubdeeShopeeLikedImport"
      shopeeImportThread = worker
      worker.start()
    }
  }

  private fun startShopeePostAsync(payloadJson: String, runId: String) {
    val runningThread = shopeePostThread
    if (runningThread?.isAlive == true) {
      KubdeeAutomationIpc.sendShopeePostFinished(
        this,
        runId,
        JSONObject().apply {
          put("success", false)
          put("error", "Shopee post กำลังทำงานอยู่แล้ว")
        },
        error = "Shopee post กำลังทำงานอยู่แล้ว"
      )
      return
    }

    val thread = Thread {
      val result = try {
        postShopeeVideos(payloadJson)
      } catch (error: Exception) {
        Log.e(TAG, "Shopee post runner failed", error)
        JSONObject().apply {
          put("success", false)
          put("error", error.message ?: "Shopee post failed")
        }
      }

      KubdeeAutomationIpc.sendShopeePostFinished(
        this,
        runId,
        result,
        error = result.optString("error").takeIf { it.isNotBlank() },
        stopped = result.optBoolean("stopped", false)
      )
      if (shopeePostThread === Thread.currentThread()) {
        shopeePostThread = null
      }
    }.also { worker ->
      worker.name = "KubdeeShopeePosting"
      shopeePostThread = worker
      worker.start()
    }
  }

  @Synchronized
  fun importShopeeLikedProducts(
    targetPackage: String,
    maxItems: Int,
    profileLocalId: String? = null
  ): Int {
    val importedKeys = mutableSetOf<String>()
    val seenCandidateKeys = mutableSetOf<String>()
    val importAllLikedItems = maxItems <= 0
    val targetImportCount = if (importAllLikedItems) Int.MAX_VALUE else maxItems.coerceAtLeast(1)
    try {
      clearStopShopeeAutomation()
      resetAutomationLog()
      configureAutomationStats("Shopee Import", "ITEM", if (importAllLikedItems) 0 else targetImportCount)
      beginAutomationForeground("กำลังดึงสินค้า Shopee")
      logStep(if (importAllLikedItems) "เปิด Shopee > ฉัน > สิ่งที่ฉันถูกใจ (ดึงทั้งหมด)" else "เปิด Shopee > ฉัน > สิ่งที่ฉันถูกใจ (${targetImportCount} รายการ)")
      closeShopeeBeforeFreshLaunch(targetPackage)
      if (!launchPackage(targetPackage, resetTask = true)) {
        throw IllegalStateException("เปิด Shopee ไม่สำเร็จ")
      }

      if (!waitForPackageActive(targetPackage, 8_000L)) {
        throw IllegalStateException("ยังไม่เห็นหน้าต่าง Shopee หลังเปิดแอป")
      }

      sleepStep(2500)
      dismissShopeeBlockingPopups()

      if (!goToShopeeMeTab()) {
        throw IllegalStateException("ไม่พบเมนู ฉัน")
      }

      dismissShopeeBlockingPopups()

      if (!openShopeeLikedList()) {
        throw IllegalStateException("ไม่พบเมนู สิ่งที่ฉันถูกใจ")
      }

      if (!waitForShopeeLikedProductsReady(18_000L)) {
        throw IllegalStateException("ไม่พบสินค้าในหน้าถูกใจ")
      }

      var noNewRounds = 0
      val maxRounds = if (importAllLikedItems) 240 else maxOf(12, targetImportCount)
      var detailAttemptCount = 0

      for (round in 1..maxRounds) {
        checkStopRequested()
        val (visibleProducts, reachedRecommendations) = scrapeVisibleShopeeLikedProductCandidates()
        var added = 0
        var lostLikedList = false
        for (candidate in visibleProducts) {
          checkStopRequested()
          val candidateKey = candidate.product.externalProductId ?: candidate.product.productUrl ?: stableProductKey(candidate.product)
          val candidateAttemptKey = shopeeLikedCandidateAttemptKey(candidate.product)
          if (importedKeys.contains(candidateKey) || !seenCandidateKeys.add(candidateAttemptKey)) {
            logStep("ข้ามสินค้าที่เห็นซ้ำ: ${candidate.product.name.take(34)}")
            continue
          }

          detailAttemptCount += 1
          logStep("เปิด detail สินค้า $detailAttemptCount: ${candidate.product.name.take(34)}")
          val product = enrichShopeeProductFromDetail(
            candidate,
            copyProductUrl = COPY_SHOPEE_PRODUCT_URL_DURING_IMPORT
          ) ?: continue
          val key = product.externalProductId ?: product.productUrl ?: stableProductKey(product)
          if (importedKeys.add(key)) {
            seenCandidateKeys.add(shopeeLikedCandidateAttemptKey(product))
            added += 1
            updateAutomationStats(currentCount = importedKeys.size, successCount = importedKeys.size)
            logStep("บันทึกสินค้าแล้ว รวม ${importedKeys.size}: ${product.name.take(34)}")
            KubdeeAutomationIpc.sendShopeeImportProduct(this, product, profileLocalId = profileLocalId)
            if (!importAllLikedItems && importedKeys.size >= targetImportCount) break
          }
          if (!isShopeeLikedListVisible()) {
            logStep("ยังไม่อยู่หน้ารายการถูกใจหลังเปิด detail")
            lostLikedList = !returnToShopeeLikedList()
            if (lostLikedList) break
          }
        }

        logStep("หน้าถูกใจรอบ $round พบใหม่ $added รวม ${importedKeys.size}")
        if (lostLikedList) {
          logStep("หยุดรอบนี้เพื่อไม่กดรายการจากหน้าผิด")
          break
        }
        if (reachedRecommendations) {
          logStep("เจอหัวข้อ คุณอาจจะชอบสิ่งนี้ จบรายการถูกใจ")
          break
        }
        if (!importAllLikedItems && importedKeys.size >= targetImportCount) break

        noNewRounds = if (added == 0) noNewRounds + 1 else 0
        if (noNewRounds >= 3) break

        if (!scrollShopeeLikedList()) break
        sleepStep(1700)
      }

      return importedKeys.size
    } catch (error: ShopeeAutomationStoppedException) {
      logStep("หยุดดึงสินค้าแล้ว บันทึกเท่าที่พบ ${importedKeys.size} รายการ")
      return importedKeys.size
    } finally {
      endAutomationForeground()
      hideAutomationOverlay(2500L)
    }
  }

  @Synchronized
  fun postShopeeVideos(payloadJson: String): JSONObject {
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

  private fun parseShopeePostingVideos(array: JSONArray): List<ShopeePostingVideo> {
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

  private fun JSONObject.optCleanString(key: String): String? {
    if (!has(key) || isNull(key)) return null
    val value = optString(key, "").trim()
    return value.ifBlank { null }
  }

  private fun runShopeeVideoPostingFlow(video: ShopeePostingVideo, preparedVideo: PreparedShopeeVideo) {
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

  private fun navigateShopeeVideoAccount(): Boolean {
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

  private fun openShopeeVideoComposer() {
    logShopeePostStep("กดปุ่ม โพสต์วิดีโอ")
    if (!tapShopeeVideoComposerButton()) {
      throw IllegalStateException("ไม่พบปุ่ม โพสต์วิดีโอ")
    }
    sleepStep(4000L)
    tapAndroidPermissionAllow()
  }

  private fun selectPreparedShopeeVideoFromGallery(preparedVideo: PreparedShopeeVideo) {
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

  private fun tapShopeeNext(label: String) {
    logShopeePostStep(label)
    if (!clickByAnyText(listOf("ถัดไป", "Next"), exact = false, allowedPackageName = TARGET_PACKAGE_SHOPEE)) {
      throw IllegalStateException("ไม่พบปุ่ม $label")
    }
    sleepStep(1500L)
  }

  private fun fillShopeePostingCaption(video: ShopeePostingVideo) {
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

  private fun attachShopeePostingProductBestEffort(video: ShopeePostingVideo) {
    val productUrl = normalizeShopeeProductUrl(video.productUrl.orEmpty())
    val productName = video.productName?.trim().orEmpty()
    if (productUrl.isBlank() && productName.isBlank()) {
      logShopeePostStep("ไม่มีข้อมูลสินค้า ข้ามการแนบสินค้า")
      return
    }

    try {
      logShopeePostStep("แนบสินค้า Shopee")
      if (
        !clickByAnyText(
          listOf("แตะเพื่อเพิ่มสินค้า", "เพิ่มสินค้า", "Tap to add product"),
          exact = false,
          allowedPackageName = TARGET_PACKAGE_SHOPEE
        )
      ) {
        logShopeePostStep("ไม่พบปุ่มเพิ่มสินค้า ข้ามการแนบสินค้า")
        return
      }
      sleepStep(1800L)

      if (
        productUrl.isNotBlank() &&
        tapShopeeProductLinkEntry()
      ) {
        sleepStep(1200L)
        val edit = findEditableNode(rootInActiveWindow, TARGET_PACKAGE_SHOPEE)
        if (edit != null) {
          clickNode(edit)
          sleepStep(400L)
          setNodeText(edit, productUrl)
          sleepStep(800L)
          if (
            clickByAnyText(
              listOf("เพิ่ม", "Add", "ตกลง", "OK", "ยืนยัน", "Confirm"),
              exact = false,
              allowedPackageName = TARGET_PACKAGE_SHOPEE
            )
          ) {
            sleepStep(2000L)
            clickByAnyText(
              listOf("เพิ่ม", "Add", "เลือก", "Select", "เสร็จ", "Done"),
              exact = false,
              allowedPackageName = TARGET_PACKAGE_SHOPEE
            )
            sleepStep(1800L)
            logShopeePostStep("แนบสินค้าด้วยลิงก์แล้ว")
            return
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

  private fun normalizeShopeeProductUrl(value: String): String {
    val url = value.trim()
    if (url.isBlank()) return ""
    if (!url.startsWith("http://", ignoreCase = true) && !url.startsWith("https://", ignoreCase = true)) return ""
    return if (Regex("""(^https?://)?([^/]+\.)?shopee\.""", RegexOption.IGNORE_CASE).containsMatchIn(url)) url else ""
  }

  private fun tapShopeeProductLinkEntry(): Boolean {
    if (
      clickByAnyText(
        listOf("กรอกลิงก์สินค้า", "ลิงก์สินค้า", "ลิงค์สินค้า", "Product link", "Link"),
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
      if (target != null && tapNodeCenter(target)) {
        logShopeePostStep("เปิดกรอกลิงก์สินค้าด้วย icon")
        return true
      }
    }

    logShopeePostStep("ไม่พบทางเข้าเมนูลิงก์สินค้า")
    return false
  }

  private fun findShopeeProductLinkNode(
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

  private fun tapShopeePostButton() {
    logShopeePostStep("กดโพสต์")
    if (!clickByAnyText(listOf("โพสต์", "Post"), exact = true, allowedPackageName = TARGET_PACKAGE_SHOPEE)) {
      throw IllegalStateException("ไม่พบปุ่มโพสต์")
    }
    logShopeePostStep("กดโพสต์แล้ว รอ Shopee รับคำสั่ง")
    sleepStep(2000L)
  }

  private fun disableShopeeContentReusePermissionBestEffort() {
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

  private fun enableShopeeAiGeneratedLabelBestEffort() {
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

  private fun findShopeeContentReuseToggleTarget(): ShopeeToggleTarget? {
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

  private fun findShopeeAiGeneratedLabelToggleTarget(): ShopeeToggleTarget? {
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

  private fun collectShopeePostingToggleCandidates(
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

  private fun findNearbyShopeeToggle(
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

  private fun clickShopeeToggleTarget(target: ShopeeToggleTarget): Boolean {
    if (clickNode(target.node)) return true
    return tapBlocking(target.bounds.centerX().toFloat(), target.bounds.centerY().toFloat())
  }

  private fun toggleCenterY(bounds: Rect): Int = (bounds.top + bounds.bottom) / 2

  private fun tapShopeeVideoComposerButton(): Boolean {
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

  private fun prepareShopeeNavigationSurface() {
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

  private fun recoverShopeePostingSurfaceBeforeNavigation() {
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

  private fun isShopeePostingSurfaceVisible(): Boolean {
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

  private fun isShopeeMainNavigationVisible(): Boolean =
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

  private fun tapShopeeAffiliateAccountTab(): Boolean {
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

  private fun bottomNavTapBounds(node: AccessibilityNodeInfo, fallback: Rect, screen: Rect): Rect {
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

  private fun scrollUntilTapText(texts: List<String>, maxAttempts: Int): Boolean {
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

  private fun tapAndroidPermissionAllow(): Boolean =
    clickByAnyText(
      listOf("อนุญาตทั้งหมด", "อนุญาต", "Allow all", "Allow", "While using the app", "ขณะใช้แอป"),
      exact = false
    )

  private fun tapFirstShopeeGalleryMedia(): Boolean {
    val candidates = mutableListOf<Pair<Rect, AccessibilityNodeInfo>>()
    val roots = shopeeWindowRoots()
    for (root in roots) {
      val screen = screenBounds(root)
      collectShopeeGalleryMediaCandidates(root, screen, candidates)
      if (candidates.isEmpty()) {
        collectShopeeGalleryTileCandidates(root, screen, candidates)
      }
    }
    logShopeePostStep("พบ media candidate ${candidates.size} รายการในคลัง")

    val candidate = candidates
      .sortedWith(compareBy<Pair<Rect, AccessibilityNodeInfo>> { it.first.top }.thenBy { it.first.left })
      .firstOrNull()
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

  private fun collectShopeeGalleryMediaCandidates(
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

  private fun collectShopeeGalleryTileCandidates(
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

  private fun prepareShopeePostingVideoUri(source: String, index: Int): PreparedShopeeVideo {
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
      return PreparedShopeeVideo(targetUri, fileName)
    } catch (error: Exception) {
      contentResolver.delete(targetUri, null, null)
      throw error
    }
  }

  private fun waitForPreparedShopeeVideoIndexed(displayName: String, timeoutMs: Long): Boolean {
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

  private fun openShopeeSourceInputStream(source: String, sourceUri: Uri): InputStream {
    return when (sourceUri.scheme?.lowercase(Locale.ROOT)) {
      "content" -> contentResolver.openInputStream(sourceUri)
      "file" -> FileInputStream(File(sourceUri.path.orEmpty()))
      "http", "https" -> openRemoteShopeeVideoStream(source)
      "data" -> openDataUrlInputStream(source)
      null, "" -> FileInputStream(File(source))
      else -> contentResolver.openInputStream(sourceUri)
    } ?: throw IllegalStateException("เปิดไฟล์วิดีโอต้นทางไม่สำเร็จ")
  }

  private fun openRemoteShopeeVideoStream(sourceUrl: String): InputStream {
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

  private fun openDataUrlInputStream(dataUrl: String): InputStream {
    val payload = dataUrl.substringAfter(',', missingDelimiterValue = "")
    if (payload.isBlank()) {
      throw IllegalStateException("data URL วิดีโอไม่ถูกต้อง")
    }
    val decoded = Base64.decode(payload, Base64.DEFAULT)
    return ByteArrayInputStream(decoded)
  }

  private fun normalizeShopeeVideoMimeType(value: String?): String =
    if (!value.isNullOrBlank() && value.startsWith("video/", ignoreCase = true)) value else "video/mp4"

  private fun extensionForShopeeVideoMimeType(mimeType: String): String =
    when (mimeType.lowercase(Locale.ROOT)) {
      "video/quicktime" -> "mov"
      "video/webm" -> "webm"
      "video/3gpp" -> "3gp"
      else -> "mp4"
    }

  private fun formatShopeeHashtagText(value: String?): String {
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

  private fun dispatchLineGesture(
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

  private fun launchPackage(packageName: String, resetTask: Boolean = false): Boolean {
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

  private fun launchKubdeeLibrary(): Boolean =
    startActivityOnMainThread(
      Intent(Intent.ACTION_VIEW, Uri.parse("kubdeeai://library")).apply {
        setPackage(packageName)
        addCategory(Intent.CATEGORY_BROWSABLE)
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP)
        addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP)
      }
    )

  private fun closeShopeeBeforeFreshLaunch(packageName: String) {
    logStep("ปิด Shopee เดิมก่อนเริ่มงาน")
    performGlobalAction(GLOBAL_ACTION_HOME)
    sleepStep(550L)

    try {
      val activityManager = getSystemService(ACTIVITY_SERVICE) as? ActivityManager
      activityManager?.killBackgroundProcesses(packageName)
      logStep("สั่งปิด process Shopee เดิมแล้ว")
    } catch (error: Exception) {
      Log.w(TAG, "Unable to kill Shopee background process", error)
      logStep("ปิด process Shopee เดิมไม่ได้ จะเปิดแบบ reset task")
    }

    sleepStep(850L)
  }

  private fun launchUrl(url: String, preferredPackage: String? = null): Boolean {
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

  private fun startActivityOnMainThread(intent: Intent): Boolean {
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

  private fun activeWindowPackageName(): String =
    rootInActiveWindow?.packageName?.toString().orEmpty()

  private fun waitForPackageActive(packageName: String, timeoutMs: Long): Boolean {
    val start = System.currentTimeMillis()
    while (System.currentTimeMillis() - start < timeoutMs) {
      checkStopRequested()
      if (activeWindowPackageName() == packageName) return true
      sleepStep(250L)
    }
    return activeWindowPackageName() == packageName
  }

  private fun promptSetting(
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

  private fun promptSettingValue(settings: JSONObject?, key: String, fallback: String): String =
    settings?.optString(key, fallback).orEmpty().trim().ifBlank { fallback }

  private fun imageCharacterInstruction(settings: JSONObject?): String {
    val mode = promptSettingValue(settings, "characterMode", "auto")
    val description = settings?.optString("characterDescription", "").orEmpty().trim()
    return when {
      mode == "none" -> "ตัวละคร: ไม่มีคนในภาพ ให้โฟกัสสินค้าเท่านั้น"
      mode == "description" && description.isNotBlank() -> "ตัวละคร: $description"
      mode == "description" -> "ตัวละคร: มีคนรีวิวสินค้าแบบธรรมชาติ"
      else -> "ตัวละคร: ออโต้ เลือกคน/มือ/องค์ประกอบให้เหมาะกับสินค้า"
    }
  }

  private fun imageSceneInstruction(settings: JSONObject?): String {
    val mode = promptSettingValue(settings, "sceneMode", "auto")
    val description = settings?.optString("sceneDescription", "").orEmpty().trim()
    return when {
      mode == "none" -> "ฉากหลัก: ไม่มีฉากซับซ้อน ใช้พื้นหลังสะอาด"
      mode == "description" && description.isNotBlank() -> "ฉากหลัก: $description"
      mode == "description" -> "ฉากหลัก: ฉากใช้งานจริงที่เหมาะกับสินค้า"
      else -> "ฉากหลัก: ออโต้ เลือกฉากที่ช่วยขายสินค้า"
    }
  }

  private fun productDisplayInstruction(settings: JSONObject?): String =
    when (promptSettingValue(settings, "productDisplayMode", "auto")) {
      "wear" -> "การโชว์สินค้า: ให้ตัวละครสวม ใส่ หรือใช้สินค้าตามประเภทรายการ"
      "hold" -> "การโชว์สินค้า: ให้ถือสินค้าเด่นชัดในมือ"
      "use" -> "การโชว์สินค้า: แสดงการใช้งานจริงของสินค้า"
      "display" -> "การโชว์สินค้า: วางสินค้าเด่นบนฉากแบบ product display"
      else -> "การโชว์สินค้า: ออโต้ เลือกวิธีนำเสนอที่ขายดีที่สุด"
    }

  private fun videoCharacterInstruction(settings: JSONObject?): String =
    when (promptSettingValue(settings, "characterMode", "fromImage")) {
      "none" -> "ตัวละครวิดีโอ: ไม่มีคนในวิดีโอ โฟกัสสินค้าและ movement"
      else -> "ตัวละครวิดีโอ: ใช้ตัวละคร/มือ/สินค้าให้ต่อเนื่องจากรูปอ้างอิง"
    }

  private fun tapBlocking(x: Float, y: Float, timeoutMs: Long = 2500, durationMs: Long = 80L): Boolean {
    var completed = false
    val latch = CountDownLatch(1)
    dispatchLineGesture(x, y, x, y, durationMs) { success ->
      completed = success
      latch.countDown()
    }

    return latch.await(timeoutMs, TimeUnit.MILLISECONDS) && completed
  }

  private fun longPressBlocking(x: Float, y: Float, timeoutMs: Long = 3200): Boolean {
    var completed = false
    val latch = CountDownLatch(1)
    dispatchLineGesture(x, y, x, y, 700L) { success ->
      completed = success
      latch.countDown()
    }

    return latch.await(timeoutMs, TimeUnit.MILLISECONDS) && completed
  }

  private fun swipeBlocking(
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

  private fun logStep(message: String) {
    Log.d(TAG, "Shopee runner: $message")
    addAutomationLogLine(message)
    KubdeeAutomationIpc.sendShopeeImportLog(this, message)
    showAutomationOverlay(message)
  }

  private fun logShopeePostStep(message: String) {
    Log.d(TAG, "Shopee post runner: $message")
    addAutomationLogLine(message)
    KubdeeAutomationIpc.sendShopeePostLog(this, message)
    showAutomationOverlay(message)
  }

  private fun sleepStep(ms: Long) {
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

  private fun checkStopRequested() {
    if (stopRequested) {
      throw ShopeeAutomationStoppedException()
    }
  }

  private fun resetAutomationLog() {
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

  private fun configureAutomationStats(
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

  private fun updateAutomationStats(
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

  private fun incrementAutomationFailedCount() {
    synchronized(automationStatsLock) {
      automationFailedCount += 1
    }
  }

  private fun addAutomationLogLine(message: String) {
    val stamp = java.text.SimpleDateFormat("HH:mm:ss", Locale.ROOT).format(java.util.Date())
    synchronized(automationLogLines) {
      automationLogLines.add("$stamp $message")
      while (automationLogLines.size > 40) {
        automationLogLines.removeAt(0)
      }
    }
  }

  private fun latestAutomationLogText(): String {
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

  private fun automationStatsText(logCount: Int): String {
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

  private fun findClickableNode(node: AccessibilityNodeInfo?): AccessibilityNodeInfo? {
    var current = node
    while (current != null) {
      if (current.isClickable) {
        return current
      }
      current = current.parent
    }
    return null
  }

  private fun findEditableNode(
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

  private fun accessibilityWindowRoots(): List<AccessibilityNodeInfo> {
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

  private fun shopeeWindowRoots(): List<AccessibilityNodeInfo> =
    accessibilityWindowRoots()
      .filter { root -> containsNodeFromPackage(root, TARGET_PACKAGE_SHOPEE) }
      .ifEmpty {
        rootInActiveWindow
          ?.takeIf { root -> containsNodeFromPackage(root, TARGET_PACKAGE_SHOPEE) }
          ?.let { listOf(it) }
          ?: emptyList()
      }

  private fun collectEditableNodes(
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

  private fun isBlockedEditableNode(node: AccessibilityNodeInfo): Boolean {
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

  private fun goToShopeeMeTab(): Boolean {
    repeat(5) { attempt ->
      dismissShopeeBlockingPopups()
      logStep("ไปที่เมนู ฉัน (ครั้ง ${attempt + 1}/5)")
      val clicked = clickShopeeBottomMeTab()

      if (!clicked) {
        logStep("ไม่พบชื่อปุ่มเมนู ฉัน ในหน้า Shopee ใช้พิกัด fallback")
        tapShopeeMeTabFallback()
      }

      sleepStep(2200)
      val pageCheck = checkShopeeMePage()
      if (pageCheck.visible) {
        logStep("หน้า ฉัน พร้อมแล้ว (${pageCheck.summary()})")
        return true
      }
      logStep("ยังยืนยันหน้า ฉัน ไม่ได้ (${pageCheck.summary()})")
    }

    return false
  }

  private fun clickShopeeBottomMeTab(): Boolean {
    val root = rootInActiveWindow ?: return false
    val screen = screenBounds(root)
    val bottomNavStart = screen.top + (screen.height() * 0.74f).toInt()
    val candidates = mutableListOf<ShopeeBottomTabCandidate>()
    collectShopeeMeTabNodes(root, candidates, bottomNavStart)

    val sortedCandidates = candidates.sortedWith(
      compareByDescending<ShopeeBottomTabCandidate> { it.rank }
        .thenByDescending { it.bounds.top }
        .thenByDescending { it.bounds.left }
    )

    for (candidate in sortedCandidates) {
      logStep("พบปุ่ม ฉัน จาก '${candidate.label}' แล้วกดที่ตำแหน่งของปุ่ม")
      if (tapNodeCenter(candidate.node, durationMs = 120L)) {
        return true
      }

      val clickable = findClickableBottomTabAncestor(candidate.node, screen)
      if (clickable?.performAction(AccessibilityNodeInfo.ACTION_CLICK) == true) {
        return true
      }

      if (clickable != null && tapNodeCenter(clickable, durationMs = 120L)) {
        return true
      }

    }

    return false
  }

  private fun collectShopeeMeTabNodes(
    node: AccessibilityNodeInfo?,
    output: MutableList<ShopeeBottomTabCandidate>,
    bottomNavStart: Int
  ) {
    if (node == null) return
    if (node.isVisibleToUser && node.packageName?.toString() == TARGET_PACKAGE_SHOPEE) {
      val text = cleanNodeText(readNodeText(node))
      val resourceId = node.viewIdResourceName.orEmpty()
      val bounds = Rect()
      node.getBoundsInScreen(bounds)
      val isBottomNode = bounds.top >= bottomNavStart || bounds.bottom >= bottomNavStart
      val label = text.ifBlank { resourceId.ifBlank { "tab_bar_button_me" } }
      val resourceLooksLikeMe = resourceId.contains("tab_bar_button_me", ignoreCase = true) ||
        resourceId.contains("tab_me", ignoreCase = true)
      val rank = when {
        text.equals("ฉัน", ignoreCase = true) || text.equals("Me", ignoreCase = true) -> 3
        text.contains("ฉัน", ignoreCase = true) || Regex("""\bme\b""", RegexOption.IGNORE_CASE).containsMatchIn(text) -> 2
        resourceLooksLikeMe -> 1
        else -> 0
      }
      if (isBottomNode && rank > 0) {
        output.add(ShopeeBottomTabCandidate(node, Rect(bounds), label, rank))
      }
    }

    for (index in 0 until node.childCount) {
      collectShopeeMeTabNodes(node.getChild(index), output, bottomNavStart)
    }
  }

  private fun findClickableBottomTabAncestor(node: AccessibilityNodeInfo, screen: Rect): AccessibilityNodeInfo? {
    var current: AccessibilityNodeInfo? = node
    val bottomNavStart = screen.bottom - (screen.height() * 0.16f).toInt()
    while (current != null) {
      val bounds = Rect()
      current.getBoundsInScreen(bounds)
      if (
        current.isClickable &&
        current.packageName?.toString() == TARGET_PACKAGE_SHOPEE &&
        bounds.top >= bottomNavStart &&
        bounds.right > screen.left + (screen.width() * 0.78f).toInt()
      ) {
        return current
      }
      current = current.parent
    }
    return null
  }

  private fun isShopeeMePageVisible(): Boolean = checkShopeeMePage().visible

  private fun checkShopeeMePage(): ShopeeMePageCheck {
    val root = rootInActiveWindow ?: return ShopeeMePageCheck(visible = false, reason = "อ่าน root window ไม่ได้")
    val screen = screenBounds(root)
    val textNodes = mutableListOf<TextNode>()
    collectTextNodes(root, textNodes, allowedPackageName = TARGET_PACKAGE_SHOPEE)
    val visibleTextNodes = textNodes.filter { it.node.isVisibleToUser }
    if (visibleTextNodes.isEmpty()) {
      return ShopeeMePageCheck(visible = false, reason = "ไม่มี text node ที่มองเห็น")
    }

    val topLimit = screen.top + (screen.height() * 0.20f).toInt()
    val midLimit = screen.top + (screen.height() * 0.40f).toInt()
    val nonMeTitleMarkers = listOf("การแจ้งเตือน", "Notifications", "สำหรับคุณ", "วิดีโอ", "Video", "Live")
    val currentNonMeMarker = visibleTextNodes
      .filter { node -> node.bounds.top <= topLimit }
      .mapNotNull { node ->
        nonMeTitleMarkers.firstOrNull { marker -> node.text.contains(marker, ignoreCase = true) }
      }
      .firstOrNull()
    if (currentNonMeMarker != null) {
      return ShopeeMePageCheck(
        visible = false,
        reason = "เจอหัวข้อหน้าอื่น:$currentNonMeMarker",
        visibleTextCount = visibleTextNodes.size
      )
    }

    val purchaseSectionTop = screen.top + (screen.height() * 0.10f).toInt()
    val hasProfileHeader = visibleTextNodes.any { node ->
      node.bounds.top <= topLimit &&
        listOf("กำลังติดตาม", "ผู้ติดตาม", "Following", "Followers").any { marker ->
          node.text.contains(marker, ignoreCase = true)
        }
    }
    val hasPurchaseSection = visibleTextNodes.any { node ->
      node.bounds.top in purchaseSectionTop..midLimit &&
        listOf("ประวัติการซื้อ", "การซื้อของฉัน", "My Purchases", "My Purchase").any { marker ->
          node.text.contains(marker, ignoreCase = true)
        }
    }
    val hasLikedMenu = visibleTextNodes.any { node ->
      node.bounds.top > topLimit &&
        SHOPEE_LIKED_TEXTS.any { marker -> node.text.contains(marker, ignoreCase = true) }
    }
    val bottomNavStart = screen.bottom - (screen.height() * 0.13f).toInt()
    val hasBottomMeTab = visibleTextNodes.any { node ->
      node.bounds.top >= bottomNavStart &&
        (
          node.text.equals("ฉัน", ignoreCase = true) ||
            node.text.equals("Me", ignoreCase = true) ||
            node.text.contains("tab_bar_button_me", ignoreCase = true)
        )
    }
    val meSurfaceBottomLimit = screen.bottom - (screen.height() * 0.10f).toInt()
    val meSurfaceMarkers = listOf(
      "My Wallet",
      "กระเป๋าเงิน",
      "ShopeePay",
      "Shopee Coins",
      "SPayLater",
      "โค้ดส่วนลด",
      "ส่วนลด",
      "Promotions",
      "Campaign",
      "E-Service",
      "E-Voucher",
      "บริการทางการเงิน",
      "ดูเพิ่มเติม"
    )
    val meSurfaceHits = visibleTextNodes
      .filter { node -> node.bounds.top in topLimit..meSurfaceBottomLimit }
      .mapNotNull { node ->
        meSurfaceMarkers.firstOrNull { marker -> node.text.contains(marker, ignoreCase = true) }
      }
      .distinctBy { it.lowercase(Locale.ROOT) }

    val visible = (hasProfileHeader && (hasPurchaseSection || hasLikedMenu)) ||
      ((hasBottomMeTab || hasProfileHeader) && meSurfaceHits.size >= 2)
    val reason = when {
      visible -> "ok"
      !hasBottomMeTab && !hasProfileHeader -> "ไม่เจอ tab ฉัน หรือ header profile"
      meSurfaceHits.size < 2 && !hasPurchaseSection && !hasLikedMenu -> "marker หน้า ฉัน ไม่พอ"
      else -> "เงื่อนไขหน้า ฉัน ไม่ครบ"
    }

    return ShopeeMePageCheck(
      visible = visible,
      reason = reason,
      hasBottomMeTab = hasBottomMeTab,
      hasProfileHeader = hasProfileHeader,
      hasPurchaseSection = hasPurchaseSection,
      hasLikedMenu = hasLikedMenu,
      markerHits = meSurfaceHits,
      visibleTextCount = visibleTextNodes.size
    )
  }

  private fun openShopeeLikedList(): Boolean {
    if (isShopeeLikedListVisible()) {
      return true
    }

    val maxAttempts = 12
    repeat(maxAttempts) { attempt ->
      dismissShopeeBlockingPopups()

      if (isShopeeLikedListVisible()) {
        return true
      }

      logStep("ค้นหาเมนูสิ่งที่ฉันถูกใจ ครั้ง ${attempt + 1}/$maxAttempts")
      if (clickShopeeLikedMenu()) {
        logStep("กดเมนู สิ่งที่ฉันถูกใจ")
        if (waitForShopeeLikedListVisible(5_000L)) {
          return true
        }
      } else {
        logStep("ยังไม่พบเมนู สิ่งที่ฉันถูกใจ")
      }

      logStep("ขยับหน้า ฉัน หาเมนูถูกใจทีละนิด (ครั้ง ${attempt + 1}/$maxAttempts)")
      if (!swipeUpByScreen(durationMs = 220L, startFraction = 0.66f, endFraction = 0.54f)) {
        scrollFirstScrollableForward(allowedPackageName = TARGET_PACKAGE_SHOPEE)
      }
      sleepStep(450)
      if (clickShopeeLikedMenu()) {
        logStep("กดเมนู สิ่งที่ฉันถูกใจ หลังขยับหน้าจอ")
        if (waitForShopeeLikedListVisible(5_000L)) {
          return true
        }
      }
      sleepStep(350)
    }

    return isShopeeLikedListVisible()
  }

  private fun tapShopeeMeTabFallback(): Boolean {
    val bounds = displayBounds()
    val x = bounds.left + bounds.width() * 0.92f
    val y = bounds.bottom - bounds.height() * 0.085f
    return tapBlocking(x, y, timeoutMs = 1800L, durationMs = 90L)
  }

  private fun resetShopeeMePageScrollTop() {
    logStep("รีเซ็ตตำแหน่งหน้า ฉัน ก่อนหาเมนูถูกใจ")
    repeat(4) {
      checkStopRequested()
      val moved = scrollFirstScrollableBackward(allowedPackageName = TARGET_PACKAGE_SHOPEE)
      if (!moved) {
        swipeDownByScreen()
      }
      sleepStep(450L)
    }
  }

  private fun waitForShopeeLikedListVisible(timeoutMs: Long): Boolean {
    val start = System.currentTimeMillis()
    while (System.currentTimeMillis() - start < timeoutMs) {
      if (isShopeeLikedListVisible()) return true
      sleepStep(500)
    }
    return false
  }

  private fun isShopeeLikedListVisible(): Boolean {
    val root = rootInActiveWindow ?: return false
    val screen = screenBounds(root)
    val textNodes = mutableListOf<TextNode>()
    collectTextNodes(root, textNodes, allowedPackageName = TARGET_PACKAGE_SHOPEE)
    if (textNodes.isEmpty()) return false

    val topLimit = screen.top + (screen.height() * 0.18f).toInt()
    val bottomNavStart = screen.bottom - (screen.height() * 0.12f).toInt()
    val hasBottomMeTab = textNodes.any { node ->
      node.text.equals("ฉัน", ignoreCase = true) && node.bounds.top >= bottomNavStart
    }
    val hasTopLikedTitle = textNodes.any { node ->
      node.bounds.top <= topLimit && SHOPEE_LIKED_TEXTS.any { node.text.contains(it, ignoreCase = true) }
    }
    val hasTopEditAction = textNodes.any { node ->
      node.bounds.top <= topLimit && listOf("แก้ไข", "Edit").any { node.text.equals(it, ignoreCase = true) }
    }
    val filterLabels = setOf("ทั้งหมด", "สถานะ", "ส่วนลด", "หมวดหมู่")
    val listFilterHits = textNodes.count { node ->
      node.bounds.top <= screen.top + (screen.height() * 0.35f).toInt() &&
        filterLabels.any { label -> node.text.equals(label, ignoreCase = true) }
    }
    val hasDetailMarker = textNodes.any { node ->
      node.bounds.top < bottomNavStart && SHOPEE_PRODUCT_DETAIL_MARKERS.any { marker ->
        node.text.contains(marker, ignoreCase = true)
      }
    }

    if (hasDetailMarker && !hasTopLikedTitle && !hasTopEditAction) {
      return false
    }

    return !hasBottomMeTab && (hasTopLikedTitle || hasTopEditAction || listFilterHits >= 2)
  }

  private fun waitForShopeeLikedProductsReady(timeoutMs: Long): Boolean {
    val start = System.currentTimeMillis()
    var lastLog = 0L
    var lastStats: ShopeeLikedProductReadinessStats? = null
    while (System.currentTimeMillis() - start < timeoutMs) {
      checkStopRequested()
      val stats = shopeeLikedProductCandidateStats()
      lastStats = stats
      if (stats.ready) {
        logStep("สินค้าในหน้าถูกใจโหลดแล้ว (ราคา=${stats.prices}, rawPrice=${stats.rawPrices}, text=${stats.texts})")
        return true
      }
      if (stats.recommendation) {
        logStep("หน้าถูกใจไม่มีสินค้าเพิ่มก่อนหัวข้อแนะนำ")
        return false
      }

      val now = System.currentTimeMillis()
      if (now - lastLog > 3000) {
        logStep(
          "รอสินค้าในหน้าถูกใจโหลด ${((now - start) / 1000.0).formatOneDecimal()} วิ " +
            "(nodes=${stats.nodes}, ราคา=${stats.prices}, rawPrice=${stats.rawPrices}, text=${stats.texts}, safeTop=${stats.safeTop})"
        )
        lastLog = now
      }
      sleepStep(750)
    }

    lastStats?.let { stats ->
      logStep(
        "รอสินค้าครบ ${(timeoutMs / 1000.0).formatOneDecimal()} วิแล้วยังไม่เจอสินค้า " +
          "(nodes=${stats.nodes}, ราคา=${stats.prices}, rawPrice=${stats.rawPrices}, text=${stats.texts})"
      )
    }
    return false
  }

  private fun shopeeLikedProductCandidateStats(): ShopeeLikedProductReadinessStats {
    val root = rootInActiveWindow
      ?: return ShopeeLikedProductReadinessStats(
        ready = false,
        nodes = 0,
        prices = 0,
        rawPrices = 0,
        texts = 0,
        safeTop = 0,
        recommendation = false
      )
    val screen = screenBounds(root)
    val textNodes = mutableListOf<TextNode>()
    collectTextNodes(root, textNodes, allowedPackageName = TARGET_PACKAGE_SHOPEE)
    val safeTop = likedProductSafeTop(textNodes, screen)
    val recommendationTop = findShopeeRecommendationStartY(textNodes)
    val rawPriceNodes = findPriceNodes(textNodes)
    val priceNodes = rawPriceNodes.filter { node ->
      node.bounds.top > safeTop && (recommendationTop == null || node.bounds.top < recommendationTop)
    }
    val productTextNodes = textNodes.filter { node ->
      node.text.isNotBlank() &&
        node.bounds.bottom > safeTop &&
        (recommendationTop == null || node.bounds.top < recommendationTop) &&
        !PRICE_REGEX.containsMatchIn(node.text) &&
        isProductNameCandidate(node.text)
    }

    return ShopeeLikedProductReadinessStats(
      ready = priceNodes.isNotEmpty() && productTextNodes.isNotEmpty(),
      nodes = textNodes.size,
      prices = priceNodes.size,
      rawPrices = rawPriceNodes.size,
      texts = productTextNodes.size,
      safeTop = safeTop,
      recommendation = recommendationTop != null
    )
  }

  private fun scrollShopeeLikedList(): Boolean {
    logStep("เลื่อนหน้าถูกใจแบบสั้นเพื่อไม่ข้ามสินค้า")
    if (swipeUpByScreen(durationMs = 360L, startFraction = 0.76f, endFraction = 0.52f)) return true
    return scrollFirstScrollableForward(allowedPackageName = TARGET_PACKAGE_SHOPEE)
  }

  private fun scrapeVisibleShopeeLikedProductCandidates(): Pair<List<ShopeeLikedProductCandidate>, Boolean> {
    val root = rootInActiveWindow ?: return emptyList<ShopeeLikedProductCandidate>() to false
    val screen = screenBounds(root)
    val textNodes = mutableListOf<TextNode>()
    collectTextNodes(root, textNodes, allowedPackageName = TARGET_PACKAGE_SHOPEE)
    if (textNodes.isEmpty()) return emptyList<ShopeeLikedProductCandidate>() to false

    val safeTop = likedProductSafeTop(textNodes, screen)
    val safeBottom = screen.bottom - (screen.height() * 0.08f).toInt()
    if (textNodes.any { node ->
        node.bounds.centerY() in safeTop..safeBottom && SHOPEE_PRODUCT_DETAIL_MARKERS.any { marker ->
          node.text.contains(marker, ignoreCase = true)
        }
      }
    ) {
      return emptyList<ShopeeLikedProductCandidate>() to false
    }

    val recommendationTop = findShopeeRecommendationStartY(textNodes)
    val visibleTextNodes = textNodes.filter { node ->
      val centerY = node.bounds.centerY()
      centerY in safeTop..safeBottom && (recommendationTop == null || node.bounds.top < recommendationTop)
    }
    val imageNodes = mutableListOf<ShopeeImageNode>()
    collectShopeeImageNodes(root, imageNodes, allowedPackageName = TARGET_PACKAGE_SHOPEE)
    val visibleImageNodes = imageNodes.filter { node ->
      val centerY = node.bounds.centerY()
      centerY in safeTop..safeBottom && (recommendationTop == null || node.bounds.top < recommendationTop)
    }
    val priceNodes = findPriceNodes(visibleTextNodes)
      .sortedWith(compareBy<TextNode> { it.bounds.top }.thenBy { it.bounds.left })
    val productTextNodes = visibleTextNodes
      .filter { textNode ->
        val text = cleanNodeText(textNode.text)
        text.isNotBlank() &&
          !PRICE_REGEX.containsMatchIn(text) &&
          isProductNameCandidate(text)
      }
    val products = linkedMapOf<String, ShopeeLikedProductCandidate>()
    val seenCardBuckets = mutableSetOf<String>()
    var duplicateCount = 0
    var noNameCount = 0

    for (priceNode in priceNodes) {
      val candidate = buildProductCandidateFromPriceNode(
        visibleTextNodes = visibleTextNodes,
        productTextNodes = productTextNodes,
        imageNodes = visibleImageNodes,
        priceNode = priceNode,
        screen = screen,
        safeTop = safeTop
      )
      if (candidate == null) {
        noNameCount += 1
        continue
      }

      val cardBucket = shopeeLikedCardBucket(candidate.tapBounds, priceNode.bounds, screen)
      val productKey = candidate.product.externalProductId ?: stableProductKey(candidate.product)
      if (!seenCardBuckets.add(cardBucket) || products.containsKey(productKey)) {
        duplicateCount += 1
        continue
      }
      products[productKey] = candidate
    }

    logStep(
      "สแกนหน้าถูกใจพบ ${products.size} รายการ " +
        "(ราคา=${priceNodes.size}, text=${productTextNodes.size}, ซ้ำ=$duplicateCount, noName=$noNameCount)"
    )
    return products.values.toList() to (recommendationTop != null)
  }

  private fun buildProductCandidateFromPriceNode(
    visibleTextNodes: List<TextNode>,
    productTextNodes: List<TextNode>,
    imageNodes: List<ShopeeImageNode>,
    priceNode: TextNode,
    screen: Rect,
    safeTop: Int
  ): ShopeeLikedProductCandidate? {
    val price = normalizePrice(priceNode.text) ?: return null
    val columnWidth = shopeeLikedColumnWidth(screen)
    val nameMatches = productTextNodes.mapNotNull { nameNode ->
      val name = cleanNodeText(nameNode.text)
      val gap = priceNode.bounds.top - nameNode.bounds.bottom
      if (gap < -20 || gap > 340) return@mapNotNull null
      if (!isSameShopeeLikedProductColumn(nameNode.bounds, priceNode.bounds, columnWidth)) {
        return@mapNotNull null
      }
      ShopeeLikedNameMatch(
        verticalGap = kotlin.math.abs(gap),
        negativeBottom = -nameNode.bounds.bottom,
        left = nameNode.bounds.left,
        top = nameNode.bounds.top,
        name = name,
        node = nameNode
      )
    }.sortedWith(
      compareBy<ShopeeLikedNameMatch> { it.verticalGap }
        .thenBy { it.negativeBottom }
        .thenBy { it.left }
        .thenBy { it.top }
    )

    val nameMatch = nameMatches.firstOrNull() ?: return null
    val name = nameMatch.name.take(180)
    if (name.length < 5) return null

    val relatedTexts = visibleTextNodes.filter { textNode ->
      isSameShopeeLikedProductColumn(textNode.bounds, priceNode.bounds, columnWidth) &&
        textNode.bounds.bottom >= nameMatch.node.bounds.top - 24 &&
        textNode.bounds.top <= priceNode.bounds.bottom + (screen.height() * 0.16f).toInt()
    }
    val productUrl = relatedTexts.firstNotNullOfOrNull { extractUrl(it.text) }
    val externalProductId = productUrl?.let { extractShopeeProductIdFromUrl(it) }
      ?: fallbackShopeeProductIdFromName(name)
    val stock = relatedTexts.firstNotNullOfOrNull { extractStock(it.text) }
    val imageUrl = findShopeeLikedProductImageUrl(
      imageNodes = imageNodes,
      nameBounds = nameMatch.node.bounds,
      priceBounds = priceNode.bounds,
      screen = screen,
      safeTop = safeTop
    )

    val product = ShopeeLikedProduct(
      name = name,
      price = price,
      stock = stock,
      productUrl = productUrl,
      externalProductId = externalProductId,
      imageUrl = imageUrl,
      status = "liked",
      scrapedAt = System.currentTimeMillis()
    )

    val tapBounds = nameMatch.node.bounds
    if (!isShopeeLikedProductTapBoundsSafe(tapBounds, screen, safeTop)) return null
    return ShopeeLikedProductCandidate(product, Rect(tapBounds), safeTop)
  }

  private fun findShopeeRecommendationStartY(textNodes: List<TextNode>): Int? =
    textNodes
      .filter { node ->
        val compact = node.text.replace(Regex("""\s+"""), "").lowercase(Locale.ROOT)
        SHOPEE_RECOMMENDATION_TEXTS.any { marker ->
          compact.contains(marker.replace(Regex("""\s+"""), "").lowercase(Locale.ROOT))
        }
      }
      .minOfOrNull { it.bounds.top }

  private fun enrichShopeeProductFromDetail(
    candidate: ShopeeLikedProductCandidate,
    copyProductUrl: Boolean
  ): ShopeeLikedProduct? {
    val product = candidate.product
    if (!openShopeeProductDetail(candidate)) {
      logStep("เปิด detail ไม่สำเร็จ ข้าม: ${product.name.take(34)}")
      return null
    }

    try {
      val detailState = waitForShopeeProductDetailReady(12_000L)
      when (detailState) {
        ShopeeDetailScreenState.READY -> Unit
        ShopeeDetailScreenState.NO_PRODUCT -> {
          logStep("Shopee แจ้งว่าไม่มีสินค้านี้ ข้าม: ${product.name.take(34)}")
          dismissShopeeNoProductDialog()
          return null
        }
        ShopeeDetailScreenState.LIST -> {
          logStep("เปิด detail ไม่สำเร็จ ยังอยู่หน้ารายการถูกใจ")
          return null
        }
        ShopeeDetailScreenState.LOADING -> {
          logStep("detail โหลดไม่สำเร็จ ข้าม: ${product.name.take(34)}")
          return null
        }
      }

      val detailPrice = findShopeeDetailPrice() ?: product.price
      val imageUrl = findShopeeDetailImageUrl() ?: product.imageUrl
      val productUrl = if (copyProductUrl) {
        logStep("รอหน้า detail นิ่งก่อนแชร์สินค้า")
        sleepStep(900L)
        copyShopeeProductUrlFromDetail() ?: product.productUrl
      } else {
        logStep("ข้ามคัดลอกลิงก์สินค้าเพื่อลด memory ตอน import")
        product.productUrl
      }
      val externalProductId = productUrl?.let { extractShopeeProductIdFromUrl(it) }
        ?: product.externalProductId
        ?: fallbackShopeeProductIdFromName(product.name)

      if (imageUrl != null) {
        logStep("ได้รูปจาก detail")
      }
      if (productUrl != null) {
        logStep("ได้ลิงก์สินค้า")
      }

      return product.copy(
        price = detailPrice,
        productUrl = productUrl,
        externalProductId = externalProductId,
        imageUrl = imageUrl,
        scrapedAt = System.currentTimeMillis()
      )
    } finally {
      returnToShopeeLikedList()
    }
  }

  private fun openShopeeProductDetail(candidate: ShopeeLikedProductCandidate): Boolean {
    val screen = screenBounds(rootInActiveWindow)
    val tapX = candidate.tapBounds.centerX().toFloat()
    val tapY = candidate.tapBounds.centerY().toFloat()
    if (!isShopeeLikedProductTapBoundsSafe(candidate.tapBounds, screen, candidate.safeTop)) {
      return false
    }
    logStep("กดสินค้าในรายการ (${tapX.toInt()},${tapY.toInt()})")
    return tapBlocking(tapX, tapY)
  }

  private fun waitForShopeeProductDetailReady(timeoutMs: Long, listGraceMs: Long = 3200L): ShopeeDetailScreenState {
    val start = System.currentTimeMillis()
    var lastLog = 0L
    var listSeenSince: Long? = null
    logStep("รอหน้า detail โหลด สูงสุด ${(timeoutMs / 1000.0).formatOneDecimal()} วิ")
    while (System.currentTimeMillis() - start < timeoutMs) {
      checkStopRequested()
      val state = getShopeeProductDetailScreenState()
      val now = System.currentTimeMillis()

      if (state == ShopeeDetailScreenState.READY) {
        logStep("หน้า detail โหลดพร้อมแล้ว (${((now - start) / 1000.0).formatOneDecimal()} วิ)")
        return state
      }
      if (state == ShopeeDetailScreenState.NO_PRODUCT) {
        return state
      }

      if (state == ShopeeDetailScreenState.LIST) {
        val seenSince = listSeenSince
        if (seenSince == null) {
          listSeenSince = now
        } else if (now - seenSince >= listGraceMs) {
          return state
        }
      } else {
        listSeenSince = null
      }

      if (now - lastLog > 2500L) {
        val stateText = if (state == ShopeeDetailScreenState.LIST) "ยังอยู่หน้ารายการ" else "กำลังโหลด"
        logStep("รอหน้า detail ($stateText) ${((now - start) / 1000.0).formatOneDecimal()} วิ")
        lastLog = now
      }
      sleepStep(350L)
    }
    return getShopeeProductDetailScreenState()
  }

  private fun getShopeeProductDetailScreenState(): ShopeeDetailScreenState {
    val root = rootInActiveWindow ?: return ShopeeDetailScreenState.LOADING
    val screen = screenBounds(root)
    val filterLabels = setOf("ทั้งหมด", "สถานะ", "ส่วนลด", "หมวดหมู่")
    val detailKeywords = listOf(
      "ซื้อเลย",
      "เพิ่มไปยังรถเข็น",
      "เพิ่มลงรถเข็น",
      "เลือกตัวเลือก",
      "รายละเอียดสินค้า",
      "คะแนนสินค้า",
      "Buy Now",
      "Add to Cart",
      "Product Details",
      "Product Ratings"
    )
    val noProductKeywords = listOf(
      "ไม่มีสินค้าที่คุณหา",
      "ไม่พบสินค้า",
      "สินค้านี้ไม่มีอยู่",
      "สินค้าไม่พร้อมใช้งาน",
      "This product does not exist",
      "Product does not exist",
      "not available"
    )

    val texts = mutableListOf<String>()
    var listFilterHits = 0
    var detailHits = 0
    var topActionHits = 0
    var noProductDialog = false

    fun visit(node: AccessibilityNodeInfo?) {
      if (node == null) return
      if (node.packageName?.toString() == TARGET_PACKAGE_SHOPEE) {
        val bounds = Rect()
        node.getBoundsInScreen(bounds)
        val resourceId = node.viewIdResourceName.orEmpty()
        val text = cleanNodeText(readNodeText(node))
        val lowerText = text.lowercase(Locale.ROOT)
        val lowerRaw = "$lowerText ${resourceId.lowercase(Locale.ROOT)}".trim()

        if (text.isNotBlank()) {
          texts += lowerText
          if (filterLabels.any { label -> text.equals(label, ignoreCase = true) }) {
            listFilterHits += 1
          }
          if (noProductKeywords.any { marker -> text.contains(marker, ignoreCase = true) }) {
            noProductDialog = true
          }
          if (detailKeywords.any { marker -> text.contains(marker, ignoreCase = true) }) {
            detailHits += 1
          }
          if (PRICE_REGEX.containsMatchIn(text)) {
            detailHits += 1
          }
        }

        if (resourceId.endsWith("sectionProductPrice", ignoreCase = true) || resourceId.contains("imageCover_", ignoreCase = true)) {
          detailHits += 1
        }

        val isTopActionIcon = node.isVisibleToUser &&
          bounds.top >= screen.top + screen.height() * 0.035f &&
          bounds.bottom <= screen.top + screen.height() * 0.14f &&
          bounds.left >= screen.left + screen.width() * 0.45f &&
          bounds.width() in 36..maxOf(120, (screen.width() * 0.18f).toInt()) &&
          bounds.height() in 36..maxOf(120, (screen.height() * 0.10f).toInt())

        if (isTopActionIcon && resourceId.endsWith("buttonActionBarIconItem", ignoreCase = true)) {
          topActionHits += 1
        } else if (
          node.isVisibleToUser &&
          (lowerRaw.contains("share") || lowerRaw.contains("แชร์")) &&
          bounds.bottom <= screen.top + screen.height() * 0.28f &&
          bounds.right >= screen.left + screen.width() * 0.45f
        ) {
          topActionHits += 1
        }
      }

      for (index in 0 until node.childCount) {
        visit(node.getChild(index))
      }
    }

    visit(root)

    if (noProductDialog) return ShopeeDetailScreenState.NO_PRODUCT

    val joined = texts.joinToString(" ")
    if (joined.contains("มุมมองผู้ซื้อ") || listFilterHits >= 2) {
      return ShopeeDetailScreenState.LIST
    }

    if (topActionHits > 0 && detailHits > 0) {
      return ShopeeDetailScreenState.READY
    }

    return ShopeeDetailScreenState.LOADING
  }

  private fun isShopeeProductDetailVisible(): Boolean =
    getShopeeProductDetailScreenState() == ShopeeDetailScreenState.READY

  private fun dismissShopeeNoProductDialog(): Boolean {
    if (getShopeeProductDetailScreenState() != ShopeeDetailScreenState.NO_PRODUCT) return false
    if (
      clickByAnyText(
        listOf("ย้อนกลับ", "กลับ", "ตกลง", "OK"),
        exact = false,
        allowedPackageName = TARGET_PACKAGE_SHOPEE
      )
    ) {
      sleepStep(800L)
      return true
    }

    val backed = performBack()
    sleepStep(800L)
    return backed
  }

  private fun findShopeeDetailPrice(): String? {
    val root = rootInActiveWindow ?: return null
    val textNodes = mutableListOf<TextNode>()
    collectTextNodes(root, textNodes, allowedPackageName = TARGET_PACKAGE_SHOPEE)
    val screen = screenBounds(root)
    val candidates = textNodes.filter { node ->
      node.bounds.top in (screen.top + (screen.height() * 0.25f).toInt())..(screen.top + (screen.height() * 0.78f).toInt())
    }
    return findPriceNodes(candidates).firstOrNull()?.text?.let { normalizePrice(it) }
  }

  private fun findShopeeDetailImageUrl(): String? {
    val root = rootInActiveWindow ?: return null
    findShopeeDetailImageResourceUrl(root)?.let { return it }
    val imageId = findDetailImageCoverId(root) ?: return null
    return "https://down-th.img.susercontent.com/file/$imageId"
  }

  private fun findShopeeDetailImageResourceUrl(root: AccessibilityNodeInfo): String? {
    val screen = screenBounds(root)
    val imageNodes = mutableListOf<ShopeeImageNode>()
    collectShopeeImageNodes(root, imageNodes, allowedPackageName = TARGET_PACKAGE_SHOPEE)
    return imageNodes
      .filter { node ->
        node.bounds.top <= screen.top + (screen.height() * 0.55f).toInt() &&
          node.bounds.width() >= screen.width() * 0.22f &&
          node.bounds.height() >= screen.width() * 0.22f
      }
      .minByOrNull { node ->
        kotlin.math.abs(node.bounds.centerX() - screen.centerX()) + node.bounds.top
      }
      ?.imageUrl
  }

  private fun findDetailImageCoverId(node: AccessibilityNodeInfo?): String? {
    if (node == null) return null
    val resourceName = node.viewIdResourceName.orEmpty()
    val markerIndex = resourceName.indexOf("imageCover_")
    if (markerIndex >= 0) {
      val imageId = resourceName.substring(markerIndex + "imageCover_".length).trim()
      if (imageId.length >= 12) return imageId
    }
    for (index in 0 until node.childCount) {
      val found = findDetailImageCoverId(node.getChild(index))
      if (found != null) return found
    }
    return null
  }

  private fun copyShopeeProductUrlFromDetail(): String? {
    val clipboard = getSystemService(CLIPBOARD_SERVICE) as? ClipboardManager ?: run {
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
      logStep("กำลังเปิดแผงแชร์สินค้า")
      if (!openShopeeShareSheet()) {
        logStep("เปิดแผ่นแชร์สินค้าไม่สำเร็จ ข้ามลิงก์")
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

  private fun readClipboardText(clipboard: ClipboardManager): String {
    return try {
      val clip = clipboard.primaryClip ?: return ""
      if (clip.itemCount <= 0) return ""
      clip.getItemAt(0)?.coerceToText(this)?.toString().orEmpty()
    } catch (error: Exception) {
      Log.w(TAG, "Unable to read clipboard", error)
      ""
    }
  }

  private fun waitForShopeeClipboardUrl(
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

  private fun readClipboardTextWithForegroundBridge(requestId: String): String {
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

  private fun readClipboardBridgeResult(resultFile: File, requestId: String): String? {
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

  private fun extractShopeeUrlFromClipboard(
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

  private fun openShopeeShareSheet(): Boolean {
    try {
      if (isShopeeShareSheetVisible()) return true

      repeat(2) {
        checkStopRequested()
        if (clickTopShopeeShareButton()) {
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

  private fun isShopeeShareSheetVisible(): Boolean {
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

  private fun clickTopShopeeShareButton(): Boolean {
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

  private fun tapBlockingWithoutStopButton(
    x: Float,
    y: Float,
    timeoutMs: Long = 2500L,
    durationMs: Long = 80L
  ): Boolean {
    setAutomationStopButtonVisibleBlocking(false)
    sleepStep(120L)
    return try {
      tapBlocking(x, y, timeoutMs = timeoutMs, durationMs = durationMs)
    } finally {
      sleepStep(260L)
      setAutomationStopButtonVisibleBlocking(true)
    }
  }

  private fun collectShopeeShareActionCandidates(
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

  private fun findShopeeCopyLinkTapPoint(): ShopeeCopyLinkTapPoint? {
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

  private fun tapShopeeCopyLink(): Boolean {
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

  private fun returnToShopeeLikedList(): Boolean {
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
      if (isShopeeLikedListVisible()) {
        if (attempt > 0) logStep("กลับหน้ารายการถูกใจแล้ว")
        return true
      }
      val actionLabel = if (isShopeeProductDetailVisible()) "กดกลับจากหน้า detail" else "กด back กลับหน้ารายการถูกใจ"
      logStep("$actionLabel (${attempt + 1}/6)")
      val backed = performBack()
      sleepStep(700L)
      if (!isShopeeLikedListVisible() && (isShopeeProductDetailVisible() || !backed)) {
        tapShopeeTopBackFallback()
      }
      sleepStep(900L)
    }
    val returned = isShopeeLikedListVisible()
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

  private fun tapShopeeTopBackFallback(): Boolean {
    val screen = screenBounds(rootInActiveWindow)
    val x = screen.left + screen.width() * 0.065f
    val y = screen.top + screen.height() * 0.07f
    return tapBlocking(x, y, timeoutMs = 1800L, durationMs = 90L)
  }

  private fun normalizePrice(text: String): String? {
    val match = PRICE_REGEX.find(text) ?: return null
    return match.groupValues.getOrNull(1)?.replace(",", "")?.takeIf { it.isNotBlank() }
  }

  private fun findPriceNodes(textNodes: List<TextNode>): List<TextNode> {
    val prices = mutableListOf<TextNode>()
    prices += textNodes.filter { PRICE_REGEX.containsMatchIn(it.text) }

    val currencyNodes = textNodes.filter { node ->
      node.text == "฿" || node.text.equals("B", ignoreCase = true)
    }
    for (currencyNode in currencyNodes) {
      val numberNode = textNodes
        .filter { candidate ->
          PRICE_NUMBER_REGEX.matches(candidate.text.replace(",", "")) &&
            candidate.bounds.left >= currencyNode.bounds.right - 2 &&
            verticalOverlap(currencyNode.bounds, candidate.bounds) > 0
        }
        .minByOrNull { candidate ->
          kotlin.math.abs(candidate.bounds.centerY() - currencyNode.bounds.centerY()) +
            kotlin.math.abs(candidate.bounds.left - currencyNode.bounds.right)
        } ?: continue

      val bounds = Rect(currencyNode.bounds)
      bounds.union(numberNode.bounds)
      prices += TextNode("${currencyNode.text}${numberNode.text}", bounds, currencyNode.node)
    }

    return prices.distinctBy { "${it.text}:${it.bounds.left}:${it.bounds.top}:${it.bounds.right}:${it.bounds.bottom}" }
  }

  private fun verticalOverlap(first: Rect, second: Rect): Int =
    (minOf(first.bottom, second.bottom) - maxOf(first.top, second.top)).coerceAtLeast(0)

  private fun extractStock(text: String): Int? {
    val match = STOCK_REGEX.find(text) ?: return null
    val value = (match.groupValues.getOrNull(1).orEmpty().ifBlank { match.groupValues.getOrNull(2).orEmpty() })
      .replace(",", "")
    return value.toIntOrNull()
  }

  private fun extractUrl(text: String): String? = URL_REGEX.find(text)?.value

  private fun extractShopeeImageUrl(value: String?): String? {
    val raw = value?.trim().orEmpty()
    if (raw.isBlank()) return null

    val matchedUrl = URL_REGEX.find(raw)?.value
      ?: raw.takeIf { it.startsWith("http://", ignoreCase = true) || it.startsWith("https://", ignoreCase = true) }
      ?: return null
    val cleanUrl = matchedUrl.trim().trim('"', '\'', '<', '>', ')', ']')
    if (!cleanUrl.contains("/file/", ignoreCase = true)) return null
    if (
      !cleanUrl.contains("shopee", ignoreCase = true) &&
      !cleanUrl.contains("susercontent", ignoreCase = true)
    ) {
      return null
    }

    val uri = runCatching { Uri.parse(cleanUrl) }.getOrNull() ?: return null
    val imageId = uri.encodedPath
      ?.substringAfter("/file/", "")
      ?.substringBefore("/")
      ?.substringBefore("?")
      ?.substringBefore("#")
      ?.trim()
      .orEmpty()
      .replace(Regex("""(_tn(?:_[A-Za-z0-9]+)?|_resize[^/?#]*)$"""), "")

    if (imageId.length < 12) return null

    val host = uri.host.orEmpty()
    val imageHost = if (host.contains("susercontent", ignoreCase = true)) {
      host
    } else {
      "down-th.img.susercontent.com"
    }

    return "https://$imageHost/file/$imageId"
  }

  private fun findShopeeLikedProductImageUrl(
    imageNodes: List<ShopeeImageNode>,
    nameBounds: Rect,
    priceBounds: Rect,
    screen: Rect,
    safeTop: Int
  ): String? {
    if (imageNodes.isEmpty()) return null

    val columnWidth = shopeeLikedColumnWidth(screen)
    val regionTop = (minOf(nameBounds.top, priceBounds.top) - (screen.height() * 0.34f).toInt())
      .coerceAtLeast(safeTop)
    val regionBottom = (priceBounds.bottom + (screen.height() * 0.10f).toInt())
      .coerceAtMost(screen.bottom)

    return imageNodes
      .filter { image ->
        val centerY = image.bounds.centerY()
        centerY in regionTop..regionBottom &&
          image.bounds.width() >= 32 &&
          image.bounds.height() >= 32 &&
          isSameShopeeLikedProductColumn(image.bounds, priceBounds, columnWidth)
      }
      .minByOrNull { image ->
        val belowPricePenalty = if (image.bounds.top > priceBounds.bottom) 10_000 else 0
        val belowNamePenalty = if (image.bounds.top > nameBounds.bottom) 2_000 else 0
        val centerPenalty = kotlin.math.abs(image.bounds.centerX() - priceBounds.centerX())
        val verticalPenalty = kotlin.math.abs(image.bounds.bottom - nameBounds.top)
        belowPricePenalty + belowNamePenalty + centerPenalty + verticalPenalty
      }
      ?.imageUrl
  }

  private fun extractShopeeProductIdFromUrl(url: String): String? {
    extractShopeeProductIdFromResolvedUrl(url)?.let { return it }
    val resolvedUrl = if (url.contains("s.shopee", ignoreCase = true)) resolveShopeeUrl(url) else url
    return extractShopeeProductIdFromResolvedUrl(resolvedUrl)
  }

  private fun fallbackShopeeProductIdFromName(name: String): String? {
    val normalized = name.trim().lowercase(Locale.ROOT)
    if (normalized.isBlank()) return null
    val digest = MessageDigest.getInstance("SHA-1").digest(normalized.toByteArray(Charsets.UTF_8))
    val hash = digest.joinToString("") { byte ->
      (byte.toInt() and 0xff).toString(16).padStart(2, '0')
    }.take(16)
    return "shopee:$hash"
  }

  private fun resolveShopeeUrl(rawUrl: String): String {
    var current = rawUrl.trim()
    if (current.isBlank()) return ""

    repeat(5) {
      checkStopRequested()
      try {
        val connection = (URL(current).openConnection() as HttpURLConnection).apply {
          instanceFollowRedirects = false
          connectTimeout = 5000
          readTimeout = 5000
          requestMethod = "GET"
          setRequestProperty("User-Agent", "Mozilla/5.0 (Linux; Android) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36")
          setRequestProperty("Accept-Language", "th-TH,th;q=0.9,en;q=0.8")
        }
        val status = connection.responseCode
        val location = connection.getHeaderField("Location")
        connection.disconnect()
        if (status in 300..399 && !location.isNullOrBlank()) {
          current = URL(URL(current), location).toString()
          if (extractShopeeProductIdFromResolvedUrl(current) != null) return current
          return@repeat
        }
        return connection.url?.toString() ?: current
      } catch (_: Exception) {
        return current
      }
    }
    return current
  }

  private fun extractShopeeProductIdFromResolvedUrl(url: String): String? {
    val cleanUrl = url.trim()
    if (cleanUrl.isBlank()) return null
    val uri = runCatching { Uri.parse(cleanUrl) }.getOrNull()
    val host = uri?.host.orEmpty()
    if (host.isNotBlank() && !host.contains("shopee.", ignoreCase = true)) return null

    val shopIdFromQuery = listOf("shopid", "shop_id", "shopId")
      .firstNotNullOfOrNull { key -> uri?.getQueryParameter(key)?.takeIf { value -> value.all { it.isDigit() } } }
    val itemIdFromQuery = listOf("itemid", "item_id", "itemId")
      .firstNotNullOfOrNull { key -> uri?.getQueryParameter(key)?.takeIf { value -> value.all { it.isDigit() } } }
    if (!shopIdFromQuery.isNullOrBlank() && !itemIdFromQuery.isNullOrBlank()) {
      return "shopee:$shopIdFromQuery:$itemIdFromQuery"
    }

    val path = uri?.encodedPath?.let { Uri.decode(it) } ?: cleanUrl
    val haystack = "$path/"
    val patterns = listOf(
      Regex("""/product/(\d{4,})/(\d{4,})(?:$|[/?#])""", RegexOption.IGNORE_CASE),
      Regex("""(?:^|/)(\d{4,})/(\d{4,})(?:$|[/?#])""", RegexOption.IGNORE_CASE),
      Regex("""(?:^|[./-])i\.(\d{4,})\.(\d{4,})(?:$|[/?#])""", RegexOption.IGNORE_CASE)
    )
    for (pattern in patterns) {
      val match = pattern.find(haystack) ?: continue
      val shopId = match.groupValues.getOrNull(1).orEmpty()
      val itemId = match.groupValues.getOrNull(2).orEmpty()
      if (shopId.isNotBlank() && itemId.isNotBlank()) return "shopee:$shopId:$itemId"
    }
    return null
  }

  private fun isProductNameCandidate(text: String): Boolean {
    if (text.length < 6) return false
    if (PRICE_REGEX.containsMatchIn(text)) return false
    if (text.all { it.isDigit() || it == ',' || it == '.' }) return false
    val lower = text.lowercase(Locale.ROOT)
    val compact = lower.replace(Regex("""\s+"""), "")
    if (Regex("""^[0-9\s.%+xX]+$""").matches(text)) return false
    val blockedExact = listOf("ขายดี")
    if (blockedExact.any { compact == it.lowercase(Locale.ROOT).replace(Regex("""\s+"""), "") }) {
      return false
    }
    val blocked = listOf(
      "หน้าแรก", "mall", "live", "video", "สำหรับคุณ", "การแจ้งเตือน", "ฉัน",
      "สิ่งที่ฉันถูกใจ", "รายการถูกใจ", "liked", "ค้นหา", "แก้ไข", "edit",
      "โค้ดลด", "ส่วนลด", "coins", "coin", "เช็คอิน", "รับ", "ซื้อเลย",
      "ขายแล้ว", "ส่งฟรี", "วันที่", "แนะนำ", "ดูเพิ่มเติม", "ช้อปปี้ถูกชัวร์",
      "ถูกชัวร์", "spaylater", "payday", "flashsale", "มีบริการติดตั้ง", "ผ่อน"
    )
    return blocked.none { compact.contains(it.lowercase(Locale.ROOT).replace(Regex("""\s+"""), "")) }
  }

  private fun stableProductKey(product: ShopeeLikedProduct): String =
    "${product.name.trim().lowercase(Locale.ROOT)}\u0000${product.price.orEmpty()}"

  private fun shopeeLikedCandidateAttemptKey(product: ShopeeLikedProduct): String =
    product.externalProductId
      ?: product.productUrl
      ?: cleanNodeText(product.name)
        .lowercase(Locale.ROOT)
        .replace(Regex("""\s+"""), "")

  private fun likedProductSafeTop(textNodes: List<TextNode>, screen: Rect): Int {
    val markerBottom = textNodes
      .filter { textNode -> SHOPEE_LIKED_TEXTS.any { textNode.text.contains(it, ignoreCase = true) } }
      .maxOfOrNull { it.bounds.bottom }
    val searchBottom = textNodes
      .filter { it.text.contains("ค้นหา", ignoreCase = true) || it.text.contains("Search", ignoreCase = true) }
      .maxOfOrNull { it.bounds.bottom }
    return ((listOfNotNull(markerBottom, searchBottom) + (screen.top + 120)).maxOrNull() ?: (screen.top + 120)) + 12
  }

  private fun shopeeLikedColumnWidth(screen: Rect): Int =
    if (screen.width() >= 600) maxOf(220, screen.width() / 2) else screen.width()

  private fun isSameShopeeLikedProductColumn(first: Rect, second: Rect, columnWidth: Int): Boolean =
    kotlin.math.abs(first.centerX() - second.centerX()).toFloat() <= columnWidth * 0.52f

  private fun shopeeLikedCardBucket(tapBounds: Rect, priceBounds: Rect, screen: Rect): String {
    val column = if (priceBounds.centerX() < screen.centerX()) 0 else 1
    val yBucketSize = maxOf(180, screen.height() / 6)
    val midY = (tapBounds.centerY() + priceBounds.centerY()) / 2
    return "$column:${midY / yBucketSize}"
  }

  private fun isShopeeLikedProductTapBoundsSafe(tapBounds: Rect, screen: Rect, safeTop: Int): Boolean {
    val tapX = tapBounds.centerX()
    val tapY = tapBounds.centerY()
    return tapBounds.width() > 0 &&
      tapBounds.height() > 0 &&
      tapX > screen.left &&
      tapX < screen.right &&
      tapY > safeTop &&
      tapY < screen.bottom - (screen.height() * 0.08f).toInt()
  }

  private fun candidateRowBounds(node: AccessibilityNodeInfo, fallback: Rect, safeTop: Int, screen: Rect): Rect {
    var current: AccessibilityNodeInfo? = node
    var best = Rect(
      screen.left,
      (fallback.top - screen.height() * 0.16f).toInt().coerceAtLeast(safeTop),
      screen.right,
      (fallback.bottom + screen.height() * 0.14f).toInt().coerceAtMost(screen.bottom)
    )

    while (current != null) {
      val bounds = Rect()
      current.getBoundsInScreen(bounds)
      val height = bounds.height()
      val width = bounds.width()
      if (
        bounds.top >= safeTop - 24 &&
        bounds.bottom <= screen.bottom &&
        height in 72..420 &&
        width >= (screen.width() * 0.45f)
      ) {
        best = Rect(bounds)
      }
      if (height > screen.height() * 0.7f) break
      current = current.parent
    }

    return best
  }

  private fun collectTextNodes(
    node: AccessibilityNodeInfo?,
    output: MutableList<TextNode>,
    allowedPackageName: String? = null
  ) {
    if (node == null) return
    val text = cleanNodeText(readNodeText(node))
    if (text.isNotBlank() && isAllowedPackageNode(node, allowedPackageName)) {
      val bounds = Rect()
      node.getBoundsInScreen(bounds)
      if (bounds.width() > 0 && bounds.height() > 0) {
        output.add(TextNode(text, bounds, node))
      }
    }

    for (index in 0 until node.childCount) {
      collectTextNodes(node.getChild(index), output, allowedPackageName)
    }
  }

  private fun collectShopeeImageNodes(
    node: AccessibilityNodeInfo?,
    output: MutableList<ShopeeImageNode>,
    allowedPackageName: String? = null
  ) {
    if (node == null) return
    if (isAllowedPackageNode(node, allowedPackageName) && node.isVisibleToUser) {
      val imageUrl = extractShopeeImageUrl(node.viewIdResourceName)
        ?: extractShopeeImageUrl(node.text?.toString())
        ?: extractShopeeImageUrl(node.contentDescription?.toString())
      if (imageUrl != null) {
        val bounds = Rect()
        node.getBoundsInScreen(bounds)
        if (bounds.width() > 0 && bounds.height() > 0) {
          output.add(ShopeeImageNode(imageUrl, bounds))
        }
      }
    }

    for (index in 0 until node.childCount) {
      collectShopeeImageNodes(node.getChild(index), output, allowedPackageName)
    }
  }

  private fun collectClickableNodes(node: AccessibilityNodeInfo?, output: MutableList<Pair<Rect, AccessibilityNodeInfo>>) {
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

  private fun readNodeText(node: AccessibilityNodeInfo): String {
    val parts = listOfNotNull(
      node.text?.toString(),
      node.contentDescription?.toString()
    )
    return parts.joinToString(" ").trim()
  }

  private fun cleanNodeText(value: String): String =
    value.replace(Regex("""\s+"""), " ").trim()

  private fun clickShopeeLikedMenu(): Boolean {
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

  private fun menuTapBounds(node: AccessibilityNodeInfo, fallback: Rect, screen: Rect): Rect {
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

  private fun clickByAnyText(
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

  private fun clickByResourceHint(hints: List<String>, allowedPackageName: String? = null): Boolean {
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

  private fun containsAnyText(
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

  private fun findMatchingNode(
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

  private fun findVisibleMatchingNode(
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

  private fun isNodeVisibleOnScreen(node: AccessibilityNodeInfo): Boolean {
    if (!node.isVisibleToUser) return false
    val bounds = Rect()
    node.getBoundsInScreen(bounds)
    if (bounds.width() <= 0 || bounds.height() <= 0) return false
    val screen = displayBounds()
    return Rect.intersects(screen, bounds)
  }

  private fun nodeMatches(
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

  private fun isAllowedPackageNode(node: AccessibilityNodeInfo, allowedPackageName: String?): Boolean =
    allowedPackageName == null || node.packageName?.toString() == allowedPackageName

  private fun containsNodeFromPackage(node: AccessibilityNodeInfo?, packageName: String): Boolean {
    if (node == null) return false
    if (node.packageName?.toString() == packageName) return true
    for (index in 0 until node.childCount) {
      if (containsNodeFromPackage(node.getChild(index), packageName)) return true
    }
    return false
  }

  private fun findNode(
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

  private fun clickNode(node: AccessibilityNodeInfo): Boolean {
    val clickable = findClickableNode(node)
    if (clickable?.performAction(AccessibilityNodeInfo.ACTION_CLICK) == true) {
      return true
    }

    return tapNodeCenter(node)
  }

  private fun tapNodeCenter(node: AccessibilityNodeInfo, durationMs: Long = 80L): Boolean {
    val bounds = Rect()
    node.getBoundsInScreen(bounds)
    if (bounds.width() <= 0 || bounds.height() <= 0) return false
    return tapBlocking(bounds.centerX().toFloat(), bounds.centerY().toFloat(), durationMs = durationMs)
  }

  private fun scrollFirstScrollableForward(allowedPackageName: String? = null): Boolean {
    val root = rootInActiveWindow ?: return false
    val node = findBestScrollableNode(root, allowedPackageName) ?: return false
    return node.performAction(AccessibilityNodeInfo.ACTION_SCROLL_FORWARD)
  }

  private fun scrollFirstScrollableBackward(allowedPackageName: String? = null): Boolean {
    val root = rootInActiveWindow ?: return false
    val node = findBestScrollableNode(root, allowedPackageName) ?: return false
    return node.performAction(AccessibilityNodeInfo.ACTION_SCROLL_BACKWARD)
  }

  private fun findBestScrollableNode(
    node: AccessibilityNodeInfo?,
    allowedPackageName: String? = null
  ): AccessibilityNodeInfo? {
    val candidates = mutableListOf<Pair<Int, AccessibilityNodeInfo>>()
    collectScrollableNodes(node, candidates, allowedPackageName)
    return candidates.maxByOrNull { it.first }?.second
  }

  private fun collectScrollableNodes(
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

  private fun swipeUpByScreen(
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

  private fun swipeDownByScreen(): Boolean {
    val bounds = screenBounds(rootInActiveWindow)
    val x = bounds.centerX().toFloat()
    val startY = bounds.top + bounds.height() * 0.35f
    val endY = bounds.top + bounds.height() * 0.78f
    return swipeBlocking(x, startY, x, endY, 520L)
  }

  private fun screenBounds(root: AccessibilityNodeInfo?): Rect {
    val bounds = Rect()
    root?.getBoundsInScreen(bounds)
    if (bounds.width() > 0 && bounds.height() > 0) {
      return bounds
    }

    val metrics = resources.displayMetrics
    return Rect(0, 0, metrics.widthPixels, metrics.heightPixels)
  }

  private fun displayBounds(): Rect {
    val metrics = resources.displayMetrics
    return Rect(0, 0, metrics.widthPixels, metrics.heightPixels)
  }

  private fun dismissShopeeBlockingPopups(): Boolean =
    clickByAnyText(
      listOf("ปิด", "Close", "ตกลง", "OK", "ข้าม", "Skip", "ไว้ทีหลัง", "Later", "Not now"),
      exact = true
    )

  @Synchronized
  private fun beginAutomationForeground(message: String) {
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
  private fun endAutomationForeground() {
    if (!automationForegroundActive) return
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
        stopForeground(STOP_FOREGROUND_REMOVE)
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

  private fun buildAutomationNotification(message: String): Notification {
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

  private fun ensureAutomationNotificationChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
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

  private fun showAutomationOverlay(message: String) {
    mainHandler.post {
      if (currentService !== this) return@post
      val textView = ensureAutomationOverlay() ?: return@post
      textView.text = latestAutomationLogText()
      textView.visibility = android.view.View.VISIBLE
      ensureAutomationStopButton()?.let { button ->
        button.text = "Stop"
        button.visibility = android.view.View.VISIBLE
      }
    }
  }

  private fun hideAutomationOverlay(delayMs: Long) {
    mainHandler.postDelayed({
      removeAutomationOverlay()
    }, delayMs)
  }

  private fun removeAutomationOverlay() {
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

  private fun setAutomationStopButtonVisibleBlocking(visible: Boolean) {
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

  private fun ensureAutomationOverlay(): TextView? {
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

  private fun ensureAutomationStopButton(): Button? {
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

  private val automationWindowManager: WindowManager
    get() = getSystemService(WINDOW_SERVICE) as WindowManager

  private fun automationOverlayTopOffset(): Int = statusBarHeightPx() + dp(8)

  private fun statusBarHeightPx(): Int {
    val resourceId = resources.getIdentifier("status_bar_height", "dimen", "android")
    return if (resourceId > 0) resources.getDimensionPixelSize(resourceId) else dp(24)
  }

  private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()

  fun performBack(): Boolean = performGlobalAction(GLOBAL_ACTION_BACK)

  private data class TextNode(
    val text: String,
    val bounds: Rect,
    val node: AccessibilityNodeInfo
  )

  private data class ShopeeImageNode(
    val imageUrl: String,
    val bounds: Rect
  )

  private data class ShopeeBottomTabCandidate(
    val node: AccessibilityNodeInfo,
    val bounds: Rect,
    val label: String,
    val rank: Int
  )

  private data class ShopeeMePageCheck(
    val visible: Boolean,
    val reason: String,
    val hasBottomMeTab: Boolean = false,
    val hasProfileHeader: Boolean = false,
    val hasPurchaseSection: Boolean = false,
    val hasLikedMenu: Boolean = false,
    val markerHits: List<String> = emptyList(),
    val visibleTextCount: Int = 0
  ) {
    fun summary(): String {
      val markers = markerHits.take(3).joinToString("/")
      return "tab=${yn(hasBottomMeTab)} header=${yn(hasProfileHeader)} purchase=${yn(hasPurchaseSection)} liked=${yn(hasLikedMenu)} markers=${markerHits.size}[${markers.ifBlank { "-" }}] text=$visibleTextCount reason=$reason"
    }

    private fun yn(value: Boolean): String = if (value) "yes" else "no"
  }

  private data class ShopeeToggleTarget(
    val node: AccessibilityNodeInfo,
    val bounds: Rect,
    val resourceId: String
  )

  private data class AutomationStatsSnapshot(
    val startedAt: Long,
    val taskLabel: String,
    val unitLabel: String,
    val currentCount: Int,
    val totalCount: Int,
    val successCount: Int,
    val failedCount: Int,
    val round: Int,
    val totalRounds: Int,
    val statusLabel: String
  )

  private data class ShopeeLikedProductCandidate(
    val product: ShopeeLikedProduct,
    val tapBounds: Rect,
    val safeTop: Int
  )

  private data class ShopeeLikedNameMatch(
    val verticalGap: Int,
    val negativeBottom: Int,
    val left: Int,
    val top: Int,
    val name: String,
    val node: TextNode
  )

  private data class ShopeeLikedProductReadinessStats(
    val ready: Boolean,
    val nodes: Int,
    val prices: Int,
    val rawPrices: Int,
    val texts: Int,
    val safeTop: Int,
    val recommendation: Boolean
  )

  private data class ShopeeCopyLinkTapPoint(
    val bounds: Rect,
    val priority: Int,
    val source: String
  )

  private enum class ShopeeDetailScreenState {
    READY,
    LIST,
    LOADING,
    NO_PRODUCT
  }

  private class ShopeeAutomationStoppedException : RuntimeException("Shopee automation stopped")

  private fun Double.formatOneDecimal(): String = String.format(Locale.ROOT, "%.1f", this)
}
