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

/** Quotes holding more than paragraphs, quotes inside quotes, and what a
 *  list item holds after its paragraph, each case checked against what the
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
        assertEquals(1, blocks.map { it.quotes.single().id }.distinct().size)
        assertEquals(
            "blockquote[heading(Title),paragraph(Body),bulletList[listItem[paragraph(Item)]],codeBlock(code),horizontalRule]",
            shape(RichDoc.encode(blocks)),
        )
    }

    @Test
    fun twoQuotesInARowStayTwoQuotes() {
        val blocks = requireNotNull(RichDoc.parse(envelope("${quote(paragraph("a"))},${quote(paragraph("b"))}")))

        assertNotEquals(blocks[0].quotes, blocks[1].quotes)
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

        assertEquals(1, block.quotes.single().indent)
        assertEquals(2, block.indent)
        assertEquals("blockquote{indent=1}[paragraph{indent=2}(a)]", shape(RichDoc.encode(listOf(block)), withIndent = true))
    }

    @Test
    fun quoteInsideAQuoteStaysEditable() {
        val content = envelope(quote("${quote(paragraph("in"))},${paragraph("out")}"))

        val blocks = requireNotNull(RichDoc.parse(content))

        assertEquals(listOf(2, 1), blocks.map { it.quotes.size })
        assertEquals("blockquote[blockquote[paragraph(in)],paragraph(out)]", shape(RichDoc.encode(blocks)))
    }

    @Test
    fun quoteInsideAListItemLeavesTheNoteReadOnly() {
        val content = envelope(
            """{"type":"bulletList","content":[{"type":"listItem","content":[${paragraph("a")},${quote(paragraph("b"))}]}]}""",
        )

        assertNull(RichDoc.parse(content))
    }

    @Test
    fun listUnderAQuoteStaysOutOfIt() {
        val quoted = RichDoc.newBlock(RichBlockKind.BULLET_ITEM).copy(text = "in", quotes = listOf(RichQuote()))
        val after = RichDoc.newBlock(RichBlockKind.BULLET_ITEM).copy(text = "out", nestLevel = 1)

        assertEquals(
            "blockquote[bulletList[listItem[paragraph(in)]]] bulletList[listItem[paragraph(out)]]",
            shape(RichDoc.encode(listOf(quoted, after))),
        )
    }

    @Test
    fun enterOnAnEmptyItemOfAQuotedListLeavesTheListNotTheQuote() {
        val quotes = listOf(RichQuote())
        val item = RichDoc.newBlock(RichBlockKind.BULLET_ITEM).copy(text = "a", quotes = quotes)
        val empty = RichDoc.newBlock(RichBlockKind.BULLET_ITEM).copy(quotes = quotes)

        val edit = requireNotNull(RichEdits.split(listOf(item, empty), empty.id, 0))

        assertEquals("blockquote[bulletList[listItem[paragraph(a)]],paragraph()]", shape(RichDoc.encode(edit.blocks)))
    }

    @Test
    fun enterOnAnEmptyLineInTheMiddleOfAQuoteSplitsItThenLeavesIt() {
        val quotes = listOf(RichQuote())
        val empty = RichDoc.newBlock().copy(quotes = quotes)
        val blocks = listOf(
            RichDoc.newBlock().copy(text = "a", quotes = quotes),
            empty,
            RichDoc.newBlock().copy(text = "b", quotes = quotes),
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
            RichDoc.newBlock().copy(text = "a", quotes = listOf(RichQuote())),
            below,
            RichDoc.newBlock().copy(text = "b", quotes = listOf(RichQuote())),
        )

        val edit = requireNotNull(RichEdits.joinBackward(blocks, below.id))

        assertEquals("blockquote[paragraph(a),paragraph(p),paragraph(b)]", shape(RichDoc.encode(edit.blocks)))
    }

    @Test
    fun backspaceAtTheStartOfAQuoteLeavesItUnlessAnotherQuoteIsRightAbove() {
        val first = RichDoc.newBlock(RichBlockKind.HEADING_2).copy(text = "t", quotes = listOf(RichQuote()))
        val lifted = requireNotNull(RichEdits.joinBackward(listOf(RichDoc.newBlock().copy(text = "x"), first), first.id))
        assertEquals("paragraph(x) heading(t)", shape(RichDoc.encode(lifted.blocks)))

        val second = RichDoc.newBlock().copy(text = "b", quotes = listOf(RichQuote()))
        val merged = requireNotNull(
            RichEdits.joinBackward(listOf(RichDoc.newBlock().copy(text = "a", quotes = listOf(RichQuote())), second), second.id),
        )
        assertEquals("blockquote[paragraph(a),paragraph(b)]", shape(RichDoc.encode(merged.blocks)))
    }

    @Test
    fun quoteButtonWrapsAHeadingAloneAndLiftsAQuotedItemOutOfItsList() {
        val heading = RichDoc.newBlock(RichBlockKind.HEADING_2).copy(text = "t")
        val quotes = listOf(RichQuote())
        val wrapped = requireNotNull(RichEdits.toggleQuote(listOf(RichDoc.newBlock().copy(text = "a", quotes = quotes), heading), heading.id))
        assertEquals("blockquote[paragraph(a)] blockquote[heading(t)]", shape(RichDoc.encode(wrapped.blocks)))

        val item = RichDoc.newBlock(RichBlockKind.BULLET_ITEM).copy(text = "i")
        assertNull(RichEdits.toggleQuote(listOf(item), item.id))

        val quotedItem = item.copy(quotes = quotes)
        val lifted = requireNotNull(RichEdits.toggleQuote(listOf(quotedItem), quotedItem.id))
        assertEquals("blockquote[paragraph(i)]", shape(RichDoc.encode(lifted.blocks)))
    }

    @Test
    fun styleGalleryOnAQuotedItemClearsItsWholeListOutOfTheQuote() {
        val quotes = listOf(RichQuote())
        val first = RichDoc.newBlock(RichBlockKind.BULLET_ITEM).copy(text = "b", quotes = quotes)
        val blocks = listOf(
            RichDoc.newBlock().copy(text = "a", quotes = quotes),
            first,
            RichDoc.newBlock(RichBlockKind.BULLET_ITEM).copy(text = "c", quotes = quotes),
            RichDoc.newBlock().copy(text = "d", quotes = quotes),
        )

        val edit = requireNotNull(RichEdits.setKind(blocks, first.id, RichBlockKind.HEADING_2))

        assertEquals(
            "blockquote[paragraph(a)] heading(b) bulletList[listItem[paragraph(c)]] blockquote[paragraph(d)]",
            shape(RichDoc.encode(edit.blocks)),
        )
    }

    @Test
    fun paragraphStyleOnAQuotedParagraphTakesItOutOfTheQuote() {
        val paragraph = RichDoc.newBlock().copy(text = "a", quotes = listOf(RichQuote()))

        val edit = requireNotNull(RichEdits.setKind(listOf(paragraph), paragraph.id, RichBlockKind.PARAGRAPH))

        assertEquals("paragraph(a)", shape(RichDoc.encode(edit.blocks)))
        assertNull(RichEdits.setKind(edit.blocks, paragraph.id, RichBlockKind.PARAGRAPH))
    }

    @Test
    fun indentInAQuoteMovesBothTheBlockAndTheQuote() {
        val quote = RichQuote()
        val item = RichDoc.newBlock(RichBlockKind.BULLET_ITEM).copy(text = "b", quotes = listOf(quote))
        val blocks = listOf(RichDoc.newBlock().copy(text = "a", quotes = listOf(quote)), item)

        val edit = requireNotNull(RichEdits.shiftIndent(blocks, item.id, 1))

        assertEquals(
            "blockquote{indent=1}[paragraph(a),bulletList[listItem{indent=1}[paragraph(b)]]]",
            shape(RichDoc.encode(edit.blocks), withIndent = true),
        )
        val quoteOnly = blocks.map { it.copy(quotes = listOf(quote.copy(indent = 1))) }
        assertEquals(false, RichEdits.canShiftIndent(quoteOnly, item.id, -1))
    }

    @Test
    fun eraserTakesTheBlockOutOfItsQuoteWithDefaultAttributes() {
        val quotes = listOf(RichQuote())
        val middle = RichDoc.newBlock().copy(text = "b", quotes = quotes, align = RichAlign.CENTER, indent = 2)
        val blocks = listOf(
            RichDoc.newBlock().copy(text = "a", quotes = quotes),
            middle,
            RichDoc.newBlock().copy(text = "c", quotes = quotes),
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
        val heading = RichDoc.newBlock(RichBlockKind.HEADING_2).copy(text = "> t")
        val blocks = listOf(RichDoc.newBlock().copy(text = "a", quotes = listOf(RichQuote())), heading)

        val result = requireNotNull(RichInputRules.typed(blocks, heading.id, "> t", emptyList(), 2, " "))

        assertEquals("blockquote[paragraph(a),heading(t)]", shape(RichDoc.encode(result.edit.blocks)))
    }

    @Test
    fun ruleEndingAQuoteGetsAnEmptyLineInsideIt() {
        val paragraph = RichDoc.newBlock().copy(text = "a", quotes = listOf(RichQuote()))
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

    @Test
    fun enterOnAnEmptyLineEndingAnInnerQuoteMovesItToTheOuterOne() {
        val outer = RichQuote()
        val inner = listOf(outer, RichQuote())
        val empty = RichDoc.newBlock().copy(quotes = inner)
        val blocks = listOf(
            RichDoc.newBlock().copy(text = "in", quotes = inner),
            empty,
            RichDoc.newBlock().copy(text = "out", quotes = listOf(outer)),
        )

        val edit = requireNotNull(RichEdits.split(blocks, empty.id, 0))

        assertEquals("blockquote[blockquote[paragraph(in)],paragraph(),paragraph(out)]", shape(RichDoc.encode(edit.blocks)))
    }

    @Test
    fun backspaceUnderAnInnerQuoteMovesTheLineIntoIt() {
        val outer = RichQuote()
        val line = RichDoc.newBlock().copy(text = "out", quotes = listOf(outer))
        val blocks = listOf(RichDoc.newBlock().copy(text = "in", quotes = listOf(outer, RichQuote())), line)

        val edit = requireNotNull(RichEdits.joinBackward(blocks, line.id))

        assertEquals("blockquote[blockquote[paragraph(in),paragraph(out)]]", shape(RichDoc.encode(edit.blocks)))
    }

    @Test
    fun quoteShortcutInAQuoteNestsAnotherOne() {
        val line = RichDoc.newBlock().copy(text = "> in", quotes = listOf(RichQuote(), RichQuote()))

        val result = requireNotNull(RichInputRules.typed(listOf(line), line.id, "> in", emptyList(), 2, " "))

        assertEquals("blockquote[blockquote[blockquote[paragraph(in)]]]", shape(RichDoc.encode(result.edit.blocks)))
    }

    @Test
    fun eraserLiftsEachInnerQuoteOutOfTheOnesAroundIt() {
        val q1 = RichQuote()
        val q2 = RichQuote()
        val q3 = RichQuote()
        val line = RichDoc.newBlock().copy(text = "in", quotes = listOf(q1, q2, q3))
        val blocks = listOf(
            RichDoc.newBlock().copy(text = "o", quotes = listOf(q1)),
            RichDoc.newBlock().copy(text = "m", quotes = listOf(q1, q2)),
            line,
            RichDoc.newBlock().copy(text = "in2", quotes = listOf(q1, q2, q3)),
            RichDoc.newBlock().copy(text = "m2", quotes = listOf(q1, q2)),
        )

        val edit = requireNotNull(RichEdits.clearFormatting(blocks, line.id, 0, 0))

        assertEquals(
            "blockquote[paragraph(o)] blockquote[paragraph(m)] paragraph(in) blockquote[paragraph(in2)] blockquote[paragraph(m2)]",
            shape(RichDoc.encode(edit.blocks)),
        )
    }

    @Test
    fun indentInAnInnerQuoteMovesEveryQuote() {
        val outer = RichQuote()
        val line = RichDoc.newBlock().copy(text = "in", quotes = listOf(outer, RichQuote()))
        val blocks = listOf(line, RichDoc.newBlock().copy(text = "out", quotes = listOf(outer)))

        val edit = requireNotNull(RichEdits.shiftIndent(blocks, line.id, 1))

        assertEquals(
            "blockquote{indent=1}[blockquote{indent=1}[paragraph{indent=1}(in)],paragraph(out)]",
            shape(RichDoc.encode(edit.blocks), withIndent = true),
        )
    }

    @Test
    fun ruleTheWebPutsInAListItemStaysEditable() {
        val blocks = requireNotNull(RichDoc.parse(ruleInItem()))

        assertEquals(
            listOf(RichBlockKind.BULLET_ITEM, RichBlockKind.DIVIDER, RichBlockKind.PARAGRAPH, RichBlockKind.BULLET_ITEM),
            blocks.map { it.kind },
        )
        assertEquals(listOf(0, 1, 1, 0), blocks.map { it.nestLevel })
        assertEquals(
            "bulletList[listItem[paragraph(aa),horizontalRule,paragraph(xyz)],listItem[paragraph(bb)]]",
            shape(RichDoc.encode(blocks)),
        )
    }

    @Test
    fun enterInALineAnItemHoldsStartsTheNextItem() {
        val blocks = requireNotNull(RichDoc.parse(ruleInItem()))

        val edit = requireNotNull(RichEdits.split(blocks, blocks[2].id, 1))

        assertEquals(
            "bulletList[listItem[paragraph(aa),horizontalRule,paragraph(x)],listItem[paragraph(yz)],listItem[paragraph(bb)]]",
            shape(RichDoc.encode(edit.blocks)),
        )
    }

    @Test
    fun enterOnTheEmptyLastLineOfAnItemLeavesTheList() {
        val blocks = requireNotNull(RichDoc.parse(ruleInItem())).let { it.replaceAt(2, listOf(it[2].copy(text = ""))) }

        val edit = requireNotNull(RichEdits.split(blocks, blocks[2].id, 0))

        assertEquals(
            "bulletList[listItem[paragraph(aa),horizontalRule]] paragraph() bulletList[listItem[paragraph(bb)]]",
            shape(RichDoc.encode(edit.blocks)),
        )
    }

    @Test
    fun backspaceInALineAnItemHoldsLiftsTheWholeItem() {
        val blocks = requireNotNull(RichDoc.parse(ruleInItem()))

        val edit = requireNotNull(RichEdits.joinBackward(blocks, blocks[2].id))

        assertEquals(
            "paragraph(aa) horizontalRule paragraph(xyz) bulletList[listItem[paragraph(bb)]]",
            shape(RichDoc.encode(edit.blocks)),
        )
    }

    @Test
    fun backspaceAtAnItemJoinsTheLastLineOfTheItemAbove() {
        val blocks = requireNotNull(RichDoc.parse(ruleInItem()))

        val edit = requireNotNull(RichEdits.joinBackward(blocks, blocks[3].id))

        assertEquals("bulletList[listItem[paragraph(aa),horizontalRule,paragraph(xyzbb)]]", shape(RichDoc.encode(edit.blocks)))
    }

    @Test
    fun backspaceAtAnItemUnderAnItemHoldingAListLiftsIt() {
        val item = RichDoc.newBlock(RichBlockKind.BULLET_ITEM).copy(text = "bb")
        val blocks = listOf(
            RichDoc.newBlock(RichBlockKind.BULLET_ITEM).copy(text = "aa"),
            RichDoc.newBlock(RichBlockKind.BULLET_ITEM).copy(text = "nn", nestLevel = 1),
            item,
        )

        val edit = requireNotNull(RichEdits.joinBackward(blocks, item.id))

        assertEquals(
            "bulletList[listItem[paragraph(aa),bulletList[listItem[paragraph(nn)]]]] paragraph(bb)",
            shape(RichDoc.encode(edit.blocks)),
        )
    }

    @Test
    fun liftingANestedItemTakesWhatItHolds() {
        val item = RichDoc.newBlock(RichBlockKind.BULLET_ITEM).copy(text = "bb", nestLevel = 1)
        val blocks = listOf(
            RichDoc.newBlock(RichBlockKind.BULLET_ITEM).copy(text = "aa"),
            item,
            RichDoc.newBlock(RichBlockKind.BULLET_ITEM).copy(text = "c1", nestLevel = 2),
            RichDoc.newBlock(RichBlockKind.BULLET_ITEM).copy(text = "c2", nestLevel = 2),
        )

        val edit = requireNotNull(RichEdits.joinBackward(blocks, item.id))

        assertEquals(
            "bulletList[listItem[paragraph(aa)],listItem[paragraph(bb),bulletList[listItem[paragraph(c1)],listItem[paragraph(c2)]]]]",
            shape(RichDoc.encode(edit.blocks)),
        )
    }

    @Test
    fun enterOnAnEmptyItemHoldingAListSplitsIt() {
        val empty = RichDoc.newBlock(RichBlockKind.BULLET_ITEM)
        val blocks = listOf(
            empty,
            RichDoc.newBlock(RichBlockKind.BULLET_ITEM).copy(text = "c1", nestLevel = 1),
            RichDoc.newBlock(RichBlockKind.BULLET_ITEM).copy(text = "zz"),
        )

        val edit = requireNotNull(RichEdits.split(blocks, empty.id, 0))

        assertEquals(
            "bulletList[listItem[paragraph()],listItem[paragraph(),bulletList[listItem[paragraph(c1)]]],listItem[paragraph(zz)]]",
            shape(RichDoc.encode(edit.blocks)),
        )
    }

    @Test
    fun ruleButtonInAListItemPutsTheRuleInsideIt() {
        val item = RichDoc.newBlock(RichBlockKind.BULLET_ITEM).copy(text = "aa")
        val blocks = listOf(item, RichDoc.newBlock(RichBlockKind.BULLET_ITEM).copy(text = "bb"))

        val edit = requireNotNull(RichEdits.insertDivider(blocks, item.id, 2, 2))

        assertEquals(
            "bulletList[listItem[paragraph(aa),horizontalRule,paragraph()],listItem[paragraph(bb)]]",
            shape(RichDoc.encode(edit.blocks)),
        )
        assertEquals(edit.blocks[2].id, edit.focusId)
    }

    @Test
    fun codeCarvedOutOfAListItemStaysInIt() {
        val item = RichDoc.newBlock(RichBlockKind.BULLET_ITEM).copy(text = "aa bb")

        val edit = requireNotNull(RichEdits.toggleCodeBlock(listOf(item), item.id, 0, 2))

        assertEquals("bulletList[listItem[paragraph(),codeBlock(aa),paragraph( bb)]]", shape(RichDoc.encode(edit.blocks)))
    }

    @Test
    fun taskButtonOnALineAnItemHoldsNestsATaskList() {
        val blocks = requireNotNull(RichDoc.parse(ruleInItem()))

        val edit = requireNotNull(RichEdits.setKind(blocks, blocks[2].id, RichBlockKind.TASK_ITEM))

        assertEquals(
            "bulletList[listItem[paragraph(aa),horizontalRule,taskList[taskItem[paragraph(xyz)]]],listItem[paragraph(bb)]]",
            shape(RichDoc.encode(edit.blocks)),
        )
    }

    @Test
    fun indentInANestedItemMovesItsParentToo() {
        val nested = RichDoc.newBlock(RichBlockKind.BULLET_ITEM).copy(text = "bb", nestLevel = 1)
        val blocks = listOf(RichDoc.newBlock(RichBlockKind.BULLET_ITEM).copy(text = "aa"), nested)

        val edit = requireNotNull(RichEdits.shiftIndent(blocks, nested.id, 1))

        assertEquals(
            "bulletList[listItem{indent=1}[paragraph(aa),bulletList[listItem{indent=1}[paragraph(bb)]]]]",
            shape(RichDoc.encode(edit.blocks), withIndent = true),
        )
    }

    @Test
    fun linesPastedInAListItemStayInIt() {
        val item = RichDoc.newBlock(RichBlockKind.BULLET_ITEM).copy(text = "aa")

        val edit = requireNotNull(RichEdits.insertLines(listOf(item), item.id, "aay\nz", emptyList(), 2, 5))

        assertEquals("bulletList[listItem[paragraph(aay),paragraph(z)]]", shape(RichDoc.encode(edit.blocks)))
    }

    /** A bullet list whose first item holds a rule and a line after its
     *  paragraph: what the web's separator button leaves in an item. */
    private fun ruleInItem(): String = envelope(
        """{"type":"bulletList","content":[
            {"type":"listItem","attrs":{"indent":0},"content":[${paragraph("aa")},{"type":"horizontalRule"},${paragraph("xyz")}]},
            {"type":"listItem","attrs":{"indent":0},"content":[${paragraph("bb")}]}
        ]}""",
    )

    private fun paragraph(text: String): String = """{"type":"paragraph","content":[{"type":"text","text":"$text"}]}"""

    private fun quote(nodes: String): String = """{"type":"blockquote","content":[$nodes]}"""

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
