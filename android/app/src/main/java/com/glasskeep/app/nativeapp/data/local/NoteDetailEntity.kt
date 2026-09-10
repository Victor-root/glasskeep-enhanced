package com.glasskeep.app.nativeapp.data.local

import androidx.room.Entity
import androidx.room.PrimaryKey

/**
 * Full serialized note used when a detail screen is opened without a
 * reachable server. Kept apart from [NoteEntity] so the list's Flow does
 * not load every full-size image data URL on each card update.
 */
@Entity(tableName = "note_details")
data class NoteDetailEntity(
    @PrimaryKey val noteId: String,
    val payloadJson: String,
)
