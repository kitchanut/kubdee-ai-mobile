package ai.kubdee.mobile.automation

import android.content.ComponentName
import android.content.ContentUris
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.os.Handler
import android.os.Looper
import android.provider.MediaStore
import android.provider.Settings
import android.util.Base64
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.io.ByteArrayInputStream
import java.io.File
import java.io.FileOutputStream
import java.io.InputStream
import java.io.OutputStream
import java.util.Locale
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

class KubdeeAccessibilityModule(
  private val reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {
  init {
    eventContext = reactContext
  }

  override fun getName(): String = "KubdeeAccessibility"

  @ReactMethod
  fun getStatus(promise: Promise) {
    try {
      val component = ComponentName(reactContext, KubdeeAccessibilityService::class.java)
      val enabled = isAccessibilityServiceEnabled(reactContext, component)
      val map = Arguments.createMap().apply {
        putBoolean("available", true)
        putBoolean("enabled", enabled)
        putBoolean("running", KubdeeAccessibilityService.isRunning())
        putString("packageName", reactContext.packageName)
        putString("serviceComponent", component.flattenToString())
        putString("targetPackage", TARGET_PACKAGE_SHOPEE)
      }
      promise.resolve(map)
    } catch (error: Exception) {
      promise.reject("STATUS_FAILED", error.message, error)
    }
  }

  @ReactMethod
  fun openAccessibilitySettings(promise: Promise) {
    try {
      val component = ComponentName(reactContext, KubdeeAccessibilityService::class.java)

      // Android 11+: เปิดหน้า detail ของ service เราโดยตรง (มี toggle ในหน้านั้นเลย)
      // action นี้เป็น SystemApi เลยไม่มี constant ใน public SDK — ต้องใช้ string ตรงๆ
      // OEM บางเจ้า (เช่น Samsung) resolve ได้แต่ start แล้วโดน SecurityException — ต้อง catch แล้วตกไปหน้ารวมแทน
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
        val detailsIntent = Intent("android.settings.ACCESSIBILITY_DETAILS_SETTINGS").apply {
          putExtra(Intent.EXTRA_COMPONENT_NAME, component.flattenToString())
          addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        if (detailsIntent.resolveActivity(reactContext.packageManager) != null) {
          try {
            reactContext.startActivity(detailsIntent)
            promise.resolve(true)
            return
          } catch (_: SecurityException) {
            // ใช้ fallback ด้านล่าง
          }
        }
      }

      // Fallback: หน้ารวม Accessibility พร้อม fragment args ให้เลื่อน/ไฮไลต์ service ของเรา
      val componentString = component.flattenToString()
      val settingsIntent = Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS).apply {
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        putExtra(":settings:fragment_args_key", componentString)
        putExtra(
          ":settings:show_fragment_args",
          Bundle().apply { putString(":settings:fragment_args_key", componentString) }
        )
      }
      reactContext.startActivity(settingsIntent)
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("OPEN_SETTINGS_FAILED", error.message, error)
    }
  }

  @ReactMethod
  fun launchApp(packageName: String, promise: Promise) {
    try {
      if (!openPackageBlocking(packageName)) {
        promise.reject("APP_NOT_FOUND", "Package not found: $packageName")
        return
      }
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("LAUNCH_FAILED", error.message, error)
    }
  }

  @ReactMethod
  fun tap(x: Double, y: Double, promise: Promise) {
    val service = KubdeeAccessibilityService.getInstance()
    if (service == null) {
      promise.reject("ACCESSIBILITY_DISABLED", "Kubdee Accessibility service is not running")
      return
    }

    service.tap(x.toFloat(), y.toFloat()) { success ->
      if (success) {
        promise.resolve(true)
      } else {
        promise.reject("GESTURE_CANCELLED", "Tap gesture was cancelled")
      }
    }
  }

  @ReactMethod
  fun swipe(startX: Double, startY: Double, endX: Double, endY: Double, durationMs: Double, promise: Promise) {
    val service = KubdeeAccessibilityService.getInstance()
    if (service == null) {
      promise.reject("ACCESSIBILITY_DISABLED", "Kubdee Accessibility service is not running")
      return
    }

    service.swipe(startX.toFloat(), startY.toFloat(), endX.toFloat(), endY.toFloat(), durationMs.toLong()) { success ->
      if (success) {
        promise.resolve(true)
      } else {
        promise.reject("GESTURE_CANCELLED", "Swipe gesture was cancelled")
      }
    }
  }

  @ReactMethod
  fun clickByText(text: String, promise: Promise) {
    val service = KubdeeAccessibilityService.getInstance()
    if (service == null) {
      promise.reject("ACCESSIBILITY_DISABLED", "Kubdee Accessibility service is not running")
      return
    }

    promise.resolve(service.clickByText(text))
  }

  @ReactMethod
  fun inputText(text: String, promise: Promise) {
    val service = KubdeeAccessibilityService.getInstance()
    if (service == null) {
      promise.reject("ACCESSIBILITY_DISABLED", "Kubdee Accessibility service is not running")
      return
    }

    promise.resolve(service.inputText(text))
  }

  @ReactMethod
  fun pressImeEnter(promise: Promise) {
    val service = KubdeeAccessibilityService.getInstance()
    if (service == null) {
      promise.reject("ACCESSIBILITY_DISABLED", "Kubdee Accessibility service is not running")
      return
    }

    promise.resolve(service.pressImeEnter())
  }

  @ReactMethod
  fun runShopeeSearch(keyword: String, promise: Promise) {
    val service = KubdeeAccessibilityService.getInstance()
    if (service == null) {
      promise.reject("ACCESSIBILITY_DISABLED", "Kubdee Accessibility service is not running")
      return
    }

    promise.resolve(service.runShopeeSearch(TARGET_PACKAGE_SHOPEE, keyword))
  }

  @ReactMethod
  fun importShopeeLikedProducts(maxItems: Double, promise: Promise) {
    val service = KubdeeAccessibilityService.getInstance()
    if (service == null) {
      promise.reject("ACCESSIBILITY_DISABLED", "Kubdee Accessibility service is not running")
      return
    }

    if (!openPackageBlocking(TARGET_PACKAGE_SHOPEE)) {
      promise.reject("APP_NOT_FOUND", "Package not found: $TARGET_PACKAGE_SHOPEE")
      return
    }

    Thread {
      try {
        val products = service.importShopeeLikedProducts(
          TARGET_PACKAGE_SHOPEE,
          maxItems.toInt().coerceIn(1, 120)
        )
        val array = Arguments.createArray()
        products.forEach { product ->
          array.pushMap(Arguments.createMap().apply {
            putString("name", product.name)
            if (product.price != null) putString("price", product.price) else putNull("price")
            if (product.stock != null) putInt("stock", product.stock) else putNull("stock")
            if (product.productUrl != null) putString("productUrl", product.productUrl) else putNull("productUrl")
            if (product.externalProductId != null) {
              putString("externalProductId", product.externalProductId)
            } else {
              putNull("externalProductId")
            }
            if (product.imageUrl != null) putString("imageUrl", product.imageUrl) else putNull("imageUrl")
            putString("status", product.status)
            putDouble("scrapedAt", product.scrapedAt.toDouble())
          })
        }
        promise.resolve(array)
      } catch (error: Exception) {
        promise.reject("SHOPEE_IMPORT_FAILED", error.message, error)
      }
    }.also { thread ->
      thread.name = "KubdeeShopeeLikedImport"
      thread.start()
    }
  }

  @ReactMethod
  fun postShopeeVideos(payloadJson: String, promise: Promise) {
    val service = KubdeeAccessibilityService.getInstance()
    if (service == null) {
      promise.reject("ACCESSIBILITY_DISABLED", "Kubdee Accessibility service is not running")
      return
    }

    if (!openPackageBlocking(TARGET_PACKAGE_SHOPEE)) {
      promise.reject("APP_NOT_FOUND", "Package not found: $TARGET_PACKAGE_SHOPEE")
      return
    }

    Thread {
      try {
        val result = service.postShopeeVideos(payloadJson)
        promise.resolve(result.toString())
      } catch (error: Exception) {
        promise.reject("SHOPEE_POST_FAILED", error.message, error)
      }
    }.also { thread ->
      thread.name = "KubdeeShopeePosting"
      thread.start()
    }
  }

  @ReactMethod
  fun stopShopeeAutomation(promise: Promise) {
    val service = KubdeeAccessibilityService.getInstance()
    if (service == null) {
      promise.resolve(false)
      return
    }

    service.requestStopShopeeAutomation()
    promise.resolve(true)
  }

  @ReactMethod
  fun startGoogleFlowAutoPilot(payloadJson: String, promise: Promise) {
    val component = ComponentName(reactContext, KubdeeAccessibilityService::class.java)
    if (!isAccessibilityServiceEnabled(reactContext, component)) {
      promise.reject("ACCESSIBILITY_DISABLED", "Kubdee Accessibility service is not enabled")
      return
    }

    if (!openGoogleFlowInChromeBlocking()) {
      promise.reject("OPEN_FLOW_FAILED", "เปิด Google Flow ใน Chrome ไม่สำเร็จ")
      return
    }

    // Let the Chrome task win foreground before the app process broadcasts the payload. Without
    // this short handoff delay, Samsung/Chrome can bounce back to the Kubdee task during the
    // activity transition and the accessibility runner never sees Chrome as foreground.
    Handler(Looper.getMainLooper()).postDelayed({
      sendAutomationCommand(KubdeeAutomationCommandReceiver.ACTION_START_GOOGLE_FLOW) {
        putExtra(KubdeeAutomationCommandReceiver.EXTRA_PAYLOAD_JSON, payloadJson)
      }
      promise.resolve(true)
    }, 1200L)
  }

  @ReactMethod
  fun stopGoogleFlowAutoPilot(promise: Promise) {
    val component = ComponentName(reactContext, KubdeeAccessibilityService::class.java)
    if (!isAccessibilityServiceEnabled(reactContext, component)) {
      promise.resolve(false)
      return
    }

    sendAutomationCommand(KubdeeAutomationCommandReceiver.ACTION_STOP_GOOGLE_FLOW)
    promise.resolve(true)
  }

  @ReactMethod
  fun waitForGoogleFlowDownload(step: String, sinceMs: Double, timeoutMs: Double, promise: Promise) {
    Thread {
      try {
        val startedAt = System.currentTimeMillis()
        val timeout = timeoutMs.toLong().coerceIn(1_000L, 180_000L)
        var asset: GoogleFlowDownloadAsset? = null

        while (System.currentTimeMillis() - startedAt < timeout) {
          asset = findLatestGoogleFlowDownload(step, sinceMs.toLong())
          if (asset != null) {
            break
          }
          Thread.sleep(1_000L)
        }

        if (asset == null) {
          promise.resolve(null)
        } else {
          promise.resolve(Arguments.createMap().apply {
            putString("uri", asset.uri)
            putString("fileName", asset.fileName)
            putString("mimeType", asset.mimeType)
            putDouble("sizeBytes", asset.sizeBytes.toDouble())
            putDouble("createdAt", asset.createdAt.toDouble())
          })
        }
      } catch (error: Exception) {
        promise.reject("FLOW_DOWNLOAD_LOOKUP_FAILED", error.message, error)
      }
    }.also { thread ->
      thread.name = "KubdeeFlowDownloadLookup"
      thread.start()
    }
  }

  @ReactMethod
  fun saveGoogleFlowDataUrlAsset(step: String, dataUrl: String, fileName: String?, promise: Promise) {
    Thread {
      try {
        val asset = saveGoogleFlowDataUrl(step, dataUrl, fileName)
        if (asset == null) {
          promise.resolve(null)
        } else {
          promise.resolve(asset.toWritableMap())
        }
      } catch (error: Exception) {
        promise.reject("FLOW_DATA_URL_SAVE_FAILED", error.message, error)
      }
    }.also { thread ->
      thread.name = "KubdeeFlowDataUrlSave"
      thread.start()
    }
  }

  @ReactMethod
  fun addListener(eventName: String) {
    // Required by React Native NativeEventEmitter.
  }

  @ReactMethod
  fun removeListeners(count: Double) {
    // Required by React Native NativeEventEmitter.
  }

  @ReactMethod
  fun performBack(promise: Promise) {
    val service = KubdeeAccessibilityService.getInstance()
    if (service == null) {
      promise.reject("ACCESSIBILITY_DISABLED", "Kubdee Accessibility service is not running")
      return
    }

    promise.resolve(service.performBack())
  }

  private fun isAccessibilityServiceEnabled(context: Context, component: ComponentName): Boolean {
    val enabledSetting = Settings.Secure.getString(
      context.contentResolver,
      Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES
    ) ?: return false

    val expectedNames = setOf(
      component.flattenToString(),
      component.flattenToShortString()
    )

    return enabledSetting
      .split(':')
      .map { it.trim() }
      .filter { it.isNotEmpty() }
      .any { serviceName ->
        if (expectedNames.any { it.equals(serviceName, ignoreCase = true) }) {
          true
        } else {
          ComponentName.unflattenFromString(serviceName)?.let { enabledComponent ->
            enabledComponent.packageName.equals(component.packageName, ignoreCase = true) &&
              enabledComponent.className.equals(component.className, ignoreCase = true)
          } ?: false
        }
      }
  }

  private fun sendAutomationCommand(action: String, configure: Intent.() -> Unit = {}) {
    val intent = Intent(action).apply {
      component = ComponentName(reactContext, KubdeeAutomationCommandReceiver::class.java)
      setPackage(reactContext.packageName)
      configure()
    }
    reactContext.sendBroadcast(intent)
  }

  private fun moveAppTaskToBack() {
    reactContext.runOnUiQueueThread {
      reactContext.currentActivity?.moveTaskToBack(true)
    }
  }

  private fun openPackageBlocking(packageName: String): Boolean {
    if (Looper.myLooper() == Looper.getMainLooper()) {
      return openPackageOnUiThread(packageName)
    }

    var opened = false
    val latch = CountDownLatch(1)
    reactContext.runOnUiQueueThread {
      opened = openPackageOnUiThread(packageName)
      latch.countDown()
    }
    return latch.await(2_000L, TimeUnit.MILLISECONDS) && opened
  }

  private fun openPackageOnUiThread(packageName: String): Boolean {
    val launchIntent = reactContext.packageManager.getLaunchIntentForPackage(packageName) ?: return false
    val launcher = reactContext.currentActivity ?: reactContext
    return try {
      launcher.startActivity(
        launchIntent.apply {
          addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
          addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP)
          addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP)
        }
      )
      true
    } catch (_: Exception) {
      false
    }
  }

  private fun openGoogleFlowInChromeBlocking(): Boolean {
    if (Looper.myLooper() == Looper.getMainLooper()) {
      return openGoogleFlowInChromeOnUiThread()
    }

    var opened = false
    val latch = CountDownLatch(1)
    reactContext.runOnUiQueueThread {
      opened = openGoogleFlowInChromeOnUiThread()
      latch.countDown()
    }
    return latch.await(2_000L, TimeUnit.MILLISECONDS) && opened
  }

  private fun openGoogleFlowInChromeOnUiThread(): Boolean {
      val uri = Uri.parse(GOOGLE_FLOW_URL)
      val launcher = reactContext.currentActivity ?: reactContext
      // Try Chrome explicitly. Don't gate on resolveActivity(): under Android package-visibility
      // it can return null even when Chrome is installed, which would silently fall back to the
      // default browser (e.g. Samsung Internet). Just attempt the launch and catch failures.
      try {
        launcher.startActivity(
          Intent(Intent.ACTION_VIEW, uri).apply {
            setPackage(GOOGLE_FLOW_CHROME_PACKAGE)
            addCategory(Intent.CATEGORY_BROWSABLE)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
          }
        )
        return true
      } catch (_: Exception) {
      }
      // Fallback: let the system's default browser open it.
      try {
        launcher.startActivity(
          Intent(Intent.ACTION_VIEW, uri).apply {
            addCategory(Intent.CATEGORY_BROWSABLE)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
          }
        )
        return true
      } catch (_: Exception) {
      }
    return false
  }

  private fun findLatestGoogleFlowDownload(step: String, sinceMs: Long): GoogleFlowDownloadAsset? {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
      return null
    }

    val normalizedStep = step.lowercase(Locale.ROOT)
    val collection = MediaStore.Downloads.EXTERNAL_CONTENT_URI
    val projection = arrayOf(
      MediaStore.MediaColumns._ID,
      MediaStore.MediaColumns.DISPLAY_NAME,
      MediaStore.MediaColumns.MIME_TYPE,
      MediaStore.MediaColumns.SIZE,
      MediaStore.MediaColumns.DATE_ADDED
    )
    val sinceSeconds = ((sinceMs / 1000L) - 1L).coerceAtLeast(0L)
    val mimePrefix = if (normalizedStep == "video") "video/%" else "image/%"
    val primaryExt = if (normalizedStep == "video") "%.mp4" else "%.png"
    val fallbackExt = if (normalizedStep == "video") "%.webm" else "%.jpg"
    val altExt = if (normalizedStep == "video") "%.mov" else "%.jpeg"
    val selection =
      "${MediaStore.MediaColumns.DATE_ADDED} >= ? AND (" +
        "${MediaStore.MediaColumns.MIME_TYPE} LIKE ? OR " +
        "${MediaStore.MediaColumns.DISPLAY_NAME} LIKE ? OR " +
        "${MediaStore.MediaColumns.DISPLAY_NAME} LIKE ? OR " +
        "${MediaStore.MediaColumns.DISPLAY_NAME} LIKE ?)"
    val selectionArgs = arrayOf(
      sinceSeconds.toString(),
      mimePrefix,
      primaryExt,
      fallbackExt,
      altExt
    )
    val sortOrder = "${MediaStore.MediaColumns.DATE_ADDED} DESC"

    return reactContext.contentResolver.query(collection, projection, selection, selectionArgs, sortOrder)?.use { cursor ->
      while (cursor.moveToNext()) {
        val id = cursor.getLong(cursor.getColumnIndexOrThrow(MediaStore.MediaColumns._ID))
        val fileName = cursor.getString(cursor.getColumnIndexOrThrow(MediaStore.MediaColumns.DISPLAY_NAME)).orEmpty()
        val mimeType = cursor.getString(cursor.getColumnIndexOrThrow(MediaStore.MediaColumns.MIME_TYPE)).orEmpty()
        val sizeBytes = cursor.getLong(cursor.getColumnIndexOrThrow(MediaStore.MediaColumns.SIZE))
        val dateAdded = cursor.getLong(cursor.getColumnIndexOrThrow(MediaStore.MediaColumns.DATE_ADDED))
        if (sizeBytes <= 0L) {
          continue
        }
        return@use GoogleFlowDownloadAsset(
          uri = ContentUris.withAppendedId(collection, id).toString(),
          fileName = fileName,
          mimeType = mimeType.ifBlank { if (normalizedStep == "video") "video/mp4" else "image/png" },
          sizeBytes = sizeBytes,
          createdAt = dateAdded * 1000L
        )
      }
      null
    }
  }

  private fun saveGoogleFlowDataUrl(
    step: String,
    dataUrl: String,
    fileName: String?
  ): GoogleFlowDownloadAsset? {
    val commaIndex = dataUrl.indexOf(',')
    if (commaIndex <= 0) {
      throw IllegalArgumentException("data URL ไม่ถูกต้อง")
    }

    val header = dataUrl.substring(0, commaIndex)
    val payload = dataUrl.substring(commaIndex + 1)
    if (payload.isBlank()) {
      throw IllegalArgumentException("data URL ว่าง")
    }

    val mimeType = normalizeGoogleFlowAssetMimeType(
      step,
      header.substringAfter("data:", if (step == "video") "video/mp4" else "image/png").substringBefore(';')
    )
    val bytes = if (header.contains(";base64", ignoreCase = true)) {
      Base64.decode(payload, Base64.DEFAULT)
    } else {
      Uri.decode(payload).toByteArray(Charsets.UTF_8)
    }
    val displayName = normalizeGoogleFlowAssetFileName(step, fileName, mimeType)

    return ByteArrayInputStream(bytes).use { input ->
      saveGoogleFlowAssetStream(step, input, displayName, mimeType)
    }
  }

  private fun saveGoogleFlowAssetStream(
    step: String,
    input: InputStream,
    fileName: String,
    mimeType: String
  ): GoogleFlowDownloadAsset? {
    val createdAt = System.currentTimeMillis()
    var sizeBytes = 0L

    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      val values = ContentValues().apply {
        put(MediaStore.MediaColumns.DISPLAY_NAME, fileName)
        put(MediaStore.MediaColumns.MIME_TYPE, mimeType)
        put(MediaStore.MediaColumns.RELATIVE_PATH, "${Environment.DIRECTORY_DOWNLOADS}/Kubdee AI")
        put(MediaStore.MediaColumns.DATE_ADDED, createdAt / 1000L)
        put(MediaStore.MediaColumns.DATE_MODIFIED, createdAt / 1000L)
        put(MediaStore.MediaColumns.IS_PENDING, 1)
      }
      val collection = MediaStore.Downloads.EXTERNAL_CONTENT_URI
      val uri = reactContext.contentResolver.insert(collection, values) ?: return null
      try {
        reactContext.contentResolver.openOutputStream(uri)?.use { output ->
          sizeBytes = copyGoogleFlowAssetStream(input, output)
        } ?: return null
        val doneValues = ContentValues().apply {
          put(MediaStore.MediaColumns.SIZE, sizeBytes)
          put(MediaStore.MediaColumns.IS_PENDING, 0)
        }
        reactContext.contentResolver.update(uri, doneValues, null, null)
        GoogleFlowDownloadAsset(
          uri = uri.toString(),
          fileName = fileName,
          mimeType = mimeType,
          sizeBytes = sizeBytes,
          createdAt = createdAt
        )
      } catch (error: Exception) {
        reactContext.contentResolver.delete(uri, null, null)
        throw error
      }
    } else {
      val directory = File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), "Kubdee AI")
      if (!directory.exists() && !directory.mkdirs()) {
        return null
      }
      val target = File(directory, fileName)
      FileOutputStream(target).use { output ->
        sizeBytes = copyGoogleFlowAssetStream(input, output)
      }
      GoogleFlowDownloadAsset(
        uri = Uri.fromFile(target).toString(),
        fileName = fileName,
        mimeType = mimeType,
        sizeBytes = sizeBytes,
        createdAt = createdAt
      )
    }
  }

  private fun copyGoogleFlowAssetStream(input: InputStream, output: OutputStream): Long {
    val buffer = ByteArray(16 * 1024)
    var total = 0L
    while (true) {
      val read = input.read(buffer)
      if (read <= 0) break
      output.write(buffer, 0, read)
      total += read.toLong()
    }
    output.flush()
    return total
  }

  private fun normalizeGoogleFlowAssetMimeType(step: String, value: String?): String {
    val raw = value?.substringBefore(';')?.trim().orEmpty()
    if (raw.startsWith("video/", ignoreCase = true) || raw.startsWith("image/", ignoreCase = true)) {
      return raw.lowercase(Locale.ROOT)
    }
    return if (step.lowercase(Locale.ROOT) == "video") "video/mp4" else "image/png"
  }

  private fun normalizeGoogleFlowAssetFileName(step: String, value: String?, mimeType: String): String {
    val extension = extensionForGoogleFlowAssetMimeType(step, mimeType)
    val clean = value
      ?.substringAfterLast('/')
      ?.substringBefore('?')
      ?.trim()
      ?.replace(Regex("""[^a-zA-Z0-9ก-๙._-]+"""), "-")
      ?.trim('-', '.', '_')
      ?.take(80)
      .orEmpty()

    return if (clean.isNotBlank() && clean.contains('.')) {
      clean
    } else {
      val prefix = if (clean.isNotBlank()) clean.substringBeforeLast('.', clean) else "kubdee-flow-${step.lowercase(Locale.ROOT)}"
      "$prefix-${System.currentTimeMillis()}.$extension"
    }
  }

  private fun extensionForGoogleFlowAssetMimeType(step: String, mimeType: String): String =
    when (mimeType.lowercase(Locale.ROOT)) {
      "video/webm" -> "webm"
      "video/quicktime" -> "mov"
      "video/3gpp" -> "3gp"
      "image/jpeg", "image/jpg" -> "jpg"
      "image/webp" -> "webp"
      "image/gif" -> "gif"
      else -> if (step.lowercase(Locale.ROOT) == "video") "mp4" else "png"
    }

  companion object {
    const val TARGET_PACKAGE_SHOPEE = "com.shopee.th"
    private const val GOOGLE_FLOW_URL = "https://labs.google/fx/tools/flow"
    private const val GOOGLE_FLOW_CHROME_PACKAGE = "com.android.chrome"

    @Volatile
    private var eventContext: ReactApplicationContext? = null

    fun emitShopeeImportLog(message: String) {
      val context = eventContext ?: return
      val payload = Arguments.createMap().apply {
        putString("message", message)
        putDouble("ts", System.currentTimeMillis().toDouble())
      }
      context.runOnUiQueueThread {
        if (context.hasActiveReactInstance()) {
          context
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit("KubdeeShopeeImportLog", payload)
        }
      }
    }

    fun emitShopeePostLog(message: String) {
      val context = eventContext ?: return
      val payload = Arguments.createMap().apply {
        putString("message", message)
        putDouble("ts", System.currentTimeMillis().toDouble())
      }
      context.runOnUiQueueThread {
        if (context.hasActiveReactInstance()) {
          context
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit("KubdeeShopeePostLog", payload)
        }
      }
    }

    fun emitGoogleFlowLog(
      message: String,
      status: String? = null,
      event: String? = null,
      step: String? = null,
      stage: String? = null,
      productId: String? = null,
      productName: String? = null,
      currentRound: Int? = null,
      totalRounds: Int? = null,
      currentProduct: Int? = null,
      totalProducts: Int? = null,
      fileUri: String? = null,
      fileName: String? = null,
      mimeType: String? = null,
      sizeBytes: Long? = null,
      createdAt: Long? = null,
      runId: String? = null
    ) {
      val context = eventContext ?: return
      val payload = Arguments.createMap().apply {
        putString("message", message)
        putDouble("ts", System.currentTimeMillis().toDouble())
        if (runId != null) {
          putString("runId", runId)
        }
        if (status != null) {
          putString("status", status)
        }
        if (event != null) {
          putString("event", event)
        }
        if (step != null) {
          putString("step", step)
        }
        if (stage != null) {
          putString("stage", stage)
        }
        if (productId != null) {
          putString("productId", productId)
        }
        if (productName != null) {
          putString("productName", productName)
        }
        if (currentRound != null) {
          putInt("currentRound", currentRound)
        }
        if (totalRounds != null) {
          putInt("totalRounds", totalRounds)
        }
        if (currentProduct != null) {
          putInt("currentProduct", currentProduct)
        }
        if (totalProducts != null) {
          putInt("totalProducts", totalProducts)
        }
        if (fileUri != null) {
          putString("fileUri", fileUri)
        }
        if (fileName != null) {
          putString("fileName", fileName)
        }
        if (mimeType != null) {
          putString("mimeType", mimeType)
        }
        if (sizeBytes != null) {
          putDouble("sizeBytes", sizeBytes.toDouble())
        }
        if (createdAt != null) {
          putDouble("createdAt", createdAt.toDouble())
        }
      }
      context.runOnUiQueueThread {
        if (context.hasActiveReactInstance()) {
          context
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit("KubdeeGoogleFlowLog", payload)
        }
      }
    }
  }
}

private data class GoogleFlowDownloadAsset(
  val uri: String,
  val fileName: String,
  val mimeType: String,
  val sizeBytes: Long,
  val createdAt: Long
)

private fun GoogleFlowDownloadAsset.toWritableMap() =
  Arguments.createMap().apply {
    putString("uri", uri)
    putString("fileName", fileName)
    putString("mimeType", mimeType)
    putDouble("sizeBytes", sizeBytes.toDouble())
    putDouble("createdAt", createdAt.toDouble())
  }
