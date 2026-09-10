package com.glasskeep.app.nativeapp.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ChecklistItemsPreviewTest {
    @Test
    fun parseJsonKeepsSectionsCollapsedStateAndIndentation() {
        val entries = ChecklistItems.parseJson(
            """[
                {"id":"a","text":"First","done":false,"indent":0},
                {"id":"section","kind":"section","title":"Cross server","color":"violet","collapsed":true},
                {"id":"b","text":"Nested","done":false,"indent":1}
            ]""".trimIndent(),
        )

        assertEquals(3, entries.size)
        val section = entries[1] as ChecklistSectionData
        assertEquals("Cross server", section.title)
        assertEquals("violet", section.color)
        assertTrue(section.collapsed)
        // First row of a section is normalized to top-level, like the web.
        assertEquals(0, (entries[2] as ChecklistItemData).indent)
    }

    @Test
    fun parseJsonReturnsEmptyForMalformedCacheData() {
        assertTrue(ChecklistItems.parseJson("not json").isEmpty())
    }
}
