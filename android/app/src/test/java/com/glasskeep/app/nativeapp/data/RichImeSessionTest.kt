package com.glasskeep.app.nativeapp.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** The keyboard's command sequences, as Gboard sends them, on the
 *  whole-document session: what the document becomes and whether the
 *  keyboard's own idea of the text still holds. */
class RichImeSessionTest {
    private class Harness(blocks: List<RichBlock>, selection: RichSelection) {
        var state = RichEditing(blocks, selection)
        var inSync: Boolean? = null
        val session = RichImeSession({ state }, { state = it }, { inSync = it })
        val text: String get() = state.flat.text
        val caret: Int get() = requireNotNull(state.flat.offsetOf(state.selection.head))

        fun batch(block: RichImeSession.() -> Unit) {
            session.beginBatch()
            session.block()
            session.endBatch()
        }
    }

    private fun p(text: String, marks: List<RichMark> = emptyList()) = RichDoc.newBlock().copy(text = text, marks = marks)

    private fun item(kind: RichBlockKind, text: String) = RichDoc.newBlock(kind).copy(text = text)

    private fun at(blocks: List<RichBlock>, index: Int, offset: Int) = RichSelection.caret(blocks[index].id, offset)

    @Test
    fun composedWordThenSpace() {
        val blocks = listOf(p(""))
        val h = Harness(blocks, at(blocks, 0, 0))
        for (word in listOf("h", "he", "hel", "hell", "hello")) h.session.setComposingText(word, 1)
        assertEquals("hello", h.text)
        assertEquals(0 to 5, RichTyping.flatRange(h.state, requireNotNull(h.state.composition)))
        h.batch {
            finishComposingText()
            commitText(" ", 1)
        }
        assertEquals("hello ", h.text)
        assertEquals(6, h.caret)
        assertNull(h.state.composition)
        assertEquals(true, h.inSync)
    }

    @Test
    fun autocorrectionKeepsTheWordsMarks() {
        val blocks = listOf(p("teh", listOf(RichMark(0, 3, RichMarkType.BOLD))))
        val h = Harness(blocks, at(blocks, 0, 3))
        h.batch {
            setComposingRegion(0, 3)
            commitText("the", 1)
        }
        assertEquals("the", h.text)
        assertEquals(listOf(RichMark(0, 3, RichMarkType.BOLD)), h.state.blocks[0].marks)
        assertEquals(true, h.inSync)
    }

    @Test
    fun wordDeletedThenRetypedInOneBatchKeepsItsMarks() {
        val blocks = listOf(p("x teh", listOf(RichMark(2, 5, RichMarkType.ITALIC))))
        val h = Harness(blocks, at(blocks, 0, 5))
        h.batch {
            deleteSurroundingText(3, 0)
            commitText("the", 1)
        }
        assertEquals("x the", h.text)
        assertEquals(listOf(RichMark(2, 5, RichMarkType.ITALIC)), h.state.blocks[0].marks)
    }

    @Test
    fun wordDeletedForGoodLeavesNoMarkBehind() {
        val blocks = listOf(p("x bold", listOf(RichMark(2, 6, RichMarkType.BOLD))))
        val h = Harness(blocks, at(blocks, 0, 6))
        h.session.deleteSurroundingText(4, 0)
        h.session.commitText("y", 1)
        assertEquals("x y", h.text)
        assertEquals(emptyList<RichMark>(), h.state.blocks[0].marks)
    }

    @Test
    fun backspaceAtALineStartJoinsTheLines() {
        val blocks = listOf(p("aa"), p("bb"))
        val h = Harness(blocks, at(blocks, 1, 0))
        h.session.deleteSurroundingText(1, 0)
        assertEquals("aabb", h.text)
        assertEquals(2, h.caret)
        assertEquals(true, h.inSync)
    }

    @Test
    fun backspaceKeyAtAListItemsStartLiftsIt() {
        val blocks = listOf(item(RichBlockKind.BULLET_ITEM, "aa"), item(RichBlockKind.BULLET_ITEM, "bb"))
        val h = Harness(blocks, at(blocks, 0, 0))
        h.session.backspace()
        assertEquals(RichBlockKind.PARAGRAPH, h.state.blocks[0].kind)
        assertEquals("aa\nbb", h.text)
        assertEquals(true, h.inSync)
    }

