package com.glasskeep.app.nativeapp.data

import com.glasskeep.app.nativeapp.data.local.NoteEntity
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class NoteSearchTest {
    private val note = NoteEntity(
        id = "note-1",
        type = "checklist",
        title = "Courses",
        color = "default",
        pinned = false,
        updatedAt = null,
        content = "",
        itemsJson = """[{"id":"i1","text":"Lait d'amande","done":false}]""",
        tagsJson = """["Maison","Urgent"]""",
        imageNamesJson = """["facture-supermarche.png"]""",
    )

    @Test fun searchMatchesTitle() = assertTrue(note.matchesSearchQuery("COURSES"))

    @Test fun searchMatchesChecklistItem() = assertTrue(note.matchesSearchQuery("amande"))

    @Test fun searchMatchesTag() = assertTrue(note.matchesSearchQuery("urgent"))

    @Test fun searchMatchesImageName() = assertTrue(note.matchesSearchQuery("facture-super"))

    @Test fun searchRejectsAbsentValue() = assertFalse(note.matchesSearchQuery("introuvable"))

    @Test fun multiTagUsesCaseInsensitiveOrSemantics() {
        assertTrue(note.matchesAnyTag(setOf("travail", "maison")))
        assertFalse(note.matchesAnyTag(setOf("travail", "voyage")))
    }
}
