package ai.kubdee.mobile.automation

import android.content.ComponentName
import android.content.BroadcastReceiver
import android.content.ContentUris
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.os.Handler
import android.os.Looper
import android.provider.MediaStore
import android.provider.Settings
import android.util.Base64
import android.util.Log
import androidx.annotation.OptIn
import androidx.media3.common.MediaItem
import androidx.media3.common.util.UnstableApi
import androidx.media3.transformer.Composition
import androidx.media3.transformer.EditedMediaItem
import androidx.media3.transformer.EditedMediaItemSequence
import androidx.media3.transformer.ExportException
import androidx.media3.transformer.ExportResult
import androidx.media3.transformer.Transformer
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.google.common.collect.ImmutableList
import java.io.ByteArrayInputStream
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.io.InputStream
import java.io.OutputStream
import java.util.Locale
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit
import org.json.JSONArray

class KubdeeAccessibilityModule(
  private val reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {
  private val pendingShopeeImportPromises = ConcurrentHashMap<String, Promise>()
  private val moduleHandler = Handler(Looper.getMainLooper())
  private val automationEventReceiver = object : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
      handleAutomationEvent(intent)
    }
  }

  init {
    eventContext = reactContext
    registerAutomationEventReceiver()
  }

  override fun getName(): String = "KubdeeAccessibility"

  override fun invalidate() {
    try {
      reactContext.unregisterReceiver(automationEventReceiver)
    } catch (_: Exception) {
      // Receiver may already be unregistered during dev reload.
    }
    pendingShopeeImportPromises.forEach { (_, promise) ->
      promise.reject("MODULE_INVALIDATED", "Kubdee Accessibility module ถูกปิดก่อนงานจบ")
    }
    pendingShopeeImportPromises.clear()
    if (eventContext === reactContext) {
      eventContext = null
    }
    super.invalidate()
  }

  private fun registerAutomationEventReceiver() {
    val filter = IntentFilter().apply {
      addAction(KubdeeAutomationIpc.ACTION_EVENT_SHOPEE_IMPORT_LOG)
      addAction(KubdeeAutomationIpc.ACTION_EVENT_SHOPEE_IMPORT_PRODUCT)
      addAction(KubdeeAutomationIpc.ACTION_EVENT_SHOPEE_IMPORT_FINISHED)
      addAction(KubdeeAutomationIpc.ACTION_EVENT_SHOPEE_POST_LOG)
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      reactContext.registerReceiver(automationEventReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
    } else {
      @Suppress("DEPRECATION")
      reactContext.registerReceiver(automationEventReceiver, filter)
    }
  }

  private fun handleAutomationEvent(intent: Intent) {
    when (intent.action) {
      KubdeeAutomationIpc.ACTION_EVENT_SHOPEE_IMPORT_LOG -> {
        val message = intent.getStringExtra(KubdeeAutomationIpc.EXTRA_MESSAGE) ?: return
        emitEvent("KubdeeShopeeImportLog", Arguments.createMap().apply {
          putString("message", message)
          putDouble("ts", intent.getLongExtra(KubdeeAutomationIpc.EXTRA_TS, System.currentTimeMillis()).toDouble())
        })
      }

      KubdeeAutomationIpc.ACTION_EVENT_SHOPEE_IMPORT_PRODUCT -> {
        emitEvent("KubdeeShopeeImportProduct", shopeeProductIntentToWritableMap(intent))
      }

      KubdeeAutomationIpc.ACTION_EVENT_SHOPEE_IMPORT_FINISHED -> {
        handleShopeeImportFinished(intent)
      }

      KubdeeAutomationIpc.ACTION_EVENT_SHOPEE_POST_LOG -> {
        val message = intent.getStringExtra(KubdeeAutomationIpc.EXTRA_MESSAGE) ?: return
        emitEvent("KubdeeShopeePostLog", Arguments.createMap().apply {
          putString("message", message)
          putDouble("ts", intent.getLongExtra(KubdeeAutomationIpc.EXTRA_TS, System.currentTimeMillis()).toDouble())
        })
      }

    }
  }

  private fun handleShopeeImportFinished(intent: Intent) {
    val runId = intent.getStringExtra(KubdeeAutomationIpc.EXTRA_RUN_ID).orEmpty()
    val promise = pendingShopeeImportPromises.remove(runId) ?: return
    val error = intent.getStringExtra(KubdeeAutomationIpc.EXTRA_ERROR)
    if (!error.isNullOrBlank()) {
      promise.reject("SHOPEE_IMPORT_FAILED", error)
      return
    }

    promise.resolve(shopeeProductsJsonToWritableArray(intent.getStringExtra(KubdeeAutomationIpc.EXTRA_PRODUCTS_JSON).orEmpty()))
  }

  private fun shopeeProductIntentToWritableMap(intent: Intent) =
    Arguments.createMap().apply {
      putString("name", intent.getStringExtra(KubdeeAutomationIpc.EXTRA_PRODUCT_NAME).orEmpty())
      putNullableString(KubdeeAutomationIpc.EXTRA_PRODUCT_PRICE, intent.getStringExtra(KubdeeAutomationIpc.EXTRA_PRODUCT_PRICE))
      if (intent.hasExtra(KubdeeAutomationIpc.EXTRA_PRODUCT_STOCK)) {
        putInt("stock", intent.getIntExtra(KubdeeAutomationIpc.EXTRA_PRODUCT_STOCK, 0))
      } else {
        putNull("stock")
      }
      putNullableString(KubdeeAutomationIpc.EXTRA_PRODUCT_URL, intent.getStringExtra(KubdeeAutomationIpc.EXTRA_PRODUCT_URL))
      putNullableString(KubdeeAutomationIpc.EXTRA_PRODUCT_EXTERNAL_ID, intent.getStringExtra(KubdeeAutomationIpc.EXTRA_PRODUCT_EXTERNAL_ID))
      putNullableString(KubdeeAutomationIpc.EXTRA_PRODUCT_IMAGE_URL, intent.getStringExtra(KubdeeAutomationIpc.EXTRA_PRODUCT_IMAGE_URL))
      putString("status", intent.getStringExtra(KubdeeAutomationIpc.EXTRA_PRODUCT_STATUS) ?: "liked")
      putDouble("scrapedAt", intent.getLongExtra(KubdeeAutomationIpc.EXTRA_PRODUCT_SCRAPED_AT, System.currentTimeMillis()).toDouble())
      putNullableString(KubdeeAutomationIpc.EXTRA_PROFILE_LOCAL_ID, intent.getStringExtra(KubdeeAutomationIpc.EXTRA_PROFILE_LOCAL_ID))
      putDouble("ts", intent.getLongExtra(KubdeeAutomationIpc.EXTRA_TS, System.currentTimeMillis()).toDouble())
    }

  private fun shopeeProductsJsonToWritableArray(productsJson: String) =
    Arguments.createArray().apply {
      if (productsJson.isBlank()) return@apply
      val products = JSONArray(productsJson)
      for (index in 0 until products.length()) {
        val product = products.optJSONObject(index) ?: continue
        pushMap(Arguments.createMap().apply {
          putString("name", product.optString("name", ""))
          putNullableString("price", product.optStringOrNull("price"))
          if (product.has("stock") && !product.isNull("stock")) putInt("stock", product.optInt("stock")) else putNull("stock")
          putNullableString("productUrl", product.optStringOrNull("productUrl"))
          putNullableString("externalProductId", product.optStringOrNull("externalProductId"))
          putNullableString("imageUrl", product.optStringOrNull("imageUrl"))
          putString("status", product.optString("status", "liked"))
          putDouble("scrapedAt", product.optLong("scrapedAt", System.currentTimeMillis()).toDouble())
          putNullableString("profileLocalId", product.optStringOrNull("profileLocalId"))
          if (product.has("ts") && !product.isNull("ts")) {
            putDouble("ts", product.optLong("ts", System.currentTimeMillis()).toDouble())
          }
        })
      }
    }

  @ReactMethod
  fun getStatus(promise: Promise) {
    try {
      val component = ComponentName(reactContext, KubdeeAccessibilityService::class.java)
      val enabled = isAccessibilityServiceEnabled(reactContext, component)
      val map = Arguments.createMap().apply {
        putBoolean("available", true)
        putBoolean("enabled", enabled)
        putBoolean("running", enabled || KubdeeAccessibilityService.isRunning())
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
  fun importShopeeLikedProducts(maxItems: Double, profileLocalId: String?, promise: Promise) {
    val cleanProfileLocalId = profileLocalId?.trim()?.takeIf { it.isNotEmpty() }
    val component = ComponentName(reactContext, KubdeeAccessibilityService::class.java)
    if (!isAccessibilityServiceEnabled(reactContext, component)) {
      promise.reject("ACCESSIBILITY_DISABLED", "Kubdee Accessibility service is not enabled")
      return
    }

    val runId = "shopee-import-${System.currentTimeMillis()}-${UUID.randomUUID()}"
    pendingShopeeImportPromises[runId] = promise
    moduleHandler.postDelayed({
      pendingShopeeImportPromises.remove(runId)?.reject(
        "SHOPEE_IMPORT_TIMEOUT",
        "Shopee import ใช้เวลานานเกินไป"
      )
    }, 10 * 60 * 1000L)

    sendAutomationCommand(KubdeeAutomationIpc.ACTION_START_SHOPEE_IMPORT) {
      putExtra(KubdeeAutomationIpc.EXTRA_RUN_ID, runId)
      putExtra(KubdeeAutomationIpc.EXTRA_MAX_ITEMS, maxItems.toInt().coerceIn(1, 120))
      if (!cleanProfileLocalId.isNullOrBlank()) {
        putExtra(KubdeeAutomationIpc.EXTRA_PROFILE_LOCAL_ID, cleanProfileLocalId)
      }
    }
  }

  @ReactMethod
  fun getPendingShopeeImportProducts(promise: Promise) {
    try {
      val productsJson = KubdeeShopeeImportQueue.readProducts(reactContext).toString()
      promise.resolve(shopeeProductsJsonToWritableArray(productsJson))
    } catch (error: Exception) {
      promise.reject("SHOPEE_PENDING_PRODUCTS_FAILED", error.message, error)
    }
  }

  @ReactMethod
  fun clearPendingShopeeImportProducts(promise: Promise) {
    try {
      promise.resolve(KubdeeShopeeImportQueue.clear(reactContext))
    } catch (error: Exception) {
      promise.reject("SHOPEE_PENDING_PRODUCTS_CLEAR_FAILED", error.message, error)
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
    if (service != null) {
      service.requestStopShopeeAutomation()
      promise.resolve(true)
      return
    }

    val component = ComponentName(reactContext, KubdeeAccessibilityService::class.java)
    if (!isAccessibilityServiceEnabled(reactContext, component)) {
      promise.resolve(false)
      return
    }

    sendAutomationCommand(KubdeeAutomationIpc.ACTION_STOP_SHOPEE)
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
  fun mergeGoogleFlowVideos(videoUris: ReadableArray, voiceoverDataUrl: String?, promise: Promise) {
    Thread {
      try {
        val uris = mutableListOf<Uri>()
        for (index in 0 until videoUris.size()) {
          val value = videoUris.getString(index)?.trim().orEmpty()
          if (value.isNotBlank()) {
            uris.add(Uri.parse(value))
          }
        }
        if (uris.isEmpty()) {
          promise.reject("FLOW_VIDEO_MERGE_EMPTY", "ไม่มีวิดีโอฉากให้รวม")
          return@Thread
        }

        val audioFile = voiceoverDataUrl
          ?.takeIf { it.isNotBlank() }
          ?.let { saveDataUrlToCacheFile(it, "kubdee-flow-voiceover", "wav") }
        val outputFile = File(reactContext.cacheDir, "kubdee-flow-merged-${UUID.randomUUID()}.mp4")
        val exportError = exportGoogleFlowComposition(uris, audioFile?.let { Uri.fromFile(it) }, outputFile)
        if (exportError != null) {
          promise.reject("FLOW_VIDEO_MERGE_FAILED", exportError)
          return@Thread
        }

        val asset = FileInputStream(outputFile).use { input ->
          saveGoogleFlowAssetStream(
            "video",
            input,
            "kubdee-flow-merged-${System.currentTimeMillis()}.mp4",
            "video/mp4"
          )
        }
        try { outputFile.delete() } catch (_: Exception) {}
        try { audioFile?.delete() } catch (_: Exception) {}

        if (asset == null) {
          promise.resolve(null)
        } else {
          promise.resolve(asset.toWritableMap())
        }
      } catch (error: Exception) {
        promise.reject("FLOW_VIDEO_MERGE_FAILED", error.message, error)
      }
    }.also { thread ->
      thread.name = "KubdeeFlowVideoMerge"
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

  private fun saveDataUrlToCacheFile(dataUrl: String, prefix: String, fallbackExtension: String): File {
    val commaIndex = dataUrl.indexOf(',')
    if (commaIndex <= 0) {
      throw IllegalArgumentException("data URL เสียงไม่ถูกต้อง")
    }
    val header = dataUrl.substring(0, commaIndex)
    val payload = dataUrl.substring(commaIndex + 1)
    val mime = header.substringAfter("data:", "audio/wav").substringBefore(';').lowercase(Locale.ROOT)
    val extension = when {
      mime.contains("mpeg") || mime.contains("mp3") -> "mp3"
      mime.contains("aac") || mime.contains("mp4") -> "m4a"
      mime.contains("ogg") -> "ogg"
      else -> fallbackExtension
    }
    val bytes = if (header.contains(";base64", ignoreCase = true)) {
      Base64.decode(payload, Base64.DEFAULT)
    } else {
      Uri.decode(payload).toByteArray(Charsets.UTF_8)
    }
    val file = File(reactContext.cacheDir, "$prefix-${UUID.randomUUID()}.$extension")
    FileOutputStream(file).use { it.write(bytes) }
    return file
  }

  @OptIn(UnstableApi::class)
  private fun exportGoogleFlowComposition(videoUris: List<Uri>, audioUri: Uri?, outputFile: File): String? {
    var errorMessage: String? = null
    val latch = CountDownLatch(1)
    val videoItems = videoUris.map { uri ->
      EditedMediaItem.Builder(MediaItem.fromUri(uri)).build()
    }
    val videoSequence = EditedMediaItemSequence.withAudioAndVideoFrom(ImmutableList.copyOf(videoItems))
    val composition = if (audioUri != null) {
      val audioItem = EditedMediaItem.Builder(MediaItem.fromUri(audioUri)).build()
      val audioSequence = EditedMediaItemSequence.withAudioFrom(ImmutableList.of(audioItem))
        .buildUpon()
        .setIsLooping(false)
        .build()
      Composition.Builder(videoSequence, audioSequence).build()
    } else {
      Composition.Builder(videoSequence).build()
    }

    val transformer = Transformer.Builder(reactContext)
      .addListener(object : Transformer.Listener {
        override fun onCompleted(composition: Composition, result: ExportResult) {
          latch.countDown()
        }

        override fun onError(
          composition: Composition,
          result: ExportResult,
          exception: ExportException
        ) {
          errorMessage = exception.message ?: exception.errorCodeName
          latch.countDown()
        }
      })
      .build()

    transformer.start(composition, outputFile.absolutePath)
    val completed = latch.await(20, TimeUnit.MINUTES)
    if (!completed) {
      transformer.cancel()
      return "รวมวิดีโอใช้เวลานานเกินไป"
    }
    return errorMessage
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
    private const val TAG = "KubdeeAccessibilityModule"

    @Volatile
    private var eventContext: ReactApplicationContext? = null

    private fun emitEvent(eventName: String, payload: WritableMap) {
      val context = eventContext ?: return
      try {
        context.runOnUiQueueThread {
          try {
            if (context.hasActiveReactInstance()) {
              context
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit(eventName, payload)
            }
          } catch (error: Exception) {
            Log.w(TAG, "Unable to emit event: $eventName", error)
          }
        }
      } catch (error: Exception) {
        Log.w(TAG, "Unable to schedule event: $eventName", error)
      }
    }

    fun emitShopeeImportLog(message: String) {
      val payload = Arguments.createMap().apply {
        putString("message", message)
        putDouble("ts", System.currentTimeMillis().toDouble())
      }
      emitEvent("KubdeeShopeeImportLog", payload)
    }

    fun emitShopeeImportProduct(product: ShopeeLikedProduct) {
      val payload = product.toWritableMap().apply {
        putDouble("ts", System.currentTimeMillis().toDouble())
      }
      emitEvent("KubdeeShopeeImportProduct", payload)
    }

    fun emitShopeePostLog(message: String) {
      val payload = Arguments.createMap().apply {
        putString("message", message)
        putDouble("ts", System.currentTimeMillis().toDouble())
      }
      emitEvent("KubdeeShopeePostLog", payload)
    }

  }
}

private fun ShopeeLikedProduct.toWritableMap(profileLocalId: String? = null) =
  Arguments.createMap().apply {
    putString("name", name)
    if (price != null) putString("price", price) else putNull("price")
    if (stock != null) putInt("stock", stock) else putNull("stock")
    if (productUrl != null) putString("productUrl", productUrl) else putNull("productUrl")
    if (externalProductId != null) {
      putString("externalProductId", externalProductId)
    } else {
      putNull("externalProductId")
    }
    if (imageUrl != null) putString("imageUrl", imageUrl) else putNull("imageUrl")
    putString("status", status)
    putDouble("scrapedAt", scrapedAt.toDouble())
    if (!profileLocalId.isNullOrBlank()) putString("profileLocalId", profileLocalId) else putNull("profileLocalId")
  }

private fun WritableMap.putNullableString(key: String, value: String?) {
  if (value != null) putString(key, value) else putNull(key)
}

private fun org.json.JSONObject.optStringOrNull(key: String): String? {
  if (!has(key) || isNull(key)) return null
  return optString(key).takeIf { it.isNotBlank() }
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
