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

/** Body for POST /api/notes. The server defaults every other field (title,
 *  content, items...) to empty on its own, so creating a blank note only
 *  needs the type. */
@Serializable
data class CreateNoteRequest(val type: String = "text")

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
}
