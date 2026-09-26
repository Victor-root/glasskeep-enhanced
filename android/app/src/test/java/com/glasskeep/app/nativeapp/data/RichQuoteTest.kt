package com.glasskeep.app.nativeapp.data

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** Quotes holding more than paragraphs, each case checked against what the
 *  web editor leaves in the same situation. */
class RichQuoteTest {
    @Test
    fun quoteHoldingAHeadingAndListsStaysEditable() {
        // What Tiptap 3 writes for a quote the toolbar put around a heading
        // and "- " typed in it: every attribute of the schema.
        val content = envelope(
            """{"type":"blockquote","attrs":{"indent":0},"content":[
                {"type":"heading","attrs":{"textAlign":null,"indent":0,"level":2},"content":[{"type":"text","text":"Title"}]},
                {"type":"paragraph","attrs":{"textAlign":null,"indent":0},"content":[{"type":"text","text":"Body"}]},
                {"type":"bulletList","content":[
                    {"type":"listItem","attrs":{"indent":0},"content":[
                        {"type":"paragraph","attrs":{"textAlign":null,"indent":0},"content":[{"type":"text","text":"Item"}]}
                    ]}
                ]},
                {"type":"codeBlock","attrs":{"indent":0,"language":null},"content":[{"type":"text","text":"code"}]},
                {"type":"horizontalRule"}
            ]}""",
        )

        val blocks = requireNotNull(RichDoc.parse(content))

        assertEquals(
            listOf(
                RichBlockKind.HEADING_2,
                RichBlockKind.PARAGRAPH,
                RichBlockKind.BULLET_ITEM,
                RichBlockKind.CODE_BLOCK,
                RichBlockKind.DIVIDER,
            ),
            blocks.map { it.kind },
        )
        assertEquals(1, blocks.map { it.quote?.id }.distinct().size)
        assertEquals(
            "blockquote[heading(Title),paragraph(Body),bulletList[listItem[paragraph(Item)]],codeBlock(code),horizontalRule]",
            shape(RichDoc.encode(blocks)),
        )
    }

    @Test
    fun twoQuotesInARowStayTwoQuotes() {
        val blocks = requireNotNull(
            RichDoc.parse(envelope("""${quote("""{"type":"paragraph","content":[{"type":"text","text":"a"}]}""")},${quote("""{"type":"paragraph","content":[{"type":"text","text":"b"}]}""")}""")),
        )

        assertNotEquals(blocks[0].quote?.id, blocks[1].quote?.id)
        assertEquals("blockquote[paragraph(a)] blockquote[paragraph(b)]", shape(RichDoc.encode(blocks)))
    }

    @Test
    fun quoteIndentAndItsParagraphIndentAreBothKept() {
        val content = envelope(
            """{"type":"blockquote","attrs":{"indent":1},"content":[
                {"type":"paragraph","attrs":{"indent":2},"content":[{"type":"text","text":"a"}]}
            ]}""",
        )

        val block = requireNotNull(RichDoc.parse(content)).single()

        assertEquals(1, block.quote?.indent)
        assertEquals(2, block.indent)
        assertEquals("blockquote{indent=1}[paragraph{indent=2}(a)]", shape(RichDoc.encode(listOf(block)), withIndent = true))
    }

    @Test
    fun quoteInsideAQuoteLeavesTheNoteReadOnly() {
        val content = envelope(quote(quote("""{"type":"paragraph","content":[{"type":"text","text":"a"}]}""")))

        assertNull(RichDoc.parse(content))
    }

    @Test
    fun listUnderAQuoteStaysOutOfIt() {
        val quoted = RichDoc.newBlock(RichBlockKind.BULLET_ITEM).copy(text = "in", quote = RichQuote())
        val after = RichDoc.newBlock(RichBlockKind.BULLET_ITEM).copy(text = "out", nestLevel = 1)

        assertEquals(
            "blockquote[bulletList[listItem[paragraph(in)]]] bulletList[listItem[paragraph(out)]]",
            shape(RichDoc.encode(listOf(quoted, after))),
        )
    }

    @Test
    fun enterOnAnEmptyItemOfAQuotedListLeavesTheListNotTheQuote() {
        val quote = RichQuote()
        val item = RichDoc.newBlock(RichBlockKind.BULLET_ITEM).copy(text = "a", quote = quote)
        val empty = RichDoc.newBlock(RichBlockKind.BULLET_ITEM).copy(quote = quote)

        val edit = requireNotNull(RichEdits.split(listOf(item, empty), empty.id, 0))

        assertEquals("blockquote[bulletList[listItem[paragraph(a)]],paragraph()]", shape(RichDoc.encode(edit.blocks)))
    }

