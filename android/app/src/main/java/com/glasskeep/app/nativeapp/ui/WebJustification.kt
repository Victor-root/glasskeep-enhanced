package com.glasskeep.app.nativeapp.ui

import androidx.compose.foundation.text.InlineTextContent
import androidx.compose.runtime.Composable
import androidx.compose.runtime.MutableIntState
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextLayoutResult
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Constraints
import kotlin.math.ceil

/**
 * A justified text as the WebView justifies it: the spaces of each of its
 * lines but the last and those a forced break ends widen until the line
 * reaches the edge, sharing what it lacks, the no-break ones too
 * (Blink's expansion opportunities). The app widens them itself, with
 * letter spacing, rather than asking Android to justify: some phones'
 * Android (ColorOS, on OPPO, realme and OnePlus phones) drops the
 * justification it is asked for, and where it does not, the positions
 * Android gives of the text ignore it, so the carets, selections, inline
 * code and highlights drawn from them would stray from the text.
 */
internal object WebJustification {
    /** A laid-out line: its characters `[start, end)`, `[start, visibleEnd)`
     *  without the spaces it wraps on, and how wide it was laid out. */
    class Line(val start: Int, val end: Int, val visibleEnd: Int, val width: Float)

    /**
     * How many px each space of [text] widens by, by offset, for [lines],
     * laid out to the start, to reach [width]. Whole px, as letter spacing
     * is drawn, and a little short of the edge rather than past it, where
     * the line would wrap anew.
     */
    fun spacing(text: CharSequence, lines: List<Line>, width: Float): Map<Int, Int> {
        val spacing = HashMap<Int, Int>()
        for (line in lines.dropLast(1)) {
            if (line.end > line.start && text[line.end - 1] == '\n') continue
            val spaces = (line.start until line.visibleEnd).filter { text[it] == ' ' || text[it] == '\u00A0' }
            val room = ceil(width - line.width).toInt() - 1
            if (spaces.isEmpty() || room <= 0) continue
            spaces.forEachIndexed { k, offset ->
                val px = (k + 1) * room / spaces.size - k * room / spaces.size
                if (px > 0) spacing[offset] = px
            }
        }
        return spacing
    }
}

/** [text] in [style] ([rememberWebJustified]); each layout of it goes to
 *  [onLayout]. */
internal class WebJustified(val text: AnnotatedString, val style: TextStyle, private val width: MutableIntState) {
    fun onLayout(layout: TextLayoutResult) {
        width.intValue = layout.size.width
    }
}

/**
 * [padded] in [style], laid out with [inlineContent]: where the style
 * justifies it, laid out to the start with its spaces widened by
 * [WebJustification] for the width it was last laid out in. Until that
 * width is known, Android justifies it.
 */
@Composable
internal fun rememberWebJustified(
    padded: PaddedText,
    style: TextStyle,
    inlineContent: Map<String, InlineTextContent>,
): WebJustified {
    val width = remember { mutableIntStateOf(0) }
    var text = padded.text
    var laidStyle = style
    if (style.textAlign == TextAlign.Justify) {
        val measurer = rememberTextMeasurer(cacheSize = 0)
        val density = LocalDensity.current
        val laidWidth = width.intValue
        val start = remember(style) { style.copy(textAlign = TextAlign.Start) }
        val spaced = remember(padded, start, inlineContent, laidWidth, measurer) {
            if (laidWidth == 0) return@remember null
            val laid = measurer.measure(
                padded.text,
                start,
                placeholders = padded.placeholders(inlineContent),
                constraints = Constraints.fixedWidth(laidWidth),
            )
            val lines = List(laid.lineCount) {
                WebJustification.Line(laid.getLineStart(it), laid.getLineEnd(it), laid.getLineEnd(it, visibleEnd = true), laid.getLineRight(it) - laid.getLineLeft(it))
            }
            val spacing = WebJustification.spacing(padded.text, lines, laidWidth.toFloat())
            if (spacing.isEmpty()) {
                padded.text
            } else {
                AnnotatedString.Builder(padded.text).apply {
                    for ((offset, px) in spacing) addStyle(SpanStyle(letterSpacing = with(density) { px.toDp().toSp() }), offset, offset + 1)
                }.toAnnotatedString()
            }
        }
        if (spaced != null) {
            text = spaced
            laidStyle = start
        }
    }
    // The same instance while text and style stay the same: an onTextLayout
    // capturing it stays the same too, and the Text keeps its layout.
    return remember(text, laidStyle) { WebJustified(text, laidStyle, width) }
}
