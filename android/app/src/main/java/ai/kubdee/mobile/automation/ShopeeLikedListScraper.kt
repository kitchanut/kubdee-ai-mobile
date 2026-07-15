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

internal fun KubdeeAccessibilityService.isShopeeLikedListVisible(): Boolean {
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

internal fun KubdeeAccessibilityService.waitForShopeeLikedProductsReady(timeoutMs: Long): Boolean {
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

internal fun KubdeeAccessibilityService.shopeeLikedProductCandidateStats(): ShopeeLikedProductReadinessStats {
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

internal fun KubdeeAccessibilityService.scrollShopeeLikedList(): Boolean {
  logStep("เลื่อนหน้าถูกใจแบบสั้นเพื่อไม่ข้ามสินค้า")
  if (swipeUpByScreen(durationMs = 360L, startFraction = 0.76f, endFraction = 0.52f)) return true
  return scrollFirstScrollableForward(allowedPackageName = TARGET_PACKAGE_SHOPEE)
}

// หาขอบล่างของแถบตัวกรองรายการถูกใจ (ทั้งหมด/สถานะ/ส่วนลด/หมวดหมู่) จากจอปัจจุบัน
// คืน null เมื่อไม่เห็นแถบ — ใช้เช็คซ้ำก่อนแตะการ์ด กันพิกัดเก่าเลื่อนไปทับแถบ
internal fun KubdeeAccessibilityService.findShopeeLikedFilterBarBottom(): Int? {
  val root = rootInActiveWindow ?: return null
  val screen = screenBounds(root)
  val textNodes = mutableListOf<TextNode>()
  collectTextNodes(root, textNodes, allowedPackageName = TARGET_PACKAGE_SHOPEE)
  val filterLabels = listOf("ทั้งหมด", "สถานะ", "ส่วนลด", "หมวดหมู่")
  val limit = screen.top + (screen.height() * 0.35f).toInt()
  return textNodes
    .filter { node ->
      node.node.isVisibleToUser &&
        node.bounds.top <= limit &&
        filterLabels.any { label -> cleanNodeText(node.text).equals(label, ignoreCase = true) }
    }
    .maxOfOrNull { it.bounds.bottom }
}

// แผงตัวกรองหมวดหมู่ (เปิดจากแตะ หมวดหมู่ บนแถบกรองพลาด) จะบังรายการทั้งจอ
// สังเกตจากปุ่ม เลือกใหม่ + ตกลง — กด back ปิดแบบไม่ apply ตัวกรอง
internal fun KubdeeAccessibilityService.dismissShopeeLikedCategoryFilterPanelIfOpen(): Boolean {
  val root = rootInActiveWindow ?: return false
  val textNodes = mutableListOf<TextNode>()
  collectTextNodes(root, textNodes, allowedPackageName = TARGET_PACKAGE_SHOPEE)
  val hasReset = textNodes.any { node ->
    node.node.isVisibleToUser && cleanNodeText(node.text).equals("เลือกใหม่", ignoreCase = true)
  }
  val hasConfirm = textNodes.any { node ->
    node.node.isVisibleToUser && cleanNodeText(node.text).equals("ตกลง", ignoreCase = true)
  }
  if (!hasReset || !hasConfirm) return false

  logStep("พบแผงตัวกรองหมวดหมู่เปิดค้าง กด back ปิดโดยไม่ใช้ตัวกรอง")
  performBack()
  sleepStep(900L)
  return true
}

internal fun KubdeeAccessibilityService.scrapeVisibleShopeeLikedProductCandidates(): Pair<List<ShopeeLikedProductCandidate>, Boolean> {
  // ถ้ารอบก่อนเผลอแตะโดน หมวดหมู่ แผงตัวกรองจะเปิดบังรายการ — ปิดก่อนสแกน
  dismissShopeeLikedCategoryFilterPanelIfOpen()
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
      // โชว์ข้อความที่อยู่ใกล้ราคาที่สุดแต่ถูกกรองทิ้ง จะได้รู้ว่าการ์ดไหนหายเพราะอะไร
      val columnWidth = shopeeLikedColumnWidth(screen)
      val nearestText = visibleTextNodes
        .filter { node ->
          !PRICE_REGEX.containsMatchIn(node.text) &&
            node.bounds.bottom <= priceNode.bounds.top + 20 &&
            isSameShopeeLikedProductColumn(node.bounds, priceNode.bounds, columnWidth)
        }
        .minByOrNull { priceNode.bounds.top - it.bounds.bottom }
      logStep(
        "หาชื่อคู่ราคา ${priceNode.text} ไม่เจอ " +
          "ข้อความใกล้สุดเหนือราคา: ${nearestText?.let { cleanNodeText(it.text) } ?: "(ไม่มี)"}"
      )
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
      "(ราคา=${priceNodes.size}, text=${productTextNodes.size}, รูป=${visibleImageNodes.size}, " +
      "matchรูป=${products.values.count { it.product.imageUrl != null }}, ซ้ำ=$duplicateCount, noName=$noNameCount)"
  )
  return products.values.toList() to (recommendationTop != null)
}

internal fun KubdeeAccessibilityService.buildProductCandidateFromPriceNode(
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
    val name = cleanShopeeProductName(nameNode.text)
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

internal fun KubdeeAccessibilityService.findShopeeRecommendationStartY(textNodes: List<TextNode>): Int? =
  textNodes
    .filter { node ->
      val compact = node.text.replace(Regex("""\s+"""), "").lowercase(Locale.ROOT)
      SHOPEE_RECOMMENDATION_TEXTS.any { marker ->
        compact.contains(marker.replace(Regex("""\s+"""), "").lowercase(Locale.ROOT))
      }
    }
    .minOfOrNull { it.bounds.top }
