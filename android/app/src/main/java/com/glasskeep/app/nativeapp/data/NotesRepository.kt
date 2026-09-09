package com.glasskeep.app.nativeapp.data

import com.glasskeep.app.nativeapp.NativeDebug
import com.glasskeep.app.nativeapp.data.local.NoteDao
import com.glasskeep.app.nativeapp.data.local.NoteEntity
import com.glasskeep.app.nativeapp.data.local.SyncQueueDao
import com.glasskeep.app.nativeapp.data.local.SyncQueueType
import com.glasskeep.app.nativeapp.data.network.ArchiveNoteRequest
import com.glasskeep.app.nativeapp.data.network.ChangePasswordRequest
import com.glasskeep.app.nativeapp.data.network.ClientUpdatedAtRequest
import com.glasskeep.app.nativeapp.data.network.CreateNoteRequest
import com.glasskeep.app.nativeapp.data.network.DeviceLinkInfoResponse
import com.glasskeep.app.nativeapp.data.network.DeviceLinkTokenRequest
import com.glasskeep.app.nativeapp.data.network.GlassKeepApi
import com.glasskeep.app.nativeapp.data.network.NoteDto
import com.glasskeep.app.nativeapp.data.network.PasskeyCeremonyOptionsResponse
import com.glasskeep.app.nativeapp.data.network.PasskeyDto
import com.glasskeep.app.nativeapp.data.network.PasskeyRegisterVerifyRequest
import com.glasskeep.app.nativeapp.data.network.PatchNoteRequest
import com.glasskeep.app.nativeapp.data.network.ProfileDto
import com.glasskeep.app.nativeapp.data.network.SetAvatarRequest
import com.glasskeep.app.nativeapp.data.network.SetChecklistInsertPositionRequest
import com.glasskeep.app.nativeapp.data.network.SetChecklistItemsRequest
import com.glasskeep.app.nativeapp.data.network.SetColorRequest
import com.glasskeep.app.nativeapp.data.network.SetImagesRequest
import com.glasskeep.app.nativeapp.data.network.SetLanguageRequest
import com.glasskeep.app.nativeapp.data.network.SetPinnedRequest
import com.glasskeep.app.nativeapp.data.network.SetReminderRequest
import com.glasskeep.app.nativeapp.data.network.SetShellThemeRequest
import com.glasskeep.app.nativeapp.data.network.SetShowOnLoginRequest
import com.glasskeep.app.nativeapp.data.network.SetTagsRequest
import com.glasskeep.app.nativeapp.data.network.UserDto
import kotlinx.coroutines.flow.Flow
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement

/** Outcome of a note save. Stale/ReadOnly are real, expected server
 *  answers (see PATCH /api/notes/:id), not bugs, the caller shows each
 *  one differently instead of pretending the write always succeeds. */
sealed class SaveNoteResult {
    data class Saved(val note: NoteDto) : SaveNoteResult()
    data object Stale : SaveNoteResult()
    data object ReadOnly : SaveNoteResult()
    /** Trash-only: the caller no longer has any version of the original
     *  note to show (left a shared note, or an owner transferred it away
     *  by leaving). See NotesRepository.trashNote() and
     *  NoteMutationResponse's own doc comment. */
    data object Left : SaveNoteResult()
}

/** Outcome of a permanent delete: unlike SaveNoteResult, success leaves no
 *  note to hand back, the row is gone (see DELETE /api/notes/:id/permanent). */
sealed class DeleteResult {
    data object Deleted : DeleteResult()
    data object Stale : DeleteResult()
}

/** Outcome of a password change. Rejected carries the HTTP code rather
 *  than the server's own error text: same convention NativeLoginScreen
 *  already uses for its own rejected-login message, not a new one. */
sealed class ChangePasswordResult {
    data class Saved(val token: String, val user: UserDto) : ChangePasswordResult()
    data class Rejected(val httpCode: Int) : ChangePasswordResult()
}

