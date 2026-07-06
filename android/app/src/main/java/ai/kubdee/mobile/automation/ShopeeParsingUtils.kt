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

internal fun KubdeeAccessibilityService.tapShopeeTopBackFallback(): Boolean {
  val screen = screenBounds(rootInActiveWindow)
  val x = screen.left + screen.width() * 0.065f
  val y = screen.top + screen.height() * 0.07f
  return tapBlocking(x, y, timeoutMs = 1800L, durationMs = 90L)
}

internal fun KubdeeAccessibilityService.normalizePrice(text: String): String? {
  val match = PRICE_REGEX.find(text) ?: return null
  return match.groupValues.getOrNull(1)?.replace(",", "")?.takeIf { it.isNotBlank() }
}

internal fun KubdeeAccessibilityService.findPriceNodes(textNodes: List<TextNode>): List<TextNode> {
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

internal fun KubdeeAccessibilityService.verticalOverlap(first: Rect, second: Rect): Int =
  (minOf(first.bottom, second.bottom) - maxOf(first.top, second.top)).coerceAtLeast(0)

internal fun KubdeeAccessibilityService.extractStock(text: String): Int? {
  val match = STOCK_REGEX.find(text) ?: return null
  val value = (match.groupValues.getOrNull(1).orEmpty().ifBlank { match.groupValues.getOrNull(2).orEmpty() })
    .replace(",", "")
  return value.toIntOrNull()
}

internal fun KubdeeAccessibilityService.extractUrl(text: String): String? = URL_REGEX.find(text)?.value

internal fun KubdeeAccessibilityService.extractShopeeImageUrl(value: String?): String? {
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

internal fun KubdeeAccessibilityService.findShopeeLikedProductImageUrl(
  imageNodes: List<ShopeeImageNode>,
  nameBounds: Rect,
  priceBounds: Rect,
  screen: Rect,
  safeTop: Int
): String? {
  if (imageNodes.isEmpty()) return null

  val columnWidth = shopeeLikedColumnWidth(screen)
  val cardTop = (nameBounds.top - (screen.height() * 0.36f).toInt()).coerceAtLeast(safeTop)
  val cardBottom = (priceBounds.bottom + (screen.height() * 0.12f).toInt()).coerceAtMost(screen.bottom)
  val sameColumnImages = imageNodes.filter { image ->
    val centerY = image.bounds.centerY()
    centerY in cardTop..cardBottom &&
      image.bounds.width() >= 32 &&
      image.bounds.height() >= 32 &&
      isSameShopeeLikedProductColumn(image.bounds, priceBounds, columnWidth)
  }
  val regionTop = (minOf(nameBounds.top, priceBounds.top) - (screen.height() * 0.34f).toInt())
    .coerceAtLeast(safeTop)
  val regionBottom = (priceBounds.bottom + (screen.height() * 0.10f).toInt())
    .coerceAtMost(screen.bottom)

  sameColumnImages
    .filter { image ->
      val centerY = image.bounds.centerY()
      centerY in regionTop..regionBottom
    }
    .minByOrNull { image ->
      val belowPricePenalty = if (image.bounds.top > priceBounds.bottom) 10_000 else 0
      val belowNamePenalty = if (image.bounds.top > nameBounds.bottom) 2_000 else 0
      val centerPenalty = kotlin.math.abs(image.bounds.centerX() - priceBounds.centerX())
      val verticalPenalty = kotlin.math.abs(image.bounds.bottom - nameBounds.top)
      belowPricePenalty + belowNamePenalty + centerPenalty + verticalPenalty
    }
    ?.imageUrl
    ?.let { return it }

  return sameColumnImages
    .filter { image -> image.bounds.bottom <= nameBounds.top + (screen.height() * 0.08f).toInt() }
    .maxByOrNull { image -> image.bounds.bottom }
    ?.imageUrl
}

internal fun KubdeeAccessibilityService.extractShopeeProductIdFromUrl(url: String): String? {
  extractShopeeProductIdFromResolvedUrl(url)?.let { return it }
  val resolvedUrl = if (url.contains("s.shopee", ignoreCase = true)) resolveShopeeUrl(url) else url
  return extractShopeeProductIdFromResolvedUrl(resolvedUrl)
}

internal fun KubdeeAccessibilityService.fallbackShopeeProductIdFromName(name: String): String? {
  val normalized = name.trim().lowercase(Locale.ROOT)
  if (normalized.isBlank()) return null
  val digest = MessageDigest.getInstance("SHA-1").digest(normalized.toByteArray(Charsets.UTF_8))
  val hash = digest.joinToString("") { byte ->
    (byte.toInt() and 0xff).toString(16).padStart(2, '0')
  }.take(16)
  return "shopee:$hash"
}

internal fun KubdeeAccessibilityService.resolveShopeeUrl(rawUrl: String): String {
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

internal fun KubdeeAccessibilityService.extractShopeeProductIdFromResolvedUrl(url: String): String? {
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

internal fun KubdeeAccessibilityService.isProductNameCandidate(text: String): Boolean {
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
  // label/badge ของ Shopee สั้นเสมอ (ยาวสุด ~17 ตัวอักษรแบบตัดช่องว่าง เช่น ขายแล้ว30พัน+ชิ้น)
  // ชื่อสินค้าจริงยาวกว่านั้น — ข้าม blocklist แบบ contains กันชื่อที่มีคำอย่าง
  // "รับประกัน 1 ปี" / "ผ่อน 0%" / "ส่งฟรี" โดนกรองทิ้งทั้งการ์ดจนสินค้าหายจากการ import
  if (compact.length >= 25) return true
  val blocked = listOf(
    "หน้าแรก", "mall", "live", "video", "สำหรับคุณ", "การแจ้งเตือน", "ฉัน",
    "สิ่งที่ฉันถูกใจ", "รายการถูกใจ", "liked", "ค้นหา", "แก้ไข", "edit",
    "โค้ดลด", "ส่วนลด", "coins", "coin", "เช็คอิน", "รับ", "ซื้อเลย",
    "ขายแล้ว", "ส่งฟรี", "วันที่", "แนะนำ", "ดูเพิ่มเติม", "ช้อปปี้ถูกชัวร์",
    "ถูกชัวร์", "spaylater", "payday", "flashsale", "มีบริการติดตั้ง", "ผ่อน"
  )
  return blocked.none { compact.contains(it.lowercase(Locale.ROOT).replace(Regex("""\s+"""), "")) }
}

internal fun KubdeeAccessibilityService.stableProductKey(product: ShopeeLikedProduct): String =
  "${product.name.trim().lowercase(Locale.ROOT)}\u0000${product.price.orEmpty()}"

internal fun KubdeeAccessibilityService.shopeeLikedCandidateAttemptKey(product: ShopeeLikedProduct): String =
  product.externalProductId
    ?: product.productUrl
    ?: cleanNodeText(product.name)
      .lowercase(Locale.ROOT)
      .replace(Regex("""\s+"""), "")

internal fun KubdeeAccessibilityService.likedProductSafeTop(textNodes: List<TextNode>, screen: Rect): Int {
  val markerBottom = textNodes
    .filter { textNode -> SHOPEE_LIKED_TEXTS.any { textNode.text.contains(it, ignoreCase = true) } }
    .maxOfOrNull { it.bounds.bottom }
  val searchBottom = textNodes
    .filter { it.text.contains("ค้นหา", ignoreCase = true) || it.text.contains("Search", ignoreCase = true) }
    .maxOfOrNull { it.bounds.bottom }
  return ((listOfNotNull(markerBottom, searchBottom) + (screen.top + 120)).maxOrNull() ?: (screen.top + 120)) + 12
}

internal fun KubdeeAccessibilityService.shopeeLikedColumnWidth(screen: Rect): Int =
  if (screen.width() >= 600) maxOf(220, screen.width() / 2) else screen.width()

internal fun KubdeeAccessibilityService.isSameShopeeLikedProductColumn(first: Rect, second: Rect, columnWidth: Int): Boolean =
  kotlin.math.abs(first.centerX() - second.centerX()).toFloat() <= columnWidth * 0.52f

internal fun KubdeeAccessibilityService.shopeeLikedCardBucket(tapBounds: Rect, priceBounds: Rect, screen: Rect): String {
  val column = if (priceBounds.centerX() < screen.centerX()) 0 else 1
  val yBucketSize = maxOf(180, screen.height() / 6)
  val midY = (tapBounds.centerY() + priceBounds.centerY()) / 2
  return "$column:${midY / yBucketSize}"
}

internal fun KubdeeAccessibilityService.isShopeeLikedProductTapBoundsSafe(tapBounds: Rect, screen: Rect, safeTop: Int): Boolean {
  val tapX = tapBounds.centerX()
  val tapY = tapBounds.centerY()
  return tapBounds.width() > 0 &&
    tapBounds.height() > 0 &&
    tapX > screen.left &&
    tapX < screen.right &&
    tapY > safeTop &&
    tapY < screen.bottom - (screen.height() * 0.08f).toInt()
}

internal fun KubdeeAccessibilityService.candidateRowBounds(node: AccessibilityNodeInfo, fallback: Rect, safeTop: Int, screen: Rect): Rect {
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

internal fun KubdeeAccessibilityService.collectTextNodes(
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

internal fun KubdeeAccessibilityService.collectShopeeImageNodes(
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
