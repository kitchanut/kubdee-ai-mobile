package ai.kubdee.mobile.automation

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

class KubdeeAutomationCommandReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    when (intent.action) {
      KubdeeAutomationIpc.ACTION_START_SHOPEE_IMPORT -> {
        val runId = intent.getStringExtra(KubdeeAutomationIpc.EXTRA_RUN_ID).orEmpty()
        val requestedMaxItems = intent.getIntExtra(KubdeeAutomationIpc.EXTRA_MAX_ITEMS, 40)
        val maxItems = if (requestedMaxItems <= 0) 0 else requestedMaxItems
        val profileLocalId = intent.getStringExtra(KubdeeAutomationIpc.EXTRA_PROFILE_LOCAL_ID)
        val importSource = normalizeShopeeImportSource(intent.getStringExtra(KubdeeAutomationIpc.EXTRA_IMPORT_SOURCE))
        val offerCategory = normalizeShopeeOfferCategory(intent.getStringExtra(KubdeeAutomationIpc.EXTRA_OFFER_CATEGORY))
        if (runId.isBlank()) {
          Log.w(TAG, "Missing Shopee import run id")
          return
        }

        val started = KubdeeAccessibilityService.dispatchShopeeImportStart(
          maxItems,
          runId,
          profileLocalId,
          importSource,
          offerCategory
        )
        if (!started) {
          Log.w(TAG, "Accessibility service is not connected yet; queued Shopee import")
        }
      }

      KubdeeAutomationIpc.ACTION_START_SHOPEE_POST -> {
        val runId = intent.getStringExtra(KubdeeAutomationIpc.EXTRA_RUN_ID).orEmpty()
        val payloadJson = intent.getStringExtra(KubdeeAutomationIpc.EXTRA_PAYLOAD_JSON).orEmpty()
        if (runId.isBlank()) {
          Log.w(TAG, "Missing Shopee post run id")
          return
        }
        if (payloadJson.isBlank()) {
          Log.w(TAG, "Missing Shopee post payload")
          return
        }

        val started = KubdeeAccessibilityService.dispatchShopeePostStart(payloadJson, runId)
        if (!started) {
          Log.w(TAG, "Accessibility service is not connected yet; queued Shopee post")
        }
      }

      KubdeeAutomationIpc.ACTION_START_SHOPEE_CONVERT -> {
        val runId = intent.getStringExtra(KubdeeAutomationIpc.EXTRA_RUN_ID).orEmpty()
        val payloadJson = intent.getStringExtra(KubdeeAutomationIpc.EXTRA_PAYLOAD_JSON).orEmpty()
        if (runId.isBlank()) {
          Log.w(TAG, "Missing Shopee convert run id")
          return
        }
        if (payloadJson.isBlank()) {
          Log.w(TAG, "Missing Shopee convert payload")
          return
        }

        val started = KubdeeAccessibilityService.dispatchShopeeConvertStart(payloadJson, runId)
        if (!started) {
          Log.w(TAG, "Accessibility service is not connected yet; queued Shopee convert")
        }
      }

      KubdeeAutomationIpc.ACTION_STOP_SHOPEE -> {
        val stopped = KubdeeAccessibilityService.dispatchShopeeStop()
        if (!stopped) {
          Log.w(TAG, "Accessibility service is not connected yet; queued Shopee stop")
        }
      }

      KubdeeAutomationIpc.ACTION_TAP_SCREEN -> {
        val x = intent.getFloatExtra(KubdeeAutomationIpc.EXTRA_SCREEN_X, Float.NaN)
        val y = intent.getFloatExtra(KubdeeAutomationIpc.EXTRA_SCREEN_Y, Float.NaN)
        val metrics = context.resources.displayMetrics
        if (!x.isFinite() || !y.isFinite() || x < 0 || y < 0 || x > metrics.widthPixels || y > metrics.heightPixels) {
          Log.w(TAG, "Rejected invalid screen tap coordinates")
          return
        }
        val service = KubdeeAccessibilityService.getInstance()
        if (service == null) {
          Log.w(TAG, "Accessibility service is not connected; ignored screen tap")
          return
        }
        service.tap(x, y) { success ->
          if (!success) Log.w(TAG, "Screen tap gesture was cancelled")
        }
      }

      KubdeeAutomationIpc.ACTION_PRESS_IME_ENTER -> {
        val service = KubdeeAccessibilityService.getInstance()
        if (service == null) {
          Log.w(TAG, "Accessibility service is not connected; ignored IME enter")
          return
        }
        if (!service.pressImeEnter()) {
          Log.w(TAG, "IME enter action was not performed")
        }
      }
    }
  }

  companion object {
    private const val TAG = "KubdeeAutomationCommand"
  }
}
