package com.glasskeep.app.nativeapp.data

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * Two lists of one kind in a row stay two lists, as the web keeps them:
 * a note, what is done to it, and what the web editor left there, the
 * note written as the web's document (`ol[a, b] | p(x)`).
 */
class RichAdjacentListsTest {
    private fun p(text: String) = if (text.isEmpty()) """{"type":"paragraph"}""" else """{"type":"paragraph","content":[{"type":"text","text":"$text"}]}"""
    private fun li(text: String, vararg held: String) = """{"type":"listItem","content":[${(listOf(p(text)) + held).joinToString(",")}]}"""
    private fun ti(text: String) = """{"type":"taskItem","attrs":{"checked":false},"content":[${p(text)}]}"""
    private fun ol(vararg items: String, start: Int = 1) = """{"type":"orderedList","attrs":{"start":$start},"content":[${items.joinToString(",")}]}"""
    private fun ul(vararg items: String) = """{"type":"bulletList","content":[${items.joinToString(",")}]}"""
    private fun tl(vararg items: String) = """{"type":"taskList","content":[${items.joinToString(",")}]}"""

    private fun note(vararg nodes: String): List<RichBlock> =
        requireNotNull(RichDoc.parse("""{"v":1,"format":"tiptap","doc":{"type":"doc","content":[${nodes.joinToString(",")}]}}"""))

    /** The document [blocks] save, one node after another. */
    private fun shape(blocks: List<RichBlock>): String = shape(RichDoc.encodeDoc(blocks))

    private fun shape(node: JsonObject): String {
        val children = (node["content"] as? JsonArray)?.map { shape(it.jsonObject) }.orEmpty()
        return when (val type = node.getValue("type").jsonPrimitive.content) {
            "doc" -> children.joinToString(" | ")
            "text" -> node.getValue("text").jsonPrimitive.content
            "paragraph" -> "p(" + children.joinToString("") + ")"
            "orderedList" -> "ol" + ((node["attrs"] as? JsonObject)?.get("start")?.jsonPrimitive?.content ?: "") + "[" + children.joinToString(", ") + "]"
            "bulletList" -> "ul[" + children.joinToString(", ") + "]"
            "taskList" -> "tl[" + children.joinToString(", ") + "]"
            "listItem", "taskItem" -> children.singleOrNull()?.removeSurrounding("p(", ")") ?: children.joinToString(" ", "{", "}")
            else -> type
        }
    }

    /** [key] pressed with the caret at the start of the first block holding
     *  [text], or at its end with [atEnd]. */
    private fun press(blocks: List<RichBlock>, text: String, key: String, atEnd: Boolean = false): List<RichBlock> {
        val block = blocks.first { it.text == text }
        val state = RichEditing(blocks, RichSelection.caret(block.id, if (atEnd) block.text.length else 0))
        return when (key) {
            "Enter" -> RichTyping.enter(state)
            else -> RichTyping.backspace(state)
        }.blocks
    }

    /** [typed] typed into the paragraph holding it, as the keyboard ends it. */
    private fun type(blocks: List<RichBlock>, typed: String): List<RichBlock> {
        val block = blocks.first { it.text == typed }
        return requireNotNull(RichInputRules.typed(blocks, block.id, typed, emptyList(), typed.length, " ")).edit.blocks
    }

    @Test
    fun savingKeepsTwoListsInARowApart() {
        val blocks = note(ol(li("a"), li("b")), ol(li("c")), ul(li("d")), ul(li("e")), tl(ti("f")), tl(ti("g")))
        assertEquals("ol[a, b] | ol[c] | ul[d] | ul[e] | tl[f] | tl[g]", shape(blocks))
    }

