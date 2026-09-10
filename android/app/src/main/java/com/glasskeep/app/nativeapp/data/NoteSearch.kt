package com.glasskeep.app.nativeapp.data

import com.glasskeep.app.nativeapp.data.local.NoteEntity

/** List-screen search parity with App.jsx: title, body, tags, checklist
 * item text, and image display names all participate case-insensitively. */
internal fun NoteEntity.matchesSearchQuery(query: String): Boolean {
    val needle = query.trim()
    if (needle.isEmpty()) return true
    return sequenceOf(
        title,
        NoteContent.previewPlainText(content, Int.MAX_VALUE),
        TagsJson.parse(tagsJson).joinToString(" "),
        ChecklistPreview.parse(itemsJson).joinToString(" ") { it.text },
        TagsJson.parse(imageNamesJson).joinToString(" "),
    ).any { it.contains(needle, ignoreCase = true) }
}

/** The web combines selected tag filters with OR semantics. Tag identity
 * is case-insensitive even if an older database contains mixed casing. */
internal fun NoteEntity.matchesAnyTag(filters: Set<String>): Boolean {
    if (filters.isEmpty()) return true
    val noteTags = TagsJson.parse(tagsJson).mapTo(mutableSetOf()) { it.lowercase() }
    return filters.any { it.lowercase() in noteTags }
}
