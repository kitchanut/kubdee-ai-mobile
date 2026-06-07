const fs = require('fs');
const path = require('path');
const {
  AndroidConfig,
  createRunOncePlugin,
  withAndroidManifest,
  withDangerousMod,
  withStringsXml,
} = require('@expo/config-plugins');

const PLUGIN_NAME = 'kubdee-accessibility';
const PLUGIN_VERSION = '1.0.0';

function withKubdeeAccessibility(config, props = {}) {
  const targetPackage = props.targetPackage || 'com.shopee.th';

  config = withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;
    const application = manifest.application?.[0];

    if (!application) {
      throw new Error('AndroidManifest.xml is missing <application>.');
    }

    manifest.queries = manifest.queries || [{}];
    const queries = manifest.queries[0];
    queries.package = queries.package || [];
    if (!queries.package.some((item) => item.$?.['android:name'] === targetPackage)) {
      queries.package.push({ $: { 'android:name': targetPackage } });
    }

    application.service = application.service || [];
    const serviceName = '.automation.KubdeeAccessibilityService';
    const existingIndex = application.service.findIndex((item) => item.$?.['android:name'] === serviceName);
    const service = {
      $: {
        'android:name': serviceName,
        'android:permission': 'android.permission.BIND_ACCESSIBILITY_SERVICE',
        'android:exported': 'true',
        'android:label': '@string/kubdee_accessibility_service_label',
      },
      'intent-filter': [
        {
          action: [
            {
              $: {
                'android:name': 'android.accessibilityservice.AccessibilityService',
              },
            },
          ],
        },
      ],
      'meta-data': [
        {
          $: {
            'android:name': 'android.accessibilityservice',
            'android:resource': '@xml/kubdee_accessibility_service',
          },
        },
      ],
    };

    if (existingIndex >= 0) {
      application.service[existingIndex] = service;
    } else {
      application.service.push(service);
    }

    return config;
  });

  config = withStringsXml(config, (config) => {
    AndroidConfig.Strings.setStringItem(
      [
        {
          $: { name: 'kubdee_accessibility_service_label' },
          _: 'Kubdee Mobile Automation',
        },
        {
          $: { name: 'kubdee_accessibility_service_description' },
          _: 'ใช้สำหรับควบคุม Shopee ตามสคริปต์ที่ผู้ใช้สั่งใน Kubdee Mobile',
        },
      ],
      config.modResults
    );

    return config;
  });

  config = withDangerousMod(config, [
    'android',
    async (config) => {
      const packageName = config.android?.package;
      if (!packageName) {
        throw new Error('android.package is required for Kubdee accessibility plugin.');
      }

      const projectRoot = config.modRequest.platformProjectRoot;
      const packagePath = packageName.replace(/\./g, '/');
      const javaRoot = path.join(projectRoot, 'app/src/main/java', packagePath);
      const automationRoot = path.join(javaRoot, 'automation');
      const xmlRoot = path.join(projectRoot, 'app/src/main/res/xml');

      fs.mkdirSync(automationRoot, { recursive: true });
      fs.mkdirSync(xmlRoot, { recursive: true });

      writeFileIfChanged(
        path.join(xmlRoot, 'kubdee_accessibility_service.xml'),
        accessibilityServiceXml(targetPackage)
      );
      writeFileIfChanged(
        path.join(automationRoot, 'KubdeeAccessibilityService.kt'),
        accessibilityServiceKt(packageName)
      );
      writeFileIfChanged(
        path.join(automationRoot, 'KubdeeAccessibilityModule.kt'),
        accessibilityModuleKt(packageName, targetPackage)
      );
      writeFileIfChanged(
        path.join(automationRoot, 'KubdeeAccessibilityPackage.kt'),
        accessibilityPackageKt(packageName)
      );
      patchMainApplication(path.join(javaRoot, 'MainApplication.kt'), packageName);

      return config;
    },
  ]);

  return config;
}

function writeFileIfChanged(filePath, contents) {
  if (fs.existsSync(filePath) && fs.readFileSync(filePath, 'utf8') === contents) {
    return;
  }

  fs.writeFileSync(filePath, contents);
}

