package ai.kubdee.mobile.automation

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.content.ClipData
import android.content.ClipboardManager
import android.content.ContentUris
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.graphics.Path
import android.graphics.PixelFormat
import android.graphics.Rect
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.MediaStore
import android.util.Log
import android.view.Gravity
import android.view.WindowManager
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import android.widget.TextView
import java.net.HttpURLConnection
import java.net.URL
import java.util.Locale
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
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

class KubdeeAccessibilityService : AccessibilityService() {
  private val mainHandler = Handler(Looper.getMainLooper())
  private var overlayView: TextView? = null
  private val automationLogLines = mutableListOf<String>()

  @Volatile
  private var stopRequested = false

  @Volatile
  private var googleFlowStopRequested = false

  @Volatile
  private var currentGoogleFlowRunId: String? = null

  companion object {
    private const val TAG = "KubdeeAccessibility"
    private const val GOOGLE_FLOW_URL = "https://labs.google/fx/en/tools/flow"
    private const val TARGET_PACKAGE_CHROME = "com.android.chrome"
    private val SHOPEE_LIKED_TEXTS = listOf("สิ่งที่ฉันถูกใจ", "รายการถูกใจ", "Liked", "My Likes", "My liked items")
    private val SHOPEE_RECOMMENDATION_TEXTS = listOf(
      "คุณอาจจะชอบ",
      "คณอาจจะชอบ",
      "ชอบสิ่งนี้",
      "you may also like",
      "you might also like",
      "recommended for you"
    )
    private val PRICE_REGEX = Regex("""(?:฿|B)\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)""")
    private val PRICE_NUMBER_REGEX = Regex("""^[0-9][0-9,]*(?:\.[0-9]{1,2})?$""")
    private val STOCK_REGEX = Regex("""(?:ขายแล้ว|stock|สต็อก|คงเหลือ)\s*([0-9,]+)|([0-9,]+)\s*(?:ชิ้น|sold)""", RegexOption.IGNORE_CASE)
    private val URL_REGEX = Regex("""https?://[^\s]+""", RegexOption.IGNORE_CASE)

    @Volatile
    private var currentService: KubdeeAccessibilityService? = null

    fun getInstance(): KubdeeAccessibilityService? = currentService

    fun isRunning(): Boolean = currentService != null
  }

  override fun onServiceConnected() {
    super.onServiceConnected()
    currentService = this
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
      focused?.isEditable == true -> focused
      else -> findEditableNode(root)
    } ?: return false

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

  fun requestStopShopeeAutomation() {
    stopRequested = true
    logStep("กำลังหยุดงาน Shopee...")
  }

  fun clearStopShopeeAutomation() {
    stopRequested = false
  }

  fun requestStopGoogleFlowAutomation() {
    googleFlowStopRequested = true
    logGoogleFlowStep("กำลังหยุด Auto Pilot Google Flow...")
  }

  fun clearStopGoogleFlowAutomation() {
    googleFlowStopRequested = false
  }

  fun runGoogleFlowAutoPilot(payloadJson: String): Boolean {
    Thread {
      try {
        clearStopGoogleFlowAutomation()
        resetAutomationLog()
        val payload = JSONObject(payloadJson)
        val runId = payload.optString("runId", "mobile-auto")
        currentGoogleFlowRunId = runId
        val products = payload.optJSONArray("products")
        val productCount = products?.length() ?: 0
        val settings = payload.optJSONObject("settings")
        val browserMode = settings?.optString("browserMode", "chrome") ?: "chrome"
        val totalRounds = settings?.optInt("totalRounds", 1)?.coerceIn(1, 20) ?: 1
        val enabledSteps = googleFlowEnabledSteps(payload)

        if (productCount <= 0) {
          throw IllegalStateException("ไม่มีสินค้าสำหรับ Auto Pilot")
        }
        if (enabledSteps.isEmpty()) {
          throw IllegalStateException("ยังไม่ได้เลือกขั้นตอนรูป/วิดีโอ")
        }

        logGoogleFlowStep("เริ่ม Auto Pilot Google Flow ($productCount สินค้า)")
        KubdeeAccessibilityModule.emitGoogleFlowLog(
          message = "Google Flow runner เริ่มทำงาน",
          status = "running",
          runId = currentGoogleFlowRunId
        )
        emitGoogleFlowProgress(
          message = "เตรียม Auto Pilot Google Flow",
          stage = "started",
          round = 0,
          totalRounds = totalRounds,
          productIndex = 0,
          productTotal = productCount
        )
        checkGoogleFlowStopRequested()
        logGoogleFlowStep("เปิด Google Flow ด้วย browser บนมือถือ")
        if (!launchUrl(GOOGLE_FLOW_URL, preferredPackage = if (browserMode == "chrome") TARGET_PACKAGE_CHROME else null)) {
          throw IllegalStateException("เปิด Google Flow ไม่สำเร็จ")
        }

        sleepGoogleFlowStep(3500)
        logGoogleFlowStep("Google Flow เปิดแล้ว (run: ${runId.takeLast(8)})")
        if (waitForGoogleFlowReady(20_000L)) {
          logGoogleFlowStep("หน้า Google Flow พร้อมใช้งาน")
        } else {
          logGoogleFlowStep("ยังยืนยันหน้า Google Flow ไม่ได้ แต่จะลองทำงานต่อ")
        }

        val generatedImageByProductId = mutableMapOf<String, GoogleFlowDownloadedAsset>()

        for (round in 1..totalRounds) {
          checkGoogleFlowStopRequested()
          emitGoogleFlowProgress(
            message = "เริ่มรอบ $round/$totalRounds",
            stage = "round_started",
            round = round,
            totalRounds = totalRounds,
            productIndex = 0,
            productTotal = productCount
          )

          for (productIndex in 0 until productCount) {
            checkGoogleFlowStopRequested()
            val product = products?.optJSONObject(productIndex) ?: continue
            val productKey = googleFlowProductKey(product)
            val productName = product.optString("name", "สินค้า").ifBlank { "สินค้า" }
            emitGoogleFlowProgress(
              message = "สินค้า ${productIndex + 1}/$productCount: ${productName.take(38)}",
              product = product,
              stage = "product_started",
              round = round,
              totalRounds = totalRounds,
              productIndex = productIndex + 1,
              productTotal = productCount
            )

            for (step in enabledSteps) {
              val generatedAsset = runGoogleFlowProductStep(
                payload = payload,
                product = product,
                step = step,
                round = round,
                totalRounds = totalRounds,
                productIndex = productIndex + 1,
                productTotal = productCount,
                referenceAsset = if (step == "video") generatedImageByProductId[productKey] else null
              )
              if (step == "image" && generatedAsset != null) {
                generatedImageByProductId[productKey] = generatedAsset
                logGoogleFlowStep("เก็บรูปอ้างอิงสำหรับวิดีโอแล้ว: ${generatedAsset.fileName ?: generatedAsset.uri}")
              }
            }

            val delayMs = googleFlowDelayMs(settings)
            if (delayMs > 0 && productIndex < productCount - 1) {
              sleepGoogleFlowStep(delayMs)
            }
          }
        }

        logGoogleFlowStatus("Auto Pilot Google Flow จบแล้ว", "completed")
      } catch (error: GoogleFlowAutomationStoppedException) {
        logGoogleFlowStatus("หยุด Auto Pilot Google Flow แล้ว", "stopped")
      } catch (error: Exception) {
        Log.e(TAG, "Google Flow runner failed", error)
        logGoogleFlowStatus("Google Flow error: ${error.message ?: "unknown"}", "error")
      } finally {
        hideAutomationOverlay(2500L)
        currentGoogleFlowRunId = null
      }
    }.also { thread ->
      thread.name = "KubdeeGoogleFlowAutoPilot"
      thread.start()
    }

    return true
  }

