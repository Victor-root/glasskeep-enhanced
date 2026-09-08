package com.glasskeep.app.nativeapp.data

import com.glasskeep.app.nativeapp.NativeDebug
import com.glasskeep.app.nativeapp.data.local.NoteDao
import com.glasskeep.app.nativeapp.data.local.NoteEntity
import com.glasskeep.app.nativeapp.data.network.ArchiveNoteRequest
import com.glasskeep.app.nativeapp.data.network.ClientUpdatedAtRequest
import com.glasskeep.app.nativeapp.data.network.CreateNoteRequest
import com.glasskeep.app.nativeapp.data.network.GlassKeepApi
import com.glasskeep.app.nativeapp.data.network.NoteDto
import com.glasskeep.app.nativeapp.data.network.PatchNoteRequest
import com.glasskeep.app.nativeapp.data.network.SetChecklistItemsRequest
import com.glasskeep.app.nativeapp.data.network.SetColorRequest
import com.glasskeep.app.nativeapp.data.network.SetImagesRequest
import com.glasskeep.app.nativeapp.data.network.SetPinnedRequest
import com.glasskeep.app.nativeapp.data.network.SetTagsRequest
import kotlinx.coroutines.flow.Flow
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement

/** Outcome of a note save. Stale/ReadOnly are real, expected server
 *  answers (see PATCH /api/notes/:id), not bugs, the caller shows each
 *  one differently instead of pretending the write always succeeds. */
sealed class SaveNoteResult {
    data class Saved(val note: NoteDto) : SaveNoteResult()
    data object Stale : SaveNoteResult()
    data object ReadOnly : SaveNoteResult()
}

/** Outcome of a permanent delete: unlike SaveNoteResult, success leaves no
 *  note to hand back, the row is gone (see DELETE /api/notes/:id/permanent). */
sealed class DeleteResult {
    data object Deleted : DeleteResult()
    data object Stale : DeleteResult()
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
     * refresh().
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

    /** Creates a new, empty checklist note (no seeded item: matches the
     *  web's own fresh checklist draft, see useDraftNote.js). */
    suspend fun createChecklistNote(): NoteDto {
        NativeDebug.d("NotesRepository.createChecklistNote")
        val response = api.createNote(CreateNoteRequest(type = "checklist"))
        val note = response.body()
        if (!response.isSuccessful || note == null) {
            val error = "POST /api/notes (checklist) failed: HTTP ${response.code()} ${response.errorBody()?.string()}"
            NativeDebug.e(error)
            throw IllegalStateException(error)
        }
        noteDao.upsertAll(listOf(note.toEntity()))
        return note
    }

    /** Creates a new, empty drawing note (no content at all: DrawingEditor
     *  treats a blank canvas the same way DrawingContent.parse treats a
     *  blank/new note, no seeded strokes needed). */
    suspend fun createDrawingNote(): NoteDto {
        NativeDebug.d("NotesRepository.createDrawingNote")
        val response = api.createNote(CreateNoteRequest(type = "draw"))
        val note = response.body()
        if (!response.isSuccessful || note == null) {
            val error = "POST /api/notes (draw) failed: HTTP ${response.code()} ${response.errorBody()?.string()}"
            NativeDebug.e(error)
            throw IllegalStateException(error)
        }
        noteDao.upsertAll(listOf(note.toEntity()))
        return note
    }

    /** Creates a new, empty audio note (no clips yet: AudioContent.parse
     *  treats a blank/new note the same way, no seeded content needed). */
    suspend fun createAudioNote(): NoteDto {
        NativeDebug.d("NotesRepository.createAudioNote")
        val response = api.createNote(CreateNoteRequest(type = "audio"))
        val note = response.body()
        if (!response.isSuccessful || note == null) {
            val error = "POST /api/notes (audio) failed: HTTP ${response.code()} ${response.errorBody()?.string()}"
            NativeDebug.e(error)
            throw IllegalStateException(error)
        }
        noteDao.upsertAll(listOf(note.toEntity()))
        return note
    }

    /**
     * Duplicates a note: creates a new one with the same type, content,
     * items, tags and color (caller already worked out the new title, e.g.
     * with a "(copy)" suffix), same fields duplicateActiveNote() in
     * App.jsx copies. Safe for every note type, not just text: unlike
     * creating a blank note of an unsupported type, a duplicate is just
     * another fully-formed note of a type native can already view
     * (read-only, same as the original), never a dead end. Images aren't
     * carried over yet, native has no data layer for them.
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
                tags = source.tags,
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

    /** Archived notes only (GET /api/notes/archived), server-only, no local
     *  cache: the main list's Room table is only ever populated from
     *  GET /api/notes, which already excludes archived notes, so caching
     *  archived ones there too would either get wiped by the very next
     *  refresh() or leak into the main grid's query. Same "always hits the
     *  server" tradeoff as fetchNoteDetail(), for the same reason: a
     *  secondary, occasionally-viewed screen doesn't need offline support
     *  as much as the main list does. */
    suspend fun fetchArchivedNotes(): List<NoteDto> {
        NativeDebug.d("NotesRepository.fetchArchivedNotes")
        val response = api.getArchivedNotes()
        val notes = response.body()
        if (!response.isSuccessful || notes == null) {
            val error = "GET /api/notes/archived failed: HTTP ${response.code()} ${response.errorBody()?.string()}"
            NativeDebug.e(error)
            throw IllegalStateException(error)
        }
        return notes
    }