function patchMainApplication(filePath, packageName) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`MainApplication.kt not found at ${filePath}`);
  }

  const importLine = `import ${packageName}.automation.KubdeeAccessibilityPackage`;
  const addLine = '          add(KubdeeAccessibilityPackage())';
  let source = fs.readFileSync(filePath, 'utf8');

  if (!source.includes(importLine)) {
    source = source.replace(`package ${packageName}\n\n`, `package ${packageName}\n\n${importLine}\n`);
  }

  if (!source.includes(addLine)) {
    if (source.includes('          // add(MyReactNativePackage())')) {
      source = source.replace(
        '          // add(MyReactNativePackage())\n',
        `          // add(MyReactNativePackage())\n${addLine}\n`
      );
    } else {
      source = source.replace(
        'PackageList(this).packages.apply {\n',
        `PackageList(this).packages.apply {\n${addLine}\n`
      );
    }
  }

  writeFileIfChanged(filePath, source);
}

function accessibilityServiceXml(targetPackage) {
  return `<?xml version="1.0" encoding="utf-8"?>
<accessibility-service xmlns:android="http://schemas.android.com/apk/res/android"
  android:accessibilityEventTypes="typeWindowStateChanged|typeWindowContentChanged|typeViewClicked|typeViewFocused"
  android:accessibilityFeedbackType="feedbackGeneric"
  android:accessibilityFlags="flagReportViewIds|flagRetrieveInteractiveWindows"
  android:canPerformGestures="true"
  android:canRetrieveWindowContent="true"
  android:description="@string/kubdee_accessibility_service_description"
  android:notificationTimeout="100"
  android:packageNames="${targetPackage}" />
`;
}