    @Test
    fun enterAndBackspaceSplitAndLiftAsTheWebDoes() {
        assertEquals("ol[a, ] | ol[b] | p()", shape(press(note(ol(li("a")), ol(li("b")), p("")), "a", "Enter", atEnd = true)))
        assertEquals("ol[a] | p() | ol[b] | p()", shape(press(note(ol(li("a"), li("")), ol(li("b")), p("")), "", "Enter")))
        assertEquals("ol5[a] | p() | ol5[c] | p()", shape(press(note(ol(li("a"), li(""), li("c"), start = 5), p("")), "", "Enter")))
        assertEquals("ol[a] | p(b) | p()", shape(press(note(ol(li("a")), ol(li("b")), p("")), "b", "Backspace")))
        assertEquals("ol[a] | ol[b] | p(end)", shape(press(note(ol(li("a")), p(""), ol(li("b")), p("end")), "", "Backspace")))
        assertEquals("ul[a] | ul[b] | p(end)", shape(press(note(ul(li("a")), p(""), ul(li("b")), p("end")), "", "Backspace")))
    }

    @Test
    fun aListSplitByEnterStaysTwoListsOnceTheLineBetweenGoes() {
        val split = press(note(ol(li("a"), li(""), li("c")), p("")), "", "Enter")
        assertEquals("ol[a] | ol[c] | p()", shape(press(split, "", "Backspace")))
    }

    @Test
    fun aLiftedItemTakesTheItemsAfterItAsTheWebDoes() {
        // Nested: they join the list it holds last when of their kind.
        assertEquals(
            "ul[a, {p(x) ul[c, y]}] | p()",
            shape(press(note(ul(li("a", ul(li("x", ul(li("c"))), li("y")))), p("")), "x", "Backspace")),
        )
        assertEquals(
            "ul[a, {p(x) ol[c] ul[y]}] | p()",
            shape(press(note(ul(li("a", ul(li("x", ol(li("c"))), li("y")))), p("")), "x", "Backspace")),
        )
        assertEquals("ul[a, {p(x) ol4[y]}] | p()", shape(press(note(ul(li("a", ol(li("x"), li("y"), start = 4))), p("")), "x", "Backspace")))
        // Top-level: they stay a list of their own, with the list's start.
        assertEquals("p(x) | ol[c] | ol3[y] | p()", shape(press(note(ol(li("x", ol(li("c"))), li("y"), start = 3), p("")), "x", "Backspace")))
    }

    @Test
    fun aTypedListJoinsTheListAboveAsTheWebDoes() {
        assertEquals("ol[a, b, ]", shape(type(note(ol(li("a"), li("b")), p("3. ")), "3. ")))
        assertEquals("ol5[a, b, ]", shape(type(note(ol(li("a"), li("b"), start = 5), p("7. ")), "7. ")))
        assertEquals("ol[a, b] | ol[]", shape(type(note(ol(li("a"), li("b")), p("1. ")), "1. ")))
        assertEquals("ol[a, b] | ol4[]", shape(type(note(ol(li("a"), li("b")), p("4. ")), "4. ")))
        assertEquals("ul[a, ]", shape(type(note(ul(li("a")), p("- ")), "- ")))
        assertEquals("tl[f] | tl[]", shape(type(note(tl(ti("f")), p("[ ] ")), "[ ] ")))
        // A list below is never joined.
        assertEquals("ul[] | ul[b]", shape(type(note(p("- "), ul(li("b"))), "- ")))
    }

    @Test
    fun copyNumbersEachListFromItsStart() {
        val blocks = note(ol(li("a"), li("b")), ol(li("c"), start = 4))
        assertEquals("1. a\n2. b\n4. c", RichClipboard.plainText(blocks, RichSpan(0, 0, 2, 1)))
    }

    @Test
    fun aCommandThatChangesNothingLeavesTheListsAsTheyWere() {
        val blocks = note(ol(li("a")), ol(li("b")), p("end"))
        val state = RichEditing(blocks, RichSelection.caret(blocks.last().id, 0))
        val next = requireNotNull(RichCommands.run(state, RichCommand.Align(RichAlign.LEFT)))
        assertEquals(blocks, next.blocks)
    }
}
