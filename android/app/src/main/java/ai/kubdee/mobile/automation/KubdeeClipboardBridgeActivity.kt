package ai.kubdee.mobile.automation

import android.app.Activity
import android.content.ClipboardManager
import android.graphics.Color
import android.graphics.drawable.ColorDrawable
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.WindowManager
import java.io.File
import org.json.JSONObject

class KubdeeClipboardBridgeActivity : Activity() {
  private val handler = Handler(Looper.getMainLooper())
  private var attempts = 0
  private lateinit var requestId: String

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    requestId = intent.getStringExtra(EXTRA_REQUEST_ID).orEmpty()
    window.setBackgroundDrawable(ColorDrawable(Color.TRANSPARENT))
    window.clearFlags(WindowManager.LayoutParams.FLAG_DIM_BEHIND)
    handler.postDelayed({ readClipboardAndFinish() }, 120L)
  }

  override fun onDestroy() {
    handler.removeCallbacksAndMessages(null)
    super.onDestroy()
  }

  private fun readClipboardAndFinish() {
    val text = readClipboardText()
    attempts += 1
    if (text.isNotBlank() || attempts >= 6) {
      writeResult(text)
      finish()
      return
    }
    handler.postDelayed({ readClipboardAndFinish() }, 120L)
  }

  private fun readClipboardText(): String {
    return try {
      val clipboard = getSystemService(CLIPBOARD_SERVICE) as? ClipboardManager ?: return ""
      val clip = clipboard.primaryClip ?: return ""
      if (clip.itemCount <= 0) return ""
      clip.getItemAt(0)?.coerceToText(this)?.toString().orEmpty()
    } catch (error: Exception) {
      Log.w(TAG, "Unable to read clipboard from bridge activity", error)
      ""
    }
  }

  private fun writeResult(text: String) {
    try {
      val payload = JSONObject()
        .put("requestId", requestId)
        .put("text", text)
        .put("ts", System.currentTimeMillis())
      File(filesDir, RESULT_FILE_NAME).writeText(payload.toString())
    } catch (error: Exception) {
      Log.w(TAG, "Unable to write clipboard bridge result", error)
    }
  }

  companion object {
    private const val TAG = "KubdeeClipboardBridge"
    const val EXTRA_REQUEST_ID = "requestId"
    const val RESULT_FILE_NAME = "kubdee-clipboard-bridge-result.json"
  }
}
