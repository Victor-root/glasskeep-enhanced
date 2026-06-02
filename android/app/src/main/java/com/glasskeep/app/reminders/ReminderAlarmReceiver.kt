package com.glasskeep.app.reminders

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.glasskeep.app.WebViewActivity

/**
 * Fires when an AlarmManager reminder alarm goes off. Shows a local
 * notification — UNLESS the app is currently in the foreground, in which
 * case the in-app (SSE) notification already surfaces it, so we skip the
 * system notification to avoid a visible duplicate. This mirrors the
 * web service-worker de-dup for the installed PWA.
 */
class ReminderAlarmReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != ACTION_FIRE) return
        val noteId = intent.getStringExtra(EXTRA_NOTE_ID) ?: return
        val title = intent.getStringExtra(EXTRA_TITLE) ?: ""
        val body = intent.getStringExtra(EXTRA_BODY) ?: ""

        // The alarm has fired once — drop it from the persisted set so a
        // reboot doesn't resurrect it.
        ReminderScheduler.cancel(context, noteId)

        // App in foreground → the in-app notification already shows it.
        if (WebViewActivity.isForeground) return

        ReminderNotifier.show(context, noteId, title, body)
    }

    companion object {
        const val ACTION_FIRE = "com.glasskeep.app.reminders.ACTION_FIRE"
        const val EXTRA_NOTE_ID = "noteId"
        const val EXTRA_TITLE = "title"
        const val EXTRA_BODY = "body"
    }
}
