package com.glasskeep.app.nativeapp.data.network

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.PUT
import retrofit2.http.Path
import retrofit2.http.Query

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

/** Body for POST /api/login/secret. Server compares against every
 *  account's hashed secret key and returns the exact same shape as
 *  /api/login (see LoginResponse), reused here rather than re-declared. */
@Serializable
data class SecretKeyLoginRequest(val key: String)

/** Response for POST /api/secret-key: a freshly generated, rotated key,
 *  shown to the user exactly once (the server only ever stores its hash,
 *  see server/index.js's generateSecretKey/updateSecretForUser). */
@Serializable
data class SecretKeyResponse(val key: String)

/**
 * Mirrors serializeNote() in server/index.js field for field. Fields the
 * native app doesn't use yet are still declared so a future milestone can
 * read them without touching this DTO; `ignoreUnknownKeys` (see
 * ApiClientFactory) covers whatever's left out (icon, collaborators, ...).
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
    val images: List<JsonElement> = emptyList(),
    val color: String,
    val pinned: Boolean = false,
    val position: Double = 0.0,
    val timestamp: String? = null,
    @SerialName("updated_at") val updatedAt: String? = null,
    @SerialName("client_updated_at") val clientUpdatedAt: String? = null,
    val archived: Boolean = false,
    val trashed: Boolean = false,
    /** This user's access level on this note: "owner" | "write" | "read".
     *  Computed server-side (see server/index.js's noteAccessFor), always
     *  present on every note object the server returns, never sent by the
     *  client. A "read" collaborator can still view/pin/set a reminder on
     *  the note, but every other mutation (title/content/color/tags/
     *  checklist/images, archive/restore/permanent-delete) must be blocked
     *  client-side too, not just left to the server's own readOnly/403
     *  rejection: see NoteDetailScreen.kt's isReadOnlyAccess/isOwnerAccess. */
    val access: String,
    /** ISO-8601 UTC instant, or null when the note has no reminder. Plain
     *  columns server-side, never encrypted (see server/index.js's
     *  ensureNoteColumns migration), so unlike title/content this is
     *  always readable regardless of at-rest encryption unlock state. */
    val reminderAt: String? = null,
    /** When the scheduler already dispatched this reminder's notification
     *  (null = still pending/not due). Native doesn't read this today
     *  (see NotesRepository.setReminder, which always clears it server-side
     *  on set/move), declared for parity with serializeNote(). */
    val reminderFiredAt: String? = null,
    /** Every OTHER participant on this note (never includes the caller
     *  themselves), null when there are none. Only GET /api/notes and
     *  GET /api/notes/:id embed this (server's getNoteParticipants(),
     *  narrower than the dedicated GET /api/notes/:id/collaborators
     *  endpoint: no isOwner/addedAt/addedBy here); archived/trashed
     *  listings don't include it at all, which is fine, this only ever
     *  needs to answer "does this note have collaborators worth a
     *  roster screen" for NoteDetailScreen.kt, reached from every list
     *  through the same GET /api/notes/:id. */
    val collaborators: List<CollaboratorDto>? = null,
)

/** One participant on a note: mirrors participantObj() (server/index.js)
 *  field for field. canWrite is a raw 0/1 from the server (u.can_write
 *  === 0 ? 0 : 1), not a JSON boolean, so it's declared Int here, not
 *  Boolean, to avoid a deserialization failure on real data.
 *  addedAt/addedBy are only ever present on a collaborator entry (never
 *  the owner's); isOwner is only ever true on the owner's entry, absent
 *  (not false) on every collaborator entry. */
@Serializable
data class CollaboratorDto(
    val id: Int,
    val name: String,
    val email: String,
    @SerialName("avatar_url") val avatarUrl: String? = null,
    val federated: Boolean = false,
    val serverLabel: String? = null,
    val canWrite: Int = 1,
    @SerialName("added_at") val addedAt: String? = null,
    @SerialName("added_by") val addedBy: Int? = null,
    val isOwner: Boolean = false,
)

/** One notification row. `type` is one of a fixed set the server creates
 *  (note_shared, note_access_revoked[_with_copy], collaborator_removed
 *  [_with_copy], collaborator_left, shared_note_deleted[_with_copy], plus
 *  a few admin-only/reminder types this screen renders generically rather
 *  than specially, see server/index.js's insertNotification call sites.
 *  deliveredAt is the one read/unread bit: absent (null) on
 *  GET /notifications/pending, present on GET /notifications/history.
 *  persistent is a raw 0/1 from the server, not a JSON boolean, same
 *  reasoning as CollaboratorDto.canWrite. */
