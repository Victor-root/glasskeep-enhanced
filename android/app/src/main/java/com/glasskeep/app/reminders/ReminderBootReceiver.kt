package com.glasskeep.app.reminders

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * Re-arms persisted reminder alarms after a reboot — AlarmManager alarms
 * don't survive a restart, so without this a reminder set before the phone
 * rebooted would be silently lost.
 */
class ReminderBootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action
        if (action == Intent.ACTION_BOOT_COMPLETED ||
            action == "android.intent.action.QUICKBOOT_POWERON"
        ) {
            ReminderScheduler.rescheduleAll(context)
        }
    }
}
