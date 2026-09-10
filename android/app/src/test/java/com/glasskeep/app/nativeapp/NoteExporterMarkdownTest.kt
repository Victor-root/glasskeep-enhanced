package com.glasskeep.app.nativeapp

import com.glasskeep.app.nativeapp.data.local.NoteEntity
import org.junit.Assert.assertTrue
import org.junit.Test

class NoteExporterMarkdownTest {
    @Test
    fun zipMarkdownIncludesChecklistTagsAndImageNames() {
        val note = NoteEntity(
            id = "note-1",
            type = "checklist",
            title = "Voyage",
            color = "default",
            pinned = false,
            updatedAt = null,
            content = "",
            itemsJson = """[
                {"kind":"section","id":"s1","title":"Bagages"},
                {"id":"i1","text":"Valise","done":false,"indent":0},
                {"id":"i2","text":"Passeport","done":true,"indent":1}
            ]""",
            tagsJson = """["été"]""",
            imageNamesJson = """["billet.png"]""",
        )

        val markdown = NoteExporter.noteMarkdown(note)

        assertTrue(markdown.contains("# Voyage"))
        assertTrue(markdown.contains("`été`"))
        assertTrue(markdown.contains("## Bagages"))
        assertTrue(markdown.contains("  - [x] Passeport"))
        assertTrue(markdown.contains("billet.png"))
    }
}
