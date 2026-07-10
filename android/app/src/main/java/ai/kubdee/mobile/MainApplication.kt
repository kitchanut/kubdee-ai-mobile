package ai.kubdee.mobile

import android.app.ActivityManager
import android.app.Application
import android.content.res.Configuration
import android.os.Build
import android.os.Process

import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.ReactPackage
import com.facebook.react.ReactHost
import com.facebook.react.common.ReleaseLevel
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint
import ai.kubdee.mobile.automation.KubdeeAccessibilityPackage

import expo.modules.ApplicationLifecycleDispatcher
import expo.modules.ExpoReactHostFactory

class MainApplication : Application(), ReactApplication {

  override val reactHost: ReactHost by lazy {
    if (isAutomationProcess()) {
      throw IllegalStateException("React host is not available in the automation process")
    }

    if (isLightweightAutomationProcess()) {
      throw IllegalStateException("React host is not available in automation helper processes")
    }

    ExpoReactHostFactory.getDefaultReactHost(
      context = applicationContext,
      packageList =
        PackageList(this).packages.apply {
          // Packages that cannot be autolinked yet can be added manually here, for example:
          // add(MyReactNativePackage())
          add(KubdeeAccessibilityPackage())
        }
    )
  }

  override fun onCreate() {
    super.onCreate()
    if (isLightweightAutomationProcess()) {
      return
    }

    DefaultNewArchitectureEntryPoint.releaseLevel = try {
      ReleaseLevel.valueOf(BuildConfig.REACT_NATIVE_RELEASE_LEVEL.uppercase())
    } catch (e: IllegalArgumentException) {
      ReleaseLevel.STABLE
    }
    loadReactNative(this)
    ApplicationLifecycleDispatcher.onApplicationCreate(this)
  }

  override fun onConfigurationChanged(newConfig: Configuration) {
    super.onConfigurationChanged(newConfig)
    if (isLightweightAutomationProcess()) {
      return
    }

    ApplicationLifecycleDispatcher.onConfigurationChanged(this, newConfig)
  }

  private fun isLightweightAutomationProcess(): Boolean {
    val processName = currentProcessName() ?: return false
    return processName.endsWith(":automation") || processName.endsWith(":clipboard")
  }

  private fun isAutomationProcess(): Boolean =
    currentProcessName()?.endsWith(":automation") == true

  private fun currentProcessName(): String? {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
      return getProcessName()
    }

    val currentPid = Process.myPid()
    val activityManager = getSystemService(ACTIVITY_SERVICE) as? ActivityManager ?: return null
    return activityManager.runningAppProcesses?.firstOrNull { processInfo ->
      processInfo.pid == currentPid
    }?.processName
  }
}
