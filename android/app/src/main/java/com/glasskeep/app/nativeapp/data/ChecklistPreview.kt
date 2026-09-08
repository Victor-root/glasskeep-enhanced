package com.glasskeep.app.nativeapp.data

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull

/** One real checklist row for a read-only preview (card or detail).
 *  Section markers (`{kind:"section", title}`, see src/utils/checklist.js)
 *  are not items and are dropped, same as countItems()/countChecked() on
 *  the web side. */
data class ChecklistPreviewItem(val text: String, val done: Boolean, val indented: Boolean)

object ChecklistPreview {
    private val json = Json { ignoreUnknownKeys = true; isLenient = true }

    /** Parses NoteEntity.itemsJson (or a NoteDto's raw items) into plain
     *  rows, in stored order. Never throws: a malformed/empty string just
     *  yields no items rather than crashing a card render. */
    fun parse(itemsJson: String): List<ChecklistPreviewItem> {
        if (itemsJson.isBlank()) return emptyList()
        val array = try {
            json.parseToJsonElement(itemsJson) as? JsonArray ?: return emptyList()
        } catch (_: Exception) {
            return emptyList()
        }
        return array.mapNotNull { element ->
            val obj = element as? JsonObject ?: return@mapNotNull null
            val kind = (obj["kind"] as? JsonPrimitive)?.contentOrNull
            if (kind == "section") return@mapNotNull null
            val text = (obj["text"] as? JsonPrimitive)?.contentOrNull ?: return@mapNotNull null
            val done = (obj["done"] as? JsonPrimitive)?.booleanOrNull ?: false
            // Single-level indent, stored as 0 or 1 (see checklist.js), not
            // a boolean.
            val indented = ((obj["indent"] as? JsonPrimitive)?.intOrNull ?: 0) > 0
            ChecklistPreviewItem(text, done, indented)
        }
    }
}
