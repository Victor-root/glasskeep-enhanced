package com.glasskeep.app.reminders

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import org.json.JSONObject

/**
 * Schedules exact local alarms for note reminders via AlarmManager, so a
 * reminder fires (as a local notification) even when the app is closed —
 * no Web Push / Firebase needed. The schedule is mirrored in
 * SharedPreferences so ReminderBootReceiver can re-arm everything after a
 * reboot (alarms are cleared on reboot otherwise).
 *
 * Driven from the web app over the `AndroidReminders` JS bridge:
 *   - schedule / cancel when the user sets or clears a reminder;
 *   - syncAll on app load, to reconcile against the server's canonical set
 *     (covers reminders created on other devices and re-arming after boot).
 */
object ReminderScheduler {
    private const val PREFS = "glasskeep_reminders"

    data class ReminderItem(
        val noteId: String,
        val triggerAtMillis: Long,
        val title: String,
        val body: String,
    )

    private fun alarmManager(ctx: Context): AlarmManager =
        ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager

    private fun buildPendingIntent(ctx: Context, noteId: String, title: String, body: String): PendingIntent {
        val intent = Intent(ctx, ReminderAlarmReceiver::class.java).apply {
            action = ReminderAlarmReceiver.ACTION_FIRE
            putExtra(ReminderAlarmReceiver.EXTRA_NOTE_ID, noteId)
            putExtra(ReminderAlarmReceiver.EXTRA_TITLE, title)
            putExtra(ReminderAlarmReceiver.EXTRA_BODY, body)
        }
        return PendingIntent.getBroadcast(
            ctx,
            noteId.hashCode(),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    }

    fun schedule(ctx: Context, noteId: String, triggerAtMillis: Long, title: String, body: String) {
        if (noteId.isBlank()) return
        // A past/now time fires almost immediately so it isn't silently lost.
        val now = System.currentTimeMillis()
        val at = if (triggerAtMillis < now) now + 1000 else triggerAtMillis
        val am = alarmManager(ctx)
        val pi = buildPendingIntent(ctx, noteId, title, body)
        // Exact alarms need a grant on Android 12+; fall back to the inexact
        // (but still doze-friendly) variant when it isn't available.
        val canExact = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            am.canScheduleExactAlarms()
        } else {
            true
        }
        try {
            if (canExact) {
                am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi)
            } else {
                am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi)
            }
        } catch (e: SecurityException) {
            am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi)
        }
        persist(ctx, noteId, triggerAtMillis, title, body)
    }

    fun cancel(ctx: Context, noteId: String) {
        if (noteId.isBlank()) return
        try {
            alarmManager(ctx).cancel(buildPendingIntent(ctx, noteId, "", ""))
        } catch (e: Exception) {
            // ignore — nothing scheduled
        }
        unpersist(ctx, noteId)
    }

    /** Reconcile the full set: cancel anything not present, (re)schedule all given. */
    fun syncAll(ctx: Context, items: List<ReminderItem>) {
        val keep = items.map { it.noteId }.toSet()
        val prefs = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        for (key in prefs.all.keys.toList()) {
            if (key !in keep) cancel(ctx, key)
        }
        for (item in items) {
            schedule(ctx, item.noteId, item.triggerAtMillis, item.title, item.body)
        }
    }

    /** Re-arm persisted alarms (used after a reboot). Past ones are dropped. */
    fun rescheduleAll(ctx: Context) {
        val prefs = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val now = System.currentTimeMillis()
        for ((noteId, raw) in prefs.all.toMap()) {
            try {
                val o = JSONObject(raw as String)
                val at = o.getLong("t")
                if (at < now) {
                    unpersist(ctx, noteId)
                    continue
                }
                schedule(ctx, noteId, at, o.optString("title"), o.optString("body"))
            } catch (e: Exception) {
                // skip a corrupt entry
            }
        }
    }

    private fun persist(ctx: Context, noteId: String, at: Long, title: String, body: String) {
        val o = JSONObject().put("t", at).put("title", title).put("body", body)
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putString(noteId, o.toString()).apply()
    }

    private fun unpersist(ctx: Context, noteId: String) {
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .remove(noteId).apply()
    }
}
