package com.glasskeep.app.update

import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/**
 * Hits the GitHub Releases API for the configured repository, looks at
 * the first APK asset in the latest release, and reports back whether
 * the version baked into that asset's filename differs from what we
 * currently run. Synchronous — callers run us off the main thread.
 *
 * No external HTTP library on purpose: HttpURLConnection + org.json
 * are part of the platform, so we don't drag OkHttp/Retrofit in just
 * to issue one request every twelve hours.
 */
data class ReleaseInfo(
    val versionName: String,    // "1.4.0", parsed out of the asset filename
    val assetName: String,      // "GlassKeep-v1.4.0.apk"
    val downloadUrl: String,    // browser_download_url
    val sizeBytes: Long,        // for log/sanity-check; -1 when missing
)

internal object UpdateChecker {

    // Anything matching GlassKeep-v<version>.apk gets picked. The
    // version sub-group is fed back to the caller verbatim so the
    // comparison stays string-based (no semver assumption — we only
    // ever care "is this string different from BuildConfig.VERSION_NAME").
    private val APK_NAME_REGEX = Regex("^GlassKeep-v(.+)\\.apk$", RegexOption.IGNORE_CASE)

    /**
     * Fetches the latest release for `owner/repo` from GitHub. Returns
     * null when:
     * - the request fails (no network, rate-limited, server 5xx)
     * - the release has no APK asset matching our filename regex
     * - the parsed version equals the currently-installed one
     *
     * `currentVersion` is typically BuildConfig.VERSION_NAME. We trim
     * a leading "v" if either side starts with one so "v1.3.0" and
     * "1.3.0" compare equal.
     */
    fun checkLatest(repo: String, currentVersion: String): ReleaseInfo? {
        val json = fetchJson("https://api.github.com/repos/$repo/releases/latest") ?: return null

        val assets = json.optJSONArray("assets") ?: return null
        for (i in 0 until assets.length()) {
            val asset = assets.optJSONObject(i) ?: continue
            val name = asset.optString("name", "")
            val match = APK_NAME_REGEX.matchEntire(name) ?: continue
            val parsedVersion = match.groupValues[1]
            if (normalise(parsedVersion) == normalise(currentVersion)) {
                // Latest published APK is the one we run — nothing to do.
                return null
            }
            val downloadUrl = asset.optString("browser_download_url", "")
            if (downloadUrl.isEmpty()) continue
            val sizeBytes = asset.optLong("size", -1L)
            return ReleaseInfo(parsedVersion, name, downloadUrl, sizeBytes)
        }
        return null
    }

    private fun normalise(v: String) = v.trim().removePrefix("v").removePrefix("V")

    private fun fetchJson(url: String): JSONObject? {
        var conn: HttpURLConnection? = null
        return try {
            conn = (URL(url).openConnection() as HttpURLConnection).apply {
                requestMethod = "GET"
                // GitHub returns a richer JSON shape on this Accept type
                // and bumps our anonymous rate limit category. Setting a
                // descriptive User-Agent is mandatory — the API refuses
                // unidentified clients with HTTP 403.
                setRequestProperty("Accept", "application/vnd.github+json")
                setRequestProperty("User-Agent", "GlassKeep-Android-Updater")
                connectTimeout = 10_000
                readTimeout = 15_000
            }
            if (conn.responseCode !in 200..299) return null
            val body = conn.inputStream.bufferedReader().use { it.readText() }
            JSONObject(body)
        } catch (e: Exception) {
            null
        } finally {
            conn?.disconnect()
        }
    }
}
