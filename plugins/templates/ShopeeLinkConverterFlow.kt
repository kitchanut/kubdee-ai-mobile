package __PACKAGE_NAME__.automation

import android.content.ClipData
import android.content.ClipboardManager
import android.graphics.Rect
import android.view.accessibility.AccessibilityNodeInfo
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject

// แปลงทีละ 1 ลิงก์เท่านั้น — ผลลัพธ์หลายแถวอ่านได้ไม่ครบ/เรียงคลาดเคลื่อนแล้วเสี่ยง
// จับคู่ short link ผิดสินค้า (ลิงก์ค่าคอมสลับตัวคืออันตรายกว่าช้า)
private const val SHOPEE_CONVERT_BATCH_SIZE = 1

// ผลลัพธ์ short link ต้องเป็นโดเมน s.shopee.* เท่านั้น (เช่น https://s.shopee.co.th/XXXX)
private val SHOPEE_SHORT_LINK_REGEX = Regex("""^https?://s\.shopee\.""", RegexOption.IGNORE_CASE)

// หน้ากรอกลิงก์ของตัวแปลงลิงก์ (input page) — ตรวจจาก label/placeholder ที่เห็นบนเครื่องจริง
internal val SHOPEE_LINK_CONVERTER_INPUT_MARKERS = listOf(
  "ลิงก์จาก Shopee",
  "กรอก 1 ลิงก์",
  "สูงสุด 5 ลิงก์",
  "เพิ่ม Sub id",
  "Sub id",
  "Link from Shopee"
)

// หน้าแสดงผลลัพธ์หลังกด แปลง — หัวข้อ "แปลงลิงก์สำเร็จแล้ว"
internal val SHOPEE_LINK_CONVERTER_RESULT_MARKERS = listOf(
  "แปลงลิงก์สำเร็จ",
  "Converted successfully",
  "Convert successful"
)

internal data class ShopeeConvertLinkInput(
  val localId: String,
  val url: String
)

internal fun parseShopeeConvertLinks(array: JSONArray): List<ShopeeConvertLinkInput> {
  val output = mutableListOf<ShopeeConvertLinkInput>()
  for (index in 0 until array.length()) {
    val item = array.optJSONObject(index) ?: continue
    val localId = item.optCleanString("localId") ?: continue
    val url = item.optCleanString("url") ?: continue
    output.add(ShopeeConvertLinkInput(localId = localId, url = url))
  }
  return output
}

