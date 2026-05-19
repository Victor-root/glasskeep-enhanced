package com.glasskeep.app.update

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.glasskeep.app.R

/**
 * Posts the lightweight "GlassKeep X.Y.Z available — tap to install"
 * notification. Tapping fires UpdateActionReceiver, which starts the
 * silent background download and hands the APK to Android's system
 * installer. Swiping the notification away is a no-op (no permanent
 * skip) — the next check past the 12h throttle re-posts it.
 *
 * Caller is responsible for the POST_NOTIFICATIONS runtime grant on
 * Android 13+; we simply no-op if NotificationManagerCompat reports
 * notifications disabled.
 */
internal object UpdateNotifier {

    private const val CHANNEL_ID = "glasskeep_updates"
    // Fixed ID so a re-issued notification (e.g. user dismissed, app
    // re-checked) updates the existing notification instead of stacking
    // multiple "update available" rows in the shade.
    private const val NOTIFICATION_ID = 4242

    fun show(context: Context, release: ReleaseInfo) {
        val mgr = NotificationManagerCompat.from(context)
        if (!mgr.areNotificationsEnabled()) return
        ensureChannel(context)

        val tapIntent = Intent(context, UpdateActionReceiver::class.java).apply {
            action = UpdateActionReceiver.ACTION_DOWNLOAD
            putExtra(UpdateActionReceiver.EXTRA_VERSION, release.versionName)
            putExtra(UpdateActionReceiver.EXTRA_ASSET, release.assetName)
            putExtra(UpdateActionReceiver.EXTRA_URL, release.downloadUrl)
        }
        // FLAG_IMMUTABLE required on Android 12+; FLAG_UPDATE_CURRENT
        // so a re-posted notification picks up the latest extras (e.g.
        // a newer release shipping while the old one was still in the
        // tray).
        val pendingIntent = PendingIntent.getBroadcast(
            context,
            release.versionName.hashCode(),
            tapIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        val notification = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(context.getString(R.string.update_notification_title))
            .setContentText(context.getString(R.string.update_notification_text, release.versionName))
            .setStyle(
                NotificationCompat.BigTextStyle().bigText(
                    context.getString(R.string.update_notification_text, release.versionName)
                )
            )
            .setContentIntent(pendingIntent)
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .build()

        try {
            mgr.notify(NOTIFICATION_ID, notification)
        } catch (e: SecurityException) {
            // Android 13+: notifications denied between our enabled-check
            // and the notify() call. Swallow — the update path is dormant.
        }
    }

    private fun ensureChannel(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val mgr = context.getSystemService(NotificationManager::class.java) ?: return
        if (mgr.getNotificationChannel(CHANNEL_ID) != null) return
        val channel = NotificationChannel(
            CHANNEL_ID,
            context.getString(R.string.update_notification_channel),
            NotificationManager.IMPORTANCE_DEFAULT,
        )
        mgr.createNotificationChannel(channel)
    }
}
