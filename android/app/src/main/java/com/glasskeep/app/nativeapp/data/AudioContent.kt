package com.glasskeep.app.nativeapp.data

import com.glasskeep.app.nativeapp.NativeDebug
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.floatOrNull
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import java.util.UUID

@Serializable
data class AudioClipDto(
    val id: String,
    val name: String = "",
    /** A `data:<mime>;base64,...` URL, same as a content-image's `src`
     *  (NoteImages.kt): the audio bytes themselves, never a separate file
     *  reference. */
    val audioDataUrl: String,
    val mimeType: String,
    /** Seconds, matching src/utils/audioNote.js's own `duration` unit.
     *  This and the next two stay null when unknown, as the web keeps
     *  them. */
    val duration: Float? = null,
    /** The recorded file's bytes; without it the storage gauge estimates
     *  them from the base64 length. */
    val size: Long? = null,
    val createdAt: String? = null,
)

@Serializable
data class AudioContentDto(
    val version: Int = 2,
    val clips: List<AudioClipDto> = emptyList(),
    /** Reserved in the web's own schema for a caption/transcript, but
     *  never actually surfaced by any web UI (src/utils/audioNote.js's own
     *  comment calls it "reserved for future transcription"), always sent
     *  as "". Preserved through parse -> encode untouched rather than
     *  built any UI around a field nothing on either platform uses yet. */
    val text: String = "",
)

/**
 * Parser/encoder for an "audio" note's `content`, mirroring
 * parseAudioContent()/serializeAudioContent() (src/utils/audioNote.js): a
 * JSON object `{version, clips: [{id, name, audioDataUrl, mimeType,
 * duration, size, createdAt}], text}`, or a legacy v1 single-clip object
 * with the same clip fields at the top level instead of a `clips` array
 * (upgraded to v2 on read). Just as lenient as the web: content it cannot
 * read is an empty note, a clip without a data URL is dropped, and a
 * missing id or MIME type is filled in (normalizeClip).
 */
object AudioContent {
    private val json = Json { ignoreUnknownKeys = true; isLenient = true }

    fun parse(content: String?): AudioContentDto {
        if (content.isNullOrBlank()) return AudioContentDto()
        val root = try {
            json.parseToJsonElement(content) as? JsonObject
        } catch (e: Exception) {
            NativeDebug.e("AudioContent.parse: not JSON", e)
            null
        } ?: return AudioContentDto()
        val text = root.string("text") ?: ""
        val clips = root["clips"]
        return when {
            clips is JsonArray -> AudioContentDto(clips = clips.mapNotNull { (it as? JsonObject)?.let(::normalizeClip) }, text = text)
            root.string("audioDataUrl")?.startsWith("data:") == true -> AudioContentDto(clips = listOfNotNull(normalizeClip(root)), text = text)
            else -> AudioContentDto()
        }
    }

    /** normalizeClip (audioNote.js:56-68). */
    private fun normalizeClip(obj: JsonObject): AudioClipDto? {
        val audioDataUrl = obj.string("audioDataUrl")?.takeIf { it.startsWith("data:") } ?: return null
        return AudioClipDto(
            id = obj.string("id")?.takeIf { it.isNotEmpty() } ?: UUID.randomUUID().toString(),
            name = obj.string("name") ?: "",
            audioDataUrl = audioDataUrl,
            mimeType = obj.string("mimeType") ?: "audio/webm",
            duration = obj.number("duration")?.floatOrNull,
            size = obj.number("size")?.doubleOrNull?.toLong(),
            createdAt = obj.string("createdAt"),
        )
    }

    /** A field only when it holds a JSON string (`typeof === "string"`). */
    private fun JsonObject.string(key: String): String? =
        (this[key] as? JsonPrimitive)?.takeIf { it.isString }?.content

    /** A field only when it holds a JSON number (`Number.isFinite`). */
    private fun JsonObject.number(key: String): JsonPrimitive? =
        (this[key] as? JsonPrimitive)?.takeIf { !it.isString && it.doubleOrNull != null }

    /** Always the modern v2 shape, never the legacy single-clip one, same
     *  "upgrade on next save" rule DrawingContent/NoteContent apply to
     *  their own legacy shapes. */
    fun encode(clips: List<AudioClipDto>, text: String): String =
        json.encodeToString(AudioContentDto.serializer(), AudioContentDto(version = 2, clips = clips, text = text))

    // minSdk 24 has no java.time (this project has no core library
    // desugaring configured to back-port it), so an ISO-8601 UTC instant
    // is built by hand here instead.
    private val iso8601 = ThreadLocal.withInitial {
        SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply { timeZone = TimeZone.getTimeZone("UTC") }
    }

    fun newClip(dataUrl: String, mimeType: String, durationSeconds: Float, sizeBytes: Long, name: String = ""): AudioClipDto =
        AudioClipDto(
            id = UUID.randomUUID().toString(),
            name = name,
            audioDataUrl = dataUrl,
            mimeType = mimeType,
            duration = durationSeconds,
            size = sizeBytes,
            createdAt = iso8601.get()!!.format(Date()),
        )
}
