package com.glasskeep.app.nativeapp.data.local

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Transaction
import kotlinx.coroutines.flow.Flow

@Dao
interface NoteDao {
    // position is the manual drag-reorder rank within a pinned/unpinned
    // group (see NoteEntity.position); updatedAt stays as the final
    // tie-break for notes that have never been manually reordered
    // (position 0.0 for all of them), same role it already played alone
    // before manual reordering existed.
    @Query("SELECT * FROM notes ORDER BY pinned DESC, position DESC, updatedAt DESC")
    fun observeAll(): Flow<List<NoteEntity>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertAll(notes: List<NoteEntity>)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertDetails(notes: List<NoteDetailEntity>)

    @Transaction
    suspend fun upsertNotesAndDetails(notes: List<NoteEntity>, details: List<NoteDetailEntity>) {
        upsertAll(notes)
        upsertDetails(details)
    }

    /** One cached note, for the few writes that touch a single field and
     *  have to keep the rest of the row as-is (see the note-icon path in
     *  NotesRepository). */
    @Query("SELECT * FROM notes WHERE id = :id LIMIT 1")
    suspend fun getById(id: String): NoteEntity?

    @Query("SELECT * FROM note_details WHERE noteId = :id LIMIT 1")
    suspend fun getDetailById(id: String): NoteDetailEntity?

    /** [upsertAll] for one note, same replace-on-conflict semantics. */
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(note: NoteEntity)

    @Query("DELETE FROM notes")
    suspend fun deleteAllNotes()

    @Query("DELETE FROM note_details")
    suspend fun deleteAllDetails()

    @Transaction
    suspend fun deleteAll() {
        deleteAllNotes()
        deleteAllDetails()
    }

    @Query("DELETE FROM notes WHERE id = :id")
    suspend fun deleteNoteById(id: String)

    @Query("DELETE FROM note_details WHERE noteId = :id")
    suspend fun deleteDetailById(id: String)

    @Transaction
    suspend fun deleteById(id: String) {
        deleteNoteById(id)
        deleteDetailById(id)
    }

    @Query("DELETE FROM notes WHERE id NOT IN (:keepIds)")
    suspend fun deleteMissing(keepIds: List<String>)

    @Query("DELETE FROM note_details WHERE noteId NOT IN (:keepIds)")
    suspend fun deleteMissingDetails(keepIds: List<String>)

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
    suspend fun replaceAll(
        notes: List<NoteEntity>,
        details: List<NoteDetailEntity>,
        protectedIds: Set<String> = emptySet(),
    ) {
        val filtered = if (protectedIds.isEmpty()) notes else notes.filterNot { it.id in protectedIds }
        val filteredDetails = if (protectedIds.isEmpty()) details else details.filterNot { it.noteId in protectedIds }
        if (filtered.isEmpty() && protectedIds.isEmpty()) {
            deleteAllNotes()
            deleteAllDetails()
        } else {
            upsertAll(filtered)
            upsertDetails(filteredDetails)
            val keepIds = filtered.map { it.id } + protectedIds
            deleteMissing(keepIds)
            deleteMissingDetails(keepIds)
        }
    }
}
