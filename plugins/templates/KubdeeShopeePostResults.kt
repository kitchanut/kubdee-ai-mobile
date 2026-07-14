package __PACKAGE_NAME__.automation

import android.content.Context
import android.util.Log
import java.io.RandomAccessFile
import java.nio.charset.StandardCharsets
import org.json.JSONArray
import org.json.JSONObject

// เก็บผลโพสต์ Shopee ลง disk จาก process :automation ณ วินาทีเดียวกับที่ยิง broadcast
// ACTION_EVENT_SHOPEE_POST_FINISHED — broadcast ข้าม process หายได้ถ้าแอปหลักโดน freeze
// (Sentry MOBILE-G: JS รอจน withTimeout 5 นาทียิงทั้งที่ automation โพสต์เสร็จแล้ว)
// ให้ JS poll ไฟล์นี้ควบคู่กับการรอ broadcast — pattern เดียวกับ KubdeeShopeeConvertResults
object KubdeeShopeePostResults {
  private const val TAG = "KubdeeShopeePostRes"
  private const val FILE_NAME = "pending-shopee-post-results.jsonl"
  private val processLock = Any()

  fun appendResult(
    context: Context,
    runId: String,
    resultJson: String,
    error: String?,
    stopped: Boolean,
    ts: Long = System.currentTimeMillis()
  ) {
    synchronized(processLock) {
      try {
        val file = resultsFile(context)
        file.parentFile?.mkdirs()
        RandomAccessFile(file, "rw").use { raf ->
          raf.channel.lock().use {
            raf.seek(raf.length())
            val line = JSONObject().apply {
              put("runId", runId)
              put("resultJson", resultJson)
              if (!error.isNullOrBlank()) put("error", error)
              put("stopped", stopped)
              put("ts", ts)
            }.toString() + "\n"
            raf.write(line.toByteArray(StandardCharsets.UTF_8))
          }
        }
      } catch (error: Exception) {
        Log.w(TAG, "Unable to append Shopee post result", error)
      }
    }
  }

  // อ่านผลค้างทั้งหมด — ซ้ำ runId เอาบรรทัดล่าสุด
  fun readResults(context: Context): JSONArray =
    synchronized(processLock) {
      val byRunId = linkedMapOf<String, JSONObject>()
      val file = resultsFile(context)
      if (!file.exists() || file.length() <= 0L) {
        return@synchronized JSONArray()
      }

      try {
        RandomAccessFile(file, "r").use { raf ->
          raf.channel.lock(0L, Long.MAX_VALUE, true).use {
            for (line in raf.readTextUtf8().lineSequence()) {
              val trimmed = line.trim()
              if (trimmed.isEmpty()) continue

              val row = try {
                JSONObject(trimmed)
              } catch (_: Exception) {
                continue
              }

              val runId = row.optString("runId").trim()
              if (runId.isEmpty() || row.optString("resultJson").trim().isEmpty()) continue
              byRunId[runId] = row
            }
          }
        }
      } catch (error: Exception) {
        Log.w(TAG, "Unable to read Shopee post results", error)
      }

      JSONArray().apply {
        byRunId.values.forEach { put(it) }
      }
    }

  fun clear(context: Context): Boolean =
    synchronized(processLock) {
      try {
        val file = resultsFile(context)
        if (!file.exists()) return@synchronized true
        RandomAccessFile(file, "rw").use { raf ->
          raf.channel.lock().use {
            raf.setLength(0L)
          }
        }
        true
      } catch (error: Exception) {
        Log.w(TAG, "Unable to clear Shopee post results", error)
        false
      }
    }

  private fun resultsFile(context: Context) =
    context.applicationContext.filesDir.resolve(FILE_NAME)

  private fun RandomAccessFile.readTextUtf8(): String {
    val size = length().coerceAtMost(4L * 1024L * 1024L).toInt()
    if (size <= 0) return ""
    seek(0L)
    val bytes = ByteArray(size)
    readFully(bytes)
    return String(bytes, StandardCharsets.UTF_8)
  }
}
