package com.glasskeep.app.nativeapp.data

/**
 * One structural edit's outcome: the new block list, and where the caret
 * goes next ([focusId] at [caret]), or null when it stays where it is.
 */
data class RichEdit(val blocks: List<RichBlock>, val focusId: String? = null, val caret: Int = 0)

/**
 * The structural editing commands of the web editor (Tiptap/ProseMirror:
 * splitBlock, splitListItem, liftEmptyBlock, joinBackward, the list /
 * quote / code-block toggles, setHorizontalRule...), ported onto the flat
 * block model: each takes the current blocks and returns what the web
 * would leave. Pure, so the screen only has to apply the result.
 *
 * The model cannot hold a quote inside a quote, a code block or a second
 * paragraph inside a list item; where the web would build one of those,
 * the closest shape the model has is used instead, as noted on each
 * command.
 */
object RichEdits {

    /** Enter at [position] of block [id]. */
    fun split(blocks: List<RichBlock>, id: String, position: Int): RichEdit? {
        val index = blocks.indexOfFirst { it.id == id }
        if (index < 0) return null
        val block = blocks[index]
        if (!block.kind.hasText || block.kind == RichBlockKind.CODE_BLOCK) return null
        if (block.text.isEmpty()) {
            // An empty list item leaves its list instead of adding another
            // empty one (liftListItem): a nested item moves up one level, a
            // top-level one becomes a paragraph right where it is, splitting
            // the list around it. Any other empty block leaves its quote
            // (liftEmptyBlock).
            if (block.kind.isListItem) return RichEdit(blocks.replaceAt(index, listOf(lift(blocks, index))), block.id, 0)
            if (block.quote != null) return RichEdit(liftEmptyFromQuote(blocks, index), block.id, 0)
        }
        val at = position.coerceIn(0, block.text.length)
        val atEnd = at == block.text.length
        val first = block.copy(text = block.text.substring(0, at), marks = RichDoc.clipMarks(block.marks, 0, at))
        val rest = RichDoc.newBlock(block.kind).copy(
            text = block.text.substring(at),
            marks = RichDoc.clipMarks(block.marks, at, block.text.length),
            align = block.align,
            indent = block.indent,
            nestLevel = block.nestLevel,
            quote = block.quote,
        )
        val replacement = when {
            // A list item continues its list; a task item split off starts
            // unchecked (splitListItem's checked: false).
            block.kind.isListItem -> listOf(first, rest)
            // At the start of a heading the heading moves down, under an
            // empty paragraph (splitBlock turns the empty half into the
            // default block type, with default attributes).
            block.kind.isHeading && at == 0 && !atEnd ->
                listOf(RichDoc.newBlock().copy(quote = block.quote), block)
            // Anywhere but the end both halves keep the block's type and
            // attributes; at the end the new block is a paragraph that
            // keeps the alignment and indent (keepOnSplit).
            !atEnd -> listOf(first, rest)
            else -> listOf(first, rest.copy(kind = RichBlockKind.PARAGRAPH))
        }
        return RichEdit(blocks.replaceAt(index, replacement), replacement[1].id, 0)
    }

