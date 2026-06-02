package com.glasskeep.app.reminders

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * DEBUG-ONLY test hook. Lives in src/debug, so it's compiled into debug
 * builds (./gradlew assembleDebug) and NEVER into a release APK — the
 * production reminder receiver (ReminderAlarmReceiver) stays unexported.
 *
 * Fires a real reminder notification immediately, exactly as a due alarm
 * would, so you can test the notification's appearance and its tap /
 * "Open" deep-link without scheduling a reminder and waiting. Unlike the
 * real receiver it does NOT skip when the app is foregrounded — the whole
 * point is to summon the system notification on demand.
 *
 * Trigger it over adb (USB, or `adb connect <phone-ip>:5555` for wireless):
 *
 *   adb shell am broadcast \
 *     -n com.glasskeep.app/.reminders.ReminderDebugReceiver \
 *     --es noteId 1777374322541-t1vpuv \
 *     --es title "Rappel de test" \
 *     --es body "Touchez pour ouvrir la note"
 *
 * The noteId is what the tap forwards to window.__glasskeepOpenNote, so use
 * a real note id to verify the note actually opens. See
 * scripts/test-reminder-native.sh for a ready-made wrapper.
 */
class ReminderDebugReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val noteId = intent.getStringExtra("noteId") ?: "debug-note"
        val title = intent.getStringExtra("title") ?: "Rappel de test"
        val body = intent.getStringExtra("body") ?: "Touchez pour ouvrir la note"
        ReminderNotifier.show(context.applicationContext, noteId, title, body)
    }
}
