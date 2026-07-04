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
    val detailImageUrl = findShopeeDetailImageUrl()
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
      logStep("กดแชร์จากการ์ดไม่สำเร็จ ข้าม: ${product.name.take(34)}")
      return null
    }

    try {
      if (!waitForShopeeShareSheetVisible(7_000L)) {
        logStep("ไม่พบแผงแชร์หลังแตะการ์ด ข้าม: ${product.name.take(34)}")
        return null
      }

      val downloadStartedAt = System.currentTimeMillis()
      val downloadedImageUri = downloadFirstShopeeShareImage(downloadStartedAt)
      val shareImageUrl = findShopeeShareDrawerImageUrl()
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
        downloadedImageUri != null -> logStep("รูปสินค้า: ดาวน์โหลดจากแผงแชร์สำเร็จ")
        shareImageUrl != null -> logStep("รูปสินค้า: ดาวน์โหลดไม่ได้ -> ใช้ URL จากแผงแชร์")
        product.imageUrl != null -> logStep("รูปสินค้า: ใช้ URL จากการ์ดข้อเสนอ")
        else -> logStep("รูปสินค้า: ไม่พบจากดาวน์โหลด/แผงแชร์/การ์ดข้อเสนอ")
      }

      return product.copy(
        productUrl = productUrl,
        externalProductId = externalProductId,
        imageUrl = downloadedImageUri ?: shareImageUrl ?: product.imageUrl,
        scrapedAt = System.currentTimeMillis()
      )
    } finally {
      closeShopeeShareSheet()
      val start = System.currentTimeMillis()
      while (System.currentTimeMillis() - start < 3_000L) {
        if (isShopeeImportListVisible()) break
        sleepStep(250L)
      }
    }
  }

internal fun KubdeeAccessibilityService.tapShopeePartnerOfferShare(candidate: ShopeePartnerOfferCandidate): Boolean {
    val bounds = candidate.shareBounds
    logStep("กดแชร์การ์ดที่ ${bounds.centerX()},${bounds.centerY()}")
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

internal fun KubdeeAccessibilityService.findShopeeDetailPrice(): String? {
  val root = rootInActiveWindow ?: return null
  val textNodes = mutableListOf<TextNode>()
  collectTextNodes(root, textNodes, allowedPackageName = TARGET_PACKAGE_SHOPEE)
  val screen = screenBounds(root)
  val candidates = textNodes.filter { node ->
    node.bounds.top in (screen.top + (screen.height() * 0.25f).toInt())..(screen.top + (screen.height() * 0.78f).toInt())
  }
  return findPriceNodes(candidates).firstOrNull()?.text?.let { normalizePrice(it) }
}

internal fun KubdeeAccessibilityService.findShopeeDetailImageUrl(): String? {
  val root = rootInActiveWindow ?: return null
  findShopeeDetailImageResourceUrl(root)?.let { return it }
  val imageId = findDetailImageCoverId(root) ?: return null
  return "https://down-th.img.susercontent.com/file/$imageId"
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
