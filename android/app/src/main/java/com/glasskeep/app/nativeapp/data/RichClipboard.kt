package com.glasskeep.app.nativeapp.data

/** What Copy puts on the clipboard from the editor. */
object RichClipboard {
    private val TrailingSpace = Regex("[${RichDoc.JsSpace}]+$")
    private val BlankRun = Regex("\n{3,}")

    /**
     * The selection as plain text, sliceToCleanPlainText (richTextClipboard.js):
     * one line per block, a list item with "- " or its number in its list
     * ("1. " for the first one copied) and two spaces per nesting level,
     * a quote's blocks as plain lines, a rule as an empty line, at most one
     * blank line in a row and nothing blank at the end. The web copies the
     * lists holding the selection with it, so even part of one item's text
     * comes with the item's marker, and a line an item holds, copied first,
     * takes the item's marker.
     *
     * A task item copies like a bullet: the web's walker glues the items of
     * a task list together on one line, a slip its read view does not make.
     */
    fun plainText(blocks: List<RichBlock>, span: RichSpan): String {
        val lines = mutableListOf<String>()
        for (i in span.start..span.end) {
            val block = blocks[i]
            val text = if (block.kind.hasText) block.text.substring(span.fromIn(i), span.toIn(i, block.text.length)) else ""
            val opensItem = i == span.start && !block.kind.isListItem && block.nestLevel > 0 &&
                (block.kind == RichBlockKind.PARAGRAPH || block.kind.isHeading)
            lines += when {
                block.kind == RichBlockKind.DIVIDER -> listOf("")
                block.kind == RichBlockKind.CODE_BLOCK -> text.split("\n").map { indentOf(block.nestLevel) + it }
                block.kind.isListItem -> listOf(indentOf(block.nestLevel) + marker(blocks, span, i) + text)
                opensItem -> listOf(indentOf(block.nestLevel - 1) + (RichEdits.holdingItem(blocks, i)?.let { marker(blocks, span, it) } ?: "- ") + text)
                else -> listOf(indentOf(block.nestLevel) + text)
            }
        }
        return lines.joinToString("\n").replace(BlankRun, "\n\n").replace(TrailingSpace, "")
    }

    private fun indentOf(level: Int): String = "  ".repeat(level.coerceAtLeast(0))

    /** "- ", or for an ordered item its number among the items of its list
     *  copied with it. */
    private fun marker(blocks: List<RichBlock>, span: RichSpan, index: Int): String {
        val item = blocks[index]
        if (item.kind != RichBlockKind.NUMBERED_ITEM) return "- "
        var number = 1
        var j = index - 1
        while (j >= span.start) {
            val other = blocks[j]
            if (!other.sharesQuoteWith(item) || other.listDepth <= item.nestLevel) break
            if (other.nestLevel == item.nestLevel) {
                if (other.kind != item.kind) break
                number++
            }
            j--
        }
        return "$number. "
    }
}
