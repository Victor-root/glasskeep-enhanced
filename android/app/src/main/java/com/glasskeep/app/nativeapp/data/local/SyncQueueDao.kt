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

    @Query("SELECT COUNT(*) > 0 FROM sync_queue WHERE noteId = :noteId AND type = 'CREATE'")
    suspend fun hasQueuedCreate(noteId: String): Boolean

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

    @Query("SELECT * FROM sync_queue WHERE status = '${SyncQueueEntity.STATUS_PENDING}' ORDER BY createdAt ASC, queueId ASC")
    suspend fun getPending(): List<SyncQueueEntity>

    @Query("DELETE FROM sync_queue WHERE queueId = :queueId")
    suspend fun delete(queueId: Long)

    /** Everything queued for a note the server no longer lets this user
     *  touch (purgeQueueForNote, localDb.js). */
    @Query("DELETE FROM sync_queue WHERE noteId = :noteId")
    suspend fun deleteForNote(noteId: String)

    /** Gives the items that gave up their attempts back, as the web does
     *  once the server answers its health check (syncEngine.js:496-508) and
     *  on "Sync now" (:372-381). Returns how many were put back to work. */
    @Query("UPDATE sync_queue SET status = '${SyncQueueEntity.STATUS_PENDING}', attempts = 0, lastError = NULL WHERE status = '${SyncQueueEntity.STATUS_FAILED}'")
    suspend fun resetFailed(): Int

    /** Signing out drops everything still queued: the web purges its own
     *  queue on an explicit sign-out for the same reason (App.jsx:4578-4583),
     *  since the next session may well be a different account. */
    @Query("DELETE FROM sync_queue")
    suspend fun deleteAll()

    @Query("UPDATE sync_queue SET attempts = :attempts, lastError = :error WHERE queueId = :queueId")
    suspend fun recordFailure(queueId: Long, attempts: Int, error: String?)

    @Query("UPDATE sync_queue SET status = '${SyncQueueEntity.STATUS_FAILED}', attempts = :attempts, lastError = :error WHERE queueId = :queueId")
    suspend fun markFailed(queueId: Long, attempts: Int, error: String?)

    /** Every note a refresh of the three lists (active, archived, trashed,
     *  see NoteDao.replaceAll's own doc comment) must leave alone: one with
     *  a queued change of any kind and in any state, a failed one included,
     *  as the web's hasPendingChanges() reads the queue (localDb.js:367-381),
     *  so a refresh never erases unsynced user data. REORDER is the one
     *  exception: its note id is a sentinel standing for the whole list (see
     *  NotesRepository.reorderQueued's own doc comment). The literal must
     *  keep matching SyncQueueType.REORDER: Room needs a constant here. */
    @Query("SELECT DISTINCT noteId FROM sync_queue WHERE type != 'REORDER'")
    suspend fun getProtectedNoteIds(): List<String>

    /** Every note with anything still pending, of any type, deliberately
     *  untyped unlike getProtectedNoteIds() above: while anything at all
     *  waits, the health read runs on its quicker cadence (NativeNavHost). */
    @Query("SELECT DISTINCT noteId FROM sync_queue WHERE status = '${SyncQueueEntity.STATUS_PENDING}'")
    fun observePendingNoteIds(): Flow<List<String>>

    /** Everything still queued, failed items included: the header's sync
     *  panel lists them by name with their retry count (SyncStatusIcon.jsx's
     *  own two sections). Oldest first, the order they will be replayed in. */
    @Query("SELECT * FROM sync_queue ORDER BY createdAt ASC")
    fun observeAll(): Flow<List<SyncQueueEntity>>
}
