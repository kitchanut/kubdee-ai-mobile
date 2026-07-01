package __PACKAGE_NAME__.automation

import android.content.ComponentName
import android.content.BroadcastReceiver
import android.content.ContentUris
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.graphics.Bitmap
import android.net.Uri
import android.media.MediaMetadataRetriever
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.os.Handler
import android.os.Looper
import android.provider.MediaStore
import android.provider.Settings
import android.util.Base64
import android.util.Log
import androidx.annotation.OptIn
import androidx.media3.common.MediaItem
import androidx.media3.common.util.UnstableApi
import androidx.media3.transformer.Composition
import androidx.media3.transformer.EditedMediaItem
import androidx.media3.transformer.EditedMediaItemSequence
import androidx.media3.transformer.ExportException
import androidx.media3.transformer.ExportResult
import androidx.media3.transformer.Transformer
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.google.common.collect.ImmutableList
import java.io.ByteArrayInputStream
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.io.InputStream
import java.io.OutputStream
import java.security.MessageDigest
import java.util.Locale
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference
import org.json.JSONArray
import org.json.JSONObject

internal fun KubdeeAccessibilityModule.findLatestGoogleFlowDownload(step: String, sinceMs: Long): GoogleFlowDownloadAsset? {
  if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
    return null
  }

  val normalizedStep = step.lowercase(Locale.ROOT)
  val collection = MediaStore.Downloads.EXTERNAL_CONTENT_URI
  val projection = arrayOf(
    MediaStore.MediaColumns._ID,
    MediaStore.MediaColumns.DISPLAY_NAME,
    MediaStore.MediaColumns.MIME_TYPE,
    MediaStore.MediaColumns.SIZE,
    MediaStore.MediaColumns.DATE_ADDED
  )
  val sinceSeconds = ((sinceMs / 1000L) - 1L).coerceAtLeast(0L)
  val mimePrefix = if (normalizedStep == "video") "video/%" else "image/%"
  val primaryExt = if (normalizedStep == "video") "%.mp4" else "%.png"
  val fallbackExt = if (normalizedStep == "video") "%.webm" else "%.jpg"
  val altExt = if (normalizedStep == "video") "%.mov" else "%.jpeg"
  val selection =
    "${MediaStore.MediaColumns.DATE_ADDED} >= ? AND (" +
      "${MediaStore.MediaColumns.MIME_TYPE} LIKE ? OR " +
      "${MediaStore.MediaColumns.DISPLAY_NAME} LIKE ? OR " +
      "${MediaStore.MediaColumns.DISPLAY_NAME} LIKE ? OR " +
      "${MediaStore.MediaColumns.DISPLAY_NAME} LIKE ?)"
  val selectionArgs = arrayOf(
    sinceSeconds.toString(),
    mimePrefix,
    primaryExt,
    fallbackExt,
    altExt
  )
  val sortOrder = "${MediaStore.MediaColumns.DATE_ADDED} DESC"

  return reactContext.contentResolver.query(collection, projection, selection, selectionArgs, sortOrder)?.use { cursor ->
    while (cursor.moveToNext()) {
      val id = cursor.getLong(cursor.getColumnIndexOrThrow(MediaStore.MediaColumns._ID))
      val fileName = cursor.getString(cursor.getColumnIndexOrThrow(MediaStore.MediaColumns.DISPLAY_NAME)).orEmpty()
      val mimeType = cursor.getString(cursor.getColumnIndexOrThrow(MediaStore.MediaColumns.MIME_TYPE)).orEmpty()
      val sizeBytes = cursor.getLong(cursor.getColumnIndexOrThrow(MediaStore.MediaColumns.SIZE))
      val dateAdded = cursor.getLong(cursor.getColumnIndexOrThrow(MediaStore.MediaColumns.DATE_ADDED))
      if (sizeBytes <= 0L) {
        continue
      }
      val uri = ContentUris.withAppendedId(collection, id)
      return@use GoogleFlowDownloadAsset(
        uri = uri.toString(),
        fileName = fileName,
        mimeType = mimeType.ifBlank { if (normalizedStep == "video") "video/mp4" else "image/png" },
        thumbnailUri = videoThumbnailForStep(normalizedStep, uri, generate = true),
        sizeBytes = sizeBytes,
        createdAt = dateAdded * 1000L
      )
    }
    null
  }
}

