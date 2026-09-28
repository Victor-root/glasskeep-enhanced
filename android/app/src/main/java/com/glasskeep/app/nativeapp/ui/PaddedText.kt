package com.glasskeep.app.nativeapp.ui

import androidx.compose.foundation.text.appendInlineContent
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.LinkAnnotation
import androidx.compose.ui.text.TextLayoutResult
import androidx.compose.ui.text.TextRange

/** The inline content id of an inline code run's padding. */
internal const val CodePadId = "codePad"

/** The inline content id of a highlight's padding, in the editor. */
internal const val HighlightPadId = "highlightPad"

/** What stands in the laid-out text for a pad (appendInlineContent's own
 *  default): a letter to the line breaker, so a pad keeps to its run. */
internal const val PadChar = '�'

/** A run `[start, end)` of a text padded on either side by the inline
 *  content [padId]. */
internal class PaddedRun(val range: IntRange, val padId: String)

/**
 * A text as it is laid out, its padded inline boxes padded the way the web
 * pads them (`code`, the editor's `mark`): the padding takes room in its
 * line and pushes the text around it, which a span cannot do. A
 * placeholder as wide as that padding sits on either side of each run, in
 * the laid-out text only, and so does what makes Android break lines where
 * the WebView breaks them ([WebLineBreaks]): a joiner right after the
 * character it keeps with the next, a break before the pads that open a
 * run, after those closing one. The text's styles and links cover what is
 * laid out inside them. Offsets in and out of [caret], [char], [range],
 * [box] and [textOffset] are the text's own.
 */
internal class PaddedText private constructor(
    val text: AnnotatedString,
    /** The text's own length, without what is laid out beyond it. */
    val length: Int,
    private val opens: IntArray,
    private val closes: IntArray,
    private val breaks: IntArray,
    private val carets: IntArray,
    private val inserted: IntArray,
) {
    /** Where a caret at [offset] is laid out: past a joiner, the pads
     *  closing a run and a break there, before the pads opening one. */
    fun caret(offset: Int): Int = carets[offset.coerceIn(0, length)]

    /** Where character [index] is laid out. */
    fun char(index: Int): Int = index.coerceIn(0, length).let { carets[it] + opens[it] }

    /** The laid-out range of `[start, end)`, what is laid out at its edges
     *  left out. */
    fun range(start: Int, end: Int): TextRange = TextRange(char(start), caret(end) - closes[end.coerceIn(0, length)])

    /** The laid-out range of `[start, end)` with the pads at its edges: a
     *  padded run's whole box. */
    fun box(start: Int, end: Int): TextRange = TextRange(caret(start), caret(end) - breaks[end.coerceIn(0, length)])

    /** The text's own offset at laid-out [offset]: what is laid out beyond
     *  the text before it left out. */
    fun textOffset(offset: Int): Int {
        val found = inserted.binarySearch(offset)
        return offset - if (found >= 0) found else -found - 1
    }

    companion object {
        /** [text] with its [runs] padded, and broken where the WebView
         *  breaks it. */
        fun of(text: AnnotatedString, runs: List<PaddedRun>): PaddedText {
            val length = text.length
            val opening = arrayOfNulls<MutableList<String>>(length + 1)
            val closing = arrayOfNulls<MutableList<String>>(length + 1)
            for (run in runs) {
                val start = run.range.first.coerceIn(0, length)
                val end = (run.range.last + 1).coerceIn(start, length)
                if (start == end) continue
                (opening[start] ?: mutableListOf<String>().also { opening[start] = it }) += run.padId
                (closing[end] ?: mutableListOf<String>().also { closing[end] = it }) += run.padId
            }
            val lineBreaks = Array(length + 1) { WebLineBreaks.between(text, it) }
            val opens = IntArray(length + 1) { opening[it]?.size ?: 0 }
            val breaks = IntArray(length + 1) { if (lineBreaks[it] == WebLineBreaks.Break) 1 else 0 }
            val closes = IntArray(length + 1) {
                (closing[it]?.size ?: 0) + breaks[it] + if (lineBreaks[it] == WebLineBreaks.Join) 1 else 0
            }
            val carets = IntArray(length + 1)
            val inserted = mutableListOf<Int>()
            val builder = AnnotatedString.Builder(length + 2 * runs.size)
            var copied = 0
            fun insert(char: Char) {
                inserted += builder.length
                builder.append(char)
            }
            fun pad(id: String) {
                inserted += builder.length
                builder.appendInlineContent(id, PadChar.toString())
            }
            for (i in 0..length) {
                if (opens[i] == 0 && closes[i] == 0) {
                    carets[i] = i + inserted.size
                    continue
                }
                builder.append(text.text, copied, i)
                copied = i
                if (lineBreaks[i] == WebLineBreaks.Join) insert(WebLineBreaks.Join)
                closing[i]?.forEach(::pad)
                if (lineBreaks[i] == WebLineBreaks.Break) insert(WebLineBreaks.Break)
                carets[i] = builder.length
                opening[i]?.forEach(::pad)
            }
            builder.append(text.text, copied, length)
            return PaddedText(builder.toAnnotatedString(), length, opens, closes, breaks, carets, inserted.toIntArray())
                .withAnnotationsOf(text)
        }

        /** [laid] without what [PaddedText] lays out beyond the text. */
        fun unpadded(laid: CharSequence): String =
            laid.filterNot { it == PadChar || it == WebLineBreaks.Break || it == WebLineBreaks.Join }.toString()
    }

    /** This text with [source]'s styles, string annotations and links, each
     *  over what is laid out of its range. */
    private fun withAnnotationsOf(source: AnnotatedString): PaddedText {
        val builder = AnnotatedString.Builder(text)
        fun laid(range: AnnotatedString.Range<*>): TextRange =
            if (range.start < range.end) range(range.start, range.end) else TextRange(char(range.start))
        for (style in source.spanStyles) laid(style).let { builder.addStyle(style.item, it.start, it.end) }
        for (style in source.paragraphStyles) laid(style).let { builder.addStyle(style.item, it.start, it.end) }
        for (annotation in source.getStringAnnotations(0, length)) {
            laid(annotation).let { builder.addStringAnnotation(annotation.tag, annotation.item, it.start, it.end) }
        }
        for (link in source.getLinkAnnotations(0, length)) {
            val at = laid(link)
            when (val item = link.item) {
                is LinkAnnotation.Url -> builder.addLink(item, at.start, at.end)
                is LinkAnnotation.Clickable -> builder.addLink(item, at.start, at.end)
            }
        }
        return PaddedText(builder.toAnnotatedString(), length, opens, closes, breaks, carets, inserted)
    }
}

