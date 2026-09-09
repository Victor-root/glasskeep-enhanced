package com.glasskeep.app.nativeapp.data.local

import androidx.room.Entity
import androidx.room.PrimaryKey

/**
 * Local cache of a note, enough to render the list screen's card previews
 * offline (real content/checklist-item preview, not just the title), and to
 * compute the note detail screen's tag suggestions (every note's tags, not
 * just the open one). Images aren't modeled yet, nothing in the native UI
 * reads them from this cache so far.
 */
@Entity(tableName = "notes")
data class NoteEntity(
    @PrimaryKey val id: String,
    val type: String,
    val title: String,
    val color: String,
    val pinned: Boolean,
    val updatedAt: String?,
    /** Raw `content` exactly as the server sent it (legacy plain text, or
     *  the Tiptap envelope), same convention as NoteDto.content. */
    val content: String,
    /** `items` re-serialized to a JSON array string (Room has no native
     *  list-of-objects column type); parsed on demand by ChecklistPreview. */
    val itemsJson: String,
    /** `tags` re-serialized to a JSON array string, same convention as
     *  itemsJson. Per-user (see server's note_user_tags table), already
     *  scoped to the signed-in user by the time it reaches here. */
    val tagsJson: String,
    /** Same ISO-8601 UTC instant as NoteDto.reminderAt, or null. Cached
     *  locally (not just fetched on demand) so the list card can show a
     *  reminder chip offline, and so NativeNavHost's alarm reconciliation
     *  (see ReminderSync.kt) can react to it without a network round trip. */
    val reminderAt: String? = null,
    /** Same meaning as NoteDto.position: higher sorts first within the
     *  same pinned/unpinned group (see NoteDao.observeAll's own ORDER BY).
     *  Written optimistically by NotesRepository.reorderQueued so a drag
     *  reorder shows immediately, without waiting for the queued
     *  POST /api/notes/reorder to round-trip. */
    val position: Double = 0.0,
)