internal fun KubdeeAccessibilityModule.listSavedGoogleFlowAssets(step: String, limit: Int): List<GoogleFlowDownloadAsset> {
  val normalizedStep = step.lowercase(Locale.ROOT)
  val maxItems = limit.coerceIn(1, 300)

  if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
    val collection = MediaStore.Downloads.EXTERNAL_CONTENT_URI
    val projection = arrayOf(
      MediaStore.MediaColumns._ID,
      MediaStore.MediaColumns.DISPLAY_NAME,
      MediaStore.MediaColumns.MIME_TYPE,
      MediaStore.MediaColumns.SIZE,
      MediaStore.MediaColumns.DATE_ADDED,
      MediaStore.MediaColumns.RELATIVE_PATH
    )
    val mimePrefix = if (normalizedStep == "video") "video/%" else "image/%"
    val primaryExt = if (normalizedStep == "video") "%.mp4" else "%.png"
    val fallbackExt = if (normalizedStep == "video") "%.webm" else "%.jpg"
    val altExt = if (normalizedStep == "video") "%.mov" else "%.jpeg"
    val selection =
      "(" +
        "${MediaStore.MediaColumns.MIME_TYPE} LIKE ? OR " +
        "${MediaStore.MediaColumns.DISPLAY_NAME} LIKE ? OR " +
        "${MediaStore.MediaColumns.DISPLAY_NAME} LIKE ? OR " +
        "${MediaStore.MediaColumns.DISPLAY_NAME} LIKE ?" +
      ") AND ${MediaStore.MediaColumns.RELATIVE_PATH} LIKE ?"
    val selectionArgs = arrayOf(
      mimePrefix,
      primaryExt,
      fallbackExt,
      altExt,
      "%Kubdee AI%"
    )
    val sortOrder = "${MediaStore.MediaColumns.DATE_ADDED} DESC"
    val result = mutableListOf<GoogleFlowDownloadAsset>()

    reactContext.contentResolver.query(collection, projection, selection, selectionArgs, sortOrder)?.use { cursor ->
      while (cursor.moveToNext() && result.size < maxItems) {
        val id = cursor.getLong(cursor.getColumnIndexOrThrow(MediaStore.MediaColumns._ID))
        val fileName = cursor.getString(cursor.getColumnIndexOrThrow(MediaStore.MediaColumns.DISPLAY_NAME)).orEmpty()
        val mimeType = cursor.getString(cursor.getColumnIndexOrThrow(MediaStore.MediaColumns.MIME_TYPE)).orEmpty()
        val sizeBytes = cursor.getLong(cursor.getColumnIndexOrThrow(MediaStore.MediaColumns.SIZE))
        val dateAdded = cursor.getLong(cursor.getColumnIndexOrThrow(MediaStore.MediaColumns.DATE_ADDED))
        if (sizeBytes <= 0L) {
          continue
        }
        val uri = ContentUris.withAppendedId(collection, id)
        result.add(
          GoogleFlowDownloadAsset(
            uri = uri.toString(),
            fileName = fileName,
            mimeType = mimeType.ifBlank { if (normalizedStep == "video") "video/mp4" else "image/png" },
            thumbnailUri = videoThumbnailForStep(normalizedStep, uri, generate = false),
            sizeBytes = sizeBytes,
            createdAt = dateAdded * 1000L
          )
        )
      }
    }
    return result
  }

  val directory = File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), "Kubdee AI")
  if (!directory.exists() || !directory.isDirectory) {
    return emptyList()
  }
  val extensions = if (normalizedStep == "video") {
    setOf("mp4", "webm", "mov", "3gp")
  } else {
    setOf("png", "jpg", "jpeg", "webp", "gif")
  }
  return directory
    .listFiles()
    .orEmpty()
    .filter { file -> file.isFile && file.extension.lowercase(Locale.ROOT) in extensions && file.length() > 0L }
    .sortedByDescending { file -> file.lastModified() }
    .take(maxItems)
    .map { file ->
      GoogleFlowDownloadAsset(
        uri = Uri.fromFile(file).toString(),
        fileName = file.name,
        mimeType = if (normalizedStep == "video") "video/mp4" else "image/png",
        thumbnailUri = videoThumbnailForStep(normalizedStep, Uri.fromFile(file), generate = false),
        sizeBytes = file.length(),
        createdAt = file.lastModified()
      )
    }
}

