package com.glasskeep.app.nativeapp.ui

import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.LinearGradientShader
import androidx.compose.ui.graphics.Shader
import androidx.compose.ui.graphics.ShaderBrush
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.hypot
import kotlin.math.sin

/**
 * CSS `linear-gradient(<angle>deg, …)` with evenly spaced colours. The
 * angle runs clockwise from "to top", and the gradient line goes through
 * the box's centre, just long enough for its ends to reach the corners.
 * Compose's own linearGradient only knows start and end points, so a
 * corner-to-corner brush draws a different angle on any non-square box.
 */
internal fun cssAngleGradient(angleDeg: Float, colors: List<Color>): Brush = CssAngleGradient(angleDeg, colors)

/**
 * CSS `linear-gradient(to right bottom, …)`, Tailwind's `bg-gradient-to-br`:
 * the line is perpendicular to the top-right/bottom-left diagonal, so its
 * direction depends on the box's own proportions (mostly top to bottom on
 * a wide tile).
 */
internal fun cssToBottomRightGradient(colors: List<Color>): Brush = CssToBottomRightGradient(colors)

private data class CssAngleGradient(val angleDeg: Float, val colors: List<Color>) : ShaderBrush() {
    override fun createShader(size: Size): Shader {
        val radians = Math.toRadians(angleDeg.toDouble())
        val direction = Offset(sin(radians).toFloat(), -cos(radians).toFloat())
        val halfLength = (abs(size.width * direction.x) + abs(size.height * direction.y)) / 2f
        val center = Offset(size.width / 2f, size.height / 2f)
        return LinearGradientShader(
            from = center - direction * halfLength,
            to = center + direction * halfLength,
            colors = colors,
        )
    }
}

private data class CssToBottomRightGradient(val colors: List<Color>) : ShaderBrush() {
    override fun createShader(size: Size): Shader {
        val diagonal = hypot(size.width, size.height)
        val direction = Offset(size.height / diagonal, size.width / diagonal)
        val halfLength = size.width * size.height / diagonal
        val center = Offset(size.width / 2f, size.height / 2f)
        return LinearGradientShader(
            from = center - direction * halfLength,
            to = center + direction * halfLength,
            colors = colors,
        )
    }
}