@Serializable
data class NotificationDto(
    val id: Int,
    @SerialName("sender_user_id") val senderUserId: Int,
    val type: String,
    @SerialName("note_id") val noteId: String? = null,
    @SerialName("note_title") val noteTitle: String = "",
    @SerialName("sender_name") val senderName: String = "",
    val variant: String? = null,
    val message: String? = null,
    val persistent: Int = 0,
    val icon: String? = null,
    @SerialName("created_at") val createdAt: String,
    @SerialName("delivered_at") val deliveredAt: String? = null,
)

@Serializable
data class NotificationListResponse(val notifications: List<NotificationDto> = emptyList())

@Serializable
data class NotificationIdsRequest(val ids: List<Int>)

@Serializable
data class NotificationActionResponse(val ok: Boolean = false)

/** Body for POST /api/notes/:id/collaborate. access is always sent
 *  explicitly ("read" or "write"), even though the server defaults it to
 *  "write" when omitted: one code path, no optional-omission branch. */
@Serializable
data class AddCollaboratorRequest(val username: String, val access: String)

/** Success shape only: `collaborator` is null on every error response
 *  (see NotesRepository.addCollaborator, which reads the HTTP status and
 *  error body instead for those). */
@Serializable
data class AddCollaboratorResponse(val ok: Boolean = false, val message: String? = null, val collaborator: CollaboratorDto? = null)

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
    val tags: List<String>? = null,
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

/** Body shape shared by every LWW-protected note action that needs nothing
 *  but a timestamp: POST .../trash (soft delete, the modern replacement for
 *  the deprecated DELETE /api/notes/:id, which now returns 410), POST
 *  .../restore, and DELETE .../permanent. */
@Serializable
data class ClientUpdatedAtRequest(@SerialName("client_updated_at") val clientUpdatedAt: String)

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

/** Body for a tags-only PATCH /api/notes/:id. Tags are stored per-user on
 *  the server (note_user_tags, not the shared notes row), but the PATCH
 *  handler still treats a `tags` array as a shared-content change
 *  (see hasSharedChange in server/index.js), so client_updated_at is
 *  required here too, same as color. */
@Serializable
data class SetTagsRequest(
    val tags: List<String>,
    @SerialName("client_updated_at") val clientUpdatedAt: String,
)

/** Body for a checklist-items PATCH /api/notes/:id. `items` is relayed as
 *  fully opaque JSON server-side (see server/index.js: no per-item
 *  validation, just "must be an array"), so JsonElement here mirrors
 *  NoteDto.items exactly. `type` is resent because that's what the web's
 *  own syncChecklistItems() sends (App.jsx), and `content` stays empty:
 *  a checklist note's content always does (see the PATCH handler's own
 *  type-aware content handling). */
@Serializable
data class SetChecklistItemsRequest(
    val items: List<JsonElement>,
    val type: String = "checklist",
    val content: String = "",
    @SerialName("client_updated_at") val clientUpdatedAt: String,
)

/** Body for an images-only PATCH /api/notes/:id. Same opaque-relay pattern
 *  as items/tags: the server only checks "is this an array" (see
 *  server/index.js), so JsonElement mirrors NoteDto.images exactly. Unlike
 *  the web (which folds images into a general metadata-autosave payload
 *  alongside title/content/tags/color), this stays as narrow a body as the
 *  rest of this file's Set*Request types, so title/content aren't touched
 *  by an image add/remove. */
@Serializable
data class SetImagesRequest(
    val images: List<JsonElement>,
    @SerialName("client_updated_at") val clientUpdatedAt: String,
)

/** Body for POST /api/notes/:id/reminder, its own dedicated route rather
 *  than the generic notes PATCH: reminder columns are plain (never
 *  encrypted), so the server keeps this out of the sensitive-field write
 *  path (see server/index.js). `reminderAt` null clears the reminder;
 *  a non-null value sets or moves it and clears reminder_fired_at
 *  server-side so it re-arms. */
@Serializable
data class SetReminderRequest(
    val reminderAt: String?,
    @SerialName("client_updated_at") val clientUpdatedAt: String,
)

/** Body-less read of this user's saved settings blob (GET /api/user/settings
 *  returns whatever arbitrary keys are stored; only the ones native reads
 *  are declared here, `ignoreUnknownKeys` covers the rest). Also the
 *  response shape of a PATCH to the same route (server/index.js: it
 *  echoes back the full merged blob, not just the field that was sent). */
