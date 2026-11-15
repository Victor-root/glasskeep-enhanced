package com.glasskeep.app.net

import android.content.Context
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.security.cert.X509Certificate
import javax.net.ssl.SSLHandshakeException
import javax.net.ssl.SSLPeerUnverifiedException

/** What the setup screen learns from an address before connecting to it. */
internal sealed interface ServerCheck {
    data object Ok : ServerCheck
    data object NotGlassKeep : ServerCheck
    data object Unreachable : ServerCheck

    /** The server answers with a certificate Android does not trust. */
    data class UntrustedCertificate(val certificate: X509Certificate) : ServerCheck
}

/** Asks [baseUrl]'s /api/health whether a GlassKeep server answers there.
 *  Blocking: callers run it off the main thread. */
internal fun checkGlassKeepServer(context: Context, baseUrl: String): ServerCheck =
    try {
        val conn = URL("$baseUrl/api/health").openConnection() as HttpURLConnection
        TrustedCertificate.applyTo(context, conn)
        conn.connectTimeout = 5000
        conn.readTimeout = 5000
        conn.requestMethod = "GET"
        conn.instanceFollowRedirects = true
        val code = conn.responseCode
        if (code != 200) {
            conn.disconnect()
            ServerCheck.Unreachable
        } else {
            val body = conn.inputStream.bufferedReader().use { it.readText() }
            conn.disconnect()
            val json = JSONObject(body)
            if (json.optString("service") == "glasskeep") ServerCheck.Ok
            else ServerCheck.NotGlassKeep
        }
    } catch (_: SSLHandshakeException) {
        untrusted(baseUrl)
    } catch (_: SSLPeerUnverifiedException) {
        untrusted(baseUrl)
    } catch (_: Throwable) {
        ServerCheck.Unreachable
    }

private fun untrusted(baseUrl: String): ServerCheck =
    TrustedCertificate.presentedBy(baseUrl)?.let { ServerCheck.UntrustedCertificate(it) } ?: ServerCheck.Unreachable
