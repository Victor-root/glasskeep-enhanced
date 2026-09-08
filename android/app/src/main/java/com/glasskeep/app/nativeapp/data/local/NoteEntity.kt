package com.glasskeep.app.nativeapp.data.local

import androidx.room.Entity
import androidx.room.PrimaryKey

/**
 * Local cache of a note, enough to show the list screen offline. Only the
 * columns the list screen actually reads are modeled for now; the rest of
 * the server's note payload (content, items, images, tags...) isn't needed
 * until note editing lands in a later milestone.
 */
@Entity(tableName = "notes")
data class NoteEntity(
    @PrimaryKey val id: String,
    val type: String,
    val title: String,
    val color: String,
    val pinned: Boolean,
    val updatedAt: String?,
)
