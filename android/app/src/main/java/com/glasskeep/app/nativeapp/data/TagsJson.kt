package com.glasskeep.app.nativeapp.data

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull

/** (De)serializes NoteEntity.tagsJson, same JSON-array-of-strings shape as
 *  NoteDto.tags, and same lenient/never-throws convention as
 *  ChecklistPreview for itemsJson. */
object TagsJson {
    private val json = Json { ignoreUnknownKeys = true; isLenient = true }

    fun parse(tagsJson: String): List<String> {
        if (tagsJson.isBlank()) return emptyList()
        val array = try {
            json.parseToJsonElement(tagsJson) as? JsonArray ?: return emptyList()
        } catch (_: Exception) {
            return emptyList()
        }
        return array.mapNotNull { (it as? JsonPrimitive)?.contentOrNull }
    }

    fun encode(tags: List<String>): String = JsonArray(tags.map { JsonPrimitive(it) }).toString()
}
