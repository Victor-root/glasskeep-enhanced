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
    // TEMP — throttle disabled while we debug the test flow. Restore to
    // 12L * 60L * 60L * 1000L once the update path is confirmed working.
    private const val CHECK_INTERVAL_MS = 0L

    private val running = AtomicBoolean(false)

    /**
     * Fire-and-forget entry point. Safe to call from any Activity's
     * onCreate / onResume — re-entry while a previous check is still
     * running is a no-op, and the throttling SharedPreferences keep us
     * from re-checking on every navigation event.
     */
    fun checkInBackground(context: Context) {
        Log.i(TAG, "checkInBackground() called — current version=${BuildConfig.VERSION_NAME}")
        val appCtx = context.applicationContext
        if (!running.compareAndSet(false, true)) {
            Log.i(TAG, "skip — another check already running")
            return
        }

        Thread({
            Log.i(TAG, "worker thread started")
            try {
                runOnce(appCtx)
            } catch (t: Throwable) {
                Log.w(TAG, "Update worker crashed: ${t.message}", t)
            } finally {
                running.set(false)
                Log.i(TAG, "worker thread finished")
            }
        }, "GlassKeep-Updater").apply { isDaemon = true }.start()
    }

    private fun runOnce(context: Context) {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val now = System.currentTimeMillis()
        val lastCheck = prefs.getLong(KEY_LAST_CHECK, 0L)
        Log.i(TAG, "runOnce — lastCheck=$lastCheck now=$now intervalMs=$CHECK_INTERVAL_MS")
        if (lastCheck > 0 && now - lastCheck < CHECK_INTERVAL_MS) {
            Log.i(TAG, "throttled — last check ${now - lastCheck}ms ago")
            return
        }

        Log.i(TAG, "hitting GitHub for $GITHUB_REPO …")
        val release = UpdateChecker.checkLatest(GITHUB_REPO, BuildConfig.VERSION_NAME)
        prefs.edit().putLong(KEY_LAST_CHECK, now).apply()
        if (release == null) {
            Log.i(TAG, "no newer APK published (or check failed)")
            return
        }

        Log.i(TAG, "newer APK detected: ${release.assetName} → ${release.downloadUrl}")
        val apk = UpdateDownloader.downloadTo(context, release.downloadUrl, release.assetName)
        if (apk == null) {
            Log.w(TAG, "download failed")
            return
        }
        Log.i(TAG, "downloaded to ${apk.absolutePath} (${apk.length()} bytes)")

        if (!UpdateInstaller.canRequestInstalls(context)) {
            Log.i(TAG, "install-from-unknown-sources disabled; APK cached for later")
            UpdateInstaller.openInstallPermissionSettings(context)
            return
        }
        val launched = UpdateInstaller.install(context, apk)
        Log.i(TAG, "install intent launched=$launched")
    }
}
