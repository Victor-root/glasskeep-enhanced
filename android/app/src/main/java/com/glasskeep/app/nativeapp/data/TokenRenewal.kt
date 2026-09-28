package com.glasskeep.app.nativeapp.data

import com.glasskeep.app.nativeapp.NativeDebug
import com.glasskeep.app.nativeapp.data.network.GlassKeepApi
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.longOrNull

/** App.jsx:191's own threshold: a token younger than this is left alone. */
private const val RenewAfterMs = 24L * 60L * 60L * 1000L

/**
 * Trades an ageing session token for a fresh one, the same way the web
 * does on every load and every window focus (App.jsx:185-205). Without it
 * a token simply dies at its maximum age and signs the user out for no
 * reason they can see.
 *
 * Best-effort in both directions: a token whose age can't be read is
 * renewed anyway (the web's own fallback), and a failed renewal is
 * swallowed, since whatever token is already stored is still valid until
 * it really does expire.
 */
suspend fun renewSessionTokenIfStale(api: GlassKeepApi, tokenStore: TokenStore) {
    val token = tokenStore.token ?: return
    if (!isTokenOlderThan(token, RenewAfterMs)) return
    try {
        val response = api.renewToken()
        val fresh = response.body()?.token
        if (response.isSuccessful && fresh != null) {
            NativeDebug.d("Session token renewed")
            tokenStore.token = fresh
        } else {
            NativeDebug.d("Session token renewal declined: HTTP ${response.code()}")
        }
    } catch (t: Throwable) {
        NativeDebug.e("Session token renewal failed", t)
    }
}

/**
 * Reads the token's `iat` claim. True when the token is older than [ageMs],
 * and true as well whenever the claim can't be read at all: the web renews
 * in that case too rather than risk sitting on a token it can't date.
 */
private fun isTokenOlderThan(token: String, ageMs: Long): Boolean {
    val issuedAtSeconds = (sessionTokenClaims(token)?.get("iat") as? JsonPrimitive)?.longOrNull ?: return true
    return System.currentTimeMillis() - issuedAtSeconds * 1000L >= ageMs
}
