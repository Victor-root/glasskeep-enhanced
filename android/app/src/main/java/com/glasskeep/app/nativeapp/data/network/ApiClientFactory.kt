package com.glasskeep.app.nativeapp.data.network

import com.glasskeep.app.nativeapp.NativeDebug
import com.glasskeep.app.nativeapp.data.TokenStore
import kotlinx.serialization.json.Json
import okhttp3.Interceptor
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Response
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory

/**
 * Attaches `Authorization: Bearer <token>` to every request once the user
 * is signed in. ReminderSyncWorker.kt already does the same thing for one
 * endpoint, from a background thread with no WebView involved. This is
 * the same pattern, now used for the whole app.
 */
private class AuthInterceptor(private val tokenStore: TokenStore) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val token = tokenStore.token
        val request = if (token != null) {
            chain.request().newBuilder()
                .addHeader("Authorization", "Bearer $token")
                .build()
        } else {
            chain.request()
        }
        return chain.proceed(request)
    }
}

/**
 * Notices the HTTP 423 a locked server answers with on every route but its
 * own small allowlist (server/index.js's LOCK_ALLOW_PATHS), so any call at
 * all is enough to drop the app to the unlock screen. Exactly what the
 * web's api.js does with the same status, and the reason its own comment
 * gives for it: the status poll would find out too, but up to 30 seconds
 * later.
 */
private class InstanceLockInterceptor(private val onInstanceLocked: () -> Unit) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val response = chain.proceed(chain.request())
        if (response.code == HTTP_LOCKED) {
            NativeDebug.d("HTTP 423 on ${chain.request().url.encodedPath}: instance is locked")
            onInstanceLocked()
        }
        return response
    }

    private companion object {
        const val HTTP_LOCKED = 423
    }
}

/**
 * Builds a Retrofit client for one server. The native rewrite lets the
 * user point at any self-hosted GlassKeep server, same as the WebView
 * setup screen, so this is built fresh per server URL rather than kept as
 * a single app-wide singleton.
 */
object ApiClientFactory {
    private val json = Json {
        ignoreUnknownKeys = true
        coerceInputValues = true
    }

    /** Shared by create() below (wrapped in Retrofit) and RealtimeClient
     *  (used directly against a raw okhttp3.Request, for the long-lived
     *  SSE stream Retrofit's @GET/suspend-fun interface pattern can't
     *  model) - kept in one place so the two never drift apart on
     *  auth/logging setup. */
    fun okHttpClient(tokenStore: TokenStore, onInstanceLocked: () -> Unit): OkHttpClient {
        return OkHttpClient.Builder()
            .addInterceptor(AuthInterceptor(tokenStore))
            .addInterceptor(InstanceLockInterceptor(onInstanceLocked))
            // A no-op in release, see NetworkLogging.kt's two versions.
            .addNetworkLogging()
            .build()
    }

    fun create(baseUrl: String, tokenStore: TokenStore, onInstanceLocked: () -> Unit): GlassKeepApi {
        val normalizedBaseUrl = if (baseUrl.endsWith("/")) baseUrl else "$baseUrl/"
        NativeDebug.d("ApiClientFactory.create baseUrl=$normalizedBaseUrl")

        val contentType = "application/json".toMediaType()
        val retrofit = Retrofit.Builder()
            .baseUrl(normalizedBaseUrl)
            .client(okHttpClient(tokenStore, onInstanceLocked))
            .addConverterFactory(json.asConverterFactory(contentType))
            .build()

        return retrofit.create(GlassKeepApi::class.java)
    }
}
