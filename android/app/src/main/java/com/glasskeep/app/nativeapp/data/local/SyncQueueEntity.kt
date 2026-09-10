package com.glasskeep.app.nativeapp.data.local

import androidx.room.Entity
import androidx.room.PrimaryKey

/**
 * One not-yet-confirmed note edit, mirroring the shape of a syncEngine.js
 * queue item (src/sync/syncEngine.js / src/sync/localDb.js) closely enough
 * to reuse the same design, including idempotent client-ID creation and
 * the patch-style actions that may follow it (see SyncQueueType). Lives in
 * its own database (SyncQueueDatabase),
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
 *  CREATE covers both a blank note and a duplicate: the client-generated
 *  UUID is replayed verbatim, relying on POST /api/notes' idempotent-ID
 *  contract. ARCHIVE/TRASH/RESTORE/PERMANENT_DELETE/PINNED/REMINDER's note
 *  ids are also read by SyncQueueDao.getProtectedNoteIds() (see
 *  NotesRepository.refresh()'s own doc comment) since, unlike the
 *  patch-style types above them, each changes something a same-moment
 *  refresh() could otherwise silently clobber before the queue drains:
 *  which notes belong in the active-notes list, for the first four, or a
 *  single field a concurrent refresh() would overwrite back to its stale
 *  value, for PINNED/REMINDER. REORDER is deliberately NOT in that
 *  protected set even though it also touches a field (position) a
 *  refresh() could clobber: it can touch every note in the list at once,
 *  not one, which doesn't fit getProtectedNoteIds()'s per-note-id
 *  design - see NotesRepository.reorderQueued's own doc comment for the
 *  accepted tradeoff. */
enum class SyncQueueType { CREATE, TITLE_CONTENT, COLOR, TAGS, CHECKLIST_ITEMS, IMAGES, PINNED, ARCHIVE, TRASH, RESTORE, PERMANENT_DELETE, REMINDER, REORDER, CONVERT_TYPE }