@Serializable
data class UserSettingsDto(
    val checklistInsertPosition: String? = null,
    /** Chosen workspace theme id (see WorkspaceTheme.kt), or null for a
     *  user who never picked one (defaults to "glasskeep"). */
    val shellTheme: String? = null,
)

/** Body for a PATCH /api/user/settings that sets only the workspace theme.
 *  The server merges partial bodies into the existing settings blob, so
 *  this narrow request (like every Set*Request in this file) leaves
 *  every other stored setting untouched. */
@Serializable
data class SetShellThemeRequest(val shellTheme: String)

/** Body for a PATCH /api/user/settings that sets only the checklist
 *  insert-position preference ("top" or "bottom"). Same narrow-body,
 *  merge-only shape as SetShellThemeRequest. */
@Serializable
data class SetChecklistInsertPositionRequest(val checklistInsertPosition: String)

/** GET /api/user/profile response. Mirrors serializeNote()-adjacent
 *  server code (server/index.js) field for field; `name`/`email` are
 *  read-only here, same as the web: no route accepts changing either. */
@Serializable
data class ProfileDto(
    val id: Int,
    val name: String,
    val email: String,
    @SerialName("is_admin") val isAdmin: Boolean = false,
    @SerialName("avatar_url") val avatarUrl: String? = null,
    @SerialName("show_on_login") val showOnLogin: Boolean = true,
    val language: String? = null,
)

/** Response shape shared by both PATCH /api/user/profile narrow bodies
 *  below: the server always echoes both fields back regardless of which
 *  one was actually patched. */
@Serializable
data class ProfileMutationResponse(
    val ok: Boolean = false,
    @SerialName("show_on_login") val showOnLogin: Boolean = true,
    val language: String? = null,
)

/** Body for a profile PATCH that sets only show_on_login. Deliberately its
 *  own type rather than one combined request with both fields optional:
 *  kotlinx.serialization (see ApiClientFactory's Json config) serializes
 *  every declared property including nulls, so a combined request would
 *  send "language": null on every show_on_login-only change and silently
 *  clear the user's language preference. */
@Serializable
data class SetShowOnLoginRequest(@SerialName("show_on_login") val showOnLogin: Boolean)

/** Body for a profile PATCH that sets only language. `null` is a real,
 *  meaningful value here (clears the preference back to none), unlike
 *  SetShowOnLoginRequest's boolean, so this one field is genuinely
 *  nullable rather than narrowed further. */
@Serializable
data class SetLanguageRequest(val language: String?)

/** Body for PUT /api/user/avatar. The server only accepts a data: URL of
 *  image/png, image/jpeg or image/webp, ≤ ~2MB as base64 text (see
 *  server/index.js): ImageCompression.compressToDataUrl already only
 *  ever produces image/jpeg or image/png, so every avatar this app
 *  uploads is accepted by construction, not by hoping the limits line up. */
@Serializable
data class SetAvatarRequest(@SerialName("avatar_url") val avatarUrl: String)

/** Response shared by PUT and DELETE /api/user/avatar (DELETE's own
 *  avatarUrl is always absent/null, matching its `{ok: true}` body). */
@Serializable
data class AvatarMutationResponse(
    val ok: Boolean = false,
    @SerialName("avatar_url") val avatarUrl: String? = null,
)

/** Body for POST /api/user/change-password. `currentPassword` is required
 *  unless the account is still under a first-login temp password
 *  (server/index.js checks `must_change_password` itself; native has no
 *  way to know that ahead of the call, so it always sends whatever the
 *  user typed, including blank, and lets the server decide). */
@Serializable
data class ChangePasswordRequest(
    @SerialName("current_password") val currentPassword: String?,
    @SerialName("new_password") val newPassword: String,
)

/** The server replaces the whole session on a password change (fresh
 *  token, bumped token_version invalidates every other device's session),
 *  so this mirrors LoginResponse's shape rather than NoteMutationResponse. */
@Serializable
data class ChangePasswordResponse(
    val ok: Boolean = false,
    val token: String? = null,
    val user: UserDto? = null,
    @SerialName("must_change_password") val mustChangePassword: Boolean = false,
)

/** One registered passkey (GET /api/passkeys), mirrors passkeyRoutes.js's
 *  own serialization field for field. */
