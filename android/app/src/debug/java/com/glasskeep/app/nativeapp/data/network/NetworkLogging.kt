package com.glasskeep.app.nativeapp.data.network

import com.glasskeep.app.nativeapp.NativeDebug
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor

/**
 * The debug build's HTTP log.
 *
 * It lives in this source set, with a do-nothing twin under src/release,
 * because okhttp's logging-interceptor is a `debugImplementation`
 * dependency: naming it from shared code would break the release build
 * outright, and moving the dependency to `implementation` would ship a
 * library the release APK must never use.
 */
internal fun OkHttpClient.Builder.addNetworkLogging(): OkHttpClient.Builder {
    // BASIC only: method, URL, response code and timing. Never HEADERS or
    // BODY, those print the Authorization header (the session token) and,
    // on login, the password itself, straight into Logcat. Never turn
    // this back up.
    val logging = HttpLoggingInterceptor { message -> NativeDebug.d(message) }
    logging.level = HttpLoggingInterceptor.Level.BASIC
    return addInterceptor(logging)
}
