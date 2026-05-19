package com.glasskeep.app.update

import android.content.Context
import android.util.Log
import com.glasskeep.app.BuildConfig
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Orchestrates the in-app self-update flow:
 *   1. Hit GitHub Releases once we know a check is due (≤1× per
 *      CHECK_INTERVAL_MS to avoid hammering the API on every cold
 *      start).
 *   2. If a newer APK is published, stream it into the app's private
 *      cache in the background — the user sees nothing.
 *   3. When the download lands, fire the system installer; Android's
 *      native "Update GlassKeep?" dialog takes over from there.
 *
 * Everything is best-effort: any failure (no network, rate-limited
 * GitHub, install-from-unknown-sources still off, …) is swallowed
 * silently so the WebView launch path is never blocked by the updater.
 */
object UpdateManager {

    private const val TAG = "GK-Updater"
    private const val GITHUB_REPO = "Victor-root/glasskeep-enhanced"
    private const val PREFS = "glasskeep_updater"
    private const val KEY_LAST_CHECK = "lastCheckMs"
    // Twelve hours — short enough that an admin who just pushed a
    // release sees their phone update within the same day, long
    // enough to never hit the GitHub anonymous rate limit (60/h).
    private const val CHECK_INTERVAL_MS = 12L * 60L * 60L * 1000L

    private val running = AtomicBoolean(false)

    /**
     * Fire-and-forget entry point. Safe to call from any Activity's
     * onCreate / onResume — re-entry while a previous check is still
     * running is a no-op, and the throttling SharedPreferences keep us
     * from re-checking on every navigation event.
     */
    fun checkInBackground(context: Context) {
        val appCtx = context.applicationContext
        if (!running.compareAndSet(false, true)) return

        Thread({
            try {
                runOnce(appCtx)
            } catch (t: Throwable) {
                Log.w(TAG, "Update worker crashed: ${t.message}")
            } finally {
                running.set(false)
            }
        }, "GlassKeep-Updater").apply { isDaemon = true }.start()
    }

    private fun runOnce(context: Context) {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val now = System.currentTimeMillis()
        val lastCheck = prefs.getLong(KEY_LAST_CHECK, 0L)
        if (lastCheck > 0 && now - lastCheck < CHECK_INTERVAL_MS) return

        val release = UpdateChecker.checkLatest(GITHUB_REPO, BuildConfig.VERSION_NAME)
        // Record the check timestamp even on null result so a streak
        // of empty responses (no APK asset, network blip) doesn't
        // retry on every single launch.
        prefs.edit().putLong(KEY_LAST_CHECK, now).apply()
        if (release == null) return

        Log.i(TAG, "New version available: ${release.versionName} (have ${BuildConfig.VERSION_NAME})")
        val apk = UpdateDownloader.downloadTo(context, release.downloadUrl, release.assetName)
            ?: return

        if (!UpdateInstaller.canRequestInstalls(context)) {
            // Skip the install intent so we don't pop the settings page
            // out from under whatever the user is doing right now. The
            // APK stays in the cache; next launch (after the user has
            // enabled "Install unknown apps") will pick it back up.
            Log.i(TAG, "Install-from-unknown-sources disabled; APK cached for later")
            return
        }
        UpdateInstaller.install(context, apk)
    }
}