    @Test
    fun enterOnAnEmptyLineInTheMiddleOfAQuoteSplitsItThenLeavesIt() {
        val quote = RichQuote()
        val empty = RichDoc.newBlock().copy(quote = quote)
        val blocks = listOf(
            RichDoc.newBlock().copy(text = "a", quote = quote),
            empty,
            RichDoc.newBlock().copy(text = "b", quote = quote),
        )

        val split = requireNotNull(RichEdits.split(blocks, empty.id, 0)).blocks
        assertEquals("blockquote[paragraph(a)] blockquote[paragraph(),paragraph(b)]", shape(RichDoc.encode(split)))

        val left = requireNotNull(RichEdits.split(split, empty.id, 0)).blocks
        assertEquals("blockquote[paragraph(a)] paragraph() blockquote[paragraph(b)]", shape(RichDoc.encode(left)))
    }

    @Test
    fun backspaceUnderAQuoteMovesTheBlockIntoItAndJoinsTheQuoteBelow() {
        val below = RichDoc.newBlock().copy(text = "p")
        val blocks = listOf(
            RichDoc.newBlock().copy(text = "a", quote = RichQuote()),
            below,
            RichDoc.newBlock().copy(text = "b", quote = RichQuote()),
        )

        val edit = requireNotNull(RichEdits.joinBackward(blocks, below.id))

        assertEquals("blockquote[paragraph(a),paragraph(p),paragraph(b)]", shape(RichDoc.encode(edit.blocks)))
    }

    @Test
    fun backspaceAtTheStartOfAQuoteLeavesItUnlessAnotherQuoteIsRightAbove() {
        val first = RichDoc.newBlock(RichBlockKind.HEADING_2).copy(text = "t", quote = RichQuote())
        val lifted = requireNotNull(RichEdits.joinBackward(listOf(RichDoc.newBlock().copy(text = "x"), first), first.id))
        assertEquals("paragraph(x) heading(t)", shape(RichDoc.encode(lifted.blocks)))

        val second = RichDoc.newBlock().copy(text = "b", quote = RichQuote())
        val merged = requireNotNull(RichEdits.joinBackward(listOf(RichDoc.newBlock().copy(text = "a", quote = RichQuote()), second), second.id))
        assertEquals("blockquote[paragraph(a),paragraph(b)]", shape(RichDoc.encode(merged.blocks)))
    }

    @Test
    fun quoteButtonWrapsAHeadingAloneAndLiftsAQuotedItemOutOfItsList() {
        val heading = RichDoc.newBlock(RichBlockKind.HEADING_2).copy(text = "t")
        val quote = RichQuote()
        val wrapped = requireNotNull(RichEdits.toggleQuote(listOf(RichDoc.newBlock().copy(text = "a", quote = quote), heading), heading.id))
        assertEquals("blockquote[paragraph(a)] blockquote[heading(t)]", shape(RichDoc.encode(wrapped.blocks)))

        val item = RichDoc.newBlock(RichBlockKind.BULLET_ITEM).copy(text = "i")
        assertNull(RichEdits.toggleQuote(listOf(item), item.id))

        val quotedItem = item.copy(quote = quote)
        val lifted = requireNotNull(RichEdits.toggleQuote(listOf(quotedItem), quotedItem.id))
        assertEquals("blockquote[paragraph(i)]", shape(RichDoc.encode(lifted.blocks)))
    }

    @Test
    fun styleGalleryOnAQuotedItemClearsItsWholeListOutOfTheQuote() {
        val quote = RichQuote()
        val first = RichDoc.newBlock(RichBlockKind.BULLET_ITEM).copy(text = "b", quote = quote)
        val blocks = listOf(
            RichDoc.newBlock().copy(text = "a", quote = quote),
            first,
            RichDoc.newBlock(RichBlockKind.BULLET_ITEM).copy(text = "c", quote = quote),
            RichDoc.newBlock().copy(text = "d", quote = quote),
        )

        val edit = requireNotNull(RichEdits.setKind(blocks, first.id, RichBlockKind.HEADING_2))

        assertEquals(
            "blockquote[paragraph(a)] heading(b) bulletList[listItem[paragraph(c)]] blockquote[paragraph(d)]",
            shape(RichDoc.encode(edit.blocks)),
        )
    }

    @Test
    fun paragraphStyleOnAQuotedParagraphTakesItOutOfTheQuote() {
        val paragraph = RichDoc.newBlock().copy(text = "a", quote = RichQuote())

        val edit = requireNotNull(RichEdits.setKind(listOf(paragraph), paragraph.id, RichBlockKind.PARAGRAPH))

        assertEquals("paragraph(a)", shape(RichDoc.encode(edit.blocks)))
        assertNull(RichEdits.setKind(edit.blocks, paragraph.id, RichBlockKind.PARAGRAPH))
    }

