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
 * The model cannot hold a quote inside a list item; where the web would
 * build one, nothing happens, as noted on each command.
 */
object RichEdits {

    /** Enter at [position] of block [id]. */
    fun split(blocks: List<RichBlock>, id: String, position: Int): RichEdit? {
        val index = blocks.indexOfFirst { it.id == id }
        if (index < 0) return null
        val block = blocks[index]
        if (!block.kind.hasText || block.kind == RichBlockKind.CODE_BLOCK) return null
        if (block.text.isEmpty() && !itemHoldsMore(blocks, index)) {
            // An empty line that ends what holds it leaves it instead of
            // adding another empty one: a list item its list (liftListItem,
            // a nested item moving up one level), a line of a list item
            // that item, any other line its innermost quote (liftEmptyBlock).
            when {
                block.kind.isListItem -> return RichEdit(liftItem(blocks, index), block.id, 0)
                block.nestLevel > 0 ->
                    return RichEdit(blocks.replaceAt(index, listOf(block.copy(nestLevel = block.nestLevel - 1))), block.id, 0)
                block.quotes.isNotEmpty() -> return RichEdit(liftEmptyFromQuote(blocks, index), block.id, 0)
            }
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
            quotes = block.quotes,
        )
        // A paragraph a list item holds after its own splits the item there
        // (splitListItem): what follows the caret opens a new item of the
        // same list, which takes everything the item held after it.
        val item = if (block.kind == RichBlockKind.PARAGRAPH) holdingItem(blocks, index)?.let { blocks[it] } else null
        if (item != null) {
            val newItem = rest.copy(
                kind = item.kind,
                indent = if (item.kind == RichBlockKind.TASK_ITEM) block.indent else item.indent,
                nestLevel = item.nestLevel,
            )
            return RichEdit(blocks.replaceAt(index, listOf(first, newItem)), newItem.id, 0)
        }
        val replacement = when {
            // A list item continues its list; a task item split off starts
            // unchecked (splitListItem's checked: false).
            block.kind.isListItem -> listOf(first, rest)
            // At the start of a heading the heading moves down, under an
            // empty paragraph (splitBlock turns the empty half into the
            // default block type, with default attributes).
            block.kind.isHeading && at == 0 && !atEnd ->
                listOf(RichDoc.newBlock().copy(nestLevel = block.nestLevel, quotes = block.quotes), block)
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
        val depth = block.quotes.size
        return when {
            // A list item joins the item right above it in its list, unless
            // there is none or that item holds items of its own: it is then
            // lifted out of its list (ListKeymap).
            block.kind.isListItem && !joinsItemAbove(blocks, index) -> RichEdit(liftItem(blocks, index), block.id, 0)
            // An empty code block, a code block opening the note, or an
            // empty heading opening the note is cleared back to a paragraph
            // (clearNodes).
            block.kind == RichBlockKind.CODE_BLOCK && (block.text.isEmpty() || previous == null && depth == 0) ||
                previous == null && block.text.isEmpty() && block.kind.isHeading ->
                RichEdit(RichDoc.normalizeNesting(clearNodes(blocks, index)), block.id, 0)
            // A line a list item holds after its paragraph lifts that whole
            // item out (ListKeymap's liftListItem).
            !block.kind.isListItem && block.nestLevel > 0 ->
                holdingItem(blocks, index)?.let { RichEdit(liftItem(blocks, it), block.id, 0) }
            // The first block of a quote leaves it, unless another quote
            // ends right above it in the same place: the two become one.
            depth > 0 && previous?.quotes?.getOrNull(depth - 1)?.id != block.quotes[depth - 1].id -> {
                val above = previous?.quotes?.takeIf { it.size >= depth && it.startsWith(block.quotes.dropLast(1)) }?.get(depth - 1)
                val updated = if (above != null) {
                    joinQuote(blocks, index, depth - 1, above)
                } else {
                    blocks.replaceAt(index, listOf(block.copy(quotes = block.quotes.dropLast(1))))
                }
                RichEdit(updated, block.id, 0)
            }
            previous == null -> null
            // A block right under a quote goes into it, and a quote right
            // under the block then joins that one (deleteBarrier).
            previous.quotes.size > depth -> {
                val into = previous.quotes[depth]
                val moved = blocks.replaceAt(index, listOf(block.copy(quotes = block.quotes + into)))
                val below = moved.getOrNull(index + 1)
                val joined = if (below != null && below.quotes.size > depth && below.quotes.startsWith(block.quotes)) {
                    joinQuote(moved, index + 1, depth, into)
                } else {
                    moved
                }
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
     * A list button on an item of its own list lifts that item out, with
     * what it holds; switching between a bullet and an ordered list
     * converts the whole list; a paragraph goes into a list where it
     * stands, in its quote. Pressed on a line a list item holds after its
     * paragraph, it acts on that item's list the same way, or, for another
     * kind of list, puts the line in a list nested in the item. What the web
     * cannot wrap as it is (an item of the other item type, task against
     * bullet or ordered, a heading, a code block) is cleared first
     * (clearNodes) and becomes an item of a list of its own.
     *
     * The style gallery turns a paragraph, heading or code block into the
     * style picked, attributes, list item and quote kept. Picking the style
     * a block already has clears it and sets it back, which takes it out of
     * its list item and its quotes. On a list item the item is cleared out
     * of its list, then takes the style with its own paragraph's attributes.
     */
    fun setKind(blocks: List<RichBlock>, id: String, kind: RichBlockKind): RichEdit? {
        val index = blocks.indexOfFirst { it.id == id }
        if (index < 0) return null
        val block = blocks[index]
        val holder = if (kind.isListItem && !block.kind.isListItem) holdingItem(blocks, index) else null
        val updated = when {
            holder != null && blocks[holder].kind == kind -> liftItem(blocks, holder)
            holder != null && blocks[holder].kind.isOrderedOrBullet && kind.isOrderedOrBullet -> convertList(blocks, holder, kind)
            kind.isListItem && block.kind == kind -> liftItem(blocks, index)
            kind.isOrderedOrBullet && block.kind.isOrderedOrBullet -> convertList(blocks, index, kind)
            kind.isListItem && block.kind == RichBlockKind.PARAGRAPH ->
                blocks.replaceAt(index, listOf(block.copy(kind = kind)))
            kind.isListItem -> clearNodes(blocks, index).let { it.replaceAt(index, listOf(it[index].copy(kind = kind))) }
            block.kind.isListItem || block.kind == kind -> clearNodes(blocks, index).let {
                it.replaceAt(index, listOf(it[index].copy(kind = kind, align = block.align, indent = paragraphIndent(block))))
            }
            else -> blocks.replaceAt(index, listOf(block.copy(kind = kind)))
        }
        return if (updated == blocks) null else RichEdit(RichDoc.normalizeNesting(updated))
    }

    /**
     * The quote button (toggleBlockquote). In a quote it lifts the block
     * out (lift): a list item out of its list with what it holds, the list
     * staying in the quote; a line a list item holds out of the list; any
     * other block out of its innermost quote, split around it. Anywhere else
     * a paragraph, heading or code block goes into a quote of its own, even
     * right next to another one (wrapIn); a list item cannot be wrapped on
     * its own, and a line a list item holds would need a quote inside the
     * item, so nothing happens there.
     */
    fun toggleQuote(blocks: List<RichBlock>, id: String): RichEdit? {
        val index = blocks.indexOfFirst { it.id == id }
        if (index < 0) return null
        val block = blocks[index]
        val updated = when {
            block.quotes.isEmpty() && block.listDepth > 0 -> return null
            block.kind.isListItem -> liftItem(blocks, index)
            block.nestLevel > 0 -> blocks.replaceAt(index, listOf(block.copy(nestLevel = 0)))
            block.quotes.isNotEmpty() -> blocks.replaceAt(index, listOf(block.copy(quotes = block.quotes.dropLast(1))))
            else -> blocks.replaceAt(index, listOf(block.copy(quotes = listOf(RichQuote()))))
        }
        return RichEdit(RichDoc.normalizeNesting(updated))
    }

    /**
     * smartToggleCodeBlock (SmartCodeBlock.js): a code block becomes a
     * paragraph again (its line breaks kept); a selection inside a
     * paragraph, heading or list item is carved out into a code block of its
     * own between the text before and after it (in a list item, the item
     * keeps the text before, possibly none, and holds the rest); otherwise
     * the whole top-level block holding the caret (a whole list, a whole
     * quote) becomes one code block, one line per block. The caret lands at
     * its end.
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
        if (start < end && (block.kind == RichBlockKind.PARAGRAPH || block.kind.isHeading || block.kind.isListItem)) {
            val item = block.kind.isListItem
            val code = RichDoc.newBlock(RichBlockKind.CODE_BLOCK).copy(
                text = block.text.substring(start, end),
                nestLevel = block.listDepth,
                quotes = block.quotes,
            )
            val replacement = buildList {
                if (start > 0 || item) {
                    add(block.copy(text = block.text.substring(0, start), marks = RichDoc.clipMarks(block.marks, 0, start)))
                }
                add(code)
                if (end < block.text.length) {
                    add(
                        RichDoc.newBlock(if (item) RichBlockKind.PARAGRAPH else block.kind).copy(
                            text = block.text.substring(end),
                            marks = RichDoc.clipMarks(block.marks, end, block.text.length),
                            align = block.align,
                            indent = paragraphIndent(block),
                            nestLevel = block.listDepth,
                            quotes = block.quotes,
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
     * with text only before it the rule goes below. In a list item the rule
     * goes inside the item, after its paragraph, which keeps the text before
     * the selection (possibly none), the item then holding the text after
     * it. The caret moves to the text block after the rule, or to a new
     * empty paragraph when the rule ends the note, its quote or its list
     * item. A code block keeps its text and gets the rule below.
     */
    fun insertDivider(blocks: List<RichBlock>, id: String, start: Int, end: Int): RichEdit? {
        val index = blocks.indexOfFirst { it.id == id }
        if (index < 0) return null
        val block = blocks[index]
        val rule = RichDoc.newBlock(RichBlockKind.DIVIDER).copy(nestLevel = block.listDepth, quotes = block.quotes)
        val length = block.text.length
        val from = minOf(start, end).coerceIn(0, length)
        val to = maxOf(start, end).coerceIn(0, length)
        val before = block.copy(text = block.text.substring(0, from), marks = RichDoc.clipMarks(block.marks, 0, from))
        val after = block.copy(text = block.text.substring(to), marks = RichDoc.clipMarks(block.marks, to, length))
        val rest = RichDoc.newBlock(if (block.kind.isListItem) RichBlockKind.PARAGRAPH else block.kind).copy(
            text = after.text,
            marks = after.marks,
            align = block.align,
            indent = paragraphIndent(block),
            nestLevel = block.listDepth,
            quotes = block.quotes,
        )
        val (updated, ruleIndex) = when {
            block.kind.isListItem ->
                blocks.replaceAt(index, listOfNotNull(before, rule, rest.takeIf { to < length })) to index + 1
            block.kind != RichBlockKind.PARAGRAPH && !block.kind.isHeading -> blocks.replaceAt(index, listOf(block, rule)) to index + 1
            from == 0 && to == length -> blocks.replaceAt(index, listOf(rule)) to index
            from == 0 -> blocks.replaceAt(index, listOf(rule, after)) to index
            to == length -> blocks.replaceAt(index, listOf(before, rule)) to index + 1
            else -> blocks.replaceAt(index, listOf(before, rule, rest)) to index + 1
        }
        val next = updated.getOrNull(ruleIndex + 1)
        val within = next != null && next.nestLevel >= rule.nestLevel && next.quotes.startsWith(rule.quotes)
        return when {
            !within -> {
                val paragraph = RichDoc.newBlock().copy(nestLevel = rule.nestLevel, quotes = rule.quotes)
                RichEdit(updated.replaceRange(ruleIndex + 1, ruleIndex + 1, listOf(paragraph)), paragraph.id, 0)
            }
            next.kind.hasText && next.sharesQuoteWith(rule) -> RichEdit(updated, next.id, 0)
            else -> RichEdit(updated)
        }
    }

    /**
     * Lines typed at once into block [id] (a keyboard committing text with
     * line breaks in it): [newText] is the block's whole new text and
     * [newMarks] its marks, the typed part being `[insertStart, insertEnd)`.
     * Every line break inside the typed part starts a new paragraph, one
     * per line as a plain-text paste makes them, held where the block's
     * text is, in its quotes and list item: the first line joins the block,
     * the last one takes what was after the caret.
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
            } else {
                RichDoc.newBlock().copy(text = text, marks = marks, nestLevel = block.listDepth, quotes = block.quotes)
            }
            from = cut + 1
        }
        val last = pieces.last()
        return RichEdit(blocks.replaceAt(index, pieces), last.id, insertEnd - (cuts.last() + 1))
    }

    /** indent()/outdent() (Indent.js): every node the caret sits in moves
     *  one step, within 0..[RichDoc.MaxIndent]: the block itself (a bullet
     *  or ordered item's `<li>`, a task item's paragraph), every bullet or
     *  ordered item and every quote holding it, whose whole card moves. A
     *  paragraph a bullet or ordered item holds is skipped, its item moves. */
    fun shiftIndent(blocks: List<RichBlock>, id: String, delta: Int): RichEdit? {
        val index = blocks.indexOfFirst { it.id == id }
        return if (index < 0) null else shiftIndent(blocks, RichSpan.caret(index, 0), delta)
    }

    /** Whether the indent button ([delta] 1) or the outdent one (-1) can
     *  act on block [id]: can().indent() / can().outdent(), except that
     *  outdent inside a bullet or ordered item only looks at the nearest
     *  such item's own indent (RichTextToolbar.jsx canOutdent). */
    fun canShiftIndent(blocks: List<RichBlock>, id: String, delta: Int): Boolean {
        val index = blocks.indexOfFirst { it.id == id }
        if (index < 0) return false
        val block = blocks[index]
        val nearestItem = if (block.kind.isOrderedOrBullet) index else holdingItems(blocks, index).firstOrNull { blocks[it].kind.isOrderedOrBullet }
        if (delta < 0 && nearestItem != null) return blocks[nearestItem].indent > 0
        val indents = indentTargets(blocks, index).map { blocks[it].indent } + block.quotes.map { it.indent }
        return indents.any { if (delta > 0) it < RichDoc.MaxIndent else it > 0 }
    }

    /** The kinds of list block [id] sits in, the list buttons lit for it
     *  (isActive): its own, for a list item, and that of every item
     *  holding it. */
    fun listKindsAt(blocks: List<RichBlock>, id: String): Set<RichBlockKind> {
        val index = blocks.indexOfFirst { it.id == id }
        if (index < 0) return emptySet()
        val own = blocks[index].kind.takeIf { it.isListItem }
        return (listOfNotNull(own) + holdingItems(blocks, index).map { blocks[it].kind }).toSet()
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
        blocks.lastOrNull()?.let { it.kind != RichBlockKind.PARAGRAPH || it.quotes.isNotEmpty() || it.nestLevel > 0 } ?: true

    // ---------- Selections across blocks ----------

    /**
     * Backspace, Delete or Cut over a selection (deleteSelection), what the
     * web leaves:
     * - inside one block, the selected text goes;
     * - the whole document leaves one empty paragraph (Tiptap's
     *   clearDocument);
     * - a whole list, or a whole list item holding more than its line, goes;
     * - selected from the very first character of a line, a list, an item or
     *   a quote to inside the node next to it, or to the very start of a
     *   later line, the nodes before the end go whole: the end's block keeps
     *   its kind and place and only loses what was selected of it (an item
     *   still holding lines that stay keeps its own, emptied);
     * - otherwise the start's block takes what follows the end.
     */
    fun deleteSelection(blocks: List<RichBlock>, span: RichSpan): RichEdit {
        val first = blocks[span.start]
        if (span.start == span.end) {
            val cut = RichDoc.replaceText(first, span.startOffset, span.endOffset, "")
            return RichEdit(blocks.replaceAt(span.start, listOf(cut.copy(marks = RichDoc.pruneMarks(cut.marks)))), first.id, span.startOffset)
        }
        val atStart = span.startOffset == 0
        val atEnd = span.endOffset == blocks[span.end].textLength
        if (atStart && atEnd && span.start == 0 && span.end == blocks.lastIndex) {
            val paragraph = RichDoc.newBlock()
            return RichEdit(listOf(paragraph), paragraph.id, 0)
        }
        val a = holders(blocks, span.start)
        val b = holders(blocks, span.end)
        val shared = a.zip(b).takeWhile { (x, y) -> x == y }.size
        if (atStart && atEnd) coveredNode(a, b, shared)?.let { return removeRange(blocks, it) }
        if (atStart && (span.endOffset == 0 || startsBeside(blocks, a, b, shared, span))) return dropBefore(blocks, span)
        return replaceSelection(blocks, span)
    }

    /** The selection cleared the way typing or pasting over it clears it
     *  (replaceRangeWith): the start's block takes what follows the end,
     *  kept as plain text when either is a code block, and everything in
     *  between goes. From a divider, what follows the end stays where it is. */
    fun replaceSelection(blocks: List<RichBlock>, span: RichSpan): RichEdit {
        if (span.start == span.end) return deleteSelection(blocks, span)
        val first = blocks[span.start]
        if (!first.kind.hasText) return dropBefore(blocks, span)
        val last = blocks[span.end]
        val tail = if (last.kind.hasText) last.text.substring(span.endOffset) else ""
        val code = first.kind == RichBlockKind.CODE_BLOCK || last.kind == RichBlockKind.CODE_BLOCK
        val marks = when {
            first.kind == RichBlockKind.CODE_BLOCK -> emptyList()
            code -> RichDoc.clipMarks(first.marks, 0, span.startOffset)
            else -> RichDoc.clipMarks(first.marks, 0, span.startOffset) +
                RichDoc.clipMarks(last.marks, span.endOffset, last.text.length).map {
                    it.copy(start = it.start + span.startOffset, end = it.end + span.startOffset)
                }
        }
        val merged = first.copy(text = first.text.substring(0, span.startOffset) + tail, marks = marks.sortedBy { it.start })
        return RichEdit(RichDoc.normalizeNesting(blocks.replaceRange(span.start, span.end + 1, listOf(merged))), merged.id, span.startOffset)
    }

    /**
     * Enter over a selection: it is deleted ([deleteSelection]) and the block
     * the caret is left in is split there as a plain block (splitBlock), not
     * as a list item: in an item, what follows becomes a line the item holds.
     * The new line is a paragraph when the selection ended at the end of its
     * block, the block's kind otherwise; started at the very start of a
     * heading, the heading's own half becomes a paragraph.
     */
    fun splitSelection(blocks: List<RichBlock>, span: RichSpan): RichEdit? {
        val atEnd = span.endOffset == blocks[span.end].textLength
        val atStart = span.startOffset == 0
        val deleted = deleteSelection(blocks, span)
        val id = deleted.focusId ?: return deleted
        val index = deleted.blocks.indexOfFirst { it.id == id }
        val block = deleted.blocks[index]
        if (!block.kind.hasText || block.kind == RichBlockKind.CODE_BLOCK) return deleted
        val at = deleted.caret.coerceIn(0, block.text.length)
        val item = block.kind.isListItem
        val headKind = if (!atEnd && atStart && !item && block.kind != RichBlockKind.PARAGRAPH) RichBlockKind.PARAGRAPH else block.kind
        val head = block.copy(kind = headKind, text = block.text.substring(0, at), marks = RichDoc.clipMarks(block.marks, 0, at))
        val rest = RichDoc.newBlock(if (item || atEnd) RichBlockKind.PARAGRAPH else block.kind).copy(
            text = block.text.substring(at),
            marks = RichDoc.clipMarks(block.marks, at, block.text.length),
            align = block.align,
            indent = paragraphIndent(block),
            nestLevel = block.listDepth,
            quotes = block.quotes,
        )
        return RichEdit(RichDoc.normalizeNesting(deleted.blocks.replaceAt(index, listOf(head, rest))), rest.id, 0)
    }

    /** [kind] applied from the toolbar to what [span] selects: one block
     *  as [setKind] does, several as the web's list buttons and style
     *  gallery do ([toggleListAcross], [setTypeAcross]). */
    fun setKind(blocks: List<RichBlock>, span: RichSpan, kind: RichBlockKind): RichEdit? {
        if (span.start == span.end) return setKind(blocks, blocks[span.start].id, kind)
        val updated = if (kind.isListItem) toggleListAcross(blocks, span, kind) else setTypeAcross(blocks, span, kind)
        return if (updated == blocks) null else RichEdit(RichDoc.normalizeNesting(updated))
    }

    /**
     * The quote button over several blocks (toggleWrap): selected all inside
     * one quote, the nodes it selects there leave it (lift), the quote split
     * around them; otherwise they all go into one new quote where they stand
     * (wrapIn), whole lists and quotes included. Inside a single list the
     * web does nothing, a quote cannot go there.
     */
    fun toggleQuote(blocks: List<RichBlock>, span: RichSpan): RichEdit? {
        if (span.start == span.end) return toggleQuote(blocks, blocks[span.start].id)
        val a = holders(blocks, span.start)
        val b = holders(blocks, span.end)
        // Quotes come first in the chain: when the nodes both ends share are
        // all quotes, the innermost one is the parent the web works in.
        val depth = a.zip(b).takeWhile { (x, y) -> x == y }.size
        if (a.take(depth).any { it !is QuoteHolder }) return null
        val range = a[depth].range.first..b[depth].range.last
        val updated = if (depth > 0) {
            val quote = blocks[span.start].quotes[depth - 1]
            val rest = RichQuote(indent = quote.indent)
            blocks.mapIndexed { i, block ->
                when {
                    i in range -> block.copy(quotes = block.quotes.take(depth - 1) + block.quotes.drop(depth))
                    i > range.last && block.quotes.getOrNull(depth - 1)?.id == quote.id ->
                        block.copy(quotes = block.quotes.take(depth - 1) + rest + block.quotes.drop(depth))
                    else -> block
                }
            }
        } else {
            val quote = RichQuote()
            blocks.mapIndexed { i, block ->
                if (i in range) block.copy(quotes = listOf(quote) + block.quotes) else block
            }
        }
        return RichEdit(RichDoc.normalizeNesting(updated))
    }

    /**
     * smartToggleCodeBlock over several blocks: when they are all code
     * blocks, the first one becomes a paragraph again; otherwise every
     * top-level node the selection touches (a whole list, a whole quote)
     * becomes one code block, one line per block, the caret at its end.
     */
    fun toggleCodeBlock(blocks: List<RichBlock>, span: RichSpan): RichEdit? {
        if (span.start == span.end) return toggleCodeBlock(blocks, blocks[span.start].id, span.startOffset, span.endOffset)
        if (nodeActive(blocks, span) { it.kind == RichBlockKind.CODE_BLOCK }) {
            val block = blocks[span.start]
            return RichEdit(blocks.replaceAt(span.start, listOf(block.copy(kind = RichBlockKind.PARAGRAPH, indent = 0))))
        }
        val from = topLevelRange(blocks, span.start).first
        val to = topLevelRange(blocks, span.end).last
        val code = RichDoc.newBlock(RichBlockKind.CODE_BLOCK).copy(
            text = blocks.subList(from, to + 1).filter { it.kind.hasText }.joinToString("\n") { it.text },
        )
        return RichEdit(blocks.replaceRange(from, to + 1, listOf(code)), code.id, code.text.length)
    }

    /** setTextAlign: every paragraph and heading the selection touches, the
     *  line of a list item included; a code block has no alignment. */
    fun setAlign(blocks: List<RichBlock>, span: RichSpan, align: RichAlign): RichEdit? {
        val updated = blocks.mapIndexed { i, block ->
            if (i in span.start..span.end && block.kind.hasText && block.kind != RichBlockKind.CODE_BLOCK) block.copy(align = align) else block
        }
        return if (updated == blocks) null else RichEdit(updated)
    }

    /** indent()/outdent() over a selection: every node it touches moves one
     *  step, once, as [shiftIndent] moves the nodes holding one block. */
    fun shiftIndent(blocks: List<RichBlock>, span: RichSpan, delta: Int): RichEdit? {
        val moved = (span.start..span.end).flatMap { indentTargets(blocks, it) }.toSet()
        val quotes = (span.start..span.end).flatMap { blocks[it].quotes }.map { it.id }.toSet()
        val updated = blocks.mapIndexed { i, block ->
            val indent = if (i in moved) shifted(block.indent, delta) else block.indent
            val quoted = block.quotes.map { if (it.id in quotes) it.copy(indent = shifted(it.indent, delta)) else it }
            if (indent == block.indent && quoted == block.quotes) block else block.copy(indent = indent, quotes = quoted)
        }
        return if (updated == blocks) null else RichEdit(updated)
    }

    /** Whether the indent (1) or outdent (-1) button can act on [span]: any
     *  node it touches can move; outdent inside bullet or ordered items only
     *  looks at the nearest such item of the selection's start. */
    fun canShiftIndent(blocks: List<RichBlock>, span: RichSpan, delta: Int): Boolean {
        if (span.start == span.end) return canShiftIndent(blocks, blocks[span.start].id, delta)
        val inItems = (span.start..span.end).all { i ->
            blocks[i].kind.isOrderedOrBullet || holdingItems(blocks, i).any { blocks[it].kind.isOrderedOrBullet }
        }
        if (delta < 0 && inItems) return canShiftIndent(blocks, blocks[span.start].id, delta)
        return (span.start..span.end).any { canShiftIndent(blocks, blocks[it].id, delta) }
    }

    /** The list kinds lit for [span]: those of the lists holding all of it. */
    fun listKindsIn(blocks: List<RichBlock>, span: RichSpan): Set<RichBlockKind> {
        if (span.start == span.end) return listKindsAt(blocks, blocks[span.start].id)
        val a = holders(blocks, span.start)
        val b = holders(blocks, span.end)
        return a.zip(b).takeWhile { (x, y) -> x == y }.mapNotNull { (it.first as? ListHolder)?.kind }.toSet()
    }

    /** The eraser over a selection: every block it touches is cleared out of
     *  its lists and quotes, and every mark of the selected text goes. */
    fun clearFormatting(blocks: List<RichBlock>, span: RichSpan): RichEdit? {
        if (span.start == span.end) return clearFormatting(blocks, blocks[span.start].id, span.startOffset, span.endOffset)
        val cleared = (span.start..span.end).fold(blocks) { acc, i -> clearNodes(acc, i) }
        return RichEdit(RichDoc.normalizeNesting(clearMark(cleared, span, null)))
    }

    /** setHorizontalRule over a selection across blocks: the selection is
     *  cleared as typing clears it, and the rule goes where the caret is. */
    fun insertDivider(blocks: List<RichBlock>, span: RichSpan): RichEdit? {
        if (span.start == span.end) return insertDivider(blocks, blocks[span.start].id, span.startOffset, span.endOffset)
        val cleared = replaceSelection(blocks, span)
        val id = cleared.focusId ?: return cleared
        return insertDivider(cleared.blocks, id, cleared.caret, cleared.caret)
    }

    /** setMark over a selection: [type] on all the text it covers, but in a
     *  code block, whose text takes no mark. */
    fun setMark(blocks: List<RichBlock>, span: RichSpan, type: RichMarkType, value: String? = null, color: String? = null): List<RichBlock> =
        mapSelectedText(blocks, span) { marks, from, to -> RichDoc.setMark(marks, type, from, to, value, color) }

    /** unsetMark over a selection; a null [type] clears every mark. */
    fun clearMark(blocks: List<RichBlock>, span: RichSpan, type: RichMarkType?): List<RichBlock> =
        mapSelectedText(blocks, span) { marks, from, to ->
            if (type == null) RichDoc.clearAllMarks(marks, from, to) else RichDoc.clearMark(marks, type, from, to)
        }

    /** toggleMark over a selection: off when all its text has it, else on. */
    fun toggleMark(blocks: List<RichBlock>, span: RichSpan, type: RichMarkType): List<RichBlock> =
        if (isMarkActive(blocks, span, type)) clearMark(blocks, span, type) else setMark(blocks, span, type)

    /** isMarkActive: [type] covers every selected character, a code
     *  block's text included, which never has it. */
    fun isMarkActive(blocks: List<RichBlock>, span: RichSpan, type: RichMarkType): Boolean {
        var any = false
        for (i in span.start..span.end) {
            val block = blocks[i]
            if (!block.kind.hasText) continue
            val from = span.fromIn(i)
            val to = span.toIn(i, block.text.length)
            if (from >= to) continue
            if (!RichDoc.isMarkActive(block.marks, type, from, to)) return false
            any = true
        }
        return any
    }

    /** getAttributes: the first mark of [type] in the selected text, in
     *  document order, which the toolbar shows (a colour, a size...). */
    fun markIn(blocks: List<RichBlock>, span: RichSpan, type: RichMarkType): RichMark? {
        for (i in span.start..span.end) {
            val block = blocks[i]
            if (!block.kind.hasText) continue
            val from = span.fromIn(i)
            val to = span.toIn(i, block.text.length)
            block.marks.filter { it.type == type && it.start < to && it.end > from }.minByOrNull { it.start }?.let { return it }
        }
        return null
    }

    /** isActive for a node attribute across a selection: every block it
     *  touches matches [test], and each sits right after the one before in
     *  the same parent, the web measuring the selection against the nodes
     *  that match (two list items never do, their lines being apart). */
    fun nodeActive(blocks: List<RichBlock>, span: RichSpan, test: (RichBlock) -> Boolean): Boolean {
        if (!(span.start..span.end).all { test(blocks[it]) }) return false
        return (span.start until span.end).all { holders(blocks, it).dropLast(1) == holders(blocks, it + 1).dropLast(1) }
    }

    /** Whether one quote holds all of [span] (isActive("blockquote")). */
    fun quotedIn(blocks: List<RichBlock>, span: RichSpan): Boolean {
        val a = blocks[span.start].quotes
        return a.isNotEmpty() && (span.start..span.end).all { blocks[it].quotes.firstOrNull()?.id == a.first().id }
    }

    // ---------- Selections across blocks: helpers ----------

    /** A node holding blocks: a quote, a list, a list item with all it
     *  holds, or a block's own line. */
    private sealed interface Holder {
        val range: IntRange
    }

    private data class QuoteHolder(val id: String, override val range: IntRange) : Holder

    private data class ListHolder(val kind: RichBlockKind, override val range: IntRange) : Holder

    private data class ItemHolder(val index: Int, override val range: IntRange) : Holder

    private data class LineHolder(val index: Int) : Holder {
        override val range: IntRange get() = index..index
    }

    /** The nodes holding block [index], outermost first, down to its own
     *  line: its quotes, then the list and the item of each list level
     *  holding it (a list item's line being held by the item itself). */
    private fun holders(blocks: List<RichBlock>, index: Int): List<Holder> {
        val block = blocks[index]
        val items = holdingItems(blocks, index).asReversed() + listOfNotNull(index.takeIf { block.kind.isListItem })
        return block.quotes.indices.map { QuoteHolder(block.quotes[it].id, quoteRange(blocks, index, it)) } +
            items.flatMap { listOf(ListHolder(blocks[it].kind, listRange(blocks, it)), ItemHolder(it, it..subtreeEnd(blocks, it))) } +
            LineHolder(index)
    }

    /** The node selected whole that the web deletes whole: the innermost one
     *  holding both ends, when its two ends are the selection's, unless its
     *  lines are the two ends (they are then emptied instead), or it is an
     *  item alone in its list (the list goes instead). */
    private fun coveredNode(a: List<Holder>, b: List<Holder>, shared: Int): IntRange? {
        val start = a.last().range.first
        val end = b.last().range.last
        for (i in shared - 1 downTo 0) {
            val holder = a[i]
            if (holder.range.first != start || holder.range.last != end) return null
            if (a.size == shared + 1 && b.size == shared + 1) return null
            if (holder is ItemHolder && a[i - 1].range == holder.range) continue
            return holder.range
        }
        return null
    }

    /** deleteRange's shortcut: the selection starts the node it is in and
     *  ends inside the node beside it, which keeps content after the end, in
     *  a parent that can lose the first one (not an item's own line). */
    private fun startsBeside(blocks: List<RichBlock>, a: List<Holder>, b: List<Holder>, shared: Int, span: RichSpan): Boolean {
        val near = a[shared]
        val far = b[shared]
        val parent = a.getOrNull(shared - 1)
        if (near.range.first != span.start) return false
        if (parent is ItemHolder && near is LineHolder && near.index == parent.index) return false
        return span.endOffset < blocks[span.end].textLength || far.range.last > span.end
    }

    /** Everything before the end's block goes, but the line of an item that
     *  still holds blocks, emptied; the end's block loses what was selected. */
    private fun dropBefore(blocks: List<RichBlock>, span: RichSpan): RichEdit {
        val last = blocks[span.end]
        val kept = (span.start until span.end).filter { blocks[it].kind.isListItem && subtreeEnd(blocks, it) >= span.end }.toSet()
        val trimmed = if (last.kind.hasText) RichDoc.replaceText(last, 0, span.endOffset, "").let { it.copy(marks = RichDoc.pruneMarks(it.marks)) } else last
        val updated = blocks.mapIndexedNotNull { i, block ->
            when {
                i in kept -> block.copy(text = "", marks = emptyList())
                i in span.start until span.end -> null
                i == span.end -> trimmed
                else -> block
            }
        }
        val normalized = RichDoc.normalizeNesting(updated)
        return caretNear(normalized, normalized.indexOfFirst { it.id == last.id }, atStart = true)
    }

    /** The blocks of [range] removed, the caret on what follows them. */
    private fun removeRange(blocks: List<RichBlock>, range: IntRange): RichEdit {
        val remaining = blocks.filterIndexed { i, _ -> i !in range }
        if (remaining.isEmpty()) {
            val paragraph = RichDoc.newBlock()
            return RichEdit(listOf(paragraph), paragraph.id, 0)
        }
        val normalized = RichDoc.normalizeNesting(remaining)
        return caretNear(normalized, range.first.coerceAtMost(normalized.lastIndex), atStart = true)
    }

    /** The caret on block [index] (its start, or its end when not
     *  [atStart]), or on the nearest block with text when it has none. */
    private fun caretNear(blocks: List<RichBlock>, index: Int, atStart: Boolean): RichEdit {
        val block = blocks[index]
        if (block.kind.hasText) return RichEdit(blocks, block.id, if (atStart) 0 else block.text.length)
        blocks.drop(index + 1).firstOrNull { it.kind.hasText }?.let { return RichEdit(blocks, it.id, 0) }
        blocks.take(index).lastOrNull { it.kind.hasText }?.let { return RichEdit(blocks, it.id, it.text.length) }
        return RichEdit(blocks)
    }

    /** [transform] applied to the marks of each block's selected text. */
    private fun mapSelectedText(
        blocks: List<RichBlock>,
        span: RichSpan,
        transform: (marks: List<RichMark>, from: Int, to: Int) -> List<RichMark>,
    ): List<RichBlock> = blocks.mapIndexed { i, block ->
        if (i !in span.start..span.end || !block.kind.hasText || block.kind == RichBlockKind.CODE_BLOCK) return@mapIndexed block
        val from = span.fromIn(i)
        val to = span.toIn(i, block.text.length)
        if (from >= to) block else block.copy(marks = transform(block.marks, from, to))
    }

    /**
     * The list buttons over several blocks (toggleList). Inside a list, or
     * one of its items: an item of the list's own kind lifts the items the
     * selection covers out of the list (liftListItem), the other of bullet
     * and ordered converts that list. Elsewhere the nodes it covers go into
     * one list (wrapInList): each paragraph an item, anything else (a
     * heading, code, a rule, a list) held by the item before; when the
     * first is not a paragraph they are all cleared first (clearNodes) and
     * each becomes an item. A quote the model cannot put in an item stays
     * out of the list.
     */
    private fun toggleListAcross(blocks: List<RichBlock>, span: RichSpan, kind: RichBlockKind): List<RichBlock> {
        val a = holders(blocks, span.start)
        val b = holders(blocks, span.end)
        val shared = a.zip(b).takeWhile { (x, y) -> x == y }.size
        val closest = a.indexOfLast { it is ListHolder }
        if (shared >= 1 && closest >= 0 && shared - (closest + 1) <= 1) {
            val list = a[closest] as ListHolder
            if (list.kind == kind || list.kind.isOrderedOrBullet && kind.isOrderedOrBullet && list.kind != kind) {
                return if (list.kind == kind) liftItemsAcross(blocks, a, b, shared, kind) else convertList(blocks, list.range.first, kind)
            }
        }
        val parent = a.getOrNull(shared - 1)
        val wraps = (parent == null || parent is QuoteHolder) && a[shared] is LineHolder && blocks[span.start].kind == RichBlockKind.PARAGRAPH
        if (!wraps) {
            val cleared = (span.start..span.end).fold(blocks) { acc, i -> clearNodes(acc, i) }
            return cleared.mapIndexed { i, block ->
                if (i in span.start..span.end && block.kind.hasText) block.copy(kind = kind, checked = false) else block
            }
        }
        val range = a[shared].range.first..b[shared].range.last
        val updated = blocks.toMutableList()
        var nesting = false
        var i = range.first
        while (i <= range.last) {
            val node = holders(blocks, i)[shared]
            val block = blocks[i]
            when {
                node is QuoteHolder -> nesting = false
                node is LineHolder && block.kind == RichBlockKind.PARAGRAPH -> {
                    updated[i] = block.copy(kind = kind, checked = false)
                    nesting = true
                }
                nesting -> for (j in node.range) updated[j] = blocks[j].copy(nestLevel = blocks[j].nestLevel + 1)
            }
            i = node.range.last + 1
        }
        return updated
    }

    /** liftListItem over several items: the innermost list of this item
     *  type holding both ends gives up every item of it the selection
     *  touches, each with what it holds. */
    private fun liftItemsAcross(blocks: List<RichBlock>, a: List<Holder>, b: List<Holder>, shared: Int, kind: RichBlockKind): List<RichBlock> {
        val task = kind == RichBlockKind.TASK_ITEM
        val level = (shared - 1 downTo 0).firstOrNull { i ->
            (a[i] as? ListHolder)?.let { (it.kind == RichBlockKind.TASK_ITEM) == task } == true
        } ?: return blocks
        val first = (a[level + 1] as ItemHolder).index
        val last = (b[level + 1] as ItemHolder).index
        val nest = blocks[first].nestLevel
        val items = (first..last).filter { blocks[it].kind.isListItem && blocks[it].nestLevel == nest && blocks[it].sharesQuoteWith(blocks[first]) }
        return items.fold(blocks) { acc, index -> liftItem(acc, index) }
    }

    /**
     * The style gallery over several blocks (setNode): every paragraph,
     * heading and code block it touches takes the style, with the default
     * alignment and indent; a list item's own line can only be a paragraph,
     * so a heading skips it, unless nothing else can take it: everything is
     * then cleared out of its lists first (clearNodes).
     */
    private fun setTypeAcross(blocks: List<RichBlock>, span: RichSpan, kind: RichBlockKind): List<RichBlock> {
        val range = span.start..span.end
        val heading = kind.isHeading
        val canTake = { block: RichBlock -> block.kind.hasText && (!heading || !block.kind.isListItem) }
        val source = if (range.any { canTake(blocks[it]) }) blocks else range.fold(blocks) { acc, i -> clearNodes(acc, i) }
        return source.mapIndexed { i, block ->
            when {
                i !in range || !canTake(block) -> block
                block.kind.isListItem -> block.copy(align = RichAlign.LEFT, indent = if (block.kind == RichBlockKind.TASK_ITEM) 0 else block.indent)
                else -> block.copy(kind = kind, align = RichAlign.LEFT, indent = 0)
            }
        }
    }

    /** Whether the list item [index] joins the item right above it
     *  (joinItemBackward): an item of the same list, which holds no nested
     *  item of the same item type (listItemHasSubList). */
    private fun joinsItemAbove(blocks: List<RichBlock>, index: Int): Boolean {
        val block = blocks[index]
        var holdsItems = false
        var j = index - 1
        while (j >= 0 && blocks[j].sharesQuoteWith(block) && blocks[j].listDepth > block.nestLevel) {
            val above = blocks[j]
            if (above.kind.isListItem && above.nestLevel == block.nestLevel) return above.kind == block.kind && !holdsItems
            if (above.kind.isListItem && (above.kind == RichBlockKind.TASK_ITEM) == (block.kind == RichBlockKind.TASK_ITEM)) holdsItems = true
            j--
        }
        return false
    }

    /** Whether the list item holding block [index] (or, for a list item, the
     *  item itself) holds more after it. */
    private fun itemHoldsMore(blocks: List<RichBlock>, index: Int): Boolean {
        val block = blocks[index]
        val next = blocks.getOrNull(index + 1) ?: return false
        return block.listDepth > 0 && next.sharesQuoteWith(block) && next.nestLevel >= block.listDepth
    }

    /** The index of the list item holding block [index], one level up (for
     *  a list item, its parent item), or null outside any. */
    internal fun holdingItem(blocks: List<RichBlock>, index: Int): Int? {
        val block = blocks[index]
        val level = block.nestLevel - 1
        var j = index - 1
        while (level >= 0 && j >= 0 && blocks[j].sharesQuoteWith(block) && blocks[j].listDepth > level) {
            if (blocks[j].kind.isListItem && blocks[j].nestLevel == level) return j
            j--
        }
        return null
    }

    /** Every list item holding block [index], nearest first. */
    private fun holdingItems(blocks: List<RichBlock>, index: Int): List<Int> =
        generateSequence(holdingItem(blocks, index)) { holdingItem(blocks, it) }.toList()

    /** The blocks whose own indent the indent buttons move for block
     *  [index] (see [shiftIndent]). */
    private fun indentTargets(blocks: List<RichBlock>, index: Int): List<Int> {
        val block = blocks[index]
        val holders = holdingItems(blocks, index)
        val skipped = block.kind == RichBlockKind.PARAGRAPH && holders.firstOrNull()?.let { blocks[it].kind.isOrderedOrBullet } == true
        return listOfNotNull(index.takeUnless { skipped }) + holders.filter { blocks[it].kind.isOrderedOrBullet }
    }

    private fun shifted(indent: Int, delta: Int): Int = (indent + delta).coerceIn(0, RichDoc.MaxIndent)

    /** The indent the paragraph of [block] carries: a bullet or ordered
     *  item's own lives on its `<li>`, not on its paragraph. */
    private fun paragraphIndent(block: RichBlock): Int = if (block.kind.isOrderedOrBullet) 0 else block.indent

    /**
     * liftListItem: the item at [index] moves one level up with everything
     * it holds: a nested item becomes an item of its parent's list, a
     * top-level item a plain paragraph in its quotes, what it held then
     * standing on its own. The indent of a bullet or ordered item lives on
     * its `<li>`, gone once out of the list; a task item's own indent is
     * its paragraph's, which stays.
     */
    private fun liftItem(blocks: List<RichBlock>, index: Int): List<RichBlock> {
        val item = blocks[index]
        val lifted = if (item.nestLevel > 0) {
            val parent = holdingItem(blocks, index)?.let { blocks[it] }
            item.copy(kind = parent?.kind ?: item.kind, nestLevel = item.nestLevel - 1)
        } else {
            item.copy(kind = RichBlockKind.PARAGRAPH, indent = paragraphIndent(item))
        }
        val end = subtreeEnd(blocks, index)
        return blocks.mapIndexed { i, b ->
            when (i) {
                index -> lifted
                in index + 1..end -> b.copy(nestLevel = b.nestLevel - 1)
                else -> b
            }
        }
    }

    /** The last block list item [index] holds, or [index] itself. */
    private fun subtreeEnd(blocks: List<RichBlock>, index: Int): Int {
        val item = blocks[index]
        var end = index
        while (end + 1 < blocks.size && blocks[end + 1].sharesQuoteWith(item) && blocks[end + 1].nestLevel > item.nestLevel) end++
        return end
    }

    /** liftEmptyBlock on an empty block of a quote: in the middle of its
     *  innermost quote, that quote is first split in two right above it,
     *  the block then opening the second one; at either end, or alone, it
     *  leaves the quote. */
    private fun liftEmptyFromQuote(blocks: List<RichBlock>, index: Int): List<RichBlock> {
        val block = blocks[index]
        val depth = block.quotes.lastIndex
        val range = quoteRange(blocks, index, depth)
        if (index == range.first || index == range.last) {
            return blocks.replaceAt(index, listOf(block.copy(quotes = block.quotes.dropLast(1))))
        }
        val second = RichQuote(indent = block.quotes[depth].indent)
        return blocks.mapIndexed { i, b ->
            if (i in index..range.last) b.copy(quotes = b.quotes.take(depth) + second + b.quotes.drop(depth + 1)) else b
        }
    }

    /**
     * clearNodes: the block at [index] becomes a plain paragraph with the
     * default attributes, out of its list and of every quote. Every node
     * around it is lifted as far as it goes: each quote inside another
     * comes out of the ones around it, and the whole list of an item in a
     * quote leaves its quotes along with it.
     */
    private fun clearNodes(blocks: List<RichBlock>, index: Int): List<RichBlock> {
        val block = blocks[index]
        val runs = (1 until block.quotes.size).map { quoteRange(blocks, index, it) }
        val list = if (block.listDepth > 0 && block.quotes.isNotEmpty()) wholeList(blocks, index) else IntRange.EMPTY
        return blocks.mapIndexed { i, b ->
            when (i) {
                index -> b.copy(kind = RichBlockKind.PARAGRAPH, align = RichAlign.LEFT, indent = 0, nestLevel = 0, quotes = emptyList())
                in list -> b.copy(quotes = emptyList())
                else -> {
                    val lifted = runs.indexOfLast { i in it } + 1
                    if (lifted > 0) b.copy(quotes = b.quotes.drop(lifted)) else b
                }
            }
        }
    }

    /** The quote at [depth] holding block [index] joins [into],
     *  ProseMirror's join keeping the first quote's attributes. */
    private fun joinQuote(blocks: List<RichBlock>, index: Int, depth: Int, into: RichQuote): List<RichBlock> {
        val range = quoteRange(blocks, index, depth)
        return blocks.mapIndexed { i, b ->
            if (i in range) b.copy(quotes = b.quotes.take(depth) + into + b.quotes.drop(depth + 1)) else b
        }
    }

    /** Bullet against ordered: the list holding item [index] changes kind. */
    private fun convertList(blocks: List<RichBlock>, index: Int, kind: RichBlockKind): List<RichBlock> {
        val item = blocks[index]
        val range = listRange(blocks, index)
        return blocks.mapIndexed { i, b ->
            if (i in range && b.nestLevel == item.nestLevel && b.kind == item.kind) b.copy(kind = kind) else b
        }
    }

    /** The indices of the list holding the item at [index]: its siblings of
     *  the same level, and whatever they hold. */
    private fun listRange(blocks: List<RichBlock>, index: Int): IntRange {
        val block = blocks[index]
        fun inList(b: RichBlock) = b.sharesQuoteWith(block) &&
            (b.nestLevel > block.nestLevel || b.nestLevel == block.nestLevel && b.kind == block.kind)
        var first = index
        while (first > 0 && inList(blocks[first - 1])) first--
        var last = index
        while (last < blocks.lastIndex && inList(blocks[last + 1])) last++
        return first..last
    }

    /** The indices of the top-level list holding block [index]. */
    private fun wholeList(blocks: List<RichBlock>, index: Int): IntRange {
        var first = index
        while (blocks[first].nestLevel > 0) first--
        return listRange(blocks, first)
    }

    /** The indices of the quote at [depth] holding block [index]. */
    private fun quoteRange(blocks: List<RichBlock>, index: Int, depth: Int): IntRange {
        val id = blocks[index].quotes[depth].id
        var first = index
        while (first > 0 && blocks[first - 1].quotes.getOrNull(depth)?.id == id) first--
        var last = index
        while (last < blocks.lastIndex && blocks[last + 1].quotes.getOrNull(depth)?.id == id) last++
        return first..last
    }

    /** The indices of the top-level node holding block [index]: its
     *  outermost quote, else its whole list, else the block itself. */
    private fun topLevelRange(blocks: List<RichBlock>, index: Int): IntRange = when {
        blocks[index].quotes.isNotEmpty() -> quoteRange(blocks, index, 0)
        blocks[index].listDepth > 0 -> wholeList(blocks, index)
        else -> index..index
    }

    private val RichBlockKind.isOrderedOrBullet: Boolean
        get() = this == RichBlockKind.BULLET_ITEM || this == RichBlockKind.NUMBERED_ITEM
}

internal fun List<RichBlock>.replaceAt(index: Int, replacement: List<RichBlock>): List<RichBlock> =
    replaceRange(index, index + 1, replacement)

internal fun List<RichBlock>.replaceRange(from: Int, to: Int, replacement: List<RichBlock>): List<RichBlock> =
    subList(0, from) + replacement + subList(to, size)
