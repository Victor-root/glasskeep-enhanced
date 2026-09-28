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
    fun aNumberAndADotStartAnOrderedListThere() {
        val blocks = listOf(p(""))
        val h = Harness(blocks, at(blocks, 0, 0))
        for (c in "3. ") h.session.commitText(c.toString(), 1)
        val item = h.state.blocks.single()
        assertEquals(RichBlockKind.NUMBERED_ITEM, item.kind)
        assertEquals(3, item.listStart)
        val encoded = RichDoc.encode(h.state.blocks)
        assertEquals(true, "\"type\":\"orderedList\",\"attrs\":{\"start\":3}" in encoded)
        assertEquals(3, RichDoc.parse(encoded)?.single()?.listStart)
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

    /** Typed key by key on the web editor, which words became links. */
    @Test
    fun aSpaceAfterAnAddressLinksItAsTheWebDoes() {
        fun link(start: Int, end: Int, href: String) = RichMark(start, end, RichMarkType.LINK, href)
        val cases = listOf(
            "see example.com " to listOf(link(4, 15, "http://example.com")),
            "(x.io) " to listOf(link(1, 5, "http://x.io")),
            "[x.io] " to listOf(link(1, 5, "http://x.io")),
            "example.com, " to emptyList(),
            "192.168.0.1 " to emptyList(),
            "localhost " to emptyList(),
            "https://localhost " to listOf(link(0, 17, "https://localhost")),
            "me@example.org " to listOf(link(0, 14, "mailto:me@example.org")),
            "mailto:a@b.co " to listOf(link(0, 13, "mailto:a@b.co")),
            "file.txt " to emptyList(),
            "readme.md " to listOf(link(0, 9, "http://readme.md")),
            "www.Example.COM/a?b=1 " to emptyList(),
            "x.io/a " to emptyList(),
            "https://x.io/a " to listOf(link(0, 14, "https://x.io/a")),
            "http://x.io/a) " to emptyList(),
            "x.io a/ " to listOf(link(0, 4, "http://x.io")),
            "x.io  " to listOf(link(0, 4, "http://x.io")),
            "`x.io` " to listOf(RichMark(0, 4, RichMarkType.CODE)),
            "**x.io** " to listOf(RichMark(0, 4, RichMarkType.BOLD), link(0, 4, "http://x.io")),
        )
        for ((typed, marks) in cases) {
            val blocks = listOf(p(""))
            val h = Harness(blocks, at(blocks, 0, 0))
            for (c in typed) h.session.commitText(c.toString(), 1)
            val sorted = h.state.blocks.single().marks.sortedWith(compareBy({ it.start }, { it.type.ordinal }))
            assertEquals(typed, marks.sortedWith(compareBy({ it.start }, { it.type.ordinal })), sorted)
        }
    }

    @Test
    fun enterAfterAnAddressLinksIt() {
        val blocks = listOf(p(""))
        val h = Harness(blocks, at(blocks, 0, 0))
        for (c in "example.com") h.session.commitText(c.toString(), 1)
        h.session.commitText("\n", 1)
        assertEquals(listOf(RichMark(0, 11, RichMarkType.LINK, "http://example.com")), h.state.blocks[0].marks)
        assertEquals(2, h.state.blocks.size)
    }

    /** Typed on the web editor above a line, then Backspace: the rule is
     *  undone and the text comes back as typed, but an empty code block is
     *  cleared first. */
    @Test
    fun backspaceRightAfterAnInputRuleUndoesItAsTheWebDoes() {
        val cases = listOf(
            "- " to ("- " to 2),
            "1. " to ("1. " to 3),
            "3. " to ("3. " to 3),
            "[x] " to ("[x] " to 4),
            "> " to ("> " to 2),
            "# " to ("# " to 2),
            "### " to ("### " to 4),
            "```js " to ("" to 0),
            "---" to ("---" to 3),
            "**bold**" to ("**bold**" to 8),
            "- \u0008\u0008" to ("-" to 1),
            "-\n" to ("-\n" to 2),
        )
        for ((keys, expected) in cases) {
            val blocks = listOf(p(""), p("after"))
            val h = Harness(blocks, at(blocks, 0, 0))
            for (c in keys) {
                when (c) {
                    '\n' -> h.session.enter()
                    '\u0008' -> h.session.backspace()
                    else -> h.session.commitText(c.toString(), 1)
                }
            }
            if ('\u0008' !in keys) h.session.backspace()
            val (text, caret) = expected
            assertEquals(keys, listOf(RichBlockKind.PARAGRAPH to text, RichBlockKind.PARAGRAPH to "after"), h.state.blocks.map { it.kind to it.text })
            assertEquals(keys, emptyList<RichMark>(), h.state.blocks[0].marks)
            assertEquals(keys, RichSelection.caret(h.state.blocks[0].id, caret), h.state.selection)
        }
    }

    @Test
    fun theUndoLapsesOnceSomethingElseIsTyped() {
        val blocks = listOf(p(""), p("after"))
        val h = Harness(blocks, at(blocks, 0, 0))
        for (c in "- x") h.session.commitText(c.toString(), 1)
        h.session.backspace()
        assertEquals(listOf(RichBlockKind.BULLET_ITEM to "", RichBlockKind.PARAGRAPH to "after"), h.state.blocks.map { it.kind to it.text })
    }

    /** The keyboard deleting the line break before the caret is Backspace
     *  at a line's start; deleting a character inside a line is not. */
    @Test
    fun theKeyboardsLineJoinUndoesTooButNotADeletionInALine() {
        val list = listOf(p("before"), p(""), p("after"))
        val h = Harness(list, at(list, 1, 0))
        for (c in "- ") h.session.commitText(c.toString(), 1)
        h.session.deleteSurroundingText(1, 0)
        assertEquals(listOf("before", "- ", "after"), h.state.blocks.map { it.text })
        assertEquals(RichBlockKind.PARAGRAPH, h.state.blocks[1].kind)

        val bold = listOf(p(""), p("after"))
        val g = Harness(bold, at(bold, 0, 0))
        for (c in "**bold**") g.session.commitText(c.toString(), 1)
        g.session.deleteSurroundingText(1, 0)
        assertEquals("bol", g.state.blocks[0].text)
        assertEquals(listOf(RichMark(0, 3, RichMarkType.BOLD)), g.state.blocks[0].marks)
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