    @Test
    fun indentInAQuoteMovesBothTheBlockAndTheQuote() {
        val quote = RichQuote()
        val item = RichDoc.newBlock(RichBlockKind.BULLET_ITEM).copy(text = "b", quote = quote)
        val blocks = listOf(RichDoc.newBlock().copy(text = "a", quote = quote), item)

        val edit = requireNotNull(RichEdits.shiftIndent(blocks, item.id, 1))

        assertEquals(
            "blockquote{indent=1}[paragraph(a),bulletList[listItem{indent=1}[paragraph(b)]]]",
            shape(RichDoc.encode(edit.blocks), withIndent = true),
        )
        assertEquals(false, RichEdits.canShiftIndent(item.copy(quote = quote.copy(indent = 1)), -1))
    }

    @Test
    fun eraserTakesTheBlockOutOfItsQuoteWithDefaultAttributes() {
        val quote = RichQuote()
        val middle = RichDoc.newBlock().copy(text = "b", quote = quote, align = RichAlign.CENTER, indent = 2)
        val blocks = listOf(
            RichDoc.newBlock().copy(text = "a", quote = quote),
            middle,
            RichDoc.newBlock().copy(text = "c", quote = quote),
        )

        val edit = requireNotNull(RichEdits.clearFormatting(blocks, middle.id, 0, 1))

        assertEquals(
            "blockquote[paragraph(a)] paragraph(b) blockquote[paragraph(c)]",
            shape(RichDoc.encode(edit.blocks), withIndent = true),
        )
        assertEquals(RichAlign.LEFT, edit.blocks[1].align)
    }

    @Test
    fun quoteShortcutJoinsTheQuoteRightAbove() {
        val quote = RichQuote()
        val heading = RichDoc.newBlock(RichBlockKind.HEADING_2).copy(text = "> t")
        val blocks = listOf(RichDoc.newBlock().copy(text = "a", quote = quote), heading)

        val result = requireNotNull(RichInputRules.typed(blocks, heading.id, "> t", emptyList(), 2, " "))

        assertEquals("blockquote[paragraph(a),heading(t)]", shape(RichDoc.encode(result.edit.blocks)))
    }

    @Test
    fun ruleEndingAQuoteGetsAnEmptyLineInsideIt() {
        val paragraph = RichDoc.newBlock().copy(text = "a", quote = RichQuote())
        val blocks = listOf(paragraph, RichDoc.newBlock().copy(text = "z"))

        val edit = requireNotNull(RichEdits.insertDivider(blocks, paragraph.id, 1, 1))

        assertEquals("blockquote[paragraph(a),horizontalRule,paragraph()] paragraph(z)", shape(RichDoc.encode(edit.blocks)))
        assertEquals(edit.blocks[2].id, edit.focusId)
    }

    @Test
    fun markdownQuoteLinesMakeOneQuoteUntilABlankLine() {
        val blocks = MarkdownDoc.toRichBlocks("> a\n> b\n\n> c")

        assertEquals("blockquote[paragraph(a),paragraph(b)] blockquote[paragraph(c)]", shape(RichDoc.encode(blocks)))
    }

    private fun quote(node: String): String = """{"type":"blockquote","content":[$node]}"""

    private fun envelope(nodes: String): String =
        """{"v":1,"format":"tiptap","doc":{"type":"doc","content":[$nodes]}}"""

    /** The encoded doc's node tree, one top-level node after another: a
     *  text block with its text in parentheses, any other node with its
     *  children in brackets, and with [withIndent] every indent set. */
    private fun shape(content: String, withIndent: Boolean = false): String {
        fun walk(node: JsonObject): String {
            val type = node["type"]!!.jsonPrimitive.content
            val indent = (node["attrs"] as? JsonObject)?.get("indent")?.jsonPrimitive?.content?.takeIf { withIndent && it != "0" }
            val children = node["content"]?.jsonArray.orEmpty().map { it.jsonObject }
            val head = type + (indent?.let { "{indent=$it}" } ?: "")
            return when {
                type == "paragraph" || type == "heading" || type == "codeBlock" ->
                    "$head(${children.joinToString("") { it["text"]?.jsonPrimitive?.content.orEmpty() }})"
                children.isEmpty() -> head
                else -> "$head[${children.joinToString(",") { walk(it) }}]"
            }
        }
        val doc = Json.parseToJsonElement(content).jsonObject["doc"]!!.jsonObject
        return doc["content"]!!.jsonArray.joinToString(" ") { walk(it.jsonObject) }
    }
}
