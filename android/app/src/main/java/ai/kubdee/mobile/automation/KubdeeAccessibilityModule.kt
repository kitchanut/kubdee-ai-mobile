package ai.kubdee.mobile.automation

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule

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
      val launchIntent = reactContext.packageManager.getLaunchIntentForPackage(packageName)
      if (launchIntent == null) {
        promise.reject("APP_NOT_FOUND", "Package not found: $packageName")
        return
      }

      launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      launchIntent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP)
      launchIntent.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP)
      reactContext.startActivity(launchIntent)
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
    val service = KubdeeAccessibilityService.getInstance()
    if (service == null) {
      promise.reject("ACCESSIBILITY_DISABLED", "Kubdee Accessibility service is not running")
      return
    }

    promise.resolve(service.runGoogleFlowAutoPilot(payloadJson))
  }

  @ReactMethod
  fun stopGoogleFlowAutoPilot(promise: Promise) {
    val service = KubdeeAccessibilityService.getInstance()
    if (service == null) {
      promise.resolve(false)
      return
    }

    service.requestStopGoogleFlowAutomation()
    promise.resolve(true)
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

    val expected = component.flattenToString()
    return enabledSetting.split(':').any { it.equals(expected, ignoreCase = true) }
  }

  companion object {
    const val TARGET_PACKAGE_SHOPEE = "com.shopee.th"

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
      createdAt: Long? = null
    ) {
      val context = eventContext ?: return
      val payload = Arguments.createMap().apply {
        putString("message", message)
        putDouble("ts", System.currentTimeMillis().toDouble())
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