internal fun KubdeeAccessibilityService.convertShopeeLinks(payloadJson: String): JSONObject {
  val results = JSONArray()
  var convertedCount = 0
  var processedCount = 0
  var firstFailureMessage: String? = null
  var links: List<ShopeeConvertLinkInput> = emptyList()

  return try {
    clearStopShopeeAutomation()
    resetAutomationLog()
    beginAutomationForeground("กำลังแปลงลิงก์ Shopee")

    val payload = JSONObject(payloadJson)
    links = parseShopeeConvertLinks(payload.optJSONArray("links") ?: JSONArray())
    configureAutomationStats("Shopee Convert", "LINK", links.size)

    if (links.isEmpty()) {
      return JSONObject().apply {
        put("success", false)
        put("error", "ไม่มีลิงก์สำหรับแปลงเป็น short link")
        put("convertedCount", 0)
        put("results", results)
      }
    }

    logStep("เริ่มแปลงลิงก์ Shopee ${links.size} รายการ")

    if (!launchPackage(TARGET_PACKAGE_SHOPEE, resetTask = true)) {
      logStep("เปิด Shopee จาก service ไม่สำเร็จ จะรอหน้าที่เปิดจากแอป")
    }
    if (!waitForPackageActive(TARGET_PACKAGE_SHOPEE, 12_000L)) {
      throw IllegalStateException("ยังไม่เห็นหน้าต่าง Shopee หลังเปิดแอป")
    }
    sleepStep(2500L)
    prepareShopeeNavigationSurface()

    if (!navigateShopeeLinkConverter()) {
      throw IllegalStateException("ไม่พบหน้า แปลงลิงก์ ใน Shopee")
    }

    val batches = links.chunked(SHOPEE_CONVERT_BATCH_SIZE)
    for ((batchIndex, batch) in batches.withIndex()) {
      checkStopRequested()

      if (batchIndex > 0 && !returnToShopeeLinkConverterInput()) {
        throw IllegalStateException("กลับหน้ากรอกลิงก์ไม่สำเร็จ (ลิงก์ที่ ${batchIndex + 1})")
      }

      logStep("── ลิงก์ที่ ${batchIndex + 1}/${batches.size} ──")
      val shortLinks = try {
        convertShopeeLinkBatch(batch)
      } catch (error: ShopeeAutomationStoppedException) {
        throw error
      } catch (error: Exception) {
        val message = error.message ?: "แปลงลิงก์ชุดที่ ${batchIndex + 1} ไม่สำเร็จ"
        logStep("ชุดที่ ${batchIndex + 1} ล้มเหลว: $message")
        if (firstFailureMessage == null) {
          firstFailureMessage = "ชุดที่ ${batchIndex + 1}: $message"
        }
        List(batch.size) { null }
      }

      for ((linkIndex, link) in batch.withIndex()) {
        processedCount += 1
        val shortUrl = shortLinks.getOrNull(linkIndex)
        if (shortUrl != null) {
          convertedCount += 1
          // เก็บผลลง disk ทันทีทีละลิงก์ — ถ้าแอปหลักโดน Android ฆ่าระหว่างรัน
          // ฝั่ง JS มาเก็บผลค้างตอนเปิดแอปใหม่ได้ ไม่เสียผลที่แปลงแล้ว
          KubdeeShopeeConvertResults.appendResult(this, link.localId, link.url, shortUrl)
          results.put(JSONObject().apply {
            put("localId", link.localId)
            put("url", link.url)
            put("shortUrl", shortUrl)
          })
        } else {
          incrementAutomationFailedCount()
          if (firstFailureMessage == null) {
            firstFailureMessage = "ลิงก์ที่ $processedCount: ไม่พบ short link ในผลลัพธ์"
          }
          results.put(JSONObject().apply {
            put("localId", link.localId)
            put("url", link.url)
            put("error", "ไม่พบ short link ในผลลัพธ์")
          })
        }
      }

      updateAutomationStats(currentCount = processedCount, successCount = convertedCount)
      logStep("แปลงแล้ว $convertedCount/${links.size}")
    }

    logStep("แปลงลิงก์ Shopee เสร็จ $convertedCount/${links.size} รายการ")
    JSONObject().apply {
      put("success", convertedCount > 0)
      put("convertedCount", convertedCount)
      if (convertedCount == 0) {
        put("error", firstFailureMessage ?: "แปลงลิงก์ Shopee ไม่สำเร็จ")
      }
      put("results", results)
    }
  } catch (error: ShopeeAutomationStoppedException) {
    logStep("หยุดแปลงลิงก์ Shopee แล้ว ($convertedCount/${links.size})")
    JSONObject().apply {
      put("success", convertedCount > 0)
      put("convertedCount", convertedCount)
      put("results", results)
      put("stopped", true)
    }
  } catch (error: Exception) {
    val message = error.message ?: "แปลงลิงก์ Shopee ผิดพลาด"
    Log.e(TAG, "Shopee link converter failed", error)
    logStep("แปลงลิงก์ Shopee ผิดพลาด: $message")
    JSONObject().apply {
      put("success", false)
      put("error", message)
      put("convertedCount", convertedCount)
      put("results", results)
    }
  } finally {
    // ถอยออกจากหน้าแปลงลิงก์ก่อนกลับแอป — ถ้าทิ้ง Shopee ค้างหน้านี้ไว้
    // automation รอบถัดไป (ทั้ง mobile และ desktop) จะเปิดมาเจอหน้าที่ไม่มีแท็บ ฉัน
    leaveShopeeLinkConverterSurface()
    endAutomationForeground()
    hideAutomationOverlay(2500L)
  }
}

// กด back ออกจากหน้ากรอก/หน้าผลลัพธ์ของตัวแปลงลิงก์ จนพ้นหน้าตัวแปลง (best effort)
internal fun KubdeeAccessibilityService.leaveShopeeLinkConverterSurface() {
  try {
    repeat(3) {
      if (!isShopeeLinkConverterInputScreen() && !isShopeeLinkConverterResultScreen()) {
        return
      }
      performBack()
      Thread.sleep(900L)
    }
  } catch (_: Exception) {
    // cleanup เท่านั้น — พังก็ไม่กระทบผลลัพธ์ที่แปลงเสร็จแล้ว
  }
}

