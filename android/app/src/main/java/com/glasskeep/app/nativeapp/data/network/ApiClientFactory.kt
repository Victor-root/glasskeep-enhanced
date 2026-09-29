package com.glasskeep.app.nativeapp.data.network

import com.glasskeep.app.nativeapp.NativeDebug
import com.glasskeep.app.nativeapp.data.TokenStore
import kotlinx.serialization.json.Json
import okhttp3.Cache
import okhttp3.CacheControl
import okhttp3.Call
import okhttp3.Interceptor
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory
import java.util.concurrent.TimeUnit

/** The header a service method sets on the requests whose 401 refuses the
 *  secret just typed, never the session: the sign-ins and the instance
 *  unlocks, which the web sends with no session at all. [AuthInterceptor]
 *  sends them without the token too, and takes the header off. */
internal const val ANONYMOUS_REQUEST_HEADER = "X-GlassKeep-Anonymous"

/**
 * Attaches `Authorization: Bearer <token>` to every request once the user
 * is signed in, but the [ANONYMOUS_REQUEST_HEADER] ones. ReminderSyncWorker.kt
 * already does the same thing for one endpoint, from a background thread
 * with no WebView involved. This is the same pattern, now used for the
 * whole app.
 */
private class AuthInterceptor(private val tokenStore: TokenStore) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val token = tokenStore.token
        val request = when {
            chain.request().header(ANONYMOUS_REQUEST_HEADER) != null ->
                chain.request().newBuilder().removeHeader(ANONYMOUS_REQUEST_HEADER).build()
            token != null ->
                chain.request().newBuilder()
                    .addHeader("Authorization", "Bearer $token")
                    .build()
            else -> chain.request()
        }
        return chain.proceed(request)
    }
}

/** The header a service method sets on the reads whose answer is kept on
 *  the phone and asked about again each time, whole notes and the logo
 *  among them; [RevalidatingCallFactory] applies it and takes it off. */
internal const val REVALIDATED_REQUEST_HEADER = "X-GlassKeep-Revalidated"

/**
 * What the WebView's browser cache did for the reads [REVALIDATED_REQUEST_HEADER]
 * marks: the answer is kept on disk and, whatever freshness the server or a
 * proxy gives it, the server is asked each time whether it still holds
 * (`If-None-Match`). It answers 304 with no body while nothing changed, so
 * a start with the same notes as the last one downloads none of them.
 * Every other request goes through [plain], which keeps nothing.
 */
internal class RevalidatingCallFactory(private val plain: OkHttpClient, cache: Cache) : Call.Factory {
    private val revalidating = plain.newBuilder().cache(cache).build()

    override fun newCall(request: Request): Call {
        if (request.header(REVALIDATED_REQUEST_HEADER) == null) return plain.newCall(request)
        return revalidating.newCall(
            request.newBuilder()
                .removeHeader(REVALIDATED_REQUEST_HEADER)
                .cacheControl(CacheControl.Builder().maxAge(0, TimeUnit.SECONDS).build())
                .build(),
        )
    }
}

/** The header a service method sets to give its request its own timeout,
 *  in milliseconds; [RequestTimeoutInterceptor] applies it and takes it
 *  off before the request leaves. */
internal const val REQUEST_TIMEOUT_HEADER = "X-GlassKeep-Timeout-Ms"

/**
 * The web's `api(path, { timeoutMs })` for the few requests that wait on
 * something slower than the server itself (an AI provider's first answer):
 * their connect, write and read timeouts become the one they declare.
 */
private class RequestTimeoutInterceptor : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request()
        val timeoutMs = request.header(REQUEST_TIMEOUT_HEADER)?.toIntOrNull() ?: return chain.proceed(request)
        return chain
            .withConnectTimeout(timeoutMs, TimeUnit.MILLISECONDS)
            .withWriteTimeout(timeoutMs, TimeUnit.MILLISECONDS)
            .withReadTimeout(timeoutMs, TimeUnit.MILLISECONDS)
            .proceed(request.newBuilder().removeHeader(REQUEST_TIMEOUT_HEADER).build())
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
 * Notices the 401 the server answers once the session is over: a password
 * changed or reset, the account removed, a token past its age. api.js's own
 * rule: only a request that presented the session says so, and only of the
 * token it presented, which [onSessionExpired] gets.
 */
private class SessionExpiryInterceptor(private val onSessionExpired: (String) -> Unit) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val response = chain.proceed(chain.request())
        if (response.code == HTTP_UNAUTHORIZED) {
            val presented = chain.request().header("Authorization")?.removePrefix("Bearer ")
            NativeDebug.d("HTTP 401 on ${chain.request().url.encodedPath}, session presented=${presented != null}")
            presented?.let(onSessionExpired)
        }
        return response
    }

    private companion object {
        const val HTTP_UNAUTHORIZED = 401
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
    fun okHttpClient(tokenStore: TokenStore, onInstanceLocked: () -> Unit, onSessionExpired: (String) -> Unit): OkHttpClient {
        return OkHttpClient.Builder()
            .addInterceptor(AuthInterceptor(tokenStore))
            .addInterceptor(RequestTimeoutInterceptor())
            .addInterceptor(InstanceLockInterceptor(onInstanceLocked))
            .addInterceptor(SessionExpiryInterceptor(onSessionExpired))
            // A no-op in release, see NetworkLogging.kt's two versions.
            .addNetworkLogging()
            .build()
    }

    fun create(
        baseUrl: String,
        tokenStore: TokenStore,
        cache: Cache,
        onInstanceLocked: () -> Unit,
        onSessionExpired: (String) -> Unit,
    ): GlassKeepApi {
        val normalizedBaseUrl = if (baseUrl.endsWith("/")) baseUrl else "$baseUrl/"
        NativeDebug.d("ApiClientFactory.create baseUrl=$normalizedBaseUrl")

        val contentType = "application/json".toMediaType()
        val retrofit = Retrofit.Builder()
            .baseUrl(normalizedBaseUrl)
            .callFactory(RevalidatingCallFactory(okHttpClient(tokenStore, onInstanceLocked, onSessionExpired), cache))
            .addConverterFactory(json.asConverterFactory(contentType))
            .build()

        return retrofit.create(GlassKeepApi::class.java)
    }
}
