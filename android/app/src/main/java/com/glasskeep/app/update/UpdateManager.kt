package com.glasskeep.app.update

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.util.Log
import com.glasskeep.app.BuildConfig
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Splits the in-app self-update into two distinct, user-mediated steps:
 *
 *   1. [checkInBackground] hits GitHub Releases on a background thread.
 *      When a newer APK is published — and the user hasn't already said
 *      "Plus tard" for that exact version — it invokes the supplied
 *      callback on the main thread so the activity can pop a friendly
 *      "Download update?" dialog. We never start a download until that
 *      consent.
 *
 *   2. [downloadAndInstall] streams the APK into the private cache and
 *      hands it to Android's system installer. The activity wraps it in
 *      a Toast so the silent download doesn't look like the app froze.
 *
 * "Plus tard" is persisted per-version, so we re-prompt the moment a
 * newer release ships but never nag the user about a version they
 * already declined.
 */
object UpdateManager {

    private const val TAG = "GK-Updater"
    private const val GITHUB_REPO = "Victor-root/glasskeep-enhanced"
    private const val PREFS = "glasskeep_updater"
    private const val KEY_LAST_CHECK = "lastCheckMs"
    private const val KEY_SKIPPED_VERSION = "skippedVersion"
    // Twelve hours — short enough that an admin who just pushed a
    // release sees their phone prompt within the same day, long enough
    // to never hit GitHub's anonymous rate limit (60 req/h).
    private const val CHECK_INTERVAL_MS = 12L * 60L * 60L * 1000L

    private val checking = AtomicBoolean(false)
    private val downloading = AtomicBoolean(false)

    /**
     * Background check. The [onAvailable] callback fires on the main
     * thread when a newer, non-skipped release is found; otherwise we
     * fail silently. Safe to call from every Activity onCreate — the
     * AtomicBoolean keeps duplicate calls from launching parallel
     * checks and SharedPreferences throttles repeat HTTP calls.
     */
    fun checkInBackground(context: Context, onAvailable: (ReleaseInfo) -> Unit) {
        Log.i(TAG, "checkInBackground() — running version ${BuildConfig.VERSION_NAME}")
        val appCtx = context.applicationContext
        if (!checking.compareAndSet(false, true)) {
            Log.i(TAG, "skip — another check already running")
            return
        }
        val mainHandler = Handler(Looper.getMainLooper())

        Thread({
            try {
                val release = doCheck(appCtx) ?: return@Thread
                Log.i(TAG, "newer APK detected: ${release.assetName}")
                mainHandler.post { onAvailable(release) }
            } catch (t: Throwable) {
                Log.w(TAG, "check crashed: ${t.message}", t)
            } finally {
                checking.set(false)
            }
        }, "GlassKeep-UpdateCheck").apply { isDaemon = true }.start()
    }

    /**
     * Download + install starting point — invoked from the activity's
     * dialog "Download" button. [onResult] fires on the main thread
     * with `true` if the system install intent was launched, `false`
     * on any earlier failure (network, missing install permission,
     * file-provider hiccup). The activity is expected to surface that
     * outcome to the user.
     */
    fun downloadAndInstall(
        context: Context,
        release: ReleaseInfo,
        onResult: (Boolean) -> Unit,
    ) {
        val appCtx = context.applicationContext
        if (!downloading.compareAndSet(false, true)) {
            // A previous "Download" tap is still in flight — ignore so
            // we don't fire two parallel downloads of the same APK.
            onResult(false)
            return
        }
        val mainHandler = Handler(Looper.getMainLooper())

        Thread({
            var ok = false
            try {
                if (!UpdateInstaller.canRequestInstalls(appCtx)) {
                    // Don't burn bandwidth on a download we can't
                    // install: jump the user straight to the per-app
                    // toggle. Next launch's check will re-pop the
                    // dialog and they can try again.
                    Log.i(TAG, "install-from-unknown-sources off → opening settings")
                    UpdateInstaller.openInstallPermissionSettings(appCtx)
                    return@Thread
                }

                val apk = UpdateDownloader.downloadTo(appCtx, release.downloadUrl, release.assetName)
                if (apk == null) {
                    Log.w(TAG, "download failed")
                    return@Thread
                }
                Log.i(TAG, "downloaded to ${apk.absolutePath} (${apk.length()} bytes)")
                ok = UpdateInstaller.install(appCtx, apk)
                Log.i(TAG, "install intent launched=$ok")
            } catch (t: Throwable) {
                Log.w(TAG, "downloadAndInstall crashed: ${t.message}", t)
            } finally {
                downloading.set(false)
                mainHandler.post { onResult(ok) }
            }
        }, "GlassKeep-UpdateDownload").apply { isDaemon = true }.start()
    }

    /** Persist "user declined this version" so we don't re-prompt. */
    fun skipVersion(context: Context, versionName: String) {
        context.applicationContext
            .getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putString(KEY_SKIPPED_VERSION, versionName)
            .apply()
        Log.i(TAG, "skipped version $versionName for future checks")
    }

    /**
     * Synchronous "should we ask the user about an update?" probe.
     * Runs the network call and version comparison; everything past
     * here is UI. Returns null on throttle hit, network error, no APK
     * asset, version match, or user-skipped version.
     */
    private fun doCheck(context: Context): ReleaseInfo? {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val now = System.currentTimeMillis()
        val lastCheck = prefs.getLong(KEY_LAST_CHECK, 0L)
        if (lastCheck > 0 && now - lastCheck < CHECK_INTERVAL_MS) {
            Log.i(TAG, "throttled — last check ${now - lastCheck}ms ago")
            return null
        }

        val release = UpdateChecker.checkLatest(GITHUB_REPO, BuildConfig.VERSION_NAME)
        // Stamp the check timestamp even on null result so a streak of
        // empty responses (no APK asset, network blip) doesn't retry
        // every single launch.
        prefs.edit().putLong(KEY_LAST_CHECK, now).apply()
        if (release == null) {
            Log.i(TAG, "no newer APK published (or check failed)")
            return null
        }

        val skipped = prefs.getString(KEY_SKIPPED_VERSION, null)
        if (skipped != null && skipped == release.versionName) {
            Log.i(TAG, "user previously skipped version ${release.versionName}")
            return null
        }
        return release
    }
}