// ไปหน้า แปลงลิงก์: ฉัน → โปรแกรม Affiliate → บัญชีผู้ใช้ → เมนู แปลงลิงก์
// (เส้นทางเดียวกับ navigateShopeeVideoAccount แต่จบที่เมนู แปลงลิงก์ แทน Shopee Video)
internal fun KubdeeAccessibilityService.navigateShopeeLinkConverter(): Boolean {
  if (!goToShopeeMeTab()) {
    logStep("ไม่พบเมนู ฉัน")
    return false
  }
  sleepStep(1200L)

  logStep("เปิด โปรแกรม Affiliate")
  if (!scrollUntilTapText(SHOPEE_AFFILIATE_TEXTS, maxAttempts = 8)) {
    logStep("ไม่พบเมนู โปรแกรม Affiliate")
    return false
  }
  sleepStep(4000L)

  logStep("ไปที่ บัญชีผู้ใช้")
  if (!tapShopeeAffiliateAccountTab()) {
    logStep("ไม่พบเมนู บัญชีผู้ใช้")
    return false
  }
  sleepStep(2500L)

  logStep("เปิดเมนู แปลงลิงก์")
  if (!scrollUntilTapText(SHOPEE_LINK_CONVERTER_TEXTS, maxAttempts = 5)) {
    logStep("ไม่พบเมนู แปลงลิงก์")
    return false
  }
  sleepStep(3000L)

  if (!waitForShopeeLinkConverterInputScreen(maxAttempts = 8, delayMs = 800L)) {
    logStep("ยังไม่เห็นหน้ากรอกลิงก์ของตัวแปลงลิงก์")
    return false
  }
  return true
}

internal fun KubdeeAccessibilityService.convertShopeeLinkBatch(
  batch: List<ShopeeConvertLinkInput>
): List<String?> {
  val joinedLinks = batch.joinToString("\n") { it.url }

  logStep("กรอกลิงก์ ${batch.size} รายการลงช่องแปลง")
  if (!fillShopeeLinkConverterInput(joinedLinks, batch.first().url)) {
    throw IllegalStateException("กรอกลิงก์ลงช่องแปลงไม่สำเร็จ")
  }

  sleepStep(1200L)
  checkStopRequested()
  if (!tapShopeeLinkConverterConvertButton()) {
    throw IllegalStateException("ไม่พบปุ่ม แปลง")
  }

  logStep("รอผลลัพธ์ short link...")
  val shortLinks = waitForShopeeLinkConverterResults(batch.size)
  if (shortLinks.isEmpty()) {
    throw IllegalStateException("ไม่พบ short link หลังกดแปลง")
  }

  logStep("อ่านผลลัพธ์ได้ ${shortLinks.size}/${batch.size} ลิงก์")
  // หน้า result เรียงผลลัพธ์เป็นแถวตามลำดับลิงก์ที่กรอก — จับคู่ตามลำดับ
  return batch.indices.map { index -> shortLinks.getOrNull(index) }
}

internal fun KubdeeAccessibilityService.isShopeeLinkConverterResultScreen(): Boolean {
  for (root in shopeeWindowRoots()) {
    val textNodes = mutableListOf<TextNode>()
    collectTextNodes(root, textNodes, allowedPackageName = TARGET_PACKAGE_SHOPEE)
    if (
      textNodes.any { node ->
        SHOPEE_LINK_CONVERTER_RESULT_MARKERS.any { marker -> node.text.contains(marker, ignoreCase = true) }
      }
    ) {
      return true
    }
  }
  return false
}

internal fun KubdeeAccessibilityService.isShopeeLinkConverterInputScreen(): Boolean {
  var hasInputMarker = false
  var hasResultMarker = false
  for (root in shopeeWindowRoots()) {
    val textNodes = mutableListOf<TextNode>()
    collectTextNodes(root, textNodes, allowedPackageName = TARGET_PACKAGE_SHOPEE)
    for (node in textNodes) {
      if (SHOPEE_LINK_CONVERTER_INPUT_MARKERS.any { node.text.contains(it, ignoreCase = true) }) {
        hasInputMarker = true
      }
      if (SHOPEE_LINK_CONVERTER_RESULT_MARKERS.any { node.text.contains(it, ignoreCase = true) }) {
        hasResultMarker = true
      }
    }
  }
  return hasInputMarker && !hasResultMarker
}

internal fun KubdeeAccessibilityService.waitForShopeeLinkConverterInputScreen(
  maxAttempts: Int = 6,
  delayMs: Long = 800L
): Boolean {
  repeat(maxAttempts) { index ->
    if (isShopeeLinkConverterInputScreen()) return true
    sleepStep(if (index == 0) 400L else delayMs)
  }
  return isShopeeLinkConverterInputScreen()
}