/** A text's layout with the [padded] text it laid out, taking and giving
 *  the text's own offsets; [laidOut] for line geometry and the laid-out
 *  offsets of [PaddedText], [ink] for where its glyphs cross underlines. */
internal class PaddedLayout(val laidOut: TextLayoutResult, val padded: PaddedText) {
    val size get() = laidOut.size
    val lineCount get() = laidOut.lineCount
    val ink = GlyphInk(laidOut)

    fun getOffsetForPosition(position: Offset): Int = padded.textOffset(laidOut.getOffsetForPosition(position))

    fun getCursorRect(offset: Int): Rect = laidOut.getCursorRect(padded.caret(offset))

    fun getBoundingBox(index: Int): Rect = laidOut.getBoundingBox(padded.char(index))

    fun getPathForRange(start: Int, end: Int): Path = padded.range(start, end).let { laidOut.getPathForRange(it.start, it.end) }

    fun getWordBoundary(offset: Int): TextRange =
        laidOut.getWordBoundary(padded.caret(offset)).let { TextRange(padded.textOffset(it.start), padded.textOffset(it.end)) }

    fun getLineForOffset(offset: Int): Int = laidOut.getLineForOffset(padded.caret(offset))

    fun getHorizontalPosition(offset: Int): Float = laidOut.getHorizontalPosition(padded.caret(offset), usePrimaryDirection = true)

    fun getLineStart(line: Int): Int = padded.textOffset(laidOut.getLineStart(line))

    fun getLineEnd(line: Int, visibleEnd: Boolean = false): Int = padded.textOffset(laidOut.getLineEnd(line, visibleEnd))

    fun getLineTop(line: Int): Float = laidOut.getLineTop(line)

    fun getLineBottom(line: Int): Float = laidOut.getLineBottom(line)

    fun getLineLeft(line: Int): Float = laidOut.getLineLeft(line)

    fun getLineRight(line: Int): Float = laidOut.getLineRight(line)
}
