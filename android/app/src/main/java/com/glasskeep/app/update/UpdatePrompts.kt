package com.glasskeep.app.update

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.webkit.WebView
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import com.glasskeep.app.R

/**
 * The self-update as the WebView screen shows it: the update-available
 * notification, and the Settings panel's update card, which the page
 * drives through window.AndroidTheme. Its result launcher is registered
 * when it is constructed, so it is created while the activity is.
 */
class UpdatePrompts(
    private val activity: ComponentActivity,
    private val webViewProvider: () -> WebView,
) {

    // Held while we wait for the POST_NOTIFICATIONS runtime grant on
    // Android 13+. Once the user replies, we re-attempt the notif post
    // for this release (or drop it on the floor if denied).
    private var pendingUpdateRelease: ReleaseInfo? = null
    private val updateNotificationPermissionLauncher = activity.registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        val release = pendingUpdateRelease ?: return@registerForActivityResult
        pendingUpdateRelease = null
        if (granted) UpdateNotifier.show(activity, release)
    }

    /**
     * Fired on the main thread when UpdateManager's background check
     * confirms a newer APK is published. Posts the update-available
     * notification, requesting the POST_NOTIFICATIONS runtime grant
     * first on Android 13+ if needed. If the user denies, the update
     * path stays dormant until they enable notifications themselves.
     */
    fun postUpdateNotification(release: ReleaseInfo) {
        if (activity.isFinishing || activity.isDestroyed) return
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(activity, Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED
        ) {
            pendingUpdateRelease = release
            updateNotificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
            return
        }
        UpdateNotifier.show(activity, release)
    }

    /** Manual "check for updates" hook for the in-app Settings
     *  panel. Bypasses the 12h throttle. Surfaces the outcome
     *  through a Toast + the in-app card (via JS callback), no
     *  system notification, because the user is already looking
     *  at the result in the panel; the heads-up banner would be
     *  redundant clutter. The cold-start auto-check still posts
     *  the notification since the user isn't necessarily in the
     *  Settings panel then. */
    fun checkForUpdate() {
        activity.runOnUiThread {
            Toast.makeText(
                activity,
                R.string.update_checking,
                Toast.LENGTH_SHORT,
            ).show()
            UpdateManager.forceCheck(activity) { release ->
                if (release != null) {
                    notifyJsUpdateAvailable(release)
                } else {
                    Toast.makeText(
                        activity,
                        R.string.update_up_to_date,
                        Toast.LENGTH_LONG,
                    ).show()
                    notifyJsUpToDate()
                }
            }
        }
    }

    /** Open F-Droid on this app's page. The HTTPS URL is claimed
     *  by every F-Droid client variant (vanilla, Basic, Privileged
     *  Extension), so we don't need to second-guess which variant
     *  the user has: the system intent resolver picks it. Only
     *  called from the Settings panel when isFdroidInstall() is
     *  already true, so we're guaranteed at least one F-Droid
     *  client is present. */
    fun openFdroidPage() {
        val url = "https://f-droid.org/packages/${activity.packageName}/"
        activity.runOnUiThread {
            try {
                activity.startActivity(
                    Intent(Intent.ACTION_VIEW).apply {
                        data = Uri.parse(url)
                        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    }
                )
            } catch (e: Exception) {}
        }
    }

    /** Returns the latest detected release as JSON (or null if no
     *  pending update). Called from the Settings panel on open so
     *  the card survives an Activity recreation. The helper auto-
     *  drops stale prefs when the stored release is no longer
     *  strictly newer than the running APK. */
    fun getAvailableUpdate(): String? {
        val release = UpdateManager.getStoredRelease(activity) ?: return null
        return jsonReleaseStr(release.versionName, release.assetName, release.downloadUrl)
    }

    /** Settings card's "Télécharger" action. Triggers the same
     *  download + install pipeline as a notification tap. */
    fun installAvailableUpdate() {
        val release = UpdateManager.getStoredRelease(activity) ?: return
        activity.runOnUiThread {
            Toast.makeText(
                activity,
                R.string.update_downloading,
                Toast.LENGTH_SHORT,
            ).show()
            UpdateManager.downloadAndInstall(
                activity,
                release,
            ) { ok ->
                if (!ok) {
                    Toast.makeText(
                        activity,
                        R.string.update_download_failed,
                        Toast.LENGTH_LONG,
                    ).show()
                }
            }
        }
    }

    /** Push the latest detected release to the SPA so the Settings
     *  panel can render its themed "Version X.Y.Z available" card.
     *  Posted on the WebView's UI thread; harmless if the page hasn't
     *  registered the callback (e.g. the user is still on the
     *  pre-WebView setup flow): evaluateJavascript no-ops in that
     *  case. */
    private fun notifyJsUpdateAvailable(release: ReleaseInfo) {
        val payload = jsonReleaseStr(release.versionName, release.assetName, release.downloadUrl)
        val js = "if (typeof window.__glasskeepUpdateAvailable === 'function') { try { window.__glasskeepUpdateAvailable($payload); } catch (e) {} }"
        val webView = webViewProvider()
        webView.post { webView.evaluateJavascript(js, null) }
    }

    private fun notifyJsUpToDate() {
        val js = "if (typeof window.__glasskeepUpdateUpToDate === 'function') { try { window.__glasskeepUpdateUpToDate(); } catch (e) {} }"
        val webView = webViewProvider()
        webView.post { webView.evaluateJavascript(js, null) }
    }

    /** Tiny manual JSON serialiser: avoids dragging org.json in just
     *  to package three strings, while still escaping the few chars
     *  that would otherwise break out of the JSON literal. */
    private fun jsonReleaseStr(version: String, asset: String, url: String): String {
        fun esc(s: String): String = s
            .replace("\\", "\\\\")
            .replace("\"", "\\\"")
            .replace("\n", "\\n")
            .replace("\r", "\\r")
        return "{\"version\":\"${esc(version)}\",\"assetName\":\"${esc(asset)}\",\"downloadUrl\":\"${esc(url)}\"}"
    }
}
