package com.glasskeep.app.nativeapp.ui

import com.glasskeep.app.nativeapp.data.RichDoc
import com.glasskeep.app.nativeapp.data.RichSelection
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class NoteHistoryTest {
    /** useModalHistory.js compares the body as saved: the same text under
     *  other block ids, as bold set then taken off leaves it, is no step. */
    @Test
    fun aBodyBackAsItWasIsNoNewStep() {
        val blocks = listOf(RichDoc.newBlock().copy(text = "abc"))
        val history = NoteHistory()
        history.reset(NoteSnapshot("title", "", blocks, null))
        history.record(NoteSnapshot("title", "", blocks.map { it.copy(id = "other") }, null))
        assertFalse(history.canUndo)
        history.record(NoteSnapshot("title", "", listOf(blocks.single().copy(text = "abcd")), null))
        assertTrue(history.canUndo)
    }

    /** Undo and redo hand the editor a document as the web's setContent
     *  does: the caret lands at the end of the last line of text. */
    @Test
    fun anUndoneDocumentTakesTheCaretToItsEnd() {
        val state = RichEditorState()
        val typed = listOf(RichDoc.newBlock().copy(text = "one"), RichDoc.newBlock().copy(text = "two"))
        state.sync(typed)
        state.placeCaret(typed[0].id, 1)
        val restored = listOf(typed[0], RichDoc.newBlock().copy(text = "two!"), RichDoc.newBlock())
        state.setContent(restored)
        assertEquals(RichSelection.caret(restored[2].id, 0), state.editing?.selection)
    }
}
