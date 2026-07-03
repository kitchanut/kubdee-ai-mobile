package __PACKAGE_NAME__.automation

import android.content.ComponentName
import android.content.BroadcastReceiver
import android.content.ContentUris
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.graphics.Bitmap
import android.net.Uri
import android.media.MediaMetadataRetriever
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
import java.security.MessageDigest
import java.util.Locale
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference
import org.json.JSONArray
import org.json.JSONObject

class KubdeeAccessibilityModule(
  internal val reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {
  private val pendingShopeeImportPromises = ConcurrentHashMap<String, Promise>()
  private val pendingShopeePostPromises = ConcurrentHashMap<String, Promise>()
  internal val moduleHandler = Handler(Looper.getMainLooper())
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
    pendingShopeePostPromises.forEach { (_, promise) ->
      promise.reject("MODULE_INVALIDATED", "Kubdee Accessibility module ถูกปิดก่อนงานจบ")
    }
    pendingShopeePostPromises.clear()
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
      addAction(KubdeeAutomationIpc.ACTION_EVENT_SHOPEE_POST_FINISHED)
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

      KubdeeAutomationIpc.ACTION_EVENT_SHOPEE_POST_FINISHED -> {
        handleShopeePostFinished(intent)
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

  private fun handleShopeePostFinished(intent: Intent) {
    val runId = intent.getStringExtra(KubdeeAutomationIpc.EXTRA_RUN_ID).orEmpty()
    val promise = pendingShopeePostPromises.remove(runId) ?: return
    val resultJson = intent.getStringExtra(KubdeeAutomationIpc.EXTRA_RESULT_JSON).orEmpty()
    val error = intent.getStringExtra(KubdeeAutomationIpc.EXTRA_ERROR)
    if (!error.isNullOrBlank() && resultJson.isBlank()) {
      promise.reject("SHOPEE_POST_FAILED", error)
      return
    }

    promise.resolve(
      resultJson.ifBlank {
        JSONObject()
          .put("success", false)
          .put("error", "Shopee post result missing")
          .toString()
      }
    )
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
  fun importShopeeProducts(
    maxItems: Double,
    profileLocalId: String?,
    importSource: String?,
    offerCategory: String?,
    promise: Promise
  ) {
    startShopeeImport(maxItems, profileLocalId, importSource, offerCategory, promise)
  }

  @ReactMethod
  fun importShopeeLikedProducts(maxItems: Double, profileLocalId: String?, promise: Promise) {
    startShopeeImport(maxItems, profileLocalId, SHOPEE_IMPORT_SOURCE_LIKED, null, promise)
  }

  private fun startShopeeImport(
    maxItems: Double,
    profileLocalId: String?,
    importSource: String?,
    offerCategory: String?,
    promise: Promise
  ) {
    val cleanProfileLocalId = profileLocalId?.trim()?.takeIf { it.isNotEmpty() }
    val normalizedImportSource = normalizeShopeeImportSource(importSource)
    val normalizedOfferCategory = normalizeShopeeOfferCategory(offerCategory)
    val requestedMaxItems = maxItems.toInt()
    val normalizedMaxItems = if (requestedMaxItems <= 0) 0 else requestedMaxItems
    val timeoutMs = if (normalizedMaxItems == 0) {
      45 * 60 * 1000L
    } else {
      maxOf(10 * 60 * 1000L, minOf(45 * 60 * 1000L, normalizedMaxItems.toLong() * 30_000L))
    }
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
    }, timeoutMs)

    sendAutomationCommand(KubdeeAutomationIpc.ACTION_START_SHOPEE_IMPORT) {
      putExtra(KubdeeAutomationIpc.EXTRA_RUN_ID, runId)
      putExtra(KubdeeAutomationIpc.EXTRA_MAX_ITEMS, normalizedMaxItems)
      putExtra(KubdeeAutomationIpc.EXTRA_IMPORT_SOURCE, normalizedImportSource)
      putExtra(KubdeeAutomationIpc.EXTRA_OFFER_CATEGORY, normalizedOfferCategory)
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
    val component = ComponentName(reactContext, KubdeeAccessibilityService::class.java)
    if (!isAccessibilityServiceEnabled(reactContext, component)) {
      promise.reject("ACCESSIBILITY_DISABLED", "Kubdee Accessibility service is not enabled")
      return
    }

    if (!openPackageBlocking(TARGET_PACKAGE_SHOPEE)) {
      promise.reject("APP_NOT_FOUND", "Package not found: $TARGET_PACKAGE_SHOPEE")
      return
    }

    val runId = "shopee-post-${System.currentTimeMillis()}-${UUID.randomUUID()}"
    pendingShopeePostPromises[runId] = promise
    moduleHandler.postDelayed({
      pendingShopeePostPromises.remove(runId)?.reject(
        "SHOPEE_POST_TIMEOUT",
        "Shopee post ใช้เวลานานเกินไป"
      )
    }, 20 * 60 * 1000L)

    sendAutomationCommand(KubdeeAutomationIpc.ACTION_START_SHOPEE_POST) {
      putExtra(KubdeeAutomationIpc.EXTRA_RUN_ID, runId)
      putExtra(KubdeeAutomationIpc.EXTRA_PAYLOAD_JSON, payloadJson)
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
  fun readUriAsDataUrl(uriString: String, promise: Promise) {
    Thread {
      try {
        val cleanUri = uriString.trim()
        if (cleanUri.isEmpty()) {
          promise.resolve(null)
          return@Thread
        }
        val uri = Uri.parse(cleanUri)
        val bytes = openUriInputStream(uri)?.use { input -> input.readBytes() }
        if (bytes == null || bytes.isEmpty()) {
          promise.resolve(null)
          return@Thread
        }
        val mimeType = resolveUriImageMimeType(uri, cleanUri)
        val encoded = Base64.encodeToString(bytes, Base64.NO_WRAP)
        promise.resolve("data:$mimeType;base64,$encoded")
      } catch (error: Exception) {
        promise.reject("URI_DATA_URL_READ_FAILED", error.message, error)
      }
    }.also { thread ->
      thread.name = "KubdeeUriDataUrlRead"
      thread.start()
    }
  }

  @ReactMethod
  fun listGoogleFlowAssets(step: String, limit: Int, promise: Promise) {
    Thread {
      try {
        val assets = listSavedGoogleFlowAssets(step, limit)
        val array = Arguments.createArray()
        assets.forEach { asset -> array.pushMap(asset.toWritableMap()) }
        promise.resolve(array)
      } catch (error: Exception) {
        promise.reject("FLOW_ASSET_LIST_FAILED", error.message, error)
      }
    }.also { thread ->
      thread.name = "KubdeeFlowAssetList"
      thread.start()
    }
  }

  @ReactMethod
  fun createGoogleFlowVideoThumbnail(uriString: String, promise: Promise) {
    Thread {
      try {
        val uri = Uri.parse(uriString.trim())
        promise.resolve(createVideoThumbnail(uri))
      } catch (error: Exception) {
        promise.reject("FLOW_VIDEO_THUMBNAIL_FAILED", error.message, error)
      }
    }.also { thread ->
      thread.name = "KubdeeFlowVideoThumbnail"
      thread.start()
    }
  }

  @ReactMethod
  fun deleteGoogleFlowAssets(uriStrings: ReadableArray, promise: Promise) {
    Thread {
      var deleted = 0
      var failed = 0
      try {
        for (index in 0 until uriStrings.size()) {
          val raw = uriStrings.getString(index)?.trim().orEmpty()
          if (raw.isBlank()) {
            continue
          }
          val uri = Uri.parse(raw)
          val ok = when (uri.scheme?.lowercase(Locale.ROOT)) {
            "content" -> reactContext.contentResolver.delete(uri, null, null) > 0
            "file" -> File(uri.path.orEmpty()).delete()
            else -> false
          }
          if (ok) deleted += 1 else failed += 1
        }
        promise.resolve(Arguments.createMap().apply {
          putInt("deleted", deleted)
          putInt("failed", failed)
        })
      } catch (error: Exception) {
        promise.reject("FLOW_ASSET_DELETE_FAILED", error.message, error)
      }
    }.also { thread ->
      thread.name = "KubdeeFlowAssetDelete"
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
  fun probeGoogleFlowVideos(videoUris: ReadableArray, trimEndSeconds: Double, promise: Promise) {
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
          val result = Arguments.createMap()
          result.putBoolean("success", false)
          result.putString("error", "ไม่มีวิดีโอฉากให้ตรวจสอบ")
          promise.resolve(result)
          return@Thread
        }

        val trimEndMs = (trimEndSeconds * 1000.0).toLong().coerceAtLeast(0L)
        val videos = Arguments.createArray()
        var totalEffectiveMs = 0L
        uris.forEach { uri ->
          val durationMs = getMediaDurationMs(uri) ?: 0L
          val effectiveMs = (durationMs - trimEndMs).coerceAtLeast(500L)
          totalEffectiveMs += effectiveMs
          val item = Arguments.createMap()
          item.putString("uri", uri.toString())
          item.putDouble("duration", durationMs / 1000.0)
          item.putDouble("effectiveDuration", effectiveMs / 1000.0)
          item.putBoolean("hasAudio", true)
          videos.pushMap(item)
        }

        val result = Arguments.createMap()
        result.putBoolean("success", true)
        result.putDouble("totalEffectiveDuration", totalEffectiveMs / 1000.0)
        result.putArray("videos", videos)
        promise.resolve(result)
      } catch (error: Exception) {
        val result = Arguments.createMap()
        result.putBoolean("success", false)
        result.putString("error", error.message ?: "ตรวจความยาววิดีโอไม่สำเร็จ")
        promise.resolve(result)
      }
    }.also { thread ->
      thread.name = "KubdeeFlowVideoProbe"
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

internal fun WritableMap.putNullableString(key: String, value: String?) {
  if (value != null) putString(key, value) else putNull(key)
}

private fun org.json.JSONObject.optStringOrNull(key: String): String? {
  if (!has(key) || isNull(key)) return null
  return optString(key).takeIf { it.isNotBlank() }
}
