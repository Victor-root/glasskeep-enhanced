package com.glasskeep.app.nativeapp.data

import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.put
import java.util.UUID

/** One editable checklist row. Mirrors src/utils/checklist.js's item shape
 *  (`{id, text, done, indent}`); `indent` is 0 or 1 only, single level, same
 *  "Google Keep style, no sub-sub-items" rule the web enforces. */
data class ChecklistItemData(
    val id: String,
    val text: String,
    val done: Boolean,
    val indent: Int,
)

/**
 * (De)serializes NoteDto.items for the flat (no-section) case the native
 * checklist editor supports so far. src/utils/checklist.js's items live in
 * one flat array alongside section markers (`{kind:"section", title}`);
 * native doesn't understand those yet (no editor UI for them), so
 * [parseFlat] returns null the moment it sees one rather than silently
 * dropping or misrendering it, that null is exactly NoteDetailScreen's
 * signal to fall back to a read-only view instead of an editor that could
 * scramble a sectioned checklist's organization.
 */
object ChecklistItems {
    fun hasSections(items: List<JsonElement>): Boolean = items.any { el ->
        val kind = (el as? JsonObject)?.get("kind") as? JsonPrimitive
        kind?.contentOrNull == "section"
    }

    /** Parses items into editable rows, or null if any section marker is
     *  present. Also re-applies the indent invariant on every parse (a
     *  malformed/legacy item's indent still normalizes to 0/1, first item
     *  is never indented), same rule as normalizeItems() on the web,
     *  applied eagerly here instead of only at render time. */
    fun parseFlat(items: List<JsonElement>): List<ChecklistItemData>? {
        if (hasSections(items)) return null
        val parsed = items.mapNotNull { el ->
            val obj = el as? JsonObject ?: return@mapNotNull null
            val text = (obj["text"] as? JsonPrimitive)?.contentOrNull ?: return@mapNotNull null
            val id = (obj["id"] as? JsonPrimitive)?.contentOrNull ?: UUID.randomUUID().toString()
            val done = (obj["done"] as? JsonPrimitive)?.booleanOrNull ?: false
            val indent = (obj["indent"] as? JsonPrimitive)?.intOrNull ?: 0
            ChecklistItemData(id = id, text = text, done = done, indent = if (indent == 1) 1 else 0)
        }
        return normalizeIndent(parsed)
    }

    /** Re-applies the indent invariant to a list already being edited
     *  in-memory (e.g. after a removal could leave a formerly-second item
     *  as an invalid indented first item). Cheap and idempotent, safe to
     *  call after any structural edit. */
    fun normalize(items: List<ChecklistItemData>): List<ChecklistItemData> = normalizeIndent(items)

    fun encode(items: List<ChecklistItemData>): List<JsonElement> =
        normalizeIndent(items).map { item ->
            buildJsonObject {
                put("id", item.id)
                put("text", item.text)
                put("done", item.done)
                put("indent", item.indent)
            }
        }

    fun newItem(): ChecklistItemData = ChecklistItemData(UUID.randomUUID().toString(), "", false, 0)

    /** The contiguous run of indent=1 rows right after `parentId`, same
     *  positional definition as getIndentedChildren() (checklist.js): scan
     *  forward until the first non-indented row. Used to cascade a
     *  done/undone toggle onto a parent's children, Google Keep style. */
    fun indentedChildren(items: List<ChecklistItemData>, parentId: String): List<ChecklistItemData> {
        val idx = items.indexOfFirst { it.id == parentId }
        if (idx < 0) return emptyList()
        val result = mutableListOf<ChecklistItemData>()
        for (i in idx + 1 until items.size) {
            val row = items[i]
            if (row.indent != 1) break
            result.add(row)
        }
        return result
    }

    /** Same rule as canIndentItem() (checklist.js) for the flat, no-section
     *  case: the very first row has nothing above it to nest under, and an
     *  already-indented row can't nest further (single level only). */
    fun canIndent(items: List<ChecklistItemData>, id: String): Boolean {
        val idx = items.indexOfFirst { it.id == id }
        if (idx <= 0) return false
        return items[idx].indent == 0
    }

    /** First row can never be indented (nothing above it to nest under);
     *  every other row's indent is clamped to 0/1. Re-applied on every
     *  parse/encode so a stray bad value can never round-trip or persist. */
    private fun normalizeIndent(items: List<ChecklistItemData>): List<ChecklistItemData> =
        items.mapIndexed { i, item ->
            val indent = if (item.indent == 1) 1 else 0
            if (i == 0 && indent == 1) item.copy(indent = 0) else item.copy(indent = indent)
        }
}