  fun runShopeeSearch(targetPackage: String, keyword: String): Boolean {
    val normalizedKeyword = keyword.ifBlank { "สินค้า" }

    Thread {
      try {
        logStep("เปิด Shopee")
        if (!launchPackage(targetPackage)) {
          logStep("เปิด Shopee ไม่สำเร็จ")
          return@Thread
        }

        sleepStep(3500)
        logStep("ไปหน้าแรก Shopee")
        if (!clickByText("หน้าแรก")) {
          tapBlocking(72f, 1460f)
        }

        sleepStep(2800)
        logStep("แตะช่องค้นหา")
        tapBlocking(150f, 120f)
        sleepStep(1600)
        tapBlocking(320f, 116f)

        sleepStep(350)
        logStep("พิมพ์ keyword: $normalizedKeyword")
        if (!inputText(normalizedKeyword)) {
          logStep("พิมพ์ keyword ไม่สำเร็จ")
          return@Thread
        }

        sleepStep(650)
        logStep("กดค้นหาบน keyboard")
        if (!pressImeEnter()) {
          tapBlocking(650f, 1460f)
        }

        sleepStep(2800)
        logStep("เลื่อนผลลัพธ์")
        swipeBlocking(360f, 1320f, 360f, 560f, 540L)
        logStep("รัน Shopee Search test เสร็จแล้ว")
      } catch (error: Exception) {
        Log.e(TAG, "Shopee search runner failed", error)
      } finally {
        hideAutomationOverlay(2500L)
      }
    }.also { thread ->
      thread.name = "KubdeeShopeeSearch"
      thread.start()
    }

    return true
  }