@Serializable
data class PasskeyDto(
    val credentialId: String,
    val name: String? = null,
    val deviceType: String? = null,
    val backedUp: Boolean = false,
    val prfSupported: Boolean = false,
    val canUnlockInstance: Boolean = false,
    val createdAt: String? = null,
    val lastUsedAt: String? = null,
)

@Serializable
data class PasskeyListResponse(
    val available: Boolean = false,
    val passkeys: List<PasskeyDto> = emptyList(),
)

/** Response shared by POST /api/passkeys/register/options and
 *  /login/options. `options` is an opaque WebAuthn
 *  PublicKeyCredentialCreationOptionsJSON / ...RequestOptionsJSON object
 *  from @simplewebauthn/server, deliberately never hand-modeled field by
 *  field (a future @simplewebauthn/server upgrade could change it):
 *  re-serialized as-is and handed straight to
 *  CreatePublicKeyCredentialRequest/GetPublicKeyCredentialOption (see
 *  NativePasskeys.kt), which parse that exact shape themselves. */
@Serializable
data class PasskeyCeremonyOptionsResponse(
    val options: JsonElement,
    val challengeId: String,
)

/** Body for POST /api/passkeys/register/verify. `response` is Credential
 *  Manager's own RegistrationResponseJSON string, parsed back into a
 *  JsonElement so it serializes here as a nested object (matching what
 *  the server destructures from its own request body) rather than a
 *  doubly-escaped string. Same opaque-relay reasoning as
 *  PasskeyCeremonyOptionsResponse.options. */
@Serializable
data class PasskeyRegisterVerifyRequest(
    val response: JsonElement,
    val challengeId: String,
    val name: String,
)

@Serializable
data class PasskeyRegisterVerifyResponse(
    val ok: Boolean = false,
    val credentialId: String? = null,
    val prfSupported: Boolean = false,
    val backedUp: Boolean = false,
)

/** Body for POST /api/passkeys/login/verify. Same opaque AuthenticationResponseJSON
 *  relay as PasskeyRegisterVerifyRequest.response. */
@Serializable
data class PasskeyLoginVerifyRequest(
    val response: JsonElement,
    val challengeId: String,
)

@Serializable
data class PasskeyMutationResponse(val ok: Boolean = false)

/** Response for GET /api/device-link/info, the PC's own user-agent and a
 *  masked IP (see deviceLinkRoutes.js's own maskIp()) so the phone can
 *  show a confirmation card before approving. Requires the phone to
 *  already be authenticated: this is never callable by an anonymous
 *  scanner. */
@Serializable
data class DeviceLinkInfoResponse(
    val status: String,
    val createdAt: String? = null,
    val expiresAt: String? = null,
    val userAgent: String? = null,
    val ip: String? = null,
)

/** Body shared by POST /api/device-link/approve and /reject. */
@Serializable
data class DeviceLinkTokenRequest(val token: String)

@Serializable
data class DeviceLinkActionResponse(val ok: Boolean = false)

/** Shared response shape for PUT/PATCH on a note: `stale` means someone
 *  else changed it first (LWW lost, `note` is the server's current copy,
 *  nothing was written); `readOnly` means the caller isn't allowed to
 *  edit it right now (revoked access, or a federation mirror).
 *
 *  `left`/`deletedForAll`/`trashedCopy` are trash-only outcomes for a
 *  collaborative note (see server/index.js's POST /:id/trash): `left`
 *  means the caller no longer has any access to the original note (they
 *  left a shared note, or an owner transferred it away by leaving), with
 *  `trashedCopy` their own personal trashed copy under a NEW id, never the
 *  original one; `note` is absent in that case, there is no updated
 *  version of the original to hand back. `deletedForAll` (owner-only) DOES
 *  still carry `note`: the original note itself was trashed, not replaced. */
@Serializable
data class NoteMutationResponse(
    val ok: Boolean = false,
    val stale: Boolean = false,
    val readOnly: Boolean = false,
    val left: Boolean = false,
    val deletedForAll: Boolean = false,
    val note: NoteDto? = null,
    val trashedCopy: NoteDto? = null,
)

interface GlassKeepApi {
    @POST("api/login")
    suspend fun login(@Body body: LoginRequest): Response<LoginResponse>

    // Pre-login, same as passkeyLoginOptions/Verify below: called directly
    // from NativeLoginScreen/SecretKeyLoginScreen, not through
    // NotesRepository (no session exists yet to route it through).
    @POST("api/login/secret")
    suspend fun loginWithSecretKey(@Body body: SecretKeyLoginRequest): Response<LoginResponse>