internal fun KubdeeAccessibilityModule.cachedVideoThumbnailUri(uri: Uri): String? {
  val file = videoThumbnailFile(uri)
  return if (file.exists() && file.length() > 0L) Uri.fromFile(file).toString() else null
}

internal fun KubdeeAccessibilityModule.createVideoThumbnail(uri: Uri): String? {
  val cached = cachedVideoThumbnailUri(uri)
  if (cached != null) {
    return cached
  }

  val target = videoThumbnailFile(uri)
  val retriever = MediaMetadataRetriever()
  val bitmap = try {
    when (uri.scheme?.lowercase(Locale.ROOT)) {
      "content" -> retriever.setDataSource(reactContext, uri)
      "file" -> retriever.setDataSource(uri.path.orEmpty())
      else -> retriever.setDataSource(uri.toString())
    }
    retriever.getFrameAtTime(1_000_000L, MediaMetadataRetriever.OPTION_CLOSEST_SYNC)
      ?: retriever.getFrameAtTime(0L, MediaMetadataRetriever.OPTION_CLOSEST)
  } finally {
    retriever.release()
  } ?: return null

  target.parentFile?.mkdirs()
  FileOutputStream(target).use { output ->
    bitmap.compress(Bitmap.CompressFormat.JPEG, 82, output)
  }
  bitmap.recycle()
  return Uri.fromFile(target).toString()
}

internal fun KubdeeAccessibilityModule.videoThumbnailFile(uri: Uri): File {
  val digest = MessageDigest.getInstance("SHA-256")
    .digest(uri.toString().toByteArray(Charsets.UTF_8))
    .joinToString("") { byte -> "%02x".format(byte.toInt() and 0xff) }
  return File(File(reactContext.cacheDir, "kubdee-video-thumbnails"), "$digest.jpg")
}

internal fun KubdeeAccessibilityModule.videoThumbnailForStep(step: String, uri: Uri, generate: Boolean): String? {
  if (!step.equals("video", ignoreCase = true)) {
    return null
  }
  return if (generate) createVideoThumbnail(uri) else cachedVideoThumbnailUri(uri)
}

internal fun KubdeeAccessibilityModule.saveGoogleFlowDataUrl(
  step: String,
  dataUrl: String,
  fileName: String?
): GoogleFlowDownloadAsset? {
  val commaIndex = dataUrl.indexOf(',')
  if (commaIndex <= 0) {
    throw IllegalArgumentException("data URL ไม่ถูกต้อง")
  }

  val header = dataUrl.substring(0, commaIndex)
  val payload = dataUrl.substring(commaIndex + 1)
  if (payload.isBlank()) {
    throw IllegalArgumentException("data URL ว่าง")
  }

  val mimeType = normalizeGoogleFlowAssetMimeType(
    step,
    header.substringAfter("data:", if (step == "video") "video/mp4" else "image/png").substringBefore(';')
  )
  val bytes = if (header.contains(";base64", ignoreCase = true)) {
    Base64.decode(payload, Base64.DEFAULT)
  } else {
    Uri.decode(payload).toByteArray(Charsets.UTF_8)
  }
  val displayName = normalizeGoogleFlowAssetFileName(step, fileName, mimeType)

  return ByteArrayInputStream(bytes).use { input ->
    saveGoogleFlowAssetStream(step, input, displayName, mimeType)
  }
}

