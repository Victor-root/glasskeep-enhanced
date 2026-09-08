package com.glasskeep.app.nativeapp.data.network

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST

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

interface GlassKeepApi {
    @POST("api/login")
    suspend fun login(@Body body: LoginRequest): Response<LoginResponse>

    @GET("api/notes")
    suspend fun getNotes(): Response<List<NoteDto>>
}