    /** Trashed notes only (GET /api/notes/trashed). Same server-only, no
     *  local cache tradeoff as fetchArchivedNotes(), for the same reason:
     *  the main list's Room table only ever holds active notes. */
    suspend fun fetchTrashedNotes(): List<NoteDto> {
        NativeDebug.d("NotesRepository.fetchTrashedNotes")
        val response = api.getTrashedNotes()
        val notes = response.body()
        if (!response.isSuccessful || notes == null) {
            val error = "GET /api/notes/trashed failed: HTTP ${response.code()} ${response.errorBody()?.string()}"
            NativeDebug.e(error)
            throw IllegalStateException(error)
        }
        return notes
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
     * Removed from the local (active-list) cache immediately: it's no
     * longer an active note. The trash screen itself doesn't read this
     * cache at all, it always fetches fresh (see fetchTrashedNotes()).
     */
    suspend fun trashNote(id: String): SaveNoteResult {
        NativeDebug.d("NotesRepository.trashNote id=$id")
        val response = api.trashNote(id, ClientUpdatedAtRequest(nowIso()))
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

    /** Restores a trashed note back to the active list. Also un-archives it
     *  if it had been archived before being trashed, that's the server's
     *  own restore semantics (see POST /:id/restore), not a native choice:
     *  the trash screen only offers one action, so it must make the note
     *  reappear wherever the user goes looking for it. No readOnly outcome
     *  here, same as setArchived(): restoring your own trashed note isn't
     *  a shared-content permission concern. Mirrors the restored note back
     *  into the local cache so it shows up in the main list right away. */
    suspend fun restoreNote(id: String): SaveNoteResult {
        NativeDebug.d("NotesRepository.restoreNote id=$id")
        val response = api.restoreNote(id, ClientUpdatedAtRequest(nowIso()))
        val body = response.body()
        if (!response.isSuccessful || body == null) {
            val error = "POST /api/notes/$id/restore failed: HTTP ${response.code()} ${response.errorBody()?.string()}"
            NativeDebug.e(error)
            throw IllegalStateException(error)
        }
        if (body.stale) {
            NativeDebug.d("NotesRepository.restoreNote id=$id: stale, not applied")
            return SaveNoteResult.Stale
        }
        val saved = body.note ?: throw IllegalStateException("POST /api/notes/$id/restore: ok response with no note")
        noteDao.upsertAll(listOf(saved.toEntity()))
        return SaveNoteResult.Saved(saved)
    }

    /** Permanently deletes a note already in trash. The trash screen is the
     *  only place this is offered from, so "note must be in trash" (the
     *  server's own guard on this route) is never a real concern here. Not
     *  in the local cache to begin with (trashed notes aren't cached, see
     *  fetchTrashedNotes()), so there's nothing to clean up locally on
     *  success. */
    suspend fun deleteNotePermanently(id: String): DeleteResult {
        NativeDebug.d("NotesRepository.deleteNotePermanently id=$id")
        val response = api.deleteNotePermanently(id, ClientUpdatedAtRequest(nowIso()))
        val body = response.body()
        if (!response.isSuccessful || body == null) {
            val error = "DELETE /api/notes/$id/permanent failed: HTTP ${response.code()} ${response.errorBody()?.string()}"
            NativeDebug.e(error)
            throw IllegalStateException(error)
        }
        if (body.stale) {
            NativeDebug.d("NotesRepository.deleteNotePermanently id=$id: stale, not applied")
            return DeleteResult.Stale
        }
        return DeleteResult.Deleted
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

    /** Replaces a note's tag list. Shares the general PATCH endpoint with
     *  patchNote()/setColor(), same narrow-body pattern: only `tags` and
     *  client_updated_at are sent, so title/content/color stay untouched
     *  server-side. Tags are per-user, but the server still treats this as
     *  a shared-content change (see SetTagsRequest), so stale/readOnly are
     *  real outcomes here too, same as setColor(). */
    suspend fun setTags(id: String, tags: List<String>): SaveNoteResult {
        NativeDebug.d("NotesRepository.setTags id=$id tags=$tags")
        val response = api.setTags(id, SetTagsRequest(tags, nowIso()))
        val body = response.body()
        if (!response.isSuccessful || body == null) {
            val error = "PATCH /api/notes/$id (tags) failed: HTTP ${response.code()} ${response.errorBody()?.string()}"
            NativeDebug.e(error)
            throw IllegalStateException(error)
        }
        if (body.stale) {
            NativeDebug.d("NotesRepository.setTags id=$id: stale, not applied")
            return SaveNoteResult.Stale
        }
        val saved = body.note ?: throw IllegalStateException("PATCH /api/notes/$id (tags): ok response with no note")
        noteDao.upsertAll(listOf(saved.toEntity()))
        return SaveNoteResult.Saved(saved)
    }

    /** Replaces a checklist note's items (see ChecklistItems for the
     *  flat/no-section shape this expects). Same PATCH endpoint, same
     *  narrow-body pattern as setColor()/setTags(), plus `type`/`content`
     *  because that's what the web's own syncChecklistItems() sends
     *  (App.jsx) for this exact call. */
    suspend fun setChecklistItems(id: String, items: List<JsonElement>): SaveNoteResult {
        NativeDebug.d("NotesRepository.setChecklistItems id=$id count=${items.size}")
        val response = api.setChecklistItems(id, SetChecklistItemsRequest(items = items, clientUpdatedAt = nowIso()))
        val body = response.body()
        if (!response.isSuccessful || body == null) {
            val error = "PATCH /api/notes/$id (items) failed: HTTP ${response.code()} ${response.errorBody()?.string()}"
            NativeDebug.e(error)
            throw IllegalStateException(error)
        }
        if (body.stale) {
            NativeDebug.d("NotesRepository.setChecklistItems id=$id: stale, not applied")
            return SaveNoteResult.Stale
        }
        val saved = body.note ?: throw IllegalStateException("PATCH /api/notes/$id (items): ok response with no note")
        noteDao.upsertAll(listOf(saved.toEntity()))
        return SaveNoteResult.Saved(saved)
    }

    /** Replaces a note's image list. Same narrow-body PATCH pattern as
     *  setColor()/setTags()/setChecklistItems(); the web instead folds
     *  images into a general metadata-autosave payload, but the server
     *  accepts any subset of fields in a PATCH either way (see
     *  SetImagesRequest). Not cached into Room: the main list's local
     *  cache deliberately doesn't carry full-resolution image data for
     *  every note (see NoteEntity), so this only updates `note` in the
     *  caller, same as how checklist items are handled. */
    suspend fun setImages(id: String, images: List<JsonElement>): SaveNoteResult {
        NativeDebug.d("NotesRepository.setImages id=$id count=${images.size}")
        val response = api.setImages(id, SetImagesRequest(images = images, clientUpdatedAt = nowIso()))
        val body = response.body()
        if (!response.isSuccessful || body == null) {
            val error = "PATCH /api/notes/$id (images) failed: HTTP ${response.code()} ${response.errorBody()?.string()}"
            NativeDebug.e(error)
            throw IllegalStateException(error)
        }
        if (body.stale) {
            NativeDebug.d("NotesRepository.setImages id=$id: stale, not applied")
            return SaveNoteResult.Stale
        }
        val saved = body.note ?: throw IllegalStateException("PATCH /api/notes/$id (images): ok response with no note")
        return SaveNoteResult.Saved(saved)
    }

    /** This user's saved "new checklist item position" preference
     *  ("top"/"bottom", see App.jsx's checklistInsertPosition), read from
     *  the generic settings blob so the native editor's Enter-to-add-item
     *  behavior matches whatever the user already has configured on the
     *  web app instead of guessing a hardcoded default. Best-effort: native
     *  has no settings screen to surface a failure in, and a wrong-but
     *  harmless default (the web's own fresh-install default) is a better
     *  outcome here than blocking checklist editing on this one read. */
    suspend fun fetchChecklistInsertPosition(): String {
        return try {
            val response = api.getUserSettings()
            val position = response.body()?.checklistInsertPosition
            if (response.isSuccessful && position == "bottom") "bottom" else "top"
        } catch (t: Throwable) {
            NativeDebug.e("NotesRepository.fetchChecklistInsertPosition failed, defaulting to top", t)
            "top"
        }
    }
}

// Full content/items are cached now too (not just the summary fields), so
// the list's cards can show a real preview, like the web app's own
// NoteCard.jsx, instead of just a title. Top-level and internal (not a
// class member) so ArchivedNotesScreen can reuse it too, for the same
// NoteCard rendering, without duplicating this mapping.
internal fun NoteDto.toEntity() = NoteEntity(
    id = id,
    type = type,
    title = title,
    color = color,
    pinned = pinned,
    updatedAt = updatedAt,
    content = content,
    itemsJson = JsonArray(items).toString(),
    tagsJson = TagsJson.encode(tags),
)
