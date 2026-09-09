package com.glasskeep.app.nativeapp.data.local

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.Query
import androidx.room.Transaction
import kotlinx.coroutines.flow.Flow

@Dao
interface SyncQueueDao {
    @Query(
        "SELECT * FROM sync_queue WHERE noteId = :noteId AND type = :type " +
            "AND status = '${SyncQueueEntity.STATUS_PENDING}' LIMIT 1",
    )
    suspend fun findPending(noteId: String, type: String): SyncQueueEntity?

    @Insert
    suspend fun insert(item: SyncQueueEntity)

    @Query("UPDATE sync_queue SET payloadJson = :payloadJson, createdAt = :createdAt, attempts = 0, lastError = NULL WHERE queueId = :queueId")
    suspend fun replacePayload(queueId: Long, payloadJson: String, createdAt: Long)

    /** Same collapse behaviour as syncEngine.js's collapseQueue(): a second
     *  edit to the same note+type before the first one synced replaces its
     *  payload in place (and resets its retry count) instead of stacking a
     *  second item that would just re-send stale data a moment later. */
    @Transaction
    suspend fun enqueue(noteId: String, type: String, payloadJson: String, now: Long) {
        val existing = findPending(noteId, type)
        if (existing != null) {
            replacePayload(existing.queueId, payloadJson, now)
        } else {
            insert(SyncQueueEntity(noteId = noteId, type = type, payloadJson = payloadJson, createdAt = now))
        }
    }

    @Query("SELECT * FROM sync_queue WHERE status = '${SyncQueueEntity.STATUS_PENDING}' ORDER BY createdAt ASC")
    suspend fun getPending(): List<SyncQueueEntity>

    @Query("DELETE FROM sync_queue WHERE queueId = :queueId")
    suspend fun delete(queueId: Long)

    @Query("UPDATE sync_queue SET attempts = :attempts, lastError = :error WHERE queueId = :queueId")
    suspend fun recordFailure(queueId: Long, attempts: Int, error: String?)

    @Query("UPDATE sync_queue SET status = '${SyncQueueEntity.STATUS_FAILED}', attempts = :attempts, lastError = :error WHERE queueId = :queueId")
    suspend fun markFailed(queueId: Long, attempts: Int, error: String?)

    /** Drives a small "syncing…" indicator on the note being edited (see
     *  NoteDetailScreen.kt): pending, not failed, so a give-up'd item
     *  doesn't show as perpetually "still syncing". */
    @Query("SELECT COUNT(*) FROM sync_queue WHERE noteId = :noteId AND status = '${SyncQueueEntity.STATUS_PENDING}'")
    fun observePendingCountForNote(noteId: String): Flow<Int>

    /** Notes with a not-yet-confirmed archive/trash/restore/permanent-delete/
     *  pin: notes list screens with a live, replaceable snapshot (Room's
     *  own observeAll() cache for NativeNotesListScreen.kt, or
     *  SecondaryNotesScreen.kt's own in-memory list) must not let a
     *  same-moment refresh silently undo one of these five while it's
     *  still in flight (see NotesRepository.refresh()'s and
     *  SecondaryNotesScreen.kt's own doc comments). One shared, wider
     *  query rather than one per caller: a type irrelevant to a given
     *  caller (e.g. PERMANENT_DELETE for Room, which never cached a
     *  trashed note to begin with) is a harmless no-op there, cheaper
     *  than keeping two near-duplicate queries in sync by hand. The
     *  literal type names must keep matching SyncQueueType's own entries:
     *  Room requires a compile-time constant here, so this can't
     *  reference the enum directly the way STATUS_PENDING does above. */
    @Query(
        "SELECT DISTINCT noteId FROM sync_queue WHERE status = '${SyncQueueEntity.STATUS_PENDING}' " +
            "AND type IN ('ARCHIVE', 'TRASH', 'RESTORE', 'PERMANENT_DELETE', 'PINNED')",
    )
    suspend fun getProtectedNoteIds(): List<String>

    /** Every note with anything still pending, of any type: drives a
     *  list-level "still syncing" indicator (see NativeNotesListScreen.kt/
     *  SecondaryNotesScreen.kt), deliberately untyped unlike
     *  getProtectedNoteIds() above. A note queued from one screen (e.g. a
     *  RESTORE queued from the trash screen) can legitimately need this
     *  badge on a DIFFERENT screen (the active list it just got
     *  optimistically reinserted into), so filtering by type per screen
     *  would mean remembering to keep two lists in sync by hand; each
     *  screen instead intersects this set against the note ids it's
     *  actually rendering. */
    @Query("SELECT DISTINCT noteId FROM sync_queue WHERE status = '${SyncQueueEntity.STATUS_PENDING}'")
    fun observePendingNoteIds(): Flow<List<String>>
}
