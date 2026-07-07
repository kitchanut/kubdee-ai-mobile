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
import android.widget.LinearLayout
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

internal enum class ShopeeAutomationLogKind {
  IMPORT,
  POST,
  CONVERT
}

class KubdeeAccessibilityService : AccessibilityService() {
  internal val mainHandler = Handler(Looper.getMainLooper())
  internal var overlayView: LinearLayout? = null
  internal var overlayStopButton: Button? = null
  internal var overlayReportButton: Button? = null
  internal var overlayBackButton: Button? = null
  internal var overlayTitleView: TextView? = null
  internal var overlaySubtitleView: TextView? = null
  internal var overlayChipRow: LinearLayout? = null
  internal var overlayLogContainer: LinearLayout? = null
  internal var automationTapIndicatorView: android.view.View? = null
  internal var automationOverlayUnavailable = false
  internal val automationLogLines = mutableListOf<String>()
  internal val automationStatsLock = Any()
  internal var automationForegroundActive = false
  internal var automationStartedAtMs = 0L
  internal var automationTaskLabel = "Automation"
  internal var automationUnitLabel = "STEP"
  internal var automationCurrentCount = 0
  internal var automationTotalCount = 0
  internal var automationSuccessCount = 0
  internal var automationFailedCount = 0
  internal var automationRound = 0
  internal var automationTotalRounds = 0
  internal var automationStatusLabel = "RUNNING"
  internal val automationLogKindForThread = ThreadLocal<ShopeeAutomationLogKind?>()
  internal val automationTapIndicatorEventKeyForThread = ThreadLocal<String?>()
  internal val automationTapIndicatorSequenceLock = Any()
  internal var automationTapIndicatorLastEventKey: String? = null
  internal var automationTapIndicatorLastLogEventKey: String? = null
  internal var automationTapIndicatorSequence = 0

  @Volatile
  internal var activeShopeeAutomationLogKind: ShopeeAutomationLogKind? = null

  @Volatile
  internal var automationFloatingUiSuppressed = false

  @Volatile
  internal var stopRequested = false

  @Volatile
  private var shopeeImportThread: Thread? = null

  @Volatile
  private var shopeePostThread: Thread? = null

  @Volatile
  private var shopeeConvertThread: Thread? = null

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
    private var pendingShopeeConvertCommand: PendingShopeeConvertCommand? = null

    @Volatile
    private var pendingShopeeStopRequested = false

    fun getInstance(): KubdeeAccessibilityService? = currentService

    fun isRunning(): Boolean = currentService != null

