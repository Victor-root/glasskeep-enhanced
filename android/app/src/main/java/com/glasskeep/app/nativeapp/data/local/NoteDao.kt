package com.glasskeep.app.nativeapp.data.local

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Transaction
import kotlinx.coroutines.flow.Flow

@Dao
interface NoteDao {
    @Query("SELECT * FROM notes ORDER BY pinned DESC, updatedAt DESC")
    fun observeAll(): Flow<List<NoteEntity>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertAll(notes: List<NoteEntity>)

    @Query("DELETE FROM notes")
    suspend fun deleteAll()

    @Query("DELETE FROM notes WHERE id = :id")
    suspend fun deleteById(id: String)

    @Query("DELETE FROM notes WHERE id NOT IN (:keepIds)")
    suspend fun deleteMissing(keepIds: List<String>)

    /**
     * Replace the whole cache with the server's current list in one go, so
     * a screen observing observeAll() never sees a half-updated state.
     * Empty lists go through deleteAll() directly: `NOT IN ()` with no
     * arguments is invalid SQL, and an empty server response is exactly
     * what a brand-new account looks like.
     *
     * [protectedIds] (see SyncQueueDao.getProtectedNoteIds()) are excluded
     * from both sides of the replace: a note there is neither upserted from
     * [notes] (a fresh GET /api/notes that hasn't caught up with an
     * in-flight queued archive/trash/pin yet would otherwise silently undo
     * that optimistic local change) nor treated as missing (a queued
     * restore's optimistic local insert would otherwise be deleted
     * immediately, since a not-yet-processed restore is still absent from
     * [notes]). Self-heals on the very next refresh() either way, once the
     * queued item is no longer PENDING (succeeded, or gave up after
     * retrying).
     */
    @Transaction
    suspend fun replaceAll(notes: List<NoteEntity>, protectedIds: Set<String> = emptySet()) {
        val filtered = if (protectedIds.isEmpty()) notes else notes.filterNot { it.id in protectedIds }
        if (filtered.isEmpty() && protectedIds.isEmpty()) {
            deleteAll()
        } else {
            upsertAll(filtered)
            deleteMissing(filtered.map { it.id } + protectedIds)
        }
    }
}
