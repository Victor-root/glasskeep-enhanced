package com.glasskeep.app.nativeapp.data

import com.glasskeep.app.nativeapp.NativeDebug
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.floatOrNull
import kotlinx.serialization.json.longOrNull
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
    /** Seconds, matching src/utils/audioNote.js's own `duration` unit. */
    val duration: Float = 0f,
    val size: Long = 0,
    val createdAt: String = "",
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
 * validateAudioContent() (server/index.js) and parseAudioContent()/
 * serializeAudioContent() (src/utils/audioNote.js): a JSON object
 * `{version, clips: [{id, name, audioDataUrl, mimeType, duration, size,
 * createdAt}], text}`, or a legacy v1 single-clip object with the same
 * clip fields at the top level instead of a `clips` array (upgraded to v2
 * on read, same as the web does). Mirrors the rest of this app's
 * data-layer objects: never throws, and [parse] returns null rather than
 * guess when `content` is non-blank but isn't either shape, or contains a
 * clip whose MIME isn't in the same allow-list the server enforces on
 * write, so a genuinely corrupt or not-yet-understood note falls back to
 * NoteDetailScreen's existing "type not supported" notice.
 */
object AudioContent {
    private val json = Json { ignoreUnknownKeys = true; isLenient = true }

    // Byte for byte the same as ALLOWED_AUDIO_MIME_PREFIXES (server/index.js)
    // and audioNote.js's own copy of it.
    private val ALLOWED_MIME_PREFIXES = listOf(
        "audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg", "audio/wav", "audio/x-wav", "audio/aac",
    )

    fun parse(content: String?): AudioContentDto? {
        if (content.isNullOrBlank()) return AudioContentDto()
        return try {
            val root = json.parseToJsonElement(content) as? JsonObject ?: return null
            val clipsElement = root["clips"]
            when {
                clipsElement is JsonArray -> {
                    val clips = clipsElement.map { el ->
                        val obj = el as? JsonObject ?: return null
                        parseClip(obj, synthesizeId = false) ?: return null
                    }
                    AudioContentDto(clips = clips, text = (root["text"] as? JsonPrimitive)?.contentOrNull ?: "")
                }
                root["audioDataUrl"] != null -> {
                    val clip = parseClip(root, synthesizeId = true) ?: return null
                    AudioContentDto(clips = listOf(clip), text = (root["text"] as? JsonPrimitive)?.contentOrNull ?: "")
                }
                else -> null
            }
        } catch (t: Throwable) {
            NativeDebug.e("AudioContent.parse failed", t)
            null
        }
    }

    private fun parseClip(obj: JsonObject, synthesizeId: Boolean): AudioClipDto? {
        val audioDataUrl = (obj["audioDataUrl"] as? JsonPrimitive)?.contentOrNull ?: return null
        if (!isAllowedAudioDataUrl(audioDataUrl)) return null
        val mimeType = (obj["mimeType"] as? JsonPrimitive)?.contentOrNull ?: return null
        val id = (obj["id"] as? JsonPrimitive)?.contentOrNull
            ?: if (synthesizeId) UUID.randomUUID().toString() else return null
        return AudioClipDto(
            id = id,
            name = (obj["name"] as? JsonPrimitive)?.contentOrNull ?: "",
            audioDataUrl = audioDataUrl,
            mimeType = mimeType,
            duration = (obj["duration"] as? JsonPrimitive)?.floatOrNull ?: 0f,
            size = (obj["size"] as? JsonPrimitive)?.longOrNull ?: 0L,
            createdAt = (obj["createdAt"] as? JsonPrimitive)?.contentOrNull ?: "",
        )
    }

    private fun isAllowedAudioDataUrl(dataUrl: String): Boolean {
        val mime = dataUrl.substringAfter("data:", "").substringBefore(";").substringBefore(",")
        return ALLOWED_MIME_PREFIXES.any { mime.startsWith(it) }
    }

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
