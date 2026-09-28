package com.glasskeep.app.nativeapp.data

import kotlinx.serialization.builtins.serializer
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Commands on a selection across blocks, each case the same document and
 * selection as one measured in the web editor, and the document it left
 * (the web's trailing paragraph, added by its TrailingNode, left out).
 * "x1" selects from where "x1" starts, "x1$" from where it ends.
 */
class RichSelectionTest {
    private val d1 = doc(p("aa11"), p("bb22"), p("cc33"))
    private val d2 = doc(ul(li("aa11"), li("bb22"), li("cc33")), p("dd44"))
    private val d3 = doc(p("pp11"), ul(li("aa11"), li("bb22")), p("dd44"))
    private val d4 = doc(quote(p("qq11"), p("rr22")), p("ss33"))
    private val nested = doc(ul(li("aa", ul(li("bb"), li("cc"))), li("dd")), p("ee"))

    @Test
    fun deletingAcrossParagraphsJoinsTheStartAndTheEnd() {
        assertEquals("""paragraph["ac33"]""", deleted(d1, "a1", "c3"))
        assertEquals("""bulletList[listItem[paragraph["aa11"]],listItem[paragraph["bd44"]]]""", deleted(d2, "b2", "d4"))
        assertEquals("""paragraph["da11"] bulletList[listItem[paragraph["bb22"]]]""", deleted(doc(p("dd44"), ul(li("aa11"), li("bb22"))), "d4", "a1"))
        assertEquals("""paragraph["pa11"] bulletList[listItem[paragraph["bb22"]]] paragraph["dd44"]""", deleted(d3, "p1", "a1"))
        assertEquals("""blockquote[paragraph["qs33"]]""", deleted(d4, "q1", "s3"))
        assertEquals("""paragraph["sq11"] blockquote[paragraph["rr22"]]""", deleted(doc(p("ss33"), quote(p("qq11"), p("rr22"))), "s3", "q1"))
        assertEquals("""heading{"level":1}["hde"]""", deleted(doc(h(1, "hh11"), p("pp22"), code("co\nde")), "h1", "de"))
        assertEquals("""paragraph["aa11cc33"]""", deleted(doc(p("aa11"), rule(), p("cc33")), "aa11$", "cc"))
        assertEquals("""paragraph["pc11"]""", deleted(doc(p("pp22"), code("cc11")), "p2", "c1"))
        assertEquals("""bulletList[listItem[paragraph["aa11"]],listItem[paragraph["d44"]]]""", deleted(doc(ul(li("aa11"), li("bb22")), p("dd44")), "bb", "d4"))
    }

    @Test
    fun deletingFromTheStartOfANodeKeepsTheEndBlocksKind() {
        assertEquals("""paragraph["p22"] paragraph["zz"]""", deleted(doc(h(2, "hh11"), p("pp22"), p("zz")), "hh", "p2"))
        assertEquals("""heading{"level":2}["h11"] paragraph["zz"]""", deleted(doc(p("pp22"), h(2, "hh11"), p("zz")), "pp", "h1"))
        assertEquals("""bulletList[listItem[paragraph["a11"]],listItem[paragraph["bb22"]]]""", deleted(doc(p("dd44"), ul(li("aa11"), li("bb22"))), "dd", "a1"))
        assertEquals("""blockquote[paragraph["q11"]] paragraph["zz"]""", deleted(doc(p("pp22"), quote(p("qq11")), p("zz")), "pp", "q1"))
        assertEquals("""paragraph["p22"]""", deleted(doc(quote(p("qq11")), p("pp22")), "qq", "p2"))
        assertEquals("""paragraph["p22"]""", deleted(doc(code("cc11"), p("pp22")), "cc", "p2"))
        assertEquals("""bulletList[listItem[paragraph["b22"]]] paragraph["dd44"]""", deleted(d2.dropThird(), "aa", "b2"))
    }

    @Test
    fun deletingToTheStartOfALineKeepsThatLine() {
        assertEquals("""bulletList[listItem[paragraph["aa11"]]] paragraph["dd44"]""", deleted(doc(ul(li("aa11"), li("bb22")), p("dd44")), "bb", "dd"))
        assertEquals("""paragraph["qq33"]""", deleted(doc(h(1, "hh11"), p("pp22"), p("qq33")), "hh", "qq"))
        assertEquals("""heading{"level":1}["hqq33"]""", deleted(doc(h(1, "hh11"), p("pp22"), p("qq33")), "h1", "qq"))
        assertEquals("""bulletList[listItem[paragraph["aabb22"]]]""", deleted(doc(ul(li("aa11"), li("bb22"))), "11", "bb"))
        assertEquals(
            """bulletList[listItem[paragraph[],bulletList[listItem[paragraph["bb22"]]]],listItem[paragraph["cc33"]]]""",
            deleted(doc(ul(li("aa11", ul(li("bb22"))), li("cc33"))), "aa", "bb"),
        )
        assertEquals(
            """bulletList[listItem[paragraph[],bulletList[listItem[paragraph["cc"]]]],listItem[paragraph["dd"]]] paragraph["ee"]""",
            deleted(nested, "aa", "cc"),
        )
        assertEquals("""bulletList[listItem[paragraph["aa"]]] paragraph["ee"]""", deleted(nested, "bb", "ee"))
        assertEquals("""blockquote[paragraph["qq"],paragraph["rr"]]""", deleted(doc(p("pp"), quote(p("qq"), p("rr"))), "pp", "qq"))
    }

    @Test
    fun deletingWholeNodes() {
        assertEquals("""paragraph[]""", deleted(doc(h(1, "hh"), ul(li("aa")), p("pp")), "hh", "pp$"))
        assertEquals("""paragraph["zz"] paragraph["yy"]""", deleted(doc(p("zz"), ul(li("aa11"), li("bb22")), p("yy")), "aa", "bb22$"))
        assertEquals("""bulletList[listItem[paragraph["cc33"]]]""", deleted(doc(ul(li("aa11", ul(li("bb22"))), li("cc33"))), "aa", "bb22$"))
        assertEquals("""paragraph["zz"] paragraph[] paragraph["yy"]""", deleted(doc(p("zz"), p("aa11"), p("bb22"), p("yy")), "aa", "bb22$"))
        assertEquals("""paragraph["pp"] blockquote[paragraph[]] paragraph["ss"]""", deleted(doc(p("pp"), quote(p("qq"), p("rr")), p("ss")), "qq", "rr$"))
        assertEquals("""bulletList[listItem[paragraph[]],listItem[paragraph["cc33"]]]""", deleted(doc(ul(li("aa11"), li("bb22"), li("cc33"))), "aa", "bb22$"))
    }

    @Test
    fun typingOverASelectionJoinsItsEndsAndTakesTheFirstCharactersMarks() {
        assertEquals("""paragraph["aXc33"]""", typed(d1, "a1", "c3", "X"))
        assertEquals("""paragraph["Xa11"] bulletList[listItem[paragraph["bb22"]]]""", typed(doc(p("dd44"), ul(li("aa11"), li("bb22"))), "dd", "a1", "X"))
        assertEquals("""bulletList[listItem[paragraph["aa11"]],listItem[paragraph["Xd44"]]]""", typed(doc(ul(li("aa11"), li("bb22")), p("dd44")), "bb", "d4", "X"))
        val bold = doc(pm("aa ", bold("bold"), " cc"), p("dd"))
        assertEquals("""paragraph["aa ","bX"{bold}]""", typed(bold, "old", "dd$", "X"))
        assertEquals("""heading{"level":1}["X"]""", typed(doc(h(1, "hh"), p("pp")), "hh", "pp$", "X"))
    }

    @Test
    fun enterOverASelectionDeletesItThenSplitsAsAPlainBlock() {
        assertEquals("""paragraph["a"] paragraph["b22"] paragraph["cc33"]""", entered(d1, "a1", "b2"))
        assertEquals("""paragraph["p"] paragraph["a11"] bulletList[listItem[paragraph["bb22"]]]""", entered(doc(p("pp22"), ul(li("aa11"), li("bb22"))), "p2", "a1"))
        assertEquals(
            """bulletList[listItem[paragraph["aa11"]],listItem[paragraph["b"],paragraph["d44"]]]""",
            entered(doc(ul(li("aa11"), li("bb22")), p("dd44")), "b2", "d4"),
        )
    }

    @Test
    fun listButtonsOverSeveralBlocks() {
        assertEquals("""bulletList[listItem[paragraph["aa11"]],listItem[paragraph["bb22"]],listItem[paragraph["cc33"]]]""", kind(d1, "aa", "cc", RichBlockKind.BULLET_ITEM))
        assertEquals("""orderedList[listItem[paragraph["aa11"]],listItem[paragraph["bb22"]]] paragraph["cc33"]""", kind(d1, "aa", "bb", RichBlockKind.NUMBERED_ITEM))
        assertEquals("""taskList[taskItem[paragraph["aa11"]],taskItem[paragraph["bb22"]],taskItem[paragraph["cc33"]]]""", kind(d1, "aa", "cc", RichBlockKind.TASK_ITEM))
        assertEquals("""paragraph["aa11"] paragraph["bb22"] bulletList[listItem[paragraph["cc33"]]] paragraph["dd44"]""", kind(d2, "aa", "bb", RichBlockKind.BULLET_ITEM))
        assertEquals("""orderedList[listItem[paragraph["aa11"]],listItem[paragraph["bb22"]],listItem[paragraph["cc33"]]] paragraph["dd44"]""", kind(d2, "aa", "bb", RichBlockKind.NUMBERED_ITEM))
        assertEquals(
            """taskList[taskItem[paragraph["aa11"]],taskItem[paragraph["bb22"]]] bulletList[listItem[paragraph["cc33"]]] paragraph["dd44"]""",
            kind(d2, "aa", "bb", RichBlockKind.TASK_ITEM),
        )
        assertEquals(
            """bulletList[listItem[paragraph["aa11"]],listItem[paragraph["bb22"]],listItem[paragraph["cc33"]],listItem[paragraph["dd44"]]]""",
            kind(d2, "bb", "dd", RichBlockKind.BULLET_ITEM),
        )
        assertEquals(
            """bulletList[listItem[paragraph["pp11"],bulletList[listItem[paragraph["aa11"]],listItem[paragraph["bb22"]]]]] paragraph["dd44"]""",
            kind(d3, "pp", "aa", RichBlockKind.BULLET_ITEM),
        )
        assertEquals(
            """orderedList[listItem[paragraph["pp11"],bulletList[listItem[paragraph["aa11"]],listItem[paragraph["bb22"]]]]] paragraph["dd44"]""",
            kind(d3, "pp", "aa", RichBlockKind.NUMBERED_ITEM),
        )
        assertEquals(
            """taskList[taskItem[paragraph["pp11"],bulletList[listItem[paragraph["aa11"]],listItem[paragraph["bb22"]]]],taskItem[paragraph["dd44"]]]""",
            kind(d3, "pp", "dd", RichBlockKind.TASK_ITEM),
        )
        assertEquals("""blockquote[bulletList[listItem[paragraph["qq11"]],listItem[paragraph["rr22"]]]] paragraph["ss33"]""", kind(d4, "qq", "rr", RichBlockKind.BULLET_ITEM))
        assertEquals("""blockquote[paragraph["qq11"]] bulletList[listItem[paragraph["rr22"]],listItem[paragraph["ss33"]]]""", kind(d4, "rr", "ss", RichBlockKind.BULLET_ITEM))
        val mixed = doc(p("pp"), h(2, "hh"), code("cc"), p("qq"))
        assertEquals(
            """bulletList[listItem[paragraph["pp"],heading{"level":2}["hh"],codeBlock["cc"]],listItem[paragraph["qq"]]]""",
            kind(mixed, "pp", "qq", RichBlockKind.BULLET_ITEM),
        )
        assertEquals("""paragraph["pp"] bulletList[listItem[paragraph["hh"]],listItem[paragraph["cc"]],listItem[paragraph["qq"]]]""", kind(mixed, "hh", "qq", RichBlockKind.BULLET_ITEM))
        assertEquals(
            """bulletList[listItem[paragraph["aa11"],horizontalRule],listItem[paragraph["cc33"]]]""",
            kind(doc(p("aa11"), rule(), p("cc33")), "aa", "cc", RichBlockKind.BULLET_ITEM),
        )
    }

    @Test
    fun listButtonsInNestedLists() {
        assertEquals(
            """bulletList[listItem[paragraph["aa"]],listItem[paragraph["bb"]],listItem[paragraph["cc"]],listItem[paragraph["dd"]]] paragraph["ee"]""",
            kind(nested, "bb", "cc", RichBlockKind.BULLET_ITEM),
        )
        assertEquals(
            """paragraph["aa"] bulletList[listItem[paragraph["bb"]],listItem[paragraph["cc"]]] paragraph["dd"] paragraph["ee"]""",
            kind(nested, "bb", "dd", RichBlockKind.BULLET_ITEM),
        )
        assertEquals(
            """bulletList[listItem[paragraph["aa"],orderedList[listItem[paragraph["bb"]],listItem[paragraph["cc"]]]],listItem[paragraph["dd"]]] paragraph["ee"]""",
            kind(nested, "bb", "cc", RichBlockKind.NUMBERED_ITEM),
        )
        assertEquals(
            """orderedList[listItem[paragraph["aa"],bulletList[listItem[paragraph["bb"]],listItem[paragraph["cc"]]]],listItem[paragraph["dd"]]] paragraph["ee"]""",
            kind(nested, "aa", "dd", RichBlockKind.NUMBERED_ITEM),
        )
        assertEquals(
            """bulletList[listItem[paragraph["aa"]],listItem[paragraph["bb"]],listItem[paragraph["cc"]],listItem[paragraph["dd"]],listItem[paragraph["ee"]]]""",
            kind(nested, "bb", "ee", RichBlockKind.BULLET_ITEM),
        )
    }

    @Test
    fun styleGalleryOverSeveralBlocks() {
        assertEquals("""heading{"level":2}["aa11"] heading{"level":2}["bb22"] paragraph["cc33"]""", kind(d1, "aa", "bb", RichBlockKind.HEADING_2))
        assertEquals("""heading{"level":2}["aa11"] heading{"level":2}["bb22"] bulletList[listItem[paragraph["cc33"]]] paragraph["dd44"]""", kind(d2, "aa", "bb", RichBlockKind.HEADING_2))
        assertEquals("""bulletList[listItem[paragraph["aa11"]],listItem[paragraph["bb22"]],listItem[paragraph["cc33"]]] heading{"level":2}["dd44"]""", kind(d2, "bb", "dd", RichBlockKind.HEADING_2))
        assertEquals("""heading{"level":3}["pp11"] bulletList[listItem[paragraph["aa11"]],listItem[paragraph["bb22"]]] heading{"level":3}["dd44"]""", kind(d3, "pp", "dd", RichBlockKind.HEADING_3))
        val styled = doc(h(1, "hh11"), p("pp22", align = "center"), code("co\nde"))
        assertEquals("""heading{"level":1}["hh11"] heading{"level":1}["pp22"] codeBlock["co\nde"]""", kind(styled, "hh", "pp", RichBlockKind.HEADING_1))
        assertEquals("""paragraph["hh11"] paragraph["pp22"] codeBlock["co\nde"]""", kind(styled, "hh", "pp", RichBlockKind.PARAGRAPH))
        assertEquals("""heading{"level":1}["hh11"] heading{"level":2}["pp22"] heading{"level":2}["co",hardBreak,"de"]""", kind(styled, "pp", "co", RichBlockKind.HEADING_2))
    }

    @Test
    fun quoteButtonOverSeveralBlocks() {
        assertEquals("""blockquote[paragraph["aa11"],paragraph["bb22"]] paragraph["cc33"]""", quoted(d1, "aa", "bb"))
        assertEquals(show(d2), quoted(d2, "aa", "bb"))
        assertEquals("""blockquote[bulletList[listItem[paragraph["aa11"]],listItem[paragraph["bb22"]],listItem[paragraph["cc33"]]],paragraph["dd44"]]""", quoted(d2, "bb", "dd"))
        assertEquals("""blockquote[paragraph["pp11"],bulletList[listItem[paragraph["aa11"]],listItem[paragraph["bb22"]]]] paragraph["dd44"]""", quoted(d3, "pp", "aa"))
        assertEquals("""paragraph["qq11"] paragraph["rr22"] paragraph["ss33"]""", quoted(d4, "qq", "rr"))
        assertEquals("""blockquote[blockquote[paragraph["qq11"],paragraph["rr22"]],paragraph["ss33"]]""", quoted(d4, "rr", "ss"))
        assertEquals("""blockquote[paragraph["aa11"],horizontalRule,paragraph["cc33"]]""", quoted(doc(p("aa11"), rule(), p("cc33")), "aa", "cc"))
    }

    @Test
    fun codeBlockButtonOverSeveralBlocks() {
        assertEquals("""codeBlock["aa11\nbb22"] paragraph["cc33"]""", coded(d1, "a1", "b2"))
        assertEquals("""codeBlock["aa11\nbb22\ncc33"] paragraph["dd44"]""", coded(d2, "a1", "b2"))
        assertEquals("""codeBlock["aa11\nbb22\ncc33\ndd44"]""", coded(d2, "b2", "d4"))
        assertEquals("""codeBlock["qq11\nrr22\nss33"]""", coded(d4, "q1", "s3"))
        assertEquals("""heading{"level":1}["hh11"] codeBlock["pp22\nco\nde"]""", coded(doc(h(1, "hh11"), p("pp22"), code("co\nde")), "pp", "co"))
        assertEquals("""paragraph["aa"] codeBlock["bb"]""", coded(doc(code("aa"), code("bb")), "aa", "bb$"))
    }

    @Test
    fun alignIndentMarksAndEraserOverSeveralBlocks() {
        assertEquals(
            """paragraph{"textAlign":"center"}["aa11"] paragraph{"textAlign":"center"}["bb22"] paragraph["cc33"]""",
            show(pressed(d1, "aa", "bb", RichCommand.Align(RichAlign.CENTER))),
        )
        val styled = doc(h(1, "hh11"), p("pp22", align = "center"), code("co\nde"))
        assertEquals(
            """heading{"level":1,"textAlign":"center"}["hh11"] paragraph{"textAlign":"center"}["pp22"] codeBlock["co\nde"]""",
            show(pressed(styled, "hh", "co", RichCommand.Align(RichAlign.CENTER))),
        )
        assertEquals(
            """paragraph{"indent":1}["aa11"] paragraph{"indent":1}["bb22"] paragraph["cc33"]""",
            show(pressed(d1, "aa", "bb", RichCommand.Indent(1))),
        )
        assertEquals(
            """bulletList[listItem{"indent":1}[paragraph["aa"],bulletList[listItem{"indent":1}[paragraph["bb"]],listItem{"indent":1}[paragraph["cc"]]]],listItem{"indent":1}[paragraph["dd"]]] paragraph["ee"]""",
            show(pressed(nested, "bb", "dd", RichCommand.Indent(1))),
        )
        val quote = doc(quote(p("aa"), p("bb")))
        assertEquals(
            """blockquote{"indent":1}[paragraph{"indent":1}["aa"],paragraph{"indent":1}["bb"]]""",
            show(pressed(quote, "aa", "bb", RichCommand.Indent(1))),
        )
        assertEquals("""paragraph["a","a11"{bold}] paragraph["b"{bold},"b22"] paragraph["cc33"]""", show(RichEdits.toggleMark(d1, span(d1, "a1", "b2"), RichMarkType.BOLD)))
        assertEquals(
            """paragraph["aa11"] paragraph["bb22"] bulletList[listItem[paragraph["cc33"]]] paragraph["dd44"]""",
            show(pressed(d2, "a1", "b2", RichCommand.ClearFormatting)),
        )
        assertEquals(
            """paragraph["pp"] paragraph["aa"] paragraph["qq"]""",
            show(pressed(doc(quote(p("pp")), ul(li("aa")), h(2, "qq")), "pp", "qq", RichCommand.ClearFormatting)),
        )
        assertEquals("""paragraph["a"] horizontalRule paragraph["b22"] paragraph["cc33"]""", show(pressed(d1, "a1", "b2", RichCommand.Divider)))
    }

    @Test
    fun activeStatesOverSeveralBlocks() {
        val bold = doc(pm("aa ", bold("bold"), " cc"), p("dd"))
        assertFalse(RichEdits.isMarkActive(bold, span(bold, "bold", "dd$"), RichMarkType.BOLD))
        assertTrue(RichEdits.isMarkActive(bold, span(bold, "bold", "bold$"), RichMarkType.BOLD))
        val centered = doc(p("aa", align = "center"), p("bb", align = "center"))
        assertTrue(RichEdits.nodeActive(centered, span(centered, "aa", "bb$")) { it.align == RichAlign.CENTER })
        val centeredItems = pressed(doc(ul(li("aa"), li("bb"))), "aa", "bb$", RichCommand.Align(RichAlign.CENTER))
        assertFalse(RichEdits.nodeActive(centeredItems, RichSpan(0, 0, 1, 2)) { it.align == RichAlign.CENTER })
        val list = doc(ul(li("aa"), li("bb")), p("cc"))
        assertEquals(setOf(RichBlockKind.BULLET_ITEM), RichEdits.listKindsIn(list, span(list, "aa", "bb$")))
        assertEquals(emptySet<RichBlockKind>(), RichEdits.listKindsIn(list, span(list, "aa", "cc$")))
        val headings = doc(h(2, "aa"), h(2, "bb"))
        assertTrue(RichEdits.nodeActive(headings, span(headings, "aa", "bb$")) { it.kind == RichBlockKind.HEADING_2 })
        val quote = doc(quote(p("aa"), p("bb")), p("cc"))
        assertTrue(RichEdits.quotedIn(quote, span(quote, "aa", "bb$")))
        assertFalse(RichEdits.quotedIn(quote, span(quote, "aa", "cc$")))
        val colours = doc(pm("x ", styled("red", color = "#f00", size = "18px"), " y"), pm(styled("blue", color = "#00f")))
        assertEquals("#f00", RichEdits.markIn(colours, span(colours, "x", "blue$"), RichMarkType.TEXT_COLOR)?.value)
        assertEquals("#00f", RichEdits.markIn(colours, span(colours, "y", "blue$"), RichMarkType.TEXT_COLOR)?.value)
    }

    @Test
    fun copiedTextMatchesTheWebs() {
        assertEquals("a11\nbb22\nc", copied(d1, "a1", "c3"))
        assertEquals("- a11\n- b", copied(d2, "a1", "b2"))
        assertEquals("- b2", copied(d2, "b2", "b2$"))
        assertEquals("- b22\n- cc33\nd", copied(d2, "b2", "d4"))
        assertEquals("q11\nrr22\ns", copied(d4, "q1", "s3"))
        assertEquals("hh11\npp22\nco\nde", copied(doc(h(1, "hh11"), p("pp22", align = "center"), code("co\nde")), "hh", "de$"))
        assertEquals("a11\n\nc", copied(doc(p("aa11"), rule(), p("cc33")), "a1", "c3"))
        assertEquals("1. bb\n2. cc", copied(doc(ol(li("aa"), li("bb"), li("cc"))), "bb", "cc$"))
        assertEquals("- aa\n  - bb\n  - cc\n- dd", copied(nested, "aa", "dd$"))
        assertEquals("aa\n\nbb", copied(doc(p("aa"), p(""), p(""), p("bb")), "aa", "bb$"))
        assertEquals("l1\nl2\nbb", copied(doc(pm("l1", "\n", "l2"), p("bb")), "l1", "bb$"))
        assertEquals("- cont\n- bb", copied(doc(ul(li("aa", p("cont")), li("bb"))), "cont", "bb$"))
        // The web glues a task list's items on one line; they copy as bullets.
        assertEquals("- aa\n- bb\ncc", copied(doc(tl(ti("aa"), ti("bb")), p("cc")), "aa", "cc$"))
    }

    @Test
    fun keyboardSessionTypesJoinsAndSplitsLikeATextField() {
        var state = RichEditing(d1, RichSelection.caret(d1[0].id, 4))
        var inSync: Boolean? = null
        val session = RichImeSession({ state }, { state = it }, { inSync = it })

        session.setComposingText("x", 1)
        session.setComposingText("xy", 1)
        session.finishComposingText()
        assertEquals("""paragraph["aa11xy"] paragraph["bb22"] paragraph["cc33"]""", show(state.blocks))
        assertEquals(true, inSync)

        session.setSelection(state.flat.text.indexOf("bb22"), state.flat.text.indexOf("bb22"))
        session.deleteSurroundingText(1, 0)
        assertEquals("""paragraph["aa11xybb22"] paragraph["cc33"]""", show(state.blocks))
        assertEquals(RichSelection.caret(d1[0].id, 6), state.selection)
        assertEquals(true, inSync)

        session.commitText("\n", 1)
        assertEquals("""paragraph["aa11xy"] paragraph["bb22"] paragraph["cc33"]""", show(state.blocks))
        assertEquals(true, inSync)

        session.setSelection(0, state.flat.text.length)
        session.commitText("", 1)
        assertEquals("""paragraph[]""", show(state.blocks))
        assertEquals(true, inSync)
    }

    @Test
    fun keyboardSessionIsToldAgainWhenEnterLiftsAnEmptyItem() {
        val blocks = doc(ul(li("aa"), li("")), p("zz"))
        var state = RichEditing(blocks, RichSelection.caret(blocks[1].id, 0))
        var inSync: Boolean? = null
        val session = RichImeSession({ state }, { state = it }, { inSync = it })
        session.commitText("\n", 1)
        assertEquals("""bulletList[listItem[paragraph["aa"]]] paragraph[] paragraph["zz"]""", show(state.blocks))
        assertEquals(false, inSync)
    }

    @Test
    fun keyboardSessionEnterAtTheEndOfACodeBlockTwiceLeavesIt() {
        val blocks = doc(code("abc\n\n"), p("zz"))
        var state = RichEditing(blocks, RichSelection.caret(blocks[0].id, 5))
        val session = RichImeSession({ state }, { state = it }, {})
        session.enter()
        assertEquals("""codeBlock["abc"] paragraph[] paragraph["zz"]""", show(state.blocks))
        state = RichEditing(blocks, RichSelection.caret(blocks[0].id, 5))
        session.commitText("\n", 1)
        assertEquals("""codeBlock["abc"] paragraph[] paragraph["zz"]""", show(state.blocks))
        state = RichEditing(blocks, RichSelection.caret(blocks[0].id, 3))
        session.commitText("\n", 1)
        assertEquals("""codeBlock["abc\n\n\n"] paragraph["zz"]""", show(state.blocks))
    }

    @Test
    fun boldGoesOnAfterEnter() {
        val blocks = doc(pm(bold("bold")))
        val state = RichTyping.enter(RichEditing(blocks, RichSelection.caret(blocks[0].id, 4)))
        assertEquals(listOf(PendingMark(RichMarkType.BOLD)), state.pendingMarks)
        val typed = RichTyping.type(state, "x", 1, composing = false)
        assertEquals("""paragraph["bold"{bold}] paragraph["x"{bold}]""", show(typed.blocks))
    }

    // ---------- Documents ----------

    private fun doc(vararg nodes: String): List<RichBlock> =
        requireNotNull(RichDoc.parse("""{"v":1,"format":"tiptap","doc":{"type":"doc","content":[${nodes.joinToString(",")}]}}"""))

    private fun List<RichBlock>.dropThird(): List<RichBlock> = filterNot { it.text == "cc33" }

    private fun text(t: String) = """{"type":"text","text":${Json.encodeToString(String.serializer(), t)}}"""

    private fun p(t: String, align: String? = null) =
        """{"type":"paragraph"${align?.let { ",\"attrs\":{\"textAlign\":\"$it\"}" } ?: ""}${if (t.isEmpty()) "" else ",\"content\":[${text(t)}]"}}"""

    private fun pm(vararg parts: String) =
        """{"type":"paragraph","content":[${parts.joinToString(",") { if (it.startsWith("{")) it else if (it == "\n") "{\"type\":\"hardBreak\"}" else text(it) }}]}"""

    private fun bold(t: String) = """{"type":"text","text":"$t","marks":[{"type":"bold"}]}"""

    private fun styled(t: String, color: String? = null, size: String? = null) =
        """{"type":"text","text":"$t","marks":[{"type":"textStyle","attrs":{${listOfNotNull(color?.let { "\"color\":\"$it\"" }, size?.let { "\"fontSize\":\"$it\"" }).joinToString(",")}}}]}"""

    private fun h(level: Int, t: String) = """{"type":"heading","attrs":{"level":$level},"content":[${text(t)}]}"""

    private fun li(t: String, vararg more: String) = """{"type":"listItem","content":[${(listOf(p(t)) + more).joinToString(",")}]}"""

    private fun ti(t: String) = """{"type":"taskItem","attrs":{"checked":false},"content":[${p(t)}]}"""

    private fun ul(vararg items: String) = """{"type":"bulletList","content":[${items.joinToString(",")}]}"""

    private fun ol(vararg items: String) = """{"type":"orderedList","content":[${items.joinToString(",")}]}"""

    private fun tl(vararg items: String) = """{"type":"taskList","content":[${items.joinToString(",")}]}"""

    private fun quote(vararg children: String) = """{"type":"blockquote","content":[${children.joinToString(",")}]}"""

    private fun code(t: String) = """{"type":"codeBlock","content":[${text(t)}]}"""

    private fun rule() = """{"type":"horizontalRule"}"""

    // ---------- Selections and results ----------

    /** Where [marker] starts, or ends with a trailing "$", in the blocks. */
    private fun pos(blocks: List<RichBlock>, marker: String): RichPos {
        val end = marker.endsWith("$")
        val needle = marker.removeSuffix("$")
        val block = blocks.first { it.kind.hasText && needle in it.text }
        return RichPos(block.id, block.text.indexOf(needle) + if (end) needle.length else 0)
    }

    private fun span(blocks: List<RichBlock>, from: String, to: String): RichSpan =
        requireNotNull(RichSelection(pos(blocks, from), pos(blocks, to)).resolve(blocks))

    private fun deleted(blocks: List<RichBlock>, from: String, to: String) = show(RichEdits.deleteSelection(blocks, span(blocks, from, to)).blocks)

    private fun entered(blocks: List<RichBlock>, from: String, to: String) = show(RichEdits.splitSelection(blocks, span(blocks, from, to))!!.blocks)

    /** The bar's [command] pressed over [from]..[to]: the blocks it
     *  leaves, as they were when nothing changes. */
    private fun pressed(blocks: List<RichBlock>, from: String, to: String, command: RichCommand): List<RichBlock> =
        RichCommands.run(RichEditing(blocks, RichSelection(pos(blocks, from), pos(blocks, to))), command)?.blocks ?: blocks

    private fun kind(blocks: List<RichBlock>, from: String, to: String, kind: RichBlockKind) =
        show(pressed(blocks, from, to, if (kind.isListItem) RichCommand.ToggleList(kind) else RichCommand.SetStyle(kind)))

    private fun quoted(blocks: List<RichBlock>, from: String, to: String) = show(pressed(blocks, from, to, RichCommand.Quote))

    private fun coded(blocks: List<RichBlock>, from: String, to: String) = show(pressed(blocks, from, to, RichCommand.CodeBlock))

    private fun copied(blocks: List<RichBlock>, from: String, to: String) = RichClipboard.plainText(blocks, span(blocks, from, to))

    private fun typed(blocks: List<RichBlock>, from: String, to: String, text: String): String {
        val state = RichEditing(blocks, RichSelection(pos(blocks, from), pos(blocks, to)))
        return show(RichTyping.type(state, text, 1, composing = false).blocks)
    }

    /** The document the way the web measurements print it. */
    private fun show(blocks: List<RichBlock>): String {
        fun attrs(node: JsonObject): String {
            val kept = (node["attrs"] as? JsonObject)?.filter { (key, value) ->
                val primitive = value as? JsonPrimitive
                key != "start" && primitive != null && primitive !is JsonNull &&
                    primitive.intOrNull != 0 && primitive.booleanOrNull != false && primitive.content != "left"
            }.orEmpty()
            return if (kept.isEmpty()) "" else kept.entries.joinToString(",", "{", "}") { (k, v) -> "\"$k\":$v" }
        }
        fun walk(node: JsonObject): String {
            val type = node["type"]!!.jsonPrimitive.content
            if (type == "text") {
                val marks = (node["marks"] as? JsonArray)?.joinToString("+") { it.jsonObject["type"]!!.jsonPrimitive.content }
                return Json.encodeToString(String.serializer(), node["text"]!!.jsonPrimitive.content) + (marks?.let { "{$it}" } ?: "")
            }
            val children = (node["content"] as? JsonArray)?.map { walk(it.jsonObject) }
            val head = type + attrs(node)
            return if (children == null) (if (type == "horizontalRule" || type == "hardBreak") head else "$head[]") else "$head[${children.joinToString(",")}]"
        }
        val doc = Json.parseToJsonElement(RichDoc.encode(blocks)).jsonObject["doc"]!!.jsonObject
        return doc["content"]!!.jsonArray.joinToString(" ") { walk(it.jsonObject) }
    }
}