    // Authenticated: rotates the caller's own secret key (see
    // SettingsScreen.kt's Security section). The server only ever
    // returns the plaintext key from this one call; it stores just the
    // hash from then on.
    @POST("api/secret-key")
    suspend fun generateSecretKey(): Response<SecretKeyResponse>

    @GET("api/notes")
    suspend fun getNotes(): Response<List<NoteDto>>

    @GET("api/notes/archived")
    suspend fun getArchivedNotes(): Response<List<NoteDto>>

    @GET("api/notes/trashed")
    suspend fun getTrashedNotes(): Response<List<NoteDto>>

    @POST("api/notes")
    suspend fun createNote(@Body body: CreateNoteRequest): Response<NoteDto>

    @GET("api/notes/{id}")
    suspend fun getNote(@Path("id") id: String): Response<NoteDto>

    // Full roster (owner + every collaborator, unlike NoteDto.collaborators'
    // own narrower embedded field): any participant may call this, not just
    // the owner (server/index.js's own route comment: "user owns it or is
    // a collaborator"). Bare array response, not wrapped.
    @GET("api/notes/{id}/collaborators")
    suspend fun getNoteCollaborators(@Path("id") id: String): Response<List<CollaboratorDto>>

    // Owner-only server-side (see server/index.js's plain, owner-scoped
    // getNote lookup for this route, stricter than getNoteCollaborators'
    // own owner-or-collaborator check above): a non-owner calling this
    // gets a plain 404, indistinguishable from a nonexistent note. Native
    // never lets a non-owner reach this call in the first place (see
    // NoteDetailScreen.kt's isOwnerAccess gating), so that ambiguity is
    // never actually surfaced to a real user.
    @POST("api/notes/{id}/collaborate")
    suspend fun addCollaborator(@Path("id") id: String, @Body body: AddCollaboratorRequest): Response<AddCollaboratorResponse>

    // Empty q intentionally returns every local (non-federated) user, up
    // to the server's own 500-row cap: see NotesRepository.searchUsers.
    // No default here (unlike that wrapper): Retrofit's reflection-based
    // proxy doesn't reliably honor Kotlin interface-method defaults.
    @GET("api/users/search")
    suspend fun searchUsers(@Query("q") q: String): Response<List<UserDto>>

    @PATCH("api/notes/{id}")
    suspend fun patchNote(@Path("id") id: String, @Body body: PatchNoteRequest): Response<NoteMutationResponse>

    @PATCH("api/notes/{id}")
    suspend fun setPinned(@Path("id") id: String, @Body body: SetPinnedRequest): Response<NoteMutationResponse>

    @POST("api/notes/{id}/archive")
    suspend fun archiveNote(@Path("id") id: String, @Body body: ArchiveNoteRequest): Response<NoteMutationResponse>

    @POST("api/notes/{id}/trash")
    suspend fun trashNote(@Path("id") id: String, @Body body: ClientUpdatedAtRequest): Response<NoteMutationResponse>

    @POST("api/notes/{id}/restore")
    suspend fun restoreNote(@Path("id") id: String, @Body body: ClientUpdatedAtRequest): Response<NoteMutationResponse>

    @DELETE("api/notes/{id}/permanent")
    suspend fun deleteNotePermanently(@Path("id") id: String, @Body body: ClientUpdatedAtRequest): Response<NoteMutationResponse>

    @PATCH("api/notes/{id}")
    suspend fun setColor(@Path("id") id: String, @Body body: SetColorRequest): Response<NoteMutationResponse>

    @PATCH("api/notes/{id}")
    suspend fun setTags(@Path("id") id: String, @Body body: SetTagsRequest): Response<NoteMutationResponse>

    @PATCH("api/notes/{id}")
    suspend fun setChecklistItems(@Path("id") id: String, @Body body: SetChecklistItemsRequest): Response<NoteMutationResponse>

    @PATCH("api/notes/{id}")
    suspend fun setImages(@Path("id") id: String, @Body body: SetImagesRequest): Response<NoteMutationResponse>

    @POST("api/notes/{id}/reminder")
    suspend fun setReminder(@Path("id") id: String, @Body body: SetReminderRequest): Response<NoteMutationResponse>

    @GET("api/user/settings")
    suspend fun getUserSettings(): Response<UserSettingsDto>

