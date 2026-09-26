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
     * Text pasted (or typed) with line breaks into block [id]: [newText] is
     * the block's whole new text and [newMarks] its marks, the pasted part
     * being `[insertStart, insertEnd)`. Every line break inside the pasted
     * part starts a new paragraph (plainTextToPasteSlice, one paragraph per
     * line) held where the block's text is, in its quotes and list item:
     * the first line joins the block, the last one takes what was after the
     * caret.
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
        if (index < 0) return null
        val block = blocks[index]
        val moved = indentTargets(blocks, index)
        val runs = block.quotes.indices.map { quoteRange(blocks, index, it) }
        val quotes = block.quotes.map { it.copy(indent = shifted(it.indent, delta)) }
        return RichEdit(
            blocks.mapIndexed { i, b ->
                val indent = if (i in moved) shifted(b.indent, delta) else b.indent
                val held = runs.count { i in it }
                val quoted = if (held == 0) b.quotes else quotes.take(held) + b.quotes.drop(held)
                if (indent == b.indent && held == 0) b else b.copy(indent = indent, quotes = quoted)
            },
        )
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
    private fun holdingItem(blocks: List<RichBlock>, index: Int): Int? {
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
        var end = index + 1
        while (end < blocks.size && blocks[end].sharesQuoteWith(item) && blocks[end].nestLevel > item.nestLevel) end++
        return blocks.mapIndexed { i, b ->
            when (i) {
                index -> lifted
                in index + 1 until end -> b.copy(nestLevel = b.nestLevel - 1)
                else -> b
            }
        }
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
