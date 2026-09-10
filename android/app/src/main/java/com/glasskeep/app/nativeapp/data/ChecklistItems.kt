package com.glasskeep.app.nativeapp.data

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.put
import java.util.UUID

/** One entry of a checklist: either a row or a section marker. */
sealed interface ChecklistEntry {
    val id: String
}

/** One editable checklist row. Mirrors src/utils/checklist.js's item shape
 *  (`{id, text, done, indent}`); `indent` is 0 or 1 only, single level, same
 *  "Google Keep style, no sub-sub-items" rule the web enforces. */
data class ChecklistItemData(
    override val id: String,
    val text: String,
    val done: Boolean,
    val indent: Int,
) : ChecklistEntry

/** A section marker, `{id, kind:"section", title, color?, collapsed?}`.
 *  Everything after it belongs to that section until the next marker. */
data class ChecklistSectionData(
    override val id: String,
    val title: String,
    val color: String? = null,
    val collapsed: Boolean = false,
) : ChecklistEntry

/** One logical section and the rows under it, checked ones included and in
 *  their original order. `section` is null for the implicit default block
 *  that holds everything before the first marker. */
data class ChecklistBlock(
    val section: ChecklistSectionData?,
    val items: List<ChecklistItemData>,
)

/**
 * (De)serializes NoteDto.items, the one flat array where src/utils/checklist.js
 * keeps rows and section markers side by side. The array order IS the logical
 * order: checking a row never moves it, only where it is drawn changes, so
 * unchecking puts it back exactly where it was for free.
 */
object ChecklistItems {
    const val SECTION_KIND = "section"
    private val json = Json { ignoreUnknownKeys = true; isLenient = true }

    /** Room stores the wire array as text. Keep this tolerant entry point
     * next to the canonical parser so card previews retain section markers
     * instead of going through the older item-only preview projection. */
    fun parseJson(itemsJson: String): List<ChecklistEntry> {
        if (itemsJson.isBlank()) return emptyList()
        val array = try {
            json.parseToJsonElement(itemsJson) as? JsonArray ?: return emptyList()
        } catch (_: Exception) {
            return emptyList()
        }
        return parse(array)
    }

    /** Reads the note's items, applying the web's own normalisation:
     *  duplicate ids dropped, missing fields defaulted, and the first row
     *  of the list (or of any section) never indented, since it would
     *  have nothing above it to nest under. */
    fun parse(items: List<JsonElement>): List<ChecklistEntry> {
        val seen = mutableSetOf<String>()
        val out = mutableListOf<ChecklistEntry>()
        var atSectionStart = true
        for (element in items) {
            val obj = element as? JsonObject ?: continue
            val id = (obj["id"] as? JsonPrimitive)?.contentOrNull ?: UUID.randomUUID().toString()
            if (!seen.add(id)) continue
            if ((obj["kind"] as? JsonPrimitive)?.contentOrNull == SECTION_KIND) {
                out.add(
                    ChecklistSectionData(
                        id = id,
                        title = (obj["title"] as? JsonPrimitive)?.contentOrNull.orEmpty(),
                        color = (obj["color"] as? JsonPrimitive)?.contentOrNull,
                        collapsed = (obj["collapsed"] as? JsonPrimitive)?.booleanOrNull ?: false,
                    ),
                )
                atSectionStart = true
            } else {
                val indent = (obj["indent"] as? JsonPrimitive)?.intOrNull ?: 0
                out.add(
                    ChecklistItemData(
                        id = id,
                        text = (obj["text"] as? JsonPrimitive)?.contentOrNull.orEmpty(),
                        done = (obj["done"] as? JsonPrimitive)?.booleanOrNull ?: false,
                        indent = if (atSectionStart || indent != 1) 0 else 1,
                    ),
                )
                atSectionStart = false
            }
        }
        return out
    }