    /** Backspace with the caret at the very start of block [id]. */
    fun joinBackward(blocks: List<RichBlock>, id: String): RichEdit? {
        val index = blocks.indexOfFirst { it.id == id }
        if (index < 0) return null
        val block = blocks[index]
        val previous = blocks.getOrNull(index - 1)
        return when {
            // The first item of a list (or of a nested list) is lifted out
            // rather than glued onto the block above.
            block.kind.isListItem && !continuesList(previous, block) ->
                RichEdit(blocks.replaceAt(index, listOf(lift(blocks, index))), block.id, 0)
            // An empty code block, a code block opening the note, or an
            // empty heading opening the note is cleared back to a paragraph
            // (clearNodes).
            block.kind == RichBlockKind.CODE_BLOCK && (block.text.isEmpty() || previous == null && block.quote == null) ||
                previous == null && block.text.isEmpty() && block.kind.isHeading ->
                RichEdit(clearNodes(blocks, index), block.id, 0)
            // The first block of a quote leaves it, unless another quote
            // ends right above: the two quotes then become one.
            block.quote != null && !block.sharesQuoteWith(previous) -> {
                val above = previous?.quote
                val updated = if (above != null) {
                    joinQuote(blocks, index, above)
                } else {
                    blocks.replaceAt(index, listOf(block.copy(quote = null)))
                }
                RichEdit(updated, block.id, 0)
            }
            previous == null -> null
            // A block right under a quote goes into it, and a quote right
            // under the block then joins that one (deleteBarrier).
            previous.quote != null && block.quote == null -> {
                val moved = blocks.replaceAt(index, listOf(block.copy(quote = previous.quote)))
                val joined = if (moved.getOrNull(index + 1)?.quote != null) joinQuote(moved, index + 1, previous.quote) else moved
                RichEdit(joined, block.id, 0)
            }
            // A rule just above is deleted instead of joined through.
            previous.kind == RichBlockKind.DIVIDER ->
                RichEdit(blocks.toMutableList().apply { removeAt(index - 1) }, block.id, 0)
            // Joining into or out of a code block keeps plain text only.
            previous.kind == RichBlockKind.CODE_BLOCK || block.kind == RichBlockKind.CODE_BLOCK -> {
                val joinAt = previous.text.length
                val merged = previous.copy(text = previous.text + block.text)
                RichEdit(blocks.replaceRange(index - 1, index + 1, listOf(merged)), merged.id, joinAt)
            }
            else -> {
                val joinAt = previous.text.length
                val merged = previous.copy(
                    text = previous.text + block.text,
                    marks = (previous.marks + block.marks.map { it.copy(start = it.start + joinAt, end = it.end + joinAt) })
                        .sortedBy { it.start },
                )
                RichEdit(blocks.replaceRange(index - 1, index + 1, listOf(merged)), merged.id, joinAt)
            }
        }
    }

    /**
     * The list buttons (toggleBulletList, toggleOrderedList, toggleTaskList)
     * and the style gallery (setParagraph, setHeading).
     *
     * A list button on an item of its own list lifts only that item out;
     * switching between a bullet and an ordered list converts the whole
     * list; a paragraph goes into a list where it stands, in its quote.
     * What the web cannot wrap as it is (an item of the other item type,
     * task against bullet or ordered, a heading, a code block) is cleared
     * first (clearNodes) and becomes an item of a list of its own.
     *
     * The style gallery turns a paragraph, heading or code block into the
     * style picked, attributes and quote kept. Picking the style a block
     * already has clears it and sets it back, which only takes it out of
     * its quote. On a list item the item is cleared out of its list, then
     * takes the style with its own paragraph's attributes.
     */
    fun setKind(blocks: List<RichBlock>, id: String, kind: RichBlockKind): RichEdit? {
        val index = blocks.indexOfFirst { it.id == id }
        if (index < 0) return null
        val block = blocks[index]
        val updated = when {
            kind.isListItem && block.kind == kind -> blocks.replaceAt(index, listOf(lift(blocks, index)))
            kind.isOrderedOrBullet && block.kind.isOrderedOrBullet -> {
                val range = listRange(blocks, index)
                blocks.mapIndexed { i, b ->
                    if (i in range && b.nestLevel == block.nestLevel && b.kind == block.kind) b.copy(kind = kind) else b
                }
            }
            kind.isListItem && block.kind == RichBlockKind.PARAGRAPH ->
                blocks.replaceAt(index, listOf(block.copy(kind = kind, nestLevel = 0)))
            kind.isListItem -> clearNodes(blocks, index).let { it.replaceAt(index, listOf(it[index].copy(kind = kind))) }
            block.kind.isListItem -> clearNodes(blocks, index).let {
                val paragraphIndent = if (block.kind == RichBlockKind.TASK_ITEM) block.indent else 0
                it.replaceAt(index, listOf(it[index].copy(kind = kind, align = block.align, indent = paragraphIndent)))
            }
            block.kind == kind -> if (block.quote == null) return null else blocks.replaceAt(index, listOf(block.copy(quote = null)))
            else -> blocks.replaceAt(index, listOf(block.copy(kind = kind)))
        }
        return RichEdit(RichDoc.normalizeNesting(updated))
    }

