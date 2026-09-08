package com.glasskeep.app.nativeapp.data

import com.glasskeep.app.nativeapp.NativeDebug
import com.glasskeep.app.nativeapp.data.local.NoteDao
import com.glasskeep.app.nativeapp.data.local.NoteEntity
import com.glasskeep.app.nativeapp.data.network.GlassKeepApi
import com.glasskeep.app.nativeapp.data.network.NoteDto
import com.glasskeep.app.nativeapp.data.network.PatchNoteRequest
import kotlinx.coroutines.flow.Flow
import kotlinx.serialization.json.JsonArray

/** Outcome of a note save. Stale/ReadOnly are real, expected server
 *  answers (see PATCH /api/notes/:id), not bugs, the caller shows each
 *  one differently instead of pretending the write always succeeds. */
sealed class SaveNoteResult {
    data class Saved(val note: NoteDto) : SaveNoteResult()
    data object Stale : SaveNoteResult()
    data object ReadOnly : SaveNoteResult()
}

class NotesRepository(
    private val api: GlassKeepApi,
    private val noteDao: NoteDao,
) {
    /**
     * The list screen observes this directly: it always reads the local
     * cache, refresh() is what keeps that cache current. Same local-first
     * shape the web app uses (see IMPROVEMENTS.md), backed by Room instead
     * of IndexedDB.
     */
    fun observeNotes(): Flow<List<NoteEntity>> = noteDao.observeAll()

    /**
     * Pulls the current note list from the server and replaces the local
     * cache. Throws on failure; the caller decides how to surface that
     * (the list screen shows a plain error banner for now).
     */
    suspend fun refresh() {
        NativeDebug.d("NotesRepository.refresh: fetching /api/notes")
        val response = api.getNotes()
        if (!response.isSuccessful) {
            val error = "GET /api/notes failed: HTTP ${response.code()} ${response.errorBody()?.string()}"
            NativeDebug.e(error)
            throw IllegalStateException(error)
        }
        val notes = response.body().orEmpty()
        NativeDebug.d("NotesRepository.refresh: got ${notes.size} note(s)")
        noteDao.replaceAll(notes.map { it.toEntity() })
    }

    /** Full detail for one note (content/items included, unlike the
     *  cached list entries). Always goes to the server, no local cache for
     *  detail yet, so opening a note requires connectivity for now. */
    suspend fun fetchNoteDetail(id: String): NoteDto {
        NativeDebug.d("NotesRepository.fetchNoteDetail id=$id")
        val response = api.getNote(id)
        val note = response.body()
        if (!response.isSuccessful || note == null) {
            val error = "GET /api/notes/$id failed: HTTP ${response.code()} ${response.errorBody()?.string()}"
            NativeDebug.e(error)
            throw IllegalStateException(error)
        }
        return note
    }

    /**
     * Saves a title/content edit via PATCH (see GlassKeepApi.patchNote for
     * why not PUT). On success, mirrors the server's fresh copy into the
     * local list cache so the title shown in the list updates without a
     * full refresh().
     */
    suspend fun patchNote(id: String, title: String, content: String): SaveNoteResult {
        NativeDebug.d("NotesRepository.patchNote id=$id")
        val response = api.patchNote(id, PatchNoteRequest(title, content, nowIso()))
        val body = response.body()
        if (!response.isSuccessful || body == null) {
            val error = "PATCH /api/notes/$id failed: HTTP ${response.code()} ${response.errorBody()?.string()}"
            NativeDebug.e(error)
            throw IllegalStateException(error)
        }
        if (body.stale) {
            NativeDebug.d("NotesRepository.patchNote id=$id: stale, not applied")
            return SaveNoteResult.Stale
        }
        if (body.readOnly) {
            NativeDebug.d("NotesRepository.patchNote id=$id: read-only, not applied")
            return SaveNoteResult.ReadOnly
        }
        val saved = body.note ?: throw IllegalStateException("PATCH /api/notes/$id: ok response with no note")
        noteDao.upsertAll(listOf(saved.toEntity()))
        return SaveNoteResult.Saved(saved)
    }

    // Full content/items are cached now too (not just the summary fields),
    // so the list's cards can show a real preview, like the web app's own
    // NoteCard.jsx, instead of just a title.
    private fun NoteDto.toEntity() = NoteEntity(
        id = id,
        type = type,
        title = title,
        color = color,
        pinned = pinned,
        updatedAt = updatedAt,
        content = content,
        itemsJson = JsonArray(items).toString(),
    )
}