internal fun KubdeeAccessibilityModule.saveGoogleFlowAssetStream(
  step: String,
  input: InputStream,
  fileName: String,
  mimeType: String
): GoogleFlowDownloadAsset? {
  val createdAt = System.currentTimeMillis()
  var sizeBytes = 0L

  return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
    val values = ContentValues().apply {
      put(MediaStore.MediaColumns.DISPLAY_NAME, fileName)
      put(MediaStore.MediaColumns.MIME_TYPE, mimeType)
      put(MediaStore.MediaColumns.RELATIVE_PATH, "${Environment.DIRECTORY_DOWNLOADS}/Kubdee AI")
      put(MediaStore.MediaColumns.DATE_ADDED, createdAt / 1000L)
      put(MediaStore.MediaColumns.DATE_MODIFIED, createdAt / 1000L)
      put(MediaStore.MediaColumns.IS_PENDING, 1)
    }
    val collection = MediaStore.Downloads.EXTERNAL_CONTENT_URI
    val uri = reactContext.contentResolver.insert(collection, values) ?: return null
    try {
      reactContext.contentResolver.openOutputStream(uri)?.use { output ->
        sizeBytes = copyGoogleFlowAssetStream(input, output)
      } ?: return null
      val doneValues = ContentValues().apply {
        put(MediaStore.MediaColumns.SIZE, sizeBytes)
        put(MediaStore.MediaColumns.IS_PENDING, 0)
      }
      reactContext.contentResolver.update(uri, doneValues, null, null)
      GoogleFlowDownloadAsset(
        uri = uri.toString(),
        fileName = fileName,
        mimeType = mimeType,
        thumbnailUri = videoThumbnailForStep(step, uri, generate = true),
        sizeBytes = sizeBytes,
        createdAt = createdAt
      )
    } catch (error: Exception) {
      reactContext.contentResolver.delete(uri, null, null)
      throw error
    }
  } else {
    val directory = File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), "Kubdee AI")
    if (!directory.exists() && !directory.mkdirs()) {
      return null
    }
    val target = File(directory, fileName)
    FileOutputStream(target).use { output ->
      sizeBytes = copyGoogleFlowAssetStream(input, output)
    }
    GoogleFlowDownloadAsset(
      uri = Uri.fromFile(target).toString(),
      fileName = fileName,
      mimeType = mimeType,
      thumbnailUri = videoThumbnailForStep(step, Uri.fromFile(target), generate = true),
      sizeBytes = sizeBytes,
      createdAt = createdAt
    )
  }
}

internal fun KubdeeAccessibilityModule.copyGoogleFlowAssetStream(input: InputStream, output: OutputStream): Long {
  val buffer = ByteArray(16 * 1024)
  var total = 0L
  while (true) {
    val read = input.read(buffer)
    if (read <= 0) break
    output.write(buffer, 0, read)
    total += read.toLong()
  }
  output.flush()
  return total
}

internal fun KubdeeAccessibilityModule.openUriInputStream(uri: Uri): InputStream? {
  return when (uri.scheme?.lowercase(Locale.ROOT)) {
    "content" -> reactContext.contentResolver.openInputStream(uri)
    "file" -> FileInputStream(File(uri.path ?: return null))
    null, "" -> FileInputStream(File(uri.toString()))
    else -> null
  }
}

internal fun KubdeeAccessibilityModule.resolveUriImageMimeType(uri: Uri, fallbackName: String): String {
  val resolverType = runCatching { reactContext.contentResolver.getType(uri) }.getOrNull()
  if (!resolverType.isNullOrBlank() && resolverType.startsWith("image/")) {
    return resolverType
  }
  val lowerName = fallbackName.lowercase(Locale.ROOT)
  return when {
    lowerName.endsWith(".jpg") || lowerName.endsWith(".jpeg") -> "image/jpeg"
    lowerName.endsWith(".webp") -> "image/webp"
    lowerName.endsWith(".gif") -> "image/gif"
    else -> "image/png"
  }
}

