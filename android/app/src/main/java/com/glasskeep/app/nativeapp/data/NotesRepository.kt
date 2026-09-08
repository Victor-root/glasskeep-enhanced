package com.glasskeep.app.nativeapp.data

import com.glasskeep.app.nativeapp.NativeDebug
import com.glasskeep.app.nativeapp.data.local.NoteDao
import com.glasskeep.app.nativeapp.data.local.NoteEntity
import com.glasskeep.app.nativeapp.data.network.ArchiveNoteRequest
import com.glasskeep.app.nativeapp.data.network.CreateNoteRequest
import com.glasskeep.app.nativeapp.data.network.GlassKeepApi
import com.glasskeep.app.nativeapp.data.network.NoteDto
import com.glasskeep.app.nativeapp.data.network.PatchNoteRequest
import com.glasskeep.app.nativeapp.data.network.SetColorRequest
import com.glasskeep.app.nativeapp.data.network.SetPinnedRequest
import com.glasskeep.app.nativeapp.data.network.TrashNoteRequest
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

    /**
     * Creates a new blank text note and mirrors it into the local list
     * cache immediately, so it shows up without waiting for the next
     * refresh(). Checklist/draw/audio creation isn't wired up yet: the
     * native detail screen can't edit those types either (see
     * NoteDetailScreen), so creating one would just strand the user on a
     * note they can't do anything with.
     */
    suspend fun createTextNote(): NoteDto {
        NativeDebug.d("NotesRepository.createTextNote")
        val response = api.createNote(CreateNoteRequest(type = "text"))
        val note = response.body()
        if (!response.isSuccessful || note == null) {
            val error = "POST /api/notes failed: HTTP ${response.code()} ${response.errorBody()?.string()}"
            NativeDebug.e(error)
            throw IllegalStateException(error)
        }
        noteDao.upsertAll(listOf(note.toEntity()))
        return note
    }

    /**
     * Duplicates a note: creates a new one with the same type, content,
     * items and color (caller already worked out the new title, e.g. with
     * a "(copy)" suffix). Safe for every note type, not just text: unlike
     * creating a blank note of an unsupported type, a duplicate is just
     * another fully-formed note of a type native can already view
     * (read-only, same as the original), never a dead end. Tags and
     * images aren't carried over yet, native has no data layer for
     * either.
     */
    suspend fun duplicateNote(source: NoteDto, newTitle: String): NoteDto {
        NativeDebug.d("NotesRepository.duplicateNote id=${source.id}")
        val response = api.createNote(
            CreateNoteRequest(
                type = source.type,
                title = newTitle,
                content = source.content,
                color = source.color,
                items = source.items,
            )
        )
        val note = response.body()
        if (!response.isSuccessful || note == null) {
            val error = "POST /api/notes (duplicate) failed: HTTP ${response.code()} ${response.errorBody()?.string()}"
            NativeDebug.e(error)
            throw IllegalStateException(error)
        }
        noteDao.upsertAll(listOf(note.toEntity()))
        return note
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

    /**
     * Pin/unpin. Deliberately its own call, not patchNote(): pin is
     * per-user state on the server (see SetPinnedRequest), not LWW-guarded
     * shared content, so there's no stale/readOnly outcome to report, only
     * success or a thrown exception.
     */
    suspend fun setPinned(id: String, pinned: Boolean): NoteDto {
        NativeDebug.d("NotesRepository.setPinned id=$id pinned=$pinned")
        val response = api.setPinned(id, SetPinnedRequest(pinned))
        val note = response.body()?.note
        if (!response.isSuccessful || note == null) {
            val error = "PATCH /api/notes/$id (pinned) failed: HTTP ${response.code()} ${response.errorBody()?.string()}"
            NativeDebug.e(error)
            throw IllegalStateException(error)
        }
        noteDao.upsertAll(listOf(note.toEntity()))
        return note
    }

    /** Archive or unarchive. Archived notes stay in the local cache (they
     *  still exist, just hidden from the active list by the server's own
     *  listing query), same as how patchNote() mirrors edits. */
    suspend fun setArchived(id: String, archived: Boolean): SaveNoteResult {
        NativeDebug.d("NotesRepository.setArchived id=$id archived=$archived")
        val response = api.archiveNote(id, ArchiveNoteRequest(archived, nowIso()))
        val body = response.body()
        if (!response.isSuccessful || body == null) {
            val error = "POST /api/notes/$id/archive failed: HTTP ${response.code()} ${response.errorBody()?.string()}"
            NativeDebug.e(error)
            throw IllegalStateException(error)
        }
        if (body.stale) {
            NativeDebug.d("NotesRepository.setArchived id=$id: stale, not applied")
            return SaveNoteResult.Stale
        }
        val saved = body.note ?: throw IllegalStateException("POST /api/notes/$id/archive: ok response with no note")
        noteDao.upsertAll(listOf(saved.toEntity()))
        return SaveNoteResult.Saved(saved)
    }

    /**
     * Soft-deletes (moves to trash). Scoped to the simple, non-collaborative
     * case for now: the server's /trash route also handles leaving a shared
     * note or deleting it for every collaborator, but native has no sharing
     * UI at all yet, so those response shapes (`left`, `deletedForAll`,
     * no `note` field) aren't something a real native user can trigger
     * today. If one ever came back anyway, the null-note check below turns
     * it into a clear error instead of silently mishandling it.
     *
     * Removed from the local cache immediately: there is no trash-browsing
     * screen in the native app yet for it to keep showing up in.
     */
    suspend fun trashNote(id: String): SaveNoteResult {
        NativeDebug.d("NotesRepository.trashNote id=$id")
        val response = api.trashNote(id, TrashNoteRequest(nowIso()))
        val body = response.body()
        if (!response.isSuccessful || body == null) {
            val error = "POST /api/notes/$id/trash failed: HTTP ${response.code()} ${response.errorBody()?.string()}"
            NativeDebug.e(error)
            throw IllegalStateException(error)
        }
        if (body.stale) {
            NativeDebug.d("NotesRepository.trashNote id=$id: stale, not applied")
            return SaveNoteResult.Stale
        }
        val saved = body.note ?: throw IllegalStateException("POST /api/notes/$id/trash: ok response with no note")
        noteDao.deleteById(id)
        return SaveNoteResult.Saved(saved)
    }

    /** Changes a note's color. Shares the general PATCH endpoint with
     *  patchNote(), but with its own narrow request body so title/content
     *  are left out of the JSON entirely and stay untouched server-side. */
    suspend fun setColor(id: String, color: String): SaveNoteResult {
        NativeDebug.d("NotesRepository.setColor id=$id color=$color")
        val response = api.setColor(id, SetColorRequest(color, nowIso()))
        val body = response.body()
        if (!response.isSuccessful || body == null) {
            val error = "PATCH /api/notes/$id (color) failed: HTTP ${response.code()} ${response.errorBody()?.string()}"
            NativeDebug.e(error)
            throw IllegalStateException(error)
        }
        if (body.stale) {
            NativeDebug.d("NotesRepository.setColor id=$id: stale, not applied")
            return SaveNoteResult.Stale
        }
        val saved = body.note ?: throw IllegalStateException("PATCH /api/notes/$id (color): ok response with no note")
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
