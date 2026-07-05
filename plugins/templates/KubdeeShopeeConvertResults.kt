package __PACKAGE_NAME__.automation

import android.content.Context
import android.util.Log
import java.io.RandomAccessFile
import java.nio.charset.StandardCharsets
import org.json.JSONArray
import org.json.JSONObject

// เก็บผลแปลงลิงก์ Shopee ลง disk ทีละลิงก์จาก process :automation
// เพื่อให้ process หลัก (JS) มาอ่านเก็บเข้าคลังได้เสมอ แม้แอปหลักโดน Android
// ฆ่าระหว่าง automation รัน — pattern เดียวกับ KubdeeShopeeImportQueue
object KubdeeShopeeConvertResults {
  private const val TAG = "KubdeeShopeeConvert"
  private const val FILE_NAME = "pending-shopee-convert-results.jsonl"
  private val processLock = Any()

  fun appendResult(
    context: Context,
    localId: String,
    url: String,
    shortUrl: String,
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
              put("localId", localId)
              put("url", url)
              put("shortUrl", shortUrl)
              put("ts", ts)
            }.toString() + "\n"
            raf.write(line.toByteArray(StandardCharsets.UTF_8))
          }
        }
      } catch (error: Exception) {
        Log.w(TAG, "Unable to append Shopee convert result", error)
      }
    }
  }

  // อ่านผลค้างทั้งหมด — ซ้ำ localId เอาบรรทัดล่าสุด (short link ใหม่สุดชนะ)
  fun readResults(context: Context): JSONArray =
    synchronized(processLock) {
      val byLocalId = linkedMapOf<String, JSONObject>()
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

              val localId = row.optString("localId").trim()
              if (localId.isEmpty() || row.optString("shortUrl").trim().isEmpty()) continue
              byLocalId[localId] = row
            }
          }
        }
      } catch (error: Exception) {
        Log.w(TAG, "Unable to read Shopee convert results", error)
      }

      JSONArray().apply {
        byLocalId.values.forEach { put(it) }
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
        Log.w(TAG, "Unable to clear Shopee convert results", error)
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
