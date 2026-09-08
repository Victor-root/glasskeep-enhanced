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
     */
    @Transaction
    suspend fun replaceAll(notes: List<NoteEntity>) {
        if (notes.isEmpty()) {
            deleteAll()
        } else {
            upsertAll(notes)
            deleteMissing(notes.map { it.id })
        }
    }
}
