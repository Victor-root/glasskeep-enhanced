package com.glasskeep.app.reminders

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.glasskeep.app.BuildConfig
import com.glasskeep.app.R
import com.glasskeep.app.WebViewActivity
import com.glasskeep.app.nativeapp.NativeAppActivity

/**
 * Posts a local "reminder due" notification. Mirrors UpdateNotifier: a
 * HIGH-importance channel so it fires as a heads-up banner. Tapping the
 * notification (or its "Open" action) deep-links straight to the note: on
 * a release build it hands WebViewActivity the note id, which the web app
 * opens via its window.__glasskeepOpenNote hook; on a debug build (see
 * MainActivity.launchApp) it instead hands NativeAppActivity the note id,
 * which NativeNavHost opens directly (see buildOpenNoteIntent).
 *
 * This is a LOCAL notification raised by ReminderAlarmReceiver when an
 * AlarmManager alarm fires — no server push / Firebase involved, so it
 * works fully offline and even when the app was closed. (Web Push is not
 * available in an Android WebView, which is why reminders use a local
 * scheduled alarm here instead.)
 */
internal object ReminderNotifier {
    private const val CHANNEL_ID = "glasskeep_reminders"

    fun show(context: Context, noteId: String, title: String, body: String) {
        val mgr = NotificationManagerCompat.from(context)
        if (!mgr.areNotificationsEnabled()) {
            android.util.Log.w("GKReminders", "notifier: notifications DISABLED — cannot post (note=$noteId)")
            return
        }
        ensureChannel(context)
        android.util.Log.i("GKReminders", "notifier: posting notification (note=$noteId)")

        // Tapping the notification — or its explicit "Open" action — deep-links
        // to the note: WebViewActivity gets the note id and the web app pops the
        // modal via window.__glasskeepOpenNote once the page is ready. (It's
        // singleTask, so an already-open app receives the id through onNewIntent
        // rather than a cold relaunch.)
        val pendingIntent = buildOpenNoteIntent(context, noteId)

        val builder = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(if (title.isBlank()) context.getString(R.string.reminder_notification_channel) else title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_REMINDER)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setDefaults(NotificationCompat.DEFAULT_ALL)
            .setContentIntent(pendingIntent)
            // Mirror the in-app card's "Open" button. Icon 0: action icons
            // aren't rendered in the standard template on Android 7+.
            .addAction(0, context.getString(R.string.reminder_open_action), pendingIntent)

        try {
            // Stable per-note id so re-firing the same note replaces its row
            // instead of stacking duplicates.
            mgr.notify(noteId.hashCode(), builder.build())
            android.util.Log.i("GKReminders", "notifier: notify() OK (note=$noteId)")
        } catch (e: SecurityException) {
            // Notifications revoked between the enabled-check and notify().
            android.util.Log.w("GKReminders", "notifier: SecurityException posting (note=$noteId)", e)
        }
    }

    /**
     * PendingIntent that re-opens the app on the given note. Debug builds
     * (see MainActivity.launchApp) deep-link into NativeAppActivity
     * instead of WebViewActivity, since that's the flow actually running
     * there; release builds are unchanged. Carries the note id as each
     * Activity's own EXTRA_OPEN_NOTE_ID.
     */
    private fun buildOpenNoteIntent(context: Context, noteId: String): PendingIntent {
        val nativeIntent = if (BuildConfig.DEBUG) {
            resolveNativeServerUrl(context)?.let { url ->
                Intent(context, NativeAppActivity::class.java).apply {
                    putExtra(NativeAppActivity.EXTRA_SERVER_URL, url)
                    putExtra(NativeAppActivity.EXTRA_OPEN_NOTE_ID, noteId)
                }
            }
        } else {
            null
        }
        // NativeAppActivity requires EXTRA_SERVER_URL (see its onCreate) and
        // has no fallback if one can't be resolved (e.g. no session was ever
        // established on this device), so this falls back to the same
        // WebView target release builds always use rather than risk a crash.
        val intent = nativeIntent ?: Intent(context, WebViewActivity::class.java).apply {
            putExtra(WebViewActivity.EXTRA_OPEN_NOTE_ID, noteId)
        }
        intent.addFlags(
            Intent.FLAG_ACTIVITY_NEW_TASK or
                Intent.FLAG_ACTIVITY_SINGLE_TOP or
                Intent.FLAG_ACTIVITY_CLEAR_TOP,
        )
        return PendingIntent.getActivity(
            context,
            noteId.hashCode(),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    }

    /** Best-effort server URL for the debug deep-link target, tried in the
     *  same order ReminderSyncWorker resolves its own session: the
     *  WebView-era shared prefs first, then native's own encrypted session
     *  store, read only (never written here, see TokenStore's own doc
     *  comment on why native and the WebView-era prefs must not cross-write).
     *  Null when neither has one, e.g. no session was ever established. */
    private fun resolveNativeServerUrl(context: Context): String? {
        val legacy = context.getSharedPreferences("glasskeep", Context.MODE_PRIVATE)
            .getString("server_url", null)?.trimEnd('/')
        if (!legacy.isNullOrBlank()) return legacy
        return try {
            com.glasskeep.app.nativeapp.data.TokenStore(context).serverUrl?.trimEnd('/')?.ifBlank { null }
        } catch (t: Throwable) {
            null
        }
    }

    private fun ensureChannel(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val mgr = context.getSystemService(NotificationManager::class.java) ?: return
        if (mgr.getNotificationChannel(CHANNEL_ID) != null) return
        val channel = NotificationChannel(
            CHANNEL_ID,
            context.getString(R.string.reminder_notification_channel),
            NotificationManager.IMPORTANCE_HIGH,
        )
        mgr.createNotificationChannel(channel)
    }
}