    /**
     * The quote button (toggleBlockquote). In a quote it lifts the block
     * out (lift): a list item out of its list, which stays in the quote,
     * anything else out of the quote, split around it. Anywhere else a
     * paragraph, heading or code block goes into a quote of its own, even
     * right next to another one (wrapIn); a list item cannot be wrapped on
     * its own, so nothing happens there.
     */
    fun toggleQuote(blocks: List<RichBlock>, id: String): RichEdit? {
        val index = blocks.indexOfFirst { it.id == id }
        if (index < 0) return null
        val block = blocks[index]
        val replacement = when {
            block.kind.isListItem -> if (block.quote == null) return null else lift(blocks, index)
            block.quote != null -> block.copy(quote = null)
            else -> block.copy(quote = RichQuote())
        }
        return RichEdit(RichDoc.normalizeNesting(blocks.replaceAt(index, listOf(replacement))))
    }

    /**
     * smartToggleCodeBlock (SmartCodeBlock.js): a code block becomes a
     * paragraph again (its line breaks kept); a selection inside a plain
     * paragraph or heading is carved out into a code block of its own
     * between the text before and after it; otherwise the whole top-level
     * block holding the caret (a whole list, a whole quote) becomes one
     * code block, one line per block. The caret lands at its end.
     */
    fun toggleCodeBlock(blocks: List<RichBlock>, id: String, selectionStart: Int, selectionEnd: Int): RichEdit? {
        val index = blocks.indexOfFirst { it.id == id }
        if (index < 0) return null
        val block = blocks[index]
        if (block.kind == RichBlockKind.CODE_BLOCK) {
            return RichEdit(blocks.replaceAt(index, listOf(block.copy(kind = RichBlockKind.PARAGRAPH, indent = 0))))
        }
        val start = minOf(selectionStart, selectionEnd).coerceIn(0, block.text.length)
        val end = maxOf(selectionStart, selectionEnd).coerceIn(0, block.text.length)
        if (start < end && (block.kind == RichBlockKind.PARAGRAPH || block.kind.isHeading)) {
            val code = RichDoc.newBlock(RichBlockKind.CODE_BLOCK).copy(text = block.text.substring(start, end), quote = block.quote)
            val replacement = buildList {
                if (start > 0) {
                    add(block.copy(text = block.text.substring(0, start), marks = RichDoc.clipMarks(block.marks, 0, start)))
                }
                add(code)
                if (end < block.text.length) {
                    add(
                        RichDoc.newBlock(block.kind).copy(
                            text = block.text.substring(end),
                            marks = RichDoc.clipMarks(block.marks, end, block.text.length),
                            align = block.align,
                            indent = block.indent,
                            quote = block.quote,
                        ),
                    )
                }
            }
            return RichEdit(blocks.replaceAt(index, replacement), code.id, code.text.length)
        }
        val range = topLevelRange(blocks, index)
        val code = RichDoc.newBlock(RichBlockKind.CODE_BLOCK).copy(
            text = blocks.subList(range.first, range.last + 1).filter { it.kind.hasText }.joinToString("\n") { it.text },
        )
        return RichEdit(blocks.replaceRange(range.first, range.last + 1, listOf(code)), code.id, code.text.length)
    }