internal fun KubdeeAccessibilityModule.saveDataUrlToCacheFile(dataUrl: String, prefix: String, fallbackExtension: String): File {
  val commaIndex = dataUrl.indexOf(',')
  if (commaIndex <= 0) {
    throw IllegalArgumentException("data URL เสียงไม่ถูกต้อง")
  }
  val header = dataUrl.substring(0, commaIndex)
  val payload = dataUrl.substring(commaIndex + 1)
  val mime = header.substringAfter("data:", "audio/wav").substringBefore(';').lowercase(Locale.ROOT)
  val extension = when {
    mime.contains("mpeg") || mime.contains("mp3") -> "mp3"
    mime.contains("aac") || mime.contains("mp4") -> "m4a"
    mime.contains("ogg") -> "ogg"
    else -> fallbackExtension
  }
  val bytes = if (header.contains(";base64", ignoreCase = true)) {
    Base64.decode(payload, Base64.DEFAULT)
  } else {
    Uri.decode(payload).toByteArray(Charsets.UTF_8)
  }
  val file = File(reactContext.cacheDir, "$prefix-${UUID.randomUUID()}.$extension")
  FileOutputStream(file).use { it.write(bytes) }
  return file
}

@OptIn(UnstableApi::class)
internal fun KubdeeAccessibilityModule.exportGoogleFlowComposition(videoUris: List<Uri>, audioUri: Uri?, outputFile: File): String? {
  val errorMessage = AtomicReference<String?>(null)
  val transformerRef = AtomicReference<Transformer?>(null)
  val latch = CountDownLatch(1)
  val trimEndMs = 300L
  val rawVideoDurations = videoUris.map { uri -> getMediaDurationMs(uri) ?: 0L }
  val rawEffectiveDurations = rawVideoDurations.map { durationMs ->
    (durationMs - trimEndMs).coerceAtLeast(500L)
  }
  val rawTotalEffectiveMs = rawEffectiveDurations.sum()
  val voiceoverDurationMs = audioUri?.let { getMediaDurationMs(it) } ?: 0L
  val targetVideoDurationMs = if (audioUri != null && voiceoverDurationMs > 0L) {
    minOf(rawTotalEffectiveMs, voiceoverDurationMs + 1000L)
  } else {
    rawTotalEffectiveMs
  }
  var accumulatedVideoMs = 0L
  val videoItems = mutableListOf<EditedMediaItem>()
  for (index in videoUris.indices) {
    val uri = videoUris[index]
    val sourceDurationMs = rawVideoDurations[index]
    val rawEffectiveMs = rawEffectiveDurations[index]
    val remainingMs = targetVideoDurationMs - accumulatedVideoMs
    val effectiveMs = if (audioUri != null) {
      minOf(rawEffectiveMs, remainingMs.coerceAtLeast(0L))
    } else {
      rawEffectiveMs
    }
    if (effectiveMs <= 10L) break
    accumulatedVideoMs += effectiveMs
    val clippedMediaItem = if (sourceDurationMs > effectiveMs + 10L) {
      MediaItem.Builder()
        .setUri(uri)
        .setClippingConfiguration(
          MediaItem.ClippingConfiguration.Builder()
            .setEndPositionMs(effectiveMs)
            .build()
        )
        .build()
    } else {
      MediaItem.fromUri(uri)
    }
    videoItems.add(EditedMediaItem.Builder(clippedMediaItem).build())
  }
  if (videoItems.isEmpty()) {
    return "ไม่มีวิดีโอฉากให้รวมหลังปรับความยาว"
  }
  val videoSequence = EditedMediaItemSequence.withAudioAndVideoFrom(ImmutableList.copyOf(videoItems))
  val composition = if (audioUri != null) {
    val voiceAudioTrimMs = if (voiceoverDurationMs > 0L) {
      maxOf(accumulatedVideoMs, voiceoverDurationMs)
    } else {
      accumulatedVideoMs
    }
    val audioMediaItem = if (voiceAudioTrimMs > 0L && voiceoverDurationMs > voiceAudioTrimMs + 10L) {
      MediaItem.Builder()
        .setUri(audioUri)
        .setClippingConfiguration(
          MediaItem.ClippingConfiguration.Builder()
            .setEndPositionMs(voiceAudioTrimMs)
            .build()
        )
        .build()
    } else {
      MediaItem.fromUri(audioUri)
    }
    val audioItem = EditedMediaItem.Builder(audioMediaItem).build()
    val audioSequence = EditedMediaItemSequence.withAudioFrom(ImmutableList.of(audioItem))
      .buildUpon()
      .setIsLooping(false)
      .build()
    Composition.Builder(videoSequence, audioSequence).build()
  } else {
    Composition.Builder(videoSequence).build()
  }

  moduleHandler.post {
    try {
      val transformer = Transformer.Builder(reactContext)
        .addListener(object : Transformer.Listener {
          override fun onCompleted(composition: Composition, result: ExportResult) {
            latch.countDown()
          }

          override fun onError(
            composition: Composition,
            result: ExportResult,
            exception: ExportException
          ) {
            errorMessage.set(exception.message ?: exception.errorCodeName)
            latch.countDown()
          }
        })
        .build()
      transformerRef.set(transformer)
      transformer.start(composition, outputFile.absolutePath)
    } catch (error: Exception) {
      errorMessage.set(error.message ?: "เริ่มรวมวิดีโอไม่สำเร็จ")
      latch.countDown()
    }
  }

  val completed = latch.await(20, TimeUnit.MINUTES)
  if (!completed) {
    moduleHandler.post {
      try {
        transformerRef.get()?.cancel()
      } catch (_: Exception) {
        // Ignore cancellation cleanup errors.
      }
    }
    return "รวมวิดีโอใช้เวลานานเกินไป"
  }
  return errorMessage.get()
}