    /** Re-applies the indent invariant to a list already being edited
     *  in-memory (e.g. after a removal could leave a formerly-second item
     *  as an invalid indented first item). Cheap and idempotent, safe to
     *  call after any structural edit. */
    fun normalize(entries: List<ChecklistEntry>): List<ChecklistEntry> {
        var atSectionStart = true
        return entries.map { entry ->
            when (entry) {
                is ChecklistSectionData -> {
                    atSectionStart = true
                    entry
                }
                is ChecklistItemData -> {
                    val indent = if (atSectionStart || entry.indent != 1) 0 else 1
                    atSectionStart = false
                    if (indent == entry.indent) entry else entry.copy(indent = indent)
                }
            }
        }
    }

    fun encode(entries: List<ChecklistEntry>): List<JsonElement> =
        normalize(entries).map { entry ->
            when (entry) {
                is ChecklistSectionData -> buildJsonObject {
                    put("id", entry.id)
                    put("kind", SECTION_KIND)
                    put("title", entry.title)
                    entry.color?.let { put("color", it) }
                    if (entry.collapsed) put("collapsed", true)
                }
                is ChecklistItemData -> buildJsonObject {
                    put("id", entry.id)
                    put("text", entry.text)
                    put("done", entry.done)
                    put("indent", entry.indent)
                }
            }
        }

    fun newItem(): ChecklistItemData = ChecklistItemData(UUID.randomUUID().toString(), "", false, 0)

    fun newSection(): ChecklistSectionData = ChecklistSectionData(UUID.randomUUID().toString(), "")

    /** Splits the flat array into its logical blocks. The first block is
     *  always the implicit default one, even when empty, so callers can
     *  treat every checklist the same way (getSections()). */
    fun blocks(entries: List<ChecklistEntry>): List<ChecklistBlock> {
        val out = mutableListOf<ChecklistBlock>()
        var currentSection: ChecklistSectionData? = null
        var currentItems = mutableListOf<ChecklistItemData>()
        for (entry in entries) {
            when (entry) {
                is ChecklistSectionData -> {
                    out.add(ChecklistBlock(currentSection, currentItems))
                    currentSection = entry
                    currentItems = mutableListOf()
                }
                is ChecklistItemData -> currentItems.add(entry)
            }
        }
        out.add(ChecklistBlock(currentSection, currentItems))
        return out
    }

    /** The section marker an item sits under, or null for the default
     *  block. */
    fun sectionIdForItem(entries: List<ChecklistEntry>, itemId: String): String? {
        var current: String? = null
        for (entry in entries) {
            when (entry) {
                is ChecklistSectionData -> current = entry.id
                is ChecklistItemData -> if (entry.id == itemId) return current
            }
        }
        return null
    }

    /**
     * The contiguous run of indented rows right after a non-indented one:
     * its "children" for check/uncheck cascading, Google Keep style. Stops
     * at a section marker or at the first unchecked top-level row; an
     * already-checked top-level row is SKIPPED rather than ending the run,
     * because it is drawn under "Done" and so is invisible between a
     * parent and its children (getIndentedChildren, checklist.js).
     */
    fun indentedChildren(entries: List<ChecklistEntry>, parentId: String): List<ChecklistItemData> {
        val index = entries.indexOfFirst { it.id == parentId }
        if (index < 0) return emptyList()
        val parent = entries[index] as? ChecklistItemData ?: return emptyList()
        if (parent.indent == 1) return emptyList()
        val children = mutableListOf<ChecklistItemData>()
        for (i in index + 1 until entries.size) {
            when (val entry = entries[i]) {
                is ChecklistSectionData -> return children
                is ChecklistItemData -> when {
                    entry.indent == 1 -> children.add(entry)
                    entry.done -> Unit
                    else -> return children
                }
            }
        }
        return children
    }

    /** Same rule as canIndentItem(): a row can only be indented when it is
     *  not already indented and not the first of its section. */
    fun canIndent(entries: List<ChecklistEntry>, id: String): Boolean {
        val item = entries.firstOrNull { it.id == id } as? ChecklistItemData ?: return false
        if (item.indent == 1) return false
        var atSectionStart = true
        for (entry in entries) {
            when (entry) {
                is ChecklistSectionData -> atSectionStart = true
                is ChecklistItemData -> {
                    if (entry.id == id) return !atSectionStart
                    atSectionStart = false
                }
            }
        }
        return false
    }

