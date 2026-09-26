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
 * The model cannot hold a heading or a list inside a quote, a code block
 * or a second paragraph inside a list item; where the web would build one
 * of those, the closest shape the model has is used instead, as noted on
 * each command.
 */
object RichEdits {

    /** Enter at [position] of block [id]. */
    fun split(blocks: List<RichBlock>, id: String, position: Int): RichEdit? {
        val index = blocks.indexOfFirst { it.id == id }
        if (index < 0) return null
        val block = blocks[index]
        if (!block.kind.hasText || block.kind == RichBlockKind.CODE_BLOCK) return null
        // An empty list item or quote line leaves its list or quote instead
        // of adding another empty one (liftEmptyBlock): a nested item moves
        // up one level, anything else becomes a plain paragraph right where
        // it is, splitting the list or quote around it.
        if (block.text.isEmpty() && (block.kind.isListItem || block.kind == RichBlockKind.QUOTE)) {
            return RichEdit(blocks.replaceAt(index, listOf(lift(blocks, index))), block.id, 0)
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
        )
        val replacement = when {
            // A list item or quote paragraph continues its run; a task item
            // split off starts unchecked (splitListItem's checked: false).
            block.kind.isListItem || block.kind == RichBlockKind.QUOTE -> listOf(first, rest)
            // At the start of a heading the heading moves down, under an
            // empty paragraph (splitBlock turns the empty half into the
            // default block type, with default attributes).
            block.kind.isHeading && at == 0 && !atEnd ->
                listOf(RichDoc.newBlock(), block)
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
            // The first item of a list (or of a nested list) and the first
            // paragraph of a quote are lifted out rather than glued onto the
            // block above.
            block.kind.isListItem && !continuesList(previous, block) ||
                block.kind == RichBlockKind.QUOTE && previous?.kind != RichBlockKind.QUOTE ->
                RichEdit(blocks.replaceAt(index, listOf(lift(blocks, index))), block.id, 0)
            // An empty code block, a code block opening the note, or an
            // empty heading opening the note is cleared back to a paragraph
            // (clearNodes).
            block.kind == RichBlockKind.CODE_BLOCK && (block.text.isEmpty() || previous == null) ||
                previous == null && block.text.isEmpty() && block.kind.isHeading ->
                RichEdit(blocks.replaceAt(index, listOf(block.copy(kind = RichBlockKind.PARAGRAPH))), block.id, 0)
            previous == null -> null
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
     * The list and quote buttons (toggleBulletList, toggleOrderedList,
     * toggleTaskList, toggleBlockquote) and the style gallery (setParagraph,
     * setHeading). Pressing the list or quote button a block already is
     * lifts only that block out; switching between a bullet and an ordered
     * list converts the whole list; switching to or from a task list only
     * moves that one item (the item types differ, so the web clears and
     * re-wraps just the selection). The style gallery leaves a list item
     * alone (an item must start with a paragraph) and "Paragraph" leaves a
     * quote paragraph alone; a heading picked in a quote comes out of it.
     */
    fun setKind(blocks: List<RichBlock>, id: String, kind: RichBlockKind): RichEdit? {
        val index = blocks.indexOfFirst { it.id == id }
        if (index < 0) return null
        val block = blocks[index]
        val styleGallery = kind == RichBlockKind.PARAGRAPH || kind.isHeading
        if (styleGallery && (block.kind.isListItem || block.kind == RichBlockKind.QUOTE && kind == RichBlockKind.PARAGRAPH)) {
            return null
        }
        val updated = when {
            block.kind == kind && (kind.isListItem || kind == RichBlockKind.QUOTE) ->
                blocks.replaceAt(index, listOf(lift(blocks, index)))
            block.kind.isOrderedOrBullet && kind.isOrderedOrBullet -> {
                val range = listRange(blocks, index)
                blocks.mapIndexed { i, b ->
                    if (i in range && b.nestLevel == block.nestLevel && b.kind == block.kind) b.copy(kind = kind) else b
                }
            }
            else -> blocks.replaceAt(index, listOf(block.copy(kind = kind, nestLevel = 0)))
        }
        return RichEdit(RichDoc.normalizeNesting(updated))
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
            return RichEdit(blocks.replaceAt(index, listOf(block.copy(kind = RichBlockKind.PARAGRAPH))))
        }
        val start = minOf(selectionStart, selectionEnd).coerceIn(0, block.text.length)
        val end = maxOf(selectionStart, selectionEnd).coerceIn(0, block.text.length)
        if (start < end && (block.kind == RichBlockKind.PARAGRAPH || block.kind.isHeading)) {
            val code = RichDoc.newBlock(RichBlockKind.CODE_BLOCK).copy(text = block.text.substring(start, end))
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
     * rule ends the note. A list item or a quote (which the web would put
     * the rule inside of) keeps its text and gets the rule below.
     */
    fun insertDivider(blocks: List<RichBlock>, id: String, start: Int, end: Int): RichEdit? {
        val index = blocks.indexOfFirst { it.id == id }
        if (index < 0) return null
        val block = blocks[index]
        val rule = RichDoc.newBlock(RichBlockKind.DIVIDER)
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
                )
                blocks.replaceAt(index, listOf(before, rule, rest)) to index + 1
            }
        }
        val next = updated.getOrNull(ruleIndex + 1)
        return when {
            next == null -> {
                val paragraph = RichDoc.newBlock()
                RichEdit(updated + paragraph, paragraph.id, 0)
            }
            next.kind.hasText -> RichEdit(updated, next.id, 0)
            else -> RichEdit(updated)
        }
    }

