package __PACKAGE_NAME__.automation

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

class KubdeeAutomationCommandReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    when (intent.action) {
      ACTION_START_GOOGLE_FLOW -> {
        val payloadJson = intent.getStringExtra(EXTRA_PAYLOAD_JSON)
        if (payloadJson.isNullOrBlank()) {
          Log.w(TAG, "Missing Google Flow payload")
          return
        }
        val started = KubdeeAccessibilityService.dispatchGoogleFlowStart(payloadJson)
        if (!started) {
          Log.w(TAG, "Accessibility service is not connected yet; queued Google Flow start")
        }
      }

      ACTION_STOP_GOOGLE_FLOW -> {
        val stopped = KubdeeAccessibilityService.dispatchGoogleFlowStop()
        if (!stopped) {
          Log.w(TAG, "Accessibility service is not connected yet; queued Google Flow stop")
        }
      }
    }
  }

  companion object {
    private const val TAG = "KubdeeAutomationCommand"
    const val ACTION_START_GOOGLE_FLOW = "__PACKAGE_NAME__.automation.START_GOOGLE_FLOW"
    const val ACTION_STOP_GOOGLE_FLOW = "__PACKAGE_NAME__.automation.STOP_GOOGLE_FLOW"
    const val EXTRA_PAYLOAD_JSON = "payloadJson"
  }
}