    /**
     * setHorizontalRule: in a paragraph or heading the rule takes the place
     * of the selection `[start, end)`. A block left with no text around it
     * is replaced by the rule; with text only after it the rule goes above
     * the block, with text on both sides the block is split around it,
     * with text only before it the rule goes below. The caret then moves to
     * the text block after the rule, or to a new empty paragraph when the
     * rule ends the note or its quote. A list item (which the web would put
     * the rule inside of) keeps its text and gets the rule below. The rule
     * stays in the block's quote.
     */
    fun insertDivider(blocks: List<RichBlock>, id: String, start: Int, end: Int): RichEdit? {
        val index = blocks.indexOfFirst { it.id == id }
        if (index < 0) return null
        val block = blocks[index]
        val rule = RichDoc.newBlock(RichBlockKind.DIVIDER).copy(quote = block.quote)
        val length = block.text.length
        val from = minOf(start, end).coerceIn(0, length)
        val to = maxOf(start, end).coerceIn(0, length)
        val before = block.copy(text = block.text.substring(0, from), marks = RichDoc.clipMarks(block.marks, 0, from))
        val after = block.copy(text = block.text.substring(to), marks = RichDoc.clipMarks(block.marks, to, length))
        val plainBlock = block.kind == RichBlockKind.PARAGRAPH || block.kind.isHeading
        val (updated, ruleIndex) = when {
            !plainBlock -> blocks.replaceAt(index, listOf(block, rule)) to index + 1
            from == 0 && to == length -> blocks.replaceAt(index, listOf(rule)) to index
            from == 0 -> blocks.replaceAt(index, listOf(rule, after)) to index
            to == length -> blocks.replaceAt(index, listOf(before, rule)) to index + 1
            else -> {
                val rest = RichDoc.newBlock(block.kind).copy(
                    text = after.text,
                    marks = after.marks,
                    align = block.align,
                    indent = block.indent,
                    quote = block.quote,
                )
                blocks.replaceAt(index, listOf(before, rule, rest)) to index + 1
            }
        }
        val next = updated.getOrNull(ruleIndex + 1)
        return when {
            next == null || rule.quote != null && !next.sharesQuoteWith(rule) -> {
                val paragraph = RichDoc.newBlock().copy(quote = rule.quote)
                RichEdit(updated.replaceRange(ruleIndex + 1, ruleIndex + 1, listOf(paragraph)), paragraph.id, 0)
            }
            next.kind.hasText && next.sharesQuoteWith(rule) -> RichEdit(updated, next.id, 0)
            else -> RichEdit(updated)
        }
    }

    /**
     * Text pasted (or typed) with line breaks into block [id]: [newText] is
     * the block's whole new text and [newMarks] its marks, the pasted part
     * being `[insertStart, insertEnd)`. Every line break inside the pasted
     * part starts a new block (plainTextToPasteSlice, one paragraph per
     * line): the first line joins the block, the last one takes what was
     * after the caret. The new blocks are paragraphs in the block's quote,
     * if any, except in a list (more items of the same list, where the web
     * would stack paragraphs inside the one item).
     */
    fun insertLines(
        blocks: List<RichBlock>,
        id: String,
        newText: String,
        newMarks: List<RichMark>,
        insertStart: Int,
        insertEnd: Int,
    ): RichEdit? {
        val index = blocks.indexOfFirst { it.id == id }
        if (index < 0) return null
        val block = blocks[index]
        val cuts = (insertStart until insertEnd).filter { newText[it] == '\n' }
        if (cuts.isEmpty()) return null
        val pieces = mutableListOf<RichBlock>()
        var from = 0
        for ((n, cut) in (cuts + newText.length).withIndex()) {
            val text = newText.substring(from, cut)
            val marks = RichDoc.clipMarks(newMarks, from, cut)
            pieces += if (n == 0) {
                block.copy(text = text, marks = marks)
            } else if (block.kind.isListItem) {
                RichDoc.newBlock(block.kind).copy(
                    text = text,
                    marks = marks,
                    align = block.align,
                    indent = block.indent,
                    nestLevel = block.nestLevel,
                    quote = block.quote,
                )
            } else {
                RichDoc.newBlock().copy(text = text, marks = marks, quote = block.quote)
            }
            from = cut + 1
        }
        val last = pieces.last()
        return RichEdit(blocks.replaceAt(index, pieces), last.id, insertEnd - (cuts.last() + 1))
    }

