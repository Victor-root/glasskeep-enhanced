package com.glasskeep.app.nativeapp.data

import com.glasskeep.app.nativeapp.NativeDebug
import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.decodeFromJsonElement

@Serializable
data class DrawingPointDto(val x: Float, val y: Float)

/** One freehand stroke. `tool` is carried through as an opaque string
 *  (not an enum) rather than "pen"/"eraser": src/DrawingCanvas.jsx's own
 *  renderPaths() skips any path with tool == "eraser" (a stroke-based
 *  eraser deletes the paths it touches instead of drawing anything, so an
 *  "eraser" entry, if one ever exists in legacy data, was never meant to
 *  render), and this native renderer/editor mirrors that same skip rather
 *  than needing to understand what such an entry would mean. */
@Serializable
data class DrawingStrokeDto(
    val tool: String = "pen",
    val color: String,
    val size: Float,
    val points: List<DrawingPointDto>,
)

@Serializable
data class DrawingDimensionsDto(
    val width: Float,
    val height: Float,
    val originalHeight: Float? = null,
)

@Serializable
data class DrawingContentDto(
    val paths: List<DrawingStrokeDto> = emptyList(),
    val dimensions: DrawingDimensionsDto? = null,
    /** Rich-text caption, same envelope shape RichDoc.kt/NoteContent.kt
     *  already parse for a text note's own content. Read-only in the
     *  native editor for now (see NoteDetailScreen.kt's isDrawType
     *  branch), but always preserved through parse -> encode untouched. */
    val text: String? = null,
)

/**
 * Parser/encoder for a "draw" note's `content`: a JSON object
 * `{paths, dimensions, text}` (see src/DrawingCanvas.jsx and src/App.jsx's
 * drawing autosave), or a legacy bare JSON array of paths with no
 * dimensions/text at all. Mirrors the rest of this app's data-layer
 * objects (RichDoc, ChecklistItems, NoteImages): never throws, and
 * [parse] returns null rather than guess when `content` is non-blank but
 * isn't either of those two shapes, so a genuinely corrupt or
 * not-yet-understood note falls back to NoteDetailScreen's existing
 * "type not supported" notice instead of being silently emptied out.
 */
object DrawingContent {
    private val json = Json { ignoreUnknownKeys = true; isLenient = true }

    /** Null for corrupt/unrecognized content; an empty [DrawingContentDto]
     *  for a blank/new note, that being the one case where "nothing here
     *  yet" really is the safe reading, not a guess. */
    fun parse(content: String?): DrawingContentDto? {
        if (content.isNullOrBlank()) return DrawingContentDto()
        return try {
            when (val element = json.parseToJsonElement(content)) {
                is JsonArray -> DrawingContentDto(paths = json.decodeFromJsonElement(ListSerializer(DrawingStrokeDto.serializer()), element))
                is JsonObject -> json.decodeFromJsonElement(DrawingContentDto.serializer(), element)
                else -> null
            }
        } catch (t: Throwable) {
            NativeDebug.e("DrawingContent.parse failed", t)
            null
        }
    }

    /** Always the modern object shape, never the legacy bare-array one,
     *  same "upgrade on next save" rule NoteContent.kt applies to legacy
     *  plain-text notes. */
    fun encode(paths: List<DrawingStrokeDto>, dimensions: DrawingDimensionsDto?, text: String?): String =
        json.encodeToString(DrawingContentDto.serializer(), DrawingContentDto(paths = paths, dimensions = dimensions, text = text))
}
