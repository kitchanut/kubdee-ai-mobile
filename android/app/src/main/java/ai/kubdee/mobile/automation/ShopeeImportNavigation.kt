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

internal fun KubdeeAccessibilityService.goToShopeeMeTab(): Boolean {
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

internal fun KubdeeAccessibilityService.clickShopeeBottomMeTab(): Boolean {
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

internal fun KubdeeAccessibilityService.collectShopeeMeTabNodes(
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

internal fun KubdeeAccessibilityService.findClickableBottomTabAncestor(node: AccessibilityNodeInfo, screen: Rect): AccessibilityNodeInfo? {
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

internal fun KubdeeAccessibilityService.isShopeeMePageVisible(): Boolean = checkShopeeMePage().visible

internal fun KubdeeAccessibilityService.checkShopeeMePage(): ShopeeMePageCheck {
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

internal fun KubdeeAccessibilityService.openShopeeLikedList(): Boolean {
  if (isShopeeImportListVisible()) {
    return true
  }

  val maxAttempts = 12
  repeat(maxAttempts) { attempt ->
    dismissShopeeBlockingPopups()

    if (isShopeeImportListVisible()) {
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

  return isShopeeImportListVisible()
}

internal fun KubdeeAccessibilityService.tapShopeeMeTabFallback(): Boolean {
  val bounds = displayBounds()
  val x = bounds.left + bounds.width() * 0.92f
  val y = bounds.bottom - bounds.height() * 0.085f
  return tapBlocking(x, y, timeoutMs = 1800L, durationMs = 90L)
}

internal fun KubdeeAccessibilityService.resetShopeeMePageScrollTop() {
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
internal fun KubdeeAccessibilityService.waitForShopeeLikedListVisible(timeoutMs: Long): Boolean {
    val start = System.currentTimeMillis()
    while (System.currentTimeMillis() - start < timeoutMs) {
      if (isShopeeImportListVisible()) return true
      sleepStep(500)
    }
    return false
  }

internal fun KubdeeAccessibilityService.openShopeeAffiliateOfferPage(): Boolean {
    if (isShopeeAffiliateOfferPageVisible()) {
      logStep("อยู่หน้า Affiliate > ข้อเสนอแล้ว")
      return true
    }

    logStep("เปิด โปรแกรม Affiliate")
    if (!scrollUntilTapText(SHOPEE_AFFILIATE_TEXTS, maxAttempts = 8)) {
      logStep("ไม่พบเมนู โปรแกรม Affiliate")
      return false
    }

    if (waitForShopeeAffiliateOfferPageVisible(10_000L)) {
      logStep("หน้า Affiliate > ข้อเสนอ พร้อมแล้ว")
      return true
    }

    logStep("ลองกด tab ข้อเสนอ ในโปรแกรม Affiliate")
    if (tapShopeeAffiliateOffersTab() && waitForShopeeAffiliateOfferPageVisible(8_000L)) {
      logStep("เข้า tab ข้อเสนอ สำเร็จ")
      return true
    }

    return isShopeeAffiliateOfferPageVisible()
  }

internal fun KubdeeAccessibilityService.waitForShopeeAffiliateOfferPageVisible(timeoutMs: Long): Boolean {
    val start = System.currentTimeMillis()
    while (System.currentTimeMillis() - start < timeoutMs) {
      checkStopRequested()
      dismissShopeeBlockingPopups()
      if (isShopeeAffiliateOfferPageVisible()) return true
      sleepStep(500L)
    }
    return false
  }

internal fun KubdeeAccessibilityService.selectShopeeAffiliateOfferCategory(category: String): Boolean {
    val targetCategory = normalizeShopeeOfferCategory(category)
    logStep("เลือกหมวดข้อเสนอ: $targetCategory")

    findShopeeAffiliateOfferCategoryTab(targetCategory)?.let { candidate ->
      return tapShopeeAffiliateOfferCategory(candidate, targetCategory)
    }

    repeat(3) {
      checkStopRequested()
      if (!swipeShopeeAffiliateOfferCategoryRow(backward = true)) return@repeat
      sleepStep(450L)
      findShopeeAffiliateOfferCategoryTab(targetCategory)?.let { candidate ->
        return tapShopeeAffiliateOfferCategory(candidate, targetCategory)
      }
    }

    repeat(8) { attempt ->
      checkStopRequested()
      findShopeeAffiliateOfferCategoryTab(targetCategory)?.let { candidate ->
        return tapShopeeAffiliateOfferCategory(candidate, targetCategory)
      }
      if (attempt < 7) {
        if (!swipeShopeeAffiliateOfferCategoryRow(backward = false)) return@repeat
        sleepStep(550L)
      }
    }

    logStep("ไม่พบหมวดข้อเสนอ: $targetCategory")
    return false
  }

internal fun KubdeeAccessibilityService.findShopeeAffiliateOfferCategoryTab(category: String): TextNode? {
    val root = rootInActiveWindow ?: return null
    val screen = screenBounds(root)
    val textNodes = mutableListOf<TextNode>()
    collectTextNodes(root, textNodes, allowedPackageName = TARGET_PACKAGE_SHOPEE)
    val topLimit = screen.top + (screen.height() * 0.28f).toInt()
    val bottomLimit = screen.bottom - (screen.height() * 0.16f).toInt()
    return textNodes
      .filter { node ->
        node.node.isVisibleToUser &&
          cleanNodeText(node.text).equals(category, ignoreCase = true) &&
          node.bounds.centerY() in topLimit..bottomLimit
      }
      .minWithOrNull(compareBy<TextNode> { it.bounds.top }.thenBy { it.bounds.left })
  }

internal fun KubdeeAccessibilityService.tapShopeeAffiliateOfferCategory(candidate: TextNode, category: String): Boolean {
    val root = rootInActiveWindow ?: return false
    val screen = screenBounds(root)
    val tapBounds = shopeeAffiliateOfferCategoryTapBounds(candidate, screen)
    logStep(
      "แตะหมวดข้อเสนอ '$category' ที่ ${tapBounds.centerX()},${tapBounds.centerY()} " +
        "จาก text ${candidate.bounds.left},${candidate.bounds.top},${candidate.bounds.right},${candidate.bounds.bottom}"
    )
    val tapped = tapBlocking(
      tapBounds.centerX().toFloat(),
      tapBounds.centerY().toFloat(),
      timeoutMs = 1800L,
      durationMs = 100L
    ) || (candidate.node.isClickable && candidate.node.performAction(AccessibilityNodeInfo.ACTION_CLICK))
    if (tapped) {
      sleepStep(1200L)
      dismissShopeeBlockingPopups()
      logStep("เลือกหมวดข้อเสนอแล้ว: $category")
    }
    return tapped
  }

internal fun KubdeeAccessibilityService.shopeeAffiliateOfferCategoryTapBounds(candidate: TextNode, screen: Rect): Rect {
    val textBounds = candidate.bounds
    val horizontalPadding = minOf(dp(10), maxOf(dp(3), textBounds.width() / 8))
    val halfHeight = maxOf(dp(20), (textBounds.height() / 2) + dp(12))
    val centerY = textBounds.centerY()
    return Rect(
      (textBounds.left - horizontalPadding).coerceAtLeast(screen.left),
      (centerY - halfHeight).coerceAtLeast(screen.top),
      (textBounds.right + horizontalPadding).coerceAtMost(screen.right),
      (centerY + halfHeight).coerceAtMost(screen.bottom)
    )
  }

internal fun KubdeeAccessibilityService.swipeShopeeAffiliateOfferCategoryRow(backward: Boolean): Boolean {
    val root = rootInActiveWindow ?: return false
    val screen = screenBounds(root)
    val rowY = findShopeeAffiliateOfferCategoryRowY(root, screen)
      ?: (screen.top + screen.height() * 0.70f).toInt()
    val startX = if (backward) {
      screen.left + screen.width() * 0.20f
    } else {
      screen.right - screen.width() * 0.08f
    }
    val endX = if (backward) {
      screen.right - screen.width() * 0.08f
    } else {
      screen.left + screen.width() * 0.20f
    }
    return swipeBlocking(startX, rowY.toFloat(), endX, rowY.toFloat(), 360L)
  }

internal fun KubdeeAccessibilityService.findShopeeAffiliateOfferCategoryRowY(
    root: AccessibilityNodeInfo,
    screen: Rect
  ): Int? {
    val textNodes = mutableListOf<TextNode>()
    collectTextNodes(root, textNodes, allowedPackageName = TARGET_PACKAGE_SHOPEE)
    val topLimit = screen.top + (screen.height() * 0.28f).toInt()
    val bottomLimit = screen.bottom - (screen.height() * 0.16f).toInt()
    return textNodes
      .filter { node ->
        node.node.isVisibleToUser &&
          node.bounds.centerY() in topLimit..bottomLimit &&
          SHOPEE_OFFER_CATEGORY_TEXTS.any { label -> cleanNodeText(node.text).equals(label, ignoreCase = true) }
      }
      .maxByOrNull { it.bounds.top }
      ?.bounds
      ?.centerY()
  }

internal fun KubdeeAccessibilityService.tapShopeeAffiliateOffersTab(): Boolean {
    if (isShopeeAffiliateOfferPageVisible()) return true

    for (root in shopeeWindowRoots()) {
      val screen = screenBounds(root)
      val textNodes = mutableListOf<TextNode>()
      collectTextNodes(root, textNodes, allowedPackageName = TARGET_PACKAGE_SHOPEE)
      val candidates = textNodes
        .filter { candidate ->
          candidate.text.equals("ข้อเสนอ", ignoreCase = true) &&
            candidate.bounds.top >= screen.top + (screen.height() * 0.78f).toInt()
        }
        .sortedWith(compareBy<TextNode> { it.bounds.top }.thenBy { it.bounds.left })

      for (candidate in candidates) {
        val tapBounds = bottomNavTapBounds(candidate.node, candidate.bounds, screen)
        if (tapBlocking(tapBounds.centerX().toFloat(), tapBounds.centerY().toFloat(), durationMs = 120L)) return true
        if (clickNode(candidate.node)) return true
      }
    }

    val display = displayBounds()
    return tapBlocking(
      display.left + display.width() * 0.125f,
      display.bottom - display.height() * 0.08f,
      durationMs = 120L
    )
  }

internal fun KubdeeAccessibilityService.isShopeeAffiliateOfferPageVisible(): Boolean {
    val root = rootInActiveWindow ?: return false
    val screen = screenBounds(root)
    val textNodes = mutableListOf<TextNode>()
    collectTextNodes(root, textNodes, allowedPackageName = TARGET_PACKAGE_SHOPEE)
    if (textNodes.isEmpty()) return false

    val bottomNavStart = screen.bottom - (screen.height() * 0.14f).toInt()
    val hasBottomOfferTab = textNodes.any { node ->
      node.node.isVisibleToUser &&
        node.bounds.top >= bottomNavStart &&
        node.text.equals("ข้อเสนอ", ignoreCase = true)
    }
    val categoryHits = textNodes.count { node ->
      node.node.isVisibleToUser &&
        node.bounds.top < screen.bottom - (screen.height() * 0.10f).toInt() &&
        (
          SHOPEE_OFFER_CATEGORY_TEXTS.any { marker -> node.text.contains(marker, ignoreCase = true) } ||
            listOf("สินค้ารีวิวรับเงินคืนได้", "ค่าคอมพิเศษ").any { marker ->
              node.text.contains(marker, ignoreCase = true)
            }
        )
    }
    val affiliateHits = textNodes.count { node ->
      node.node.isVisibleToUser &&
        listOf("ค่าคอมมิชชั่น", "จำนวนคลิก", "คำสั่งซื้อ", "ค่าคอมโดยประมาณ").any { marker ->
          node.text.contains(marker, ignoreCase = true)
        }
    }
    val shareButtons = findShopeePartnerOfferShareButtons(root, screen, 0, screen.bottom)
      .count { it.gridLike }

    return hasBottomOfferTab && (categoryHits >= 2 || affiliateHits >= 1 || shareButtons > 0)
  }

internal fun KubdeeAccessibilityService.waitForShopeeAffiliateOffersReady(timeoutMs: Long): Boolean {
    val start = System.currentTimeMillis()
    var lastLog = 0L
    var scrollAttempts = 0
    while (System.currentTimeMillis() - start < timeoutMs) {
      checkStopRequested()
      val offers = scrapeVisibleShopeePartnerOfferCandidates(status = SHOPEE_IMPORT_SOURCE_OFFERS, logResult = false)
      if (offers.isNotEmpty()) {
        logStep("สินค้าในหน้าข้อเสนอโหลดแล้ว (${offers.size} การ์ด)")
        return true
      }

      val now = System.currentTimeMillis()
      if (now - lastLog > 3000L) {
        logStep("รอสินค้าในหน้าข้อเสนอ ${((now - start) / 1000.0).formatOneDecimal()} วิ")
        lastLog = now
      }

      if (isShopeeAffiliateOfferPageVisible() && scrollAttempts < 4) {
        scrollAttempts += 1
        scrollShopeeAffiliateOffersList()
      } else {
        sleepStep(750L)
      }
    }
    return false
  }

internal fun KubdeeAccessibilityService.scrollShopeeAffiliateOffersList(): Boolean {
    logStep("เลื่อนหน้าข้อเสนอแบบสั้น")
    if (swipeUpByScreen(durationMs = 360L, startFraction = 0.78f, endFraction = 0.52f)) return true
    return scrollFirstScrollableForward(allowedPackageName = TARGET_PACKAGE_SHOPEE)
  }

internal fun KubdeeAccessibilityService.ensureShopeeBuyerLikedView(): Boolean {
    if (isShopeeBuyerLikedViewVisible()) {
      logStep("ใช้มุมมองผู้ซื้อสำหรับรายการถูกใจ")
      return true
    }
    if (!isShopeePartnerLikedViewVisible()) {
      logStep("ใช้หน้าถูกใจปัจจุบันเป็นมุมมองผู้ซื้อ")
      return true
    }
    return switchToShopeeBuyerLikedView()
  }

internal fun KubdeeAccessibilityService.switchToShopeeBuyerLikedView(): Boolean {
    if (isShopeeBuyerLikedViewVisible()) {
      logStep("อยู่ในมุมมองผู้ซื้อแล้ว")
      return true
    }

    repeat(3) { attempt ->
      checkStopRequested()
      dismissShopeeBlockingPopups()
      logStep("สลับเป็นมุมมองผู้ซื้อ (${attempt + 1}/3)")

      if (!runShopeeLikedViewTapWithHiddenOverlay { clickShopeeLikedViewSwitcher() }) {
        logStep("ยังไม่พบปุ่มสลับมุมมองถูกใจ")
        sleepStep(700L)
        return@repeat
      }

      sleepStep(650L)
      if (isShopeeBuyerLikedViewVisible()) {
        logStep("เข้าใช้มุมมองผู้ซื้อแล้ว")
        return true
      }

      if (!runShopeeLikedViewTapWithHiddenOverlay { clickShopeeBuyerViewOption() }) {
        logStep("ยังไม่พบตัวเลือก มุมมองผู้ซื้อ")
        performBack()
        sleepStep(650L)
        return@repeat
      }

      val start = System.currentTimeMillis()
      while (System.currentTimeMillis() - start < 7_000L) {
        checkStopRequested()
        if (isShopeeBuyerLikedViewVisible()) {
          logStep("เข้าใช้มุมมองผู้ซื้อแล้ว")
          return true
        }
        sleepStep(450L)
      }
    }

    logStep("สลับมุมมองผู้ซื้อไม่สำเร็จ")
    return false
  }

internal fun KubdeeAccessibilityService.switchToShopeePartnerLikedView(): Boolean {
    if (isShopeePartnerLikedViewVisible()) {
      logStep("อยู่ในมุมมองพาร์ทเนอร์แล้ว")
      return true
    }

    repeat(3) { attempt ->
      checkStopRequested()
      dismissShopeeBlockingPopups()
      logStep("สลับเป็นมุมมองพาร์ทเนอร์ (${attempt + 1}/3)")

      if (!runShopeeLikedViewTapWithHiddenOverlay { clickShopeeLikedViewSwitcher() }) {
        logStep("ยังไม่พบปุ่มสลับมุมมองถูกใจ")
        sleepStep(700L)
        return@repeat
      }

      sleepStep(650L)
      if (isShopeePartnerLikedViewVisible()) {
        logStep("เข้าใช้มุมมองพาร์ทเนอร์แล้ว")
        return true
      }

      if (!runShopeeLikedViewTapWithHiddenOverlay { clickShopeePartnerViewOption() }) {
        logStep("ยังไม่พบตัวเลือก มุมมองพาร์ทเนอร์")
        performBack()
        sleepStep(650L)
        return@repeat
      }

      val start = System.currentTimeMillis()
      while (System.currentTimeMillis() - start < 7_000L) {
        checkStopRequested()
        if (isShopeePartnerLikedViewVisible()) {
          logStep("เข้าใช้มุมมองพาร์ทเนอร์แล้ว")
          return true
        }
        sleepStep(450L)
      }
    }

    logStep("สลับมุมมองพาร์ทเนอร์ไม่สำเร็จ")
    return false
  }

internal fun KubdeeAccessibilityService.runShopeeLikedViewTapWithHiddenOverlay(action: () -> Boolean): Boolean {
    val restoreSuppressed = automationFloatingUiSuppressed
    setAutomationFloatingUiSuppressedBlocking(true)
    sleepStep(180L)
    return try {
      action()
    } finally {
      setAutomationFloatingUiSuppressedBlocking(restoreSuppressed)
      sleepStep(120L)
    }
  }

internal fun KubdeeAccessibilityService.clickShopeeLikedViewSwitcher(): Boolean {
    val root = rootInActiveWindow ?: return false
    val screen = screenBounds(root)
    val textNodes = mutableListOf<TextNode>()
    collectTextNodes(root, textNodes, allowedPackageName = TARGET_PACKAGE_SHOPEE)
    val topLimit = screen.top + (screen.height() * 0.16f).toInt()
    val candidate = textNodes
      .filter { node ->
        node.node.isVisibleToUser &&
          node.bounds.top <= topLimit &&
          (
            node.text.contains("มุมมองผู้ซื้อ", ignoreCase = true) ||
              node.text.contains("มุมมองพาร์ทเนอร์", ignoreCase = true) ||
              node.text.contains("Buyer View", ignoreCase = true) ||
              node.text.contains("Partner View", ignoreCase = true)
          )
      }
      .minByOrNull { it.bounds.top }

    if (candidate != null) {
      val tapBounds = menuTapBounds(candidate.node, candidate.bounds, screen)
      logStep("กดตัวสลับมุมมองที่ ${tapBounds.centerX()},${tapBounds.centerY()}")
      if (tapBlocking(tapBounds.centerX().toFloat(), tapBounds.centerY().toFloat())) return true
    }

    val fallbackX = screen.left + screen.width() * 0.36f
    val fallbackY = screen.top + screen.height() * 0.075f
    logStep("กดตัวสลับมุมมองด้วยพิกัด fallback")
    return tapBlocking(fallbackX, fallbackY, timeoutMs = 1800L, durationMs = 90L)
  }

internal fun KubdeeAccessibilityService.clickShopeeBuyerViewOption(): Boolean {
    val root = rootInActiveWindow ?: return false
    val screen = screenBounds(root)
    val textNodes = mutableListOf<TextNode>()
    collectTextNodes(root, textNodes, allowedPackageName = TARGET_PACKAGE_SHOPEE)
    val topLimit = screen.top + (screen.height() * 0.10f).toInt()
    val candidate = textNodes
      .filter { node ->
        node.node.isVisibleToUser &&
          node.bounds.top > topLimit &&
          (
            node.text.contains("มุมมองผู้ซื้อ", ignoreCase = true) ||
              node.text.contains("Buyer View", ignoreCase = true)
          )
      }
      .minByOrNull { it.bounds.top }
      ?: return false

    val tapBounds = menuTapBounds(candidate.node, candidate.bounds, screen)
    logStep("กดตัวเลือก มุมมองผู้ซื้อ")
    return tapBlocking(tapBounds.centerX().toFloat(), tapBounds.centerY().toFloat(), timeoutMs = 1800L, durationMs = 90L)
  }

internal fun KubdeeAccessibilityService.clickShopeePartnerViewOption(): Boolean {
    val root = rootInActiveWindow ?: return false
    val screen = screenBounds(root)
    val textNodes = mutableListOf<TextNode>()
    collectTextNodes(root, textNodes, allowedPackageName = TARGET_PACKAGE_SHOPEE)
    val topLimit = screen.top + (screen.height() * 0.10f).toInt()
    val candidate = textNodes
      .filter { node ->
        node.node.isVisibleToUser &&
          node.bounds.top > topLimit &&
          (
            node.text.contains("มุมมองพาร์ทเนอร์", ignoreCase = true) ||
              node.text.contains("Partner View", ignoreCase = true)
          )
      }
      .minByOrNull { it.bounds.top }
      ?: return false

    val tapBounds = menuTapBounds(candidate.node, candidate.bounds, screen)
    logStep("กดตัวเลือก มุมมองพาร์ทเนอร์")
    return tapBlocking(tapBounds.centerX().toFloat(), tapBounds.centerY().toFloat(), timeoutMs = 1800L, durationMs = 90L)
  }

internal fun KubdeeAccessibilityService.isShopeeBuyerLikedViewVisible(): Boolean {
    if (!isShopeeLikedListVisible()) return false
    val root = rootInActiveWindow ?: return false
    val screen = screenBounds(root)
    val textNodes = mutableListOf<TextNode>()
    collectTextNodes(root, textNodes, allowedPackageName = TARGET_PACKAGE_SHOPEE)
    val topLimit = screen.top + (screen.height() * 0.22f).toInt()
    val hasBuyerTitle = textNodes.any { node ->
      node.node.isVisibleToUser &&
        node.bounds.top <= topLimit &&
        (
          node.text.contains("มุมมองผู้ซื้อ", ignoreCase = true) ||
            node.text.contains("Buyer View", ignoreCase = true)
        )
    }
    if (hasBuyerTitle) return true
    return !isShopeePartnerLikedViewVisible()
  }

internal fun KubdeeAccessibilityService.isShopeePartnerLikedViewVisible(): Boolean {
    val root = rootInActiveWindow ?: return false
    val screen = screenBounds(root)
    val textNodes = mutableListOf<TextNode>()
    collectTextNodes(root, textNodes, allowedPackageName = TARGET_PACKAGE_SHOPEE)
    if (textNodes.isEmpty()) return false

    val topLimit = screen.top + (screen.height() * 0.22f).toInt()
    val hasPartnerTitle = textNodes.any { node ->
      node.node.isVisibleToUser &&
        node.bounds.top <= topLimit &&
        (
          node.text.contains("มุมมองพาร์ทเนอร์", ignoreCase = true) ||
            node.text.contains("Partner View", ignoreCase = true)
        )
    }
    if (hasPartnerTitle) return true

    val filterHits = textNodes.count { node ->
      node.node.isVisibleToUser &&
        node.bounds.top <= screen.top + (screen.height() * 0.34f).toInt() &&
        listOf("เรียงตาม", "ข้อเสนอที่ดีกว่า", "ไม่พร้อมโปรโมต", "Sort", "Offer").any { marker ->
          node.text.contains(marker, ignoreCase = true)
        }
    }
    val shareButtons = findShopeePartnerOfferShareButtons(root, screen, 0, screen.bottom).size
    return filterHits >= 1 && shareButtons > 0
  }
internal fun KubdeeAccessibilityService.waitForShopeePartnerOffersReady(timeoutMs: Long): Boolean {
    val start = System.currentTimeMillis()
    var lastLog = 0L
    while (System.currentTimeMillis() - start < timeoutMs) {
      checkStopRequested()
      val offers = scrapeVisibleShopeePartnerOfferCandidates(logResult = false)
      if (offers.isNotEmpty()) {
        logStep("สินค้าในมุมมองพาร์ทเนอร์โหลดแล้ว (${offers.size} การ์ด)")
        return true
      }

      val now = System.currentTimeMillis()
      if (now - lastLog > 3000L) {
        logStep("รอสินค้าในมุมมองพาร์ทเนอร์ ${((now - start) / 1000.0).formatOneDecimal()} วิ")
        lastLog = now
      }
      sleepStep(750L)
    }
    return false
  }
internal fun KubdeeAccessibilityService.scrollShopeePartnerLikedList(): Boolean {
    logStep("เลื่อนมุมมองพาร์ทเนอร์แบบสั้น")
    if (swipeUpByScreen(durationMs = 360L, startFraction = 0.76f, endFraction = 0.52f)) return true
    return scrollFirstScrollableForward(allowedPackageName = TARGET_PACKAGE_SHOPEE)
  }
internal fun KubdeeAccessibilityService.scrapeVisibleShopeePartnerOfferCandidates(
    status: String = SHOPEE_IMPORT_SOURCE_LIKED,
    logResult: Boolean = true
  ): List<ShopeePartnerOfferCandidate> {
    val root = rootInActiveWindow ?: return emptyList()
    if (isShopeeShareSheetVisible()) closeShopeeShareSheet()
    val screen = screenBounds(root)
    val textNodes = mutableListOf<TextNode>()
    collectTextNodes(root, textNodes, allowedPackageName = TARGET_PACKAGE_SHOPEE)
    val imageNodes = mutableListOf<ShopeeImageNode>()
    collectShopeeImageNodes(root, imageNodes, allowedPackageName = TARGET_PACKAGE_SHOPEE)
    val safeTop = partnerOfferSafeTop(textNodes, screen)
    val safeBottom = screen.bottom - (screen.height() * 0.13f).toInt()
    val shareButtons = findShopeePartnerOfferShareButtons(root, screen, safeTop, safeBottom)
      .sortedWith(compareBy<ShopeePartnerShareButton> { it.bounds.top }.thenBy { it.bounds.left })

    val products = linkedMapOf<String, ShopeePartnerOfferCandidate>()
    var noNameCount = 0
    var duplicateCount = 0
    var fallbackCount = 0
    for (shareButton in shareButtons) {
      val candidate = buildShopeePartnerOfferCandidate(
        textNodes = textNodes,
        imageNodes = imageNodes,
        shareButton = shareButton,
        screen = screen,
        safeTop = safeTop,
        safeBottom = safeBottom,
        status = status
      )
      if (candidate == null) {
        noNameCount += 1
        continue
      }

      val key = candidate.product.externalProductId ?: stableProductKey(candidate.product)
      if (products.containsKey(key)) {
        duplicateCount += 1
        continue
      }
      products[key] = candidate
    }

    if (status == SHOPEE_IMPORT_SOURCE_OFFERS) {
      val clickableNodes = mutableListOf<Pair<Rect, AccessibilityNodeInfo>>()
      collectClickableNodes(root, clickableNodes)
      val iconNodes = mutableListOf<Pair<Rect, AccessibilityNodeInfo>>()
      collectVisibleImageViewNodes(root, iconNodes, allowedPackageName = TARGET_PACKAGE_SHOPEE)
      val fallbackCandidates = buildShopeeAffiliateOfferGridCandidatesFromPriceNodes(
        textNodes = textNodes,
        imageNodes = imageNodes,
        clickableNodes = clickableNodes,
        iconNodes = iconNodes,
        screen = screen,
        safeTop = safeTop,
        safeBottom = safeBottom,
        status = status
      )
      for (candidate in fallbackCandidates) {
        val key = candidate.product.externalProductId ?: stableProductKey(candidate.product)
        if (products.containsKey(key)) {
          duplicateCount += 1
          continue
        }
        products[key] = candidate
        fallbackCount += 1
      }
    }

    if (logResult) {
      if (status == SHOPEE_IMPORT_SOURCE_OFFERS) {
        when {
          fallbackCount > 0 -> {
            val fallbackReason = if (shareButtons.isEmpty()) {
              "ไม่พบ resource id ปุ่มแชร์ Shopee"
            } else {
              "resource id ปุ่มแชร์ Shopee เจอไม่ครบ"
            }
            logStep("$fallbackReason -> ใช้วิธีอ่านกริดจากราคา+ชื่อสินค้าแทน (+$fallbackCount การ์ด)")
          }
          shareButtons.isEmpty() -> {
            logStep("ไม่พบ resource id ปุ่มแชร์ Shopee -> fallback ราคา+ชื่อสินค้ายังไม่พบการ์ด")
          }
        }
      }
      logStep(
        "สแกนมุมมองพาร์ทเนอร์พบ ${products.size} การ์ด " +
          "(share=${shareButtons.size}, fallback=$fallbackCount, รูป=${imageNodes.size}, " +
          "matchรูป=${products.values.count { it.product.imageUrl != null }}, noName=$noNameCount, ซ้ำ=$duplicateCount)"
      )
    }
    return products.values.toList()
  }
internal fun KubdeeAccessibilityService.partnerOfferSafeTop(textNodes: List<TextNode>, screen: Rect): Int {
    val markerBottom = textNodes
      .filter { node ->
        node.node.isVisibleToUser &&
          node.bounds.top <= screen.top + (screen.height() * 0.32f).toInt() &&
          listOf(
            "มุมมองผู้ซื้อ",
            "มุมมองพาร์ทเนอร์",
            "Buyer View",
            "Partner View",
            "เรียงตาม",
            "ข้อเสนอที่ดีกว่า",
            "ไม่พร้อมโปรโมต",
            *SHOPEE_OFFER_CATEGORY_TEXTS.toTypedArray(),
            "สินค้ารีวิวรับเงินคืนได้",
            "ค่าคอมพิเศษ"
          ).any { marker -> node.text.contains(marker, ignoreCase = true) }
      }
      .maxOfOrNull { it.bounds.bottom }
    return ((markerBottom ?: (screen.top + 150)) + 12).coerceAtLeast(screen.top + 120)
  }
internal fun KubdeeAccessibilityService.findShopeePartnerOfferShareButtons(
    root: AccessibilityNodeInfo,
    screen: Rect,
    safeTop: Int,
    safeBottom: Int
  ): List<ShopeePartnerShareButton> {
    val output = mutableListOf<ShopeePartnerShareButton>()
    collectShopeePartnerOfferShareButtons(root, screen, safeTop, safeBottom, output)
    return output.distinctBy { "${it.bounds.left}:${it.bounds.top}:${it.bounds.right}:${it.bounds.bottom}" }
  }
internal fun KubdeeAccessibilityService.collectShopeePartnerOfferShareButtons(
    node: AccessibilityNodeInfo?,
    screen: Rect,
    safeTop: Int,
    safeBottom: Int,
    output: MutableList<ShopeePartnerShareButton>,
    depth: Int = 0
  ) {
    if (node == null || depth > 56) return
    if (node.isVisibleToUser && node.packageName?.toString() == TARGET_PACKAGE_SHOPEE) {
      val bounds = Rect()
      node.getBoundsInScreen(bounds)
      val resourceId = node.viewIdResourceName.orEmpty()
      val raw = "${readNodeText(node)} $resourceId".lowercase(Locale.ROOT)
      val looksLikeCardShare = raw.contains("offercard_control_icon_img_share") ||
        raw.contains("offer_card_control_icon_img_share")
      val looksLikeAffiliateOfferShare = raw.contains("an_commrate_shareiconwithbg_img") ||
        (raw.contains("commrate") && raw.contains("shareicon")) ||
        (raw.contains("commrate") && raw.contains("share"))
      val minShareX = if (looksLikeAffiliateOfferShare) {
        screen.left + (screen.width() * 0.34f).toInt()
      } else {
        screen.left + (screen.width() * 0.68f).toInt()
      }
      if (
        (looksLikeCardShare || looksLikeAffiliateOfferShare) &&
        bounds.width() > 0 &&
        bounds.height() > 0 &&
        bounds.centerY() in safeTop..safeBottom &&
        bounds.centerX() >= minShareX
      ) {
        val clickBounds = findSmallClickableAncestorBounds(node, bounds, screen)
        output += ShopeePartnerShareButton(
          bounds = clickBounds,
          iconBounds = Rect(bounds),
          gridLike = looksLikeAffiliateOfferShare
        )
      }
    }

    for (index in 0 until node.childCount) {
      collectShopeePartnerOfferShareButtons(node.getChild(index), screen, safeTop, safeBottom, output, depth + 1)
    }
  }
internal fun KubdeeAccessibilityService.findSmallClickableAncestorBounds(node: AccessibilityNodeInfo, fallback: Rect, screen: Rect): Rect {
    var current: AccessibilityNodeInfo? = node
    while (current != null) {
      val bounds = Rect()
      current.getBoundsInScreen(bounds)
      val containsCenter = bounds.contains(fallback.centerX(), fallback.centerY())
      if (
        current.isClickable &&
        containsCenter &&
        bounds.width() in fallback.width()..maxOf(96, (screen.width() * 0.22f).toInt()) &&
        bounds.height() in fallback.height()..maxOf(96, (screen.height() * 0.08f).toInt())
      ) {
        return Rect(bounds)
      }
      current = current.parent
    }
    return Rect(
      (fallback.left - 18).coerceAtLeast(screen.left),
      (fallback.top - 18).coerceAtLeast(screen.top),
      (fallback.right + 18).coerceAtMost(screen.right),
      (fallback.bottom + 18).coerceAtMost(screen.bottom)
    )
  }
internal fun KubdeeAccessibilityService.buildShopeePartnerOfferCandidate(
    textNodes: List<TextNode>,
    imageNodes: List<ShopeeImageNode>,
    shareButton: ShopeePartnerShareButton,
    screen: Rect,
    safeTop: Int,
    safeBottom: Int,
    status: String
  ): ShopeePartnerOfferCandidate? {
    if (shareButton.gridLike) {
      return buildShopeeAffiliateOfferGridCandidate(
        textNodes = textNodes,
        imageNodes = imageNodes,
        shareButton = shareButton,
        screen = screen,
        safeTop = safeTop,
        safeBottom = safeBottom,
        status = status
      )
    }

    val rowTop = (shareButton.bounds.top - (screen.height() * 0.15f).toInt()).coerceAtLeast(safeTop)
    val rowBottom = (shareButton.bounds.bottom + (screen.height() * 0.04f).toInt()).coerceAtMost(safeBottom)
    val rowTexts = textNodes.filter { node ->
      node.node.isVisibleToUser &&
        node.bounds.centerY() in rowTop..rowBottom
    }
    val nameNode = rowTexts
      .filter { node ->
        node.bounds.left >= screen.left + (screen.width() * 0.30f).toInt() &&
          node.bounds.top < shareButton.bounds.top + 12 &&
          isShopeePartnerProductNameCandidate(node.text)
      }
      .minWithOrNull(compareBy<TextNode> { it.bounds.top }.thenBy { it.bounds.left })
      ?: return null
    val name = cleanShopeePartnerProductName(nameNode.text).take(180)
    if (name.length < 5) return null

    val price = findPriceNodes(rowTexts).minByOrNull { it.bounds.top }?.text?.let { normalizePrice(it) }
    val productUrl = rowTexts.firstNotNullOfOrNull { extractUrl(it.text) }
    val externalProductId = productUrl?.let { extractShopeeProductIdFromUrl(it) }
      ?: fallbackShopeeProductIdFromName(name)
    val stock = rowTexts.firstNotNullOfOrNull { extractStock(it.text) }
    val imageUrl = findShopeeAffiliateOfferImageUrl(
      imageNodes = imageNodes,
      nameBounds = nameNode.bounds,
      priceBounds = shareButton.bounds,
      screen = screen,
      columnLeft = screen.left,
      columnRight = screen.left + (screen.width() * 0.52f).toInt(),
      cardTop = rowTop,
      cardBottom = rowBottom,
      safeTop = safeTop
    )
    val shareTargets = buildShopeePartnerResourceIdShareTargets(
      shareButton = shareButton,
      cardTexts = rowTexts,
      priceBounds = shareButton.iconBounds,
      screen = screen,
      columnLeft = screen.left,
      columnRight = screen.right,
      cardBottom = rowBottom,
      safeTop = safeTop,
      safeBottom = safeBottom
    )

    return ShopeePartnerOfferCandidate(
      product = ShopeeLikedProduct(
        name = name,
        price = price,
        stock = stock,
        productUrl = productUrl,
        externalProductId = externalProductId,
        imageUrl = imageUrl,
        status = status,
        scrapedAt = System.currentTimeMillis()
      ),
      tapBounds = findShopeePartnerDetailTapBounds(nameNode, shareButton, screen, safeTop),
      safeTop = safeTop,
      shareBounds = shareTargets.first().bounds,
      shareSource = shareTargets.first().source,
      shareRetryTargets = shareTargets.drop(1)
    )
  }

internal fun KubdeeAccessibilityService.buildShopeeAffiliateOfferGridCandidate(
    textNodes: List<TextNode>,
    imageNodes: List<ShopeeImageNode>,
    shareButton: ShopeePartnerShareButton,
    screen: Rect,
    safeTop: Int,
    safeBottom: Int,
    status: String
  ): ShopeePartnerOfferCandidate? {
    val margin = maxOf(8, (screen.width() * 0.018f).toInt())
    val centerX = shareButton.iconBounds.centerX()
    val isLeftColumn = centerX < screen.centerX()
    val columnLeft = if (isLeftColumn) screen.left + margin else screen.centerX()
    val columnRight = if (isLeftColumn) screen.centerX() else screen.right - margin
    val textTop = (shareButton.bounds.top - (screen.height() * 0.17f).toInt()).coerceAtLeast(safeTop)
    val cardTop = (shareButton.bounds.top - (screen.height() * 0.40f).toInt()).coerceAtLeast(safeTop)
    val cardBottom = (shareButton.bounds.bottom + (screen.height() * 0.05f).toInt()).coerceAtMost(safeBottom)
    val rowTexts = textNodes.filter { node ->
      node.node.isVisibleToUser &&
        node.bounds.centerX() in columnLeft..columnRight &&
        node.bounds.centerY() in textTop..cardBottom
    }
    val nameNode = rowTexts
      .filter { node ->
        node.bounds.top < shareButton.bounds.top + 12 &&
          node.bounds.right <= columnRight &&
          isShopeePartnerProductNameCandidate(node.text)
      }
      .minWithOrNull(compareBy<TextNode> { it.bounds.top }.thenBy { it.bounds.left })
      ?: return null
    val name = cleanShopeePartnerProductName(nameNode.text).take(180)
    if (name.length < 5) return null

    val price = findPriceNodes(rowTexts).minByOrNull { it.bounds.top }?.text?.let { normalizePrice(it) }
    val productUrl = rowTexts.firstNotNullOfOrNull { extractUrl(it.text) }
    val externalProductId = productUrl?.let { extractShopeeProductIdFromUrl(it) }
      ?: fallbackShopeeProductIdFromName(name)
    val stock = rowTexts.firstNotNullOfOrNull { extractStock(it.text) }
    val imageUrl = findShopeeAffiliateOfferImageUrl(
      imageNodes = imageNodes,
      nameBounds = nameNode.bounds,
      priceBounds = shareButton.bounds,
      screen = screen,
      columnLeft = columnLeft,
      columnRight = columnRight,
      cardTop = cardTop,
      cardBottom = cardBottom,
      safeTop = safeTop
    )

    val tapBounds = Rect(
      maxOf(nameNode.bounds.left, columnLeft),
      maxOf(nameNode.bounds.top, safeTop),
      minOf(nameNode.bounds.right, columnRight),
      minOf(maxOf(nameNode.bounds.bottom, nameNode.bounds.top + 48), shareButton.bounds.top - 8)
    )
    val shareTargets = buildShopeePartnerResourceIdShareTargets(
      shareButton = shareButton,
      cardTexts = rowTexts,
      priceBounds = shareButton.iconBounds,
      screen = screen,
      columnLeft = columnLeft,
      columnRight = columnRight,
      cardBottom = cardBottom,
      safeTop = safeTop,
      safeBottom = safeBottom
    )

    return ShopeePartnerOfferCandidate(
      product = ShopeeLikedProduct(
        name = name,
        price = price,
        stock = stock,
        productUrl = productUrl,
        externalProductId = externalProductId,
        imageUrl = imageUrl,
        status = status,
        scrapedAt = System.currentTimeMillis()
      ),
      tapBounds = tapBounds,
      safeTop = safeTop,
      shareBounds = shareTargets.first().bounds,
      shareSource = shareTargets.first().source,
      shareRetryTargets = shareTargets.drop(1)
    )
  }

internal fun KubdeeAccessibilityService.buildShopeePartnerResourceIdShareTargets(
    shareButton: ShopeePartnerShareButton,
    cardTexts: List<TextNode>,
    priceBounds: Rect,
    screen: Rect,
    columnLeft: Int,
    columnRight: Int,
    cardBottom: Int,
    safeTop: Int,
    safeBottom: Int
  ): List<ShopeeShareTapTarget> {
    val targets = mutableListOf(
      ShopeeShareTapTarget(Rect(shareButton.iconBounds), "resource id ปุ่มแชร์")
    )
    targets += ShopeeShareTapTarget(Rect(shareButton.bounds), "resource id clickable")

    val commissionNode = findShopeeAffiliateOfferGridCommissionNode(
      cardTexts = cardTexts,
      priceBounds = priceBounds,
      screen = screen,
      columnLeft = columnLeft,
      columnRight = columnRight,
      cardBottom = cardBottom,
      safeTop = safeTop,
      safeBottom = safeBottom
    )
    if (commissionNode != null) {
      targets += ShopeeShareTapTarget(
        estimateShopeeAffiliateOfferGridShareBoundsFromCommission(
          commissionNode = commissionNode,
          screen = screen,
          columnLeft = columnLeft,
          columnRight = columnRight,
          safeTop = safeTop,
          safeBottom = safeBottom
        ),
        "fallback แถวค่าคอม"
      )
    }

    return targets.distinctBy { "${it.bounds.centerX()}:${it.bounds.centerY()}" }
  }
internal fun KubdeeAccessibilityService.buildShopeeAffiliateOfferGridCandidatesFromPriceNodes(
  textNodes: List<TextNode>,
    imageNodes: List<ShopeeImageNode>,
    clickableNodes: List<Pair<Rect, AccessibilityNodeInfo>>,
    iconNodes: List<Pair<Rect, AccessibilityNodeInfo>>,
    screen: Rect,
    safeTop: Int,
    safeBottom: Int,
    status: String
  ): List<ShopeePartnerOfferCandidate> {
    val visibleTextNodes = textNodes.filter { node ->
      node.node.isVisibleToUser &&
        node.bounds.centerY() in safeTop..safeBottom
    }
    val visibleImageNodes = imageNodes.filter { image ->
      image.bounds.centerY() in safeTop..safeBottom
    }
    val priceNodes = findPriceNodes(visibleTextNodes)
      .filter { node -> node.bounds.centerY() in safeTop..safeBottom }
      .sortedWith(compareBy<TextNode> { it.bounds.top }.thenBy { it.bounds.left })

    val candidates = mutableListOf<ShopeePartnerOfferCandidate>()
    val seenBuckets = mutableSetOf<String>()
    for (priceNode in priceNodes) {
      val candidate = buildShopeeAffiliateOfferGridCandidateFromPriceNode(
        visibleTextNodes = visibleTextNodes,
        imageNodes = visibleImageNodes,
        clickableNodes = clickableNodes,
        iconNodes = iconNodes,
        priceNode = priceNode,
        screen = screen,
        safeTop = safeTop,
        safeBottom = safeBottom,
        status = status
      ) ?: continue
      val bucket = shopeeAffiliateOfferGridCardBucket(candidate.tapBounds, priceNode.bounds, screen)
      if (seenBuckets.add(bucket)) {
        candidates += candidate
      }
    }
    return candidates
  }

internal fun KubdeeAccessibilityService.buildShopeeAffiliateOfferGridCandidateFromPriceNode(
    visibleTextNodes: List<TextNode>,
    imageNodes: List<ShopeeImageNode>,
    clickableNodes: List<Pair<Rect, AccessibilityNodeInfo>>,
    iconNodes: List<Pair<Rect, AccessibilityNodeInfo>>,
    priceNode: TextNode,
    screen: Rect,
    safeTop: Int,
    safeBottom: Int,
    status: String
  ): ShopeePartnerOfferCandidate? {
    val price = normalizePrice(priceNode.text) ?: return null
    val margin = maxOf(8, (screen.width() * 0.018f).toInt())
    val isLeftColumn = priceNode.bounds.centerX() < screen.centerX()
    val columnLeft = if (isLeftColumn) screen.left + margin else screen.centerX()
    val columnRight = if (isLeftColumn) screen.centerX() else screen.right - margin
    val columnWidth = columnRight - columnLeft
    if (columnWidth <= 0) return null

    val cardTop = (priceNode.bounds.top - (screen.height() * 0.36f).toInt()).coerceAtLeast(safeTop)
    val cardBottom = findShopeeAffiliateOfferGridCardBottom(
      priceBounds = priceNode.bounds,
      imageNodes = imageNodes,
      screen = screen,
      columnLeft = columnLeft,
      columnRight = columnRight,
      safeBottom = safeBottom
    )
    val cardTexts = visibleTextNodes.filter { node ->
      node.bounds.centerX() in columnLeft..columnRight &&
        node.bounds.centerY() in cardTop..cardBottom
    }
    val nameNode = findShopeeAffiliateOfferGridNameNode(
      cardTexts = cardTexts,
      priceBounds = priceNode.bounds,
      screen = screen
    ) ?: return null
    val name = cleanShopeePartnerProductName(nameNode.text).take(180)
    if (name.length < 5) return null

    val productUrl = cardTexts.firstNotNullOfOrNull { extractUrl(it.text) }
    val externalProductId = productUrl?.let { extractShopeeProductIdFromUrl(it) }
      ?: fallbackShopeeProductIdFromName(name)
    val stock = cardTexts.firstNotNullOfOrNull { extractStock(it.text) }
    val imageUrl = findShopeeAffiliateOfferImageUrl(
      imageNodes = imageNodes,
      nameBounds = nameNode.bounds,
      priceBounds = priceNode.bounds,
      screen = screen,
      columnLeft = columnLeft,
      columnRight = columnRight,
      cardTop = cardTop,
      cardBottom = cardBottom,
      safeTop = safeTop
    )

    val tapBounds = Rect(
      maxOf(nameNode.bounds.left, columnLeft),
      maxOf(nameNode.bounds.top, safeTop),
      minOf(nameNode.bounds.right, columnRight),
      minOf(maxOf(nameNode.bounds.bottom, nameNode.bounds.top + 48), priceNode.bounds.top - 8)
    )
    if (tapBounds.width() <= 0 || tapBounds.height() <= 0) return null

    val shareTarget = findShopeeAffiliateOfferGridFallbackShareBounds(
      cardTexts = cardTexts,
      clickableNodes = clickableNodes,
      iconNodes = iconNodes,
      priceBounds = priceNode.bounds,
      screen = screen,
      columnLeft = columnLeft,
      columnRight = columnRight,
      cardBottom = cardBottom,
      safeTop = safeTop,
      safeBottom = safeBottom
    )

    return ShopeePartnerOfferCandidate(
      product = ShopeeLikedProduct(
        name = name,
        price = price,
        stock = stock,
        productUrl = productUrl,
        externalProductId = externalProductId,
        imageUrl = imageUrl,
        status = status,
        scrapedAt = System.currentTimeMillis()
      ),
      tapBounds = tapBounds,
      safeTop = safeTop,
      shareBounds = shareTarget.first,
      shareSource = shareTarget.second
    )
  }

internal fun KubdeeAccessibilityService.findShopeeAffiliateOfferImageUrl(
    imageNodes: List<ShopeeImageNode>,
    nameBounds: Rect,
    priceBounds: Rect,
    screen: Rect,
    columnLeft: Int,
    columnRight: Int,
    cardTop: Int,
    cardBottom: Int,
    safeTop: Int
  ): String? {
    if (imageNodes.isEmpty()) return null
    val sameColumnImages = imageNodes.filter { image ->
      image.bounds.width() >= 32 &&
        image.bounds.height() >= 32 &&
        image.bounds.centerX() in columnLeft..columnRight &&
        image.bounds.centerY() in safeTop..cardBottom
    }
    if (sameColumnImages.isEmpty()) return null

    sameColumnImages
      .filter { image -> image.bounds.centerY() in cardTop..cardBottom }
      .maxByOrNull { image -> image.bounds.width() * image.bounds.height() }
      ?.imageUrl
      ?.let { return it }

    return sameColumnImages
      .filter { image ->
        image.bounds.bottom <= nameBounds.top + (screen.height() * 0.08f).toInt() &&
          image.bounds.bottom >= priceBounds.top - (screen.height() * 0.48f).toInt()
      }
      .maxByOrNull { image -> image.bounds.bottom }
      ?.imageUrl
  }

internal fun KubdeeAccessibilityService.findShopeeAffiliateOfferGridNameNode(
    cardTexts: List<TextNode>,
    priceBounds: Rect,
    screen: Rect
  ): TextNode? =
    cardTexts
      .mapNotNull { node ->
        val text = cleanShopeePartnerProductName(node.text)
        val gap = priceBounds.top - node.bounds.bottom
        if (
          gap < -24 ||
          gap > (screen.height() * 0.22f).toInt() ||
          node.bounds.top >= priceBounds.bottom ||
          !isShopeePartnerProductNameCandidate(text)
        ) {
          return@mapNotNull null
        }
        ShopeeLikedNameMatch(
          verticalGap = kotlin.math.abs(gap),
          negativeBottom = -node.bounds.bottom,
          left = node.bounds.left,
          top = node.bounds.top,
          name = text,
          node = node
        )
      }
      .sortedWith(
        compareBy<ShopeeLikedNameMatch> { it.verticalGap }
          .thenBy { it.negativeBottom }
          .thenBy { it.left }
          .thenBy { it.top }
      )
      .firstOrNull()
      ?.node

internal fun KubdeeAccessibilityService.findShopeeAffiliateOfferGridCardBottom(
    priceBounds: Rect,
    imageNodes: List<ShopeeImageNode>,
    screen: Rect,
    columnLeft: Int,
    columnRight: Int,
    safeBottom: Int
  ): Int {
    val nextImageTop = imageNodes
      .filter { image ->
        image.bounds.centerX() in columnLeft..columnRight &&
          image.bounds.top > priceBounds.bottom + (screen.height() * 0.08f).toInt()
      }
      .minOfOrNull { it.bounds.top - 8 }
    val estimatedBottom = priceBounds.bottom + (screen.height() * 0.19f).toInt()
    return listOfNotNull(nextImageTop, estimatedBottom, safeBottom).minOrNull()
      ?.coerceAtLeast(priceBounds.bottom + 48)
      ?.coerceAtMost(safeBottom)
      ?: safeBottom
  }

internal fun KubdeeAccessibilityService.findShopeeAffiliateOfferGridFallbackShareBounds(
    cardTexts: List<TextNode>,
    clickableNodes: List<Pair<Rect, AccessibilityNodeInfo>>,
    iconNodes: List<Pair<Rect, AccessibilityNodeInfo>>,
    priceBounds: Rect,
    screen: Rect,
    columnLeft: Int,
    columnRight: Int,
    cardBottom: Int,
    safeTop: Int,
    safeBottom: Int
  ): Pair<Rect, String> {
    val columnWidth = columnRight - columnLeft
    val commissionNode = findShopeeAffiliateOfferGridCommissionNode(
      cardTexts = cardTexts,
      priceBounds = priceBounds,
      screen = screen,
      columnLeft = columnLeft,
      columnRight = columnRight,
      cardBottom = cardBottom,
      safeTop = safeTop,
      safeBottom = safeBottom
    )
    if (commissionNode != null) {
      val shareIcon = findShopeeAffiliateOfferGridShareIconNearCommission(
        iconNodes = iconNodes,
        commissionNode = commissionNode,
        screen = screen,
        columnLeft = columnLeft,
        columnRight = columnRight,
        safeTop = safeTop,
        safeBottom = safeBottom
      )
      if (shareIcon != null) {
        return shareIcon to "ImageView ขวาแถวค่าคอม"
      }

      return estimateShopeeAffiliateOfferGridShareBoundsFromCommission(
        commissionNode = commissionNode,
        screen = screen,
        columnLeft = columnLeft,
        columnRight = columnRight,
        safeTop = safeTop,
        safeBottom = safeBottom
      ) to
        "fallback แถวค่าคอม"
    }

    val preferredX = columnRight - maxOf(34, (screen.width() * 0.045f).toInt())
    val preferredY = priceBounds.bottom + (screen.height() * 0.065f).toInt()
    val minY = maxOf(priceBounds.top - 12, safeTop)
    val maxY = maxOf(
      minY,
      minOf(cardBottom - 8, priceBounds.bottom + (screen.height() * 0.18f).toInt(), safeBottom)
    )
    val clickable = clickableNodes
      .filter { (bounds, node) ->
        node.isVisibleToUser &&
          node.packageName?.toString() == TARGET_PACKAGE_SHOPEE &&
          bounds.centerX() >= columnLeft + (columnWidth * 0.58f).toInt() &&
          bounds.centerX() <= columnRight + 8 &&
          bounds.centerY() in minY..maxY &&
          bounds.width() in 20..maxOf(120, (columnWidth * 0.42f).toInt()) &&
          bounds.height() in 20..maxOf(120, (screen.height() * 0.12f).toInt())
      }
      .minByOrNull { (bounds, _) ->
        val areaPenalty = kotlin.math.abs((bounds.width() * bounds.height()) - 3600) / 20
        kotlin.math.abs(bounds.centerX() - preferredX) +
          kotlin.math.abs(bounds.centerY() - preferredY) +
          areaPenalty
      }
      ?.first
    if (clickable != null) return Rect(clickable) to "fallback clickable ใกล้ราคา"

    val size = maxOf(48, minOf(72, (screen.width() * 0.055f).toInt()))
    val centerX = preferredX.coerceIn(columnLeft + size / 2, columnRight - size / 2)
    val centerY = preferredY.coerceIn(minY, maxY)
    return Rect(centerX - size / 2, centerY - size / 2, centerX + size / 2, centerY + size / 2) to
      "fallback พิกัดจากราคา"
  }

internal fun KubdeeAccessibilityService.findShopeeAffiliateOfferGridCommissionNode(
    cardTexts: List<TextNode>,
    priceBounds: Rect,
    screen: Rect,
    columnLeft: Int,
    columnRight: Int,
    cardBottom: Int,
    safeTop: Int,
    safeBottom: Int
  ): TextNode? =
    cardTexts
      .filter { node ->
        val compact = node.text.replace(Regex("""\s+"""), "").lowercase(Locale.ROOT)
        val looksLikeCommission = compact.contains("ค่าคอมมิชชั่น") ||
          compact.contains("คอมมิชชั่น") ||
          compact.contains("commission")
        looksLikeCommission &&
          node.bounds.centerX() in columnLeft..columnRight &&
          node.bounds.centerY() in safeTop..safeBottom &&
          node.bounds.top >= priceBounds.top - (screen.height() * 0.03f).toInt() &&
          node.bounds.bottom <= cardBottom + 8
      }
      .minByOrNull { node ->
        kotlin.math.abs(node.bounds.centerY() - (priceBounds.bottom + (screen.height() * 0.045f).toInt()))
      }

internal fun KubdeeAccessibilityService.findShopeeAffiliateOfferGridShareIconNearCommission(
    iconNodes: List<Pair<Rect, AccessibilityNodeInfo>>,
    commissionNode: TextNode,
    screen: Rect,
    columnLeft: Int,
    columnRight: Int,
    safeTop: Int,
    safeBottom: Int
  ): Rect? {
    val verticalTolerance = maxOf(18, (screen.height() * 0.018f).toInt())
    val maxIconSize = maxOf(72, (screen.width() * 0.14f).toInt())
    return iconNodes
      .map { (bounds, _) -> bounds }
      .filter { bounds ->
        bounds.width() in 18..maxIconSize &&
          bounds.height() in 18..maxIconSize &&
          bounds.centerX() in (commissionNode.bounds.right + 4)..(columnRight + 12) &&
          bounds.centerX() >= columnLeft &&
          bounds.centerY() in safeTop..safeBottom &&
          bounds.centerY() in (commissionNode.bounds.top - verticalTolerance)..(commissionNode.bounds.bottom + verticalTolerance)
      }
      .minByOrNull { bounds ->
        kotlin.math.abs(bounds.centerY() - commissionNode.bounds.centerY()) +
          kotlin.math.abs(bounds.left - commissionNode.bounds.right)
      }
      ?.let { Rect(it) }
  }

internal fun KubdeeAccessibilityService.estimateShopeeAffiliateOfferGridShareBoundsFromCommission(
    commissionNode: TextNode,
    screen: Rect,
    columnLeft: Int,
    columnRight: Int,
    safeTop: Int,
    safeBottom: Int
  ): Rect {
    val size = maxOf(48, minOf(72, (screen.width() * 0.055f).toInt()))
    val centerX = (commissionNode.bounds.right + maxOf(size / 2, (screen.width() * 0.06f).toInt()))
      .coerceIn(columnLeft + size / 2, columnRight - size / 2)
    val centerY = commissionNode.bounds.centerY()
      .coerceIn(safeTop + size / 2, safeBottom - size / 2)
    return Rect(centerX - size / 2, centerY - size / 2, centerX + size / 2, centerY + size / 2)
  }

internal fun KubdeeAccessibilityService.shopeeAffiliateOfferGridCardBucket(
    tapBounds: Rect,
    priceBounds: Rect,
    screen: Rect
  ): String {
    val column = if (priceBounds.centerX() < screen.centerX()) 0 else 1
    val yBucketSize = maxOf(170, screen.height() / 6)
    val midY = (tapBounds.centerY() + priceBounds.centerY()) / 2
    return "$column:${midY / yBucketSize}"
  }
internal fun KubdeeAccessibilityService.findShopeePartnerDetailTapBounds(
    nameNode: TextNode,
    shareButton: ShopeePartnerShareButton,
    screen: Rect,
    safeTop: Int
  ): Rect {
    val raw = Rect(nameNode.bounds)
    val left = maxOf(raw.left, screen.left + (screen.width() * 0.30f).toInt())
    val top = maxOf(raw.top, safeTop)
    val right = minOf(shareButton.bounds.left - 12, screen.right - (screen.width() * 0.04f).toInt())
    val bottom = minOf(
      maxOf(raw.bottom, raw.top + 48),
      shareButton.bounds.top - 8
    )
    val candidate = Rect(left, top, right, bottom)
    if (candidate.width() >= 80 && candidate.height() >= 28) {
      return candidate
    }

    return Rect(
      screen.left + (screen.width() * 0.36f).toInt(),
      top,
      screen.right - (screen.width() * 0.18f).toInt(),
      minOf(top + 56, shareButton.bounds.top - 8)
    )
  }
internal fun KubdeeAccessibilityService.isShopeePartnerProductNameCandidate(text: String): Boolean {
    val clean = cleanShopeePartnerProductName(text)
    if (!isProductNameCandidate(clean)) return false
    val compact = clean.replace(Regex("""\s+"""), "").lowercase(Locale.ROOT)
    val blocked = listOf(
      "ค่าคอมมิชชั่น",
      "คอมมิชชั่น",
      "ขายแล้ว",
      "ขายได้",
      "สินค้าคล้ายกัน",
      "เปลี่ยน",
      "เลือกแล้ว",
      "นำออก",
      "แชร์",
      "extracomm",
      "extra commission",
      "ร้านแนะนำ",
      "สินค้ารีวิวรับเงินคืนได้",
      "ค่าคอมพิเศษ",
      "ค่าเชิญจากผู้ขาย",
      "ค่าส่งจากผู้ขาย",
      "เรียงตาม",
      "ข้อเสนอ",
      "ไม่พร้อมโปรโมต"
    )
    return blocked.none { compact.contains(it.replace(Regex("""\s+"""), "").lowercase(Locale.ROOT)) }
  }
internal fun KubdeeAccessibilityService.cleanShopeePartnerProductName(text: String): String =
    cleanNodeText(text).replace(Regex("""^0(?=\p{L})"""), "").trim()
