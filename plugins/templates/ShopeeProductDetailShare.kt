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

internal fun KubdeeAccessibilityService.enrichShopeeProductFromDetail(
    candidate: ShopeeLikedProductCandidate,
    copyProductUrl: Boolean
  ): ShopeeLikedProduct? {
  val product = candidate.product
  if (!openShopeeProductDetail(candidate)) {
    logStep("เปิด detail ไม่สำเร็จ ข้าม: ${product.name}")
    return null
  }

  try {
    val detailState = waitForShopeeProductDetailReady(12_000L)
    when (detailState) {
      ShopeeDetailScreenState.READY -> Unit
      ShopeeDetailScreenState.NO_PRODUCT -> {
        logStep("Shopee แจ้งว่าไม่มีสินค้านี้ ข้าม: ${product.name}")
        dismissShopeeNoProductDialog()
        return null
      }
      ShopeeDetailScreenState.LIST -> {
        logStep("เปิด detail ไม่สำเร็จ ยังอยู่หน้ารายการถูกใจ")
        return null
      }
      ShopeeDetailScreenState.LOADING -> {
        logStep("detail โหลดไม่สำเร็จ ข้าม: ${product.name}")
        return null
      }
    }

    val detailPrice = findShopeeDetailPrice() ?: product.price
    // The main product image usually finishes loading (and only then exposes its URL to
    // accessibility) a beat after the detail screen reaches READY, so a single immediate read
    // frequently misses it on slower connections. Poll briefly BEFORE copying the URL / opening
    // share UI (which can cover the detail image).
    val detailImageUrl = findShopeeDetailImageUrlWithRetry()
    val productUrl = if (copyProductUrl) {
      logStep("รอหน้า detail นิ่งก่อนแชร์สินค้า")
      sleepStep(900L)
      copyShopeeProductUrlFromDetail() ?: product.productUrl
    } else {
      logStep("ข้ามคัดลอกลิงก์สินค้าเพื่อลด memory ตอน import")
      product.productUrl
    }
    val shareDrawerImageUrl = if (isShopeeShareSheetVisible()) findShopeeShareDrawerImageUrl() else null
    val imageUrl = detailImageUrl ?: shareDrawerImageUrl ?: product.imageUrl
    val externalProductId = productUrl?.let { extractShopeeProductIdFromUrl(it) }
      ?: product.externalProductId
      ?: fallbackShopeeProductIdFromName(product.name)

    when {
      detailImageUrl != null -> logStep("รูปสินค้า: ได้จากหน้า detail")
      shareDrawerImageUrl != null -> logStep("รูปสินค้า: ได้จากแผงแชร์สินค้า")
      product.imageUrl != null -> logStep("รูปสินค้า: ใช้จากการ์ดสินค้า")
      else -> logStep("รูปสินค้า: ไม่พบจาก detail/แผงแชร์/การ์ด")
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

internal fun KubdeeAccessibilityService.enrichShopeeProductFromPartnerShare(candidate: ShopeePartnerOfferCandidate): ShopeeLikedProduct? {
    val product = candidate.product
    if (!tapShopeePartnerOfferShare(candidate)) {
      logStep("กดแชร์จากการ์ดไม่สำเร็จ ข้าม: ${product.name}")
      return null
    }

    try {
      if (!waitForShopeeShareSheetVisible(3_800L) && !retryShopeePartnerOfferShare(candidate)) {
        logStep("ไม่พบแผงแชร์หลังแตะการ์ดทุกวิธี ข้าม: ${product.name}")
        return null
      }

      // Capture the product-image URL from the share drawer BEFORE tapping download,
      // while the drawer is still in its initial state (a post-download toast/confirm
      // can shift the layout and make the URL harder to find).
      val shareImageUrl = findShopeeShareDrawerImageUrl()
      val httpImageUrl = shareImageUrl ?: product.imageUrl

      // The URL path needs no storage permission and works on every device/Android version.
      // Only fall back to Shopee's "download image" button — which lands in MediaStore and
      // requires READ_MEDIA_IMAGES to read back — when no usable URL is available.
      val downloadedImageUri = if (httpImageUrl == null) {
        downloadFirstShopeeShareImage(System.currentTimeMillis())
      } else {
        null
      }

      val productUrl = copyShopeeProductUrlFromCurrentShareSheet() ?: product.productUrl
      val externalProductId = productUrl?.let { extractShopeeProductIdFromUrl(it) }
        ?: product.externalProductId
        ?: fallbackShopeeProductIdFromName(product.name)
      if (productUrl != null) {
        logStep("ได้ลิงก์สินค้าจากการ์ด")
      } else {
        logStep("ยังไม่ได้ลิงก์สินค้า ใช้ข้อมูลบนการ์ดเท่าที่มี")
      }
      when {
        shareImageUrl != null -> logStep("รูปสินค้า: ใช้ URL จากแผงแชร์ (ไม่ต้องใช้สิทธิ์รูป)")
        product.imageUrl != null -> logStep("รูปสินค้า: ใช้ URL จากการ์ดข้อเสนอ (ไม่ต้องใช้สิทธิ์รูป)")
        downloadedImageUri != null -> logStep("รูปสินค้า: ไม่มี URL -> ดาวน์โหลดจากแผงแชร์สำเร็จ")
        else -> logStep("รูปสินค้า: ไม่พบจาก URL แผงแชร์/การ์ด และดาวน์โหลดไม่ได้")
      }

      return product.copy(
        productUrl = productUrl,
        externalProductId = externalProductId,
        imageUrl = httpImageUrl ?: downloadedImageUri,
        scrapedAt = System.currentTimeMillis()
      )
    } finally {
      closeShopeeShareSheet()
      val start = System.currentTimeMillis()
      while (System.currentTimeMillis() - start < 3_000L) {
        if (isShopeeImportListVisible()) break
        sleepStep(250L)
      }
      // ปุ่มแชร์การ์ดเปิดแกลเลอรีรูปสินค้า (เช่น 1/38) ซ้อนใต้แผงแชร์มาด้วย
      // ถ้าปิดแค่แผงแชร์ overlay จะค้าง ทำให้แตะการ์ดถัดไปพลาดทั้งหมด
      var extraBacks = 0
      while (!isShopeeImportListVisible() && extraBacks < 3) {
        logStep("ยังไม่เห็นหน้ารายการหลังปิดแผงแชร์ กด back ปิด overlay ที่ค้าง")
        performBack()
        extraBacks += 1
        sleepStep(900L)
      }
    }
  }

internal fun KubdeeAccessibilityService.tapShopeePartnerOfferShare(candidate: ShopeePartnerOfferCandidate): Boolean {
    return tapShopeePartnerOfferShareTarget(
      ShopeeShareTapTarget(Rect(candidate.shareBounds), candidate.shareSource)
    )
  }

internal fun KubdeeAccessibilityService.retryShopeePartnerOfferShare(candidate: ShopeePartnerOfferCandidate): Boolean {
    val tried = mutableSetOf<String>()
    tried.add("${candidate.shareBounds.centerX()}:${candidate.shareBounds.centerY()}")
    for (target in candidate.shareRetryTargets) {
      val key = "${target.bounds.centerX()}:${target.bounds.centerY()}"
      if (!tried.add(key)) continue
      logStep("แผงแชร์ยังไม่ขึ้น -> ลองกดแชร์อีกวิธี (${target.source})")
      if (!tapShopeePartnerOfferShareTarget(target)) continue
      if (waitForShopeeShareSheetVisible(3_800L)) return true
    }
    return false
  }

internal fun KubdeeAccessibilityService.tapShopeePartnerOfferShareTarget(target: ShopeeShareTapTarget): Boolean {
    val bounds = target.bounds
    // จุดคาดเดา (fallback) ชิดมุมขวาล่าง = ตำแหน่งปุ่มแชทลอยของ Shopee
    // แตะพลาดจะเด้งไปหน้า Customer Service — ข้ามเป้านี้ รอเห็นปุ่มแชร์จริงค่อยดึง
    if (target.source.contains("fallback")) {
      val display = displayBounds()
      if (
        display.width() > 0 &&
        bounds.centerX() > display.left + (display.width() * 0.80f).toInt() &&
        bounds.centerY() > display.top + (display.height() * 0.78f).toInt()
      ) {
        logStep("ข้ามจุดแชร์คาดเดาชิดมุมขวาล่าง (${target.source}) เสี่ยงชนปุ่มแชทลอย")
        return false
      }
    }
    logStep("กดแชร์การ์ดที่ ${bounds.centerX()},${bounds.centerY()} (${target.source})")
    return tapBlockingWithoutStopButton(bounds.centerX().toFloat(), bounds.centerY().toFloat(), timeoutMs = 2200L, durationMs = 90L)
  }

internal fun ShopeePartnerOfferCandidate.toLikedProductCandidate(): ShopeeLikedProductCandidate =
    ShopeeLikedProductCandidate(
      product = product,
      tapBounds = Rect(tapBounds),
      safeTop = safeTop
    )

internal fun KubdeeAccessibilityService.openShopeeProductDetail(candidate: ShopeeLikedProductCandidate): Boolean {
  val screen = screenBounds(rootInActiveWindow)
  val tapX = candidate.tapBounds.centerX().toFloat()
  val tapY = candidate.tapBounds.centerY().toFloat()
  if (!isShopeeLikedProductTapBoundsSafe(candidate.tapBounds, screen, candidate.safeTop)) {
    return false
  }
  // safeTop ของ candidate คำนวณตอนสแกน — กลับจากหน้า detail แล้วลิสต์อาจขยับ
  // เช็คแถบตัวกรอง (ทั้งหมด/สถานะ/ส่วนลด/หมวดหมู่) จากจอปัจจุบันซ้ำก่อนแตะจริง
  // กันแตะโดน หมวดหมู่ แล้วแผงตัวกรองเด้งเปิดค้างบังรายการ
  val liveFilterBarBottom = findShopeeLikedFilterBarBottom()
  if (liveFilterBarBottom != null && tapY <= liveFilterBarBottom + (screen.height() * 0.015f)) {
    logStep("ข้ามจุดแตะที่เลื่อนไปทับแถบตัวกรอง (${tapX.toInt()},${tapY.toInt()})")
    return false
  }
  logStep("กดสินค้าในรายการ (${tapX.toInt()},${tapY.toInt()})")
  return tapBlocking(tapX, tapY)
}

internal fun KubdeeAccessibilityService.waitForShopeeProductDetailReady(timeoutMs: Long, listGraceMs: Long = 3200L): ShopeeDetailScreenState {
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

internal fun KubdeeAccessibilityService.getShopeeProductDetailScreenState(): ShopeeDetailScreenState {
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
  if (
    joined.contains("มุมมองผู้ซื้อ") ||
    joined.contains("มุมมองพาร์ทเนอร์") ||
    joined.contains("ข้อเสนอที่ดีกว่า") ||
    joined.contains("ไม่พร้อมโปรโมต") ||
    listFilterHits >= 2
  ) {
    return ShopeeDetailScreenState.LIST
  }

  if (topActionHits > 0 && detailHits > 0) {
    return ShopeeDetailScreenState.READY
  }

  return ShopeeDetailScreenState.LOADING
}

internal fun KubdeeAccessibilityService.isShopeeProductDetailVisible(): Boolean =
  getShopeeProductDetailScreenState() == ShopeeDetailScreenState.READY

internal fun KubdeeAccessibilityService.dismissShopeeNoProductDialog(): Boolean {
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

// หน้า detail มีราคาหลายก้อน (ราคาผ่อนต่อเดือน ราคาชุด ราคาสินค้าที่คล้ายกัน) การกวาดทั้งหน้าแล้ว
// หยิบก้อนแรกตามลำดับ DFS จึงได้ราคามั่ว — ยึด resource id ของบล็อกราคาจริง (sectionProductPrice)
// เป็นหลัก แล้วค่อยถอยไปกวาดช่วงกลางหน้าเมื่อไม่มี anchor
internal fun KubdeeAccessibilityService.findShopeeDetailPrice(): String? {
  val root = rootInActiveWindow ?: return null
  val textNodes = mutableListOf<TextNode>()
  collectTextNodes(root, textNodes, allowedPackageName = TARGET_PACKAGE_SHOPEE)
  val screen = screenBounds(root)

  val priceSection = findShopeeDetailPriceSectionNode(root)
  if (priceSection != null) {
    val sectionNodes = mutableListOf<TextNode>()
    collectTextNodes(priceSection, sectionNodes, allowedPackageName = TARGET_PACKAGE_SHOPEE)
    if (sectionNodes.isEmpty()) {
      // บางบิลด์ sectionProductPrice เป็นกล่องเปล่า ตัวเลขราคาถูกวาดโดยโหนดที่ไม่ใช่ลูกโดยตรง
      val sectionBounds = Rect()
      priceSection.getBoundsInScreen(sectionBounds)
      if (sectionBounds.width() > 0 && sectionBounds.height() > 0) {
        sectionNodes += textNodes.filter { node -> sectionBounds.contains(node.bounds.centerX(), node.bounds.centerY()) }
      }
    }
    val sectionPrice = pickShopeeDetailPriceNode(sectionNodes, textNodes)
    if (sectionPrice != null) {
      val price = normalizePrice(sectionPrice.text)
      if (price != null) {
        logStep("ราคาสินค้า: อ่านจากบล็อกราคา sectionProductPrice ได้ ฿$price")
        return price
      }
    }
    logStep("ราคาสินค้า: เจอบล็อกราคา sectionProductPrice แต่อ่านตัวเลขไม่ได้ -> กวาดช่วงกลางหน้าแทน")
  } else {
    logStep("ราคาสินค้า: ไม่พบบล็อกราคา sectionProductPrice -> กวาดช่วงกลางหน้าแทน")
  }

  val bandNodes = textNodes.filter { node ->
    node.bounds.top in (screen.top + (screen.height() * 0.25f).toInt())..(screen.top + (screen.height() * 0.78f).toInt())
  }
  val bandPrice = pickShopeeDetailPriceNode(bandNodes, textNodes)?.text?.let { normalizePrice(it) }
  if (bandPrice != null) {
    logStep("ราคาสินค้า: อ่านจากช่วงกลางหน้า detail ได้ ฿$bandPrice")
  } else {
    logStep("ราคาสินค้า: อ่านจากหน้า detail ไม่ได้ -> ใช้ราคาจากการ์ดสินค้า")
  }
  return bandPrice
}

// เลือกราคาบนสุดของขอบเขตที่ให้มา หลังคัดก้อนราคาผ่อน/ราคาต่อชิ้นออกแล้ว
// (ราคาจริงของ Shopee อยู่บนสุดของบล็อกเสมอ ส่วนราคาผ่อน/ต่อชิ้นห้อยอยู่ใต้หรือข้างๆ)
internal fun KubdeeAccessibilityService.pickShopeeDetailPriceNode(
  scopedNodes: List<TextNode>,
  allTextNodes: List<TextNode>
): TextNode? {
  val prices = findPriceNodes(scopedNodes)
  if (prices.isEmpty()) return null
  val withoutUnitPrices = prices.filterNot { priceNode -> isShopeeUnitPriceNode(priceNode, allTextNodes) }
  // ถ้าตัวกรองคัดออกหมด (เช่น แบนเนอร์ "ผ่อน 0%" แปะชิดราคาจริง) อย่าทิ้งราคาไปเฉยๆ —
  // ราคาบนสุดของขอบเขตยังเป็นคำตอบที่ดีที่สุดเท่าที่มี
  return (withoutUnitPrices.ifEmpty { prices }).minByOrNull { it.bounds.top }
}

// ราคาผ่อน/ราคาต่อชิ้นมีป้ายกำกับ ("ผ่อน", "x10 เดือน", "/ชิ้น") อยู่ในตัวเองหรือชิดกันในแนวตั้ง
internal fun KubdeeAccessibilityService.isShopeeUnitPriceNode(
  priceNode: TextNode,
  allTextNodes: List<TextNode>
): Boolean {
  if (SHOPEE_UNIT_PRICE_TEXT_REGEX.containsMatchIn(priceNode.text)) return true
  return allTextNodes.any { node ->
    node.bounds != priceNode.bounds &&
      SHOPEE_UNIT_PRICE_TEXT_REGEX.containsMatchIn(node.text) &&
      verticalGap(priceNode.bounds, node.bounds) <= SHOPEE_UNIT_PRICE_LABEL_GAP_PX
  }
}

internal fun KubdeeAccessibilityService.findShopeeDetailPriceSectionNode(node: AccessibilityNodeInfo?): AccessibilityNodeInfo? {
  if (node == null) return null
  if (node.viewIdResourceName.orEmpty().endsWith("sectionProductPrice", ignoreCase = true)) return node
  for (index in 0 until node.childCount) {
    findShopeeDetailPriceSectionNode(node.getChild(index))?.let { return it }
  }
  return null
}

internal fun KubdeeAccessibilityService.findShopeeDetailImageUrl(): String? {
  val root = rootInActiveWindow ?: return null
  findShopeeDetailImageResourceUrl(root)?.let { return it }
  val imageId = findDetailImageCoverId(root) ?: return null
  return "https://down-th.img.susercontent.com/file/$imageId"
}

// Poll findShopeeDetailImageUrl() until the product image has loaded its URL, giving slow
// connections up to timeoutMs. Returns immediately when the image is already present (fast path,
// no delay). Logs each wait tick so a missing image is visible in the scan log.
internal fun KubdeeAccessibilityService.findShopeeDetailImageUrlWithRetry(
  timeoutMs: Long = 3_000L,
  intervalMs: Long = 500L
): String? {
  findShopeeDetailImageUrl()?.let { return it }

  val start = System.currentTimeMillis()
  logStep("รูปสินค้า: รูป detail ยังไม่โหลด รอสูงสุด ${(timeoutMs / 1000.0).formatOneDecimal()} วิ (เช็คทุก ${intervalMs}ms)")
  while (System.currentTimeMillis() - start < timeoutMs) {
    checkStopRequested()
    sleepStep(intervalMs)
    val elapsed = ((System.currentTimeMillis() - start) / 1000.0).formatOneDecimal()
    findShopeeDetailImageUrl()?.let {
      logStep("รูปสินค้า: โหลดรูป detail สำเร็จหลังรอ $elapsed วิ")
      return it
    }
    logStep("รูปสินค้า: กำลังรอรูป detail โหลด $elapsed วิ")
  }
  logStep("รูปสินค้า: รอรูป detail ครบ ${(timeoutMs / 1000.0).formatOneDecimal()} วิ ยังไม่พบ -> ใช้รูปสำรอง")
  return null
}

internal fun KubdeeAccessibilityService.findShopeeDetailImageResourceUrl(root: AccessibilityNodeInfo): String? {
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

internal fun KubdeeAccessibilityService.findDetailImageCoverId(node: AccessibilityNodeInfo?): String? {
  if (node == null) return null
  extractShopeeImageIdFromResourceName(node.viewIdResourceName)?.let { return it }
  for (index in 0 until node.childCount) {
    val found = findDetailImageCoverId(node.getChild(index))
    if (found != null) return found
  }
  return null
}