    @Test
    fun enterInAListItemAddsAnItem() {
        val blocks = listOf(item(RichBlockKind.BULLET_ITEM, "aa"))
        val h = Harness(blocks, at(blocks, 0, 2))
        h.session.commitText("\n", 1)
        assertEquals(listOf(RichBlockKind.BULLET_ITEM, RichBlockKind.BULLET_ITEM), h.state.blocks.map { it.kind })
        assertEquals("aa\n", h.text)
        assertEquals(3, h.caret)
        assertEquals(true, h.inSync)
    }

    @Test
    fun dashAndSpaceMakeABulletAndTheKeyboardIsToldAgain() {
        val blocks = listOf(p(""))
        val h = Harness(blocks, at(blocks, 0, 0))
        h.session.commitText("-", 1)
        h.session.commitText(" ", 1)
        assertEquals(RichBlockKind.BULLET_ITEM, h.state.blocks.single().kind)
        assertEquals("", h.text)
        assertEquals(false, h.inSync)
    }

    @Test
    fun starsMakeBoldAndDisarmItForWhatFollows() {
        val blocks = listOf(p(""))
        val h = Harness(blocks, at(blocks, 0, 0))
        for (c in "**bold*") h.session.commitText(c.toString(), 1)
        h.session.commitText("*", 1)
        assertEquals("bold", h.text)
        assertEquals(listOf(RichMark(0, 4, RichMarkType.BOLD)), h.state.blocks[0].marks)
        assertEquals(listOf(PendingMark(RichMarkType.BOLD, remove = true)), h.state.pendingMarks)
        h.session.commitText("x", 1)
        assertEquals(listOf(RichMark(0, 4, RichMarkType.BOLD)), h.state.blocks[0].marks)
    }

    @Test
    fun armedBoldStylesTheComposedWord() {
        val blocks = listOf(p("a "))
        val h = Harness(blocks, at(blocks, 0, 2))
        h.state = h.state.copy(pendingMarks = listOf(PendingMark(RichMarkType.BOLD)))
        h.session.setComposingText("x", 1)
        h.session.setComposingText("xy", 1)
        assertEquals(listOf(RichMark(2, 4, RichMarkType.BOLD)), h.state.blocks[0].marks)
    }

    @Test
    fun composingOverASelectionReplacesIt() {
        val blocks = listOf(p("aa"), p("bb"), p("cc"))
        val h = Harness(blocks, RichSelection(RichPos(blocks[0].id, 1), RichPos(blocks[2].id, 1)))
        h.session.setComposingText("x", 1)
        assertEquals("axc", h.text)
        assertEquals(2, h.caret)
    }

    @Test
    fun deletingAnEmojiTakesItWhole() {
        val blocks = listOf(p("a😀"))
        val h = Harness(blocks, at(blocks, 0, 3))
        h.session.deleteSurroundingTextInCodePoints(1, 0)
        assertEquals("a", h.text)
        h.session.commitText("😀", 1)
        h.session.backspace()
        assertEquals("a", h.text)
    }

    @Test
    fun theCaretNeverRestsOnARule() {
        val blocks = listOf(p("aa"), RichDoc.newBlock(RichBlockKind.DIVIDER), p("cc"))
        val h = Harness(blocks, at(blocks, 0, 0))
        h.session.setSelection(3, 3)
        assertEquals(RichSelection.caret(blocks[2].id, 0), h.state.selection)
        h.session.commitText("x", 1)
        assertEquals("aa\n\nxcc", h.text)
    }

    @Test
    fun selectionMovedByTheKeyboardDisarmsPendingMarks() {
        val blocks = listOf(p("abc"))
        val h = Harness(blocks, at(blocks, 0, 3))
        h.state = h.state.copy(pendingMarks = listOf(PendingMark(RichMarkType.BOLD)))
        h.session.setSelection(3, 3)
        assertEquals(listOf(PendingMark(RichMarkType.BOLD)), h.state.pendingMarks)
        h.session.setSelection(1, 1)
        assertEquals(emptyList<PendingMark>(), h.state.pendingMarks)
    }
}
