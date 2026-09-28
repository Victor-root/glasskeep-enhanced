package com.glasskeep.app.nativeapp.ui

import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Canvas
import androidx.compose.ui.graphics.ClipOp
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.ImageBitmapConfig
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.clipPath
import androidx.compose.ui.graphics.drawscope.clipRect
import androidx.compose.ui.text.TextLayoutResult
import androidx.compose.ui.text.TextPainter
import kotlin.math.abs
import kotlin.math.ceil
import kotlin.math.floor
import kotlin.math.sqrt

// CSS text decorations as Blink paints them in the WebView
// (text_decoration_info.cc, text_decoration_offset.cc, text_painter.cc,
// decoration_line_painter.cc, styled_stroke_data.cc), in the canvas's own
// pixels, which are the WebView's device pixels.

/** `text-decoration-style`. */
internal enum class DecorationStyle { SOLID, DOUBLE, DOTTED, DASHED, WAVY }

/** `text-decoration-thickness: auto`: a tenth of the font size, [em] px. */
private fun autoThickness(em: Float): Float = maxOf(1f, em / 10f)

/** C's `roundf`, halves away from zero, for the positive values here. */
private fun roundHalfUp(value: Float): Float = floor(value + 0.5f)

/**
 * Underlines `[left, right]` under [baseline] for a font of [em] px:
 * `text-underline-position: auto` sets it half its thickness under the
 * baseline, and `text-decoration-skip-ink: auto` leaves it out, as far
 * again as it is thick, around what [glyphs] finds of the text's glyphs
 * between the top and bottom it is given.
 */
internal fun DrawScope.drawUnderline(
    style: DecorationStyle,
    left: Float,
    right: Float,
    baseline: Float,
    em: Float,
    color: Color,
    glyphs: (top: Float, bottom: Float) -> List<ClosedFloatingPointRange<Float>>,
) {
    val thickness = autoThickness(em)
    val top = baseline + maxOf(1f, ceil(thickness / 2f))
    val (boundsTop, boundsBottom) = decorationBounds(style, top, thickness)
    // What reaches less than half a pixel into the line is let be.
    val bandTop = boundsTop + 0.5f
    val bandBottom = boundsBottom - 0.5f
    val dilation = minOf(thickness, 13f)
    val skipped = Path()
    for (ink in glyphs(bandTop, bandBottom)) {
        skipped.addRect(Rect(ink.start - dilation, bandTop - 1f, ink.endInclusive + dilation, bandBottom + 1f))
    }
    if (skipped.isEmpty) {
        drawDecorationLine(style, left, right, top, thickness, color)
    } else {
        clipPath(skipped, ClipOp.Difference) { drawDecorationLine(style, left, right, top, thickness, color) }
    }
}

/** Strikes `[left, right]` through a third of the font's [ascent] over
 *  [baseline], for a font of [em] px; Blink takes the ascent in whole
 *  pixels. */
internal fun DrawScope.drawLineThrough(left: Float, right: Float, baseline: Float, em: Float, ascent: Float, color: Color) {
    val thickness = autoThickness(em)
    drawLineBox(left, right, baseline - roundHalfUp(ascent) / 3f - thickness / 2f, thickness, color)
}

/** How far down the page a decoration of [style] reaches, its box [top]
 *  and [thickness] given. */
private fun decorationBounds(style: DecorationStyle, top: Float, thickness: Float): Pair<Float, Float> = when (style) {
    DecorationStyle.SOLID -> top to top + thickness
    DecorationStyle.DOUBLE -> top to top + 2f * thickness + 1f
    DecorationStyle.DOTTED, DecorationStyle.DASHED -> {
        val middle = strokeMiddle(top, thickness)
        val width = roundHalfUp(thickness)
        middle - width / 2f to middle + width / 2f
    }
    DecorationStyle.WAVY -> {
        // Whole pixels around the wave, its axis half a pixel into the first.
        val wave = Wave(top, thickness)
        val origin = wave.axis - 0.5f
        origin + floor(0.5f - wave.reach) to origin + ceil(0.5f + wave.reach)
    }
}

private fun DrawScope.drawDecorationLine(style: DecorationStyle, left: Float, right: Float, top: Float, thickness: Float, color: Color) {
    when (style) {
        DecorationStyle.SOLID -> drawLineBox(left, right, top, thickness, color)
        DecorationStyle.DOUBLE -> {
            drawLineBox(left, right, top, thickness, color)
            drawLineBox(left, right, top + thickness + 1f, thickness, color)
        }
        DecorationStyle.DOTTED, DecorationStyle.DASHED ->
            drawStrokedLine(style == DecorationStyle.DOTTED, left, right, top, thickness, color)
        DecorationStyle.WAVY -> drawWave(left, right, top, thickness, color)
    }
}

/** A line drawn as a box, its top and height on whole pixels. */
private fun DrawScope.drawLineBox(left: Float, right: Float, top: Float, thickness: Float, color: Color) =
    drawRect(color, Offset(left, floor(top + 0.5f)), Size(right - left, maxOf(floor(thickness), 1f)))

/** The whole pixel row a dotted or dashed line is centred on. */
private fun strokeMiddle(top: Float, thickness: Float): Float = floor(top + maxOf(thickness / 2f, 0.5f))

/**
 * A dotted or dashed line, drawn from whole pixels: square dots as wide
 * as the line up to 3px, round ones past that; dashes twice as long as
 * the line is thick (three times under 3px), the gaps evened out along it.
 */
