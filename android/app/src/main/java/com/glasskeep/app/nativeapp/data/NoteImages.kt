package com.glasskeep.app.nativeapp.data

import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.put
import java.util.UUID

/** One content image on a note. Mirrors the web's image entry shape
 *  exactly: `{id, src, name}`, no width/height/mimetype field exists on
 *  either side. `src` is always a data: URL (base64-embedded), the server
 *  stores images_json as opaque JSON, there's no server-hosted file path
 *  to speak of (see server/index.js's own CSP comment on this). */
data class NoteImageData(val id: String, val src: String, val name: String)

/**
 * (De)serializes NoteDto.images. A note's personal icon is a separate
 * feature server-side (its own note_user_icons table and PUT/DELETE
 * .../icon endpoints, not part of images_json at all), so this deliberately
 * doesn't model an icon: only real content images belong here.
 *
 * The server defensively drops any legacy `role:"icon"` entry it finds
 * inside images_json before it ever reaches a client (old data from before
 * the icon feature moved to its own table), but [parse] filters the same
 * way too, matching the web's own getContentImages() belt-and-suspenders
 * check rather than assuming the server always will.
 */
object NoteImages {
    fun parse(images: List<JsonElement>): List<NoteImageData> = images.mapNotNull { el ->
        val obj = el as? JsonObject ?: return@mapNotNull null
        val role = (obj["role"] as? JsonPrimitive)?.contentOrNull
        if (role == "icon") return@mapNotNull null
        val id = (obj["id"] as? JsonPrimitive)?.contentOrNull ?: UUID.randomUUID().toString()
        val src = (obj["src"] as? JsonPrimitive)?.contentOrNull ?: return@mapNotNull null
        val name = (obj["name"] as? JsonPrimitive)?.contentOrNull ?: ""
        NoteImageData(id = id, src = src, name = name)
    }

    fun encode(images: List<NoteImageData>): List<JsonElement> = images.map { image ->
        buildJsonObject {
            put("id", image.id)
            put("src", image.src)
            put("name", image.name)
        }
    }

    fun newImage(src: String, name: String): NoteImageData =
        NoteImageData(id = UUID.randomUUID().toString(), src = src, name = name)
}