// ช่องกรอกเป็น textarea เดียวรับหลายบรรทัด — เลือก editable ที่สูง/กว้างสุดกันชนช่อง Sub id
internal fun KubdeeAccessibilityService.findShopeeLinkConverterEditableNode(): AccessibilityNodeInfo? {
  val candidates = mutableListOf<Pair<Rect, AccessibilityNodeInfo>>()
  for (root in shopeeWindowRoots()) {
    collectEditableNodes(root, TARGET_PACKAGE_SHOPEE, candidates)
  }
  return candidates
    .filter { (bounds, node) -> node.isVisibleToUser && bounds.width() > 0 && bounds.height() > 0 }
    .maxWithOrNull(
      compareBy<Pair<Rect, AccessibilityNodeInfo>> { (bounds, _) -> bounds.height() }
        .thenBy { (bounds, _) -> bounds.width() }
    )
    ?.second
}

internal fun KubdeeAccessibilityService.shopeeLinkConverterInputContains(needle: String): Boolean {
  for (root in shopeeWindowRoots()) {
    val textNodes = mutableListOf<TextNode>()
    collectTextNodes(root, textNodes, allowedPackageName = TARGET_PACKAGE_SHOPEE)
    if (textNodes.any { node -> node.text.contains(needle, ignoreCase = true) }) {
      return true
    }
  }
  return false
}

// ใส่ลิงก์ทั้งชุดในครั้งเดียว: ACTION_SET_TEXT แทนที่ข้อความเดิมทั้งหมด
// ห้ามกด IME enter — textarea รับ \n จากข้อความที่ set โดยตรง
internal fun KubdeeAccessibilityService.fillShopeeLinkConverterInput(
  joinedLinks: String,
  firstLink: String
): Boolean {
  repeat(4) { attemptIndex ->
    checkStopRequested()
    val edit = findShopeeLinkConverterEditableNode()
    if (edit == null) {
      logStep("ยังไม่พบช่องกรอกลิงก์ (ครั้ง ${attemptIndex + 1}/4)")
      sleepStep(900L)
      return@repeat
    }

    clickNode(edit)
    sleepStep(350L)
    val setOk = setNodeText(edit, joinedLinks)
    sleepStep(600L)
    if (setOk && shopeeLinkConverterInputContains(firstLink)) {
      return true
    }
    logStep("setText=${if (setOk) "ok" else "fail"} ยังยืนยันลิงก์ในช่องไม่ได้ ลอง clipboard")

    // fallback: ลบข้อความเดิม (ปุ่ม ลบทั้งหมด โผล่เมื่อมีข้อความ) แล้ววางจากคลิปบอร์ด
    clickByAnyText(listOf("ลบทั้งหมด", "Clear all"), exact = false, allowedPackageName = TARGET_PACKAGE_SHOPEE)
    sleepStep(500L)
    val pasteTarget = findShopeeLinkConverterEditableNode() ?: edit
    if (pasteShopeeConverterLinksInto(pasteTarget, joinedLinks)) {
      sleepStep(600L)
      if (shopeeLinkConverterInputContains(firstLink)) {
        return true
      }
    }
    sleepStep(700L)
  }
  return false
}

internal fun KubdeeAccessibilityService.pasteShopeeConverterLinksInto(
  edit: AccessibilityNodeInfo,
  joinedLinks: String
): Boolean {
  val clipboard = getSystemService(ClipboardManager::class.java) ?: return false
  return try {
    clipboard.setPrimaryClip(ClipData.newPlainText("kubdee-shopee-convert-links", joinedLinks))
    clickNode(edit)
    sleepStep(180L)
    edit.performAction(AccessibilityNodeInfo.ACTION_PASTE)
  } catch (_: Exception) {
    false
  }
}

// ปุ่ม แปลง สีส้มอยู่ล่างสุดของหน้ากรอก — จับ text ตรงตัว "แปลง" เท่านั้น
// (ห้าม contains เพราะจะชนหัวข้อ "แปลงลิงก์" ด้านบน)
internal fun KubdeeAccessibilityService.tapShopeeLinkConverterConvertButton(): Boolean {
  for (root in shopeeWindowRoots()) {
    val screen = screenBounds(root)
    val textNodes = mutableListOf<TextNode>()
    collectTextNodes(root, textNodes, allowedPackageName = TARGET_PACKAGE_SHOPEE)
    val target = textNodes
      .filter { node ->
        val compact = cleanNodeText(node.text).replace(" ", "")
        (compact.equals("แปลง", ignoreCase = true) || compact.equals("Convert", ignoreCase = true)) &&
          node.bounds.centerY() >= screen.top + (screen.height() * 0.5f).toInt()
      }
      .sortedWith(
        compareByDescending<TextNode> { it.bounds.bottom }
          .thenByDescending { if (findClickableNode(it.node) != null) 1 else 0 }
      )
      .firstOrNull()
      ?: continue

    if (clickNode(target.node)) {
      logStep("กดปุ่ม แปลง ที่ ${target.bounds.centerX()},${target.bounds.centerY()}")
      return true
    }
    if (tapBlocking(target.bounds.centerX().toFloat(), target.bounds.centerY().toFloat(), durationMs = 90L)) {
      logStep("แตะปุ่ม แปลง ที่ ${target.bounds.centerX()},${target.bounds.centerY()}")
      return true
    }
  }
  return false
}

