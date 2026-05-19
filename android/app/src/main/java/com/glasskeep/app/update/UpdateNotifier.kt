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

    // v2 channel: bumped to IMPORTANCE_HIGH so the notification fires
    // as a heads-up banner across the top of the screen for a few
    // seconds, not just silently in the shade. Renamed from
    // glasskeep_updates because channel importance can only be lowered
    // by the app after creation — the new ID forces a fresh channel
    // with HIGH importance for users updating from v1.
    private const val CHANNEL_ID = "glasskeep_updates_v2"
    private const val LEGACY_CHANNEL_ID = "glasskeep_updates"
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
                    // Expanded body adds the "remember to update the
                    // server too" reminder — too long for the headline
                    // text but worth surfacing when the user pulls the
                    // notification open.
                    context.getString(R.string.update_notification_bigtext, release.versionName)
                )
            )
            .setContentIntent(pendingIntent)
            .setAutoCancel(true)
            // HIGH priority is what triggers heads-up on pre-O devices
            // (where the channel concept doesn't exist yet). On O+ the
            // channel's IMPORTANCE_HIGH is what carries the heads-up
            // behaviour — both lines together cover every API level.
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_RECOMMENDATION)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setDefaults(NotificationCompat.DEFAULT_ALL)
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
        // Drop the v1 channel left behind by earlier builds — it lived
        // at IMPORTANCE_DEFAULT (no heads-up) and we can't bump
        // existing channels, only delete + recreate.
        try { mgr.deleteNotificationChannel(LEGACY_CHANNEL_ID) } catch (e: Exception) {}
        if (mgr.getNotificationChannel(CHANNEL_ID) != null) return
        val channel = NotificationChannel(
            CHANNEL_ID,
            context.getString(R.string.update_notification_channel),
            NotificationManager.IMPORTANCE_HIGH,
        )
        mgr.createNotificationChannel(channel)
    }
}