function accessibilityServiceKt(packageName) {
  return `package ${packageName}.automation

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.content.Intent
import android.os.Bundle
import android.graphics.Path
import android.os.Build
import android.util.Log
import android.view.accessibility.AccessibilityNodeInfo
import android.view.accessibility.AccessibilityEvent
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

class KubdeeAccessibilityService : AccessibilityService() {
  companion object {
    private const val TAG = "KubdeeAccessibility"

    @Volatile
    private var currentService: KubdeeAccessibilityService? = null

    fun getInstance(): KubdeeAccessibilityService? = currentService

    fun isRunning(): Boolean = currentService != null
  }

  override fun onServiceConnected() {
    super.onServiceConnected()
    currentService = this
  }

  override fun onAccessibilityEvent(event: AccessibilityEvent?) {
    // Event handling will be wired to deterministic Shopee scripts in the runner layer.
  }

  override fun onInterrupt() = Unit

  override fun onDestroy() {
    if (currentService === this) {
      currentService = null
    }
    super.onDestroy()
  }

  override fun onUnbind(intent: android.content.Intent?): Boolean {
    if (currentService === this) {
      currentService = null
    }
    return super.onUnbind(intent)
  }

  fun tap(x: Float, y: Float, onResult: (Boolean) -> Unit) {
    dispatchLineGesture(x, y, x, y, 80, onResult)
  }

  fun swipe(startX: Float, startY: Float, endX: Float, endY: Float, durationMs: Long, onResult: (Boolean) -> Unit) {
    dispatchLineGesture(startX, startY, endX, endY, durationMs, onResult)
  }

  fun clickByText(text: String): Boolean {
    val root = rootInActiveWindow ?: return false
    val node = root
      .findAccessibilityNodeInfosByText(text)
      .firstNotNullOfOrNull { findClickableNode(it) }
      ?: return false

    return node.performAction(AccessibilityNodeInfo.ACTION_CLICK)
  }

  fun inputText(text: String): Boolean {
    val root = rootInActiveWindow ?: return false
    val focused = root.findFocus(AccessibilityNodeInfo.FOCUS_INPUT)
    val target = when {
      focused?.isEditable == true -> focused
      else -> findEditableNode(root)
    } ?: return false

    val args = Bundle().apply {
      putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, text)
    }

    return target.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args)
  }

  fun pressImeEnter(): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) return false

    val root = rootInActiveWindow ?: return false
    val focused = root.findFocus(AccessibilityNodeInfo.FOCUS_INPUT)
    val target = when {
      focused != null -> focused
      else -> findEditableNode(root)
    } ?: return false

    return target.performAction(AccessibilityNodeInfo.AccessibilityAction.ACTION_IME_ENTER.id)
  }

  fun runShopeeSearch(targetPackage: String, keyword: String): Boolean {
    val normalizedKeyword = keyword.ifBlank { "สินค้า" }

    Thread {
      try {
        logStep("เปิด Shopee")
        if (!launchPackage(targetPackage)) {
          logStep("เปิด Shopee ไม่สำเร็จ")
          return@Thread
        }

        sleepStep(3500)
        logStep("ไปหน้าแรก Shopee")
        if (!clickByText("หน้าแรก")) {
          tapBlocking(72f, 1460f)
        }

        sleepStep(2800)
        logStep("แตะช่องค้นหา")
        tapBlocking(150f, 120f)
        sleepStep(1600)
        tapBlocking(320f, 116f)

        sleepStep(350)
        logStep("พิมพ์ keyword: $normalizedKeyword")
        if (!inputText(normalizedKeyword)) {
          logStep("พิมพ์ keyword ไม่สำเร็จ")
          return@Thread
        }

        sleepStep(650)
        logStep("กดค้นหาบน keyboard")
        if (!pressImeEnter()) {
          tapBlocking(650f, 1460f)
        }

        sleepStep(2800)
        logStep("เลื่อนผลลัพธ์")
        swipeBlocking(360f, 1320f, 360f, 560f, 540L)
        logStep("รัน Shopee Search test เสร็จแล้ว")
      } catch (error: Exception) {
        Log.e(TAG, "Shopee search runner failed", error)
      }
    }.also { thread ->
      thread.name = "KubdeeShopeeSearch"
      thread.start()
    }

    return true
  }

  private fun dispatchLineGesture(
    startX: Float,
    startY: Float,
    endX: Float,
    endY: Float,
    durationMs: Long,
    onResult: (Boolean) -> Unit
  ) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N) {
      onResult(false)
      return
    }

    val path = Path().apply {
      moveTo(startX, startY)
      if (startX != endX || startY != endY) {
        lineTo(endX, endY)
      }
    }
    val stroke = GestureDescription.StrokeDescription(path, 0, durationMs.coerceAtLeast(1))
    val gesture = GestureDescription.Builder().addStroke(stroke).build()

    dispatchGesture(
      gesture,
      object : AccessibilityService.GestureResultCallback() {
        override fun onCompleted(gestureDescription: GestureDescription?) {
          onResult(true)
        }

        override fun onCancelled(gestureDescription: GestureDescription?) {
          onResult(false)
        }
      },
      null
    )
  }

  private fun launchPackage(packageName: String): Boolean {
    val launchIntent = packageManager.getLaunchIntentForPackage(packageName) ?: return false
    launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    launchIntent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP)
    launchIntent.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP)
    startActivity(launchIntent)
    return true
  }

  private fun tapBlocking(x: Float, y: Float, timeoutMs: Long = 2500): Boolean {
    var completed = false
    val latch = CountDownLatch(1)
    tap(x, y) { success ->
      completed = success
      latch.countDown()
    }

    return latch.await(timeoutMs, TimeUnit.MILLISECONDS) && completed
  }

  private fun swipeBlocking(
    startX: Float,
    startY: Float,
    endX: Float,
    endY: Float,
    durationMs: Long,
    timeoutMs: Long = durationMs + 2500
  ): Boolean {
    var completed = false
    val latch = CountDownLatch(1)
    swipe(startX, startY, endX, endY, durationMs) { success ->
      completed = success
      latch.countDown()
    }

    return latch.await(timeoutMs, TimeUnit.MILLISECONDS) && completed
  }

  private fun logStep(message: String) {
    Log.d(TAG, "Shopee runner: $message")
  }

  private fun sleepStep(ms: Long) {
    try {
      Thread.sleep(ms)
    } catch (error: InterruptedException) {
      Thread.currentThread().interrupt()
      throw error
    }
  }

  private fun findClickableNode(node: AccessibilityNodeInfo?): AccessibilityNodeInfo? {
    var current = node
    while (current != null) {
      if (current.isClickable) {
        return current
      }
      current = current.parent
    }
    return null
  }

  private fun findEditableNode(node: AccessibilityNodeInfo?): AccessibilityNodeInfo? {
    if (node == null) return null
    if (node.isEditable) return node

    for (index in 0 until node.childCount) {
      val found = findEditableNode(node.getChild(index))
      if (found != null) return found
    }

    return null
  }

  fun performBack(): Boolean = performGlobalAction(GLOBAL_ACTION_BACK)
}
`;
}

function accessibilityModuleKt(packageName, targetPackage) {
  return `package ${packageName}.automation

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.provider.Settings
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class KubdeeAccessibilityModule(
  private val reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {
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
      val intent = Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS).apply {
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      reactContext.startActivity(intent)
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
    const val TARGET_PACKAGE_SHOPEE = "${targetPackage}"
  }
}
`;
}

function accessibilityPackageKt(packageName) {
  return `package ${packageName}.automation

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class KubdeeAccessibilityPackage : ReactPackage {
  override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> =
    listOf(KubdeeAccessibilityModule(reactContext))

  override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> =
    emptyList()
}
`;
}

module.exports = createRunOncePlugin(withKubdeeAccessibility, PLUGIN_NAME, PLUGIN_VERSION);