    fun dispatchShopeeImportStart(
      maxItems: Int,
      runId: String,
      profileLocalId: String?,
      importSource: String = SHOPEE_IMPORT_SOURCE_LIKED,
      offerCategory: String = SHOPEE_OFFER_CATEGORY_RECOMMENDED
    ): Boolean {
      pendingShopeeStopRequested = false
      val service = currentService
      val normalizedImportSource = normalizeShopeeImportSource(importSource)
      val normalizedOfferCategory = normalizeShopeeOfferCategory(offerCategory)
      if (service != null) {
        service.startShopeeImportAsync(maxItems, runId, profileLocalId, normalizedImportSource, normalizedOfferCategory)
        return true
      }

      pendingShopeeImportCommand = PendingShopeeImportCommand(
        maxItems,
        runId,
        profileLocalId,
        normalizedImportSource,
        normalizedOfferCategory
      )
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

    fun dispatchShopeeConvertStart(payloadJson: String, runId: String): Boolean {
      pendingShopeeStopRequested = false
      val service = currentService
      if (service != null) {
        service.startShopeeConvertAsync(payloadJson, runId)
        return true
      }

      pendingShopeeConvertCommand = PendingShopeeConvertCommand(payloadJson, runId)
      return false
    }

    fun dispatchShopeeStop(): Boolean {
      pendingShopeeImportCommand = null
      pendingShopeePostCommand = null
      pendingShopeeConvertCommand = null
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

    private fun takePendingShopeeConvertCommand(): PendingShopeeConvertCommand? {
      val command = pendingShopeeConvertCommand
      pendingShopeeConvertCommand = null
      return command
    }

    private data class PendingShopeeImportCommand(
      val maxItems: Int,
      val runId: String,
      val profileLocalId: String?,
      val importSource: String,
      val offerCategory: String
    )

    private data class PendingShopeePostCommand(
      val payloadJson: String,
      val runId: String
    )

    private data class PendingShopeeConvertCommand(
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
      startShopeeImportAsync(
        command.maxItems,
        command.runId,
        command.profileLocalId,
        command.importSource,
        command.offerCategory
      )
    }
    takePendingShopeePostCommand()?.let { command ->
      startShopeePostAsync(command.payloadJson, command.runId)
    }
    takePendingShopeeConvertCommand()?.let { command ->
      startShopeeConvertAsync(command.payloadJson, command.runId)
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
    removeAutomationOverlay(removeTapIndicator = true)
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

  internal fun setNodeText(target: AccessibilityNodeInfo, text: String): Boolean {
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

  internal fun pressImeEnterOn(target: AccessibilityNodeInfo): Boolean {
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

  private fun startShopeeImportAsync(
    maxItems: Int,
    runId: String,
    profileLocalId: String?,
    importSource: String = SHOPEE_IMPORT_SOURCE_LIKED,
    offerCategory: String = SHOPEE_OFFER_CATEGORY_RECOMMENDED
  ) {
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
      automationLogKindForThread.set(ShopeeAutomationLogKind.IMPORT)
      activeShopeeAutomationLogKind = ShopeeAutomationLogKind.IMPORT
      resetAutomationTapIndicatorSequence()
      var importedCount = 0
      var errorMessage: String? = null
      try {
        val normalizedMaxItems = if (maxItems <= 0) 0 else maxItems
        val normalizedImportSource = normalizeShopeeImportSource(importSource)
        val normalizedOfferCategory = normalizeShopeeOfferCategory(offerCategory)
        importedCount = importShopeeLikedProducts(
          TARGET_PACKAGE_SHOPEE,
          normalizedMaxItems,
          profileLocalId,
          normalizedImportSource,
          normalizedOfferCategory
        )
      } catch (error: Exception) {
        errorMessage = error.message ?: "Shopee import failed"
        Log.e(TAG, "Shopee import runner failed", error)
      } finally {
        val stoppedByUser = stopRequested
        val shouldReturnToKubdee = errorMessage == null && !stoppedByUser
        if (shouldReturnToKubdee) {
          logStep("กลับไป Kubdee AI เพื่อเปิดคลังสินค้า (${importedCount} รายการ)")
        } else if (stoppedByUser) {
          logStep("หยุดแล้ว — กด 'รายงานปัญหา' เพื่อส่งข้อมูลให้ทีม หรือ 'กลับแอป'")
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
        } else if (stoppedByUser) {
          // Stay on the current screen and offer report / back controls.
          showAutomationStoppedControls()
        }
        if (shopeeImportThread === Thread.currentThread()) {
          shopeeImportThread = null
        }
        if (activeShopeeAutomationLogKind == ShopeeAutomationLogKind.IMPORT) {
          activeShopeeAutomationLogKind = null
        }
        resetAutomationTapIndicatorSequence()
        automationTapIndicatorEventKeyForThread.remove()
        automationLogKindForThread.remove()
      }
    }.also { worker ->
      worker.name = if (normalizeShopeeImportSource(importSource) == SHOPEE_IMPORT_SOURCE_OFFERS) {
        "KubdeeShopeeOfferImport"
      } else {
        "KubdeeShopeeLikedImport"
      }
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
      automationLogKindForThread.set(ShopeeAutomationLogKind.POST)
      activeShopeeAutomationLogKind = ShopeeAutomationLogKind.POST
      resetAutomationTapIndicatorSequence()
      val result = try {
        postShopeeVideos(payloadJson)
      } catch (error: Exception) {
        Log.e(TAG, "Shopee post runner failed", error)
        JSONObject().apply {
          put("success", false)
          put("error", error.message ?: "Shopee post failed")
        }
      }

      val postStoppedByUser = stopRequested
      logStep(
        if (postStoppedByUser) "หยุดแล้ว — กด 'รายงานปัญหา' เพื่อส่งข้อมูลให้ทีม หรือ 'กลับแอป'"
        else "กลับไป Kubdee AI เพื่อเปิดรายการ Shopee Post"
      )
      KubdeeAutomationIpc.sendShopeePostFinished(
        this,
        runId,
        result,
        error = result.optString("error").takeIf { it.isNotBlank() },
        stopped = result.optBoolean("stopped", false)
      )
      if (postStoppedByUser) {
        showAutomationStoppedControls()
      } else {
        mainHandler.postDelayed({ launchKubdeeShopeePostList() }, 250L)
      }
      if (shopeePostThread === Thread.currentThread()) {
        shopeePostThread = null
      }
      if (activeShopeeAutomationLogKind == ShopeeAutomationLogKind.POST) {
        activeShopeeAutomationLogKind = null
      }
      resetAutomationTapIndicatorSequence()
      automationTapIndicatorEventKeyForThread.remove()
      automationLogKindForThread.remove()
    }.also { worker ->
      worker.name = "KubdeeShopeePosting"
      shopeePostThread = worker
      worker.start()
    }
  }

  private fun startShopeeConvertAsync(payloadJson: String, runId: String) {
    val runningThread = shopeeConvertThread
    if (runningThread?.isAlive == true) {
      KubdeeAutomationIpc.sendShopeeConvertFinished(
        this,
        runId,
        JSONObject().apply {
          put("success", false)
          put("error", "Shopee convert กำลังทำงานอยู่แล้ว")
        },
        error = "Shopee convert กำลังทำงานอยู่แล้ว"
      )
      return
    }

    val thread = Thread {
      automationLogKindForThread.set(ShopeeAutomationLogKind.CONVERT)
      activeShopeeAutomationLogKind = ShopeeAutomationLogKind.CONVERT
      resetAutomationTapIndicatorSequence()
      val result = try {
        convertShopeeLinks(payloadJson)
      } catch (error: Exception) {
        Log.e(TAG, "Shopee convert runner failed", error)
        JSONObject().apply {
          put("success", false)
          put("error", error.message ?: "Shopee convert failed")
        }
      }

      logStep("กลับไป Kubdee AI เพื่อเปิดคลังสินค้า")
      KubdeeAutomationIpc.sendShopeeConvertFinished(
        this,
        runId,
        result,
        error = result.optString("error").takeIf { it.isNotBlank() },
        stopped = result.optBoolean("stopped", false)
      )
      mainHandler.postDelayed({ launchKubdeeLibrary() }, 250L)
      if (shopeeConvertThread === Thread.currentThread()) {
        shopeeConvertThread = null
      }
      if (activeShopeeAutomationLogKind == ShopeeAutomationLogKind.CONVERT) {
        activeShopeeAutomationLogKind = null
      }
      resetAutomationTapIndicatorSequence()
      automationTapIndicatorEventKeyForThread.remove()
      automationLogKindForThread.remove()
    }.also { worker ->
      worker.name = "KubdeeShopeeLinkConvert"
      shopeeConvertThread = worker
      worker.start()
    }
  }

  @Synchronized
  fun importShopeeLikedProducts(
    targetPackage: String,
    maxItems: Int,
    profileLocalId: String? = null,
    importSource: String = SHOPEE_IMPORT_SOURCE_LIKED,
    offerCategory: String = SHOPEE_OFFER_CATEGORY_RECOMMENDED
  ): Int {
    val importedKeys = mutableSetOf<String>()
    val seenCandidateKeys = mutableSetOf<String>()
      val importAllLikedItems = maxItems <= 0
      val targetImportCount = if (importAllLikedItems) Int.MAX_VALUE else maxItems.coerceAtLeast(1)
      val normalizedImportSource = normalizeShopeeImportSource(importSource)
      val normalizedOfferCategory = normalizeShopeeOfferCategory(offerCategory)
      try {
        clearStopShopeeAutomation()
        resetAutomationLog()
        configureAutomationStats(
        if (normalizedImportSource == SHOPEE_IMPORT_SOURCE_OFFERS) {
          "Shopee Offers Import · $normalizedOfferCategory"
        } else {
          "Shopee Import"
        },
        "ITEM",
        if (importAllLikedItems) 0 else targetImportCount
      )
      beginAutomationForeground("กำลังดึงสินค้า Shopee")
      logStep("Shopee เวอร์ชัน ${shopeeAppVersionLabel(targetPackage)} · แอปทดสอบกับ $SHOPEE_TESTED_VERSION")
      val importTargetLabel = if (normalizedImportSource == SHOPEE_IMPORT_SOURCE_OFFERS) {
        "โปรแกรม Affiliate > ข้อเสนอ > $normalizedOfferCategory"
      } else {
        "สิ่งที่ฉันถูกใจ"
      }
      logStep(
        if (importAllLikedItems) {
          "เปิด Shopee > ฉัน > $importTargetLabel (ดึงทั้งหมด)"
        } else {
          "เปิด Shopee > ฉัน > $importTargetLabel (${targetImportCount} รายการ)"
        }
      )
      freeMemoryBeforeImport(targetPackage)
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

      if (normalizedImportSource == SHOPEE_IMPORT_SOURCE_OFFERS) {
        if (!openShopeeAffiliateOfferPage()) {
          throw IllegalStateException("ไม่พบหน้า โปรแกรม Affiliate > ข้อเสนอ")
        }

        if (!selectShopeeAffiliateOfferCategory(normalizedOfferCategory)) {
          throw IllegalStateException("ไม่พบหมวดข้อเสนอ $normalizedOfferCategory")
        }

        if (!waitForShopeeAffiliateOffersReady(18_000L)) {
          throw IllegalStateException("ไม่พบสินค้าในหน้าข้อเสนอ Affiliate")
        }

        var noNewRounds = 0
        val maxRounds = if (importAllLikedItems) 240 else maxOf(12, targetImportCount)
        var shareAttemptCount = 0

        for (round in 1..maxRounds) {
          checkStopRequested()
          val visibleProducts = scrapeVisibleShopeePartnerOfferCandidates(status = SHOPEE_IMPORT_SOURCE_OFFERS)
          var added = 0
          for (candidate in visibleProducts) {
            checkStopRequested()
            val candidateKey = candidate.product.externalProductId ?: candidate.product.productUrl ?: stableProductKey(candidate.product)
            val candidateAttemptKey = shopeeLikedCandidateAttemptKey(candidate.product)
            if (importedKeys.contains(candidateKey) || !seenCandidateKeys.add(candidateAttemptKey)) {
              logStep("ข้ามสินค้าข้อเสนอที่เห็นซ้ำ: ${candidate.product.name}")
              continue
            }

            shareAttemptCount += 1
            logStep("กดแชร์สินค้าข้อเสนอ $shareAttemptCount: ${candidate.product.name}")
            val product = enrichShopeeProductFromPartnerShare(candidate)?.copy(status = SHOPEE_IMPORT_SOURCE_OFFERS)
              ?: candidate.product.copy(status = SHOPEE_IMPORT_SOURCE_OFFERS)
            val key = product.externalProductId ?: product.productUrl ?: stableProductKey(product)
            if (importedKeys.add(key)) {
              seenCandidateKeys.add(shopeeLikedCandidateAttemptKey(product))
              added += 1
              updateAutomationStats(currentCount = importedKeys.size, successCount = importedKeys.size)
              logStep("บันทึกสินค้าข้อเสนอแล้ว รวม ${importedKeys.size}: ${product.name}")
              KubdeeAutomationIpc.sendShopeeImportProduct(this, product, profileLocalId = profileLocalId)
              if (!importAllLikedItems && importedKeys.size >= targetImportCount) break
            }
          }

          logStep("หน้าข้อเสนอรอบ $round พบใหม่ $added รวม ${importedKeys.size}")
          if (!importAllLikedItems && importedKeys.size >= targetImportCount) break

          noNewRounds = if (added == 0) noNewRounds + 1 else 0
          if (noNewRounds >= 3) break

          if (!scrollShopeeAffiliateOffersList()) break
          sleepStep(1500L)
        }

        return importedKeys.size
      }

      if (!openShopeeLikedList()) {
        throw IllegalStateException("ไม่พบเมนู สิ่งที่ฉันถูกใจ")
      }

      if (normalizedImportSource == SHOPEE_IMPORT_SOURCE_PARTNER_LIKED) {
        return importShopeePartnerLikedProducts(
          targetImportCount = targetImportCount,
          importAllLikedItems = importAllLikedItems,
          profileLocalId = profileLocalId,
          importedKeys = importedKeys,
          seenCandidateKeys = seenCandidateKeys
        )
      }

      if (!ensureShopeeBuyerLikedView()) {
        throw IllegalStateException("สลับเป็นมุมมองผู้ซื้อไม่สำเร็จ")
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
            logStep("ข้ามสินค้าที่เห็นซ้ำ: ${candidate.product.name}")
            continue
          }

          detailAttemptCount += 1
          logStep("เปิด detail สินค้า $detailAttemptCount: ${candidate.product.name}")
          val product = enrichShopeeProductFromDetail(
            candidate,
            copyProductUrl = COPY_SHOPEE_PRODUCT_URL_DURING_IMPORT
          ) ?: continue
          val key = product.externalProductId ?: product.productUrl ?: stableProductKey(product)
          if (importedKeys.add(key)) {
            seenCandidateKeys.add(shopeeLikedCandidateAttemptKey(product))
            added += 1
            updateAutomationStats(currentCount = importedKeys.size, successCount = importedKeys.size)
            logStep("บันทึกสินค้าแล้ว รวม ${importedKeys.size}: ${product.name}")
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

}
