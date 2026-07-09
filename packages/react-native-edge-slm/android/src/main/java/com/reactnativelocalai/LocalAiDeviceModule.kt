package com.reactnativelocalai

import android.app.ActivityManager
import android.content.Context
import android.os.Build
import android.os.StatFs
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * Reports device hardware capabilities backing the TypeScript `DeviceInfoProvider`. Values are
 * best-effort; unknown fields are omitted rather than guessed.
 */
class LocalAiDeviceModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName() = "LocalAiDevice"

  @ReactMethod
  fun getCapabilities(promise: Promise) {
    try {
      val memoryInfo = ActivityManager.MemoryInfo()
      val activityManager =
        reactContext.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
      activityManager.getMemoryInfo(memoryInfo)
      val stat = StatFs(reactContext.filesDir.absolutePath)

      val map = Arguments.createMap().apply {
        putString("platform", "android")
        putInt("androidApiLevel", Build.VERSION.SDK_INT)
        putDouble("totalRamBytes", memoryInfo.totalMem.toDouble())
        putDouble("freeStorageBytes", stat.availableBytes.toDouble())
        putInt("cpuCores", Runtime.getRuntime().availableProcessors())
        putString("deviceModel", Build.MODEL)
      }
      promise.resolve(map)
    } catch (e: Exception) {
      promise.reject("E_DEVICE_INFO", e.message, e)
    }
  }
}
