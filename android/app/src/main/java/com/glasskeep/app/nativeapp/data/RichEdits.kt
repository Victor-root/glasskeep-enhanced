package com.glasskeep.app.nativeapp.data

/**
 * One structural edit's outcome: the new block list, and where the caret
 * goes next ([focusId] at [caret]), or null when it stays where it is.
 */
data class RichEdit(val blocks: List<RichBlock>, val focusId: String? = null, val caret: Int = 0)

/**
 * The structural edits typing makes in the web editor (Tiptap/ProseMirror:
 * splitBlock, splitListItem, liftEmptyBlock, joinBackward, deleteSelection...),
 * ported onto the flat block model, with the formatting bar's mark commands
 * and what its buttons read; its block commands run on the web's own model
 * ([RichCommands]). Each takes the current blocks and returns what the web
 * would leave. Pure, so the screen only has to apply the result.
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
            lineIndent = block.lineIndent,
            nestLevel = block.nestLevel,
            quotes = block.quotes,
        )
        // A paragraph a list item holds after its own splits the item there
        // (splitListItem): what follows the caret opens a new item of the
        // same list, which takes everything the item held after it, the
        // item's attributes and the paragraph's.
        val item = if (block.kind == RichBlockKind.PARAGRAPH) holdingItem(blocks, index)?.let { blocks[it] } else null
        if (item != null) {
            val newItem = rest.copy(
                kind = item.kind,
                indent = if (item.kind == RichBlockKind.TASK_ITEM) block.indent else item.indent,
                lineIndent = if (item.kind == RichBlockKind.TASK_ITEM) 0 else block.indent,
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

    /** setMark over a selection: [type] on all the text it covers, but in a
     *  code block, whose text takes no mark, and as [RichDoc.setMark] puts
     *  it on around inline code. */
    fun setMark(blocks: List<RichBlock>, span: RichSpan, type: RichMarkType, value: String? = null, color: String? = null): List<RichBlock> =
        mapSelectedText(blocks, span) { marks, from, to -> RichDoc.setMark(marks, type, from, to, value, color) }

    /** unsetMark over a selection; a null [type] clears every mark. */
    fun clearMark(blocks: List<RichBlock>, span: RichSpan, type: RichMarkType?): List<RichBlock> =
        mapSelectedText(blocks, span) { marks, from, to ->
            if (type == null) RichDoc.clearAllMarks(marks, from, to) else RichDoc.clearMark(marks, type, from, to)
        }

    /** toggleMark over a selection: off when it reads active, else on. */
    fun toggleMark(blocks: List<RichBlock>, span: RichSpan, type: RichMarkType): List<RichBlock> =
        if (isMarkActive(blocks, span, type)) clearMark(blocks, span, type) else setMark(blocks, span, type)

    /**
     * Tiptap's isMarkActive over a selection: the selected text with [type]
     * (of a value and a colour [attrs] accepts), plus, once there is any,
     * the inline code that excludes it, is all the selected text. A code
     * block, whose text takes no mark, is left out, and so is a line break
     * without marks, not being text.
     */
    fun isMarkActive(
        blocks: List<RichBlock>,
        span: RichSpan,
        type: RichMarkType,
        attrs: (value: String?, color: String?) -> Boolean = { _, _ -> true },
    ): Boolean {
        var selected = 0
        var matched = 0
        var excluded = 0
        for (i in span.start..span.end) {
            val block = blocks[i]
            if (!block.kind.hasText || block.kind == RichBlockKind.CODE_BLOCK) continue
            val from = span.fromIn(i)
            val to = span.toIn(i, block.text.length)
            val cuts = sortedSetOf(from, to)
            for (m in block.marks) {
                if (m.start in from..to) cuts += m.start
                if (m.end in from..to) cuts += m.end
            }
            for ((start, end) in cuts.zipWithNext()) {
                val over = block.marks.filter { it.start <= start && it.end >= end }
                val length = if (over.isEmpty()) (start until end).count { block.text[it] != '\n' } else end - start
                selected += length
                if (over.any { it.type == type && attrs(it.value, it.color) }) matched += length
                if (type != RichMarkType.CODE && over.any { it.type == RichMarkType.CODE }) excluded += length
            }
        }
        return selected > 0 && matched > 0 && matched + excluded >= selected
    }

    /** getAttributes over a selection: the first mark of [type] in the
     *  selected text, in document order, which the toolbar shows (a colour,
     *  a size...). A colour, a font and a size being one textStyle mark on
     *  the web, theirs is read where the first text with any of them is. */
    fun markIn(blocks: List<RichBlock>, span: RichSpan, type: RichMarkType): RichMark? {
        for (i in span.start..span.end) {
            val block = blocks[i]
            if (!block.kind.hasText) continue
            val from = span.fromIn(i)
            val to = span.toIn(i, block.text.length)
            val first = block.marks
                .filter { (if (type.isTextStyle) it.type.isTextStyle else it.type == type) && it.start < to && it.end > from }
                .minOfOrNull { maxOf(it.start, from) } ?: continue
            return block.marks.firstOrNull { it.type == type && it.start <= first && it.end > first }
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

    /** The blocks whose own indent indent() and outdent() move for block
     *  [index] (Indent.js): the block, but a rule, which has none, or the
     *  paragraph of a bullet or ordered item, whose item moves instead; and
     *  every bullet or ordered item holding it. */
    private fun indentTargets(blocks: List<RichBlock>, index: Int): List<Int> {
        val block = blocks[index]
        val holders = holdingItems(blocks, index)
        val skipped = block.kind == RichBlockKind.DIVIDER ||
            block.kind == RichBlockKind.PARAGRAPH && holders.firstOrNull()?.let { blocks[it].kind.isOrderedOrBullet } == true
        return listOfNotNull(index.takeUnless { skipped }) + holders.filter { blocks[it].kind.isOrderedOrBullet }
    }

    /** The indent the paragraph of [block] carries: a bullet or ordered
     *  item's is its [RichBlock.lineIndent], the item's own lives on its
     *  `<li>`. */
    private fun paragraphIndent(block: RichBlock): Int = if (block.kind.isOrderedOrBullet) block.lineIndent else block.indent

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
            item.copy(kind = RichBlockKind.PARAGRAPH, indent = paragraphIndent(item), lineIndent = 0)
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
                index -> b.copy(kind = RichBlockKind.PARAGRAPH, align = RichAlign.LEFT, indent = 0, lineIndent = 0, nestLevel = 0, quotes = emptyList())
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

    private val RichBlockKind.isOrderedOrBullet: Boolean
        get() = this == RichBlockKind.BULLET_ITEM || this == RichBlockKind.NUMBERED_ITEM
}

internal fun List<RichBlock>.replaceAt(index: Int, replacement: List<RichBlock>): List<RichBlock> =
    replaceRange(index, index + 1, replacement)

internal fun List<RichBlock>.replaceRange(from: Int, to: Int, replacement: List<RichBlock>): List<RichBlock> =
    subList(0, from) + replacement + subList(to, size)