    /** indent()/outdent() (Indent.js): every node the caret sits in moves
     *  one step, within 0..[RichDoc.MaxIndent]: the block (a bullet or
     *  ordered item's `<li>`, a task item's paragraph) and the quote around
     *  it, whose whole card moves. */
    fun shiftIndent(blocks: List<RichBlock>, id: String, delta: Int): RichEdit? {
        val index = blocks.indexOfFirst { it.id == id }
        if (index < 0) return null
        val block = blocks[index]
        val quote = block.quote?.let { it.copy(indent = (it.indent + delta).coerceIn(0, RichDoc.MaxIndent)) }
        val quoted = if (quote != null) quoteRange(blocks, index) else IntRange.EMPTY
        return RichEdit(
            blocks.mapIndexed { i, b ->
                when (i) {
                    index -> b.copy(indent = (b.indent + delta).coerceIn(0, RichDoc.MaxIndent), quote = quote)
                    in quoted -> b.copy(quote = quote)
                    else -> b
                }
            },
        )
    }

    /** Whether the indent button ([delta] 1) or the outdent one (-1) can
     *  act on [block]: can().indent() / can().outdent(), except that
     *  outdent in a bullet or ordered item only looks at the item's own
     *  indent (RichTextToolbar.jsx canOutdent). */
    fun canShiftIndent(block: RichBlock, delta: Int): Boolean {
        val quoteIndent = block.quote?.indent
        return if (delta > 0) {
            block.indent < RichDoc.MaxIndent || quoteIndent != null && quoteIndent < RichDoc.MaxIndent
        } else {
            block.indent > 0 || !block.kind.isOrderedOrBullet && quoteIndent != null && quoteIndent > 0
        }
    }

    /** The toolbar's eraser, `clearNodes().unsetAllMarks()`: `[start, end)`
     *  of block [id] loses every mark and the block goes back to a plain
     *  paragraph (see [clearNodes]). */
    fun clearFormatting(blocks: List<RichBlock>, id: String, start: Int, end: Int): RichEdit? {
        val index = blocks.indexOfFirst { it.id == id }
        if (index < 0) return null
        val cleared = clearNodes(blocks, index)
        val block = cleared[index]
        return RichEdit(
            RichDoc.normalizeNesting(cleared.replaceAt(index, listOf(block.copy(marks = RichDoc.clearAllMarks(block.marks, start, end))))),
        )
    }

    /** Tiptap's TrailingNode: the editor always ends with a top-level
     *  paragraph, so there is always a line to tap into below a final
     *  heading, list, quote, code block or rule. */
    fun needsTrailingParagraph(blocks: List<RichBlock>): Boolean =
        blocks.lastOrNull()?.let { it.kind != RichBlockKind.PARAGRAPH || it.quote != null } ?: true

    /** Whether [block] is another item of the same list as [previous], the
     *  block right above it (a deeper item above means a sibling came
     *  first, with a nested list of its own). */
    private fun continuesList(previous: RichBlock?, block: RichBlock): Boolean =
        previous != null && previous.kind.isListItem && previous.sharesQuoteWith(block) &&
            (previous.nestLevel > block.nestLevel || previous.nestLevel == block.nestLevel && previous.kind == block.kind)

    /** The list item at [index] lifted one step out (liftListItem): a
     *  nested item becomes an item of its parent's list, one level up; a
     *  top-level item becomes a plain paragraph, still in its quote. The
     *  indent of a bullet or ordered item lives on its `<li>`, gone once
     *  lifted; a task item's own indent is its paragraph's, which stays. */
    private fun lift(blocks: List<RichBlock>, index: Int): RichBlock {
        val block = blocks[index]
        if (block.nestLevel > 0) {
            val level = block.nestLevel - 1
            val parent = (index - 1 downTo 0).map { blocks[it] }.firstOrNull { it.kind.isListItem && it.nestLevel == level }
            return block.copy(kind = parent?.kind ?: block.kind, nestLevel = level)
        }
        return block.copy(
            kind = RichBlockKind.PARAGRAPH,
            indent = if (block.kind == RichBlockKind.TASK_ITEM) block.indent else 0,
        )
    }

