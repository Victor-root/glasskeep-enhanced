package com.glasskeep.app.net

import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/** What the setup screen learns from an address before connecting to it. */
internal enum class ServerCheck { OK, NOT_GLASSKEEP, UNREACHABLE }

/** Asks [baseUrl]'s /api/health whether a GlassKeep server answers there.
 *  Blocking: callers run it off the main thread. */
internal fun checkGlassKeepServer(baseUrl: String): ServerCheck =
    try {
        val conn = URL("$baseUrl/api/health").openConnection() as HttpURLConnection
        conn.connectTimeout = 5000
        conn.readTimeout = 5000
        conn.requestMethod = "GET"
        conn.instanceFollowRedirects = true
        val code = conn.responseCode
        if (code != 200) {
            conn.disconnect()
            ServerCheck.UNREACHABLE
        } else {
            val body = conn.inputStream.bufferedReader().use { it.readText() }
            conn.disconnect()
            val json = JSONObject(body)
            if (json.optString("service") == "glasskeep") ServerCheck.OK
            else ServerCheck.NOT_GLASSKEEP
        }
    } catch (_: Throwable) {
        ServerCheck.UNREACHABLE
    }
