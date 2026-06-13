package __PACKAGE_NAME__.automation

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Intent
import android.graphics.Color
import android.graphics.Path
import android.graphics.PixelFormat
import android.graphics.Rect
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
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

  companion object {
    private const val TAG = "KubdeeAccessibility"
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

  private class ShopeeAutomationStoppedException : RuntimeException("Shopee automation stopped")

  private fun Double.formatOneDecimal(): String = String.format(Locale.ROOT, "%.1f", this)
}
