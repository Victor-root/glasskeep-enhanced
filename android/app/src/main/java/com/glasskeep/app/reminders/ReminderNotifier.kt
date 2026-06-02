package com.glasskeep.app.reminders

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.glasskeep.app.R

/**
 * Posts a local "reminder due" notification. Mirrors UpdateNotifier: a
 * HIGH-importance channel so it fires as a heads-up banner. Tapping opens
 * the app (the reminder also surfaces in the in-app notification list).
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
        if (!mgr.areNotificationsEnabled()) return
        ensureChannel(context)

        // Tapping opens the app's launcher (MainActivity → WebViewActivity);
        // the specific note then surfaces via the in-app notification list
        // once the web app loads and fetches pending notifications.
        val launch = context.packageManager.getLaunchIntentForPackage(context.packageName)
        val pendingIntent = if (launch != null) {
            PendingIntent.getActivity(
                context,
                noteId.hashCode(),
                launch,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )
        } else {
            null
        }

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
        if (pendingIntent != null) builder.setContentIntent(pendingIntent)

        try {
            // Stable per-note id so re-firing the same note replaces its row
            // instead of stacking duplicates.
            mgr.notify(noteId.hashCode(), builder.build())
        } catch (e: SecurityException) {
            // Notifications revoked between the enabled-check and notify().
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
