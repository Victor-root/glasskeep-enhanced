package com.glasskeep.app.nativeapp.data.local

import androidx.room.Entity
import androidx.room.PrimaryKey

/**
 * One not-yet-confirmed note edit, mirroring the shape of a syncEngine.js
 * queue item (src/sync/syncEngine.js / src/sync/localDb.js) closely enough
 * to reuse the same design, but only for the "patch"-style actions this
 * first milestone covers (title/content, color, tags, checklist items,
 * images; see SyncQueueType). Lives in its own database (SyncQueueDatabase),
 * deliberately never AppDatabase: that one is a disposable server mirror
 * with a destructive-migration policy (see its own doc comment), which
 * would be actively dangerous for a table holding edits the server hasn't
 * seen yet.
 */
@Entity(tableName = "sync_queue")
data class SyncQueueEntity(
    @PrimaryKey(autoGenerate = true) val queueId: Long = 0,
    val noteId: String,
    /** One of SyncQueueType's name()s. Plain String column (not a Room
     *  enum TypeConverter) to match this codebase's existing preference
     *  for small hand-rolled plumbing over framework ceremony. */
    val type: String,
    /** The exact Retrofit request body this item will replay, already
     *  JSON-encoded (kotlinx.serialization) in the same shape
     *  GlassKeepApi.kt's Set*Request DTOs expect: SyncQueueWorker decodes
     *  it back rather than re-deriving it, so a merge at enqueue time
     *  (see SyncQueueDao.enqueue) is just replacing this string wholesale,
     *  never a field-by-field patch of an already-serialized blob. */
    val payloadJson: String,
    val status: String = STATUS_PENDING,
    val createdAt: Long,
    val attempts: Int = 0,
    val lastError: String? = null,
) {
    companion object {
        const val STATUS_PENDING = "PENDING"
        const val STATUS_FAILED = "FAILED"
    }
}

/** Which repository call SyncQueueWorker replays a given item with.
 *  Narrower than syncEngine.js's own type set (create/update/patch/
 *  archive/trash/restore/permanentDelete/reorder/reminder) on purpose:
 *  create/duplicate need their own client-id/reconciliation design and
 *  reminders are queued separately (see the follow-up tasks this and the
 *  next milestone's commit messages list). ARCHIVE/TRASH/RESTORE's note
 *  ids are also read by SyncQueueDao.getProtectedNoteIds() (see
 *  NotesRepository.refresh()'s own doc comment) since, unlike the other
 *  types, they change which notes belong in the active-notes list. */
enum class SyncQueueType { TITLE_CONTENT, COLOR, TAGS, CHECKLIST_ITEMS, IMAGES, PINNED, ARCHIVE, TRASH, RESTORE, PERMANENT_DELETE }
