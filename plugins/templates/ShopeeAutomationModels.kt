package __PACKAGE_NAME__.automation

import android.graphics.Rect
import android.net.Uri
import android.view.accessibility.AccessibilityNodeInfo
import java.util.Locale

internal const val TAG = "KubdeeAccessibility"
internal const val AUTOMATION_NOTIFICATION_CHANNEL_ID = "kubdee_automation"
internal const val AUTOMATION_NOTIFICATION_ID = 2401
internal const val TARGET_PACKAGE_SHOPEE = "com.shopee.th"
// Shopee build the automation is verified against. Shown next to the device's installed version so
// a mismatch (Shopee changed its UI) is obvious. Bump when we test/support a newer Shopee build.
internal const val SHOPEE_TESTED_VERSION = "3.77.25"
internal const val COPY_SHOPEE_PRODUCT_URL_DURING_IMPORT = true
// ⚠️ ต้องเป็น UA เดสก์ท็อป — Shopee ตอบ s.shopee.co.th ต่างกันตาม User-Agent (วัดจริง 2026-07-15):
//   UA มือถือ  -> HTTP 200 ไม่มี Location เลย (หน้า JS ที่พยายาม deep link เข้าแอป) = ตามต่อไม่ได้
//   UA เดสก์ท็อป -> 30x ไปหน้าเว็บจริง shopee.co.th/<slug>/<shopId>/<itemId> = แกะไอดีได้
// เดสก์ท็อป (kubdee-ai-desktop/tiktok-bot/bridge.py:110) ใช้ UA นี้ จึง resolve ได้ 86% ส่วนมือถือ 0%
internal const val SHOPEE_WEB_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
internal const val SHOPEE_WEB_REFERER = "https://shopee.co.th/"
internal const val SHOPEE_IMPORT_SOURCE_LIKED = "liked"
internal const val SHOPEE_IMPORT_SOURCE_OFFERS = "offers"
// Liked import using the affiliate "partner" view — cards carry a share button whose share sheet
// offers an image download (like offers), so it works on devices where the buyer view exposes no
// image URL to accessibility.
internal const val SHOPEE_IMPORT_SOURCE_PARTNER_LIKED = "partner_liked"
internal const val SHOPEE_OFFER_CATEGORY_RECOMMENDED = "แนะนำ"

internal val SHOPEE_OFFER_CATEGORY_TEXTS = listOf(
  SHOPEE_OFFER_CATEGORY_RECOMMENDED,
  "เครื่องใช้ในบ้าน",
  "กีฬาและกิจกรรมกลางแจ้ง",
  "เสื้อผ้าแฟชั่นผู้ชาย",
  "อาหารและเครื่องดื่ม",
  "กลุ่มผลิตภัณฑ์เพื่อสุขภาพ"
)

internal fun normalizeShopeeImportSource(value: String?): String {
  val trimmed = value?.trim()
  return when {
    trimmed?.equals(SHOPEE_IMPORT_SOURCE_OFFERS, ignoreCase = true) == true -> SHOPEE_IMPORT_SOURCE_OFFERS
    trimmed?.equals(SHOPEE_IMPORT_SOURCE_PARTNER_LIKED, ignoreCase = true) == true -> SHOPEE_IMPORT_SOURCE_PARTNER_LIKED
    else -> SHOPEE_IMPORT_SOURCE_LIKED
  }
}

internal fun normalizeShopeeOfferCategory(value: String?): String =
  value?.trim()?.takeIf { it.isNotEmpty() } ?: SHOPEE_OFFER_CATEGORY_RECOMMENDED

internal val SHOPEE_LIKED_TEXTS = listOf(
  "สิ่งที่ฉันถูกใจ",
  "รายการถูกใจ",
  "สิ่งที่ถูกใจ",
  "ถูกใจ",
  "Liked",
  "Likes",
  "My Likes",
  "My liked items"
)

internal val SHOPEE_AFFILIATE_TEXTS = listOf(
  "โปรแกรม Affiliate",
  "Shopee Affiliate",
  "Affiliate Program",
  "Affiliate"
)

internal val SHOPEE_ACCOUNT_TEXTS = listOf("บัญชีผู้ใช้", "บัญชี", "Account")

internal val SHOPEE_LINK_CONVERTER_TEXTS = listOf(
  "แปลงลิงก์",
  "Convert link",
  "Link converter"
)

internal val SHOPEE_VIDEO_ACCOUNT_TEXTS = listOf(
  "หน้าบัญชี Shopee Video",
  "Shopee Video",
  "Video Account",
  "บัญชี Shopee Video"
)

