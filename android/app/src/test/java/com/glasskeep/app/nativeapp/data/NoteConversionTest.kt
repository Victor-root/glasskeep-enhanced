package com.glasskeep.app.nativeapp.data

import org.junit.Assert.assertEquals
import org.junit.Test

/** A checklist turned into a text note, as the web's Markdown round trip
 *  (checklistItemsToText, marked, generateJSON) leaves it. */
class NoteConversionTest {
    private fun item(text: String, done: Boolean = false, indent: Int = 0) = ChecklistItemData(text, text, done, indent)

    private fun describe(entries: List<ChecklistEntry>): String =
        NoteConversion.checklistEntriesToRichBlocks(entries).joinToString(" | ") { block ->
            "${block.kind.name.lowercase()}${if (block.nestLevel > 0) "+${block.nestLevel}" else ""}(${block.text})"
        }

    @Test
    fun itemsBecomeBulletsWhateverTheirDoneStateAndSectionsLevelTwoHeadings() {
        val entries = listOf(
            ChecklistSectionData("s", "Todo"),
            item("a"),
            item("b", done = true),
            ChecklistSectionData("t", "Done"),
            item("c"),
        )

        assertEquals(
            "heading_2(Todo) | bullet_item(a) | bullet_item(b) | heading_2(Done) | bullet_item(c)",
            describe(entries),
        )
    }

    @Test
    fun indentedItemsFormANestedList() {
        assertEquals(
            "bullet_item(a) | bullet_item+1(b) | bullet_item+1(c) | bullet_item(d)",
            describe(listOf(item("a"), item("b", indent = 1), item("c", indent = 1), item("d"))),
        )
    }

    @Test
    fun anIndentedItemWithNothingAboveItIsATopLevelOne() {
        assertEquals("bullet_item(b)", describe(listOf(item("", indent = 0), item("b", indent = 1))))
    }

    @Test
    fun itemTextIsReadAsMarkdown() {
        val blocks = NoteConversion.checklistEntriesToRichBlocks(listOf(item("buy *milk*")))

        assertEquals("buy milk", blocks.single().text)
        assertEquals(listOf(RichMarkType.ITALIC), blocks.single().marks.map { it.type })
    }
}