    @PATCH("api/user/settings")
    suspend fun setShellTheme(@Body body: SetShellThemeRequest): Response<UserSettingsDto>

    @PATCH("api/user/settings")
    suspend fun setChecklistInsertPosition(@Body body: SetChecklistInsertPositionRequest): Response<UserSettingsDto>

    @GET("api/user/profile")
    suspend fun getProfile(): Response<ProfileDto>

    @PATCH("api/user/profile")
    suspend fun setShowOnLogin(@Body body: SetShowOnLoginRequest): Response<ProfileMutationResponse>

    @PATCH("api/user/profile")
    suspend fun setLanguage(@Body body: SetLanguageRequest): Response<ProfileMutationResponse>

    @PUT("api/user/avatar")
    suspend fun setAvatar(@Body body: SetAvatarRequest): Response<AvatarMutationResponse>

    @DELETE("api/user/avatar")
    suspend fun deleteAvatar(): Response<AvatarMutationResponse>

    @POST("api/user/change-password")
    suspend fun changePassword(@Body body: ChangePasswordRequest): Response<ChangePasswordResponse>

    @GET("api/passkeys")
    suspend fun listPasskeys(): Response<PasskeyListResponse>

    @POST("api/passkeys/register/options")
    suspend fun passkeyRegisterOptions(): Response<PasskeyCeremonyOptionsResponse>

    @POST("api/passkeys/register/verify")
    suspend fun passkeyRegisterVerify(@Body body: PasskeyRegisterVerifyRequest): Response<PasskeyRegisterVerifyResponse>

    @DELETE("api/passkeys/{id}")
    suspend fun deletePasskey(@Path("id") id: String): Response<PasskeyMutationResponse>

    // Deliberately no @Path/@Body auth here: both routes are pre-login by
    // design (see server/routes/passkeyRoutes.js's usernameless flow),
    // called directly from NativeLoginScreen the same way it already
    // calls login() below, not through NotesRepository (which requires an
    // existing session).
    @POST("api/passkeys/login/options")
    suspend fun passkeyLoginOptions(): Response<PasskeyCeremonyOptionsResponse>

    // Response reuses LoginResponse: the server keeps this route's shape
    // in lockstep with /api/login (its own comment says so), and the one
    // extra "ok" field that route's response carries is silently dropped
    // by ignoreUnknownKeys (see ApiClientFactory) since nothing here needs
    // it beyond the HTTP status this call already checks.
    @POST("api/passkeys/login/verify")
    suspend fun passkeyLoginVerify(@Body body: PasskeyLoginVerifyRequest): Response<LoginResponse>

    // Cross-device QR sign-in, phone side only (see QrScanScreen.kt): the
    // phone that already has a session scans a QR shown on a PC's login
    // screen, fetches who is asking, then approves or rejects. The PC's
    // own create/poll routes have no native caller: nothing in this app
    // needs to display a QR for itself to sign in (see this milestone's
    // commit message for why).
    @GET("api/device-link/info")
    suspend fun deviceLinkInfo(@Query("token") token: String): Response<DeviceLinkInfoResponse>

    @POST("api/device-link/approve")
    suspend fun approveDeviceLink(@Body body: DeviceLinkTokenRequest): Response<DeviceLinkActionResponse>

    @POST("api/device-link/reject")
    suspend fun rejectDeviceLink(@Body body: DeviceLinkTokenRequest): Response<DeviceLinkActionResponse>

    // Notifications inbox (share/collaboration events only, see
    // NotificationDto's own doc comment): no background polling anywhere
    // in native (see NotificationsScreen.kt's own doc comment for why),
    // fetched fresh whenever the inbox screen opens, same "always hits the
    // server, no local cache" tradeoff as fetchArchivedNotes()/
    // fetchTrashedNotes(). Pending ones have no delivered_at yet; history
    // is capped at the 100 most-recent server-side, already sorted newest
    // first.
    @GET("api/notifications/pending")
    suspend fun getPendingNotifications(): Response<NotificationListResponse>

    @GET("api/notifications/history")
    suspend fun getNotificationHistory(): Response<NotificationListResponse>

    // The read/unread ack: called once, right after the inbox screen loads
    // pending notifications, mirroring the web bell's own "opening the
    // panel marks everything shown as delivered" behavior.
    @POST("api/notifications/mark-delivered")
    suspend fun markNotificationsDelivered(@Body body: NotificationIdsRequest): Response<NotificationActionResponse>
}