    /**
     * Text pasted (or typed) with line breaks into block [id]: [newText] is
     * the block's whole new text and [newMarks] its marks, the pasted part
     * being `[insertStart, insertEnd)`. Every line break inside the pasted
     * part starts a new block (plainTextToPasteSlice, one paragraph per
     * line): the first line joins the block, the last one takes what was
     * after the caret. The new blocks are paragraphs, except inside a quote
     * (more quote paragraphs) and a list (more items of the same list,
     * where the web would stack paragraphs inside the one item).
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
        val continuation = block.kind.isListItem || block.kind == RichBlockKind.QUOTE
        val pieces = mutableListOf<RichBlock>()
        var from = 0
        for ((n, cut) in (cuts + newText.length).withIndex()) {
            val text = newText.substring(from, cut)
            val marks = RichDoc.clipMarks(newMarks, from, cut)
            pieces += if (n == 0) {
                block.copy(text = text, marks = marks)
            } else if (continuation) {
                RichDoc.newBlock(block.kind).copy(
                    text = text,
                    marks = marks,
                    align = block.align,
                    indent = block.indent,
                    nestLevel = block.nestLevel,
                )
            } else {
                RichDoc.newBlock().copy(text = text, marks = marks)
            }
            from = cut + 1
        }
        val last = pieces.last()
        return RichEdit(blocks.replaceAt(index, pieces), last.id, insertEnd - (cuts.last() + 1))
    }

    /** Tiptap's TrailingNode: the editor always ends with a top-level
     *  paragraph, so there is always a line to tap into below a final
     *  heading, list, quote, code block or rule. */
    fun needsTrailingParagraph(blocks: List<RichBlock>): Boolean =
        blocks.lastOrNull()?.kind != RichBlockKind.PARAGRAPH

    /** Whether [block] is another item of the same list as [previous], the
     *  block right above it (a deeper item above means a sibling came
     *  first, with a nested list of its own). */
    private fun continuesList(previous: RichBlock?, block: RichBlock): Boolean =
        previous != null && previous.kind.isListItem &&
            (previous.nestLevel > block.nestLevel || previous.nestLevel == block.nestLevel && previous.kind == block.kind)

    /** The block at [index] lifted one step out (liftListItem, lift): a
     *  nested item becomes an item of its parent's list, one level up;
     *  a top-level item or a quote paragraph becomes a plain paragraph. The
     *  indent of a bullet or ordered item lives on its `<li>` and that of a
     *  quote on the blockquote, both gone once lifted; a task item's own
     *  indent is its paragraph's, which stays. */
    private fun lift(blocks: List<RichBlock>, index: Int): RichBlock {
        val block = blocks[index]
        if (block.kind.isListItem && block.nestLevel > 0) {
            val level = block.nestLevel - 1
            val parent = (index - 1 downTo 0).map { blocks[it] }.firstOrNull { it.kind.isListItem && it.nestLevel == level }
            return block.copy(kind = parent?.kind ?: block.kind, nestLevel = level)
        }
        return block.copy(
            kind = RichBlockKind.PARAGRAPH,
            indent = if (block.kind == RichBlockKind.TASK_ITEM) block.indent else 0,
            nestLevel = 0,
        )
    }

    /** The indices of the list holding the item at [index]: its siblings of
     *  the same level, and whatever is nested between them. */
    private fun listRange(blocks: List<RichBlock>, index: Int): IntRange {
        val block = blocks[index]
        fun inList(b: RichBlock) = b.kind.isListItem &&
            (b.nestLevel > block.nestLevel || b.nestLevel == block.nestLevel && b.kind == block.kind)
        var first = index
        while (first > 0 && inList(blocks[first - 1])) first--
        var last = index
        while (last < blocks.lastIndex && inList(blocks[last + 1])) last++
        return first..last
    }

    /** The indices of the top-level node holding the block at [index]: the
     *  whole list for a list item, the whole quote for a quote paragraph,
     *  the block itself otherwise. */
    private fun topLevelRange(blocks: List<RichBlock>, index: Int): IntRange {
        val block = blocks[index]
        return when {
            block.kind.isListItem -> {
                var first = index
                while (blocks[first].nestLevel > 0) first--
                listRange(blocks, first)
            }
            block.kind == RichBlockKind.QUOTE -> {
                var first = index
                while (first > 0 && blocks[first - 1].kind == RichBlockKind.QUOTE) first--
                var last = index
                while (last < blocks.lastIndex && blocks[last + 1].kind == RichBlockKind.QUOTE) last++
                first..last
            }
            else -> index..index
        }
    }

    private val RichBlockKind.isOrderedOrBullet: Boolean
        get() = this == RichBlockKind.BULLET_ITEM || this == RichBlockKind.NUMBERED_ITEM
}

internal fun List<RichBlock>.replaceAt(index: Int, replacement: List<RichBlock>): List<RichBlock> =
    replaceRange(index, index + 1, replacement)

internal fun List<RichBlock>.replaceRange(from: Int, to: Int, replacement: List<RichBlock>): List<RichBlock> =
    subList(0, from) + replacement + subList(to, size)
