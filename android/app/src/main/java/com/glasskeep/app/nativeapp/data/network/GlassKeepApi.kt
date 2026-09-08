package com.glasskeep.app.nativeapp.data.network

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.Path

@Serializable
data class LoginRequest(val email: String, val password: String)

@Serializable
data class UserDto(
    val id: Int,
    val name: String,
    val email: String,
    @SerialName("is_admin") val isAdmin: Boolean = false,
    @SerialName("avatar_url") val avatarUrl: String? = null,
    val language: String? = null,
)

@Serializable
data class LoginResponse(
    val token: String,
    val user: UserDto,
    @SerialName("must_change_password") val mustChangePassword: Boolean = false,
)

/**
 * Mirrors serializeNote() in server/index.js field for field. Fields the
 * native app doesn't use yet (items/tags/images and friends) are still
 * declared so a future milestone can read them without touching this DTO;
 * `ignoreUnknownKeys` (see ApiClientFactory) covers whatever's left out.
 */
@Serializable
data class NoteDto(
    val id: String,
    @SerialName("user_id") val userId: Int,
    val type: String,
    val title: String,
    val content: String,
    val items: List<JsonElement> = emptyList(),
    val tags: List<String> = emptyList(),
    val color: String,
    val pinned: Boolean = false,
    val position: Double = 0.0,
    val timestamp: String? = null,
    @SerialName("updated_at") val updatedAt: String? = null,
    @SerialName("client_updated_at") val clientUpdatedAt: String? = null,
    val archived: Boolean = false,
    val trashed: Boolean = false,
)

/**
 * Body for PATCH /api/notes/:id. Deliberately narrow: only title/content
 * are ever sent from the native note-detail screen today. The server only
 * touches fields actually present in the request (see server/index.js,
 * the `p` object in the PATCH handler defaults everything else to null),
 * so items/images/tags/color/type on the note are left exactly as they
 * were. PUT would be the wrong endpoint here: it's a full replace and
 * silently wipes any field you don't resend.
 */
@Serializable
data class PatchNoteRequest(
    val title: String,
    val content: String,
    @SerialName("client_updated_at") val clientUpdatedAt: String,
)

/** Body for POST /api/notes. The server defaults every field but `type` to
 *  empty on its own, so creating a blank note only needs the type. The
 *  other fields exist for duplicateNote(), which fills them in from the
 *  note being copied; `items` stays opaque JSON (never inspected, just
 *  relayed) since native doesn't understand checklist item shape yet. */
@Serializable
data class CreateNoteRequest(
    val type: String = "text",
    val title: String? = null,
    val content: String? = null,
    val color: String? = null,
    val items: List<JsonElement>? = null,
)

/** Body for a pin-only PATCH /api/notes/:id. Pin is per-user state, not
 *  LWW-protected content, so unlike PatchNoteRequest this deliberately
 *  carries no client_updated_at: sending only `pinned` is what makes the
 *  server take its fast per-user path instead of the shared-content one
 *  (see the handler's hasSharedChange check). */
@Serializable
data class SetPinnedRequest(val pinned: Boolean)

/** Body for POST /api/notes/:id/archive. */
@Serializable
data class ArchiveNoteRequest(
    val archived: Boolean,
    @SerialName("client_updated_at") val clientUpdatedAt: String,
)

/** Body for POST /api/notes/:id/trash (soft delete, the modern replacement
 *  for the deprecated DELETE /api/notes/:id, which now returns 410). */
@Serializable
data class TrashNoteRequest(@SerialName("client_updated_at") val clientUpdatedAt: String)

/** Body for a color-only PATCH /api/notes/:id. Separate from
 *  PatchNoteRequest (title/content) so title/content stay untouched: the
 *  server only writes fields actually present in the JSON body, and color
 *  is LWW-guarded shared content, unlike pin, so client_updated_at is
 *  required here. */
@Serializable
data class SetColorRequest(
    val color: String,
    @SerialName("client_updated_at") val clientUpdatedAt: String,
)

/** Shared response shape for PUT/PATCH on a note: `stale` means someone
 *  else changed it first (LWW lost, `note` is the server's current copy,
 *  nothing was written); `readOnly` means the caller isn't allowed to
 *  edit it right now (revoked access, or a federation mirror). */
@Serializable
data class NoteMutationResponse(
    val ok: Boolean = false,
    val stale: Boolean = false,
    val readOnly: Boolean = false,
    val note: NoteDto? = null,
)

interface GlassKeepApi {
    @POST("api/login")
    suspend fun login(@Body body: LoginRequest): Response<LoginResponse>

    @GET("api/notes")
    suspend fun getNotes(): Response<List<NoteDto>>

    @POST("api/notes")
    suspend fun createNote(@Body body: CreateNoteRequest): Response<NoteDto>

    @GET("api/notes/{id}")
    suspend fun getNote(@Path("id") id: String): Response<NoteDto>

    @PATCH("api/notes/{id}")
    suspend fun patchNote(@Path("id") id: String, @Body body: PatchNoteRequest): Response<NoteMutationResponse>

    @PATCH("api/notes/{id}")
    suspend fun setPinned(@Path("id") id: String, @Body body: SetPinnedRequest): Response<NoteMutationResponse>

    @POST("api/notes/{id}/archive")
    suspend fun archiveNote(@Path("id") id: String, @Body body: ArchiveNoteRequest): Response<NoteMutationResponse>

    @POST("api/notes/{id}/trash")
    suspend fun trashNote(@Path("id") id: String, @Body body: TrashNoteRequest): Response<NoteMutationResponse>

    @PATCH("api/notes/{id}")
    suspend fun setColor(@Path("id") id: String, @Body body: SetColorRequest): Response<NoteMutationResponse>
}
