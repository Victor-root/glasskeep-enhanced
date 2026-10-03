package com.glasskeep.app.nativeapp.data

import com.glasskeep.app.nativeapp.data.local.NoteEntity

/** List-screen search parity with App.jsx: title, body, tags, checklist
 * item text, and image display names all participate case-insensitively.
 * The query is taken as typed, spaces included. The cheap fields are tried
 * first and the body, which takes a parse to read, last. */
internal fun NoteEntity.matchesSearchQuery(query: String): Boolean {
    if (query.isEmpty()) return true
    return title.contains(query, ignoreCase = true) ||
        TagsJson.parse(tagsJson).joinToString(" ").contains(query, ignoreCase = true) ||
        ChecklistPreview.parse(itemsJson).joinToString(" ") { it.text }.contains(query, ignoreCase = true) ||
        TagsJson.parse(imageNamesJson).joinToString(" ").contains(query, ignoreCase = true) ||
        SearchBodies.of(this).contains(query, ignoreCase = true)
}

/** The readable text of each note's body, kept for as long as the body does
 *  not change: every keystroke searches every note again. */
private object SearchBodies {
    private const val MaxEntries = 1024

    private class Body(val content: String, val text: String)

    private val bodies = object : LinkedHashMap<String, Body>(256, 0.75f, true) {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, Body>?): Boolean = size > MaxEntries
    }

    fun of(note: NoteEntity): String {
        synchronized(bodies) { bodies[note.id]?.takeIf { it.content == note.content }?.let { return it.text } }
        val text = NoteContent.previewPlainText(note.content, Int.MAX_VALUE)
        synchronized(bodies) { bodies[note.id] = Body(note.content, text) }
        return text
    }
}

/** The web combines selected tag filters with OR semantics. Tag identity
 * is case-insensitive even if an older database contains mixed casing. */
internal fun NoteEntity.matchesAnyTag(filters: Set<String>): Boolean {
    if (filters.isEmpty()) return true
    val noteTags = TagsJson.parse(tagsJson).mapTo(mutableSetOf()) { it.lowercase() }
    return filters.any { it.lowercase() in noteTags }
}