class NotesRepository(
    private val api: GlassKeepApi,
    private val noteDao: NoteDao,
    private val syncQueueDao: SyncQueueDao,
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
        // See NoteDao.replaceAll's own doc comment: a note with a queued,
        // not-yet-confirmed archive/trash/restore (see the *Queued methods
        // below) must not have this refresh's now-stale server snapshot
        // silently undo its optimistic local state.
        noteDao.replaceAll(notes.map { it.toEntity() }, syncQueueDao.getProtectedNoteIds().toSet())
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
    suspend fun patchNote(id: String, title: String, content: String, clientUpdatedAt: String = nowIso()): SaveNoteResult {
        NativeDebug.d("NotesRepository.patchNote id=$id")
        val response = api.patchNote(id, PatchNoteRequest(title, content, clientUpdatedAt))
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
    suspend fun setArchived(id: String, archived: Boolean, clientUpdatedAt: String = nowIso()): SaveNoteResult {
        NativeDebug.d("NotesRepository.setArchived id=$id archived=$archived")
        val response = api.archiveNote(id, ArchiveNoteRequest(archived, clientUpdatedAt))
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
    suspend fun trashNote(id: String, clientUpdatedAt: String = nowIso()): SaveNoteResult {
        NativeDebug.d("NotesRepository.trashNote id=$id")
        val response = api.trashNote(id, ClientUpdatedAtRequest(clientUpdatedAt))
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
        // A shared note: this user left it (or, as owner, transferred it
        // away by leaving), see NoteMutationResponse's own doc comment.
        // There's no updated version of the original note to hand back,
        // only a personal trashedCopy under a different id that this
        // screen has no reason to load (the caller navigates back either
        // way). Either branch means it's gone from this user's active
        // list, same local cleanup as an ordinary trash below.
        if (body.left) {
            NativeDebug.d("NotesRepository.trashNote id=$id: left (no longer accessible to this user)")
            noteDao.deleteById(id)
            return SaveNoteResult.Left
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
    suspend fun restoreNote(id: String, clientUpdatedAt: String = nowIso()): SaveNoteResult {
        NativeDebug.d("NotesRepository.restoreNote id=$id")
        val response = api.restoreNote(id, ClientUpdatedAtRequest(clientUpdatedAt))
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
    suspend fun deleteNotePermanently(id: String, clientUpdatedAt: String = nowIso()): DeleteResult {
        NativeDebug.d("NotesRepository.deleteNotePermanently id=$id")
        val response = api.deleteNotePermanently(id, ClientUpdatedAtRequest(clientUpdatedAt))
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
    suspend fun setColor(id: String, color: String, clientUpdatedAt: String = nowIso()): SaveNoteResult {
        NativeDebug.d("NotesRepository.setColor id=$id color=$color")
        val response = api.setColor(id, SetColorRequest(color, clientUpdatedAt))
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
    suspend fun setTags(id: String, tags: List<String>, clientUpdatedAt: String = nowIso()): SaveNoteResult {
        NativeDebug.d("NotesRepository.setTags id=$id tags=$tags")
        val response = api.setTags(id, SetTagsRequest(tags, clientUpdatedAt))
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
    suspend fun setChecklistItems(id: String, items: List<JsonElement>, clientUpdatedAt: String = nowIso()): SaveNoteResult {
        NativeDebug.d("NotesRepository.setChecklistItems id=$id count=${items.size}")
        val response = api.setChecklistItems(id, SetChecklistItemsRequest(items = items, clientUpdatedAt = clientUpdatedAt))
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
    suspend fun setImages(id: String, images: List<JsonElement>, clientUpdatedAt: String = nowIso()): SaveNoteResult {
        NativeDebug.d("NotesRepository.setImages id=$id count=${images.size}")
        val response = api.setImages(id, SetImagesRequest(images = images, clientUpdatedAt = clientUpdatedAt))
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

    // ---- Offline sync queue (see SyncQueueWorker.kt) ------------------
    // NoteDetailScreen.kt calls these instead of the direct methods above:
    // the intended request body is written to Room's own sync_queue table
    // immediately (see SyncQueueDao.enqueue, which collapses a second edit
    // to the same note+field into the still-pending one rather than
    // stacking a duplicate) and the caller updates its own on-screen state
    // optimistically, the same local-first shape autoSaveTextNote() uses
    // on the web. SyncQueueWorker drains this in the background, replaying
    // each item with ITS captured clientUpdatedAt (not a fresh one at
    // replay time, which would corrupt the LWW comparison the timestamp
    // exists for). The direct methods above are unchanged and still used
    // by SyncQueueWorker's own replay, and by every screen besides
    // NoteDetailScreen.kt, which don't queue yet (see this and the
    // milestone-1 commit messages for the follow-up tasks).
    suspend fun patchNoteQueued(id: String, title: String, content: String) {
        NativeDebug.d("NotesRepository.patchNoteQueued id=$id")
        val request = PatchNoteRequest(title, content, nowIso())
        syncQueueDao.enqueue(id, SyncQueueType.TITLE_CONTENT.name, Json.encodeToString(request), System.currentTimeMillis())
    }

    suspend fun setColorQueued(id: String, color: String) {
        NativeDebug.d("NotesRepository.setColorQueued id=$id color=$color")
        val request = SetColorRequest(color, nowIso())
        syncQueueDao.enqueue(id, SyncQueueType.COLOR.name, Json.encodeToString(request), System.currentTimeMillis())
    }

    suspend fun setTagsQueued(id: String, tags: List<String>) {
        NativeDebug.d("NotesRepository.setTagsQueued id=$id tags=$tags")
        val request = SetTagsRequest(tags, nowIso())
        syncQueueDao.enqueue(id, SyncQueueType.TAGS.name, Json.encodeToString(request), System.currentTimeMillis())
    }

    suspend fun setChecklistItemsQueued(id: String, items: List<JsonElement>) {
        NativeDebug.d("NotesRepository.setChecklistItemsQueued id=$id count=${items.size}")
        val request = SetChecklistItemsRequest(items = items, clientUpdatedAt = nowIso())
        syncQueueDao.enqueue(id, SyncQueueType.CHECKLIST_ITEMS.name, Json.encodeToString(request), System.currentTimeMillis())
    }

    suspend fun setImagesQueued(id: String, images: List<JsonElement>) {
        NativeDebug.d("NotesRepository.setImagesQueued id=$id count=${images.size}")
        val request = SetImagesRequest(images = images, clientUpdatedAt = nowIso())
        syncQueueDao.enqueue(id, SyncQueueType.IMAGES.name, Json.encodeToString(request), System.currentTimeMillis())
    }

    /** Per-user state, no LWW/stale concept (see setPinned's own doc
     *  comment): queued only for offline parity, not for any conflict this
     *  note's other fields need guarding against. No noteDao mutation
     *  either, same reasoning: the caller (NoteDetailScreen.togglePin)
     *  already updates its own on-screen state directly and stays on the
     *  same screen, unlike the four actions below. */
    suspend fun setPinnedQueued(id: String, pinned: Boolean) {
        NativeDebug.d("NotesRepository.setPinnedQueued id=$id pinned=$pinned")
        val request = SetPinnedRequest(pinned)
        syncQueueDao.enqueue(id, SyncQueueType.PINNED.name, Json.encodeToString(request), System.currentTimeMillis())
    }

    /** Unlike the patch-style methods above, this one (and trashNoteQueued/
     *  restoreNoteQueued/deleteNotePermanentlyQueued below) also mutates
     *  the local cache optimistically, immediately: their callers navigate
     *  back to the notes list right after enqueueing, and that list
     *  refreshes itself on every return (see NativeNotesListScreen.kt),
     *  which would otherwise race the still-pending queued item and
     *  silently undo this action until it actually reaches the server
     *  (see NoteDao.replaceAll's own doc comment for the other half of
     *  this fix). [note] provides the full row: unarchiving needs it to
     *  reinsert the note into the active-list cache, not just archiving's
     *  own removal. */
    suspend fun setArchivedQueued(note: NoteDto, archived: Boolean) {
        NativeDebug.d("NotesRepository.setArchivedQueued id=${note.id} archived=$archived")
        val request = ArchiveNoteRequest(archived, nowIso())
        syncQueueDao.enqueue(note.id, SyncQueueType.ARCHIVE.name, Json.encodeToString(request), System.currentTimeMillis())
        if (archived) noteDao.deleteById(note.id) else noteDao.upsertAll(listOf(note.toEntity()))
    }

    suspend fun trashNoteQueued(id: String) {
        NativeDebug.d("NotesRepository.trashNoteQueued id=$id")
        val request = ClientUpdatedAtRequest(nowIso())
        syncQueueDao.enqueue(id, SyncQueueType.TRASH.name, Json.encodeToString(request), System.currentTimeMillis())
        noteDao.deleteById(id)
    }

    /** [note] is the trashed note being restored (as loaded by
     *  NoteDetailScreen, still carrying its pre-trash fields): reinserted
     *  into the active-list cache optimistically, same reasoning as
     *  setArchivedQueued's unarchive branch. */
    suspend fun restoreNoteQueued(note: NoteDto) {
        NativeDebug.d("NotesRepository.restoreNoteQueued id=${note.id}")
        val request = ClientUpdatedAtRequest(nowIso())
        syncQueueDao.enqueue(note.id, SyncQueueType.RESTORE.name, Json.encodeToString(request), System.currentTimeMillis())
        noteDao.upsertAll(listOf(note.toEntity()))
    }

    /** No noteDao mutation: a trashed note was never cached locally to
     *  begin with (see deleteNotePermanently's own doc comment), so
     *  there's nothing here to optimistically remove. */
    suspend fun deleteNotePermanentlyQueued(id: String) {
        NativeDebug.d("NotesRepository.deleteNotePermanentlyQueued id=$id")
        val request = ClientUpdatedAtRequest(nowIso())
        syncQueueDao.enqueue(id, SyncQueueType.PERMANENT_DELETE.name, Json.encodeToString(request), System.currentTimeMillis())
    }

    /** How many of this note's edits are still waiting to reach the
     *  server; drives NoteDetailScreen's small "Syncing…" indicator. */
    fun observePendingSyncCount(noteId: String): Flow<Int> = syncQueueDao.observePendingCountForNote(noteId)

    /** Sets, moves, or clears (reminderAtIso == null) a note's reminder.
     *  Its own dedicated route (see GlassKeepApi.setReminder), not the
     *  generic PATCH, but the same narrow-body/stale-checked shape as
     *  setColor()/setTags(). Mirrored into the local cache so the list
     *  card's reminder chip and NativeNavHost's alarm reconciliation (see
     *  ReminderSync.kt) see the change immediately, without a refresh(). */
    suspend fun setReminder(id: String, reminderAtIso: String?): SaveNoteResult {
        NativeDebug.d("NotesRepository.setReminder id=$id reminderAt=$reminderAtIso")
        val response = api.setReminder(id, SetReminderRequest(reminderAtIso, nowIso()))
        val body = response.body()
        if (!response.isSuccessful || body == null) {
            val error = "POST /api/notes/$id/reminder failed: HTTP ${response.code()} ${response.errorBody()?.string()}"
            NativeDebug.e(error)
            throw IllegalStateException(error)
        }
        if (body.stale) {
            NativeDebug.d("NotesRepository.setReminder id=$id: stale, not applied")
            return SaveNoteResult.Stale
        }
        val saved = body.note ?: throw IllegalStateException("POST /api/notes/$id/reminder: ok response with no note")
        noteDao.upsertAll(listOf(saved.toEntity()))
        return SaveNoteResult.Saved(saved)
    }

    /** This user's saved "new checklist item position" preference
     *  ("top"/"bottom", see App.jsx's checklistInsertPosition), read from
     *  the generic settings blob so the native editor's Enter-to-add-item
     *  behavior matches whatever the user already has configured on the
     *  web app instead of guessing a hardcoded default. Best-effort: a
     *  wrong-but-harmless default (the web's own fresh-install default) is
     *  a better outcome for a background read like this one than blocking
     *  checklist editing over it; SettingsScreen's own read (for the
     *  picker itself) surfaces a real failure instead, see setReminder's
     *  sibling actions below for that shape. */
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

    /** Sets the checklist insert-position preference ("top"/"bottom").
     *  Same narrow-body PATCH /api/user/settings pattern as setShellTheme;
     *  unlike fetchChecklistInsertPosition's own best-effort read, this is
     *  a deliberate user action from SettingsScreen and surfaces a real
     *  failure rather than silently keeping the old value. */
    suspend fun setChecklistInsertPosition(position: String) {
        NativeDebug.d("NotesRepository.setChecklistInsertPosition position=$position")
        val response = api.setChecklistInsertPosition(SetChecklistInsertPositionRequest(position))
        if (!response.isSuccessful) {
            val error = "PATCH /api/user/settings (checklistInsertPosition) failed: HTTP ${response.code()} ${response.errorBody()?.string()}"
            NativeDebug.e(error)
            throw IllegalStateException(error)
        }
    }

    /** Best-effort read of this user's saved workspace theme id (see
     *  WorkspaceTheme.kt), same settings blob as fetchChecklistInsertPosition.
     *  Null on any failure or if the user never picked one; the caller
     *  (ThemeState) decides the default rather than this data-layer class
     *  depending on the ui-layer WorkspaceTheme object for one constant. */
    suspend fun fetchShellTheme(): String? {
        return try {
            val response = api.getUserSettings()
            if (response.isSuccessful) response.body()?.shellTheme else null
        } catch (t: Throwable) {
            NativeDebug.e("NotesRepository.fetchShellTheme failed", t)
            null
        }
    }

    /** Sets the workspace theme preference. Deliberate user action from
     *  SettingsScreen's theme picker, surfaces a real failure. */
    suspend fun setShellTheme(themeId: String) {
        NativeDebug.d("NotesRepository.setShellTheme id=$themeId")
        val response = api.setShellTheme(SetShellThemeRequest(themeId))
        if (!response.isSuccessful) {
            val error = "PATCH /api/user/settings (shellTheme) failed: HTTP ${response.code()} ${response.errorBody()?.string()}"
            NativeDebug.e(error)
            throw IllegalStateException(error)
        }
    }

    /** Full profile for the Settings screen (name/email are read-only,
     *  see SetShowOnLoginRequest/SetLanguageRequest for what's actually
     *  editable: no route accepts changing either on the web either). */
    suspend fun fetchProfile(): ProfileDto {
        NativeDebug.d("NotesRepository.fetchProfile")
        val response = api.getProfile()
        val profile = response.body()
        if (!response.isSuccessful || profile == null) {
            val error = "GET /api/user/profile failed: HTTP ${response.code()} ${response.errorBody()?.string()}"
            NativeDebug.e(error)
            throw IllegalStateException(error)
        }
        return profile
    }

    /** Returns the server's own confirmed value, not just an echo of what
     *  was requested: patchNote()'s "trust the response" convention. */
    suspend fun setShowOnLogin(value: Boolean): Boolean {
        NativeDebug.d("NotesRepository.setShowOnLogin value=$value")
        val response = api.setShowOnLogin(SetShowOnLoginRequest(value))
        val body = response.body()
        if (!response.isSuccessful || body == null) {
            val error = "PATCH /api/user/profile (show_on_login) failed: HTTP ${response.code()} ${response.errorBody()?.string()}"
            NativeDebug.e(error)
            throw IllegalStateException(error)
        }
        return body.showOnLogin
    }

    suspend fun setLanguage(value: String?): String? {
        NativeDebug.d("NotesRepository.setLanguage value=$value")
        val response = api.setLanguage(SetLanguageRequest(value))
        val body = response.body()
        if (!response.isSuccessful || body == null) {
            val error = "PATCH /api/user/profile (language) failed: HTTP ${response.code()} ${response.errorBody()?.string()}"
            NativeDebug.e(error)
            throw IllegalStateException(error)
        }
        return body.language
    }

    /** [dataUrl] must already be a compressed image/jpeg or image/png data
     *  URL (see ImageCompression.compressToDataUrl): the server rejects
     *  anything else or over ~1.5MB decoded. Returns the confirmed URL. */
    suspend fun setAvatar(dataUrl: String): String? {
        NativeDebug.d("NotesRepository.setAvatar")
        val response = api.setAvatar(SetAvatarRequest(dataUrl))
        val body = response.body()
        if (!response.isSuccessful || body == null) {
            val error = "PUT /api/user/avatar failed: HTTP ${response.code()} ${response.errorBody()?.string()}"
            NativeDebug.e(error)
            throw IllegalStateException(error)
        }
        return body.avatarUrl
    }

    suspend fun removeAvatar() {
        NativeDebug.d("NotesRepository.removeAvatar")
        val response = api.deleteAvatar()
        if (!response.isSuccessful) {
            val error = "DELETE /api/user/avatar failed: HTTP ${response.code()} ${response.errorBody()?.string()}"
            NativeDebug.e(error)
            throw IllegalStateException(error)
        }
    }

    /** On success the server issues a fresh token and invalidates every
     *  other session (see server/index.js's token_version bump): the
     *  caller must store the returned token (mirrors NativeLoginScreen's
     *  own container.tokenStore.token = ... at its call site) or every
     *  request after this one fails as unauthorized. */
    suspend fun changePassword(currentPassword: String?, newPassword: String): ChangePasswordResult {
        NativeDebug.d("NotesRepository.changePassword")
        val response = api.changePassword(ChangePasswordRequest(currentPassword, newPassword))
        val token = response.body()?.token
        val user = response.body()?.user
        if (!response.isSuccessful || token == null || user == null) {
            NativeDebug.e("NotesRepository.changePassword rejected: HTTP ${response.code()}")
            return ChangePasswordResult.Rejected(response.code())
        }
        return ChangePasswordResult.Saved(token, user)
    }

    /** Rotates and returns this account's secret recovery key in plain
     *  text (Settings screen's Security section). The server never
     *  returns it again after this call, only its hash is kept. */
    suspend fun generateSecretKey(): String {
        NativeDebug.d("NotesRepository.generateSecretKey")
        val response = api.generateSecretKey()
        val key = response.body()?.key
        if (!response.isSuccessful || key == null) {
            val error = "POST /api/secret-key failed: HTTP ${response.code()} ${response.errorBody()?.string()}"
            NativeDebug.e(error)
            throw IllegalStateException(error)
        }
        return key
    }

    /** Registered passkeys for this account (Settings screen's passkey
     *  management section). */
    suspend fun listPasskeys(): List<PasskeyDto> {
        NativeDebug.d("NotesRepository.listPasskeys")
        val response = api.listPasskeys()
        val body = response.body()
        if (!response.isSuccessful || body == null) {
            val error = "GET /api/passkeys failed: HTTP ${response.code()} ${response.errorBody()?.string()}"
            NativeDebug.e(error)
            throw IllegalStateException(error)
        }
        return body.passkeys
    }

    /** Starts a passkey registration ceremony: the caller re-serializes
     *  the returned `options` to a string and hands it to
     *  NativePasskeys.register(), then calls [verifyPasskeyRegistration]
     *  with what comes back. Kept as two separate calls rather than one
     *  that also drives Credential Manager, so this repository stays
     *  Activity-agnostic; the orchestration lives in SettingsScreen. */
    suspend fun fetchPasskeyRegisterOptions(): PasskeyCeremonyOptionsResponse {
        NativeDebug.d("NotesRepository.fetchPasskeyRegisterOptions")
        val response = api.passkeyRegisterOptions()
        val body = response.body()
        if (!response.isSuccessful || body == null) {
            val error = "POST /api/passkeys/register/options failed: HTTP ${response.code()} ${response.errorBody()?.string()}"
            NativeDebug.e(error)
            throw IllegalStateException(error)
        }
        return body
    }

    /** [responseJson] is Credential Manager's own RegistrationResponseJSON
     *  string, already parsed into a JsonElement by the caller (see
     *  PasskeyRegisterVerifyRequest.response's own doc comment for why). */
    suspend fun verifyPasskeyRegistration(responseJson: JsonElement, challengeId: String, name: String) {
        NativeDebug.d("NotesRepository.verifyPasskeyRegistration")
        val response = api.passkeyRegisterVerify(PasskeyRegisterVerifyRequest(responseJson, challengeId, name))
        if (!response.isSuccessful || response.body()?.ok != true) {
            val error = "POST /api/passkeys/register/verify failed: HTTP ${response.code()} ${response.errorBody()?.string()}"
            NativeDebug.e(error)
            throw IllegalStateException(error)
        }
    }

    suspend fun deletePasskey(credentialId: String) {
        NativeDebug.d("NotesRepository.deletePasskey id=$credentialId")
        val response = api.deletePasskey(credentialId)
        if (!response.isSuccessful) {
            val error = "DELETE /api/passkeys/$credentialId failed: HTTP ${response.code()} ${response.errorBody()?.string()}"
            NativeDebug.e(error)
            throw IllegalStateException(error)
        }
    }

    suspend fun fetchDeviceLinkInfo(token: String): DeviceLinkInfoResponse {
        NativeDebug.d("NotesRepository.fetchDeviceLinkInfo")
        val response = api.deviceLinkInfo(token)
        val body = response.body()
        if (!response.isSuccessful || body == null) {
            val error = "GET /api/device-link/info failed: HTTP ${response.code()} ${response.errorBody()?.string()}"
            NativeDebug.e(error)
            throw IllegalStateException(error)
        }
        return body
    }

    suspend fun approveDeviceLink(token: String) {
        NativeDebug.d("NotesRepository.approveDeviceLink")
        val response = api.approveDeviceLink(DeviceLinkTokenRequest(token))
        if (!response.isSuccessful) {
            val error = "POST /api/device-link/approve failed: HTTP ${response.code()} ${response.errorBody()?.string()}"
            NativeDebug.e(error)
            throw IllegalStateException(error)
        }
    }

    suspend fun rejectDeviceLink(token: String) {
        NativeDebug.d("NotesRepository.rejectDeviceLink")
        val response = api.rejectDeviceLink(DeviceLinkTokenRequest(token))
        if (!response.isSuccessful) {
            val error = "POST /api/device-link/reject failed: HTTP ${response.code()} ${response.errorBody()?.string()}"
            NativeDebug.e(error)
            throw IllegalStateException(error)
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
    reminderAt = reminderAt,
)
