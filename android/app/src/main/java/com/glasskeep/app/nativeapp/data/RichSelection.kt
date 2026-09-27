package com.glasskeep.app.nativeapp.data

/** A position in the document: [offset] characters into the text of block
 *  [blockId] (0 on a divider, which has no text). */
data class RichPos(val blockId: String, val offset: Int)

/**
 * The editor's selection, ProseMirror's TextSelection over the whole
 * document: [anchor] where it was started, [head] the end that moves.
 * Collapsed, it is the caret.
 */
data class RichSelection(val anchor: RichPos, val head: RichPos) {
    val collapsed: Boolean get() = anchor == head

    companion object {
        fun caret(blockId: String, offset: Int): RichSelection = RichPos(blockId, offset).let { RichSelection(it, it) }
    }
}

/** A selection resolved against the blocks, in document order: from
 *  [startOffset] in block [start] to [endOffset] in block [end]. */
data class RichSpan(val start: Int, val startOffset: Int, val end: Int, val endOffset: Int) {
    val collapsed: Boolean get() = start == end && startOffset == endOffset

    /** Where the span starts in block [index]'s text: 0 past its first block. */
    fun fromIn(index: Int): Int = if (index == start) startOffset else 0

    /** Where the span ends in block [index], whose text is [length] long. */
    fun toIn(index: Int, length: Int): Int = if (index == end) endOffset else length

    companion object {
        fun caret(index: Int, offset: Int): RichSpan = RichSpan(index, offset, index, offset)
    }
}

/** This selection against [blocks], or null when one of its blocks is gone. */
fun RichSelection.resolve(blocks: List<RichBlock>): RichSpan? {
    val a = blocks.indexOfFirst { it.id == anchor.blockId }
    val h = blocks.indexOfFirst { it.id == head.blockId }
    if (a < 0 || h < 0) return null
    val ao = anchor.offset.coerceIn(0, blocks[a].textLength)
    val ho = head.offset.coerceIn(0, blocks[h].textLength)
    return if (a < h || a == h && ao <= ho) RichSpan(a, ao, h, ho) else RichSpan(h, ho, a, ao)
}

/** How long the block's text is as the editor sees it: a divider has none. */
val RichBlock.textLength: Int get() = if (kind.hasText) text.length else 0

/** One armed-but-not-yet-applied mark: ProseMirror's stored marks, what
 *  a toolbar button pressed with nothing selected sets for the next
 *  keystroke; [remove] stores the mark's absence instead. */
data class PendingMark(
    val type: RichMarkType,
    val value: String? = null,
    val color: String? = null,
    val remove: Boolean = false,
)

/**
 * The document as one plain string, what the keyboard reads and edits:
 * the text of every block one line after the other, a "\n" between two
 * blocks, a divider an empty line. Maps its offsets to positions and back.
 */
class RichFlat(val blocks: List<RichBlock>) {
    val text: String
    private val starts = IntArray(blocks.size)
    private val indexById = HashMap<String, Int>(blocks.size * 2)

    init {
        require(blocks.isNotEmpty())
        val builder = StringBuilder()
        blocks.forEachIndexed { index, block ->
            if (index > 0) builder.append('\n')
            starts[index] = builder.length
            indexById[block.id] = index
            if (block.kind.hasText) builder.append(block.text)
        }
        text = builder.toString()
    }

    fun offsetOf(index: Int, offset: Int): Int = starts[index] + offset.coerceIn(0, blocks[index].textLength)

    fun offsetOf(pos: RichPos): Int? = indexById[pos.blockId]?.let { offsetOf(it, pos.offset) }

    /** The block holding [offset], and the offset inside its text. */
    fun locate(offset: Int): Pair<Int, Int> {
        val at = offset.coerceIn(0, text.length)
        var low = 0
        var high = starts.lastIndex
        while (low < high) {
            val middle = (low + high + 1) / 2
            if (starts[middle] <= at) low = middle else high = middle - 1
        }
        return low to (at - starts[low]).coerceAtMost(blocks[low].textLength)
    }

    fun posAt(offset: Int): RichPos = locate(offset).let { (index, inBlock) -> RichPos(blocks[index].id, inBlock) }

    /** The span between two offsets, in either order. */
    fun spanOf(a: Int, b: Int): RichSpan {
        val (start, startOffset) = locate(minOf(a, b))
        val (end, endOffset) = locate(maxOf(a, b))
        return RichSpan(start, startOffset, end, endOffset)
    }
}
