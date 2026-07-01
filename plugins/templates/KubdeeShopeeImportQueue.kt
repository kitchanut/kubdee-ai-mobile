package __PACKAGE_NAME__.automation

import android.content.Context
import android.util.Log
import java.io.RandomAccessFile
import java.nio.charset.StandardCharsets
import org.json.JSONArray
import org.json.JSONObject

object KubdeeShopeeImportQueue {
  private const val TAG = "KubdeeShopeeQueue"
  private const val QUEUE_FILE_NAME = "pending-shopee-import-products.jsonl"
  private val processLock = Any()

  fun appendProduct(
    context: Context,
    product: ShopeeLikedProduct,
    profileLocalId: String?,
    ts: Long = System.currentTimeMillis()
  ) {
    synchronized(processLock) {
      try {
        val file = queueFile(context)
        file.parentFile?.mkdirs()
        RandomAccessFile(file, "rw").use { raf ->
          raf.channel.lock().use {
            raf.seek(raf.length())
            val line = product.toQueueJson(profileLocalId, ts).toString() + "\n"
            raf.write(line.toByteArray(StandardCharsets.UTF_8))
          }
        }
      } catch (error: Exception) {
        Log.w(TAG, "Unable to append Shopee import product", error)
      }
    }
  }

  fun readProducts(context: Context): JSONArray =
    synchronized(processLock) {
      val output = JSONArray()
      val file = queueFile(context)
      if (!file.exists() || file.length() <= 0L) {
        return@synchronized output
      }

      try {
        RandomAccessFile(file, "r").use { raf ->
          raf.channel.lock(0L, Long.MAX_VALUE, true).use {
            val lines = raf.readTextUtf8().lineSequence()
            val seen = linkedSetOf<String>()
            for (line in lines) {
              val trimmed = line.trim()
              if (trimmed.isEmpty()) continue

              val product = try {
                JSONObject(trimmed)
              } catch (_: Exception) {
                continue
              }

              val key = product.identityKey()
              if (key.isBlank() || !seen.add(key)) continue
              output.put(product)
            }
          }
        }
      } catch (error: Exception) {
        Log.w(TAG, "Unable to read Shopee import queue", error)
      }

      output
    }

  fun clear(context: Context): Boolean =
    synchronized(processLock) {
      try {
        val file = queueFile(context)
        if (!file.exists()) return@synchronized true
        RandomAccessFile(file, "rw").use { raf ->
          raf.channel.lock().use {
            raf.setLength(0L)
          }
        }
        true
      } catch (error: Exception) {
        Log.w(TAG, "Unable to clear Shopee import queue", error)
        false
      }
    }

  private fun queueFile(context: Context) =
    context.applicationContext.filesDir.resolve(QUEUE_FILE_NAME)

  private fun RandomAccessFile.readTextUtf8(): String {
    val size = length().coerceAtMost(4L * 1024L * 1024L).toInt()
    if (size <= 0) return ""
    seek(0L)
    val bytes = ByteArray(size)
    readFully(bytes)
    return String(bytes, StandardCharsets.UTF_8)
  }

  private fun ShopeeLikedProduct.toQueueJson(profileLocalId: String?, ts: Long): JSONObject =
    JSONObject().apply {
      put("name", name)
      putNullable("price", price)
      putNullable("stock", stock)
      putNullable("productUrl", productUrl)
      putNullable("externalProductId", externalProductId)
      putNullable("imageUrl", imageUrl)
      put("status", status)
      put("scrapedAt", scrapedAt)
      putNullable("profileLocalId", profileLocalId?.trim()?.takeIf { it.isNotEmpty() })
      put("ts", ts)
    }

  private fun JSONObject.identityKey(): String =
    optStringOrBlank("profileLocalId") + "\u0000" + (
      optStringOrBlank("externalProductId")
        .ifBlank { optStringOrBlank("productUrl") }
        .ifBlank { optStringOrBlank("name") + "\u0000" + optStringOrBlank("price") }
    )

  private fun JSONObject.optStringOrBlank(key: String): String {
    if (!has(key) || isNull(key)) return ""
    return optString(key).trim()
  }

  private fun JSONObject.putNullable(key: String, value: Any?) {
    if (value == null) put(key, JSONObject.NULL) else put(key, value)
  }
}