    /** liftEmptyBlock on an empty block of a quote: in the middle of the
     *  quote, the quote is first split in two right above it, the block
     *  then opening the second one; at either end, or alone, it leaves the
     *  quote. */
    private fun liftEmptyFromQuote(blocks: List<RichBlock>, index: Int): List<RichBlock> {
        val block = blocks[index]
        val quote = block.quote ?: return blocks
        val range = quoteRange(blocks, index)
        if (index == range.first || index == range.last) return blocks.replaceAt(index, listOf(block.copy(quote = null)))
        val second = RichQuote(indent = quote.indent)
        return blocks.mapIndexed { i, b -> if (i in index..range.last) b.copy(quote = second) else b }
    }

    /**
     * clearNodes: the block at [index] becomes a plain paragraph with the
     * default attributes, lifted out of its list and of its quote. Every
     * node around it is lifted as far as it goes, so the whole list of an
     * item in a quote leaves the quote along with it.
     */
    private fun clearNodes(blocks: List<RichBlock>, index: Int): List<RichBlock> {
        val block = blocks[index]
        val lifted = if (block.kind.isListItem && block.quote != null) wholeList(blocks, index) else IntRange.EMPTY
        return blocks.mapIndexed { i, b ->
            when (i) {
                index -> b.copy(kind = RichBlockKind.PARAGRAPH, align = RichAlign.LEFT, indent = 0, nestLevel = 0, quote = null)
                in lifted -> b.copy(quote = null)
                else -> b
            }
        }
    }

    /** The quote holding the block at [index] joins [into], ProseMirror's
     *  join keeping the first quote's attributes. */
    private fun joinQuote(blocks: List<RichBlock>, index: Int, into: RichQuote): List<RichBlock> {
        val range = quoteRange(blocks, index)
        return blocks.mapIndexed { i, b -> if (i in range) b.copy(quote = into) else b }
    }

    /** The indices of the list holding the item at [index]: its siblings of
     *  the same level, and whatever is nested between them. */
    private fun listRange(blocks: List<RichBlock>, index: Int): IntRange {
        val block = blocks[index]
        fun inList(b: RichBlock) = b.kind.isListItem && b.sharesQuoteWith(block) &&
            (b.nestLevel > block.nestLevel || b.nestLevel == block.nestLevel && b.kind == block.kind)
        var first = index
        while (first > 0 && inList(blocks[first - 1])) first--
        var last = index
        while (last < blocks.lastIndex && inList(blocks[last + 1])) last++
        return first..last
    }

    /** The indices of the top-level list holding the item at [index]. */
    private fun wholeList(blocks: List<RichBlock>, index: Int): IntRange {
        var first = index
        while (blocks[first].nestLevel > 0) first--
        return listRange(blocks, first)
    }

    /** The indices of the quote holding the block at [index]. */
    private fun quoteRange(blocks: List<RichBlock>, index: Int): IntRange {
        val block = blocks[index]
        var first = index
        while (first > 0 && blocks[first - 1].sharesQuoteWith(block)) first--
        var last = index
        while (last < blocks.lastIndex && blocks[last + 1].sharesQuoteWith(block)) last++
        return first..last
    }

    /** The indices of the top-level node holding the block at [index]: the
     *  whole quote for a block in a quote, the whole list for a list item,
     *  the block itself otherwise. */
    private fun topLevelRange(blocks: List<RichBlock>, index: Int): IntRange = when {
        blocks[index].quote != null -> quoteRange(blocks, index)
        blocks[index].kind.isListItem -> wholeList(blocks, index)
        else -> index..index
    }

    private val RichBlockKind.isOrderedOrBullet: Boolean
        get() = this == RichBlockKind.BULLET_ITEM || this == RichBlockKind.NUMBERED_ITEM
}

internal fun List<RichBlock>.replaceAt(index: Int, replacement: List<RichBlock>): List<RichBlock> =
    replaceRange(index, index + 1, replacement)

internal fun List<RichBlock>.replaceRange(from: Int, to: Int, replacement: List<RichBlock>): List<RichBlock> =
    subList(0, from) + replacement + subList(to, size)