// อ่าน short link จากหน้า result: แถว "1. https://s.shopee.co.th/XXXX?lp=aff" เรียงบน-ล่าง
internal fun KubdeeAccessibilityService.collectShopeeConvertedShortLinks(): List<String> {
  val found = mutableListOf<Pair<Rect, String>>()
  val seen = mutableSetOf<String>()
  for (root in shopeeWindowRoots()) {
    val textNodes = mutableListOf<TextNode>()
    collectTextNodes(root, textNodes, allowedPackageName = TARGET_PACKAGE_SHOPEE)
    for (node in textNodes) {
      for (match in URL_REGEX.findAll(node.text)) {
        val url = match.value.trim().trimEnd(',', ')', ']', '"', '\'')
        if (!SHOPEE_SHORT_LINK_REGEX.containsMatchIn(url)) continue
        if (!seen.add(url)) continue
        found += Rect(node.bounds) to url
      }
    }
  }
  return found
    .sortedWith(compareBy({ it.first.top }, { it.first.left }))
    .map { it.second }
}

// รอหน้า result (หัวข้อ แปลงลิงก์สำเร็จแล้ว) แล้วเก็บ short link ให้ครบตามจำนวนที่กรอก
// เก็บเฉพาะตอนเห็นหน้า result เท่านั้น กันเก็บลิงก์ตัวอย่างจากหน้า input
internal fun KubdeeAccessibilityService.waitForShopeeLinkConverterResults(
  expectedCount: Int,
  timeoutMs: Long = 20_000L
): List<String> {
  val startedAt = System.currentTimeMillis()
  while (System.currentTimeMillis() - startedAt < timeoutMs) {
    checkStopRequested()
    if (isShopeeLinkConverterResultScreen()) {
      val links = collectShopeeConvertedShortLinks()
      if (links.size >= expectedCount) {
        return links
      }
      if (links.isNotEmpty()) {
        // เห็นผลบางส่วนแล้ว รอให้แถวโหลดครบก่อนหนึ่งจังหวะ
        sleepStep(900L)
        val settled = collectShopeeConvertedShortLinks()
        if (settled.size >= expectedCount || settled.size == links.size) {
          return settled
        }
      }
    }
    sleepStep(800L)
  }
  return if (isShopeeLinkConverterResultScreen()) collectShopeeConvertedShortLinks() else emptyList()
}

// กลับจากหน้า result ไปหน้ากรอกลิงก์เพื่อแปลงลิงก์ถัดไป
// back จากหน้าผลลัพธ์มักหลุดออกจากตัวแปลงไปหน้าเมนู บัญชีผู้ใช้ เลย
// จึงต้องกดเมนู แปลงลิงก์ เข้าใหม่ ไม่ใช่กด back รอหน้ากรอกอย่างเดียว
internal fun KubdeeAccessibilityService.returnToShopeeLinkConverterInput(): Boolean {
  repeat(5) { attemptIndex ->
    checkStopRequested()
    if (isShopeeLinkConverterInputScreen()) {
      return true
    }

    if (isShopeeLinkConverterResultScreen()) {
      // ยังอยู่หน้าผลลัพธ์ — ห้ามหาเมนูจากหน้านี้ เพราะหัวข้อหน้าก็มีคำว่า "แปลงลิงก์"
      logStep("ออกจากหน้าผลลัพธ์ (ครั้ง ${attemptIndex + 1}/5)")
      performBack()
      sleepStep(1500L)
    } else if (scrollUntilTapText(SHOPEE_LINK_CONVERTER_TEXTS, maxAttempts = 3)) {
      logStep("เปิดเมนู แปลงลิงก์ อีกรอบ")
      sleepStep(2500L)
      if (waitForShopeeLinkConverterInputScreen(maxAttempts = 5, delayMs = 700L)) {
        return true
      }
    } else {
      logStep("ยังไม่พบเมนู แปลงลิงก์ ลองย้อนกลับ (ครั้ง ${attemptIndex + 1}/5)")
      performBack()
      sleepStep(1400L)
    }
  }
  return isShopeeLinkConverterInputScreen()
}
