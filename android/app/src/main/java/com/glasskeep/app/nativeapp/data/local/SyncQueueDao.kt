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
}
