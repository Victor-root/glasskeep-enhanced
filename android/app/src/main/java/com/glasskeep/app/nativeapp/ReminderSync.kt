package com.glasskeep.app.nativeapp

import android.content.Context
import com.glasskeep.app.R
import com.glasskeep.app.nativeapp.data.local.NoteEntity
import com.glasskeep.app.nativeapp.data.parseIsoToEpochMillis
import com.glasskeep.app.reminders.ReminderScheduler

/**
 * Reconciles the on-device reminder alarms with whatever this device's
 * local note cache currently knows. Mirrors App.jsx's own
 * androidReminderSyncRef effect byte for byte: same generic "Reminder"
 * title, same note-title-or-untitled body, same "only still-upcoming
 * reminders" filter, same full-set reconcile (ReminderScheduler.syncAll
 * cancels anything not passed in and (re)arms the rest).
 *
 * This only ever sees notes already synced to this device (see
 * NotesRepository.refresh/setReminder). A reminder set on another device
 * is still covered, just not instantly: ReminderSyncWorker's periodic +
 * on-demand sync (see NativeNavHost) asks the server directly for that.
 */
internal fun syncReminderAlarms(context: Context, notes: List<NoteEntity>) {
    val now = System.currentTimeMillis()
    val title = context.getString(R.string.native_note_detail_reminder)
    val untitled = context.getString(R.string.native_reminder_untitled_note)
    val items = notes.mapNotNull { note ->
        val at = note.reminderAt?.let(::parseIsoToEpochMillis) ?: return@mapNotNull null
        if (at <= now) return@mapNotNull null
        ReminderScheduler.ReminderItem(
            noteId = note.id,
            triggerAtMillis = at,
            title = title,
            body = note.title.trim().ifEmpty { untitled },
        )
    }
    NativeDebug.d("syncReminderAlarms: reconciling ${items.size} upcoming reminder(s) from ${notes.size} cached note(s)")
    ReminderScheduler.syncAll(context, items)
}