    /**
     * Orders one block's checked rows for the "Done" area so an indented
     * row always lands right after its own parent, even when an unrelated
     * checked row sits between them in the raw array
     * (orderCheckedForDisplay, checklist.js). Display only: nothing moves
     * in the stored array.
     */
    fun orderCheckedForDisplay(items: List<ChecklistItemData>): List<ChecklistItemData> {
        val anchorOf = mutableMapOf<String, String?>()
        var currentAnchor: String? = null
        for (item in items) {
            if (item.indent == 1) {
                anchorOf[item.id] = currentAnchor
            } else {
                anchorOf[item.id] = item.id
                // A checked top-level row is invisible in the normal view,
                // so it only takes the anchor role when nothing else holds
                // it yet.
                if (!item.done || currentAnchor == null) currentAnchor = item.id
            }
        }
        val groups = LinkedHashMap<String?, MutableList<ChecklistItemData>>()
        for (item in items) {
            groups.getOrPut(anchorOf[item.id]) { mutableListOf() }.add(item)
        }
        return groups.values.flatten().filter { it.done }
    }

    /**
     * removeSectionWithItems() (checklist.js:339-352): drops the marker
     * AND everything it owns, i.e. every entry up to the next marker.
     */
    fun removeSectionWithItems(entries: List<ChecklistEntry>, sectionId: String): List<ChecklistEntry> {
        val start = entries.indexOfFirst { it is ChecklistSectionData && it.id == sectionId }
        if (start < 0) return entries.toList()
        return entries.subList(0, start) + entries.subList(sectionEnd(entries, start), entries.size)
    }

    /**
     * removeSectionKeepItems() (checklist.js:357-378): drops the marker
     * only, and moves what it owned back into the default block at the
     * top, before whatever marker comes first.
     */
    fun removeSectionKeepItems(entries: List<ChecklistEntry>, sectionId: String): List<ChecklistEntry> {
        val start = entries.indexOfFirst { it is ChecklistSectionData && it.id == sectionId }
        if (start < 0) return entries.toList()
        val end = sectionEnd(entries, start)
        val orphans = entries.subList(start + 1, end).toList()
        val rest = entries.subList(0, start) + entries.subList(end, entries.size)
        val firstMarker = rest.indexOfFirst { it is ChecklistSectionData }
        val insertAt = if (firstMarker < 0) rest.size else firstMarker
        return rest.subList(0, insertAt) + orphans + rest.subList(insertAt, rest.size)
    }

    /** One past the last entry the marker at [start] owns: the next
     *  marker's index, or the end of the list. */
    private fun sectionEnd(entries: List<ChecklistEntry>, start: Int): Int {
        for (i in start + 1 until entries.size) {
            if (entries[i] is ChecklistSectionData) return i
        }
        return entries.size
    }

    /**
     * reorderSections() (checklist.js:383-423): rebuilds the flat array
     * with the section blocks in [newOrderedSectionIds]'s order. Whatever
     * sits before the first marker is the implicit default block and never
     * moves, and any section the caller forgot to name is appended in its
     * original order rather than dropped.
     */
    fun reorderSections(entries: List<ChecklistEntry>, newOrderedSectionIds: List<String>): List<ChecklistEntry> {
        val firstMarker = entries.indexOfFirst { it is ChecklistSectionData }
        if (firstMarker < 0) return entries.toList()
        val prefix = entries.subList(0, firstMarker).toList()

        val blocks = linkedMapOf<String, List<ChecklistEntry>>()
        var i = firstMarker
        while (i < entries.size) {
            if (entries[i] !is ChecklistSectionData) {
                i++
                continue
            }
            var end = entries.size
            for (j in i + 1 until entries.size) {
                if (entries[j] is ChecklistSectionData) {
                    end = j
                    break
                }
            }
            blocks[entries[i].id] = entries.subList(i, end).toList()
            i = end
        }

        val ordered = mutableListOf<ChecklistEntry>()
        val seen = mutableSetOf<String>()
        for (id in newOrderedSectionIds) {
            val block = blocks[id] ?: continue
            if (!seen.add(id)) continue
            ordered.addAll(block)
        }
        for ((id, block) in blocks) {
            if (id !in seen) ordered.addAll(block)
        }
        return prefix + ordered
    }
}
