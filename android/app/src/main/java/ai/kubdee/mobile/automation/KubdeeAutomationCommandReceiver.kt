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
        val maxItems = intent.getIntExtra(KubdeeAutomationIpc.EXTRA_MAX_ITEMS, 40).coerceIn(1, 120)
        val profileLocalId = intent.getStringExtra(KubdeeAutomationIpc.EXTRA_PROFILE_LOCAL_ID)
        if (runId.isBlank()) {
          Log.w(TAG, "Missing Shopee import run id")
          return
        }

        val started = KubdeeAccessibilityService.dispatchShopeeImportStart(maxItems, runId, profileLocalId)
        if (!started) {
          Log.w(TAG, "Accessibility service is not connected yet; queued Shopee import")
        }
      }

      KubdeeAutomationIpc.ACTION_STOP_SHOPEE -> {
        val stopped = KubdeeAccessibilityService.dispatchShopeeStop()
        if (!stopped) {
          Log.w(TAG, "Accessibility service is not connected yet; queued Shopee stop")
        }
      }
    }
  }

  companion object {
    private const val TAG = "KubdeeAutomationCommand"
  }
}
