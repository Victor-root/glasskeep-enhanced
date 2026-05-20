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
    internal const val PREFS = "glasskeep_updater"
    private const val KEY_LAST_CHECK = "lastCheckMs"
    // Last successful check result, mirrored so the Settings panel
    // can render its "Version X.Y.Z available" card across launches
    // (the in-memory state would be lost the moment WebViewActivity
    // is recreated).
    internal const val KEY_AVAILABLE_VERSION = "availableVersion"
    internal const val KEY_AVAILABLE_ASSET = "availableAsset"
    internal const val KEY_AVAILABLE_URL = "availableUrl"
    // Twelve hours — short enough that an admin who just pushed a
    // release sees their phone notification within the same day, long
    // enough to never hit GitHub's anonymous rate limit (60 req/h).
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
                val apk = UpdateDownloader.downloadTo(appCtx, release.downloadUrl, release.assetName)
                if (apk == null) {
                    Log.w(TAG, "download failed")
                    return@Thread
                }
                Log.i(TAG, "downloaded to ${apk.absolutePath} (${apk.length()} bytes)")
                // Fire the install intent regardless of the current
                // "install unknown apps" toggle state. On Android 8+
                // the system handles the missing-permission case
                // inline: it opens the toggle page, and the moment
                // the user enables it the install dialog pops by
                // itself — no need to back-out + re-trigger from us.
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

    /**
     * Manual "check now" hook — used by the in-app Settings entry so
     * users who dismissed a previous install dialog (or who never
     * granted notification permission) can re-trigger the flow. Skips
     * the 12h throttle, reports both outcomes back via [onResult] on
     * the main thread.
     */
    fun forceCheck(context: Context, onResult: (ReleaseInfo?) -> Unit) {
        val appCtx = context.applicationContext
        if (!checking.compareAndSet(false, true)) {
            // An automatic check is mid-flight; let it finish.
            onResult(null)
            return
        }
        val mainHandler = Handler(Looper.getMainLooper())

        Thread({
            var result: ReleaseInfo? = null
            try {
                result = UpdateChecker.checkLatest(GITHUB_REPO, BuildConfig.VERSION_NAME)
                // Stamp the timestamp so a follow-up automatic check
                // still respects the throttle, and mirror the result
                // into the "available release" prefs so the Settings
                // card can survive an Activity recreation.
                appCtx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                    .edit()
                    .putLong(KEY_LAST_CHECK, System.currentTimeMillis())
                    .apply()
                storeAvailableRelease(appCtx, result)
                Log.i(TAG, "force check: ${result?.assetName ?: "already up to date"}")
            } catch (t: Throwable) {
                Log.w(TAG, "force check crashed: ${t.message}", t)
            } finally {
                checking.set(false)
                val r = result
                mainHandler.post { onResult(r) }
            }
        }, "GlassKeep-UpdateForce").apply { isDaemon = true }.start()
    }

    /** Drop the "available release" prefs — called from the Settings
     *  card's "Plus tard" / dismiss action. */
    fun clearAvailableRelease(context: Context) {
        storeAvailableRelease(context.applicationContext, null)
    }

    /**
     * Read the persisted "available release" back, BUT only return it
     * if it's still strictly newer than the currently-installed APK.
     * Cleans up stale prefs otherwise — covers the case where the user
     * built and installed a fresher version through Android Studio
     * (or a sideloaded APK) without going through the in-app updater,
     * so the SharedPreferences still claim the now-old release is
     * "available".
     */
    fun getStoredRelease(context: Context): ReleaseInfo? {
        val appCtx = context.applicationContext
        val prefs = appCtx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val version = prefs.getString(KEY_AVAILABLE_VERSION, null) ?: return null
        val asset = prefs.getString(KEY_AVAILABLE_ASSET, null) ?: return null
        val url = prefs.getString(KEY_AVAILABLE_URL, null) ?: return null
        if (!UpdateChecker.isStrictlyNewer(version, BuildConfig.VERSION_NAME)) {
            storeAvailableRelease(appCtx, null)
            return null
        }
        return ReleaseInfo(version, asset, url, -1L)
    }

    /** Mirrors the last-detected release into SharedPreferences so the
     *  Settings panel can read it back the next time it opens. Passing
     *  null clears the slot — used when an actual check ran and came
     *  back "already on the latest version" (auto-cleanup of stale
     *  state after an install). */
    private fun storeAvailableRelease(context: Context, release: ReleaseInfo?) {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val editor = prefs.edit()
        if (release == null) {
            editor
                .remove(KEY_AVAILABLE_VERSION)
                .remove(KEY_AVAILABLE_ASSET)
                .remove(KEY_AVAILABLE_URL)
        } else {
            editor
                .putString(KEY_AVAILABLE_VERSION, release.versionName)
                .putString(KEY_AVAILABLE_ASSET, release.assetName)
                .putString(KEY_AVAILABLE_URL, release.downloadUrl)
        }
        editor.apply()
    }

    /**
     * Synchronous "is there a newer APK we should notify about?"
     * probe. Runs the network call and version comparison; everything
     * past here is UI. Returns null on throttle hit, network error,
     * no APK asset, or version match.
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
        // every single launch. Mirror the outcome into the available-
        // release prefs so the Settings card stays in sync with the
        // latest network state.
        prefs.edit().putLong(KEY_LAST_CHECK, now).apply()
        storeAvailableRelease(context, release)
        if (release == null) {
            Log.i(TAG, "no newer APK published (or check failed)")
            return null
        }
        return release
    }
}
