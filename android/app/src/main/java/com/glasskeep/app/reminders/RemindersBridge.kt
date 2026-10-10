package com.glasskeep.app.reminders

import android.Manifest
import android.content.pm.PackageManager
import android.webkit.JavascriptInterface
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat

/**
 * window.AndroidReminders: local reminder scheduling for the WebView
 * (Web Push is unavailable here). Methods run on a binder thread;
 * AlarmManager + SharedPreferences are thread-safe, but any UI work
 * (permission prompt) is marshalled back to the main thread. Its result
 * launcher is registered when it is constructed, so it is created while
 * the activity is.
 */
class RemindersBridge(private val activity: ComponentActivity) {

    // POST_NOTIFICATIONS grant for reminder alarms. Requested once (per
    // session) the first time the web app schedules a reminder; the grant
    // persists, so later reminder notifications just work.
    private var reminderPermissionAsked = false
    private val reminderNotificationPermissionLauncher = activity.registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { /* grant persists; nothing to retry here */ }

    @JavascriptInterface
    fun isSupported(): Boolean = true

    @JavascriptInterface
    fun schedule(noteId: String?, triggerAtMillis: String?, title: String?, body: String?) {
        val id = noteId ?: return
        val at = triggerAtMillis?.toLongOrNull() ?: return
        ReminderScheduler.schedule(
            activity.applicationContext, id, at, title ?: "", body ?: "",
        )
        activity.runOnUiThread { ensureReminderNotificationPermission() }
    }

    @JavascriptInterface
    fun cancel(noteId: String?) {
        val id = noteId ?: return
        ReminderScheduler.cancel(activity.applicationContext, id)
    }

    @JavascriptInterface
    fun syncAll(json: String?) {
        val raw = json ?: return
        val items = try {
            ReminderScheduler.parseItems(org.json.JSONArray(raw))
        } catch (e: Exception) {
            return
        }
        ReminderScheduler.syncAll(activity.applicationContext, items)
        if (items.isNotEmpty()) activity.runOnUiThread { ensureReminderNotificationPermission() }
    }

    /**
     * Hand the current auth token to native so the background sync
     * (ReminderSyncWorker) can poll the server while the app is closed.
     * Empty string on sign-out. Stored in SharedPreferences; the worker
     * reads it alongside server_url.
     */
    @JavascriptInterface
    fun setAuth(token: String?) {
        ReminderSyncWorker.setAuthToken(activity.applicationContext, token ?: "")
    }

    /**
     * Post a reminder's system notification immediately. Called from the
     * web app's SSE handler when a reminder arrives while the app is
     * BACKGROUNDED (not foreground): the in-app card would be invisible,
     * so we surface a real system notification instead, driven by the live
     * SSE connection (no push service / no Google needed). Foreground stays
     * in-app only. Uses the same note id as the local-alarm path, so the
     * two collapse into one if both ever fire.
     */
    @JavascriptInterface
    fun notifyNow(noteId: String?, title: String?, body: String?) {
        val id = noteId ?: return
        if (id.isBlank()) return
        ReminderNotifier.show(
            activity.applicationContext, id, title ?: "", body ?: "",
        )
    }

    // Ensure the POST_NOTIFICATIONS grant (Android 13+) so a fired reminder
    // can actually post its notification. Asked at most once per session.
    private fun ensureReminderNotificationPermission() {
        if (activity.isFinishing || activity.isDestroyed || reminderPermissionAsked) return
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(activity, Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED
        ) {
            reminderPermissionAsked = true
            try {
                reminderNotificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
            } catch (e: Exception) {
                // launcher unavailable (activity tearing down): ignore
            }
        }
    }
}
