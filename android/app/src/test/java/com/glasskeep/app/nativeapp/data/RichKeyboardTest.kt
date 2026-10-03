package com.glasskeep.app.nativeapp.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** What the hardware keyboard's line break and Tab do to the document, as
 *  Tiptap's HardBreak and list extensions do them. */
class RichKeyboardTest {
    private fun block(kind: RichBlockKind, text: String, listId: String? = null) =
        RichDoc.newBlock(kind).copy(text = text, listId = listId)

    private fun describe(blocks: List<RichBlock>): String =
        blocks.joinToString(" | ") { "${it.kind.name.lowercase()}${if (it.nestLevel > 0) "+${it.nestLevel}" else ""}(${it.text.replace("\n", "\\n")})" }

    @Test
    fun lineBreakInAParagraphIsAHardBreakNotANewParagraph() {
        val paragraph = block(RichBlockKind.PARAGRAPH, "ab")

        val edit = RichTyping.lineBreak(RichEditing(listOf(paragraph), RichSelection.caret(paragraph.id, 1)))

        assertEquals("paragraph(a\\nb)", describe(edit.blocks))
        assertEquals(RichSelection.caret(paragraph.id, 2), edit.selection)
    }

    @Test
    fun lineBreakOverASelectionReplacesIt() {
        val paragraph = block(RichBlockKind.PARAGRAPH, "abcd")

        val edit = RichTyping.lineBreak(RichEditing(listOf(paragraph), RichSelection(RichPos(paragraph.id, 1), RichPos(paragraph.id, 3))))

        assertEquals("paragraph(a\\nd)", describe(edit.blocks))
    }

    @Test
    fun lineBreakInACodeBlockLeavesItForAParagraphUnderIt() {
        val code = block(RichBlockKind.CODE_BLOCK, "x = 1")

        val edit = RichTyping.lineBreak(RichEditing(listOf(code), RichSelection.caret(code.id, 2)))

        assertEquals("code_block(x = 1) | paragraph()", describe(edit.blocks))
        assertEquals(edit.blocks[1].id, edit.selection.head.blockId)
    }

    @Test
    fun tabSinksAnItemUnderTheOneBeforeIt() {
        val first = block(RichBlockKind.BULLET_ITEM, "a", "list")
        val second = block(RichBlockKind.BULLET_ITEM, "b", "list")

        val edit = requireNotNull(RichCommands.run(RichEditing(listOf(first, second), RichSelection.caret(second.id, 1)), RichCommand.SinkListItem))

        assertEquals("bullet_item(a) | bullet_item+1(b)", describe(edit.blocks))
    }

    @Test
    fun tabJoinsTheListAlreadyNestedUnderTheItemBeforeIt() {
        val first = block(RichBlockKind.BULLET_ITEM, "a", "outer")
        val nested = block(RichBlockKind.BULLET_ITEM, "b", "inner").copy(nestLevel = 1)
        val last = block(RichBlockKind.BULLET_ITEM, "c", "outer")

        val edit = requireNotNull(RichCommands.run(RichEditing(listOf(first, nested, last), RichSelection.caret(last.id, 1)), RichCommand.SinkListItem))

        assertEquals("bullet_item(a) | bullet_item+1(b) | bullet_item+1(c)", describe(edit.blocks))
    }

    @Test
    fun tabSinksATaskItemToo() {
        val first = block(RichBlockKind.TASK_ITEM, "a", "list")
        val second = block(RichBlockKind.TASK_ITEM, "b", "list")

        val edit = requireNotNull(RichCommands.run(RichEditing(listOf(first, second), RichSelection.caret(second.id, 0)), RichCommand.SinkListItem))

        assertEquals("task_item(a) | task_item+1(b)", describe(edit.blocks))
    }

    @Test
    fun tabDoesNothingOnTheFirstItemOrOutsideAList() {
        val first = block(RichBlockKind.BULLET_ITEM, "a", "list")
        val paragraph = block(RichBlockKind.PARAGRAPH, "p")

        assertNull(RichCommands.run(RichEditing(listOf(first, paragraph), RichSelection.caret(first.id, 0)), RichCommand.SinkListItem))
        assertNull(RichCommands.run(RichEditing(listOf(first, paragraph), RichSelection.caret(paragraph.id, 0)), RichCommand.SinkListItem))
    }
}