internal fun KubdeeAccessibilityModule.getMediaDurationMs(uri: Uri): Long? {
  val retriever = MediaMetadataRetriever()
  return try {
    retriever.setDataSource(reactContext, uri)
    retriever
      .extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)
      ?.toLongOrNull()
  } catch (_: Exception) {
    null
  } finally {
    try {
      retriever.release()
    } catch (_: Exception) {
      // Ignore cleanup errors.
    }
  }
}

internal fun KubdeeAccessibilityModule.normalizeGoogleFlowAssetMimeType(step: String, value: String?): String {
  val raw = value?.substringBefore(';')?.trim().orEmpty()
  if (raw.startsWith("video/", ignoreCase = true) || raw.startsWith("image/", ignoreCase = true)) {
    return raw.lowercase(Locale.ROOT)
  }
  return if (step.lowercase(Locale.ROOT) == "video") "video/mp4" else "image/png"
}

internal fun KubdeeAccessibilityModule.normalizeGoogleFlowAssetFileName(step: String, value: String?, mimeType: String): String {
  val extension = extensionForGoogleFlowAssetMimeType(step, mimeType)
  val clean = value
    ?.substringAfterLast('/')
    ?.substringBefore('?')
    ?.trim()
    ?.replace(Regex("""[^a-zA-Z0-9ก-๙._-]+"""), "-")
    ?.trim('-', '.', '_')
    ?.take(80)
    .orEmpty()

  return if (clean.isNotBlank() && clean.contains('.')) {
    clean
  } else {
    val prefix = if (clean.isNotBlank()) clean.substringBeforeLast('.', clean) else "kubdee-flow-${step.lowercase(Locale.ROOT)}"
    "$prefix-${System.currentTimeMillis()}.$extension"
  }
}

internal fun KubdeeAccessibilityModule.extensionForGoogleFlowAssetMimeType(step: String, mimeType: String): String =
  when (mimeType.lowercase(Locale.ROOT)) {
    "video/webm" -> "webm"
    "video/quicktime" -> "mov"
    "video/3gpp" -> "3gp"
    "image/jpeg", "image/jpg" -> "jpg"
    "image/webp" -> "webp"
    "image/gif" -> "gif"
    else -> if (step.lowercase(Locale.ROOT) == "video") "mp4" else "png"
  }
internal data class GoogleFlowDownloadAsset(
  val uri: String,
  val fileName: String,
  val mimeType: String,
  val thumbnailUri: String? = null,
  val sizeBytes: Long,
  val createdAt: Long
)

internal fun GoogleFlowDownloadAsset.toWritableMap() =
  Arguments.createMap().apply {
    putString("uri", uri)
    putString("fileName", fileName)
    putString("mimeType", mimeType)
    putNullableString("thumbnailUri", thumbnailUri)
    putDouble("sizeBytes", sizeBytes.toDouble())
    putDouble("createdAt", createdAt.toDouble())
  }