  fun importShopeeLikedProducts(targetPackage: String, maxItems: Int): List<ShopeeLikedProduct> {
    val productsByKey = linkedMapOf<String, ShopeeLikedProduct>()
    try {
      clearStopShopeeAutomation()
      resetAutomationLog()
      logStep("เปิด Shopee > ฉัน > สิ่งที่ฉันถูกใจ")
      if (!launchPackage(targetPackage)) {
        throw IllegalStateException("เปิด Shopee ไม่สำเร็จ")
      }

      sleepStep(3500)
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
      val maxRounds = 12

      for (round in 1..maxRounds) {
        checkStopRequested()
        val (visibleProducts, reachedRecommendations) = scrapeVisibleShopeeLikedProductCandidates()
        var added = 0
        for ((index, candidate) in visibleProducts.withIndex()) {
          checkStopRequested()
          logStep("เปิด detail สินค้า ${index + 1}/${visibleProducts.size}: ${candidate.product.name.take(34)}")
          val product = enrichShopeeProductFromDetail(candidate) ?: continue
          val key = product.externalProductId ?: product.productUrl ?: stableProductKey(product)
          if (!productsByKey.containsKey(key)) {
            productsByKey[key] = product
            added += 1
            logStep("บันทึกสินค้าแล้ว รวม ${productsByKey.size}: ${product.name.take(34)}")
            if (productsByKey.size >= maxItems) break
          }
        }

        logStep("หน้าถูกใจรอบ $round พบใหม่ $added รวม ${productsByKey.size}")
        if (reachedRecommendations) {
          logStep("เจอหัวข้อ คุณอาจจะชอบสิ่งนี้ จบรายการถูกใจ")
          break
        }
        if (productsByKey.size >= maxItems) break

        noNewRounds = if (added == 0) noNewRounds + 1 else 0
        if (noNewRounds >= 3) break

        if (!scrollShopeeLikedList()) break
        sleepStep(1700)
      }

      return productsByKey.values.toList()
    } catch (error: ShopeeAutomationStoppedException) {
      logStep("หยุดดึงสินค้าแล้ว บันทึกเท่าที่พบ ${productsByKey.size} รายการ")
      return productsByKey.values.toList()
    } finally {
      hideAutomationOverlay(2500L)
    }
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

  private fun launchPackage(packageName: String): Boolean {
    val launchIntent = packageManager.getLaunchIntentForPackage(packageName) ?: return false
    launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    launchIntent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP)
    launchIntent.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP)
    startActivity(launchIntent)
    return true
  }

  private fun launchUrl(url: String, preferredPackage: String? = null): Boolean {
    val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url)).apply {
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      if (!preferredPackage.isNullOrBlank() && packageManager.getLaunchIntentForPackage(preferredPackage) != null) {
        setPackage(preferredPackage)
      }
    }
    return try {
      startActivity(intent)
      true
    } catch (_: Exception) {
      false
    }
  }

  private fun waitForGoogleFlowReady(timeoutMs: Long): Boolean {
    val start = System.currentTimeMillis()
    while (System.currentTimeMillis() - start < timeoutMs) {
      checkGoogleFlowStopRequested()
      if (
        containsAnyText(listOf("Flow", "New project", "โปรเจ็กต์ใหม่", "Create", "Generate"), contains = true) ||
        findEditableNode(rootInActiveWindow) != null
      ) {
        return true
      }
      sleepGoogleFlowStep(750)
    }
    return false
  }

  private fun runGoogleFlowProductStep(
    payload: JSONObject,
    product: JSONObject,
    step: String,
    round: Int,
    totalRounds: Int,
    productIndex: Int,
    productTotal: Int,
    referenceAsset: GoogleFlowDownloadedAsset?
  ): GoogleFlowDownloadedAsset? {
    val stepLabel = if (step == "video") "วิดีโอ" else "รูปภาพ"
    val productName = product.optString("name", "สินค้า").ifBlank { "สินค้า" }

    emitGoogleFlowProgress(
      message = "รอบ $round · เริ่มสร้าง$stepLabel $productIndex/$productTotal",
      product = product,
      step = step,
      stage = "step_started",
      round = round,
      totalRounds = totalRounds,
      productIndex = productIndex,
      productTotal = productTotal
    )
    checkGoogleFlowStopRequested()
    dismissGoogleFlowBlockingPopups()
    ensureGoogleFlowWorkspaceReady()

    if (selectGoogleFlowStepMode(step)) {
      logGoogleFlowStep("เลือกโหมด $stepLabel แล้ว")
    } else {
      logGoogleFlowStep("ยังไม่ยืนยันโหมด $stepLabel จะใช้หน้าปัจจุบันของ Flow ต่อ")
    }

    val modelSelected = selectGoogleFlowModel(payload, step)
    if (modelSelected) {
      logGoogleFlowStep("เลือก model สำหรับ$stepLabel แล้ว")
    }

    if (step == "video" && referenceAsset != null) {
      val attached = attachGoogleFlowReferenceAsset(referenceAsset)
      if (attached) {
        logGoogleFlowStep("แนบรูปจากขั้นสร้างรูปให้วิดีโอแล้ว")
      } else {
        logGoogleFlowStep("ยังแนบรูปให้วิดีโอไม่ได้ จะใส่ไฟล์อ้างอิงใน prompt แทน")
      }
    }

    val prompt = buildGoogleFlowProductPrompt(product, payload, step, referenceAsset)
    logGoogleFlowStep("เตรียม prompt: ${productName.take(34)}")
    if (!focusGoogleFlowPromptEditor()) {
      throw IllegalStateException("ไม่พบช่อง prompt ของ Google Flow")
    }
    if (!inputText(prompt)) {
      throw IllegalStateException("กรอก prompt ใน Google Flow ไม่สำเร็จ")
    }
    logGoogleFlowStep("กรอก prompt สำหรับ${stepLabel}แล้ว")

    val preview = product.optString("preview", product.optString("imageUrl", "")).trim()
    if (preview.isNotBlank()) {
      logGoogleFlowStep("มีรูปสินค้าอ้างอิงใน payload แล้ว (${preview.take(28)}...)")
    } else {
      logGoogleFlowStep("ไม่มีรูปสินค้าอ้างอิงในสินค้า จะใช้ prompt อย่างเดียว")
    }

    if (!submitGoogleFlowGenerate()) {
      throw IllegalStateException("กด Generate ใน Google Flow ไม่สำเร็จ")
    }
    emitGoogleFlowProgress(
      message = "กด Generate สำหรับ${stepLabel}แล้ว",
      product = product,
      step = step,
      stage = "submitted",
      round = round,
      totalRounds = totalRounds,
      productIndex = productIndex,
      productTotal = productTotal
    )
    val generated = waitForGoogleFlowGeneration(step, googleFlowGenerationTimeoutMs(payload, step))
    if (!generated) {
      emitGoogleFlowProgress(
        message = "ข้ามการดาวน์โหลด${stepLabel} เพราะยังไม่พบผลลัพธ์ที่พร้อม",
        product = product,
        step = step,
        stage = "failed",
        round = round,
        totalRounds = totalRounds,
        productIndex = productIndex,
        productTotal = productTotal
      )
      return null
    }

    val downloadedAsset = downloadGoogleFlowResult(step)
    if (downloadedAsset != null) {
      emitGoogleFlowAsset(product, step, downloadedAsset)
      return downloadedAsset
    } else {
      emitGoogleFlowProgress(
        message = "สร้าง${stepLabel}แล้ว แต่ยังหาไฟล์ download ล่าสุดไม่ได้",
        product = product,
        step = step,
        stage = "download_missing",
        round = round,
        totalRounds = totalRounds,
        productIndex = productIndex,
        productTotal = productTotal
      )
    }
    return null
  }

  private fun focusGoogleFlowPromptEditor(): Boolean {
    val root = rootInActiveWindow ?: return false
    val editable = findEditableNode(root)
    if (editable != null) {
      return clickNode(editable) || editable.performAction(AccessibilityNodeInfo.ACTION_FOCUS)
    }

    if (clickByAnyText(listOf("Prompt", "Describe", "Enter a prompt", "อธิบาย"), exact = false)) {
      sleepGoogleFlowStep(500)
      return findEditableNode(rootInActiveWindow) != null
    }

    val screen = screenBounds(root)
    return tapBlocking(screen.centerX().toFloat(), (screen.bottom - screen.height() * 0.18f).toFloat())
  }

  private fun buildGoogleFlowProductPrompt(
    product: JSONObject,
    payload: JSONObject,
    step: String,
    referenceAsset: GoogleFlowDownloadedAsset?
  ): String {
    val name = product.optString("name", "สินค้า").ifBlank { "สินค้า" }
    val caption = product.optString("caption", "")
    val hashtags = product.optString("hashtags", "")
    val cta = product.optString("cta", "")
    val productUrl = product.optString("productUrl", "")
    val preview = product.optString("preview", "")
    val settings = payload.optJSONObject("settings")
    val duration = settings?.optInt("flowVideoDuration", 8) ?: 8
    val productSettings = product.optJSONObject("settings")
    val imageSettings = productSettings?.optJSONObject("image")
    val videoSettings = productSettings?.optJSONObject("video")
    val imagePromptMode = imageSettings?.optString("promptMode", "auto") ?: "auto"
    val videoPromptMode = videoSettings?.optString("promptMode", "auto") ?: "auto"
    val imageAspectRatio = promptSettingValue(imageSettings, "aspectRatio", "9:16")
    val imageOutputCount = promptSettingValue(imageSettings, "outputCount", "1")
    val videoAspectRatio = promptSettingValue(videoSettings, "aspectRatio", "9:16")
    val videoSceneCount = promptSettingValue(videoSettings, "sceneCount", "1")
    val videoOutputCount = if ((videoSceneCount.toIntOrNull() ?: 1) > 1) {
      "1"
    } else {
      promptSettingValue(videoSettings, "outputCount", "1")
    }

    if (step == "image" && imagePromptMode == "custom") {
      val customPrompt = imageSettings?.optString("customPrompt", "").orEmpty().trim()
      if (customPrompt.isNotBlank()) {
        return listOf(
          customPrompt,
          "สินค้า: $name",
          if (preview.isNotBlank()) "รูปสินค้าอ้างอิง: $preview" else "",
          if (productUrl.isNotBlank()) "ลิงก์สินค้า: $productUrl" else "",
          "สัดส่วนภาพ: $imageAspectRatio",
          "จำนวนรูปที่ต้องการ: $imageOutputCount",
          imageSettings?.optString("systemPrompt", "").orEmpty(),
          hashtags
        ).filter { it.isNotBlank() }.joinToString("; ")
      }
    }
    if (step == "video" && videoPromptMode == "custom") {
      val customPrompt = videoSettings?.optString("customPrompt", "").orEmpty().trim()
      if (customPrompt.isNotBlank()) {
        return listOf(
          customPrompt,
          "สินค้า: $name",
          if (referenceAsset != null) {
            "ใช้รูปอ้างอิงจากขั้นสร้างรูปก่อนหน้าเป็นภาพหลัก: ${referenceAsset.fileName ?: referenceAsset.uri}"
          } else {
            ""
          },
          if (preview.isNotBlank()) "รูปสินค้าอ้างอิง: $preview" else "",
          if (productUrl.isNotBlank()) "ลิงก์สินค้า: $productUrl" else "",
          "สัดส่วนวิดีโอ: $videoAspectRatio",
          "ความยาวประมาณ ${duration} วินาที",
          "จำนวนวิดีโอที่ต้องการ: $videoOutputCount",
          "จำนวนฉาก: $videoSceneCount",
          videoSettings?.optString("systemPrompt", "").orEmpty(),
          hashtags
        ).filter { it.isNotBlank() }.joinToString("; ")
      }
    }

    return if (step == "video") {
      val dialogueMode = videoSettings?.optString("dialogueMode", "auto") ?: "auto"
      val dialogue = when (dialogueMode) {
        "none" -> "ไม่มีบทพูด ให้เป็นวิดีโอเงียบหรือมีเสียงบรรยากาศเท่านั้น"
        "custom" -> videoSettings?.optString("dialogue", "").orEmpty()
        else -> caption.ifBlank { "พูดแนะนำจุดเด่นสินค้าแบบกระชับ เป็นภาษาไทย ฟังเป็นธรรมชาติ" }
      }
      val videoStyle = promptSetting(
        settings = videoSettings,
        key = "presetStyle",
        fallback = "รีวิวสินค้าแบบจริงใจ น่าเชื่อถือ เหมาะกับ social commerce"
      )
      val cameraMotion = promptSetting(
        settings = videoSettings,
        key = "cameraMotion",
        customKey = "cameraMotionCustom",
        fallback = "natural handheld, slow push in, product close-up"
      )
      val voiceCharacter = promptSetting(
        settings = videoSettings,
        key = "voiceCharacter",
        customKey = "voiceCharacterCustom"
      )
      val scriptStyle = promptSetting(
        settings = videoSettings,
        key = "scriptStyle",
        customKey = "scriptStyleCustom"
      )
      val musicSfx = when (videoSettings?.optString("musicSfxMode", "auto") ?: "auto") {
        "none" -> "ไม่มีเพลงหรือเอฟเฟกต์เสียง"
        "custom" -> videoSettings?.optString("musicSfxCustom", "").orEmpty().trim()
        else -> "เพลงและเอฟเฟกต์เสียงเหมาะกับโฆษณาสินค้าแบบ social commerce"
      }
      listOf(
        "สร้างวิดีโอโฆษณาสินค้าภาษาไทย สัดส่วน $videoAspectRatio ความยาวประมาณ ${duration} วินาที",
        "สินค้า: $name",
        if (referenceAsset != null) {
          "ใช้รูปอ้างอิงจากขั้นสร้างรูปก่อนหน้าเป็นภาพหลัก: ${referenceAsset.fileName ?: referenceAsset.uri}"
        } else {
          ""
        },
        if (preview.isNotBlank()) "รูปสินค้าอ้างอิง: $preview" else "",
        if (productUrl.isNotBlank()) "ลิงก์สินค้า: $productUrl" else "",
        "ให้ใช้ภาพสินค้าอ้างอิงเท่านั้น สินค้าต้องเหมือนจริงและไม่เปลี่ยนรูปทรง",
        "สไตล์: $videoStyle",
        "จำนวนวิดีโอที่ต้องการ: $videoOutputCount",
        "จำนวนฉาก: $videoSceneCount",
        "กล้อง: $cameraMotion",
        if (voiceCharacter.isNotBlank()) "เสียงตัวละคร: $voiceCharacter" else "",
        if (scriptStyle.isNotBlank()) "สไตล์สคริปต์: $scriptStyle" else "",
        if (musicSfx.isNotBlank()) "เพลง/SFX: $musicSfx" else "",
        "บทพูด/ข้อความประกอบ: $dialogue",
        if (cta.isNotBlank()) "CTA: $cta" else "",
        videoSettings?.optString("systemPrompt", "").orEmpty(),
        "ข้อห้าม: ห้ามมี subtitle ห้ามมีข้อความมั่ว ห้ามมีขอบดำ วิดีโอต้องเต็มจอ",
        hashtags
      ).filter { it.isNotBlank() }.joinToString("; ")
    } else {
      val imageStyle = promptSetting(
        settings = imageSettings,
        key = "presetStyle",
        customKey = "presetStyleCustom",
        fallback = "auto"
      )
      val background = promptSetting(
        settings = imageSettings,
        key = "background",
        customKey = "backgroundCustom",
        fallback = "auto"
      )
      val lighting = promptSetting(
        settings = imageSettings,
        key = "lighting",
        customKey = "lightingCustom",
        fallback = "auto"
      )
      val frame = promptSetting(
        settings = imageSettings,
        key = "frame",
        customKey = "frameCustom"
      )
      val textOverlay = promptSetting(
        settings = imageSettings,
        key = "textOverlay",
        customKey = "textOverlayCustom"
      )
      listOf(
        "สร้างรูปโฆษณาสินค้า สัดส่วน $imageAspectRatio",
        "สินค้า: $name",
        if (preview.isNotBlank()) "รูปสินค้าอ้างอิง: $preview" else "",
        if (productUrl.isNotBlank()) "ลิงก์สินค้า: $productUrl" else "",
        "ให้สินค้าชัดเจนเหมือนภาพอ้างอิง ใช้แสงสวย โทนขายของออนไลน์",
        "สไตล์: $imageStyle",
        "จำนวนรูปที่ต้องการ: $imageOutputCount",
        "ฉาก: $background",
        "แสง: $lighting",
        if (frame.isNotBlank()) "เฟรมภาพ: $frame" else "",
        if (textOverlay.isNotBlank()) "ข้อความบนภาพ: $textOverlay" else "",
        imageSettings?.optString("systemPrompt", "").orEmpty(),
        "ฉากสะอาด น่าเชื่อถือ เหมาะกับ marketplace",
        "ห้ามบิดเบือนสินค้า ห้ามมีข้อความมั่วบนภาพ",
        hashtags
      ).filter { it.isNotBlank() }.joinToString("; ")
    }
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

  private fun googleFlowProductKey(product: JSONObject): String =
    product.optString("productId").ifBlank {
      product.optString("id").ifBlank {
        product.optString("catalogId").ifBlank {
          product.optString("name", "สินค้า")
        }
      }
    }

  private fun attachGoogleFlowReferenceAsset(asset: GoogleFlowDownloadedAsset?): Boolean {
    if (asset == null) return false
    val fileName = asset.fileName?.trim().orEmpty()
    if (fileName.isBlank()) return false

    dismissGoogleFlowBlockingPopups()
    val openedPicker = clickByAnyText(
      listOf(
        "Add image",
        "Reference image",
        "Image to video",
        "Upload",
        "Choose file",
        "อัปโหลด",
        "เพิ่มรูป",
        "เลือกรูป",
        "เลือกไฟล์"
      ),
      exact = false
    )
    if (!openedPicker) {
      return false
    }

    sleepGoogleFlowStep(1200L)
    dismissGoogleFlowBlockingPopups()

    val stem = fileName.substringBeforeLast('.', fileName)
    var selectedFile = clickByAnyText(listOf(fileName, stem), exact = false)
    if (!selectedFile && clickByAnyText(listOf("Downloads", "ดาวน์โหลด", "Recent", "ล่าสุด"), exact = false)) {
      sleepGoogleFlowStep(800L)
      selectedFile = clickByAnyText(listOf(fileName, stem), exact = false)
    }
    if (!selectedFile && scrollFirstScrollableForward()) {
      sleepGoogleFlowStep(700L)
      selectedFile = clickByAnyText(listOf(fileName, stem), exact = false)
    }

    if (!selectedFile) {
      performBack()
      sleepGoogleFlowStep(500L)
      return false
    }

    sleepGoogleFlowStep(900L)
    clickByAnyText(listOf("Done", "Select", "Open", "Add", "เสร็จ", "เลือก", "เปิด", "เพิ่ม"), exact = false)
    sleepGoogleFlowStep(1400L)
    return true
  }

  private fun googleFlowEnabledSteps(payload: JSONObject): List<String> {
    val steps = payload.optJSONArray("enabledSteps") ?: return listOf("image", "video")
    val output = mutableListOf<String>()
    for (index in 0 until steps.length()) {
      val step = steps.optString(index)
      if ((step == "image" || step == "video") && !output.contains(step)) {
        output.add(step)
      }
    }
    return output
  }

  private fun googleFlowDelayMs(settings: JSONObject?): Long =
    when (settings?.optString("delayPreset", "normal")) {
      "fast" -> 800L
      "slow" -> 2600L
      else -> 1500L
    }

  private fun googleFlowGenerationTimeoutMs(payload: JSONObject, step: String): Long {
    val settings = payload.optJSONObject("settings")
    val duration = settings?.optInt("flowVideoDuration", 8) ?: 8
    return if (step == "video") {
      (duration.coerceIn(4, 10) * 22_000L).coerceAtLeast(90_000L)
    } else {
      75_000L
    }
  }

  private fun ensureGoogleFlowWorkspaceReady() {
    dismissGoogleFlowBlockingPopups()
    if (containsAnyText(listOf("New project", "โปรเจ็กต์ใหม่"), contains = true)) {
      clickByAnyText(listOf("New project", "โปรเจ็กต์ใหม่"), exact = false)
      sleepGoogleFlowStep(1800)
    }
    if (containsAnyText(listOf("Try Flow", "Start", "เริ่ม"), contains = true)) {
      clickByAnyText(listOf("Try Flow", "Start", "เริ่ม"), exact = false)
      sleepGoogleFlowStep(1800)
    }
  }

  private fun selectGoogleFlowStepMode(step: String): Boolean {
    val labels = if (step == "video") {
      listOf("Video", "วิดีโอ", "Generate video", "สร้างวิดีโอ")
    } else {
      listOf("Image", "รูปภาพ", "Generate image", "สร้างรูป")
    }
    return clickByAnyText(labels, exact = false)
  }

  private fun selectGoogleFlowModel(payload: JSONObject, step: String): Boolean {
    val settings = payload.optJSONObject("settings") ?: return false
    val modelValue = if (step == "video") {
      settings.optString("flowVideoModel", "")
    } else {
      settings.optString("flowImageModel", "")
    }
    val modelLabels = googleFlowModelLabels(modelValue)
    if (modelLabels.isEmpty()) return false
    if (clickByAnyText(modelLabels, exact = false)) return true
    if (clickByAnyText(listOf("Model", "โมเดล"), exact = false)) {
      sleepGoogleFlowStep(700)
      return clickByAnyText(modelLabels, exact = false)
    }
    return false
  }

  private fun googleFlowModelLabels(value: String): List<String> =
    when (value) {
      "nano_banana_pro" -> listOf("Nano Banana Pro", "Nano Banana")
      "nano_banana_2" -> listOf("Nano Banana 2", "Nano Banana")
      "imagen_4" -> listOf("Imagen 4", "Imagen")
      "omni_flash" -> listOf("Omni Flash")
      "veo_31_lite" -> listOf("Veo 3.1 Lite", "Veo")
      "veo_31_fast" -> listOf("Veo 3.1 Fast", "Veo")
      "veo_31_quality" -> listOf("Veo 3.1 Quality", "Veo")
      "veo_31_lite_lower" -> listOf("Veo 3.1 Lite Lower", "Veo 3.1 Lite", "Veo")
      else -> emptyList()
    }

  private fun submitGoogleFlowGenerate(): Boolean {
    dismissGoogleFlowBlockingPopups()
    if (clickByAnyText(listOf("Generate", "สร้าง", "Create", "Submit"), exact = false)) {
      return true
    }

    val root = rootInActiveWindow ?: return false
    val screen = screenBounds(root)
    val actionNodes = mutableListOf<Pair<Rect, AccessibilityNodeInfo>>()
    collectClickableNodes(root, actionNodes)
    val candidate = actionNodes
      .filter { (bounds, node) ->
        val text = readNodeText(node)
        bounds.centerY() > screen.top + (screen.height() * 0.55f).toInt() &&
          bounds.centerY() < screen.bottom - (screen.height() * 0.06f).toInt() &&
          bounds.width() in 32..(screen.width() * 0.72f).toInt() &&
          bounds.height() in 32..180 &&
          (
            text.contains("Generate", ignoreCase = true) ||
              text.contains("Create", ignoreCase = true) ||
              text.contains("สร้าง", ignoreCase = true) ||
              text.isBlank()
          )
      }
      .sortedWith(compareByDescending<Pair<Rect, AccessibilityNodeInfo>> { it.first.bottom }.thenByDescending { it.first.right })
      .firstOrNull()

    if (candidate != null) {
      val bounds = candidate.first
      return tapBlocking(bounds.centerX().toFloat(), bounds.centerY().toFloat())
    }

    return false
  }

  private fun waitForGoogleFlowGeneration(step: String, timeoutMs: Long): Boolean {
    val label = if (step == "video") "วิดีโอ" else "รูปภาพ"
    val start = System.currentTimeMillis()
    var lastLog = 0L
    while (System.currentTimeMillis() - start < timeoutMs) {
      checkGoogleFlowStopRequested()
      dismissGoogleFlowBlockingPopups()
      if (
        containsAnyText(listOf("Download", "ดาวน์โหลด", "Done", "เสร็จ", "Export"), contains = true) ||
        containsAnyText(listOf("Failed", "ล้มเหลว", "try a different prompt"), contains = true)
      ) {
        if (containsAnyText(listOf("Failed", "ล้มเหลว", "try a different prompt"), contains = true)) {
          logGoogleFlowStep("Flow แจ้งล้มเหลวสำหรับ${label}")
          return false
        } else {
          logGoogleFlowStep("Flow มีผลลัพธ์สำหรับ${label}แล้ว")
          return true
        }
      }

      val now = System.currentTimeMillis()
      if (now - lastLog > 10_000L) {
        logGoogleFlowStep("รอผล$label ${((now - start) / 1000.0).formatOneDecimal()} วิ")
        lastLog = now
      }
      sleepGoogleFlowStep(1000L)
    }
    logGoogleFlowStep("ยังไม่เห็นผลลัพธ์${label}ในเวลาที่กำหนด จะไปขั้นถัดไป")
    return false
  }

  private fun downloadGoogleFlowResult(step: String): GoogleFlowDownloadedAsset? {
    val label = if (step == "video") "วิดีโอ" else "รูปภาพ"
    val startedAt = System.currentTimeMillis()
    logGoogleFlowStep("กำลังดาวน์โหลด${label}จาก Google Flow")
    if (!clickByAnyText(listOf("Download", "ดาวน์โหลด", "Export", "บันทึก"), exact = false)) {
      return null
    }

    sleepGoogleFlowStep(3000L)
    dismissGoogleFlowBlockingPopups()
    logGoogleFlowStep("ส่งดาวน์โหลด${label}ให้ browser แล้ว")
    return waitForLatestGoogleFlowDownload(step, startedAt)
  }

  private fun waitForLatestGoogleFlowDownload(step: String, sinceMs: Long): GoogleFlowDownloadedAsset? {
    val start = System.currentTimeMillis()
    while (System.currentTimeMillis() - start < 15_000L) {
      checkGoogleFlowStopRequested()
      val asset = findLatestDownloadedMedia(step, sinceMs)
      if (asset != null) {
        return asset
      }
      sleepGoogleFlowStep(1000L)
    }
    return null
  }

  private fun findLatestDownloadedMedia(step: String, sinceMs: Long): GoogleFlowDownloadedAsset? {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
      return null
    }

    val collection = MediaStore.Downloads.EXTERNAL_CONTENT_URI
    val projection = arrayOf(
      MediaStore.MediaColumns._ID,
      MediaStore.MediaColumns.DISPLAY_NAME,
      MediaStore.MediaColumns.MIME_TYPE,
      MediaStore.MediaColumns.SIZE,
      MediaStore.MediaColumns.DATE_ADDED
    )
    val sinceSeconds = ((sinceMs / 1000L) - 20L).coerceAtLeast(0L)
    val mimePrefix = if (step == "video") "video/%" else "image/%"
    val extensionLike = if (step == "video") "%.mp4" else "%.png"
    val fallbackExtensionLike = if (step == "video") "%.webm" else "%.jpg"
    val selection =
      "${MediaStore.MediaColumns.DATE_ADDED} >= ? AND (" +
        "${MediaStore.MediaColumns.MIME_TYPE} LIKE ? OR " +
        "${MediaStore.MediaColumns.DISPLAY_NAME} LIKE ? OR " +
        "${MediaStore.MediaColumns.DISPLAY_NAME} LIKE ?)"
    val selectionArgs = arrayOf(
      sinceSeconds.toString(),
      mimePrefix,
      extensionLike,
      fallbackExtensionLike
    )
    val sortOrder = "${MediaStore.MediaColumns.DATE_ADDED} DESC"

    return try {
      contentResolver.query(collection, projection, selection, selectionArgs, sortOrder)?.use { cursor ->
        if (!cursor.moveToFirst()) {
          return@use null
        }

        val id = cursor.getLong(cursor.getColumnIndexOrThrow(MediaStore.MediaColumns._ID))
        val fileName = cursor.getString(cursor.getColumnIndexOrThrow(MediaStore.MediaColumns.DISPLAY_NAME))
        val mimeType = cursor.getString(cursor.getColumnIndexOrThrow(MediaStore.MediaColumns.MIME_TYPE))
        val sizeBytes = cursor.getLong(cursor.getColumnIndexOrThrow(MediaStore.MediaColumns.SIZE))
        val dateAdded = cursor.getLong(cursor.getColumnIndexOrThrow(MediaStore.MediaColumns.DATE_ADDED))
        val uri = ContentUris.withAppendedId(collection, id).toString()

        GoogleFlowDownloadedAsset(
          uri = uri,
          fileName = fileName,
          mimeType = mimeType,
          sizeBytes = sizeBytes.takeIf { it > 0 },
          createdAt = dateAdded * 1000L
        )
      }
    } catch (error: Exception) {
      Log.w(TAG, "Unable to query downloaded Google Flow asset", error)
      null
    }
  }

  private fun emitGoogleFlowAsset(product: JSONObject, step: String, downloadedAsset: GoogleFlowDownloadedAsset?) {
    val label = if (step == "video") "วิดีโอ" else "รูปภาพ"
    val productId = product.optString("productId", product.optString("id", ""))
    val productName = product.optString("name", "สินค้า").ifBlank { "สินค้า" }
    val message = "บันทึกผลลัพธ์${label}: ${productName.take(34)}"
    Log.d(TAG, "Google Flow runner: $message")
    addAutomationLogLine(message)
    KubdeeAccessibilityModule.emitGoogleFlowLog(
      message = message,
      event = "asset",
      step = step,
      productId = productId,
      productName = productName,
      fileUri = downloadedAsset?.uri,
      fileName = downloadedAsset?.fileName,
      mimeType = downloadedAsset?.mimeType,
      sizeBytes = downloadedAsset?.sizeBytes,
      createdAt = downloadedAsset?.createdAt,
      runId = currentGoogleFlowRunId
    )
    showAutomationOverlay(message)
  }

  private fun tapBlocking(x: Float, y: Float, timeoutMs: Long = 2500): Boolean {
    var completed = false
    val latch = CountDownLatch(1)
    tap(x, y) { success ->
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
    KubdeeAccessibilityModule.emitShopeeImportLog(message)
    showAutomationOverlay(message)
  }

  private fun emitGoogleFlowProgress(
    message: String,
    product: JSONObject? = null,
    step: String? = null,
    stage: String,
    round: Int,
    totalRounds: Int,
    productIndex: Int,
    productTotal: Int
  ) {
    val productId = product?.let { it.optString("productId", it.optString("id", "")) }
    val productName = product?.optString("name", "สินค้า")?.ifBlank { "สินค้า" }
    Log.d(TAG, "Google Flow runner: $message")
    addAutomationLogLine(message)
    KubdeeAccessibilityModule.emitGoogleFlowLog(
      message = message,
      event = "progress",
      step = step,
      stage = stage,
      productId = productId,
      productName = productName,
      currentRound = round,
      totalRounds = totalRounds,
      currentProduct = productIndex,
      totalProducts = productTotal,
      runId = currentGoogleFlowRunId
    )
    showAutomationOverlay(message)
  }

  private fun logGoogleFlowStep(message: String) {
    Log.d(TAG, "Google Flow runner: $message")
    addAutomationLogLine(message)
    KubdeeAccessibilityModule.emitGoogleFlowLog(
      message = message,
      runId = currentGoogleFlowRunId
    )
    showAutomationOverlay(message)
  }

  private fun logGoogleFlowStatus(message: String, status: String) {
    Log.d(TAG, "Google Flow runner: $message ($status)")
    addAutomationLogLine(message)
    KubdeeAccessibilityModule.emitGoogleFlowLog(
      message = message,
      status = status,
      runId = currentGoogleFlowRunId
    )
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

  private fun sleepGoogleFlowStep(ms: Long) {
    val endAt = System.currentTimeMillis() + ms
    while (System.currentTimeMillis() < endAt) {
      checkGoogleFlowStopRequested()
      try {
        Thread.sleep(minOf(250L, endAt - System.currentTimeMillis()).coerceAtLeast(1L))
      } catch (error: InterruptedException) {
        Thread.currentThread().interrupt()
        throw error
      }
    }
  }

  private fun checkGoogleFlowStopRequested() {
    if (googleFlowStopRequested) {
      throw GoogleFlowAutomationStoppedException()
    }
  }

  private fun resetAutomationLog() {
    synchronized(automationLogLines) {
      automationLogLines.clear()
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
    val lines = synchronized(automationLogLines) {
      automationLogLines.takeLast(18)
    }
    return "Kubdee AI\n" + lines.joinToString("\n")
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

  private fun findEditableNode(node: AccessibilityNodeInfo?): AccessibilityNodeInfo? {
    if (node == null) return null
    if (node.isEditable) return node

    for (index in 0 until node.childCount) {
      val found = findEditableNode(node.getChild(index))
      if (found != null) return found
    }

    return null
  }

  private fun goToShopeeMeTab(): Boolean {
    repeat(5) { attempt ->
      if (isShopeeMePageVisible()) {
        logStep("หน้า ฉัน พร้อมแล้ว")
        return true
      }

      dismissShopeeBlockingPopups()
      logStep("ไปที่เมนู ฉัน (ครั้ง ${attempt + 1}/5)")
      val clicked = clickByAnyText(listOf("ฉัน", "Me"), exact = true) ||
        clickByResourceHint(listOf("tab_bar_button_me", "me_tab", "tab_me"))

      if (!clicked) {
        logStep("ไม่พบชื่อปุ่มเมนู ฉัน ในหน้า Shopee")
      }

      sleepStep(1800)
      if (isShopeeMePageVisible()) {
        logStep("หน้า ฉัน พร้อมแล้ว")
        return true
      }
    }

    return false
  }

  private fun isShopeeMePageVisible(): Boolean =
    containsAnyText(SHOPEE_LIKED_TEXTS, contains = true) ||
      containsAnyText(listOf("ประวัติการซื้อ", "การซื้อของฉัน", "My Purchases", "My Purchase"), contains = true)

  private fun openShopeeLikedList(): Boolean {
    repeat(8) { attempt ->
      if (isShopeeLikedListVisible()) {
        return true
      }

      logStep("ค้นหาเมนูสิ่งที่ฉันถูกใจ ครั้ง ${attempt + 1}/8")
      if (clickShopeeLikedMenu()) {
        logStep("กดเมนู สิ่งที่ฉันถูกใจ")
        if (waitForShopeeLikedListVisible(5_000L)) {
          return true
        }
      } else {
        logStep("ยังไม่พบเมนู สิ่งที่ฉันถูกใจ")
      }

      if (!scrollFirstScrollableForward()) {
        swipeUpByScreen()
      }
      sleepStep(900)
    }

    return isShopeeLikedListVisible()
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
    collectTextNodes(root, textNodes)
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
    val hasProductGridPrice = findPriceNodes(textNodes).any { node ->
      node.bounds.top > topLimit && node.bounds.bottom < bottomNavStart
    }

    return !hasBottomMeTab && (hasTopLikedTitle || hasTopEditAction || hasProductGridPrice)
  }

  private fun waitForShopeeLikedProductsReady(timeoutMs: Long): Boolean {
    val start = System.currentTimeMillis()
    var lastLog = 0L
    while (System.currentTimeMillis() - start < timeoutMs) {
      checkStopRequested()
      val (products, _) = scrapeVisibleShopeeLikedProductCandidates()
      if (products.isNotEmpty()) {
        logStep("สินค้าในหน้าถูกใจโหลดแล้ว (${products.size} รายการ)")
        return true
      }

      val now = System.currentTimeMillis()
      if (now - lastLog > 3000) {
        logStep("รอสินค้าในหน้าถูกใจโหลด ${((now - start) / 1000.0).formatOneDecimal()} วิ")
        lastLog = now
      }
      sleepStep(750)
    }

    return false
  }

  private fun scrollShopeeLikedList(): Boolean {
    val scrolled = scrollFirstScrollableForward()
    if (scrolled) return true
    return swipeUpByScreen()
  }

  private fun scrapeVisibleShopeeLikedProductCandidates(): Pair<List<ShopeeLikedProductCandidate>, Boolean> {
    val root = rootInActiveWindow ?: return emptyList<ShopeeLikedProductCandidate>() to false
    val screen = screenBounds(root)
    val textNodes = mutableListOf<TextNode>()
    collectTextNodes(root, textNodes)
    if (textNodes.isEmpty()) return emptyList<ShopeeLikedProductCandidate>() to false

    val safeTop = likedProductSafeTop(textNodes, screen)
    val safeBottom = screen.bottom - (screen.height() * 0.08f).toInt()
    val recommendationTop = findShopeeRecommendationStartY(textNodes)
    val visibleTextNodes = textNodes.filter { node ->
      val centerY = node.bounds.centerY()
      centerY in safeTop..safeBottom && (recommendationTop == null || node.bounds.top < recommendationTop)
    }
    val priceNodes = findPriceNodes(visibleTextNodes)
    val products = linkedMapOf<String, ShopeeLikedProductCandidate>()

    for (priceNode in priceNodes) {
      val rowBounds = candidateRowBounds(priceNode.node, priceNode.bounds, safeTop, screen)
      val rowTexts = visibleTextNodes
        .filter { textNode -> Rect.intersects(rowBounds, textNode.bounds) }
        .sortedWith(compareBy<TextNode> { it.bounds.top }.thenBy { it.bounds.left })
      val candidate = buildProductCandidateFromRow(rowTexts, priceNode, rowBounds, safeTop) ?: continue
      products[candidate.product.externalProductId ?: stableProductKey(candidate.product)] = candidate
    }

    return products.values.toList() to (recommendationTop != null)
  }

  private fun buildProductCandidateFromRow(
    rowTexts: List<TextNode>,
    priceNode: TextNode,
    rowBounds: Rect,
    safeTop: Int
  ): ShopeeLikedProductCandidate? {
    val price = normalizePrice(priceNode.text) ?: return null
    val nameNodes = rowTexts
      .filter { it.bounds.top <= priceNode.bounds.bottom + 20 }
      .filter { isProductNameCandidate(cleanNodeText(it.text)) }
      .distinctBy { cleanNodeText(it.text) }
    val names = nameNodes.map { cleanNodeText(it.text) }
    val name = names.take(3).joinToString(" ").trim().take(180)
    if (name.length < 5) return null

    val productUrl = rowTexts.firstNotNullOfOrNull { extractUrl(it.text) }
    val externalProductId = productUrl?.let { extractShopeeProductIdFromUrl(it) }
    val stock = rowTexts.firstNotNullOfOrNull { extractStock(it.text) }

    val product = ShopeeLikedProduct(
      name = name,
      price = price,
      stock = stock,
      productUrl = productUrl,
      externalProductId = externalProductId,
      imageUrl = null,
      status = "liked",
      scrapedAt = System.currentTimeMillis()
    )

    val tapBounds = nameNodes.firstOrNull()?.bounds ?: rowBounds
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

  private fun enrichShopeeProductFromDetail(candidate: ShopeeLikedProductCandidate): ShopeeLikedProduct? {
    val product = candidate.product
    if (!openShopeeProductDetail(candidate)) {
      logStep("เปิด detail ไม่สำเร็จ ข้าม: ${product.name.take(34)}")
      return null
    }

    try {
      val detailReady = waitForShopeeProductDetailReady(10_000L)
      if (!detailReady) {
        logStep("detail โหลดไม่สำเร็จ ข้าม: ${product.name.take(34)}")
        return null
      }

      val detailPrice = findShopeeDetailPrice() ?: product.price
      val imageUrl = findShopeeDetailImageUrl() ?: product.imageUrl
      val productUrl = copyShopeeProductUrlFromDetail() ?: product.productUrl
      val externalProductId = productUrl?.let { extractShopeeProductIdFromUrl(it) } ?: product.externalProductId

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
    if (tapY <= candidate.safeTop || tapY >= screen.bottom - screen.height() * 0.08f) {
      return false
    }
    logStep("กดสินค้าในรายการ")
    return tapBlocking(tapX, tapY)
  }

  private fun waitForShopeeProductDetailReady(timeoutMs: Long): Boolean {
    val start = System.currentTimeMillis()
    var lastLog = 0L
    while (System.currentTimeMillis() - start < timeoutMs) {
      checkStopRequested()
      if (isShopeeProductDetailVisible()) return true

      val now = System.currentTimeMillis()
      if (now - lastLog > 2500L) {
        logStep("รอหน้า detail ${((now - start) / 1000.0).formatOneDecimal()} วิ")
        lastLog = now
      }
      sleepStep(350L)
    }
    return isShopeeProductDetailVisible()
  }

  private fun isShopeeProductDetailVisible(): Boolean {
    val root = rootInActiveWindow ?: return false
    if (findMatchingNode(root, listOf("sectionProductPrice", "imageCover_"), exact = false, includeResourceId = true) != null) {
      return true
    }
    return containsAnyText(
      listOf("ซื้อเลย", "เพิ่มไปยังรถเข็น", "เพิ่มลงรถเข็น", "เลือกตัวเลือก", "รายละเอียดสินค้า", "คะแนนสินค้า"),
      contains = true
    )
  }

  private fun findShopeeDetailPrice(): String? {
    val root = rootInActiveWindow ?: return null
    val textNodes = mutableListOf<TextNode>()
    collectTextNodes(root, textNodes)
    val screen = screenBounds(root)
    val candidates = textNodes.filter { node ->
      node.bounds.top in (screen.top + (screen.height() * 0.25f).toInt())..(screen.top + (screen.height() * 0.78f).toInt())
    }
    return findPriceNodes(candidates).firstOrNull()?.text?.let { normalizePrice(it) }
  }

  private fun findShopeeDetailImageUrl(): String? {
    val root = rootInActiveWindow ?: return null
    val imageId = findDetailImageCoverId(root) ?: return null
    return "https://down-th.img.susercontent.com/file/$imageId"
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
    val clipboard = getSystemService(CLIPBOARD_SERVICE) as ClipboardManager
    val marker = "kubdee-empty-${System.currentTimeMillis()}"
    val previous = clipboard.primaryClip?.getItemAt(0)?.coerceToText(this)?.toString().orEmpty()
    try {
      clipboard.setPrimaryClip(ClipData.newPlainText("kubdee-marker", marker))
    } catch (_: Exception) {
      // Clipboard write may be blocked by OEM policy; reading after copy still works on many devices.
    }

    logStep("กดแชร์สินค้า")
    if (!openShopeeShareSheet()) return null

    logStep("กดคัดลอกลิงก์สินค้า")
    if (!tapShopeeCopyLink()) return null

    val start = System.currentTimeMillis()
    while (System.currentTimeMillis() - start < 6_000L) {
      checkStopRequested()
      val text = try {
        clipboard.primaryClip?.getItemAt(0)?.coerceToText(this)?.toString().orEmpty()
      } catch (_: Exception) {
        ""
      }
      val url = extractUrl(text)
      if (url != null && url != marker && url != previous) {
        return resolveShopeeUrl(url).ifBlank { url }
      }
      sleepStep(300L)
    }
    return null
  }

  private fun openShopeeShareSheet(): Boolean {
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
    return false
  }

  private fun isShopeeShareSheetVisible(): Boolean =
    containsAnyText(listOf("คัดลอกลิงก์", "คัดลอกลิงค์", "Copy Link", "Copy link", "แชร์เพื่อรับ"), contains = true)

  private fun clickTopShopeeShareButton(): Boolean {
    val root = rootInActiveWindow ?: return false
    val screen = screenBounds(root)
    val candidates = mutableListOf<Pair<Rect, AccessibilityNodeInfo>>()
    collectTopActionNodes(root, screen, candidates)
    val named = candidates.firstOrNull { (_, node) ->
      readNodeText(node).contains("share", ignoreCase = true) || readNodeText(node).contains("แชร์", ignoreCase = true)
    }
    val selected = named ?: candidates.sortedWith(compareBy<Pair<Rect, AccessibilityNodeInfo>> { it.first.left }.thenBy { it.first.top }).firstOrNull()
    if (selected != null) {
      val bounds = selected.first
      return tapBlocking(bounds.centerX().toFloat(), bounds.centerY().toFloat())
    }
    return clickByAnyText(listOf("แชร์", "Share"), exact = false)
  }

  private fun collectTopActionNodes(
    node: AccessibilityNodeInfo?,
    screen: Rect,
    output: MutableList<Pair<Rect, AccessibilityNodeInfo>>
  ) {
    if (node == null) return
    val bounds = Rect()
    node.getBoundsInScreen(bounds)
    val raw = "${readNodeText(node)} ${node.viewIdResourceName.orEmpty()}".lowercase(Locale.ROOT)
    val isTopAction = node.isClickable &&
      bounds.top >= screen.top + screen.height() * 0.035f &&
      bounds.bottom <= screen.top + screen.height() * 0.18f &&
      bounds.left >= screen.left + screen.width() * 0.45f &&
      bounds.width() in 32..maxOf(120, (screen.width() * 0.22f).toInt()) &&
      bounds.height() in 32..maxOf(120, (screen.height() * 0.12f).toInt()) &&
      (raw.contains("buttonactionbariconitem") || raw.contains("share") || raw.contains("แชร์"))
    if (isTopAction) output.add(Rect(bounds) to node)

    for (index in 0 until node.childCount) {
      collectTopActionNodes(node.getChild(index), screen, output)
    }
  }

  private fun tapShopeeCopyLink(): Boolean =
    clickByAnyText(listOf("คัดลอกลิงก์", "คัดลอกลิงค์", "Copy Link", "Copy link"), exact = false) ||
      clickByResourceHint(listOf("copy", "clipboard", "link"))

  private fun returnToShopeeLikedList(): Boolean {
    repeat(4) { attempt ->
      checkStopRequested()
      if (isShopeeLikedListVisible()) {
        if (attempt > 0) logStep("กลับหน้ารายการถูกใจแล้ว")
        return true
      }
      logStep("กด back กลับหน้ารายการถูกใจ (${attempt + 1}/4)")
      performBack()
      sleepStep(900L)
    }
    return isShopeeLikedListVisible()
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

  private fun extractShopeeProductIdFromUrl(url: String): String? {
    val resolvedUrl = if (url.contains("s.shopee", ignoreCase = true)) resolveShopeeUrl(url) else url
    val patterns = listOf(
      Regex("""(?:-|\.|/)i\.(\d+)\.(\d+)"""),
      Regex("""product/(\d+)/(\d+)"""),
      Regex("""shopid=(\d+).*itemid=(\d+)"""),
      Regex("""shop_id=(\d+).*item_id=(\d+)""")
    )
    for (pattern in patterns) {
      val match = pattern.find(resolvedUrl) ?: continue
      val shopId = match.groupValues.getOrNull(1).orEmpty()
      val itemId = match.groupValues.getOrNull(2).orEmpty()
      if (shopId.isNotBlank() && itemId.isNotBlank()) return "shopee:$shopId:$itemId"
    }
    return null
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
    val patterns = listOf(
      Regex("""(?:-|\.|/)i\.(\d+)\.(\d+)"""),
      Regex("""product/(\d+)/(\d+)"""),
      Regex("""shopid=(\d+).*itemid=(\d+)"""),
      Regex("""shop_id=(\d+).*item_id=(\d+)""")
    )
    for (pattern in patterns) {
      val match = pattern.find(url) ?: continue
      val shopId = match.groupValues.getOrNull(1).orEmpty()
      val itemId = match.groupValues.getOrNull(2).orEmpty()
      if (shopId.isNotBlank() && itemId.isNotBlank()) return "shopee:$shopId:$itemId"
    }
    return null
  }

  private fun isProductNameCandidate(text: String): Boolean {
    if (text.length < 4) return false
    if (PRICE_REGEX.containsMatchIn(text)) return false
    if (text.all { it.isDigit() || it == ',' || it == '.' }) return false
    val lower = text.lowercase(Locale.ROOT)
    val blocked = listOf(
      "หน้าแรก", "mall", "live", "video", "สำหรับคุณ", "การแจ้งเตือน", "ฉัน",
      "สิ่งที่ฉันถูกใจ", "รายการถูกใจ", "liked", "ค้นหา", "แก้ไข", "edit",
      "โค้ดลด", "ส่วนลด", "coins", "coin", "เช็คอิน", "รับ", "ซื้อเลย",
      "ขายแล้ว", "ส่งฟรี", "วันที่", "แนะนำ", "ดูเพิ่มเติม"
    )
    return blocked.none { lower.contains(it.lowercase(Locale.ROOT)) }
  }

  private fun stableProductKey(product: ShopeeLikedProduct): String =
    "${product.name.trim().lowercase(Locale.ROOT)}\u0000${product.price.orEmpty()}"

  private fun likedProductSafeTop(textNodes: List<TextNode>, screen: Rect): Int {
    val markerBottom = textNodes
      .filter { textNode -> SHOPEE_LIKED_TEXTS.any { textNode.text.contains(it, ignoreCase = true) } }
      .maxOfOrNull { it.bounds.bottom }
    val searchBottom = textNodes
      .filter { it.text.contains("ค้นหา", ignoreCase = true) || it.text.contains("Search", ignoreCase = true) }
      .maxOfOrNull { it.bounds.bottom }
    return ((listOfNotNull(markerBottom, searchBottom) + (screen.top + 120)).maxOrNull() ?: (screen.top + 120)) + 12
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

  private fun collectTextNodes(node: AccessibilityNodeInfo?, output: MutableList<TextNode>) {
    if (node == null) return
    val text = cleanNodeText(readNodeText(node))
    if (text.isNotBlank()) {
      val bounds = Rect()
      node.getBoundsInScreen(bounds)
      if (bounds.width() > 0 && bounds.height() > 0) {
        output.add(TextNode(text, bounds, node))
      }
    }

    for (index in 0 until node.childCount) {
      collectTextNodes(node.getChild(index), output)
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
    collectTextNodes(root, textNodes)

    val candidates = textNodes
      .filter { node ->
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

  private fun clickByAnyText(texts: List<String>, exact: Boolean): Boolean {
    val root = rootInActiveWindow ?: return false
    val node = findMatchingNode(root, texts, exact = exact, includeResourceId = false) ?: return false
    return clickNode(node)
  }

  private fun clickByResourceHint(hints: List<String>): Boolean {
    val root = rootInActiveWindow ?: return false
    val node = findMatchingNode(root, hints, exact = false, includeResourceId = true) ?: return false
    return clickNode(node)
  }

  private fun containsAnyText(texts: List<String>, contains: Boolean): Boolean {
    val root = rootInActiveWindow ?: return false
    return findMatchingNode(root, texts, exact = !contains, includeResourceId = false) != null
  }

  private fun findMatchingNode(
    node: AccessibilityNodeInfo?,
    needles: List<String>,
    exact: Boolean,
    includeResourceId: Boolean
  ): AccessibilityNodeInfo? {
    if (node == null) return null
    if (nodeMatches(node, needles, exact, includeResourceId)) return node

    for (index in 0 until node.childCount) {
      val found = findMatchingNode(node.getChild(index), needles, exact, includeResourceId)
      if (found != null) return found
    }

    return null
  }

  private fun nodeMatches(
    node: AccessibilityNodeInfo,
    needles: List<String>,
    exact: Boolean,
    includeResourceId: Boolean
  ): Boolean {
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

  private fun clickNode(node: AccessibilityNodeInfo): Boolean {
    val clickable = findClickableNode(node)
    if (clickable?.performAction(AccessibilityNodeInfo.ACTION_CLICK) == true) {
      return true
    }

    val bounds = Rect()
    node.getBoundsInScreen(bounds)
    if (bounds.width() <= 0 || bounds.height() <= 0) return false
    return tapBlocking(bounds.centerX().toFloat(), bounds.centerY().toFloat())
  }

  private fun scrollFirstScrollableForward(): Boolean {
    val root = rootInActiveWindow ?: return false
    val node = findScrollableNode(root) ?: return false
    return node.performAction(AccessibilityNodeInfo.ACTION_SCROLL_FORWARD)
  }

  private fun findScrollableNode(node: AccessibilityNodeInfo?): AccessibilityNodeInfo? {
    if (node == null) return null
    if (node.isScrollable) return node
    for (index in 0 until node.childCount) {
      val found = findScrollableNode(node.getChild(index))
      if (found != null) return found
    }
    return null
  }

  private fun swipeUpByScreen(): Boolean {
    val bounds = screenBounds(rootInActiveWindow)
    val x = bounds.centerX().toFloat()
    val startY = bounds.top + bounds.height() * 0.78f
    val endY = bounds.top + bounds.height() * 0.35f
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

  private fun dismissShopeeBlockingPopups() {
    clickByAnyText(listOf("ปิด", "Close", "ตกลง", "OK", "ข้าม", "Skip"), exact = true)
  }

  private fun dismissGoogleFlowBlockingPopups() {
    clickByAnyText(
      listOf(
        "ปิด",
        "Close",
        "OK",
        "Got it",
        "Accept",
        "ยอมรับ",
        "ข้าม",
        "Skip",
        "Not now",
        "ภายหลัง"
      ),
      exact = false
    )
  }

  private fun showAutomationOverlay(message: String) {
    mainHandler.post {
      val textView = ensureAutomationOverlay()
      textView.text = latestAutomationLogText()
      textView.visibility = android.view.View.VISIBLE
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
    }
  }

  private fun ensureAutomationOverlay(): TextView {
    overlayView?.let { return it }

    val textView = TextView(this).apply {
      setTextColor(Color.WHITE)
      textSize = 11f
      typeface = Typeface.MONOSPACE
      maxLines = 19
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
      y = dp(74)
    }

    automationWindowManager.addView(textView, params)
    overlayView = textView
    return textView
  }

  private val automationWindowManager: WindowManager
    get() = getSystemService(WINDOW_SERVICE) as WindowManager

  private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()

  fun performBack(): Boolean = performGlobalAction(GLOBAL_ACTION_BACK)

  private data class TextNode(
    val text: String,
    val bounds: Rect,
    val node: AccessibilityNodeInfo
  )

  private data class ShopeeLikedProductCandidate(
    val product: ShopeeLikedProduct,
    val tapBounds: Rect,
    val safeTop: Int
  )

  private data class GoogleFlowDownloadedAsset(
    val uri: String,
    val fileName: String?,
    val mimeType: String?,
    val sizeBytes: Long?,
    val createdAt: Long
  )

  private class ShopeeAutomationStoppedException : RuntimeException("Shopee automation stopped")
  private class GoogleFlowAutomationStoppedException : RuntimeException("Google Flow automation stopped")

  private fun Double.formatOneDecimal(): String = String.format(Locale.ROOT, "%.1f", this)
}
