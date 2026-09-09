package com.glasskeep.app.reminders

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.glasskeep.app.MainActivity
import com.glasskeep.app.R
import com.glasskeep.app.nativeapp.NativeAppActivity

/**
 * Posts a local "reminder due" notification. Mirrors UpdateNotifier: a
 * HIGH-importance channel so it fires as a heads-up banner. Tapping the
 * notification (or its "Open" action) enters through MainActivity, which
 * resolves the configured server and forwards the note id to the native
 * activity. This works for cold starts, warm singleTask delivery, and the
 * signed-out/setup path without ever falling back to the old WebView.
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

        // Tapping the notification — or its explicit "Open" action — enters
        // through MainActivity and reaches NativeAppActivity with the note id.
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
     * MainActivity is the safe target even if setup is currently incomplete:
     * it can obtain a server URL before forwarding this native deep link.
     */
    private fun buildOpenNoteIntent(context: Context, noteId: String): PendingIntent {
        val intent = Intent(context, MainActivity::class.java).apply {
            putExtra(NativeAppActivity.EXTRA_OPEN_NOTE_ID, noteId)
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
