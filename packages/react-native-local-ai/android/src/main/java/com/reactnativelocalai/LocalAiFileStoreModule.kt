package com.reactnativelocalai

import android.os.StatFs
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.io.File
import java.io.IOException
import java.io.RandomAccessFile
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Native backing for the TypeScript `FileStore` + `DownloadTransport` + `KeyValueStore`.
 *
 * App-private storage only: `filesDir/localai/models/{temp,installed}`. `downloadToFile` resumes
 * from a byte offset via HTTP `Range` (RandomAccessFile), restarts if the server ignores Range,
 * emits throttled `LocalAiDownloadProgress` events, and can be cancelled. All heavy work runs on
 * a background executor; promises resolve/reject from there.
 */
class LocalAiFileStoreModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  private val executor = Executors.newCachedThreadPool()
  private val cancelFlags = ConcurrentHashMap<String, AtomicBoolean>()

  override fun getName() = "LocalAiFileStore"

  // ---- storage roots ----

  private fun modelsRoot(): File = File(reactContext.filesDir, "localai/models")
  private fun tempDir(): File = File(modelsRoot(), "temp")
  private fun installedDir(): File = File(modelsRoot(), "installed")

  /** Reject writes/moves/deletes outside app-private storage (defense in depth). */
  private fun assertWithinAppStorage(path: String) {
    val target = File(path).canonicalPath
    val allowed = listOf(reactContext.filesDir, reactContext.cacheDir).map { it.canonicalPath }
    if (allowed.none { target == it || target.startsWith("$it/") }) {
      throw SecurityException("Path is outside app-private storage: $path")
    }
  }

  @ReactMethod
  fun paths(promise: Promise) {
    val map = Arguments.createMap().apply {
      putString("root", modelsRoot().absolutePath)
      putString("tempDir", tempDir().absolutePath)
      putString("installedDir", installedDir().absolutePath)
    }
    promise.resolve(map)
  }

  @ReactMethod
  fun ensureDir(dir: String, promise: Promise) {
    try {
      assertWithinAppStorage(dir)
      File(dir).mkdirs()
      promise.resolve(null)
    } catch (e: Exception) {
      promise.reject("E_IO", e.message, e)
    }
  }

  @ReactMethod
  fun exists(path: String, promise: Promise) = promise.resolve(File(path).exists())

  @ReactMethod
  fun size(path: String, promise: Promise) {
    val f = File(path)
    promise.resolve(if (f.exists()) f.length().toDouble() else 0.0)
  }

  @ReactMethod
  fun delete(path: String, promise: Promise) {
    try {
      assertWithinAppStorage(path)
      File(path).delete()
      promise.resolve(null)
    } catch (e: Exception) {
      promise.reject("E_IO", e.message, e)
    }
  }

  @ReactMethod
  fun move(from: String, to: String, promise: Promise) {
    try {
      assertWithinAppStorage(from)
      assertWithinAppStorage(to)
      val dest = File(to)
      dest.parentFile?.mkdirs()
      if (dest.exists()) dest.delete()
      val ok = File(from).renameTo(dest)
      if (!ok) throw IOException("rename failed: $from -> $to")
      promise.resolve(null)
    } catch (e: Exception) {
      promise.reject("E_IO", e.message, e)
    }
  }

  @ReactMethod
  fun sha256(path: String, promise: Promise) {
    executor.execute {
      try {
        val digest = MessageDigest.getInstance("SHA-256")
        File(path).inputStream().use { input ->
          val buffer = ByteArray(1 shl 16)
          while (true) {
            val read = input.read(buffer)
            if (read < 0) break
            digest.update(buffer, 0, read)
          }
        }
        promise.resolve(digest.digest().joinToString("") { "%02x".format(it) })
      } catch (e: Exception) {
        promise.reject("E_IO", e.message, e)
      }
    }
  }

  @ReactMethod
  fun freeStorageBytes(promise: Promise) {
    val stat = StatFs(reactContext.filesDir.absolutePath)
    promise.resolve(stat.availableBytes.toDouble())
  }

  // ---- key-value store ----

  private fun prefs() =
    reactContext.getSharedPreferences("reactnativelocalai.kv.v1", 0)

  @ReactMethod
  fun getItem(key: String, promise: Promise) = promise.resolve(prefs().getString(key, null))

  @ReactMethod
  fun setItem(key: String, value: String, promise: Promise) {
    prefs().edit().putString(key, value).apply()
    promise.resolve(null)
  }

  @ReactMethod
  fun removeItem(key: String, promise: Promise) {
    prefs().edit().remove(key).apply()
    promise.resolve(null)
  }

  // ---- resumable download ----

  @ReactMethod
  fun cancelDownload(destPath: String, promise: Promise) {
    cancelFlags[destPath]?.set(true)
    promise.resolve(null)
  }

  @ReactMethod
  fun downloadToFile(
    url: String,
    destPath: String,
    fromByte: Double,
    headers: ReadableMap,
    promise: Promise
  ) {
    val cancelled = AtomicBoolean(false)
    cancelFlags[destPath] = cancelled
    executor.execute {
      try {
        assertWithinAppStorage(destPath)
        val result = runDownload(url, destPath, fromByte.toLong(), headers, cancelled)
        promise.resolve(result)
      } catch (e: DownloadRejection) {
        promise.reject(e.code, e.message, e.userInfoMap())
      } catch (e: Exception) {
        promise.reject("E_RETRYABLE", e.message, e)
      } finally {
        cancelFlags.remove(destPath)
      }
    }
  }

  private fun runDownload(
    url: String,
    destPath: String,
    fromByte: Long,
    headers: ReadableMap,
    cancelled: AtomicBoolean
  ): WritableMap {
    val connection = (URL(url).openConnection() as HttpURLConnection).apply {
      instanceFollowRedirects = true
      connectTimeout = 30_000
      readTimeout = 30_000
      val it = headers.keySetIterator()
      while (it.hasNextKey()) {
        val k = it.nextKey()
        headers.getString(k)?.let { v -> setRequestProperty(k, v) }
      }
      if (fromByte > 0) setRequestProperty("Range", "bytes=$fromByte-")
    }

    try {
      connection.connect()
      val status = connection.responseCode

      if (status == 429 || status >= 500) {
        val retryAfterMs = connection.getHeaderField("Retry-After")?.toLongOrNull()?.times(1000)
        throw DownloadRejection("E_RETRYABLE", "HTTP $status", status, retryAfterMs)
      }
      if (status >= 400) {
        throw DownloadRejection("E_HTTP", "HTTP $status", status, null)
      }

      // Range honored → append at offset; server returned 200 at an offset → restart from 0.
      val serverIgnoredRange = fromByte > 0 && status == HttpURLConnection.HTTP_OK
      val start = if (serverIgnoredRange) 0L else fromByte
      val total = resolveTotal(connection, status, start)

      val dest = File(destPath)
      dest.parentFile?.mkdirs()
      var received = start
      RandomAccessFile(dest, "rw").use { raf ->
        if (start == 0L) raf.setLength(0)
        raf.seek(start)
        connection.inputStream.use { input ->
          val buffer = ByteArray(1 shl 16)
          var lastEmit = 0L
          while (true) {
            if (cancelled.get()) throw DownloadRejection("E_CANCELLED", "cancelled", null, null)
            val read = input.read(buffer)
            if (read < 0) break
            raf.write(buffer, 0, read)
            received += read
            val now = System.currentTimeMillis()
            if (now - lastEmit >= 200) {
              emitProgress(destPath, received, total)
              lastEmit = now
            }
          }
        }
      }
      emitProgress(destPath, received, total)

      return Arguments.createMap().apply {
        putDouble("receivedBytes", received.toDouble())
        if (total != null) putDouble("totalBytes", total.toDouble()) else putNull("totalBytes")
      }
    } catch (e: DownloadRejection) {
      throw e
    } catch (e: IOException) {
      // Mid-stream network failure → retryable; the JS manager resumes from the temp size.
      throw DownloadRejection("E_RETRYABLE", e.message ?: "network error", null, null)
    } finally {
      connection.disconnect()
    }
  }

  private fun resolveTotal(connection: HttpURLConnection, status: Int, start: Long): Long? {
    if (status == HttpURLConnection.HTTP_PARTIAL) {
      val range = connection.getHeaderField("Content-Range") // bytes s-e/total
      val total = range?.substringAfterLast('/')?.toLongOrNull()
      if (total != null) return total
    }
    val len = connection.getHeaderFieldLong("Content-Length", -1L)
    if (len < 0) return null
    return start + len
  }

  private fun emitProgress(destPath: String, received: Long, total: Long?) {
    val map = Arguments.createMap().apply {
      putString("destPath", destPath)
      putDouble("receivedBytes", received.toDouble())
      if (total != null) putDouble("totalBytes", total.toDouble()) else putNull("totalBytes")
    }
    reactContext
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit("LocalAiDownloadProgress", map)
  }

  // Required for NativeEventEmitter on the JS side (classic bridge).
  @ReactMethod fun addListener(eventName: String) {}
  @ReactMethod fun removeListeners(count: Int) {}

  private class DownloadRejection(
    val code: String,
    message: String,
    private val status: Int?,
    private val retryAfterMs: Long?
  ) : Exception(message) {
    fun userInfoMap(): WritableMap = Arguments.createMap().apply {
      if (status != null) putInt("status", status)
      if (retryAfterMs != null) putDouble("retryAfterMs", retryAfterMs.toDouble())
    }
  }
}
