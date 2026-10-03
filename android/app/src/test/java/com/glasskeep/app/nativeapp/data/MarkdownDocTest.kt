package com.glasskeep.app.nativeapp.data

import org.junit.Assert.assertEquals
import org.junit.Test

/** Markdown read the way `marked` (GFM, `breaks: true`) and DOMPurify
 *  read it on the web; each expectation was checked against marked 16. */
class MarkdownDocTest {
    /** One block as `kind(text)[mark:start-end=value ...]`. */
    private fun describe(block: RichBlock): String {
        val marks = block.marks.sortedWith(compareBy({ it.start }, { it.type.name }))
            .joinToString(" ") { "${it.type.name.lowercase()}:${it.start}-${it.end}" + (it.value?.let { v -> "=$v" } ?: "") }
        val indent = if (block.indent > 0) "+${block.indent}" else ""
        return "${block.kind.name.lowercase()}$indent(${block.text.replace("\n", "\\n")})" + if (marks.isEmpty()) "" else "[$marks]"
    }

    private fun read(markdown: String, keepBlankLines: Boolean = false, editable: Boolean = false): String =
        MarkdownDoc.toRichBlocks(markdown, keepBlankLines, editable).joinToString(" | ") { describe(it) }

    @Test
    fun underscoresInsideAWordAreNotEmphasis() {
        assertEquals("paragraph(snake_case_name)", read("snake_case_name"))
        assertEquals("paragraph(a b c)[italic:2-3]", read("a *b* c"))
        assertEquals("paragraph(a2b3c)[italic:1-2 italic:3-4]", read("a*2*b*3*c"))
    }

    @Test
    fun emphasisNeedsAWordNextToItsMarkers() {
        assertEquals("paragraph(2 * 3 * 4)", read("2 * 3 * 4"))
        assertEquals("paragraph(init)[bold:0-4]", read("__init__"))
        assertEquals("paragraph(both)[bold:0-4 italic:0-4]", read("***both***"))
        assertEquals("paragraph(boldtext)[bold:0-4]", read("**bold**text"))
        assertEquals("paragraph(bold with it in)[bold:0-15 italic:10-12]", read("**bold with *it* in**"))
        assertEquals("paragraph(a b)[strike:0-1 strike:2-3]", read("~~a~~ ~b~"))
    }

    @Test
    fun marksNeverStackOnTheirOwnType() {
        assertEquals("paragraph(a b c)[bold:0-5]", read("**a **b** c**"))
    }

    @Test
    fun theViewKeepsMarksOverInlineCodeWhereTheSchemaDropsThem() {
        assertEquals("paragraph(a b c)[bold:0-5 code:2-3]", read("**a `b` c**"))
        assertEquals("paragraph(a b c)[bold:0-2 code:2-3 bold:3-5]", read("**a `b` c**", editable = true))
        assertEquals("paragraph(a)[code:0-1 link:0-1=./a.md]", read("[`a`](./a.md)"))
        assertEquals("paragraph(a)[code:0-1]", read("[`a`](./a.md)", editable = true))
    }

    @Test
    fun backslashEscapesAreLiteralCharacters() {
        assertEquals("paragraph(escape *not* _u_ # [a])", read("escape \\*not\\* \\_u\\_ \\# \\[a\\]"))
        assertEquals("paragraph(a\\nb)", read("a\\\nb"))
    }

    @Test
    fun imagesAreDroppedLikeDompurifyDropsThem() {
        assertEquals("paragraph( and a)[link:5-6=http://u]", read("![alt](http://x/y.png) and [a](http://u \"title\")"))
    }

    @Test
    fun linksKeepTheirAddressWhateverFollowsIt() {
        assertEquals("paragraph(a b)[link:0-1=http://u/(x) link:2-3=http://u%20x]", read("[a](http://u/(x) 'title') [b](<http://u x>)"))
        assertEquals("paragraph(a)[bold:0-1 link:0-1=http://u]", read("[**a**](http://u)"))
        assertEquals("paragraph(a)", read("[a](javascript:alert(1))"))
        assertEquals("paragraph(a)", read("[a]()"))
        assertEquals("paragraph([x] item)", read("[x] item"))
    }

    @Test
    fun bareAddressesBecomeLinksWithoutTheirTrailingPunctuation() {
        assertEquals(
            "paragraph(see http://example.com/a_b, ok)[link:4-26=http://example.com/a_b]",
            read("see http://example.com/a_b, ok"),
        )
        assertEquals("paragraph(www.example.com.)[link:0-15=http://www.example.com]", read("www.example.com."))
        assertEquals("paragraph(mail a.b@c.co now)[link:5-13=mailto:a.b@c.co]", read("mail a.b@c.co now"))
        assertEquals("paragraph(<b>)", read("<b>"))
        assertEquals("paragraph(http://x.io)[link:0-11=http://x.io]", read("<http://x.io>"))
    }

    @Test
    fun linksInsideALinkLabelStayText() {
        assertEquals("paragraph(http://x.io)[link:0-11=http://y.io]", read("[http://x.io](http://y.io)"))
    }

    @Test
    fun characterReferencesAreDecodedOutsideCode() {
        assertEquals("paragraph(& < © A)", read("&amp; &lt; &copy; &#65;"))
        assertEquals("paragraph(&amp; x)[code:0-5]", read("`&amp;` x"))
    }

    @Test
    fun inlineCodeIsVerbatim() {
        assertEquals("paragraph(a*b*)[code:0-4]", read("`a*b*`"))
        assertEquals("paragraph(a`b)[code:0-3]", read("``a`b``"))
        assertEquals("paragraph(`a)", read("`a"))
    }

    @Test
    fun taskBoxOfAListItemIsDroppedAndTheItemStaysABullet() {
        assertEquals(
            "bullet_item(a) | bullet_item(b) | bullet_item+1(c) | numbered_item(d) | bullet_item([ ])",
            read("- [ ] a\n- [x] b\n  - [ ] c\n1. [ ] d\n- [ ]"),
        )
    }

    @Test
    fun sixthLevelHeadingIsAParagraphInTheEditorAndTheDeepestHeadingWhenRead() {
        assertEquals("paragraph(six)", read("###### six", editable = true))
        assertEquals("heading_5(six)", read("###### six"))
        assertEquals("heading_1(a) | heading_2(b)", read("# a #\n## b ##"))
        assertEquals("paragraph(#######)", read("#######", editable = true))
    }

    @Test
    fun setextHeadingsTakeTheParagraphAboveThem() {
        assertEquals("heading_1(Setext) | heading_2(Sub)", read("Setext\n=====\n\nSub\n-----"))
        assertEquals("heading_2(two\\nlines)", read("two\nlines\n--"))
    }

    @Test
    fun indentedLinesAreACodeBlockUnlessTheyContinueAParagraphOrAList() {
        assertEquals("code_block(a\\n\\nb) | paragraph(text)", read("    a\n\n    b\n\ntext"))
        assertEquals("paragraph(a\\n    b)", read("a\n    b"))
        assertEquals("bullet_item(a) | bullet_item+2(b)", read("- a\n    - b"))
    }

    @Test
    fun spacedBreaksAreThematicBreaks() {
        assertEquals("divider() | divider() | divider()", read("* * *\n- - -\n___"))
    }

    @Test
    fun plainTextKeepsItsFinalLineBreak() {
        assertEquals("a\n", MarkdownDoc.plainTextToRichBlocks("a\n").single().text)
        assertEquals(listOf("a", "", "b"), MarkdownDoc.plainTextToRichBlocks("a\n \nb").map { it.text })
    }
}
