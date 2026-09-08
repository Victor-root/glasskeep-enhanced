package com.glasskeep.app.nativeapp

import android.util.Log
import com.glasskeep.app.BuildConfig

/**
 * Every log line the native rewrite prints goes through here, under one
 * tag, so `adb logcat -s GKNative` (or the Logcat search box in Android
 * Studio) shows exactly the native-rewrite trail and nothing else.
 * Compiled out of release builds: BuildConfig.DEBUG is a compile-time
 * constant, so R8 strips the call sites entirely in a release build.
 */
object NativeDebug {
    const val TAG = "GKNative"

    fun d(message: String) {
        if (BuildConfig.DEBUG) Log.d(TAG, message)
    }

    fun e(message: String, error: Throwable? = null) {
        if (BuildConfig.DEBUG) Log.e(TAG, message, error)
    }
}