internal val SHOPEE_VIDEO_COMPOSER_TEXTS = listOf(
  "โพสต์วิดีโอ",
  "โพสวิดีโอ",
  "Post Video",
  "Click to post video"
)

internal val SHOPEE_POSTING_SURFACE_TEXTS = listOf(
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

internal val SHOPEE_POSTING_SURFACE_RESOURCE_HINTS = listOf(
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

internal val SHOPEE_LEAVE_POST_CONFIRM_TEXTS = listOf(
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

internal val SHOPEE_RECOMMENDATION_TEXTS = listOf(
  "คุณอาจจะชอบ",
  "คณอาจจะชอบ",
  "ชอบสิ่งนี้",
  "you may also like",
  "you might also like",
  "recommended for you"
)

internal val SHOPEE_PRODUCT_DETAIL_MARKERS = listOf(
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

internal val PRICE_REGEX = Regex("""(?:฿|B)\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)""")
// ราคาบนหน้า detail ของ Shopee มีหลายก้อน — ราคาผ่อนต่อเดือน ราคาต่อชิ้นของเซ็ต ฯลฯ
// ก้อนพวกนี้ไม่ใช่ราคาสินค้าจริง ใช้ข้อความรอบๆ คัดออก
internal val SHOPEE_UNIT_PRICE_TEXT_REGEX = Regex("""ผ่อน|เดือน|/ชิ้น|ต่อชิ้น|x\s*\d+""", RegexOption.IGNORE_CASE)
// ระยะแนวตั้ง (px) ที่ถือว่าข้อความอย่าง "ผ่อน"/"x10 เดือน" เป็นป้ายกำกับของราคาก้อนนั้น
internal const val SHOPEE_UNIT_PRICE_LABEL_GAP_PX = 40
internal val PRICE_NUMBER_REGEX = Regex("""^[0-9][0-9,]*(?:\.[0-9]{1,2})?$""")
internal val STOCK_REGEX = Regex("""(?:ขายแล้ว|stock|สต็อก|คงเหลือ)\s*([0-9,]+)|([0-9,]+)\s*(?:ชิ้น|sold)""", RegexOption.IGNORE_CASE)
internal val URL_REGEX = Regex("""https?://[^\s]+""", RegexOption.IGNORE_CASE)

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
  val displayName: String,
  // ความยาวคลิป (วินาที) ไว้จับคู่กับ label เวลาใน gallery picker ของ Shopee — null เมื่ออ่าน metadata ไม่ได้
  val durationSeconds: Long? = null
)

internal data class TextNode(
  val text: String,
  val bounds: Rect,
  val node: AccessibilityNodeInfo
)

internal data class ShopeeImageNode(
  val imageUrl: String,
  val bounds: Rect
)

internal data class ShopeeBottomTabCandidate(
  val node: AccessibilityNodeInfo,
  val bounds: Rect,
  val label: String,
  val rank: Int
)

internal data class ShopeeMePageCheck(
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

internal data class ShopeeToggleTarget(
  val node: AccessibilityNodeInfo,
  val bounds: Rect,
  val resourceId: String
)

internal data class AutomationStatsSnapshot(
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

internal data class ShopeeLikedProductCandidate(
  val product: ShopeeLikedProduct,
  val tapBounds: Rect,
  val safeTop: Int
)

internal data class ShopeePartnerOfferCandidate(
  val product: ShopeeLikedProduct,
  val tapBounds: Rect,
  val safeTop: Int,
  val shareBounds: Rect,
  val shareSource: String = "resource id ปุ่มแชร์",
  val shareRetryTargets: List<ShopeeShareTapTarget> = emptyList()
)

internal data class ShopeeShareTapTarget(
  val bounds: Rect,
  val source: String
)

internal data class ShopeePartnerShareButton(
  val bounds: Rect,
  val iconBounds: Rect,
  val gridLike: Boolean
)

internal data class ShopeeLikedNameMatch(
  val verticalGap: Int,
  val negativeBottom: Int,
  val left: Int,
  val top: Int,
  val name: String,
  val node: TextNode
)

internal data class ShopeeLikedProductReadinessStats(
  val ready: Boolean,
  val nodes: Int,
  val prices: Int,
  val rawPrices: Int,
  val texts: Int,
  val safeTop: Int,
  val recommendation: Boolean
)

internal data class ShopeeCopyLinkTapPoint(
  val bounds: Rect,
  val priority: Int,
  val source: String
)

internal enum class ShopeeDetailScreenState {
  READY,
  LIST,
  LOADING,
  NO_PRODUCT
}

internal class ShopeeAutomationStoppedException : RuntimeException("Shopee automation stopped")

internal fun Double.formatOneDecimal(): String = String.format(Locale.ROOT, "%.1f", this)