private fun DrawScope.drawStrokedLine(dotted: Boolean, left: Float, right: Float, top: Float, thickness: Float, color: Color) {
    val width = roundHalfUp(thickness)
    // An odd width's middle is its middle pixel's.
    val y = strokeMiddle(top, thickness) + if (width.toInt() % 2 == 1) 0.5f else 0f
    val start = left.toInt().toFloat()
    val end = right.toInt().toFloat()
    val round = dotted && width > 3f
    // Round dots' caps reach past the line's ends.
    val inset = if (round) width / 2f else 0f
    drawLine(
        color,
        Offset(start + inset, y),
        Offset(end - inset, y),
        thickness,
        cap = if (round) StrokeCap.Round else StrokeCap.Butt,
        pathEffect = strokeDashes(dotted, round, width, end - start),
    )
}

/** The dashes of a dotted or dashed line [width] px thick and [length] long. */
private fun strokeDashes(dotted: Boolean, round: Boolean, width: Float, length: Float): PathEffect? {
    if (round) {
        val gap = if (length < 2f * width) 2f * width else evenGap(length, width, width) + width - 0.01f
        return PathEffect.dashPathEffect(floatArrayOf(0f, gap))
    }
    val dash = if (dotted) width else width * (if (width >= 3f) 2f else 3f)
    val gap = if (dotted) width else width * (if (width >= 3f) 1f else 2f)
    if (length <= 2f * dash) return null
    val pair = 2f * dash + gap
    if (length <= pair) return PathEffect.dashPathEffect(floatArrayOf(dash * length / pair, gap * length / pair))
    return PathEffect.dashPathEffect(floatArrayOf(dash, if (dotted) gap else evenGap(length, dash, gap)))
}

/** The gap nearest [gap] that fits a whole number of [dash]es in [length],
 *  one at either end. */
private fun evenGap(length: Float, dash: Float, gap: Float): Float {
    val fewer = floor((length + gap) / (dash + gap))
    val fewerGap = (length - fewer * dash) / (fewer - 1f)
    val moreGap = (length - (fewer + 1f) * dash) / fewer
    return if (moreGap <= 0f || abs(fewerGap - gap) < abs(moreGap - gap)) fewerGap else moreGap
}

/** Blink's wave for a line [thickness] px thick under an underline box at
 *  [top]: one cubic curve per [length], its control points [control]
 *  either side of its [axis]. */
private class Wave(top: Float, thickness: Float) {
    private val clamped = maxOf(1f, thickness)
    val length = 1f + 2f * roundHalfUp(2f * clamped + 0.5f)
    val control = 0.5f + roundHalfUp(3f * clamped + 0.5f)

    /** As far again under the box as the line is thick and a pixel lower,
     *  on a half pixel. */
    val axis = top + thickness + 1.5f

    /** How far its stroke reaches off its axis: the curve's peak and half
     *  the line. */
    val reach = control * sqrt(3f) / 6f + thickness / 2f
}

/** A wavy line, starting down at [left], cut at either end. */
private fun DrawScope.drawWave(left: Float, right: Float, top: Float, thickness: Float, color: Color) {
    val wave = Wave(top, thickness)
    val path = Path().apply {
        var x = left - wave.length
        moveTo(x, wave.axis)
        while (x < right + wave.length) {
            val middle = x + wave.length / 2f
            cubicTo(middle, wave.axis + wave.control, middle, wave.axis - wave.control, x + wave.length, wave.axis)
            x += wave.length
        }
    }
    clipRect(left, wave.axis - wave.reach - 1f, right, wave.axis + wave.reach + 1f) { drawPath(path, color, style = Stroke(thickness)) }
}

/**
 * Where a laid-out text's glyphs reach into a band across one of its
 * lines, which Skia's text intercepts tell Blink for
 * `text-decoration-skip-ink`: each glyph's leftmost to rightmost ink in
 * the band. Compose shows no glyph outlines, so the band is drawn and read
 * back, once per line and band.
 */
internal class GlyphInk(private val layout: TextLayoutResult) {
    private data class Band(val line: Int, val top: Float, val bottom: Float)

    private val found = HashMap<Band, List<ClosedFloatingPointRange<Float>?>>()

    /** The ink of each glyph of `[from, to)`, all on one line, between
     *  [top] and [bottom]. */
    fun across(from: Int, to: Int, top: Float, bottom: Float): List<ClosedFloatingPointRange<Float>> {
        val line = layout.getLineForOffset(from)
        val lineStart = layout.getLineStart(line)
        val inks = found.getOrPut(Band(line, top, bottom)) { read(line, top, bottom) }
        return (from until to).mapNotNull { inks.getOrNull(it - lineStart) }
    }

    /** Per character of [line], its glyph's ink between [top] and [bottom]. */
    private fun read(line: Int, top: Float, bottom: Float): List<ClosedFloatingPointRange<Float>?> {
        val width = layout.size.width
        val y = floor(top).toInt()
        val height = ceil(bottom).toInt() - y
        if (width <= 0 || height <= 0) return emptyList()
        val band = ImageBitmap(width, height, ImageBitmapConfig.Alpha8)
        Canvas(band).run {
            translate(0f, -y.toFloat())
            TextPainter.paint(this, layout)
        }
        val alpha = IntArray(width * height)
        band.readPixels(alpha)
        // A column has ink where a pixel of it centred in the band is at
        // least half covered.
        val rows = (0 until height).filter { y + it + 0.5f in top..bottom }
        val inked = BooleanArray(width) { x -> rows.any { alpha[it * width + x] ushr 24 >= 128 } }
        return (layout.getLineStart(line) until layout.getLineEnd(line)).map { offset ->
            val box = layout.getBoundingBox(offset)
            val columns = (floor(box.left).toInt().coerceAtLeast(0) until ceil(box.right).toInt().coerceAtMost(width)).filter { inked[it] }
            if (columns.isEmpty()) null else columns.first().toFloat()..columns.last() + 1f
        }
    }
}
